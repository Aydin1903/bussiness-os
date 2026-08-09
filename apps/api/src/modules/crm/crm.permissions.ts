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

export const OPPORTUNITY_READ = 'opportunity:read';
export const OPPORTUNITY_WRITE = 'opportunity:write';
export const OPPORTUNITY_DELETE = 'opportunity:delete';

/**
 * Gorusmeler EKLEME-YALNIZDIR: `write`/`delete` fiilleri YOKTUR.
 *
 * `note:create` ile ayni adlandirma ve ayni gerekce — var olmayan bir fiili
 * deklare etmek yanlis olurdu. Silme yalnizca sirket cascade'i uzerinden
 * gerceklesir.
 */
export const INTERACTION_READ = 'interaction:read';
export const INTERACTION_CREATE = 'interaction:create';

/**
 * Musteri ozeti URETMEK (ADR-0032 §6).
 *
 * ============================================================================
 * NEDEN AYRI BIR FIIL — `read`/`write` YETMIYORDU
 * ============================================================================
 * Ozeti OKUMAK bedavadir, URETMEK para harcar. Bu ayrim `read`/`write`
 * ikilisine sigmaz: uretmek bir sirket kaydini DEGISTIRMEZ (yani `write`
 * degildir) ama okuma da degildir.
 *
 * Somut sonucu: `viewer` ozeti OKUR, uretemez. Bir izleyicinin sayfayi
 * yenileyerek para harcayabilmesi bir butce deligi olurdu; okumasini
 * engellemek ise ozelligi ondan tamamen almak olurdu.
 */
export const COMPANY_SUMMARIZE = 'company:summarize';

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

  // `opportunity:read` AYRI bir izindir ve bu ayrim bugunden karsiligini
  // verir: "musteri listesini gorur ama anlasma tutarlarini gormez" klasik
  // bir CRM talebidir ve TEK SATIRLIK bir degisiklikle karsilanabilir.
  // Alan bazli izin (yalnizca `estimated_value`) ABAC'tir ve backlog'tadir
  // (ROADMAP §1.1) — ama kaba hali burada zaten ifade edilebilir.
  { permission: OPPORTUNITY_READ, roles: ['owner', 'admin', 'member', 'viewer'] },
  { permission: OPPORTUNITY_WRITE, roles: ['owner', 'admin', 'member'] },
  { permission: OPPORTUNITY_DELETE, roles: ['owner', 'admin'] },

  { permission: INTERACTION_READ, roles: ['owner', 'admin', 'member', 'viewer'] },
  { permission: INTERACTION_CREATE, roles: ['owner', 'admin', 'member'] },

  // Uretmek para harcar: `viewer` HARIC.
  { permission: COMPANY_SUMMARIZE, roles: ['owner', 'admin', 'member'] },
];
