/**
 * Tenant modulunun domain hatalari.
 *
 * ARCHITECTURE 4: domain katmani framework bilmez — bu yuzden burada HTTP
 * durum kodu, NestJS exception'i veya RFC 7807 govdesi YOKTUR. Domain yalnizca
 * "hangi is kurali ihlal edildi" bilgisini tasir; onu HTTP'ye cevirmek
 * presentation katmaninin isidir.
 *
 * `code` alani bu ceviriyi mesaj metnine bakmadan yapilabilir kilar: mesajlar
 * degisebilir ve cevrilebilir, kodlar sabittir.
 */
export abstract class TenantDomainError extends Error {
  abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    // new.target: alt sinifin adi. Aksi halde tum hatalar "Error" olarak
    // loglanir ve stack trace'te ayirt edilemez.
    this.name = new.target.name;
  }
}

export class InvalidTenantIdError extends TenantDomainError {
  readonly code = 'TENANT_ID_INVALID';

  constructor(value: string) {
    super(`Tenant id gecerli bir UUIDv7 degil: "${value}"`);
  }
}

export class InvalidUserIdError extends TenantDomainError {
  readonly code = 'USER_ID_INVALID';

  constructor(value: string) {
    super(`Kullanici id'si gecerli bir UUIDv7 degil: "${value}"`);
  }
}

export class InvalidTenantSlugError extends TenantDomainError {
  readonly code = 'TENANT_SLUG_INVALID';

  constructor(value: string, reason: string) {
    super(`Tenant slug gecersiz ("${value}"): ${reason}`);
  }
}

export class ReservedTenantSlugError extends TenantDomainError {
  readonly code = 'TENANT_SLUG_RESERVED';

  constructor(value: string) {
    super(`"${value}" rezerve edilmis bir slug ve tenant'a atanamaz.`);
  }
}

/**
 * Slug baska bir tenant tarafindan aliniyor.
 *
 * Bu hata IKI yerden gelebilir ve ikisi de gereklidir:
 * 1. Provisioning oncesi nezaket kontrolu (`existsBySlug`) — kullaniciya erken
 *    ve anlamli geri bildirim verir.
 * 2. Veritabani unique index ihlali — GERCEK garanti budur. "Once kontrol et
 *    sonra yaz" bir yaris kosuludur; iki es zamanli kayit ayni slug'i
 *    kontrolden gecirebilir (ADR-0016).
 */
export class TenantSlugAlreadyTakenError extends TenantDomainError {
  readonly code = 'TENANT_SLUG_ALREADY_TAKEN';

  constructor(readonly slug: string) {
    super(`"${slug}" slug'i zaten kullanimda.`);
  }
}

export class InvalidTenantNameError extends TenantDomainError {
  readonly code = 'TENANT_NAME_INVALID';

  constructor(reason: string) {
    super(`Tenant adi gecersiz: ${reason}`);
  }
}

export class InvalidTenantStatusError extends TenantDomainError {
  readonly code = 'TENANT_STATUS_INVALID';

  constructor(value: string) {
    super(`"${value}" gecerli bir tenant durumu degil.`);
  }
}

export class InvalidTenantStatusTransitionError extends TenantDomainError {
  readonly code = 'TENANT_STATUS_TRANSITION_INVALID';

  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(
      `Tenant durumu "${from}" -> "${to}" gecisi tanimli degil ` +
        '(MULTI_TENANT_ARCHITECTURE 6.2).',
    );
  }
}

export class InvalidArchivedAtError extends TenantDomainError {
  readonly code = 'TENANT_ARCHIVED_AT_INVALID';

  constructor(reason: string) {
    super(`Tenant arsivleme zamani gecersiz: ${reason}`);
  }
}

/**
 * Kalici kayittan okunan tenant durumu kendi icinde tutarsiz.
 *
 * Bu hata bir KULLANICI hatasi degildir — veritabaninda olmamasi gereken bir
 * satir oldugunu soyler. Sessizce duzeltmek yerine gurultulu bicimde basarisiz
 * olmak bilinclidir: tutarsiz satiri "toparlayan" kod, veri bozulmasini aylarca
 * gizler.
 */
export class InconsistentTenantStateError extends TenantDomainError {
  readonly code = 'TENANT_STATE_INCONSISTENT';

  constructor(reason: string) {
    super(`Kalici kayittaki tenant durumu tutarsiz: ${reason}`);
  }
}

export class TenantNotModifiableError extends TenantDomainError {
  readonly code = 'TENANT_NOT_MODIFIABLE';

  constructor(readonly status: string) {
    super(`"${status}" durumundaki bir tenant'in adi veya slug'i degistirilemez.`);
  }
}

export class InvalidCreatedAtError extends TenantDomainError {
  readonly code = 'TENANT_CREATED_AT_INVALID';

  constructor(reason: string) {
    super(`Tenant olusturulma zamani gecersiz: ${reason}`);
  }
}
