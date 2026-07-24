import { type UserId } from '../../../shared/user-id.value-object';
import {
  InconsistentVerificationCodeStateError,
  InvalidVerificationCodeExpiryError,
  VerificationCodeAlreadyConsumedError,
  VerificationCodeExhaustedError,
} from './identity.error';
import { type PasswordResetCodeId } from './password-reset-code-id.value-object';
import { type VerificationCodeHash } from './verification-code-hash.value-object';

/**
 * Parola sifirlama kodu (AUTH_ARCHITECTURE 7.6, ADR-0024).
 *
 * `EmailVerificationCode` ile AYNI mekanik — 6 haneli, tek kullanimlik, sureli;
 * entity ham kodu DEGIL HMAC digest'ini tasir — ama DAHA SIKI: 10 dk omur ve 3
 * yanlis deneme. Sebep tehdit modelidir: dogrulama kodu bir hesabi AKTIVE eder,
 * sifirlama kodu ELE GECIRMEYE yeter (§7.6). ZAMAN DISARIDAN GELIR.
 *
 * ATOMIK SAYAC (§7.3): `registerFailedAttempt` sayaci BELLEKTE artirir; otoriter
 * artis veritabaninda `UPDATE ... attempt_count + 1 ... RETURNING` ile ve
 * dogrulama ile AYNI transaction'da yapilir (use case'in isi).
 */

/** Sifirlama kodu omru (ADR-0024) — dogrulamadan (15 dk) DAHA KISA. */
export const PASSWORD_RESET_CODE_TTL_MINUTES = 10;

/** Kod basina en fazla yanlis deneme (ADR-0024) — dogrulamadan (5) DAHA AZ. */
export const MAX_PASSWORD_RESET_ATTEMPTS = 3;

export interface IssuePasswordResetCodeInput {
  readonly id: PasswordResetCodeId;
  readonly userId: UserId;
  readonly codeHash: VerificationCodeHash;
  readonly expiresAt: Date;
}

export interface PasswordResetCodeState {
  readonly id: PasswordResetCodeId;
  readonly userId: UserId;
  readonly codeHash: VerificationCodeHash;
  readonly attemptCount: number;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
}

export class PasswordResetCode {
  readonly id: PasswordResetCodeId;
  readonly userId: UserId;

  #codeHash: VerificationCodeHash;
  #attemptCount: number;
  #expiresAt: Date;
  #consumedAt: Date | null;

  private constructor(state: PasswordResetCodeState) {
    this.id = state.id;
    this.userId = state.userId;
    this.#codeHash = state.codeHash;
    this.#attemptCount = state.attemptCount;
    this.#expiresAt = state.expiresAt;
    this.#consumedAt = state.consumedAt;
  }

  /** Yeni bir kod yayinlar — daima 0 deneme ve tuketilmemis baslar. */
  static issue(input: IssuePasswordResetCodeInput): PasswordResetCode {
    assertValidDate(input.expiresAt);

    return new PasswordResetCode({
      id: input.id,
      userId: input.userId,
      codeHash: input.codeHash,
      attemptCount: 0,
      expiresAt: copyDate(input.expiresAt),
      consumedAt: null,
    });
  }

  /** Kalici kayittan yeniden kurar; durumun kendi icinde tutarli olmasini zorlar. */
  static fromPersistence(state: PasswordResetCodeState): PasswordResetCode {
    assertValidDate(state.expiresAt);
    assertAttemptCount(state.attemptCount);
    if (state.consumedAt !== null && Number.isNaN(state.consumedAt.getTime())) {
      throw new InvalidVerificationCodeExpiryError('tuketilme zamani gecerli bir tarih degil');
    }

    return new PasswordResetCode({
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
    return this.#attemptCount < MAX_PASSWORD_RESET_ATTEMPTS;
  }

  isExpired(now: Date): boolean {
    return now.getTime() >= this.#expiresAt.getTime();
  }

  /** Kod hala denenebilir mi? Tuketilmemis, suresi dolmamis ve hakki kalmis olmali. */
  isVerifiable(now: Date): boolean {
    return !this.isConsumed && !this.isExpired(now) && this.hasAttemptsRemaining;
  }

  /**
   * Basarisiz bir denemeyi kaydeder — sayaci artirir (bellek aynasi; otorite DB).
   * Tuketilmis veya hakki tukenmis koda deneme islenmez.
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

  /** Kodu tuketir (basarili sifirlama sonrasi). Tek kullanimlik. */
  consume(now: Date): void {
    if (this.isConsumed) {
      throw new VerificationCodeAlreadyConsumedError();
    }
    assertValidDate(now);

    this.#consumedAt = copyDate(now);
  }

  /**
   * Kodu, YERINE YENISI URETILDIGI (veya sifirlama tamamlandigi) icin kullanilamaz
   * kilar. "Ayni anda gecerli kod: bir tane" (§7.6) ve "sifirlama sonrasi tum
   * kodlar gecersiz" (ADR-0024) kurallari burada uygulanir. `consumedAt` kolonu
   * "kullanildi" ile "gecersizlestirildi" arasinda paylasilir — ikisi de "artik
   * kullanilamaz" demektir (EmailVerificationCode ile ayni karar).
   */
  supersede(now: Date): void {
    if (this.isConsumed) {
      throw new VerificationCodeAlreadyConsumedError();
    }
    assertValidDate(now);

    this.#consumedAt = copyDate(now);
  }
}

function assertAttemptCount(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_PASSWORD_RESET_ATTEMPTS) {
    throw new InconsistentVerificationCodeStateError(
      `deneme sayaci 0 ile ${String(MAX_PASSWORD_RESET_ATTEMPTS)} arasinda bir tam sayi olmali`,
    );
  }
}

function assertValidDate(value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new InvalidVerificationCodeExpiryError('gecerli bir tarih degil');
  }
}

function copyDate(value: Date): Date {
  return new Date(value.getTime());
}
