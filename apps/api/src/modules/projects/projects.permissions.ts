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
 * KATALOG UCLA BIRLIKTE BUYUR
 * ============================================================================
 * `progress_note:*` (Slice 3) HENUZ BURADA YOK. Var olmayan bir fiili deklare
 * etmek yanlis olurdu — `interaction:create`in `write` yerine secilmesindeki
 * ayni gerekce. `task:*` bu slice'ta uclariyla BIRLIKTE geldi.
 * ============================================================================
 */

export const PROJECT_READ = 'project:read';
export const PROJECT_WRITE = 'project:write';
export const PROJECT_DELETE = 'project:delete';

/**
 * Gorev izinleri (ADR-0033 §7).
 *
 * ⚠️ `task:delete` VAR — `interaction`da YOKTU. Gorusme bir GUNLUK kaydidir
 * (ekleme-yalniz); gorev ise YASAYAN bir is kalemidir ve yanlis acilmis bir
 * gorev silinebilmelidir. Ayrimin somut sonucu: gorev `write` ve `delete`
 * fiillerinin ikisini de tasir, `interaction` yalnizca `create` tasiyordu.
 */
export const TASK_READ = 'task:read';
export const TASK_WRITE = 'task:write';
export const TASK_DELETE = 'task:delete';

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

  // ⚠️ `task:write` KENDI GOREVI ile BASKASININ GOREVI arasinda ayrim YAPMAZ:
  // `member` herkesin gorevini duzenleyebilir ve herkese atama yapabilir.
  // "Yalnizca kendi gorevlerim" bir ABAC kuralidir ve backlog'tadir
  // (ROADMAP §1.1) — `resource:action` modeli o katmanin altina bozulmadan
  // girecek sekilde tasarlandi (ARCHITECTURE §10.1).
  { permission: TASK_READ, roles: ['owner', 'admin', 'member', 'viewer'] },
  { permission: TASK_WRITE, roles: ['owner', 'admin', 'member'] },
  { permission: TASK_DELETE, roles: ['owner', 'admin'] },
];
