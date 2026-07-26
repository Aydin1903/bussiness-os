import type { CookieOptions, Request, Response } from 'express';

/**
 * Refresh token'in TASINMASI — tek dogruluk kaynagi (ADR-0026).
 *
 * ============================================================================
 * NEDEN COOKIE, NEDEN BURADAKI OZELLIKLER
 * ============================================================================
 * Refresh token bu modelin tek uzun omurlu (30 gun) kimlik bilgisidir; calinirsa
 * yeniden kullanim tespit edilene kadar (ADR-0021) hesap saldirganin elindedir.
 * `HttpOnly` cookie JavaScript erisimini tamamen keser — bir XSS acigi bile onu
 * OKUYAMAZ. Access/identity token ise memory'de kalir (FRONTEND_ARCHITECTURE §2).
 *
 * - `httpOnly`  : JS okuyamaz (asil savunma).
 * - `secure`    : yalnizca HTTPS. Uretimde daima acik; dev/test (HTTP) icin
 *                 `isProduction`'dan turetilir — cagiran gecirir.
 * - `sameSite`  : `strict`. Cookie yalnizca XHR ile `/api/v1/auth/*`'a gider ve
 *                 hicbir top-level navigasyona bagli degildir; cross-site
 *                 isteklerde hic gonderilmez -> CSRF cookie katmaninda kesilir.
 *                 (Web ve API'nin AYNI kayitli alanda / subdomain olmasi gerekir;
 *                 aksi halde cookie hic gonderilmez — FRONTEND_ARCHITECTURE §2.3.)
 * - `path`      : yalnizca `/api/v1/auth`. Cookie her istege degil, yalnizca
 *                 kimlik uclarina tasinir; yuzey daraltilir.
 * - **Domain KONMAZ**: cookie host-only kalir (yalnizca API host'una gider).
 *                 Web app onu hicbir zaman okumaz (HttpOnly), dolayisiyla
 *                 `Domain=.ornek.com` gereksiz ve daha genis bir yuzeydir.
 *
 * Double-submit CSRF token V1'de EKLENMEDI (ADR-0026): SameSite=Strict same-site
 * deployment icin yeterli. Cross-site (SameSite=None) veya guvenilmeyen kardes
 * subdomain tehdit modeli olusursa hazir bir tirmanistir.
 * ============================================================================
 */
export const REFRESH_COOKIE_NAME = 'refresh_token';

/** Cookie yolu — access token ile AYNI onek altinda degil, yalnizca auth uclari. */
const REFRESH_COOKIE_PATH = '/api/v1/auth';

/**
 * Kayan pencere (ADR-0021): 30 gun. Cookie her login/refresh'te YENIDEN yazilir,
 * boylece istemci tarafi omur de her rotasyonda tazelenir. Sunucu yine tek yetkili
 * kaynaktir (DB); bu deger yalnizca bir istemci ipucudur.
 */
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function baseOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  };
}

/** Refresh token'i cookie'ye yazar (login ve refresh sonrasi). */
export function setRefreshCookie(response: Response, token: string, secure: boolean): void {
  response.cookie(REFRESH_COOKIE_NAME, token, {
    ...baseOptions(secure),
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}

/**
 * Refresh cookie'sini siler (logout / logout-all).
 *
 * Silme, yazmayla AYNI ozniteliklerle (path, sameSite, secure) yapilmalidir;
 * aksi halde tarayici farkli bir cookie sanip eskisini birakir.
 */
export function clearRefreshCookie(response: Response, secure: boolean): void {
  response.clearCookie(REFRESH_COOKIE_NAME, baseOptions(secure));
}

/**
 * Refresh token'i cookie'den okur. Cookie yoksa `undefined` doner — cagiran bunu
 * "kimlik bilgisi yok" olarak ele alir (refresh -> 401, logout -> yine 204).
 *
 * `cookie-parser` middleware'i `req.cookies`'i doldurur (main.ts). Yoksa
 * (parser baglanmamis test'te) alan tanimsizdir; bu fonksiyon yine guvenli caliisr.
 */
export function readRefreshCookie(request: Request): string | undefined {
  // `cookie-parser` baglanmamissa (parser'siz test) alan runtime'da undefined
  // olabilir — tip `Record` dese de. Once gercekten nesne oldugunu dogrula.
  const cookies: unknown = request.cookies;
  if (typeof cookies !== 'object' || cookies === null) {
    return undefined;
  }

  const value: unknown = Reflect.get(cookies, REFRESH_COOKIE_NAME);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
