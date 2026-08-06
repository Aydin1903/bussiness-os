import { type TenantId } from '../domain/tenant-id.value-object';

/** DI token'i. */
export const NOTE_CHUNK_SEARCH = Symbol('NOTE_CHUNK_SEARCH');

/** Benzerlik aramasinin dondurdugu tek parca. */
export interface SimilarChunk {
  /** Parcanin metni — `LLMPort.complete()`'in `context`'ine girer. */
  readonly content: string;
  /** Hangi nottan geldi — yanittaki `sources` referansi bundan turer. */
  readonly noteId: string;
}

/**
 * `knowledge.note_chunks` uzerinde ANLAMSAL arama (ADR-0029 §4).
 *
 * ============================================================================
 * TENANT FILTRESI YOK — ve bu BILINCLI
 * ============================================================================
 * Imzada `tenantId` yalnizca NIYETI belgeler; sorguya elle bir `WHERE tenant_id`
 * kosulu KONMAZ. Daraltmayi RLS yapar (`ENABLE` + `FORCE`, migration 0011) ve
 * use case zaten tenant transaction'i icinde calisir.
 *
 * Elle filtre eklemek iki sorun uretirdi: (a) korumanin RLS'te oldugu gercegini
 * bulanikllastirir — okuyan biri "asil koruma hangisi" diye tereddut eder,
 * (b) bir gun filtre unutulursa RLS'in hala koruyor oldugu FARK EDILMEZ ve
 * yanlis bir guven duygusu olusur. Tek koruma, tek yerde.
 *
 * Bunun gercekten calistigi bir entegrasyon testiyle KANITLANIR.
 * ============================================================================
 */
export interface NoteChunkSearch {
  /**
   * Verilen vektore en yakin parcalari dondurur (kosinus mesafesi).
   *
   * `tenantId` parametresi kullanilmaz ama imzada DURUR: cagiranin hangi
   * tenant baglaminda oldugunu bilincli olarak tasidigini gosterir.
   */
  findSimilar(input: {
    readonly tenantId: TenantId;
    readonly embedding: readonly number[];
    readonly limit: number;
  }): Promise<SimilarChunk[]>;
}
