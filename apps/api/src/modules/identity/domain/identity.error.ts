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

// --- Parola sifirlama kodu (ADR-0024) --------------------------------------
//
// Kod MEKANIGI (sona erme, tuketim, tukenme, tutarlilik) yukaridaki dogrulama
// kodu hatalariyla AYNIDIR ve yeniden kullanilir — reset entity onlari firlatir.
// Yalnizca kimlik tipi farklidir, o yuzden tek yeni hata:

export class InvalidPasswordResetCodeIdError extends IdentityDomainError {
  readonly code = 'PASSWORD_RESET_CODE_ID_INVALID';

  constructor(value: string) {
    super(`Parola sifirlama kodu id'si gecerli bir UUIDv7 degil: "${value}"`);
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

// ============================================================================
// SOSYAL GIRIS (OAuth) — ADR-0053
// ============================================================================

/** `FederatedIdentityId.create` gecersiz bir deger aldiginda. */
export class InvalidFederatedIdentityIdError extends IdentityDomainError {
  readonly code = 'FEDERATED_IDENTITY_ID_INVALID';

  constructor(value: string) {
    super(`Baglanti id'si gecerli bir UUIDv7 degil: "${value}"`);
  }
}

/**
 * Saglayicinin `sub` degeri anlamsiz.
 *
 * ⚠️ DEGERI mesaja KOYMAZ: `sub` kisisel veri sayilabilecek bir tanimlayicidir
 * ve bu mesaj log'a duser (P1, DEVELOPMENT_RULES 8).
 */
export class InvalidProviderSubjectError extends IdentityDomainError {
  readonly code = 'PROVIDER_SUBJECT_INVALID';

  constructor(reason: string) {
    super(`Saglayici kimligi gecersiz: ${reason}`);
  }
}

/** Baglantinin zaman damgasi `Invalid Date`. Ic tutarsizlik — 500. */
export class InvalidFederatedIdentityTimestampError extends IdentityDomainError {
  readonly code = 'FEDERATED_IDENTITY_TIMESTAMP_INVALID';

  constructor(field: string) {
    super(`Baglanti zaman damgasi gecerli bir tarih degil: ${field}`);
  }
}

/** Bilinmeyen ya da YAPILANDIRILMAMIS saglayici — 404 (ADR-0053 §3.3). */
export class OAuthProviderNotConfiguredError extends IdentityDomainError {
  readonly code = 'OAUTH_PROVIDER_NOT_CONFIGURED';

  constructor() {
    super('Bu saglayici ile giris su anda kullanilamiyor.');
  }
}

/**
 * State/PKCE cerezi yok, suresi dolmus, imzasi gecersiz ya da sorgudaki
 * `state` ile eslesmiyor — 400.
 *
 * ⚠️ DORT SEBEP DE AYNI HATAYA DUSER ve bu bilinclidir: hangisinin
 * gerceklestigini soylemek, CSRF denemesi yapan bir saldirgana hangi
 * parcasinin tuttugunu ogretirdi (P2 ile ayni disiplin).
 */
export class OAuthStateInvalidError extends IdentityDomainError {
  readonly code = 'OAUTH_STATE_INVALID';

  constructor() {
    super('Giris oturumu gecersiz ya da zaman asimina ugradi. Lutfen tekrar deneyin.');
  }
}

/**
 * Saglayici tarafinda ariza: token exchange basarisiz, ID token dogrulanamadi
 * (imza/`iss`/`aud`/`exp`/`nonce`) ya da userinfo cagrisi coktu — 502.
 *
 * ⚠️ `DisclosableProblem` ISARETI ALIR (ADR-0053 §12): kullanici "tekrar
 * deneyin" ile "beklenmeyen hata" arasindaki farki gormeli. Maskelenirse
 * tekrar denemesi gerektigini OGRENEMEZ.
 *
 * ⚠️ Saglayicinin HAM hata metni bu mesaja KONMAZ — ic detay tasiyabilir.
 */
export class OAuthProviderFailedError extends IdentityDomainError {
  readonly code = 'OAUTH_PROVIDER_FAILED';

  constructor() {
    super('Saglayici ile iletisim kurulamadi. Lutfen tekrar deneyin.');
  }
}

/**
 * Saglayici HIC e-posta vermedi — 400.
 *
 * ⚠️ BU BIR D3 DURUMU DEGILDIR ve ayrim implementasyonda netlesti: D3, kendi
 * 6 haneli kodumuzu bir adrese gondermeye dayanir; ADRES YOKSA gonderilecek
 * yer de yoktur. `platform.users.email` `NOT NULL`dur ve kimligin bizim
 * tarafimizdaki capasidir (`EmailPort` oraya yazar).
 *
 * Telafi kullaniciya soylenir: saglayicida e-posta paylasimina izin vermek ya
 * da parolayla kaydolmak.
 */
export class OAuthEmailUnavailableError extends IdentityDomainError {
  readonly code = 'OAUTH_EMAIL_UNAVAILABLE';

  constructor() {
    super(
      'Saglayici bir e-posta adresi paylasmadi; bu hesapla giris yapilamiyor. ' +
        'Saglayicida e-posta paylasimina izin verin ya da e-posta ve parolayla kaydolun.',
    );
  }
}

/**
 * Ayni saglayici hesabi baska bir kullaniciya baglanmaya calisildi ya da
 * kullanicinin bu saglayicida zaten bir hesabi var — 409.
 *
 * ⚠️ Normal akista ULASILAMAZ (D1 once kontrol edilir); bu, IKI ES ZAMANLI
 * callback'in ayni anda baglamaya calismasindaki YARIS DURUMUDUR ve tekillik
 * index'i onu veritabaninda keser. Yakalanmasaydi kullanici islenmemis bir
 * 500 gorurdu.
 */
export class FederatedIdentityConflictError extends IdentityDomainError {
  readonly code = 'FEDERATED_IDENTITY_CONFLICT';

  constructor() {
    super('Bu hesap baglantisi zaten mevcut.');
  }
}

/** Kaldirilmak istenen baglanti yok — 404. */
export class FederatedIdentityNotFoundError extends IdentityDomainError {
  readonly code = 'FEDERATED_IDENTITY_NOT_FOUND';

  constructor() {
    super('Bu saglayici hesabinizla bagli degil.');
  }
}

/**
 * Hesaptaki SON giris yontemi kaldirilmak istendi — 409 (ADR-0053 §4.4).
 *
 * ⚠️ Burada P2 GECERLI DEGILDIR ve bu bilinclidir: kullanici kendi hesabinda,
 * kimligi kanitlanmis haldedir. Kendi giris yontemlerini bilmek bir sizinti
 * degil bir HAKTIR — sizdirilan bir sey yoksa gizlenecek bir sey de yoktur.
 */
export class LastSignInMethodError extends IdentityDomainError {
  readonly code = 'LAST_SIGN_IN_METHOD';

  constructor() {
    super('Bu, hesabinizdaki tek giris yontemi. Kaldirmadan once baska bir yontem ekleyin.');
  }
}
