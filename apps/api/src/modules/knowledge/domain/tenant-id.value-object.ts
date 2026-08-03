import { normalizeUuidV7 } from '../../../shared/uuid-v7';

/**
 * Knowledge modulunun tenant kimligi.
 *
 * ============================================================================
 * NEDEN TENANT MODULUNDEN IMPORT EDILMIYOR
 * ============================================================================
 * ARCHITECTURE 6.1 / Mutlak Kural 6: moduller birbirinin INTERNAL kodunu import
 * edemez ve `tenant.public.ts` `TenantId`'yi disa ACMAZ. `shared/user-id`'nin
 * dosya yorumu kurali soyluyor:
 *
 *   "Public interface'lerde bu id sinirda `string` olarak gecer; VO yalnizca
 *    modul ICINDE, tip guvenligi icin kullanilir."
 *
 * Yani tenant id'si bu module `string` olarak girer (controller -> use case) ve
 * modul ICINDE kendi VO'suna sarilir. Iki modulde ayni adi tasiyan iki sinif
 * olmasi bir KOPYA degil, sinir disiplininin sonucudur — aralarinda hicbir
 * interop noktasi yoktur.
 * ============================================================================
 *
 * ⚠️ BILINEN BORC: `UserId` de Faz 2'de Tenant modulunun domain'inde dogmus,
 * ikinci modul (Identity) ihtiyac duyunca `shared/`'e tasinmisti (B10). `TenantId`
 * bugun TAM OLARAK ayni konumdadir: knowledge onu isteyen ikinci moduldur.
 * Tasima bu slice'in kapsami disidir ve dikkat ister —
 * `resolve-tenant-access.query.ts` tenant'in `InvalidTenantIdError`'ini
 * `instanceof` ile kontrol eder; sinif degisirse o kontrol SESSIZCE bozulur.
 */
export class TenantId {
  private constructor(readonly value: string) {
    // Value object'ler immutable'dir (ARCHITECTURE 4).
    Object.freeze(this);
  }

  /** Tek yaratma yolu. `new TenantId(...)` derlenmez — constructor private. */
  static create(value: string): TenantId {
    const normalized = normalizeUuidV7(value);
    if (normalized === null) {
      throw new InvalidKnowledgeTenantIdError(value);
    }
    return new TenantId(normalized);
  }

  /** Referans degil DEGER karsilastirmasi. */
  equals(other: TenantId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

/**
 * Gecersiz tenant id.
 *
 * `KnowledgeDomainError`'dan TUREMEZ: bu bir is kurali ihlali degil, bir
 * PROGRAMLAMA/sinir hatasidir — tenant id'si dogrulanmis token'dan gelir ve
 * gecersiz olmasi istemcinin uretebilecegi bir durum degildir. `code` yine de
 * sabittir ki presentation katmani mesaja bakmadan cevirebilsin.
 */
export class InvalidKnowledgeTenantIdError extends Error {
  readonly code = 'TENANT_ID_INVALID';

  constructor(value: string) {
    super(`Tenant id'si gecerli bir UUIDv7 degil: "${value}"`);
    this.name = 'InvalidKnowledgeTenantIdError';
  }
}
