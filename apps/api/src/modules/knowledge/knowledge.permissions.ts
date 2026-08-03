import { type PermissionRule } from '../../platform/authz/authz.public';

/**
 * Knowledge modulunun DEKLARE ettigi permission katalogu (ADR-0025, §10.1).
 *
 * "Her kaynak bir module aittir; modul kendi kaynak ve fiil kumesini
 * Authorization'a deklare eder." Authorization bu satirlarin ANLAMINI bilmez.
 *
 * `note:create` -> owner, admin, member. `viewer` HARIC: viewer tanimi geregi
 * okuyandir ve kurumsal hafizaya yazmak bir KATKIDIR. Okuma permission'lari
 * (`note:read`) kendi slice'inda eklenecek.
 */
export const NOTE_CREATE = 'note:create';

export const KNOWLEDGE_PERMISSIONS: readonly PermissionRule[] = [
  { permission: NOTE_CREATE, roles: ['owner', 'admin', 'member'] },
];
