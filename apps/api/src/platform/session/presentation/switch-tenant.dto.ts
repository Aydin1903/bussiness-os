import { z } from 'zod';

/**
 * `POST /api/v1/auth/switch-tenant` istek govdesi.
 *
 * DEVELOPMENT_RULES 2.3: sisteme giren HER dis veri Zod ile dogrulanir.
 *
 * ============================================================================
 * BURADA YALNIZCA `tenantId` VAR — ve baska HICBIR KIMLIK ALANI OLMAZ
 * ============================================================================
 * `userId` / `sessionId` govdeden ALINMAZ: ikisi de DOGRULANMIS kimlik
 * token'indan gelir (DEVELOPMENT_RULES 4.5). Istemcinin kendi kullanicisini veya
 * oturumunu bildirmesine izin vermek, baskasi adina token almasina kapi acardi.
 *
 * `tenantId`'nin BICIMI burada zorlanmaz (UUID kontrolu yok): bicimsel olarak
 * bozuk bir tenantId, var olmayan bir tenant ile AYNI 403'e dusmelidir
 * (tenant.public.ts: olmayan tenant'i var olandan ayirt ettirmemek). Bicim
 * kontrolu, "bu tenant yok" ile "bu tenantId gecersiz"i ayirt eden bir oracle
 * olurdu; karar `resolveMemberAccess`'e birakilir (fail closed).
 * ============================================================================
 */
const tenantId = z.string().trim().min(1, 'tenantId bos olamaz').max(64, 'tenantId cok uzun');

export const switchTenantSchema = z.object({ tenantId }).strict();

export type SwitchTenantBody = z.infer<typeof switchTenantSchema>;
