/**
 * Gunluk rapor uretimi yeniden deneme politikasi — SAF karar mantigi
 * (ADR-0030 §2.1).
 *
 * ============================================================================
 * NEDEN TENANT'INKI IMPORT EDILMIYOR
 * ============================================================================
 * `modules/tenant/application/tenant-outbox-retry.policy.ts` yapisal olarak ayni
 * karari verir. Yine de import EDILMEZ: CLAUDE.md Mutlak Kural 6 modullerin
 * birbirinin internal koduna bagimli olmasini YASAKLAR. (Tenant'in kendi dosyasi
 * da Identity'ninkini ayni gerekceyle kopyalamisti — bu ucuncu tekrar.)
 *
 * Ve burada ayrisma bir OLASILIK degil, ZATEN GERCEK: sayilar farkli ve
 * gerekcesi asagida.
 * ============================================================================
 *
 * ============================================================================
 * BU DOSYA I/O YAPMAZ
 * ============================================================================
 * Sayaci okumak, saati almak ve karari veritabanina yazmak use case'in isidir.
 * `brute-force-policy.ts` · `rate-limit.policy.ts` ile ayni desen.
 * ============================================================================
 */

/** Bu sayiya ULASAN kayit yeniden denenmez; olu mektuba duser. */
export const MAX_REPORT_ATTEMPTS = 5;

/**
 * Ilk yeniden deneme gecikmesi: **5 dakika** (outbox'ta 30 saniye).
 *
 * Outbox'un 30 saniyesi, teslimatin saniyeler suren bir is olmasindan gelir.
 * Burada basarisizligin en olasi sebebi LLM saglayicisinin gecici olarak
 * cevap verememesidir; 30 saniye sonra tekrar denemek ayni duvara carpmaktir.
 * Ayrica her deneme PARA harcar — sik yeniden deneme, ucu acik bir maliyet.
 */
export const REPORT_RETRY_BASE_DELAY_MS = 5 * 60_000;

/**
 * Gecikme UST SINIRI: **1 saat** (outbox'ta 5 dakika).
 *
 * Gunluk bir rapor icin bir saat sonra denemek anlamli — rapor bir GUNE aittir,
 * bir ana degil. Outbox event'i ise ne kadar beklerse o kadar bayatlar.
 */
export const REPORT_RETRY_MAX_DELAY_MS = 60 * 60_000;

export type ReportRetryDecision =
  | { readonly action: 'retry'; readonly attemptCount: number; readonly nextAttemptAt: Date }
  | { readonly action: 'dead-letter'; readonly attemptCount: number };

export interface ReportFailureInput {
  /** Kaydin BU denemeden ONCEKI sayaci (veritabanindan okunan deger). */
  readonly previousAttemptCount: number;
  readonly now: Date;
}

/**
 * Basarisiz uretimden sonraki adimi verir.
 *
 * Kalici/gecici ayrimi YOKTUR (tenant outbox'takinin aksine): `LLMPort` bugun
 * tek bir `CompletionFailedError` firlatir ve icinden "bu hata tekrar denemeye
 * deger mi" sorusunun cevabi CIKARILAMAZ. Uydurma bir siniflandirma yapmak
 * yerine hepsi yeniden denenir; dead-letter siniri zaten ucu aciklik birakmaz.
 */
export function decideReportRetry(input: ReportFailureInput): ReportRetryDecision {
  const attemptCount = input.previousAttemptCount + 1;

  if (attemptCount >= MAX_REPORT_ATTEMPTS) {
    return { action: 'dead-letter', attemptCount };
  }

  return {
    action: 'retry',
    attemptCount,
    nextAttemptAt: new Date(input.now.getTime() + reportRetryDelayFor(attemptCount)),
  };
}

/** Ustel gecikme: 1. basarisizliktan sonra 5 dk, sonra iki kati, tavanda sabit. */
export function reportRetryDelayFor(attemptCount: number): number {
  const steps = Math.max(0, attemptCount - 1);
  const delay = REPORT_RETRY_BASE_DELAY_MS * 2 ** steps;

  return Math.min(delay, REPORT_RETRY_MAX_DELAY_MS);
}
