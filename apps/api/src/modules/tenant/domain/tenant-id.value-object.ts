import { InvalidTenantIdError } from './tenant.error';
import { normalizeUuidV7 } from './uuid-v7';

/**
 * Tenant'in kalici teknik kimligi (MULTI_TENANT_ARCHITECTURE 6.1).
 *
 * Bu deger sistemdeki en kritik anahtardir: RLS politikasi bunun uzerinden
 * calisir, JWT claim'i bunu tasir ve tum foreign key'ler buna isaret eder.
 * ASLA degismez.
 *
 * Neden `string` degil de value object: DEVELOPMENT_RULES 2.4. Iki ciplak
 * string parametresi yer degistirdiginde derleyici susar; iki farkli value
 * object yer degistirdiginde derlenmez. Tenant id'sinin yanlis yere gitmesi,
 * bu sistemde tanimi geregi bir izolasyon hatasidir.
 */
export class TenantId {
  private constructor(readonly value: string) {
    // Nesne bir kez kuruldu mu degistirilemez: value object'ler immutable'dir
    // (ARCHITECTURE 4).
    Object.freeze(this);
  }

  /**
   * Tek yaratma yolu. `new TenantId(...)` derlenmez — constructor private.
   * Gecersiz bir id tasiyan nesne bu yuzden var olamaz.
   */
  static create(value: string): TenantId {
    const normalized = normalizeUuidV7(value);
    if (normalized === null) {
      throw new InvalidTenantIdError(value);
    }
    return new TenantId(normalized);
  }

  /**
   * Referans degil DEGER karsilastirmasi. Iki ayri nesne ayni id'yi
   * tasiyorsa esittir.
   */
  equals(other: TenantId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
