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
  /** Bu kayit daha once kac kez denendi. Yeniden deneme karari buna bakar. */
  readonly attemptCount: number;
}

/** Basarisiz bir teslimatin kalici sonucu (backoff veya olu mektup). */
export interface OutboxDeliveryFailure {
  readonly id: string;
  readonly attemptCount: number;
  /** Teshis metni. Sir TASIMAZ (P1). */
  readonly lastError: string;
  /** Dolu ise kayit yeniden denenecek; `null` ise olu mektuba dusuruldu. */
  readonly nextAttemptAt: Date | null;
  /** Dolu ise kayit kuyruktan CIKARILDI. */
  readonly deadLetteredAt: Date | null;
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
  claimPending(limit: number, now: Date): Promise<IdentityOutboxRecord[]>;

  /** Kayitlari yayinlanmis olarak isaretler. Bos dizi gecerlidir ve is yapmaz. */
  markPublished(ids: readonly string[], publishedAt: Date): Promise<void>;

  /**
   * Basarisiz teslimatlari kalici hale getirir: sayac, son hata ve backoff
   * (veya olu mektup isareti).
   *
   * ============================================================================
   * BASARISIZLIK DA YAZILMAK ZORUNDADIR
   * ============================================================================
   * Yazilmasaydi sayac hic artmaz, backoff hic uygulanmaz ve kayit her turda
   * yeniden denenirdi — mekanizmanin tamami islevsiz kalirdi. Bu, `LoginUseCase`
   * ve resend defterindeki ayni dersin ucuncu tekrari: KORUMAYI SAGLAYAN YAZIM
   * commit olmak zorundadir.
   *
   * Bu cagri, kaydin kilitli oldugu AYNI transaction'da yapilir; tur sonunda
   * commit olur.
   * ============================================================================
   */
  recordFailures(failures: readonly OutboxDeliveryFailure[]): Promise<void>;
}
