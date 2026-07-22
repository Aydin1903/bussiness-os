import {
  InvalidRefreshTokenExpiryError,
  InvalidRefreshTokenUsedAtError,
  RefreshTokenAlreadyUsedError,
} from './identity.error';
import { type RefreshTokenHash } from './refresh-token-hash.value-object';
import { type RefreshTokenId } from './refresh-token-id.value-object';
import { type TokenFamilyId } from './token-family-id.value-object';

/**
 * Bir token ailesindeki tek refresh token (AUTH_ARCHITECTURE 5.2/11, ADR-0021).
 *
 * Entity ham 256-bit token'i DEGIL, SHA-256 hash'ini (`RefreshTokenHash`) tasir;
 * uretim ve hash'leme infrastructure'in isidir. Ailesine `familyId` ile referans
 * verir (ARCHITECTURE 6.1: referans id ile). ZAMAN DISARIDAN GELIR.
 *
 * ============================================================================
 * ROTATION VE YENIDEN KULLANIM
 * ============================================================================
 * Rotation her kullanimda gerceklesir: token `markUsed` ile tuketilir (`usedAt`
 * dolar) ve AYNI ailede yeni bir token uretilir (use case'in isi). `isUsed`,
 * yeniden kullanim tespitinin girdisidir: kullanilmis bir token yeniden
 * sunulursa use case ailesini iptal eder (§11.3, bkz. `TokenFamily`).
 *
 * `markUsed` IKI KEZ cagrilamaz — ikinci cagri bir cagirma hatasidir. Ama asil
 * yeniden kullanim tespiti use case'te, `markUsed`'dan ONCE `isUsed` bakilarak
 * yapilir; bu guard yalnizca son savunmadir.
 * ============================================================================
 */

/** Refresh token mutlak omru (ADR-0021). Uygulama `expiresAt = now + TTL` icin kullanir. */
export const REFRESH_TOKEN_TTL_DAYS = 30;

export interface IssueRefreshTokenInput {
  readonly id: RefreshTokenId;
  readonly familyId: TokenFamilyId;
  readonly tokenHash: RefreshTokenHash;
  readonly expiresAt: Date;
}

/** Tam durum — constructor girdisi ve `fromPersistence()` sozlesmesi. */
export interface RefreshTokenState {
  readonly id: RefreshTokenId;
  readonly familyId: TokenFamilyId;
  readonly tokenHash: RefreshTokenHash;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
}

export class RefreshToken {
  readonly id: RefreshTokenId;
  readonly familyId: TokenFamilyId;

  #tokenHash: RefreshTokenHash;
  #expiresAt: Date;
  #usedAt: Date | null;

  /** Dogrulama YAPMAZ; yalnizca dogrulanmis degerleri atar. Bkz. `User`. */
  private constructor(state: RefreshTokenState) {
    this.id = state.id;
    this.familyId = state.familyId;
    this.#tokenHash = state.tokenHash;
    this.#expiresAt = state.expiresAt;
    this.#usedAt = state.usedAt;
  }

  /** Yeni bir refresh token yayinlar — daima kullanilmamis baslar. */
  static issue(input: IssueRefreshTokenInput): RefreshToken {
    assertValidExpiry(input.expiresAt);

    return new RefreshToken({
      id: input.id,
      familyId: input.familyId,
      tokenHash: input.tokenHash,
      expiresAt: copyDate(input.expiresAt),
      usedAt: null,
    });
  }

  /** Kalici kayittan yeniden kurar. */
  static fromPersistence(state: RefreshTokenState): RefreshToken {
    assertValidExpiry(state.expiresAt);
    if (state.usedAt !== null && Number.isNaN(state.usedAt.getTime())) {
      throw new InvalidRefreshTokenUsedAtError('gecerli bir tarih degil');
    }

    return new RefreshToken({
      ...state,
      expiresAt: copyDate(state.expiresAt),
      usedAt: state.usedAt === null ? null : copyDate(state.usedAt),
    });
  }

  get tokenHash(): RefreshTokenHash {
    return this.#tokenHash;
  }

  get expiresAt(): Date {
    return copyDate(this.#expiresAt);
  }

  get usedAt(): Date | null {
    return this.#usedAt === null ? null : copyDate(this.#usedAt);
  }

  /** Rotasyona ugramis mi? Yeniden kullanim tespitinin girdisi (§11.3). */
  get isUsed(): boolean {
    return this.#usedAt !== null;
  }

  isExpired(now: Date): boolean {
    return now.getTime() >= this.#expiresAt.getTime();
  }

  /**
   * Token yenileme icin kullanilabilir mi? Kullanilmamis ve suresi dolmamis
   * olmali. Ailenin AKTIF olup olmadigi AYRICA kontrol edilir (use case, ilgili
   * `TokenFamily`'yi yukler) — token ailesini tasimadigi icin burada bakilamaz.
   */
  isUsable(now: Date): boolean {
    return !this.isUsed && !this.isExpired(now);
  }

  /**
   * Token'i kullanilmis olarak isaretler (rotation). Tek kullanimlik: iki kez
   * kullanilamaz — ikinci cagri, yeniden kullanimin son savunmasidir.
   */
  markUsed(usedAt: Date): void {
    if (this.isUsed) {
      throw new RefreshTokenAlreadyUsedError();
    }
    if (Number.isNaN(usedAt.getTime())) {
      throw new InvalidRefreshTokenUsedAtError('gecerli bir tarih degil');
    }

    this.#usedAt = copyDate(usedAt);
  }
}

function assertValidExpiry(value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new InvalidRefreshTokenExpiryError('gecerli bir tarih degil');
  }
}

function copyDate(value: Date): Date {
  return new Date(value.getTime());
}
