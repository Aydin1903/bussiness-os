import { type PermissionRule } from '../../platform/authz/authz.public';

/**
 * CRM'in DEKLARE ettigi permission katalogu (ADR-0025, ADR-0031 §6).
 *
 * ============================================================================
 * KAYNAK BAZLI — `crm:read` DEGIL
 * ============================================================================
 * ADR-0025'in modeli `resource:action`'dir. `crm:read` bir MODUL iznidir,
 * kaynak izni degil; modeli ILK KULLANIMDA bozardi.
 *
 * Somut sonucu: "musteri listesini gorur ama anlasma tutarlarini gormez"
 * klasik ve gercek bir CRM talebidir. `opportunity:read` AYRI bir izin oldugu
 * icin (Slice 5) o talep TEK SATIRLIK bir degisiklikle karsilanabilir. Tek bir
 * `crm:read` olsaydi, hattı gizlemek musteri listesini de gizlerdi.
 * ============================================================================
 */

export const COMPANY_READ = 'company:read';
export const COMPANY_WRITE = 'company:write';
export const COMPANY_DELETE = 'company:delete';

export const CONTACT_READ = 'contact:read';
export const CONTACT_WRITE = 'contact:write';
export const CONTACT_DELETE = 'contact:delete';

/**
 * ============================================================================
 * `delete` NEDEN `write`'TAN AYRI
 * ============================================================================
 * Silme GERI ALINAMAZ ve (Slice 6'dan itibaren) AI HAFIZASINDAN DA siler —
 * gorusmeler ve embedding'ler cascade ile gider. "Bir gorusme kaydedebilir ve
 * firsati ilerletebilir" ile "bir musteriyi silebilir" farkli yetkilerdir;
 * gercek CRM rol tasarimi da boyle ayirir. Bedeli tek bir string.
 *
 * ============================================================================
 * `viewer` OKUMA ALIR — Knowledge'dan BILINCLI SAPMA
 * ============================================================================
 * ADR-0029'da `note:read` viewer'a verilmemisti ve `knowledge.permissions.ts`
 * bunun GECICI oldugunu, okuma uclari olgunlastikca viewer'in izni muhtemelen
 * ALACAGINI zaten yaziyor.
 *
 * CRM'de musteri listesini gormek viewer'in TANIMI GEREGI isidir. Sapma
 * bilinclidir ve burada kayda geciyor; Knowledge'in `note:read` satiri
 * DEGISTIRILMEDI (o ayri bir karar).
 * ============================================================================
 */
export const CRM_PERMISSIONS: readonly PermissionRule[] = [
  { permission: COMPANY_READ, roles: ['owner', 'admin', 'member', 'viewer'] },
  { permission: COMPANY_WRITE, roles: ['owner', 'admin', 'member'] },
  { permission: COMPANY_DELETE, roles: ['owner', 'admin'] },

  { permission: CONTACT_READ, roles: ['owner', 'admin', 'member', 'viewer'] },
  { permission: CONTACT_WRITE, roles: ['owner', 'admin', 'member'] },
  { permission: CONTACT_DELETE, roles: ['owner', 'admin'] },
];
