import { type Permission, type PermissionRegistry } from '../authz.public';

/**
 * Yetki karar motoru — DENY-BY-DEFAULT (ADR-0025, ARCHITECTURE 10.1).
 *
 * ============================================================================
 * TEK SORU, TEK KARAR
 * ============================================================================
 * "Bu rol bu permission'i tasiyor mu?" Baska hicbir sey: kaynak semantigi,
 * tenant durumu, kayit sahipligi burada YOK. Motor yalnizca registry'ye bakar.
 *
 * DENY-BY-DEFAULT: permission KAYITLI DEGILSE cevap `false`'tur. §10.1: "izin
 * acikca verilmemisse cevap 403". Kodda karsiligi olmayan bir permission,
 * sessizce her seyi acmak yerine hicbir seyi acmaz.
 * ============================================================================
 */
export class PolicyEngine {
  constructor(private readonly registry: PermissionRegistry) {}

  /**
   * Verilen rol, verilen permission'i tasiyor mu?
   *
   * `role` tenant context'ten gelen DOGRULANMIS string'tir (her istekte
   * membership'ten cozulur, MT §11.3). Motor onu yeniden dogrulamaz.
   */
  can(role: string, permission: Permission): boolean {
    const roles = this.registry.rolesFor(permission);

    // Kayitli olmayan permission -> deny (bkz. sinif yorumu). Kayitli ama rol
    // kumede degilse -> deny.
    return roles?.includes(role) === true;
  }
}
