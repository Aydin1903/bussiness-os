/**
 * Identity modulunun domain hatalari.
 *
 * ARCHITECTURE 4: domain katmani framework bilmez — burada HTTP durum kodu,
 * NestJS exception'i veya RFC 7807 govdesi YOKTUR. Domain yalnizca "hangi is
 * kurali ihlal edildi" bilgisini tasir; onu HTTP'ye cevirmek presentation
 * katmaninin isidir (Tenant modulunde `tenant.error.ts` ile ayni desen).
 *
 * `code` alani bu ceviriyi mesaj metnine bakmadan yapilabilir kilar: mesajlar
 * degisebilir ve cevrilebilir, kodlar sabittir.
 */
export abstract class IdentityDomainError extends Error {
  abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    // new.target: alt sinifin adi. Aksi halde tum hatalar "Error" olarak
    // loglanir ve stack trace'te ayirt edilemez.
    this.name = new.target.name;
  }
}

export class InvalidEmailError extends IdentityDomainError {
  readonly code = 'EMAIL_INVALID';

  constructor(reason: string) {
    super(`E-posta adresi gecersiz: ${reason}`);
  }
}

/**
 * Parola hash'i gecersiz.
 *
 * ONEMLI: gecersiz DEGERI mesaja KOYMAZ. Bu hata, ham parolanin yanlislikla
 * `PasswordHash`'e verilmesi durumunda da firlar; degeri mesaja koymak, tam da
 * korumaya calistigimiz sirri (ham parola veya hash) log'a sizdirirdi
 * (AUTH_ARCHITECTURE P1, DEVELOPMENT_RULES 8).
 */
export class InvalidPasswordHashError extends IdentityDomainError {
  readonly code = 'PASSWORD_HASH_INVALID';

  constructor(reason: string) {
    super(`Parola hash'i gecersiz: ${reason}`);
  }
}

export class InvalidUserStatusError extends IdentityDomainError {
  readonly code = 'USER_STATUS_INVALID';

  constructor(value: string) {
    super(`"${value}" gecerli bir kullanici durumu degil.`);
  }
}

export class InvalidUserStatusTransitionError extends IdentityDomainError {
  readonly code = 'USER_STATUS_TRANSITION_INVALID';

  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`Kullanici durumu "${from}" -> "${to}" gecisi tanimli degil.`);
  }
}

export class InvalidUserCreatedAtError extends IdentityDomainError {
  readonly code = 'USER_CREATED_AT_INVALID';

  constructor(reason: string) {
    super(`Kullanici olusturulma zamani gecersiz: ${reason}`);
  }
}

export class InvalidPasswordChangedAtError extends IdentityDomainError {
  readonly code = 'PASSWORD_CHANGED_AT_INVALID';

  constructor(reason: string) {
    super(`Parola degisiklik zamani gecersiz: ${reason}`);
  }
}

/**
 * Kalici kayittan okunan kullanici durumu kendi icinde tutarsiz.
 *
 * Bir KULLANICI hatasi degildir — veritabaninda olmamasi gereken bir satir
 * oldugunu soyler. Sessizce duzeltmek yerine gurultulu bicimde basarisiz olmak
 * bilinclidir: tutarsiz satiri "toparlayan" kod, veri bozulmasini aylarca
 * gizler (Tenant `InconsistentTenantStateError` ile ayni gerekce).
 */
export class InconsistentUserStateError extends IdentityDomainError {
  readonly code = 'USER_STATE_INCONSISTENT';

  constructor(reason: string) {
    super(`Kalici kayittaki kullanici durumu tutarsiz: ${reason}`);
  }
}

// --- E-posta dogrulama kodu (ADR-0019) -------------------------------------

export class InvalidEmailVerificationCodeIdError extends IdentityDomainError {
  readonly code = 'EMAIL_VERIFICATION_CODE_ID_INVALID';

  constructor(value: string) {
    super(`Dogrulama kodu id'si gecerli bir UUIDv7 degil: "${value}"`);
  }
}

/**
 * Dogrulama kodu hash'i gecersiz.
 *
 * Gecersiz DEGERI mesaja KOYMAZ: bu hata, ham 6 haneli kodun yanlislikla
 * `VerificationCodeHash`'e verilmesi durumunda da firlar (AUTH_ARCHITECTURE P1).
 */
export class InvalidVerificationCodeHashError extends IdentityDomainError {
  readonly code = 'VERIFICATION_CODE_HASH_INVALID';

  constructor(reason: string) {
    super(`Dogrulama kodu hash'i gecersiz: ${reason}`);
  }
}

export class InvalidVerificationCodeExpiryError extends IdentityDomainError {
  readonly code = 'VERIFICATION_CODE_EXPIRY_INVALID';

  constructor(reason: string) {
    super(`Dogrulama kodu sona erme zamani gecersiz: ${reason}`);
  }
}

/** Tuketilmis bir kod uzerinde islem yapilmaya calisildi (tek kullanimlik). */
export class VerificationCodeAlreadyConsumedError extends IdentityDomainError {
  readonly code = 'VERIFICATION_CODE_ALREADY_CONSUMED';

