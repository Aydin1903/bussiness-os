import { normalizeUuidV7 } from '../../../shared/uuid-v7';
import { InvalidVerificationCodeRequestIdError } from './identity.error';

/** Bir dogrulama kodu istegi kaydinin kimligi (ADR-0019 7.4). */
export class VerificationCodeRequestId {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static create(value: string): VerificationCodeRequestId {
    const normalized = normalizeUuidV7(value);
    if (normalized === null) {
      throw new InvalidVerificationCodeRequestIdError(value);
    }
    return new VerificationCodeRequestId(normalized);
  }

  equals(other: VerificationCodeRequestId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
