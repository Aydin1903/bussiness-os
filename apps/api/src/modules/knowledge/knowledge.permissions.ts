import { type PermissionRule } from '../../platform/authz/authz.public';

/**
 * Knowledge modulunun DEKLARE ettigi permission katalogu (ADR-0025, §10.1).
 *
 * "Her kaynak bir module aittir; modul kendi kaynak ve fiil kumesini
 * Authorization'a deklare eder." Authorization bu satirlarin ANLAMINI bilmez.
 *
 * `note:create` -> owner, admin, member. `viewer` HARIC: viewer tanimi geregi
 * okuyandir ve kurumsal hafizaya yazmak bir KATKIDIR.
 */
export const NOTE_CREATE = 'note:create';

/**
 * `knowledge:ask` -> ayni roller (owner, admin, member; `viewer` HARIC).
 *
 * ============================================================================
 * NEDEN `note:create` YENIDEN KULLANILMADI
 * ============================================================================
 * Bugun roller AYNI — ama `note:create` bir YAZMA fiilidir ve bir okuma ucuna
 * onu kosmak ADR-0025'in `resource:action` modelini bozardi. Ileride "kim soru
 * sorabilir" ile "kim not yazabilir" ayrismak istendiginde (cok olasi: `viewer`
 * belki sorabilmeli) tek permission'i bolmek gerekirdi ve o an geriye donuk bir
 * degisiklik olurdu.
 *
 * Iki permission, bugun ayni kume — yarin bagimsiz degisebilir.
 * ============================================================================
 */
export const KNOWLEDGE_ASK = 'knowledge:ask';

/**
 * `note:read` -> bugun ayni roller (owner, admin, member; `viewer` HARIC).
 *
 * Yukaridaki gerekcenin AYNISI, bu kez daha da somut: `viewer` tanimi geregi
 * OKUYANDIR ve `note:read`'i ona vermemek gecicidir — okuma uclari olgunlastikca
 * (not listesi, arama) viewer bu izni buyuk olasilikla ALACAK. O gun geldiginde
 * degisiklik TEK SATIRDIR; oysa okuma `note:create`'e kosulmus olsaydi, viewer'a
 * okuma vermek ona YAZMA da vermek anlamina gelirdi.
 *
 * Bugun kapsami dar tutuluyor cunku bu izni kullanan tek uc onboarding'in
 * varlik kontrolu ve o da yalnizca yazabilenleri ilgilendiriyor.
 */
export const NOTE_READ = 'note:read';

export const KNOWLEDGE_PERMISSIONS: readonly PermissionRule[] = [
  { permission: NOTE_CREATE, roles: ['owner', 'admin', 'member'] },
  { permission: NOTE_READ, roles: ['owner', 'admin', 'member'] },
  { permission: KNOWLEDGE_ASK, roles: ['owner', 'admin', 'member'] },
];
