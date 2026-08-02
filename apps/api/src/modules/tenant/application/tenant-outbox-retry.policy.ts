/**
 * Tenant outbox teslimat yeniden deneme politikasi — SAF karar mantigi
 * (ADR-0006, MULTI_TENANT_ARCHITECTURE 12.4.2).
 *
 * ============================================================================
 * NEDEN IDENTITY'NINKI IMPORT EDILMIYOR
 * ============================================================================
 * `modules/identity/application/outbox-retry.policy.ts` ayni kararı verir ve
 * bugun ayni sayilari tasir. Yine de import EDILMEZ: CLAUDE.md Mutlak Kural 6
 * modullerin birbirinin internal koduna bagimli olmasini YASAKLAR. Ortak bir
 * yere tasimak (`shared/`) Identity'yi degistirmek demekti ve bu isin kapsami
 * disindadir.
 *
 * Ayrisma bir RISK degil, bir OLASILIKTIR ve gerekcesi vardir: Identity'nin
 * ~8 dakikalik penceresi dogrulama kodunun 15 dakikalik omrunden TURETILMISTIR
 * ("backoff kod omrunu asarsa teslim edilen kod zaten olu olur"). Tenant
 * event'lerinin boyle bir kisiti YOKTUR — bir provisioning event'i 20 dakika
 * sonra islense de anlamini yitirmez.
 *
 * Bugun sayilar AYNI tutuldu cunku farklilastirmak icin somut bir gerekce yok.
 * Ayri dosya olmasi, gerekce dogdugunda ayrisabilmelerini zaten mumkun kilar.
 * ============================================================================
 *
 * ============================================================================
 * BU DOSYA I/O YAPMAZ
 * ============================================================================
 * Sayaci okumak, saati almak ve karari veritabanina yazmak use case'in isidir.
 * `brute-force-policy.ts` ve Identity'nin `outbox-retry.policy.ts`'i ile ayni
 * desen: burada yalnizca KARAR verilir.
 * ============================================================================
 */

/** Bu sayiya ULASAN kayit yeniden denenmez; olu mektuba duser. */
export const MAX_TENANT_DELIVERY_ATTEMPTS = 5;

/** Ilk yeniden deneme gecikmesi; her adimda iki katina cikar. */
export const TENANT_RETRY_BASE_DELAY_MS = 30_000;

/**
 * Gecikme UST SINIRI. Ustel buyume sinirsiz olsaydi 10. deneme saatler sonraya
 * duserdi; kayit kuyrukta gorunur kalir ama pratikte hic denenmezdi.
 */
export const TENANT_RETRY_MAX_DELAY_MS = 5 * 60_000;

/**
 * Basarisiz bir teslimatin ardindan ne yapilacagi.
 *
 * `retry` yeni sayaci ve YENIDEN DENEME ANINI tasir; `dead-letter` ise kaydin
 * kuyruktan cikarildigini soyler ve ALARM gerektirir.
 */
export type TenantDeliveryRetryDecision =
  | { readonly action: 'retry'; readonly attemptCount: number; readonly nextAttemptAt: Date }
  | { readonly action: 'dead-letter'; readonly attemptCount: number };

export interface TenantDeliveryFailureInput {
  /** Kaydin BU denemeden ONCEKI sayaci (veritabanindan okunan deger). */
  readonly previousAttemptCount: number;
  /**
   * Hata KALICI mi? Bugun daima `false` gelir — tenant tarafinda kalici/gecici
   * ayrimi yapabilecek bir adapter (Identity'deki `EmailDeliveryError` gibi)
   * HENUZ YOK. Parametre yine de duruyor: gercek tuketiciler geldiginde ayrimi
   * yapacak taraf onlar olacak ve politika o gun degismeyecek.
   */
  readonly permanent: boolean;
  readonly now: Date;
}

/**
 * Basarisiz teslimattan sonraki adimi verir.
 *
 * KALICI hata TEK denemede olu mektuba duser: kalici bir hatayi 5 kez denemek
 * kuyrugu bosuna mesgul eder ve ARKASINDAKI gecerli event'leri geciktirir —
 * mekanizmanin var olma sebebi tam olarak bunu onlemektir.
 */
export function decideTenantDeliveryRetry(
  input: TenantDeliveryFailureInput,
): TenantDeliveryRetryDecision {
  const attemptCount = input.previousAttemptCount + 1;

  if (input.permanent || attemptCount >= MAX_TENANT_DELIVERY_ATTEMPTS) {
    return { action: 'dead-letter', attemptCount };
  }

  return {
    action: 'retry',
    attemptCount,
    nextAttemptAt: new Date(input.now.getTime() + tenantRetryDelayFor(attemptCount)),
  };
}

/**
 * Ustel gecikme: 1. basarisizliktan sonra 30 sn, sonra her adimda iki kati,
 * `TENANT_RETRY_MAX_DELAY_MS`'te sabitlenir.
 */
export function tenantRetryDelayFor(attemptCount: number): number {
  const steps = Math.max(0, attemptCount - 1);
  const delay = TENANT_RETRY_BASE_DELAY_MS * 2 ** steps;

  return Math.min(delay, TENANT_RETRY_MAX_DELAY_MS);
}
