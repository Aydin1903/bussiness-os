import { z } from 'zod';

/**
 * `GET /api/v1/audit` — degismez denetim kaydi (ADR-0043 §6, Slice 1).
 *
 * ============================================================================
 * ⚠️ BU SEMADA BIR "DEGER" ALANI YOKTUR — VE EKLENMEYECEKTIR (§6.5)
 * ============================================================================
 * `before` / `after` / `oldValue` / `newValue` / `payload`: hicbiri yok.
 * Tasinan sey yalnizca HANGI ALANIN degistigidir.
 *
 * Gerekce: ilk tuketici IK moduludur ve degisen alanlardan biri `work_phone`
 * gibi KISISEL VERIDIR — eski degerleri bir denetim tablosuna kopyalamak, KVKK
 * envanterini SESSIZCE buyutmek olurdu. Maas icin ise bilgi kaybi bile YOKTUR:
 * eski deger `hr.compensation_records` ekleme-yalniz defterinde durur (§6.2).
 *
 * ⚠️ Bu sema, sunucudaki UC AYRI AGIN dordunculusudur: tabloda deger kolonu
 * yok (`audit-log.integration.spec`), `toAuditRows` degeri tasimiyor
 * (`audit-rows.spec`), API govdesi temiz (`audit-http.integration.spec`) ve
 * burada TIP olarak da yok.
 */

const instant = z.iso.datetime({ offset: true });

/** PLATFORM fiili — modul sozlugu DEGIL. */
export const auditActionSchema = z.enum(['created', 'updated', 'deleted']);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const auditEntrySchema = z.object({
  id: z.uuid(),
  occurredAt: instant,
  /** ⚠️ `null` = SISTEM/WORKER; sahte bir kullanici UYDURULMAZ (§6.4). */
  actorUserId: z.uuid().nullable(),
  /** `<modul>.<kaynak>` — ornek: `hr.employee`. */
  resourceType: z.string(),
  resourceId: z.uuid(),
  action: auditActionSchema,
  /** ⚠️ Degisen alanin ADI — DEGERI DEGIL. `created`/`deleted` icin `null`. */
  fieldName: z.string().nullable(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditListResponseSchema = z.object({
  items: z.array(auditEntrySchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});
export type AuditListResponse = z.infer<typeof auditListResponseSchema>;
