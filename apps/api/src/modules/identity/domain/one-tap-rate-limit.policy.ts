import { TooManyOneTapAttemptsError } from './identity.error';

/**
 * One Tap oran siniri politikasi (ADR-0053 EK-1.4).
 *
 * ============================================================================
 * ⚠️ NEDEN BU UCUN SINIRI VAR, `/start`IN YOK
 * ============================================================================
 * Ikisi KATEGORIK OLARAK farklidir:
 *
 *   `/start`   -> saldirgan yalnizca bir yonlendirme tetikler; pahali adim
 *                 (token exchange) GECERLI BIR `code` ister ve onu uretemez.
 *   `/one-tap` -> saldirganin uretmesi gereken sey bizim `aud`umuzla gecerli
 *                 bir Google ID token'idir ve bunu ⚠️ HERHANGI BIR GOOGLE
 *                 HESABIYLA uretebilir. Ustelik uc, D2/D3 dallarinda
 *                 KULLANICI OLUSTURABILIR.
 *
 * Yani bariyer "bizim kodumuza sahip olmak"tan "bir Google hesabina sahip
 * olmak"a duser.
 *
 * ⚠️ SINIR YALNIZCA IP BAZLIDIR. Hesap bazli bir sayac eklemek, saldirganin
 * kurbani kilitlemesine izin verirdi (bkz. repository port'u ve `0041`).
 * ============================================================================
 */

/** Kayan pencere. */
export const ONE_TAP_WINDOW_MINUTES = 60;

/**
 * Pencere basina IP limiti.
 *
 * ⚠️ Deger CÖMERT secildi ve bu bilinclidir: tek bir IP'nin arkasinda kurumsal
 * bir NAT olabilir ve ⚠️ mesru kullanicilari kilitlemek, bu ucun korumaya
 * calistigi seyden daha buyuk bir zarardir. Sinirin isi bir saldirganin
 * BINLERCE denemesini kesmektir, yirmi kisiyi ayirt etmek degil.
 */
export const ONE_TAP_MAX_ATTEMPTS_PER_WINDOW = 20;

/**
 * Sinir asildiysa firlatir.
 *
 * ⚠️ Sayac deneme YAZILMADAN ONCE okunur ve karar ondan sonra verilir; bu
 * yuzden esik "sonuncu istek dahil" anlamindadir.
 */
export function assertOneTapAllowed(attemptsInWindow: number): void {
  if (attemptsInWindow >= ONE_TAP_MAX_ATTEMPTS_PER_WINDOW) {
    throw new TooManyOneTapAttemptsError();
  }
}
