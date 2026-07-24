import { SetMetadata } from '@nestjs/common';

/**
 * Authorization modulunun DISA ACIK yuzeyi (ADR-0025, ARCHITECTURE 10.1).
 *
 * ============================================================================
 * AUTHORIZATION IS MODULLERINI BILMEZ
 * ============================================================================
 * §10.1: her kaynak bir module aittir ve modul, kendi permission'larini
 * Authorization'a DEKLARE eder. Bu dosya o deklarasyonun tipini ve kayit
 * kanalini tasir; Authorization `member`/`invoice`/`document` gibi kaynaklarin
 * ANLAMINI bilmez — yalnizca "bu rol bu permission'in izinli kumesinde mi"
 * sorusunu yanitlar.
 *
 * Roller ILKEL string'dir, `MembershipRole` value object'i DEGIL: Authorization
 * rollerin nerede tanimlandigini da bilmemelidir. Tenant context'ten gelen rol
 * string'i ile katalogdaki string eslesir; baska bir bagimlilik yoktur.
 * ============================================================================
 */

/** `resource:action` — atomik izin (§10.1). Ornek: `member:read`. */
export type Permission = string;

/**
 * Bir permission'i HANGI rollerin tasidigini soyleyen kayit.
 *
 * Kaynagin sahibi modul deklare eder; Authorization toplar. Roller string'dir
 * (bkz. dosya yorumu).
 */
export interface PermissionRule {
  readonly permission: Permission;
  readonly roles: readonly string[];
}

/** DI token'i — modullerin katalog kaydettigi ve guard'in okudugu registry. */
export const PERMISSION_REGISTRY = Symbol('PERMISSION_REGISTRY');

export interface PermissionRegistry {
  /**
   * Bir modulun permission katalogunu kaydeder. Cagrilma sirasi onemsizdir:
   * kayit modul init'te, ilk istekten ONCE tamamlanir.
   *
   * AYNI permission'in iki kez kaydi bir PROGRAMLAMA hatasidir (iki modul ayni
   * kaynagi sahiplenemez) ve sessizce yutulmaz.
   */
  register(rules: readonly PermissionRule[]): void;

  /** Permission'i tasiyan roller; permission KAYITLI DEGILSE `undefined`. */
  rolesFor(permission: Permission): readonly string[] | undefined;
}

/** `@RequirePermission` metadata anahtari. Guard bunu okur. */
export const PERMISSION_METADATA_KEY = 'authz:required-permission';

/**
 * Bir endpoint'in gerektirdigi permission'i DEKLARE eder (§10.1: karar merkezi,
 * controller'da dagitik `if` yasak).
 *
 * Isaretlenmeyen endpoint guard'a takilmaz. Isaretlenen endpoint icin karar
 * `PermissionGuard`'ta, tek yerde verilir.
 */
export const RequirePermission = (permission: Permission): MethodDecorator =>
  SetMetadata(PERMISSION_METADATA_KEY, permission);
