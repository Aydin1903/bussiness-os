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

/** DI token'i — guard DISINDA izin sormak icin (ADR-0031 §5.3). */
export const PERMISSION_CHECKER = Symbol('PERMISSION_CHECKER');

/**
 * Guard'in kullandigi AYNI karar motorunun dar, disa acik yuzu.
 *
 * ============================================================================
 * NEDEN GEREKLI — guard her zaman yeterli DEGIL
 * ============================================================================
 * `@RequirePermission` bir UC NOKTAYI korur: "bu istegi yapabilir misin".
 * `POST /ask`'te ise soru daha incedir — istek MESRUDUR (`context:ask` vardir)
 * ama cevaba HANGI KAYNAKLARIN girebilecegi cagirana gore degisir. Bu karar
 * istek basina bir kez degil, KATKICI BASINA verilir ve bir decorator ile
 * ifade edilemez.
 *
 * Filtre olmasaydi birlesik hafiza, yetkilendirmeyi delen bir YAN KAPI olurdu:
 * kullanici goremedigi bir kaydin icerigini, o kaydi ozetleyen bir cevap
 * uzerinden okurdu. RLS bunu YAKALAMAZ — RLS tenant sinirini korur, tenant
 * ICINDEKI izin sinirini degil.
 *
 * ============================================================================
 * IKINCI BIR KARAR YOLU ACILMIYOR
 * ============================================================================
 * Bu arayuz `PolicyEngine`'in ta kendisine cozulur; yeni bir kural kaynagi ya
 * da yeni bir degerlendirme mantigi DEGILDIR. ADR-0025'in "karar tek yerde
 * verilir" ilkesi korunur; degisen yalnizca kararin SORULABILDIGI yerdir.
 *
 * Yuzey bilerek TEK METOTLUK tutuldu: katalog okuma, rol listeleme veya
 * permission numaralandirma disa ACILMAZ — onlar Authorization'in ic isidir.
 * ============================================================================
 */
export interface PermissionChecker {
  /** Verilen rol bu permission'i tasiyor mu? Kayitli degilse `false`. */
  can(role: string, permission: Permission): boolean;
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
