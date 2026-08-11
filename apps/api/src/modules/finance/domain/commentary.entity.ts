import { EMBEDDING_DIMENSIONS } from '../../../shared/embedding.port';
import { assertCalendarDay } from './calendar-day';
import { BlankCommentaryBodyError, InvalidEmbeddingDimensionsError } from './finance.error';

/**
 * Finansal yorum (ADR-0034 §1.1, §6.1).
 *
 * ============================================================================
 * BU MODULDE GOMULEN TEK SEY BUDUR
 * ============================================================================
 * `FinanceTransaction.description` gomulmez. Yorum ise gercekten ANLATISALDIR
 * ve baska hicbir kolonda yasamaz: _"Mart'ta nakit sikisti cunku X musterisi
 * odemeyi geciktirdi."_ Rakamlar zaten tabloda; NEDENi burada.
 *
 * ============================================================================
 * BU ENTITY EMBEDDING BILMEZ
 * ============================================================================
 * `Note`, `Interaction` ve `ProgressNote` ile ayni disiplin: yorum kullanicinin
 * yazdigi metindir; AI icin okunabilir hali (`CommentaryChunk`) AYRI bir entity
 * ve AYRI bir yasam dongusudur.
 *
 * EKLEME-YALNIZ: `update()` metodu YOKTUR ve olmayacaktir (ADR-0034 §11).
 * Bir gunluk kaydi duzeltilmez; yanlissa yenisi yazilir.
 *
 * ⚠️ EBEVEYNI YOK — `ProgressNote.projectId`den bilincli fark. Bir yorum bir
 * DONEM hakkindadir. Bir `transactionId` eklemek yorumun tasidigi TOPLU bakisi
 * yok ederdi; ayrica o islem silinince yorum da giderdi — oysa "o ay neden
 * zordu" bilgisi tek bir kaydin silinmesinden BAGIMSIZ olarak degerlidir.
 */
export interface CommentaryState {
  readonly id: string;
  readonly tenantId: string;
  readonly authorUserId: string;
  /** Yorumun ILGILI OLDUGU gun (`YYYY-MM-DD`); `createdAt`ten AYRI. */
  readonly occurredOn: string;
  readonly body: string;
  readonly createdAt: Date;
}

export class Commentary {
  private constructor(private readonly state: CommentaryState) {}

  static create(input: {
    id: string;
    tenantId: string;
    authorUserId: string;
    occurredOn: string;
    body: string;
    now: Date;
  }): Commentary {
    const body = input.body.trim();
    if (body === '') {
      throw new BlankCommentaryBodyError();
    }

    return new Commentary({
      id: input.id,
      tenantId: input.tenantId,
      authorUserId: input.authorUserId,
      // Kalip VE gercek takvim gunu; `2026-02-31` kalibi gecer ama PostgreSQL
      // onu reddeder ve kullanici 422 yerine 500 alirdi.
      occurredOn: assertCalendarDay(input.occurredOn),
      body,
      createdAt: input.now,
    });
  }

  static fromPersistence(state: CommentaryState): Commentary {
    return new Commentary(state);
  }

  toState(): CommentaryState {
    return this.state;
  }
}

/** Baglam basligindaki SABIT etiket — kaynagin ne oldugunu metne yazar. */
const COMMENTARY_LABEL = 'Finansal yorum';

/**
 * Gomulecek metne eklenen BAGLAM BASLIGI (ADR-0034 §6.1).
 *
 * ============================================================================
 * NEDEN GEREKLI
 * ============================================================================
 * Parcanin NE OLDUGU metinde yazmaz. Kullanici "tahsilat gecikti, nakit
 * sikisti" yazar; bu cumle bir gider aciklamasindan ya da bir proje notundan
 * ayirt edilemez. Sabit etiket, modelin parcanin KAYNAGINI metinden anlamasini
 * saglar ve bir gider kalemiyle bir donem yorumunu karistirmasini onler.
 *
 * ============================================================================
 * ⚠️ BURADA DENORMALIZE EDILMIS BIR AD YOK — `0018`/`0022`DEN FARK
 * ============================================================================
 * Orada sirket/proje adi basliga KOPYALANIYORDU ve yeniden adlandirma
 * parcalari BAYATLATIYORDU; `reindex`in ikinci isi tam olarak bunu tazelemekti.
 *
 * Burada baslik yalnizca SABIT bir etiket ve kaydin KENDI tarihidir; ikisi de
 * degismez. Sonucu: bu moduldeki `reindex` YALNIZCA eksik parcalari onarir.
 * Bu bir eksiklik degil, gomulen verinin tabiatinin sonucudur.
 */
export function withCommentaryHeader(input: {
  /** `YYYY-MM-DD` — yorumun ilgili oldugu gun. */
  occurredOn: string;
  content: string;
}): string {
  return `[${COMMENTARY_LABEL} · ${input.occurredOn}] ${input.content}`;
}

/** Yorumun AI icin okunabilir parcasi. */
export interface CommentaryChunkState {
  readonly id: string;
  readonly tenantId: string;
  readonly commentaryId: string;
  readonly chunkIndex: number;
  /** BAGLAM BASLIGI DAHIL metin — gomulen sey tam olarak budur. */
  readonly content: string;
  readonly embedding: readonly number[];
}

export class CommentaryChunk {
  private constructor(private readonly state: CommentaryChunkState) {}

  static create(input: CommentaryChunkState): CommentaryChunk {
    // Boyut kontrolu BURADA yapilir, adapter'da degil: adapter'in isi
    // tasimaktir, boyut bir DOMAIN kuralidir ve `vector(1536)` kolonuyla
    // birebir baglidir (`NoteChunk`/`ProgressNoteChunk` ile ayni disiplin).
    if (input.embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new InvalidEmbeddingDimensionsError(EMBEDDING_DIMENSIONS, input.embedding.length);
    }

    return new CommentaryChunk(input);
  }

  toState(): CommentaryChunkState {
    return this.state;
  }
}
