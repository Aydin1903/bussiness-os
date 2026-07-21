/**
 * Birincil anahtar uretme port'u.
 *
 * DEVELOPMENT_RULES 6: birincil anahtar UUIDv7'dir — zaman-sirali oldugu icin
 * index dostudur. UUIDv4 rastgeledir ve B-tree index'inde her ekleme farkli bir
 * sayfaya duser; bu, tablo buyudukce yazma performansini gorunur sekilde
 * bozar.
 *
 * DEVELOPMENT_RULES 3.2: uretim `Math.random()` ve `Date.now()` gerektirir,
 * ikisi de domain icinde dogrudan cagrilamaz. Bu yuzden id daima disaridan
 * gelir — domain yalnizca DOGRULAR (bkz. `uuid-v7.ts`).
 *
 * Donus tipi `string`'tir, value object degil: bu port tum moduller tarafindan
 * paylasilir ve hicbirinin kimlik tipini bilmez. Cagiran taraf donen degeri
 * kendi value object'ine sarar — `TenantId.create(idGenerator.nextId())`.
 * Boylece uretilen id, kullanildigi yerde ayrica DOGRULANMIS olur.
 */
export interface IdGenerator {
  /** Yeni bir UUIDv7 uretir. */
  nextId(): string;
}
