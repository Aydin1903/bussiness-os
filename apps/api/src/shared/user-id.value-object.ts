import { normalizeUuidV7 } from './uuid-v7';

/**
 * Bir kullanicinin kimligi — kernel value object'i.
 *
 * ADR-0014: kimlik GLOBALDIR — kullanici bir tenant'a ait degildir, tenant'lar
 * arasinda paylasilir. Bu yuzden `UserId` tek bir modulun mulku degildir:
 * Identity (User aggregate'inin sahibi) ve Tenant (`ownerUserId`,
 * `Membership.userId`) ayni kavrama referans verir. Iki modulun de kendi
 * kopyasini tasimasi yerine kernel'de tek bir tanim yasar; boylece `equals`
 * moduller arasi tutarli calisir.
 *
 * Faz 2'de bu tip Tenant modulunun domain'inde dogmustu ve tasinmasi bilincli
 * bir teknik borctu (B10); Identity modulu geldiginde bu borc kapatildi ve tip
 * `shared/`'e alindi.
 *
 * ARCHITECTURE 6.1: moduller arasi referans daima id ile tutulur, cross-schema
 * foreign key kurulmaz. Public interface'lerde bu id sinirda `string` olarak
 * gecer; VO yalnizca modul ICINDE, tip guvenligi icin kullanilir.
 */
export class UserId {
  private constructor(readonly value: string) {
    // Nesne bir kez kuruldu mu degistirilemez: value object'ler immutable'dir
    // (ARCHITECTURE 4).
    Object.freeze(this);
  }

  /**
   * Tek yaratma yolu. `new UserId(...)` derlenmez — constructor private.
   * Gecersiz bir id tasiyan nesne bu yuzden var olamaz.
   */
  static create(value: string): UserId {
    const normalized = normalizeUuidV7(value);
    if (normalized === null) {
      throw new InvalidUserIdError(value);
    }
    return new UserId(normalized);
  }

  /**
   * Referans degil DEGER karsilastirmasi. Iki ayri nesne ayni id'yi tasiyorsa
   * esittir.
   */
  equals(other: UserId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

/**
 * `UserId.create` gecersiz bir deger aldiginda firlatir.
 *
 * `shared/`'te yasadigi icin herhangi bir modulun domain hata tabanina
 * (ornegin `TenantDomainError`) bagli DEGILDIR — kernel hicbir module bagimli
 * olamaz. `code` alani, presentation katmaninin hatayi mesaj metnine bakmadan
 * HTTP durumuna cevirebilmesi icin sabittir.
 */
export class InvalidUserIdError extends Error {
  readonly code = 'USER_ID_INVALID';

  constructor(value: string) {
    super(`Kullanici id'si gecerli bir UUIDv7 degil: "${value}"`);
    this.name = 'InvalidUserIdError';
  }
}
