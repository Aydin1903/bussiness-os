import { auditListResponseSchema, type AuditListResponse } from '@business-os/contracts';

import { apiFetch } from './client';

/**
 * Denetim kaydı okuma (ADR-0043 §6.4) — PLATFORM ucu.
 *
 * ⚠️ `audit:read` DAR bir izindir (owner + admin). Bu fonksiyon yalnızca
 * `canReadAudit(role)` doğruyken çağrılır — izinsiz kullanıcı için istek HİÇ
 * YAPILMAZ (`lib/config/hr.ts`).
 *
 * ⚠️ YAZMA FONKSİYONU YOKTUR ve olmayacaktır: denetim kaydını bir KULLANICI
 * yazmaz, bir DEĞİŞİKLİK yazar — yol, değişikliği yapan modülün kendi
 * transaction'ı içindedir. Bir HTTP yazma ucu, denetim kaydını değişiklikten
 * AYIRIR, yani UYDURULABİLİR yapardı.
 */
export function listAuditEntries(params: {
  resourceType: string;
  resourceId: string;
  limit: number;
}): Promise<AuditListResponse> {
  const search = new URLSearchParams({
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    limit: String(params.limit),
  });

  return apiFetch(`/audit?${search.toString()}`, auditListResponseSchema);
}
