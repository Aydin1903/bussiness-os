import { type Email } from './email.value-object';
import { InvalidVerificationCodeRequestTimestampError } from './identity.error';
import { type IpAddress } from './ip-address.value-object';
import { type VerificationCodeRequestId } from './verification-code-request-id.value-object';

/**
 * Bir dogrulama kodu ISTEGININ degismez kaydi (AUTH_ARCHITECTURE 7.4, ADR-0019).
 *
 * ============================================================================
 * ISTEK KAYDEDILIR, URETIM DEGIL
 * ============================================================================
 * Kayit, istegin SONUCUNDAN bagimsiz olarak yazilir: kod uretilmis olabilir,
 * hesap bulunamamis olabilir, sinir asilmis olabilir. Sebep IP sinirinin
 * anlamli olmasidir — var olmayan e-postalarla yapilan istekler de sayilmali,
 * yoksa bir saldirgan bilinmeyen adreslerle sinirsiz istek yapabilirdi.
 *
 * `LoginAttempt` ile ayni desen: denetim kaydi, durum makinesi degil. Bir kez
 * olustu mu degismez; gecis, iptal, tuketim yoktur. Kaba kuvvet kararinda
 * oldugu gibi, KARAR bu kayitlarin TOPLAMINDAN cikar
 * (`verification-resend-policy.ts`).
 *
 * FK YOKTUR: istek var olmayan bir hesaba ait olabilir. ZAMAN DISARIDAN GELIR.
 * ============================================================================
 */

export interface RecordVerificationCodeRequestInput {
  readonly id: VerificationCodeRequestId;
  readonly email: Email;
  readonly ipAddress: IpAddress;
  readonly requestedAt: Date;
}

/** Tam durum — `record()` girdisi ve `fromPersistence()` sozlesmesi (ayni sekil). */
export type VerificationCodeRequestState = RecordVerificationCodeRequestInput;

export class VerificationCodeRequest {
  readonly id: VerificationCodeRequestId;
  readonly email: Email;
  readonly ipAddress: IpAddress;

  #requestedAt: Date;

  private constructor(state: VerificationCodeRequestState) {
    this.id = state.id;
    this.email = state.email;
    this.ipAddress = state.ipAddress;
    this.#requestedAt = state.requestedAt;
  }

  static record(input: RecordVerificationCodeRequestInput): VerificationCodeRequest {
    assertValidTimestamp(input.requestedAt);

    return new VerificationCodeRequest({ ...input, requestedAt: copyDate(input.requestedAt) });
  }

  /** Kalici kayittan yeniden kurar; `record()` ile ayni dogrulamayi yapar. */
  static fromPersistence(state: VerificationCodeRequestState): VerificationCodeRequest {
    assertValidTimestamp(state.requestedAt);

    return new VerificationCodeRequest({ ...state, requestedAt: copyDate(state.requestedAt) });
  }

  /** Date mutable oldugu icin kopya doner. */
  get requestedAt(): Date {
    return copyDate(this.#requestedAt);
  }
}

function assertValidTimestamp(value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new InvalidVerificationCodeRequestTimestampError('gecerli bir tarih degil');
  }
}

function copyDate(value: Date): Date {
  return new Date(value.getTime());
}
