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

/*
 * ============================================================================
 * `knowledge:ask` KALDIRILDI — Faz 5 kapanis denetimi, 2026-08-09
 * ============================================================================
 * Bu izin `context:ask`a TASINDI (ADR-0031 §3, onaylanmis breaking change):
 * retrieval ucu `POST /knowledge/ask`tan `POST /ask`e, yani `platform/context`e
 * gecti ve orasi izni kendi katalogunda deklare ediyor
 * (`platform/context/context.permissions.ts`).
 *
 * Tasima yapildiginda buradaki deklarasyon SILINMEDI ve dokuz commit boyunca
 * kayitli kaldi. Islevsel bir hata uretmedi — hicbir uc onu istemiyordu — ama
 * izin katalogu VAR OLMAYAN bir yetenegi ilan ediyordu. Kapanis denetimi bunu
 * "olu izin" olarak buldu ve satir kaldirildi.
 *
 * ⚠️ ALINAN DERS, silinen satirdan daha degerli: bir izin BASKA BIR MODULE
 * tasindiginda, tasima ancak ESKI DEKLARASYON DA KALDIRILDIGINDA biter.
 * Registry cift kayda itiraz etmez; ikisi de sessizce kayitli kalir ve
 * katalog zamanla gercegi anlatmayi birakir.
 *
 * Rol kumesi tasima sirasinda DEGISMEDI (owner, admin, member; `viewer`
 * HARIC) ve gerekcesi `context.permissions.ts`te yasiyor: `context:ask`
 * "soru sorabilir mi", yani bir MALIYET sorusudur.
 * ============================================================================
 */

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

/**
 * `report:read` -> owner, admin, member (`viewer` HARIC).
 *
 * Rapor, notlardan TURETILMIS bir ozettir. `note:read` viewer'i disarida
 * birakirken ozetini gostermek tutarsiz olurdu: viewer'in goremedigi notlarin
 * icerigi, ozet uzerinden sizardi.
 *
 * Ayri permission (yine `note:read`'e kosulmadi): rapor bir SISTEM CIKTISIDIR,
 * notlarin kendisi degil. Ileride "kim raporu gorur" ile "kim not okur"
 * ayrisabilir — ornegin salt-rapor goren bir yonetici rolu.
 */
export const REPORT_READ = 'report:read';

export const KNOWLEDGE_PERMISSIONS: readonly PermissionRule[] = [
  { permission: NOTE_CREATE, roles: ['owner', 'admin', 'member'] },
  { permission: NOTE_READ, roles: ['owner', 'admin', 'member'] },
  { permission: REPORT_READ, roles: ['owner', 'admin', 'member'] },
];
