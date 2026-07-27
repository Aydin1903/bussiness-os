import { z } from 'zod';

import {
  clearSession,
  getCurrentTenantId,
  getIdentityToken,
  setSession,
  type TenantId,
} from '../session/session-store';
import { apiBaseUrl } from './config';
import { ApiError, toApiError } from './problem';

/**
 * Oturum yenileme — İKİ ADIMLI ve SINGLE-FLIGHT.
 *
 * ============================================================================
 * NEDEN İKİ ADIM (§5.2, ADR-0020)
 * ============================================================================
 * `POST /auth/refresh` bir ACCESS token DÖNMEZ; `identityToken` döner. Tenant-
 * scoped access token'a ulaşmanın tek yolu `switch-tenant`'tır. Bu yüzden 401
 * sonrası yenileme:
 *   1) refresh()          → yeni identityToken (+ rotasyonlu refresh cookie)
 *   2) switch-tenant(tid)  → yeni accessToken
 * Refresh token gövdede taşınmaz; `credentials: 'include'` ile HttpOnly cookie
 * otomatik gider (ADR-0026).
 *
 * ============================================================================
 * NEDEN SINGLE-FLIGHT — PAZARLIK EDİLEMEZ (ADR-0021)
 * ============================================================================
 * İki eşzamanlı istek aynı refresh cookie'sini iki kez sunarsa, backend'in
 * YENİDEN KULLANIM TESPİTİ tüm token ailesini iptal eder ve kullanıcı sebepsiz
 * düşer. Bu yüzden tüm eşzamanlı yenilemeler TEK bir promise'te birleşir.
 * ============================================================================
 */

const refreshResponseSchema = z.object({ identityToken: z.string().min(1) });
const switchTenantResponseSchema = z.object({ accessToken: z.string().min(1) });

/** Aynı anda yalnızca bir yenileme; diğerleri bunu bekler. */
let inFlight: Promise<string> | null = null;

/**
 * Oturumu yeniler ve YENİ access token'ı döndürür. Başarısızlıkta oturumu
 * temizler ve fırlatır (çağıran login'e yönlendirir).
 *
 * Eşzamanlı çağrılar aynı `inFlight` promise'ini paylaşır.
 */
export function refreshSession(): Promise<string> {
  inFlight ??= runRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runRefresh(): Promise<string> {
  // 1) Kimlik oturumunu yenile — refresh token cookie'den otomatik gider.
  const identityToken = await refreshIdentity();
  setSession({ identityToken });

  // 2) Tenant-scoped access token yalnızca seçili bir tenant varsa türetilebilir.
  const tenantId = getCurrentTenantId();
  if (tenantId === undefined) {
    // Kimlik tazelendi ama tenant seçilmedi; access token üretilemez. UI
    // kullanıcıyı tenant seçimine yönlendirmelidir (F2).
    throw new ApiError(409, undefined, 'Tenant seçilmeden erişim token’ı üretilemez.');
  }

  const accessToken = await deriveAccessToken(identityToken, tenantId);
  setSession({ accessToken });
  return accessToken;
}

/** Adım 1 — refresh cookie'siyle yeni kimlik token'ı al. */
async function refreshIdentity(): Promise<string> {
  const response = await fetch(`${apiBaseUrl()}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    clearSession();
    throw await toApiError(response);
  }

  return refreshResponseSchema.parse(await response.json()).identityToken;
}

/** Adım 2 — kimlik token'ıyla seçili tenant için access token bas. */
async function deriveAccessToken(identityToken: string, tenantId: TenantId): Promise<string> {
  const response = await fetch(`${apiBaseUrl()}/auth/switch-tenant`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${identityToken}`,
    },
    credentials: 'include',
    body: JSON.stringify({ tenantId }),
  });

  if (!response.ok) {
    clearSession();
    throw await toApiError(response);
  }

  return switchTenantResponseSchema.parse(await response.json()).accessToken;
}

/** F2/testler için: kimlik token'ının hâlihazırda var olup olmadığını okur. */
export function hasIdentity(): boolean {
  return getIdentityToken() !== undefined;
}
