import { z } from 'zod';

/**
 * `POST /api/v1/tenants` — tenant olusturma (api ↔ web paylasimi).
 *
 * Backend `provision-tenant.dto.ts`'i YANSITIR (transport seviyesi). Slug/ad
 * bicim kurallarinin TEK dogruluk kaynagi domain value object'leridir; buradaki
 * kontroller istemciye erken, anlamli geri bildirim icindir. `ownerUserId`
 * BULUNMAZ — sahip dogrulanmis token'dan gelir (guvenlik karari).
 */
export const provisionTenantRequestSchema = z
  .object({
    name: z.string().trim().min(1, 'Tenant adı boş olamaz').max(200, 'En fazla 200 karakter'),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2, 'Slug en az 2 karakter olmalı')
      .max(63, 'Slug en fazla 63 karakter olabilir'),
  })
  .strict();
export type ProvisionTenantRequest = z.infer<typeof provisionTenantRequestSchema>;

/**
 * `POST /tenants` yaniti — V1'de tenant `active` (kullanima hazir) doner
 * (ADR-0016 V1 senkron provisioning notu). `201 Created`.
 */
export const provisionTenantResponseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: z.string(),
});
export type ProvisionTenantResponse = z.infer<typeof provisionTenantResponseSchema>;
