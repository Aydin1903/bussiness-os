import { type UserId } from '../../../shared/user-id.value-object';
import {
  InconsistentTokenFamilyStateError,
  InvalidTokenFamilyCreatedAtError,
  InvalidTokenFamilyRevokedAtError,
  TokenFamilyAlreadyRevokedError,
} from './identity.error';
import { type TokenFamilyId } from './token-family-id.value-object';
import { type TokenFamilyRevocationReason } from './token-family-revocation-reason.value-object';

/**
 * Bir giristen dogan refresh token zinciri — HIRSIZLIK TESPITININ BIRIMI
 * (AUTH_ARCHITECTURE 5.2/11, ADR-0021).
 *
 * ============================================================================
 * NEDEN AILE, NEDEN TEK TOKEN DEGIL
 * ============================================================================
 * Rotation her kullanimda token'i degistirir; ama zaten kullanilmis bir token
 * yeniden sunulursa IKI TARAF ayni zinciri kullaniyor demektir (mesru kullanici
 * ve hirsiz) ve hangisinin hangisi oldugu BILINEMEZ. Bu yuzden yaniter tek
 * token degil, TUM AILEDIR: aile iptal edilir, iki taraf da duser, hirsiz
 * erisimini kaybeder (§11.3).
 *
 * Bu entity iptal EYLEMINI (`revoke`) saglar. Yeniden kullanimi TESPIT edip bu
 * eylemi tetikleyen orkestrasyon refresh use-case'inindir: kullanilmis bir
 * `RefreshToken` (bkz. `RefreshToken.isUsed`) bulununca ailesini `revoke(
 * 'token-reuse-detected', now)` ile iptal eder.
 *
 * ZAMAN DISARIDAN GELIR (DEVELOPMENT_RULES 3.2).
 * ============================================================================
 *
 * ============================================================================
 * IKI SINIR: KAYAN PENCERE + MUTLAK TAVAN
 * ============================================================================
 * Refresh token'in 30 gunluk omru her rotasyonda YENIDEN BASLAR (ADR-0021).
 * Tek basina bu, aktif kullanilan bir oturumun SONSUZA KADAR yasamasi demektir:
 * calinmis ve fark edilmemis bir zincir, kullanicinin bir daha hic parola
 * girmedigi bir kalici erisime doner.
 *
 * Bu yuzden ailenin uzerinde ikinci ve ASILAMAZ bir sinir vardir: 90 gun.
 * Ikisi birlikte "aktif kullanan kullanici 30 gunde bir dusmez, ama hicbir
 * oturum 90 gunu gecemez" der.
 *
 * TAVAN SAKLANMAZ, TURETILIR: `created_at + 90 gun`. Ayri bir `expires_at`
 * kolonu ayni gercegi iki yerde tutar ve sure degistiginde hangisinin dogru
 * oldugu belirsizlesir. Omur bir KURALDIR, veri degil.
 * ============================================================================
 */

/** Ailenin mutlak omru — rotasyon bunu SIFIRLAMAZ (ADR-0021 eki). */
export const TOKEN_FAMILY_ABSOLUTE_TTL_DAYS = 90;

const DAY_MS = 24 * 60 * 60_000;

export interface StartTokenFamilyInput {
  readonly id: TokenFamilyId;
  readonly userId: UserId;
  readonly createdAt: Date;
}

/** Tam durum — constructor girdisi ve `fromPersistence()` sozlesmesi. */
export interface TokenFamilyState {
  readonly id: TokenFamilyId;
  readonly userId: UserId;
  readonly revokedReason: TokenFamilyRevocationReason | null;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
}

export class TokenFamily {
  readonly id: TokenFamilyId;
  readonly userId: UserId;

  #revokedReason: TokenFamilyRevocationReason | null;
  #createdAt: Date;
  #revokedAt: Date | null;

  /** Dogrulama YAPMAZ; yalnizca dogrulanmis degerleri atar. Bkz. `User`. */
  private constructor(state: TokenFamilyState) {
    this.id = state.id;
    this.userId = state.userId;
    this.#revokedReason = state.revokedReason;
    this.#createdAt = state.createdAt;
    this.#revokedAt = state.revokedAt;
  }

  /** Yeni bir aile baslatir (giris aninda) — daima iptal edilmemis baslar. */
  static start(input: StartTokenFamilyInput): TokenFamily {
    assertValidCreatedAt(input.createdAt);

    return new TokenFamily({
      id: input.id,
      userId: input.userId,
      revokedReason: null,
      createdAt: copyDate(input.createdAt),
      revokedAt: null,
    });
  }