  constructor() {
    super('Dogrulama kodu zaten kullanilmis; yeni bir kod istenmelidir.');
  }
}

/** Deneme hakki tukenmis bir koda yeni deneme islenmeye calisildi (§7.3). */
export class VerificationCodeExhaustedError extends IdentityDomainError {
  readonly code = 'VERIFICATION_CODE_EXHAUSTED';

  constructor() {
    super('Dogrulama kodunun deneme hakki tukendi; yeni bir kod istenmelidir.');
  }
}

export class InconsistentVerificationCodeStateError extends IdentityDomainError {
  readonly code = 'VERIFICATION_CODE_STATE_INCONSISTENT';

  constructor(reason: string) {
    super(`Kalici kayittaki dogrulama kodu durumu tutarsiz: ${reason}`);
  }
}

// --- Refresh token ve token family (ADR-0021) ------------------------------

export class InvalidTokenFamilyIdError extends IdentityDomainError {
  readonly code = 'TOKEN_FAMILY_ID_INVALID';

  constructor(value: string) {
    super(`Token ailesi id'si gecerli bir UUIDv7 degil: "${value}"`);
  }
}

export class InvalidRefreshTokenIdError extends IdentityDomainError {
  readonly code = 'REFRESH_TOKEN_ID_INVALID';

  constructor(value: string) {
    super(`Refresh token id'si gecerli bir UUIDv7 degil: "${value}"`);
  }
}

/**
 * Refresh token hash'i gecersiz. Gecersiz DEGERI mesaja KOYMAZ: bu, ham 256-bit
 * token'in yanlislikla verilmesi durumunda da firlar (AUTH_ARCHITECTURE P1).
 */
export class InvalidRefreshTokenHashError extends IdentityDomainError {
  readonly code = 'REFRESH_TOKEN_HASH_INVALID';

  constructor(reason: string) {
    super(`Refresh token hash'i gecersiz: ${reason}`);
  }
}

export class InvalidTokenFamilyRevocationReasonError extends IdentityDomainError {
  readonly code = 'TOKEN_FAMILY_REVOCATION_REASON_INVALID';

  constructor(value: string) {
    super(`"${value}" gecerli bir token ailesi iptal nedeni degil.`);
  }
}

export class InvalidTokenFamilyCreatedAtError extends IdentityDomainError {
  readonly code = 'TOKEN_FAMILY_CREATED_AT_INVALID';

  constructor(reason: string) {
    super(`Token ailesi olusturulma zamani gecersiz: ${reason}`);
  }
}

export class InvalidTokenFamilyRevokedAtError extends IdentityDomainError {
  readonly code = 'TOKEN_FAMILY_REVOKED_AT_INVALID';

  constructor(reason: string) {
    super(`Token ailesi iptal zamani gecersiz: ${reason}`);
  }
}

/** Zaten iptal edilmis bir aile yeniden iptal edilmeye calisildi (ilk iptal esastir). */
export class TokenFamilyAlreadyRevokedError extends IdentityDomainError {
  readonly code = 'TOKEN_FAMILY_ALREADY_REVOKED';

  constructor() {
    super('Token ailesi zaten iptal edilmis; ilk iptal nedeni ve zamani esastir.');
  }
}

export class InconsistentTokenFamilyStateError extends IdentityDomainError {
  readonly code = 'TOKEN_FAMILY_STATE_INCONSISTENT';

  constructor(reason: string) {
    super(`Kalici kayittaki token ailesi durumu tutarsiz: ${reason}`);
  }
}

export class InvalidRefreshTokenExpiryError extends IdentityDomainError {
  readonly code = 'REFRESH_TOKEN_EXPIRY_INVALID';

  constructor(reason: string) {
    super(`Refresh token sona erme zamani gecersiz: ${reason}`);
  }
}

export class InvalidRefreshTokenUsedAtError extends IdentityDomainError {
  readonly code = 'REFRESH_TOKEN_USED_AT_INVALID';

  constructor(reason: string) {
    super(`Refresh token kullanim zamani gecersiz: ${reason}`);
  }
}

/** Zaten kullanilmis (rotasyona ugramis) bir refresh token yeniden kullanilmaya calisildi. */
export class RefreshTokenAlreadyUsedError extends IdentityDomainError {
  readonly code = 'REFRESH_TOKEN_ALREADY_USED';

  constructor() {
    super('Refresh token zaten kullanilmis; yeniden kullanim ailenin iptalini gerektirir.');
  }
}

// --- Giris denemesi ve kaba kuvvet korumasi (ADR-0022) ---------------------

export class InvalidLoginAttemptIdError extends IdentityDomainError {
  readonly code = 'LOGIN_ATTEMPT_ID_INVALID';

  constructor(value: string) {
    super(`Giris denemesi id'si gecerli bir UUIDv7 degil: "${value}"`);
  }
}

export class InvalidIpAddressError extends IdentityDomainError {
  readonly code = 'IP_ADDRESS_INVALID';

