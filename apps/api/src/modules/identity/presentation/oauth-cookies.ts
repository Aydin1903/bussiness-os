import type { CookieOptions, Request, Response } from 'express';

/**
 * OAuth akisinin IKI kisa omurlu cerezi (ADR-0053 §4.2 / §4.3, PO Kalem B4).
 *
 * ============================================================================
 * ⚠️⚠️ `SameSite=Lax` — `Strict` DEGIL. BU DOSYANIN EN ONEMLI SATIRI.
 * ============================================================================
 * Refresh cerezi `Strict` tasir (`refresh-cookie.ts`) ve burada `Lax` olmasi
 * BIR TUTARSIZLIK DEGIL BIR ZORUNLULUKTUR:
 *
 *   OAuth callback'i, SAGLAYICIDAN gelen bir UST SEVIYE CROSS-SITE
 *   NAVIGASYONDUR. `SameSite=Strict` bir cerez boyle bir istekte TARAYICI
 *   TARAFINDAN HIC GONDERILMEZ — yani state cerezi sunucuya ulasmaz, akis
 *   `OAuthStateInvalidError` ile **her seferinde** kirilir.
 *
 * ⚠️ Hata YAZILI OLMASAYDI bir gun birisi "tutarlilik" adina bunu `Strict`
 * yapardi ve sonuc %100 kirilan bir giris olurdu. `Lax`, ust seviye `GET`
 * navigasyonlarinda cerezi gonderir — tam olarak ihtiyacimiz olan sey ve
 * ihtiyacimiz olandan FAZLASI DEGIL (`POST` cross-site isteklerde yine
 * gonderilmez).
 *
 * ============================================================================
 * ⚠️ NEDEN TABLO DEGIL CEREZ
 * ============================================================================
 * State/nonce/verifier icin bir tablo temizlik isi, migration ve bir RLS
 * sorusu getirirdi. Imzali cerez KENDILIGINDEN OLUR ve sunucuda hicbir iz
 * birakmaz.
 *
 * Bekleyen baglama icin ise gerekce daha keskin: tabloya yazilsaydi dogrulama
 * tamamlanmadan `UNIQUE (provider, provider_subject)` uzerinde bir YER ISGALI
 * olusurdu.
 *
 * ============================================================================
 * ORTAK OZELLIKLER — ve neden her biri gerekli
 * ============================================================================
 * - `httpOnly` : JS okuyamaz. ⚠️ `code_verifier` bir XSS'e acilirsa PKCE'nin
 *                tum degeri kaybolur (`pkce.ts`).
 * - `secure`   : yalnizca HTTPS. Uretimde daima acik; dev/test (HTTP) icin
 *                `isProduction`'dan turetilir — cagiran gecirir.
 * - `path`     : yalnizca `/api/v1/auth/oauth`. ⚠️ Refresh cerezinin
 *                `/api/v1/auth` yolundan DAHA DARDIR: bu cerezler kimlik
 *                uclarinin tamamina degil, yalnizca OAuth akisina aittir.
 * - **Domain KONMAZ**: cerez host-only kalir (refresh cereziyle ayni kural).
 * - `maxAge`   : imzanin `exp`i ile AYNI BANTTA. ⚠️ Ikisi ayrisirsa hata
 *                sessiz degil ama YANILTICI olur: cerez durur, token oluir ve
 *                kullanici "gecersiz oturum" gorur.
 * ============================================================================
 */

export const OAUTH_STATE_COOKIE_NAME = 'oauth_state';
export const OAUTH_PENDING_LINK_COOKIE_NAME = 'oauth_pending_link';
export const OAUTH_ONE_TAP_COOKIE_NAME = 'oauth_one_tap';

const OAUTH_COOKIE_PATH = '/api/v1/auth/oauth';

/** `signOAuthState` TTL'i ile ayni (10 dk). */
const STATE_MAX_AGE_MS = 10 * 60 * 1000;
/** `signOAuthPendingLink` TTL'i ile ayni (15 dk). */
const PENDING_LINK_MAX_AGE_MS = 15 * 60 * 1000;
/** `signOAuthOneTap` TTL'i ile ayni (10 dk). */
const ONE_TAP_MAX_AGE_MS = 10 * 60 * 1000;

function baseOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure,
    // ⚠️ Yukaridaki bloga bakiniz — `strict` BURADA AKISI KIRAR.
    sameSite: 'lax',
    path: OAUTH_COOKIE_PATH,
  };
}

export function setOAuthStateCookie(response: Response, token: string, secure: boolean): void {
  response.cookie(OAUTH_STATE_COOKIE_NAME, token, {
    ...baseOptions(secure),
    maxAge: STATE_MAX_AGE_MS,
  });
}

export function setOAuthPendingLinkCookie(
  response: Response,
  token: string,
  secure: boolean,
): void {
  response.cookie(OAUTH_PENDING_LINK_COOKIE_NAME, token, {
    ...baseOptions(secure),
    maxAge: PENDING_LINK_MAX_AGE_MS,
  });
}

/**
 * Silme, yazmayla AYNI ozniteliklerle yapilmalidir (path, sameSite, secure);
 * aksi halde tarayici farkli bir cerez sanip eskisini birakir —
 * `clearRefreshCookie`in ayni kurali.
 */
/**
 * One Tap `nonce` baglayicisi (ADR-0053 EK-1.1, EK-1.5).
 *
 * ============================================================================
 * ⚠️ BU CEREZ `SameSite=Strict` — DIGER IKISINDEN FARKLI, VE BILINCLI
 * ============================================================================
 * `state` ve `bekleyen baglama` cerezleri `Lax`tir cunku ⚠️ **ust seviye
 * cross-site bir navigasyonda** (Google -> biz) geri gelmek ZORUNDADIRLAR.
 *
 * One Tap cerezi ise yalnizca ⚠️ **kendi sayfamizdan atilan bir XHR**'de
 * kullanilir: `POST /auth/oauth/google/one-tap` bir navigasyon degildir.
 * Cross-site bir gelis SENARYOSU YOKTUR, dolayisiyla daha dar olan `Strict`
 * BEDELSIZDIR — ve bedelsiz olan daha dar secenek alinir.
 *
 * ⚠️ Bu ayrim yazilmasaydi biri "tutarlilik" adina ucunu de ayni yapardi:
 * `Lax`a cekmek bu cerezi gereksiz yere genisletir, `Strict`e cekmek ise
 * DIGER IKISINI %100 kirardi.
 * ============================================================================
 */
export function setOAuthOneTapCookie(response: Response, token: string, secure: boolean): void {
  response.cookie(OAUTH_ONE_TAP_COOKIE_NAME, token, {
    ...baseOptions(secure),
    sameSite: 'strict',
    maxAge: ONE_TAP_MAX_AGE_MS,
  });
}

/**
 * ⚠️ Silme, yazmayla AYNI ozniteliklerle yapilir — `sameSite: 'strict'` dahil.
 * Farkli bir `sameSite` ile silinseydi tarayici onu BASKA bir cerez sanip
 * eskisini birakirdi ve `nonce` TEK KULLANIMLIK olmaktan cikardi.
 */
export function clearOAuthOneTapCookie(response: Response, secure: boolean): void {
  response.clearCookie(OAUTH_ONE_TAP_COOKIE_NAME, { ...baseOptions(secure), sameSite: 'strict' });
}

export function clearOAuthStateCookie(response: Response, secure: boolean): void {
  response.clearCookie(OAUTH_STATE_COOKIE_NAME, baseOptions(secure));
}

export function clearOAuthPendingLinkCookie(response: Response, secure: boolean): void {
  response.clearCookie(OAUTH_PENDING_LINK_COOKIE_NAME, baseOptions(secure));
}

/** Cerez yoksa `null` — cagiran bunu "state yok" olarak ele alir (400). */
export function readOAuthCookie(request: Request, name: string): string | null {
  const cookies: unknown = request.cookies;
  if (typeof cookies !== 'object' || cookies === null) {
    return null;
  }

  const value: unknown = Reflect.get(cookies, name);
  return typeof value === 'string' && value.length > 0 ? value : null;
}
