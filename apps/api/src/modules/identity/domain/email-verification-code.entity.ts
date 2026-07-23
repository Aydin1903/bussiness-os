import { type UserId } from '../../../shared/user-id.value-object';
import { type EmailVerificationCodeId } from './email-verification-code-id.value-object';
import {
  InconsistentVerificationCodeStateError,
  InvalidVerificationCodeExpiryError,
  VerificationCodeAlreadyConsumedError,
  VerificationCodeExhaustedError,
} from './identity.error';
import { type VerificationCodeHash } from './verification-code-hash.value-object';

/**
 * E-posta dogrulama kodu (AUTH_ARCHITECTURE 7, ADR-0019).
 *
 * 6 haneli, tek kullanimlik, sureli bir kod. Entity ham kodu DEGIL, HMAC
 * digest'ini (`VerificationCodeHash`) tasir — kod uretimi ve hash'leme
 * infrastructure'in isidir (crypto + pepper). ZAMAN DISARIDAN GELIR
 * (DEVELOPMENT_RULES 3.2): entity `expiresAt`'i hesaplamaz, alir.
 *
 * ============================================================================
 * GUVENLIK TUMUYLE DENEME VE SURE SINIRINA BAGLIDIR
 * ============================================================================
 * Arama uzayi yalnizca 10^6'dir (ADR-0019). Sizan bir hash'i kirmak degil,
 * ONLINE tahmin bu mekanizmanin tehdididir; bu yuzden `MAX_VERIFICATION_ATTEMPTS`
 * ve `expiresAt` bu entity'nin en kritik parcalaridir.
 *
 * ATOMIK SAYAC — persistence'in sorumlulugu (§7.3): `registerFailedAttempt`
 * sayaci BELLEKTE artirir. Otoriter artis, veritabaninda `UPDATE ... SET
 * attempt_count = attempt_count + 1` ile ve dogrulama ile AYNI transaction'da
 * yapilmalidir. Tum entity'yi okuyup geri yazmak (read-modify-write) es zamanli
 * isteklerde sayaci atlatir ve §7.3'un korumasini comer.
 * ============================================================================
 */

/** Kod omru (ADR-0019). Uygulama `expiresAt = now + TTL` icin kullanir. */
export const VERIFICATION_CODE_TTL_MINUTES = 15;

/** Kod basina en fazla yanlis deneme; sonra kod gecersizlesir (ADR-0019, §7.3). */
export const MAX_VERIFICATION_ATTEMPTS = 5;

export interface IssueVerificationCodeInput {
  readonly id: EmailVerificationCodeId;
  readonly userId: UserId;
  readonly codeHash: VerificationCodeHash;
  readonly expiresAt: Date;
}

/** Tam durum — constructor girdisi ve `fromPersistence()` sozlesmesi. */
export interface EmailVerificationCodeState {
  readonly id: EmailVerificationCodeId;
  readonly userId: UserId;
  readonly codeHash: VerificationCodeHash;
  readonly attemptCount: number;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
}

export class EmailVerificationCode {
  readonly id: EmailVerificationCodeId;
  readonly userId: UserId;

  #codeHash: VerificationCodeHash;
  #attemptCount: number;
  #expiresAt: Date;
  #consumedAt: Date | null;

  /** Dogrulama YAPMAZ; yalnizca dogrulanmis degerleri atar. Bkz. `User`. */
  private constructor(state: EmailVerificationCodeState) {
    this.id = state.id;
    this.userId = state.userId;
    this.#codeHash = state.codeHash;
    this.#attemptCount = state.attemptCount;
    this.#expiresAt = state.expiresAt;
    this.#consumedAt = state.consumedAt;
  }

  /** Yeni bir kod yayinlar — daima 0 deneme ve tuketilmemis baslar. */
  static issue(input: IssueVerificationCodeInput): EmailVerificationCode {
    assertValidDate(input.expiresAt);

    return new EmailVerificationCode({
      id: input.id,
      userId: input.userId,
      codeHash: input.codeHash,
      attemptCount: 0,
      expiresAt: copyDate(input.expiresAt),
      consumedAt: null,
    });
  }

  /** Kalici kayittan yeniden kurar; durumun kendi icinde tutarli olmasini zorlar. */
  static fromPersistence(state: EmailVerificationCodeState): EmailVerificationCode {
    assertValidDate(state.expiresAt);
    assertAttemptCount(state.attemptCount);
    if (state.consumedAt !== null && Number.isNaN(state.consumedAt.getTime())) {
      throw new InvalidVerificationCodeExpiryError('tuketilme zamani gecerli bir tarih degil');
    }

    return new EmailVerificationCode({
      ...state,
      expiresAt: copyDate(state.expiresAt),
      consumedAt: state.consumedAt === null ? null : copyDate(state.consumedAt),
    });
  }

