/** DI token'i. */
export const IDENTITY_OUTBOX_REPOSITORY = Symbol('IDENTITY_OUTBOX_REPOSITORY');

/**
 * Outbox'tan OKUNAN kayit. Domain event'in kendisi DEGILDIR.
 *
 * Event nesnesi (`UserRegistered` vb.) yazma yolunun tipidir; okuma yolunda
 * elimizde yalnizca serilestirilmis payload vardir. Onu event sinifina geri
 * canlandirmak, tuketicinin ihtiyaci olmayan bir sozlesmeyi (constructor
 * imzasi, value object'ler) okuma yoluna da baglardi.
 */
export interface IdentityOutboxRecord {
  readonly id: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly correlationId: string;
  readonly occurredAt: Date;
}

/**
 * `platform.identity_outbox` OKUMA yolu (ADR-0006).
 *
 * Yazma yolu `IdentityOutboxEventPublisher`'dadir ve ayri durur: yazan taraf
 * use case'in transaction'ina INSERT eder, okuyan taraf arka plan surecidir.
 * Ikisini tek arayuzde birlestirmek, use case'lere teslimat metotlarini da
 * gorunur kilardi.
 */
export interface IdentityOutboxRepository {
  /**
   * Bekleyen kayitlari KILITLEYEREK getirir (en eskisi once).
   *
   * "Claim" adi bilincli: kayitlar yalnizca okunmaz, cagiran transaction adina
   * REZERVE edilir. Iki API instance ayni satiri okuyup ayni e-postayi iki kez
   * gondermesin diye kilit `FOR UPDATE SKIP LOCKED` ile alinir — bekleyen degil,
   * ATLAYAN bir kilit: mesgul satir digerinin turunu bloklamaz.
   */
  claimPending(limit: number): Promise<IdentityOutboxRecord[]>;

  /** Kayitlari yayinlanmis olarak isaretler. Bos dizi gecerlidir ve is yapmaz. */
  markPublished(ids: readonly string[], publishedAt: Date): Promise<void>;
}
