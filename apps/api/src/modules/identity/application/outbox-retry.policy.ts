/**
 * Outbox teslimat yeniden deneme politikasi — SAF karar mantigi
 * (ADR-0006, AUTH_ARCHITECTURE 16.1).
 *
 * ============================================================================
 * NEDEN PENCERE KOD OMRUNDEN KISA
 * ============================================================================
 * Dogrulama kodu 15 dakika yasar (ADR-0019). Backoff bu sureyi asarsa teslim
 * edilen kod ZATEN OLU olur: kullanici e-postayi acar, kodu girer ve reddedilir.
 * Bu, teslimatsizliktan daha kotu bir deneyimdir — calistigini sanip
 * calismayan bir sistem.
 *
 * Bu yuzden toplam pencere ~8 dakikada kapanir (30sn + 1dk + 2dk + 4dk) ve
 * 5. denemede kayit olu mektuba dusher. Kalici hata icin kullanicinin yolu
 * zaten `POST /auth/resend-verification`'dir.
 * ============================================================================
 *
 * ============================================================================
 * BU DOSYA I/O YAPMAZ
 * ============================================================================
 * Sayaci okumak, saati almak ve karari veritabanina yazmak use case'in isidir.
 * `brute-force-policy.ts` ve `verification-resend-policy.ts` ile ayni desen:
 * burada yalnizca KARAR verilir.
 * ============================================================================
 */

/** Bu sayiya ULASAN kayit yeniden denenmez; olu mektuba duser. */
export const MAX_DELIVERY_ATTEMPTS = 5;

/** Ilk yeniden deneme gecikmesi; her adimda iki katina cikar. */
export const RETRY_BASE_DELAY_MS = 30_000;

/**
 * Gecikme UST SINIRI. Ustel buyume sinirsiz olsaydi 10. deneme saatler sonraya
 * duserdi; kayit kuyrukta gorunur kalir ama pratikte hic denenmezdi.
 */
export const RETRY_MAX_DELAY_MS = 5 * 60_000;

/**
 * Basarisiz bir teslimatin ardindan ne yapilacagi.
 *
 * `retry` yeni sayaci ve YENIDEN DENEME ANINI tasir; `dead-letter` ise kaydin
 * kuyruktan cikarildigini soyler ve ALARM gerektirir (§15.2 ile ayni ilke:
 * tekrarlanan teslimat kaybi sessiz kalmamalidir).
 */
export type DeliveryRetryDecision =
  | { readonly action: 'retry'; readonly attemptCount: number; readonly nextAttemptAt: Date }
  | { readonly action: 'dead-letter'; readonly attemptCount: number };

export interface DeliveryFailureInput {
  /** Kaydin BU denemeden ONCEKI sayaci (veritabanindan okunan deger). */
  readonly previousAttemptCount: number;
  /** Hata kalici mi? Adapter siniflandirir (`EmailDeliveryError.permanent`). */
  readonly permanent: boolean;
  readonly now: Date;
}

/**
 * Basarisiz teslimattan sonraki adimi verir.
 *
 * KALICI hata TEK denemede olu mektuba duser: gecersiz bir adresi 5 kez denemek
 * kuyrugu bosuna mesgul eder ve ARKASINDAKI gecerli e-postalari geciktirir —
 * mekanizmanin var olma sebebi tam olarak bunu onlemektir.
 */
export function decideDeliveryRetry(input: DeliveryFailureInput): DeliveryRetryDecision {
  const attemptCount = input.previousAttemptCount + 1;

  if (input.permanent || attemptCount >= MAX_DELIVERY_ATTEMPTS) {
    return { action: 'dead-letter', attemptCount };
  }

  return {
    action: 'retry',
    attemptCount,
    nextAttemptAt: new Date(input.now.getTime() + retryDelayFor(attemptCount)),
  };
}

/**
 * Ustel gecikme: 1. basarisizliktan sonra 30 sn, sonra her adimda iki kati,
 * `RETRY_MAX_DELAY_MS`'te sabitlenir.
 */
export function retryDelayFor(attemptCount: number): number {
  const steps = Math.max(0, attemptCount - 1);
  const delay = RETRY_BASE_DELAY_MS * 2 ** steps;

  return Math.min(delay, RETRY_MAX_DELAY_MS);
}