  get codeHash(): VerificationCodeHash {
    return this.#codeHash;
  }

  get attemptCount(): number {
    return this.#attemptCount;
  }

  get expiresAt(): Date {
    return copyDate(this.#expiresAt);
  }

  get consumedAt(): Date | null {
    return this.#consumedAt === null ? null : copyDate(this.#consumedAt);
  }

  get isConsumed(): boolean {
    return this.#consumedAt !== null;
  }

  get hasAttemptsRemaining(): boolean {
    return this.#attemptCount < MAX_VERIFICATION_ATTEMPTS;
  }

  isExpired(now: Date): boolean {
    return now.getTime() >= this.#expiresAt.getTime();
  }

  /**
   * Kod hala denenebilir mi? Tuketilmemis, suresi dolmamis ve deneme hakki
   * kalmis olmali (§7.5). Use case, HMAC kiyasindan ONCE bunu kontrol eder.
   */
  isVerifiable(now: Date): boolean {
    return !this.isConsumed && !this.isExpired(now) && this.hasAttemptsRemaining;
  }

  /**
   * Basarisiz bir denemeyi kaydeder — sayaci artirir.
   *
   * Sayacin BELLEKTEKI karsiligidir; otoriter artis atomik SQL ile yapilir
   * (bkz. sinif yorumu). Tuketilmis veya hakki tukenmis bir koda deneme islenmez:
   * ikisi de bir cagirma hatasidir, sessizce yutulmaz.
   */
  registerFailedAttempt(): void {
    if (this.isConsumed) {
      throw new VerificationCodeAlreadyConsumedError();
    }
    if (!this.hasAttemptsRemaining) {
      throw new VerificationCodeExhaustedError();
    }

    this.#attemptCount += 1;
  }

  /**
   * Kodu tuketir (basarili dogrulama sonrasi). Tek kullanimlik: iki kez
   * tuketilemez.
   */
  consume(now: Date): void {
    if (this.isConsumed) {
      throw new VerificationCodeAlreadyConsumedError();
    }
    assertValidDate(now);

    this.#consumedAt = copyDate(now);
  }

  /**
   * Kodu, YERINE YENISI URETILDIGI icin kullanilamaz kilar (ADR-0019).
   *
   * "Ayni anda gecerli kod: bir tane" kurali burada uygulanir. Yeni kod
   * uretildiginde eskisi kendiliginden kaybolmaz — `findActiveByUserId` en
   * yenisini dondurdugu icin ERISILEMEZ olur, ama erisilemez olmak GECERSIZ
   * olmak degildir. Kural acikca uygulanmazsa, sorgu bir gun degistiginde
   * (ornegin siralama) eski kodlar sessizce yeniden gecerli hale gelirdi.
   *
   * ============================================================================
   * `consumedAt` KOLONU PAYLASILIYOR — bilincli
   * ============================================================================
   * "Kullanildi" ile "yerine yenisi geldi" ayni kolonda tutulur: ikisi de
   * "artik kullanilamaz" demektir ve bugun bu ayrimi gerektiren bir denetim
   * ihtiyaci YOKTUR. Ihtiyac dogarsa ayri bir `superseded_at` kolonu eklenir;
   * o gun bu metot degisir, cagiranlar degismez.
   * ============================================================================
   */
  supersede(now: Date): void {
    if (this.isConsumed) {
      // Zaten kullanilamaz durumda; sessizce gecmek, cagiranin yanlis bir
      // varsayimla calistigini gizlerdi.
      throw new VerificationCodeAlreadyConsumedError();
    }
    assertValidDate(now);

    this.#consumedAt = copyDate(now);
  }
}

function assertAttemptCount(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_VERIFICATION_ATTEMPTS) {
    throw new InconsistentVerificationCodeStateError(
      `deneme sayaci 0 ile ${String(MAX_VERIFICATION_ATTEMPTS)} arasinda bir tam sayi olmali`,
    );
  }
}

/**
 * `new Date('gecersiz')` hata firlatmaz, `Invalid Date` uretir ve tum
 * karsilastirmalarda sessizce `false` doner — sinirda yakalanmali.
 */
function assertValidDate(value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new InvalidVerificationCodeExpiryError('gecerli bir tarih degil');
  }
}

function copyDate(value: Date): Date {
  return new Date(value.getTime());
}
