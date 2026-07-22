import { type Email } from './email.value-object';
import { InvalidLoginAttemptTimestampError } from './identity.error';
import { type IpAddress } from './ip-address.value-object';
import { type LoginAttemptId } from './login-attempt-id.value-object';

/**
 * Tek bir giris denemesinin DEGISMEZ kaydi (AUTH_ARCHITECTURE 5.2/14, ADR-0022).
 *
 * ============================================================================
 * NEDEN DEGISMEZ, NEDEN DAVRANIS YOK
 * ============================================================================
 * Bu bir DENETIM kaydidir, bir durum makinesi degil: bir kez olustu mu
 * degismez. Durum gecisi, iptal, tuketim yoktur. Rol farkli: kaba kuvvet KARARI
 * bu kayitlarin TOPLAMINDAN cikar (katman 1/2/3 sayaclari) ve o hesap
 * `brute-force-policy.ts`'te yapilir; tek bir kayit kendi basina karar vermez.
 *
 * Basarisiz denemeler de, BASARILI olanlar da kaydedilir (`succeeded`). Sayaclar
 * yalnizca `succeeded === false` satirlari sayar; basarili kayit denetim ve
 * "bu hesaba nereden girildi" analizi icindir.
 *
 * E-POSTA VAR OLMAYAN HESABA AIT OLABILIR (§9.1): kimligi bulunamayan bir giris
 * de denemedir. Bu yuzden kayit `User`'a FK ile bagli degildir; yalnizca
 * normalize e-postayi (sayac anahtari) tasir. ZAMAN DISARIDAN GELIR.
 * ============================================================================
 */

export interface RecordLoginAttemptInput {
  readonly id: LoginAttemptId;
  readonly email: Email;
  readonly ipAddress: IpAddress;
  readonly succeeded: boolean;
  readonly attemptedAt: Date;
}

/** Tam durum — `record()` girdisi ve `fromPersistence()` sozlesmesi (ayni sekil). */
export type LoginAttemptState = RecordLoginAttemptInput;

export class LoginAttempt {
  readonly id: LoginAttemptId;
  readonly email: Email;
  readonly ipAddress: IpAddress;
  readonly succeeded: boolean;

  #attemptedAt: Date;

  private constructor(state: LoginAttemptState) {
    this.id = state.id;
    this.email = state.email;
    this.ipAddress = state.ipAddress;
    this.succeeded = state.succeeded;
    this.#attemptedAt = state.attemptedAt;
  }

  /** Yeni bir giris denemesi kaydi olusturur. */
  static record(input: RecordLoginAttemptInput): LoginAttempt {
    assertValidTimestamp(input.attemptedAt);

    return new LoginAttempt({ ...input, attemptedAt: copyDate(input.attemptedAt) });
  }

  /**
   * Kalici kayittan yeniden kurar.
   *
   * `record()` ile ayni dogrulamayi yapar: kayit degismez oldugu icin ikisinin
   * ayrimi davranissal degil, NIYETSELDIR — biri yeni deneme, digeri okunmus
   * satir. Ayni tutulmalari, ilerideki bir alan eklendiginde ikisinin
   * ayrisabilecegi gercegini gizlemez (bkz. Tenant `fromPersistence`).
   */
  static fromPersistence(state: LoginAttemptState): LoginAttempt {
    assertValidTimestamp(state.attemptedAt);

    return new LoginAttempt({ ...state, attemptedAt: copyDate(state.attemptedAt) });
  }

  /** Date mutable oldugu icin kopya doner. */
  get attemptedAt(): Date {
    return copyDate(this.#attemptedAt);
  }
}

function assertValidTimestamp(value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new InvalidLoginAttemptTimestampError('gecerli bir tarih degil');
  }
}

function copyDate(value: Date): Date {
  return new Date(value.getTime());
}
