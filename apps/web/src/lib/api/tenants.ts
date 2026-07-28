import {
  myMembershipsResponseSchema,
  provisionTenantResponseSchema,
  type MyMembershipsResponse,
  type ProvisionTenantRequest,
  type ProvisionTenantResponse,
} from '@business-os/contracts';

import { getIdentityToken } from '../session/session-store';
import { apiFetch } from './client';
import { ApiError } from './problem';

/**
 * Tenant-öncesi (identity token ile çağrılan) uçlar — tenant seçimi akışı
 * (ADR-0020, ADR-0028). Hepsi memory'deki KİMLİK token'ını Bearer olarak taşır;
 * memory'de access token yoktur (henüz tenant seçilmedi).
 */

/** Kimlik token'ını memory'den okur; yoksa oturum düşmüştür → login'e. */
function requireIdentityToken(): string {
  const token = getIdentityToken();
  if (token === undefined) {
    throw new ApiError(401, undefined, 'Oturum bulunamadı. Lütfen tekrar giriş yapın.');
  }
  return token;
}

/** `GET /me/memberships` — kullanıcının erişebileceği tenant'lar (ADR-0028). */
export function listMyMemberships(): Promise<MyMembershipsResponse> {
  return apiFetch('/me/memberships', myMembershipsResponseSchema, {
    bearer: requireIdentityToken(),
    noRetry: true,
  });
}

/**
 * `POST /tenants` — yeni tenant açar. V1'de `active` (kullanıma hazır) döner
 * (201, ADR-0016 V1 senkron provisioning).
 */
export function createTenant(body: ProvisionTenantRequest): Promise<ProvisionTenantResponse> {
  return apiFetch('/tenants', provisionTenantResponseSchema, {
    body,
    bearer: requireIdentityToken(),
    noRetry: true,
  });
}
