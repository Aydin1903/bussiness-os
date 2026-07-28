import { switchTenantResponseSchema } from '@business-os/contracts';

import { apiFetch } from '../api/client';
import { getIdentityToken, setSession, type TenantId } from './session-store';
import { ApiError } from '../api/problem';

/**
 * Bir tenant seçer: `POST /auth/switch-tenant` ile tenant-scoped access token
 * üretir ve memory session store'a yazar (MT §7.4 aşama 2, ADR-0020).
 *
 * Kimlik token'ını Bearer olarak taşır (henüz access token yok). Başarıda hem
 * `accessToken` hem `currentTenantId` store'a yazılır — `currentTenantId`, 401
 * sonrası sessiz yeniden türetme için gereklidir (`api/refresh.ts`, §5.2).
 *
 * Login routing'i (tek tenant), `/select-tenant` ve `/create-tenant` bunu ortak
 * kullanır. Erişim reddi (üyelik/tenant pasif) → 403; çağıran bunu yüzeye çıkarır.
 */
export async function selectTenant(tenantId: TenantId): Promise<void> {
  const identityToken = getIdentityToken();
  if (identityToken === undefined) {
    throw new ApiError(401, undefined, 'Oturum bulunamadı. Lütfen tekrar giriş yapın.');
  }

  const result = await apiFetch('/auth/switch-tenant', switchTenantResponseSchema, {
    body: { tenantId },
    bearer: identityToken,
    noRetry: true,
  });

  setSession({ accessToken: result.accessToken, currentTenantId: tenantId });
}