  /** Kalici kayittan yeniden kurar; durumun kendi icinde tutarli olmasini zorlar. */
  static fromPersistence(state: TokenFamilyState): TokenFamily {
    assertValidCreatedAt(state.createdAt);
    assertRevocationConsistency(state);

    return new TokenFamily({
      ...state,
      createdAt: copyDate(state.createdAt),
      revokedAt: state.revokedAt === null ? null : copyDate(state.revokedAt),
    });
  }

  get isRevoked(): boolean {
    return this.#revokedAt !== null;
  }

  get isActive(): boolean {
    return !this.isRevoked;
  }

  get revokedReason(): TokenFamilyRevocationReason | null {
    return this.#revokedReason;
  }

  get createdAt(): Date {
    return copyDate(this.#createdAt);
  }

  /**
   * Mutlak tavan doldu mu? (`created_at + 90 gun`)
   *
   * `>=`: omrun doldugu AN biter. Tam 90. gunu gecerli saymak, siniri bir
   * milisaniye de olsa gevsetmek olurdu ve sinirin varlik sebebi katiligidir.
   *
   * Bu bir IPTAL DEGILDIR: `revokedAt` bos kalir. Sona erme, `createdAt`'ten
   * turetilen bir ZAMAN GERCEGIDIR; iptal kaydi gibi yazmak "bir operator ya da
   * guvenlik karari verildi" izlenimi verir ve denetim kaydini kirletir.
   */
  hasReachedAbsoluteLifetime(now: Date): boolean {
    return now.getTime() - this.#createdAt.getTime() >= TOKEN_FAMILY_ABSOLUTE_TTL_DAYS * DAY_MS;
  }

  /**
   * Yenileme icin kullanilabilir mi? Iptal edilmemis VE tavana ulasmamis olmali.
   *
   * Iki sinir ayri sorulardir ama cagiranlar icin tek karar noktasi olmalidir;
   * biri unutulursa sessizce acik kalir.
   */
  isRenewable(now: Date): boolean {
    return !this.isRevoked && !this.hasReachedAbsoluteLifetime(now);
  }

  get revokedAt(): Date | null {
    return this.#revokedAt === null ? null : copyDate(this.#revokedAt);
  }

  /**
   * Aileyi iptal eder. Bir aile bir kez iptal edilir: ILK iptal nedeni ve zamani
   * denetim gercegidir ve degistirilemez. Zaten iptal edilmis bir aileyi yeniden
   * iptal etmek bir cagirma hatasidir (use case yalnizca aktif aileleri iptal
   * eder), sessizce yutulmaz.
   */
  revoke(reason: TokenFamilyRevocationReason, revokedAt: Date): void {
    if (this.isRevoked) {
      throw new TokenFamilyAlreadyRevokedError();
    }
    assertValidRevokedAt(revokedAt);
    if (revokedAt.getTime() < this.#createdAt.getTime()) {
      throw new InvalidTokenFamilyRevokedAtError('olusturulma zamanindan once olamaz');
    }

    this.#revokedReason = reason;
    this.#revokedAt = copyDate(revokedAt);
  }
}

/**
 * Tutarlilik invariant'i: `revokedAt !== null` <=> `revokedReason !== null`.
 * Biri dolu digeri bos bir kayit, "iptal edildi ama neden bilinmiyor" ya da
 * "neden var ama iptal edilmemis" gibi anlamsiz bir denetim durumu uretir.
 */
function assertRevocationConsistency(state: TokenFamilyState): void {
  const hasReason = state.revokedReason !== null;
  const hasTime = state.revokedAt !== null;

  if (hasReason !== hasTime) {
    throw new InconsistentTokenFamilyStateError(
      'iptal nedeni ile iptal zamani ya birlikte var olmali ya da birlikte yok',
    );
  }

  if (state.revokedAt !== null) {
    assertValidRevokedAt(state.revokedAt);
    if (state.revokedAt.getTime() < state.createdAt.getTime()) {
      throw new InconsistentTokenFamilyStateError(
        'iptal zamani olusturulma zamanindan once olamaz',
      );
    }
  }
}

function assertValidCreatedAt(value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new InvalidTokenFamilyCreatedAtError('gecerli bir tarih degil');
  }
}

function assertValidRevokedAt(value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new InvalidTokenFamilyRevokedAtError('gecerli bir tarih degil');
  }
}

function copyDate(value: Date): Date {
  return new Date(value.getTime());
}
