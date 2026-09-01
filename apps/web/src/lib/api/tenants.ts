import {
  myMembershipsResponseSchema,
  provisionTenantResponseSchema,
  type MyMembershipsResponse,
  type ProvisionTenantRequest,
  type ProvisionTenantResponse,
} from '@business-os/contracts';

import { getIdentityToken } from '../session/session-store';
import { apiFetch } from './client';
import { refreshIdentityToken } from './refresh';

/**
 * Tenant-öncesi (identity token ile çağrılan) uçlar — tenant seçimi akışı
 * (ADR-0020, ADR-0028). Hepsi memory'deki KİMLİK token'ını Bearer olarak taşır;
 * memory'de access token yoktur (henüz tenant seçilmedi).
 */

/**
 * Kimlik token'ını verir; memory boşsa refresh cookie'siyle TAZELER.
 *
 * ============================================================================
 * ⚠️ ÖNCEKİ HÂLİ SENKRON `throw` EDİYORDU — VE BU BİR SAYFAYI ÇÖKERTİYORDU
 * ============================================================================
 * Eski `requireIdentityToken()` bir `ApiError` FIRLATIYORDU ve `async`
 * olmayan `listMyMemberships()` onu **argüman konumunda** çağırıyordu. Yani
 * hata, promise kurulmadan ÖNCE, çağrının kendi satırında atılıyordu:
 *
 *   listMyMemberships().then(…).catch(…)
 *   ^^^^^^^^^^^^^^^^^^^^ burada fırlatır — `.catch` HİÇ BAĞLANMAZ
 *
 * `/select-tenant` bunu bir `useEffect` içinde çağırıyordu; senkron fırlatma
 * efektten dışarı taşıp React'e ulaşıyor ve **sayfa çöküyordu**. Sayfanın
 * kendi `.catch`'i doğru yazılmıştı ama ona sıra hiç gelmiyordu.
 *
 * ⚠️ Kusur "oturumsuz açılmıyor" gibi görünüyordu ama asıl yolu **SAYFA
 * YENİLEME**dir: memory session `sayfa yenilemede kaybolur` (FRONTEND §3.3)
 * ve `/select-tenant` üzerinde F5'e basan her kullanıcı çökmeyi görürdü.
 *
 * ============================================================================
 * ÇÖZÜM: FIRLATMA DEĞİL KURTARMA — ve deseni biz icat etmiyoruz
 * ============================================================================
 * `selectTenant()` (lib/session) tam olarak bunu zaten yapıyor:
 * `getIdentityToken() ?? (await refreshIdentityToken())`. Yani ŞİRKETİ SEÇME
 * adımı yenilemeye dayanıklıydı, ŞİRKETLERİ LİSTELEME adımı değildi — aynı
 * ekranın iki yarısı farklı davranıyordu.
 *
 * Artık ikisi de aynı: memory boşsa `HttpOnly` refresh cookie'siyle kimlik
 * tazelenir ve sayfa yenilemeden sonra ÇALIŞMAYA DEVAM EDER. Cookie de
 * yoksa/geçersizse `refreshIdentity()` session'ı temizler ve 401 ile
 * REDDEDİLEN BİR PROMISE döner — çağıran onu yakalayıp login'e yönlendirir.
 *
 * ⚠️ Bu kurtarma, `refreshIdentityToken()`in SINGLE-FLIGHT olmasını zorunlu
 * kıldı (`refresh.ts`): aksi halde bu ekranda liste yüklenirken kullanıcı bir
 * şirkete tıklarsa iki eşzamanlı yenileme çıkar, aynı refresh cookie'si iki
 * kez sunulur ve ADR-0021'in yeniden kullanım tespiti **tüm token ailesini**
 * iptal ederdi. Yani düzeltme, kendi açacağı deliği kapatmadan tamamlanmadı.
 */
async function identityBearer(): Promise<string> {
  return getIdentityToken() ?? (await refreshIdentityToken());
}

/**
 * `GET /me/memberships` — kullanıcının erişebileceği tenant'lar (ADR-0028).
 *
 * ⚠️ `async` OLMASI ŞART: gövdedeki her fırlatma böylece REDDEDİLEN BİR
 * PROMISE'e döner. `async` olmayan bir sarmalayıcıda, `await`ten önce atılan
 * hata çağıranın `.catch`'ine hiç ulaşmaz.
 */
export async function listMyMemberships(): Promise<MyMembershipsResponse> {
  return apiFetch('/me/memberships', myMembershipsResponseSchema, {
    bearer: await identityBearer(),
    noRetry: true,
  });
}

/**
 * `POST /tenants` — yeni tenant açar. V1'de `active` (kullanıma hazır) döner
 * (201, ADR-0016 V1 senkron provisioning).
 *
 * ⚠️ Aynı sebeple `async` (yukarıdaki not). Bu uçta çökme GÖRÜLMEMİŞTİ çünkü
 * çağrısı bir `async` fonksiyonun `try` bloğunun içindeydi — yani hata orada
 * yakalanıyordu. Kusur aynıydı, yalnızca **görünmüyordu**.
 */
export async function createTenant(body: ProvisionTenantRequest): Promise<ProvisionTenantResponse> {
  return apiFetch('/tenants', provisionTenantResponseSchema, {
    body,
    bearer: await identityBearer(),
    noRetry: true,
  });
}
