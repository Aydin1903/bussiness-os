import {
  oauthProvidersResponseSchema,
  oneTapInitResponseSchema,
  oneTapResponseSchema,
  type OAuthProvidersResponse,
  type OneTapInitResponse,
} from '@business-os/contracts';

import { apiFetch } from './client';
import { apiBaseUrl } from './config';

/**
 * Sosyal giriş uçları — ADR-0053.
 *
 * ============================================================================
 * ⚠️ BU DOSYADA `fetch` İLE TOKEN DEĞİŞ TOKUŞU YOKTUR VE OLMAYACAKTIR
 * ============================================================================
 * OAuth akışı bir **tarayıcı navigasyonudur**, bir XHR değil: kullanıcı
 * sağlayıcıya GİDER ve callback ile geri DÖNER. Kimlik token'ı hiçbir noktada
 * istemci JS'ine verilmez (ADR-0053 §5) — callback refresh cookie'sini yazar,
 * `/oauth/complete` onu bir `refresh` çağrısına çevirir.
 *
 * Yani buradaki tek ağ çağrısı "hangi düğmeleri çizeyim" sorusudur.
 * ============================================================================
 */

/**
 * Yapılandırılmış sağlayıcıları getirir (ADR-0053 §9.4).
 *
 * ⚠️ `noRetry`: uç KİMLİKSİZDİR. `apiFetch`in varsayılanı 401'de token yenileyip
 * isteği tekrarlamaktır; burada 401 diye bir durum yoktur ve yenileme denemek
 * gereksiz bir `/auth/refresh` çağrısı üretirdi — üstelik giriş ekranında,
 * henüz oturumu olmayan bir kullanıcı için.
 */
export function listOAuthProviders(): Promise<OAuthProvidersResponse> {
  return apiFetch('/auth/oauth/providers', oauthProvidersResponseSchema, { noRetry: true });
}

/**
 * Bir sağlayıcının akışını BAŞLATAN adres.
 *
 * ============================================================================
 * ⚠️ NEDEN `fetch` DEĞİL DE TAM SAYFA NAVİGASYONU
 * ============================================================================
 * Bu adrese `fetch` ile gitmek İŞE YARAMAZ ve sessizce bozulurdu: uç bir
 * **302** döner ve `fetch` onu şeffafça izleyip `accounts.google.com`a giderdi
 * — CORS duvarına toslar, üstelik `state` çerezi de tarayıcının adres
 * çubuğundaki bağlama yazılmazdı.
 *
 * Doğru davranış `window.location.assign(...)`tır: kullanıcı GERÇEKTEN
 * Google'a gider, geri döndüğünde `Set-Cookie` ve `Referer` doğru bağlamda
 * olur.
 * ============================================================================
 */
export function oauthStartUrl(provider: string, next?: string): string {
  const url = new URL(`${apiBaseUrl()}/auth/oauth/${provider}/start`);

  // ⚠️ Yalnızca SİTE İÇİ göreli yollar taşınır. `//evil.example` protokole
  // göreli bir MUTLAK adrestir ve `startsWith('/')` testini geçer — sunucu da
  // ayrıca eler (`safeNext`), ama açık yönlendirmeye giden bir değeri hiç
  // göndermemek daha iyidir.
  if (next !== undefined && next.startsWith('/') && !next.startsWith('//')) {
    url.searchParams.set('next', next);
  }

  return url.toString();
}

/**
 * One Tap akisini baslatir: `nonce` + `clientId` (ADR-0053 EK-1.1).
 *
 * ⚠️ Cerezi sunucu yazar; istemci onu HIC GORMEZ (`HttpOnly`). Bu cagrinin tek
 * ciktisi GIS'i yapilandirmak icin gereken iki degerdir.
 */
export function initGoogleOneTap(provider: string): Promise<OneTapInitResponse> {
  return apiFetch(`/auth/oauth/${provider}/one-tap/init`, oneTapInitResponseSchema, {
    noRetry: true,
  });
}

/**
 * GIS `credential`ini sunucuya gonderir ve akisi tamamlar.
 *
 * ⚠️ `fetch` KULLANILIR (navigasyon DEGIL) ve bu, redirect akisindan farkli
 * olmasinin sebebidir: burada saglayiciya gitmek YOKTUR — GIS token'i zaten
 * uretti. Yanit bir govde tasir.
 *
 * ⚠️ Basarida sayfa `/oauth/complete`e yonlendirilir ki oturum kurma ve
 * ADR-0028 yonlendirmesi TEK YERDE kalsin — redirect akisiyla ayni sayfa, ayni
 * kod. Ikinci bir yonlendirme mantigi yazilsaydi ikisi ayrisabilirdi.
 */
export async function submitGoogleOneTap(credential: string): Promise<void> {
  const result = await apiFetch('/auth/oauth/google/one-tap', oneTapResponseSchema, {
    body: { credential },
    noRetry: true,
  }).catch(() => null);

  if (result === null) {
    window.location.assign('/oauth/complete?error=unavailable');
    return;
  }

  // ⚠️ D3: kod ekranina gidilir. Redirect akisinda callback bunu sunucu
  // tarafinda yapiyordu; burada istemci yapar cunku bu bir XHR'dir.
  window.location.assign(
    result.status === 'signed-in' ? '/oauth/complete?status=ok' : '/oauth/verify',
  );
}
