import { switchTenantResponseSchema } from '@business-os/contracts';

import { apiFetch } from '../api/client';
import { ApiError } from '../api/problem';
import { refreshIdentityToken } from '../api/refresh';
import { setLastTenant } from './last-tenant';
import { setSession, getIdentityToken, type TenantId } from './session-store';

/**
 * Bir tenant seçer: `POST /auth/switch-tenant` ile tenant-scoped access token
 * üretir ve memory session store'a yazar (MT §7.4 aşama 2, ADR-0020).
 *
 * ============================================================================
 * DAYANIKLILIK — iki gerçek senaryo (Dashboard)
 * ============================================================================
 * 1. Kimlik token'ı YOK (sayfa yenilendi, memory sıfırlandı): refresh
 *    cookie'siyle tazelenir.
 * 2. Kimlik token'ı DOLDU (5 dk, uzun oturum): `switch-tenant` 401 verir →
 *    tazele + TEK retry.
 * Bu ikisi olmadan seçici yalnızca "girişten hemen sonra" çalışırdı.
 *
 * Başarıda `bo_last_tenant` yazılır: reload sonrası son şirkete sorunsuz dönüş.
 * Erişim reddi (üyelik/tenant pasif) → 403; çağıran bunu yüzeye çıkarır.
 * ============================================================================
 */
export async function selectTenant(tenantId: TenantId): Promise<void> {
  const identityToken = getIdentityToken() ?? (await refreshIdentityToken());

  try {
    await doSwitch(tenantId, identityToken);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // Kimlik token'ı dolmuş; tazele ve bir kez daha dene.
      await doSwitch(tenantId, await refreshIdentityToken());
      return;
    }
    throw error;
  }
}

async function doSwitch(tenantId: TenantId, identityToken: string): Promise<void> {
  const result = await apiFetch('/auth/switch-tenant', switchTenantResponseSchema, {
    body: { tenantId },
    bearer: identityToken,
    noRetry: true,
  });

  setSession({ accessToken: result.accessToken, currentTenantId: tenantId });
  setLastTenant(tenantId);
}
