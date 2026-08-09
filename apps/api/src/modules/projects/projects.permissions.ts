import { type PermissionRule } from '../../platform/authz/authz.public';

/**
 * Projeler'in DEKLARE ettigi permission katalogu (ADR-0025, ADR-0033 §7).
 *
 * ============================================================================
 * KAYNAK BAZLI — `projects:read` DEGIL
 * ============================================================================
 * ADR-0025'in modeli `resource:action`'dir. `projects:read` bir MODUL iznidir,
 * kaynak izni degil; CRM'de bir kez reddedilen ayni hata olurdu.
 *
 * Somut sonucu: "gorevleri gorur ama ilerleme notlarini gormez" gercek bir
 * taleptir ve kaynaklar ayri tutuldugu icin TEK SATIRLIK bir degisiklikle
 * karsilanabilir.
 *
 * ============================================================================
 * BU SLICE YALNIZCA `project:*` DEKLARE EDER
 * ============================================================================
 * `task:*` (Slice 2) ve `progress_note:*` (Slice 3) BURADA YOK. Var olmayan bir
 * fiili deklare etmek yanlis olurdu — `interaction:create`in `write` yerine
 * secilmesindeki ayni gerekce. Katalog uctan ONCE degil, ucla BIRLIKTE buyur.
 * ============================================================================
 */

export const PROJECT_READ = 'project:read';
export const PROJECT_WRITE = 'project:write';
export const PROJECT_DELETE = 'project:delete';

/**
 * ============================================================================
 * `delete` NEDEN `write`'TAN AYRI
 * ============================================================================
 * Silme GERI ALINAMAZ ve (Slice 3'ten itibaren) AI HAFIZASINDAN DA siler —
 * ilerleme notlari ve embedding'ler cascade ile gider. "Bir gorev acabilir ve
 * projeyi ilerletebilir" ile "bir projeyi silebilir" farkli yetkilerdir.
 * Bedeli tek bir string.
 *
 * ============================================================================
 * `viewer` OKUMA ALIR
 * ============================================================================
 * CRM'de cizilen cizgi (ADR-0031 §6) burada TEKRARLANIYOR, yeniden
 * tartisilmiyor: bir izleyicinin sirketin isini gormesi tanimi geregi isidir.
 * Knowledge'in `note:read` satiri hala ayri bir karardir ve degistirilmedi.
 * ============================================================================
 */
export const PROJECTS_PERMISSIONS: readonly PermissionRule[] = [
  { permission: PROJECT_READ, roles: ['owner', 'admin', 'member', 'viewer'] },
  { permission: PROJECT_WRITE, roles: ['owner', 'admin', 'member'] },
  { permission: PROJECT_DELETE, roles: ['owner', 'admin'] },
];
