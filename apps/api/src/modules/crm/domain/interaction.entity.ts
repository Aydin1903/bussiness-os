import { BlankInteractionBodyError, InvalidEmbeddingDimensionsError } from './crm.error';
import { EMBEDDING_DIMENSIONS } from '../../../shared/embedding.port';

/**
 * Gorusme kaydi (ADR-0031 §1, §4).
 *
 * ============================================================================
 * BU ENTITY EMBEDDING BILMEZ
 * ============================================================================
 * `Note` ile ayni disiplin: gorusme kullanicinin yazdigi metindir; AI icin
 * okunabilir hali (`InteractionChunk`) AYRI bir entity ve AYRI bir yasam
 * dongusudur. Model degisince parcalar yeniden uretilir, gorusme degismez.
 *
 * EKLEME-YALNIZ: `update()` metodu YOKTUR ve olmayacaktir (ADR-0031 kapsam
 * disi). Bir gunluk kaydi duzeltilmez; yanlissa yenisi yazilir.
 */
export interface InteractionState {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly contactId: string | null;
  readonly opportunityId: string | null;
  readonly authorUserId: string;
  /** `YYYY-MM-DD` — gorusmenin GERCEKLESTIGI gun. */
  readonly occurredOn: string;
  readonly body: string;
  readonly createdAt: Date;
}

export class Interaction {
  private constructor(private readonly state: InteractionState) {}

  static create(input: {
    id: string;
    tenantId: string;
    companyId: string;
    contactId: string | null;
    opportunityId: string | null;
    authorUserId: string;
    occurredOn: string;
    body: string;
    now: Date;
  }): Interaction {
    const body = input.body.trim();
    if (body === '') {
      throw new BlankInteractionBodyError();
    }

    return new Interaction({
      id: input.id,
      tenantId: input.tenantId,
      companyId: input.companyId,
      contactId: input.contactId,
      opportunityId: input.opportunityId,
      authorUserId: input.authorUserId,
      occurredOn: input.occurredOn,
      body,
      createdAt: input.now,
    });
  }

  static fromPersistence(state: InteractionState): Interaction {
    return new Interaction(state);
  }

  toState(): InteractionState {
    return this.state;
  }
}

/**
 * Gomulecek metne eklenen BAGLAM BASLIGI (ADR-0031 Slice 6, PO onayi).
 *
 * ============================================================================
 * NEDEN GEREKLI — Knowledge'dan BILINCLI SAPMA
 * ============================================================================
 * Knowledge yalnizca `note.body`'yi gomer. CRM'de bu KIRILIR: bir gorusmenin
 * KIMLIGI (hangi sirket, ne zaman) FK ve tarih kolonlarindadir, METINDE
 * DEGIL. Satis temsilcisi "Toplanti iyi gecti, butce onaylandi" yazar —
 * "Acme" kelimesi hic gecmez ve "Acme ile ne konustuk?" sorusu HICBIR
 * chunk'la eslesmez.
 *
 * Baslik sirket adini ve tarihi HER PARCAYA koyar; anlamsal arama yakalar.
 *
 * ============================================================================
 * BEDELI: DENORMALIZASYON
 * ============================================================================
 * Sirket adi parcaya KOPYALANIR. Sirket yeniden adlandirilirsa eski parcalar
 * ESKI ADI tasir — ta ki `POST /crm/reindex` calisana kadar.
 *
 * Bu bedel kabul edilebilir cunku onarim ucu ILK GUNDEN vardir. Knowledge'da
 * yeniden indeksleme SONRADAN geldigi icin orada ayni cozum o gun mumkun
 * degildi; bu slice'in "dersi tekrarlamiyoruz" kismi tam olarak budur.
 * ============================================================================
 */
export function withContextHeader(input: {
  companyName: string;
  occurredOn: string;
  content: string;
}): string {
  return `[${input.companyName} · ${input.occurredOn}] ${input.content}`;
}

/** Gorusmenin AI icin okunabilir parcasi. */
export interface InteractionChunkState {
  readonly id: string;
  readonly tenantId: string;
  readonly interactionId: string;
  readonly chunkIndex: number;
  /** BAGLAM BASLIGI DAHIL metin — gomulen sey tam olarak budur. */
  readonly content: string;
  readonly embedding: readonly number[];
}

export class InteractionChunk {
  private constructor(private readonly state: InteractionChunkState) {}

  static create(input: InteractionChunkState): InteractionChunk {
    // Boyut kontrolu BURADA yapilir, adapter'da degil: adapter'in isi
    // tasimaktir, boyut bir DOMAIN kuralidir ve `vector(1536)` kolonuyla
    // birebir baglidir (`NoteChunk` ile ayni disiplin).
    if (input.embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new InvalidEmbeddingDimensionsError(EMBEDDING_DIMENSIONS, input.embedding.length);
    }

    return new InteractionChunk(input);
  }

  toState(): InteractionChunkState {
    return this.state;
  }
}
