/**
 * Katmanli kaba kuvvet korumasi — SAF karar mantigi (AUTH_ARCHITECTURE 14, ADR-0022).
 *
 * ============================================================================
 * NEDEN UC KATMAN
 * ============================================================================
 * Tek katman ikisini birden cozemez (ADR-0022):
 * - Yalnizca e-posta bazli kilit HEDEFLI DoS silahina doner (saldirgan kurbani
 *   kilitler) ve hesap numaralandirmaya acar.
 * - Yalnizca IP bazli kilit botnet/proxy ile atlanir ve NAT arkasindaki mesru
 *   kullanicilari engeller.
 *
 * | Katman | Anahtar        | Esik        | Etki                          |
 * |--------|----------------|-------------|-------------------------------|
 * | 1      | (e-posta, IP)  | 5 / 15 dk   | O cift icin kilit (genel hata)|
 * | 2      | e-posta        | 20 / saat   | USTEL GECIKME (kilit DEGIL)   |
 * | 3      | IP             | 50 / saat   | 429 (ileride CAPTCHA)         |
 *
 * ============================================================================
 * BU DOSYA I/O YAPMAZ
 * ============================================================================
 * Fonksiyon, pencere ICINDEKI basarisiz deneme SAYILARINI alir — onlari
 * sorgulamak (zaman pencereleri, veritabani) login use-case'inin isidir.
 * Gecikmenin UYGULANMASI (bekleme), 429/genel-hata yaniti ve sabit-zamanli
 * esitleme de use-case/infrastructure'a aittir. Burada yalnizca KARAR verilir.
 *
 * Pencereler (15 dk / 60 dk) sabit olarak disa acilir cunku sayac sorgularini
 * kuran taraf onlara ihtiyac duyar; ama karar fonksiyonu yalnizca esikleri
 * kullanir (sayimlar ona hazir gelir).
 * ============================================================================
 */

// --- Katman 1: (e-posta, IP) ---
export const LAYER1_MAX_FAILURES = 5;
export const LAYER1_WINDOW_MINUTES = 15;

// --- Katman 2: e-posta (ustel gecikme) ---
export const LAYER2_MAX_FAILURES = 20;
export const LAYER2_WINDOW_MINUTES = 60;

// --- Katman 3: IP ---
export const LAYER3_MAX_FAILURES = 50;
export const LAYER3_WINDOW_MINUTES = 60;

/** Ustel gecikme tabani: esik asildiktan sonraki ilk adim. */
export const THROTTLE_BASE_DELAY_MS = 1000;

/**
 * Gecikme UST SINIRI. ADR-0022 "gecikme ust siniri olmalidir" der — sinirsiz
 * gecikme istek isleklerini acik tutar ve baglanti havuzunu tuketebilir.
 * 30 sn: otomatik saldiriyi ekonomik olarak anlamsiz kilacak kadar uzun, bir
 * baglantiyi kilitleyecek kadar degil.
 */
export const THROTTLE_MAX_DELAY_MS = 30_000;

/** Pencere icindeki BASARISIZ deneme sayilari (use-case tarafindan sorgulanir). */
export interface BruteForceCounts {
  /** Katman 1: `(e-posta, IP)` cifti icin son 15 dk. */
  readonly emailIpFailures: number;
  /** Katman 2: e-posta icin son 60 dk. */
  readonly emailFailures: number;
  /** Katman 3: IP icin son 60 dk. */
  readonly ipFailures: number;
}

/**
 * Kaba kuvvet karari (§14.2 akis semasinin onceligini tasir).
 *
 * `locked` gecikme TASIMAZ: katman 1 asildiginda istek hemen genel hataya duser.
 * `allow` ve `rate-limited` ise katman 2 gecikmesini tasir (yoksa 0).
 */
export type BruteForceDecision =
  | { readonly action: 'locked' }
  | { readonly action: 'rate-limited'; readonly throttleDelayMs: number }
  | { readonly action: 'allow'; readonly throttleDelayMs: number };

/**
 * Sayimlardan karari uretir. Oncelik §14.2 akis semasi ile aynidir:
 * once katman 1 (kilit), sonra katman 2 (gecikme), sonra katman 3 (429).
 */
export function evaluateBruteForce(counts: BruteForceCounts): BruteForceDecision {
  // Katman 1 — birincil kilit. Asildiysa istek hemen reddedilir; gecikme bile
  // hesaplanmaz (kilit, genel kimlik hatasiyla ayni yaniti verir — §14.3).
  if (counts.emailIpFailures >= LAYER1_MAX_FAILURES) {
    return { action: 'locked' };
  }

  // Katman 2 — kilit DEGIL gecikme. Kilit bir DoS silahidir, gecikme degildir.
  const throttleDelayMs = throttleDelayFor(counts.emailFailures);

  // Katman 3 — kaynak (IP) limiti; parola puskurtmeyi yakalar.
  if (counts.ipFailures >= LAYER3_MAX_FAILURES) {
    return { action: 'rate-limited', throttleDelayMs };
  }

  return { action: 'allow', throttleDelayMs };
}

/**
 * Katman 2 ustel gecikmesi: esikte 1 sn, sonra her adimda iki katina cikar,
 * `THROTTLE_MAX_DELAY_MS`'te sabitlenir. Esigin altinda gecikme yoktur.
 */
function throttleDelayFor(emailFailures: number): number {
  if (emailFailures < LAYER2_MAX_FAILURES) {
    return 0;
  }

  const steps = emailFailures - LAYER2_MAX_FAILURES; // 0 -> 1 sn, 1 -> 2 sn, ...
  const delay = THROTTLE_BASE_DELAY_MS * 2 ** steps;
  return Math.min(delay, THROTTLE_MAX_DELAY_MS);
}
