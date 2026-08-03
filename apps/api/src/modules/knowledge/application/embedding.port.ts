/** DI token'i. */
export const EMBEDDING_PORT = Symbol('EMBEDDING_PORT');

/**
 * Metni vektore ceviren saglayici-bagimsiz port (ADR-0007, ADR-0029 §3).
 *
 * ============================================================================
 * NEDEN `LLMPort`'TAN AYRI
 * ============================================================================
 * ADR-0030 §1.3 port yuzeyini ikiye boldu ve gerekce ILK GUNDEN dogru cikti:
 * DeepSeek'in embeddings uc noktasi YOKTUR (canli API testiyle olculdu), chat
 * ise DeepSeek'tedir. Tek port olsaydi `DeepSeekLlmAdapter` ya `embed()`'de
 * hata firlatir (port sozlesmesi yalan soyler) ya da icine ikinci bir
 * saglayicinin istemcisini gizlerdi — ADR-0007'nin onlemek icin var oldugu sey.
 *
 * Ayrica iki islemin yasam dongusu farklidir: embedding SAKLANAN, surumlu
 * veridir (model degisince tumu yeniden uretilir); completion durumsuz bir
 * cagridir.
 * ============================================================================
 *
 * ============================================================================
 * BILEREK MINIMAL
 * ============================================================================
 * Tek metot, tek parametre. Batch API, boyut secimi (`dimensions`), kesme
 * politikasi — hicbiri arayuzde YOKTUR. Hepsi saglayiciya ozgu ayrintilardir ve
 * adapter'da kalir; arayuze girseydi ilk saglayicinin bicimi soyutlamaya
 * kacardi (ADR-0029 §3.1'de `thinking` icin verilen ayni karar).
 * ============================================================================
 */
export interface EmbeddingPort {
  /**
   * Metnin vektor temsilini dondurur.
   *
   * Donen dizinin uzunlugu `EMBEDDING_DIMENSIONS` (1536) olmalidir; cagiran
   * taraf (`NoteChunk.create`) bunu ayrica dogrular — adapter'a guvenmek yerine
   * sinirda kontrol etmek, yanlis yapilandirilmis bir modeli veri yazilmadan
   * yakalar.
   */
  embed(text: string): Promise<number[]>;
}

/**
 * Embedding uretilemedi.
 *
 * ADR-0029 §4'un akisinda embedding SENKRONDUR: bu hata yuzeye cikar ve istek
 * 5xx ile biter. Not T1'de ZATEN commit olmustur ve SILINMEZ — sonuc, chunk'i
 * olmayan bir nottur (bilinen sinir; yetim notlar `LEFT JOIN` ile tespit
 * edilebilir kalir).
 */
export class EmbeddingFailedError extends Error {
  readonly code = 'EMBEDDING_FAILED';

  constructor(reason: string) {
    super(`Embedding uretilemedi: ${reason}`);
    this.name = 'EmbeddingFailedError';
  }
}
