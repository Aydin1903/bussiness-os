import { EMBEDDING_DIMENSIONS } from '../../../shared/embedding.port';
import { BlankProgressNoteBodyError, InvalidEmbeddingDimensionsError } from './projects.error';

/**
 * Ilerleme notu (ADR-0033 §1, §6).
 *
 * ============================================================================
 * BU ENTITY EMBEDDING BILMEZ
 * ============================================================================
 * `Note` ve `Interaction` ile ayni disiplin: not kullanicinin yazdigi metindir;
 * AI icin okunabilir hali (`ProgressNoteChunk`) AYRI bir entity ve AYRI bir
 * yasam dongusudur. Model degisince parcalar yeniden uretilir, not degismez.
 *
 * EKLEME-YALNIZ: `update()` metodu YOKTUR ve olmayacaktir (ADR-0033 §11).
 * Bir gunluk kaydi duzeltilmez; yanlissa yenisi yazilir.
 *
 * ⚠️ `occurredOn` YOK — `Interaction`dan BILINCLI FARK. Bir gorusme gunler
 * sonra yazilabilir (gerceklestigi gun ayri bir bilgidir); ilerleme notu ise
 * AKAN bir gunluktur ve yazildigi an kayit anidir.
 */
export interface ProgressNoteState {
  readonly id: string;
  readonly tenantId: string;
  readonly projectId: string;
  /** OPSIYONEL daraltma; gorev silinince `null`'a duser, not OLMEZ. */
  readonly taskId: string | null;
  readonly authorUserId: string;
  readonly body: string;
  readonly createdAt: Date;
}

export class ProgressNote {
  private constructor(private readonly state: ProgressNoteState) {}

  static create(input: {
    id: string;
    tenantId: string;
    projectId: string;
    taskId: string | null;
    authorUserId: string;
    body: string;
    now: Date;
  }): ProgressNote {
    const body = input.body.trim();
    if (body === '') {
      throw new BlankProgressNoteBodyError();
    }

    return new ProgressNote({
      id: input.id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      taskId: input.taskId,
      authorUserId: input.authorUserId,
      body,
      createdAt: input.now,
    });
  }

  static fromPersistence(state: ProgressNoteState): ProgressNote {
    return new ProgressNote(state);
  }

  toState(): ProgressNoteState {
    return this.state;
  }
}

/**
 * Gomulecek metne eklenen BAGLAM BASLIGI (ADR-0033 §6, `0018`'in ayni karari).
 *
 * ============================================================================
 * NEDEN GEREKLI
 * ============================================================================
 * Bir ilerleme notunun KIMLIGI (hangi proje) FK kolonundadir, METINDE DEGIL.
 * Kullanici "Tasarim onaylandi, kodlamaya gecildi" yazar — "Web sitesi
 * yenileme" kelimesi hic gecmez ve "Web sitesi projesinde ne oldu?" sorusu
 * HICBIR chunk'la eslesmez.
 *
 * ⚠️ GOREV ADI BASLIGA GIRMEZ. `Interaction` da kisi/firsat adini basliga
 * koymadi, yalnizca sirket adini; ikinci bir denormalize ad ikinci bir
 * bayatlama yuzeyi demektir.
 *
 * ============================================================================
 * BEDELI: DENORMALIZASYON
 * ============================================================================
 * Proje adi parcaya KOPYALANIR. Proje yeniden adlandirilirsa eski parcalar
 * ESKI ADI tasir — ta ki `POST /projects/reindex` calisana kadar. O uc ILK
 * GUNDEN vardir; bu sapmanin telafisi tam olarak odur.
 */
export function withProjectHeader(input: {
  projectName: string;
  /** `YYYY-MM-DD` — notun yazildigi gun. */
  writtenOn: string;
  content: string;
}): string {
  return `[${input.projectName} · ${input.writtenOn}] ${input.content}`;
}

/** Notun AI icin okunabilir parcasi. */
export interface ProgressNoteChunkState {
  readonly id: string;
  readonly tenantId: string;
  readonly progressNoteId: string;
  readonly chunkIndex: number;
  /** BAGLAM BASLIGI DAHIL metin — gomulen sey tam olarak budur. */
  readonly content: string;
  readonly embedding: readonly number[];
}

export class ProgressNoteChunk {
  private constructor(private readonly state: ProgressNoteChunkState) {}

  static create(input: ProgressNoteChunkState): ProgressNoteChunk {
    // Boyut kontrolu BURADA yapilir, adapter'da degil: adapter'in isi
    // tasimaktir, boyut bir DOMAIN kuralidir ve `vector(1536)` kolonuyla
    // birebir baglidir (`NoteChunk`/`InteractionChunk` ile ayni disiplin).
    if (input.embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new InvalidEmbeddingDimensionsError(EMBEDDING_DIMENSIONS, input.embedding.length);
    }

    return new ProgressNoteChunk(input);
  }

  toState(): ProgressNoteChunkState {
    return this.state;
  }
}