  constructor(value: string) {
    super(`"${value}" gecerli bir IPv4 veya IPv6 adresi degil.`);
  }
}

export class InvalidLoginAttemptTimestampError extends IdentityDomainError {
  readonly code = 'LOGIN_ATTEMPT_TIMESTAMP_INVALID';

  constructor(reason: string) {
    super(`Giris denemesi zamani gecersiz: ${reason}`);
  }
}

// --- Dogrulama kodu istegi defteri (ADR-0019 7.4) -------------------------

export class InvalidVerificationCodeRequestIdError extends IdentityDomainError {
  readonly code = 'VERIFICATION_CODE_REQUEST_ID_INVALID';

  constructor(value: string) {
    super(`Dogrulama kodu istegi id'si gecerli bir UUIDv7 degil: "${value}"`);
  }
}

export class InvalidVerificationCodeRequestTimestampError extends IdentityDomainError {
  readonly code = 'VERIFICATION_CODE_REQUEST_TIMESTAMP_INVALID';

  constructor(reason: string) {
    super(`Dogrulama kodu istegi zamani gecersiz: ${reason}`);
  }
}

/**
 * Kaynak (IP) basina saatlik resend siniri asildi — 429 (ADR-0019 7.4).
 *
 * HESAP bazli sinirlarin boyle bir hatasi YOKTUR ve olmamalidir: onlar sessizce
 * atlanir (bkz. verification-resend-policy.ts). Bu hata yalnizca IP icindir ve
 * hesabin varligindan bagimsiz oldugu icin hicbir sey sizdirmaz.
 */
export class TooManyVerificationRequestsError extends IdentityDomainError {
  readonly code = 'TOO_MANY_VERIFICATION_REQUESTS';

  constructor() {
    super('Cok fazla dogrulama kodu istegi yapildi; lutfen daha sonra tekrar deneyin.');
  }
}

// --- Parola politikasi (ADR-0018) ve token (ADR-0020) ----------------------

/** Parola politikasinin hangi kural(lar)ini ihlal ettigi. */
export type PasswordPolicyViolation = 'too-short' | 'too-long' | 'missing-letter' | 'missing-digit';

/**
 * Parola ADR-0018 politikasini ihlal ediyor.
 *
 * Ihlaller ALAN BAZLI yanit icin tasinir (§16: 422 + detay). Parolanin KENDISI
 * mesaja veya listeye ASLA girmez — yalnizca ihlal KODLARI (P1).
 */
export class PasswordPolicyError extends IdentityDomainError {
  readonly code = 'PASSWORD_POLICY_VIOLATION';

  constructor(readonly violations: readonly PasswordPolicyViolation[]) {
    super(`Parola politikasi ihlali: ${violations.join(', ')}`);
  }
}

/** Bir JWT dogrulanamadi (imza, sure, kid, biçim). Cagiran taraf 401'e cevirir. */
export class InvalidTokenError extends IdentityDomainError {
  readonly code = 'TOKEN_INVALID';

  constructor(reason: string) {
    super(`Token gecersiz: ${reason}`);
  }
}

// --- Giris sonuclari (AUTH_ARCHITECTURE 9, 14.3, 16) -----------------------

/**
 * GENEL kimlik hatasi — 401.
 *
 * ============================================================================
 * DORT FARKLI SEBEP, TEK YANIT — bilincli
 * ============================================================================
 * Kullanici bulunamadi · parola yanlis · hesap kilitli (§14.3) · hesap aktif
 * degil. Dordu de AYNI hatayi uretir cunku ayirt edilebilir olmalari hesabin
 * VARLIGINI ve DURUMUNU sizdirir (P2). "Hesabiniz kilitlendi" demek, hesabin
 * var oldugunu dogrulamaktir.
 *
 * Sebep asla mesaja konmaz; ayrim yalnizca SUNUCU loglarinda yasar.
 * ============================================================================
 */
export class InvalidCredentialsError extends IdentityDomainError {
  readonly code = 'INVALID_CREDENTIALS';

  constructor() {
    super('Kimlik bilgileri gecersiz.');
  }
}

/**
 * E-posta dogrulanmamis — 403, ve bu AYIRT EDILEBILIR olmasi guvenlidir.
 *
 * Buraya ulasmak icin parola DOGRU bilinmis olmalidir (§9.1); kimligini
 * kanitlamis bir kullaniciya "e-postani dogrula" demek bilgi sizdirmaz —
 * aksine, demezsek kullanici neden giremedigini anlayamaz.
 */
export class EmailNotVerifiedError extends IdentityDomainError {
  readonly code = 'EMAIL_NOT_VERIFIED';

  constructor() {
    super('E-posta adresi henuz dogrulanmamis.');
  }
}

/** Kaynak (IP) oran siniri asildi — 429 (ADR-0022 katman 3). */
export class TooManyLoginAttemptsError extends IdentityDomainError {
  readonly code = 'TOO_MANY_LOGIN_ATTEMPTS';

  constructor() {
    super('Cok fazla giris denemesi yapildi; lutfen daha sonra tekrar deneyin.');
  }
}
