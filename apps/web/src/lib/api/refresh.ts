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
 * ⚠️ KİMLİK TAZELEMESİ DE SINGLE-FLIGHT — ve bu, yukarıdaki kuralın EKSİK
 * KALMIŞ YARISIDIR.
 *
 * `inFlight` yalnızca `refreshSession()`in İKİ ADIMLI akışını birleştiriyordu.
 * `refreshIdentityToken()` ise (tenant seçimi ve bootstrap tarafından
 * çağrılır) doğrudan `refreshIdentity()`ye gidiyordu — yani iki yol aynı anda
 * koştuğunda AYNI refresh cookie'si backend'e İKİ KEZ sunuluyordu.
 *
 * Dosyanın kendi başlığı bunun sonucunu zaten yazıyor: **yeniden kullanım
 * tespiti tüm token ailesini iptal eder ve kullanıcı sebepsiz düşer**
 * (ADR-0021). Yani kural yazılıydı ama yalnızca bir yolda uygulanıyordu.
 *
 * ⚠️ Birleştirme `refreshIdentity()` SEVİYESİNDE yapılır, export başına değil:
 * `refreshSession()` de bu paylaşılan promise'i kullanır. Export başına iki
 * ayrı `inFlight` olsaydı, `refreshSession()` ile `refreshIdentityToken()`
 * eşzamanlı çağrıldığında yine iki istek çıkardı — yani hatanın kendisi
 * kapanmazdı.
 */
let identityInFlight: Promise<string> | null = null;

/**
 * Kimlik token'ını tazeler ve memory'ye yazar — eşzamanlı çağrılar TEK isteği
 * paylaşır.
 *
 * `setSession` burada yapılır, çağıranlarda değil: iki çağıranın da aynı şeyi
 * yazması gerekiyordu ve biri unutulsa hata SESSİZ olurdu (token tazelenir ama
 * memory'ye geçmez, bir sonraki istek yine 401 alır).
 */
function sharedIdentityRefresh(): Promise<string> {
  identityInFlight ??= refreshIdentity()
    .then((identityToken) => {
      setSession({ identityToken });
      return identityToken;
    })
    .finally(() => {
      identityInFlight = null;
    });
  return identityInFlight;
}

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
  //    ⚠️ Paylaşılan tazeleme: `refreshIdentityToken()` ile eşzamanlı
  //    çalışırsa TEK istek çıkar (yukarıdaki not).
  const identityToken = await sharedIdentityRefresh();

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

/**
 * YALNIZCA kimlik token'ını tazeler (refresh cookie ile) ve memory'ye yazar.
 *
 * Üç kullanım:
 * - Sayfa yenileme sonrası session bootstrap (memory sıfırlanır, cookie durur).
 * - Uzun oturumda tenant değiştirirken identity 5 dk'da dolduysa retry.
 * - ⚠️ Tenant-öncesi uçlar (`/me/memberships`, `POST /tenants`) — sayfa
 *   yenilendiğinde memory boştur ama cookie durur (`tenants.ts`).
 *
 * ⚠️ SINGLE-FLIGHT: eşzamanlı çağrılar tek isteği paylaşır (yukarıdaki not).
 * Başarısızlıkta (`refreshIdentity` içinde) session temizlenir ve fırlatır;
 * çağıran login'e yönlendirir.
 */
export function refreshIdentityToken(): Promise<string> {
  return sharedIdentityRefresh();
}
