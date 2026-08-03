import { Injectable } from '@nestjs/common';

import { type Permission, type PermissionRegistry, type PermissionRule } from '../authz.public';

/**
 * `PermissionRegistry`'nin bellek-ici implementasyonu (ADR-0025).
 *
 * ============================================================================
 * NEDEN BELLEK-ICI, NEDEN VERITABANI DEGIL
 * ============================================================================
 * V1'de permission'lar KODA SABITTIR (§10.1): kaynak ve fiil kumesi deploy ile
 * gelir, runtime'da uretilmez. Katalog da bu yuzden kod-zamani veridir; her
 * modul init'te kendi kaydini yapar ve harita ilk istekten once tamamlanir.
 *
 * Roller tabloya tasindiginda (ADR-0025 "yeniden gozden gecirilir"), bu harita
 * o tablonun tohum verisi olur; arayuz (`register`/`rolesFor`) degismez.
 * ============================================================================
 */
@Injectable()
export class InMemoryPermissionRegistry implements PermissionRegistry {
  readonly #rolesByPermission = new Map<Permission, readonly string[]>();

  register(rules: readonly PermissionRule[]): void {
    for (const rule of rules) {
      if (this.#rolesByPermission.has(rule.permission)) {
        // Iki modul ayni kaynagi sahiplenemez (§10.1). Sessizce ustune yazmak,
        // hangi modulun kazandigini belirsiz birakir ve yetki haritasini
        // ongorulemez kilar.
        throw new Error(`Permission zaten kayitli: "${rule.permission}"`);
      }
      this.#rolesByPermission.set(rule.permission, [...rule.roles]);
    }
  }

  rolesFor(permission: Permission): readonly string[] | undefined {
    return this.#rolesByPermission.get(permission);
  }
}
