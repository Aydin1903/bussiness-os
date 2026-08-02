/** DI token'i. */
export const TENANT_OUTBOX_REPOSITORY = Symbol('TENANT_OUTBOX_REPOSITORY');

/**
 * Outbox'tan OKUNAN kayit. Domain event'in kendisi DEGILDIR.
 *
 * Event nesnesi (`TenantProvisioningRequested` vb.) yazma yolunun tipidir;
 * okuma yolunda elimizde yalnizca serilestirilmis payload vardir. Onu event
 * sinifina geri canlandirmak, tuketicinin ihtiyaci olmayan bir sozlesmeyi
 * (constructor imzasi, value object'ler) okuma yoluna da baglardi.
 */
export interface TenantOutboxRecord {
  readonly id: string;
  /**
   * Event'i doguran tenant.
   *
   * Identity kaydinda BULUNMAZ — orada event'ler tanimi geregi tenant'sizdir
   * (§15.1). Burada tuketici tenant'lar ARASI okur, dolayisiyla her kaydin
   * hangi tenant'a ait oldugu teslimat baglamının parcasidir.
   */
  readonly tenantId: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly correlationId: string;
  readonly occurredAt: Date;
  /** Bu kayit daha once kac kez denendi. Yeniden deneme karari buna bakar. */
  readonly attemptCount: number;
}

/** Basarisiz bir teslimatin kalici sonucu (backoff veya olu mektup). */
export interface TenantOutboxDeliveryFailure {
  readonly id: string;
  readonly attemptCount: number;
  /** Teshis metni. Sir TASIMAZ. */
  readonly lastError: string;
  /** Dolu ise kayit yeniden denenecek; `null` ise olu mektuba dusuruldu. */
  readonly nextAttemptAt: Date | null;
  /** Dolu ise kayit kuyruktan CIKARILDI. */
  readonly deadLetteredAt: Date | null;
}

/**
 * `platform.outbox` OKUMA yolu (ADR-0006, MULTI_TENANT_ARCHITECTURE 12.4.2).
 *
 * Yazma yolu `OutboxEventPublisher`'dadir ve ayri durur: yazan taraf use
 * case'in tenant transaction'ina INSERT eder, okuyan taraf arka plan surecidir.
 * Ikisini tek arayuzde birlestirmek, use case'lere teslimat metotlarini da
 * gorunur kilardi.
 *
 * ============================================================================
 * IDENTITY'DEN TEK YAPISAL FARK: BU YOL RLS'I ASAR
 * ============================================================================
 * `platform.identity_outbox` tenant'siz ve RLS'siz oldugu icin Identity'nin
 * repository'si duz Drizzle sorgusu yapabilir. `platform.outbox` ise standart
 * RLS sablonunu tasir (`ENABLE` + `FORCE`) ve tuketici tenant'lar ARASI okumak
 * zorundadir — tenant context'i yoktur ve olamaz.
 *
 * Bu yuzden implementasyon uc `SECURITY DEFINER` fonksiyona cagri yapar
 * (migration `0010`). PORT SOZLESMESI bundan ETKILENMEZ: use case hangi
 * mekanizmanin kullanildigini bilmez ve bilmemelidir.
 * ============================================================================
 */
export interface TenantOutboxRepository {
  /**
   * Bekleyen kayitlari KILITLEYEREK getirir (yeniden denenmeye en erken hazir
   * olan once).
   *
   * "Claim" adi bilincli: kayitlar yalnizca okunmaz, cagiran transaction adina
   * REZERVE edilir. Iki API instance ayni satiri isleyip ayni event'i iki kez
   * teslim etmesin diye kilit `FOR UPDATE SKIP LOCKED` ile alinir — bekleyen
   * degil, ATLAYAN bir kilit: mesgul satir digerinin turunu bloklamaz.
   */
  claimPending(limit: number, now: Date): Promise<TenantOutboxRecord[]>;

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
   * yeniden denenirdi — mekanizmanin tamami islevsiz kalirdi. Bu, `LoginUseCase`,
   * resend defteri ve Identity outbox'undaki ayni dersin tekrari: KORUMAYI
   * SAGLAYAN YAZIM commit olmak zorundadir.
   *
   * Bu cagri, kaydin kilitli oldugu AYNI transaction'da yapilir; tur sonunda
   * commit olur.
   * ============================================================================
   */
  recordFailures(failures: readonly TenantOutboxDeliveryFailure[]): Promise<void>;
}
