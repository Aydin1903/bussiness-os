import { type PermissionRule } from '../../platform/authz/authz.public';

/**
 * Tenant modulunun DEKLARE ettigi permission katalogu (ADR-0025, §10.1).
 *
 * "Her kaynak bir module aittir; modul kendi kaynak ve fiil kumesini
 * Authorization'a deklare eder." Bu dosya tenant modulunun o deklarasyonudur;
 * `TenantModule` init'te `PERMISSION_REGISTRY.register(TENANT_PERMISSIONS)` ile
 * kaydeder. Authorization bu satirlarin ANLAMINI bilmez, yalnizca saklar.
 *
 * Roller sabit sistem rolleridir (ADR-0014/0025). `member:read`, roster'i bir
 * YONETIM bilgisi sayar: yalnizca `owner` ve `admin` tum ekibi gorebilir.
 */
export const MEMBER_READ = 'member:read';

export const TENANT_PERMISSIONS: readonly PermissionRule[] = [
  { permission: MEMBER_READ, roles: ['owner', 'admin'] },
];
