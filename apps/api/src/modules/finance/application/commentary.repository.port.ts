import { type Commentary, type CommentaryChunk } from '../domain/commentary.entity';
import { type ListPage } from './category.repository.port';

export const COMMENTARY_REPOSITORY = Symbol('FINANCE_COMMENTARY_REPOSITORY');

/**
 * Yeniden indekslenecek yorum — is listesi TURETILMISTIR (ADR-0029).
 *
 * ⚠️ Burada DENORMALIZE bir ad YOK — `UnindexedProgressNote.projectName`den
 * fark. Baglam basligi yalnizca sabit bir etiket ve kaydin kendi tarihidir,
 * dolayisiyla onarim icin bir JOIN gerekmez (gerekce `commentary.entity.ts`).
 */
export interface UnindexedCommentary {
  readonly commentaryId: string;
  /** `YYYY-MM-DD` — baglam basligina giren gun. */
  readonly occurredOn: string;
  readonly body: string;
}

/**
 * `finance.commentaries` + `finance.commentary_chunks` kaliciligi.
 *
 * Tenant daraltmasi RLS'in isidir (bkz. `CategoryRepository`).
 */
export interface CommentaryRepository {
  saveCommentary(commentary: Commentary): Promise<void>;
  /** Parcalar AYRI transaction'da yazilir (ADR-0029 §4, T2). */
  saveChunks(chunks: readonly CommentaryChunk[]): Promise<void>;

  /**
   * Sayfali liste.
   *
   * `from`/`to` `occurred_on` uzerinde ve DAHILDIR: yorumlar bir DONEM
   * hakkindadir, dolayisiyla dogal filtre yazilma tarihi degil ILGILI DONEMDIR.
   */
  list(input: {
    limit: number;
    offset: number;
    from: string | null;
    to: string | null;
  }): Promise<ListPage<Commentary>>;

  /**
   * PARCASIZ yorumlar — `LEFT JOIN ... WHERE chunk IS NULL`.
   *
   * Is listesi TURETILMISTIR, saklanmaz: ayri bir "onarilacaklar" tablosu ve
   * deneme sayaci YOK. Parcanin YOKLUGU is listesinin KENDISIDIR.
   */
  countUnindexed(): Promise<number>;
  findUnindexed(limit: number): Promise<UnindexedCommentary[]>;

  /**
   * ANLAMSAL arama (ADR-0034 §6 — `finance-commentaries` katkicisi, Slice 6).
   *
   * TENANT FILTRESI YOK ve bu BILINCLI: daraltmayi RLS yapar (migration `0025`)
   * ve cagiran zaten tenant transaction'i icindedir.
   */
  findSimilarChunks(input: {
    embedding: readonly number[];
    limit: number;
  }): Promise<SimilarCommentaryChunk[]>;
}

/** Anlamsal aramanin dondurdugu tek parca. */
export interface SimilarCommentaryChunk {
  /** Parca metni — BAGLAM BASLIGI dahil (gomulen sey tam olarak budur). */
  readonly content: string;
  /** Hangi yorumdan geldi — kaynak atfi bundan turer. */
  readonly commentaryId: string;
}
