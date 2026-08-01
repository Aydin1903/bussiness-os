import { refreshIdentityToken } from '../api/refresh';
import { getLastTenant } from './last-tenant';
import { selectTenant } from './select-tenant';
import { getAccessToken, getIdentityToken } from './session-store';

/**
 * App shell yüklenirken oturumu memory'de yeniden kurar (§2 reload senaryosu).
 *
 * Sayfa yenilemede identity/access token ve `currentTenantId` (hepsi memory)
 * kaybolur; ama `HttpOnly` refresh cookie ve `bo_last_tenant` durur. Bu fonksiyon:
 *   1. Access token zaten varsa (oturum-içi navigasyon) → hazır.
 *   2. Yoksa: refresh cookie'siyle kimlik token'ını tazele; `bo_last_tenant`
 *      varsa o tenant'a geç (access token + currentTenantId kurulur).
 *
 * Döner: `true` = oturum hazır, `false` = kurulamadı → çağıran login'e gitmeli.
 */
export async function bootstrapSession(): Promise<boolean> {
  if (getAccessToken() !== undefined) {
    return true;
  }

  try {
    if (getIdentityToken() === undefined) {
      await refreshIdentityToken();
    }

    const last = getLastTenant();
    if (last !== undefined) {
      // Son tenant artık erişilemezse (üyelik/tenant pasif) sessizce geç:
      // kullanıcı geçerli bir kimlik oturumuna sahiptir, switcher'dan seçer.
      await selectTenant(last).catch(() => undefined);
    }

    return true;
  } catch {
    return false;
  }
}
