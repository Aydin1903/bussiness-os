import { type UserId } from '../../../shared/user-id.value-object';
import { type Email } from './email.value-object';
import { InconsistentUserStateError, InvalidUserCreatedAtError } from './identity.error';
import { assertTransition, type UserStatus } from './user-status.value-object';

/**
 * Sistemdeki bir insan — GLOBAL, tenant'tan bagimsiz (ADR-0014,
 * AUTH_ARCHITECTURE 5.1).
 *
 * ============================================================================
 * PAROLA BU ENTITY'DE YOK
 * ============================================================================
 * Parola hash'i `User`'da degil, ayri bir `Credential`'da yasar
 * (AUTH_ARCHITECTURE 5.3): erisim yuzeyini daraltir (bir `SELECT` ile hash
 * disari cikmaz), federasyonu (parolasiz SSO kullanicisi) mumkun kilar ve
 * `password_changed_at`'i `User`'in yasam dongusunden ayirir. `Credential`
 * entity'si ayri bir slice'tir; bu entity ondan HABERSIZDIR.
 * ============================================================================
 *
 * ZAMAN VE KIMLIK DISARIDAN GELIR: entity `new Date()` veya id uretmez
 * (DEVELOPMENT_RULES 3.2). `Clock` ve `IdGenerator` port'lari application
 * katmaninindir. Tenant domain katmaniyla ayni disiplin.
 *
 * `emailVerified` ile `status` NEDEN AYRI: bkz. `user-status.value-object.ts`.
 */

export interface RegisterUserInput {
  readonly id: UserId;
  readonly email: Email;
  readonly createdAt: Date;
}

/**
 * User'in tam durumu — constructor girdisi ve `fromPersistence()` sozlesmesi.
 *
 * Alanlar value object tasir (ham string degil): satiri VO'lara cevirmek
 * repository adapter'inin isidir, boylece bozuk bir kolon degeri entity'ye
 * ulasmadan sinirda yakalanir.
 */
export interface UserState {
  readonly id: UserId;
  readonly email: Email;
  readonly emailVerified: boolean;
  readonly status: UserStatus;
  readonly createdAt: Date;
}

export class User {
  readonly id: UserId;

  #email: Email;
  #emailVerified: boolean;
  #status: UserStatus;
  #createdAt: Date;

  /**
   * Constructor PRIVATE'dir ve dogrulama YAPMAZ — yalnizca dogrulanmis
   * degerleri atar. Invariant'lar factory'de korunur; gecersiz nesne yaratmak
   * dilsel olarak imkansizdir (`new User(...)` derlenmez).
   */
  private constructor(state: UserState) {
    this.id = state.id;
    this.#email = state.email;
    this.#emailVerified = state.emailVerified;
    this.#status = state.status;
    this.#createdAt = state.createdAt;
  }

  /**
   * Yeni bir kullaniciyi kaydeder — kullanici yaratmanin TEK yolu.
   *
   * Daima `pending` + `emailVerified=false` baslar (AUTH_ARCHITECTURE 8): kayit
   * hicbir sey dogrulamaz, yalnizca bekleyen bir hesap ve bir dogrulama kodu
   * uretir. Hesap, e-posta dogrulanana kadar `active` olamaz (§7.5).
   */
  static register(input: RegisterUserInput): User {
    assertValidCreatedAt(input.createdAt);

    return new User({
      id: input.id,
      email: input.email,
      emailVerified: false,
      status: 'pending',
      createdAt: copyDate(input.createdAt),
    });
  }

  /**
   * Kalici kayittan (veritabani satiri) entity'yi yeniden kurar.
   *
   * Gecmis gecisleri tekrar dogrulamaz (kayit zaten onlardan gecerek bugune
   * geldi) ama durumun KENDI ICINDE tutarli olmasini zorlar: bozuk bir satir
   * sessizce gecerli bir nesneye donusemez.
   */
  static fromPersistence(state: UserState): User {
    assertValidCreatedAt(state.createdAt);
    assertStatusConsistency(state);

    return new User({ ...state, createdAt: copyDate(state.createdAt) });
  }

  get email(): Email {
    return this.#email;
  }

  get emailVerified(): boolean {
    return this.#emailVerified;
  }

  get status(): UserStatus {
    return this.#status;
  }

  /** Date mutable oldugu icin kopya doner. */
  get createdAt(): Date {
    return copyDate(this.#createdAt);
  }

  /** Yalnizca `active` kullanici giris yapabilir (AUTH_ARCHITECTURE 9). */
  get isActive(): boolean {
    return this.#status === 'active';
  }

  // --- Durum gecisleri (AUTH_ARCHITECTURE 5.2 / 7.5 / 14) -----------------

  /**
   * pending -> active. E-posta dogrulama kodu kabul edildi (§7.5).
   *
   * `emailVerified`'i da set eder: ikisi TEK bir olayin iki yuzudur ve birlikte
   * degisir. Yalnizca `pending`'den cagrilabilir — zaten dogrulanmis bir hesabi
   * yeniden dogrulamak gecis kuralinca reddedilir.
   */
  verifyEmail(): void {
    this.#transitionTo('active');
    this.#emailVerified = true;
  }

  /** active -> locked. Kaba kuvvet veya operator karari (§14). */
  lock(): void {
    this.#transitionTo('locked');
  }

  /** locked -> active. Kilit acildi. */
  unlock(): void {
    this.#transitionTo('active');
  }

  /** pending|active|locked -> deactivated. Terminal. */
  deactivate(): void {
    this.#transitionTo('deactivated');
  }

  // --- Ic yardimcilar ----------------------------------------------------

  #transitionTo(next: UserStatus): void {
    assertTransition(this.#status, next);
    this.#status = next;
  }
}

/**
 * Tutarlilik invariant'i — `status` ile `emailVerified` uyumlu olmali. Kaynak,
 * `user-status.value-object.ts`'teki gecis grafigidir:
 *
 * - `pending`     -> HENUZ dogrulanmadi: `emailVerified` false OLMALI.
 * - `active`      -> yalnizca dogrulama ile ulasilir: `emailVerified` true OLMALI.
 * - `locked`      -> yalnizca `active`'ten gelir: `emailVerified` true OLMALI.
 * - `deactivated` -> pending veya active/locked'tan gelebilir: IKISI DE gecerli.
 *
 * Son satir bilincli bir belirsizliktir; zorlanmaya calisilirsa gercek
 * senaryolardan biri (dogrulanmadan kapatilmis hesap) reddedilir.
 */
function assertStatusConsistency(state: UserState): void {
  if (state.status === 'pending' && state.emailVerified) {
    throw new InconsistentUserStateError('bekleyen kullanici dogrulanmis e-posta tasiyamaz');
  }

  if ((state.status === 'active' || state.status === 'locked') && !state.emailVerified) {
    throw new InconsistentUserStateError(
      `"${state.status}" durumundaki kullanici dogrulanmis e-posta tasimali`,
    );
  }
}

/**
 * `new Date('gecersiz')` hata firlatmaz, `Invalid Date` uretir ve tum
 * karsilastirmalarda sessizce `false` doner. Sinirda yakalanmazsa veritabanina
 * `null` olarak dusen bir zaman degeri olusur.
 */
function assertValidCreatedAt(value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new InvalidUserCreatedAtError('gecerli bir tarih degil');
  }
}

function copyDate(value: Date): Date {
  return new Date(value.getTime());
}
