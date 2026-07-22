import { normalizeUuidV7 } from '../../../shared/uuid-v7';
import { InvalidEmailVerificationCodeIdError } from './identity.error';

/** Bir e-posta dogrulama kodu kaydinin kimligi (AUTH_ARCHITECTURE 5.2). */
export class EmailVerificationCodeId {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static create(value: string): EmailVerificationCodeId {
    const normalized = normalizeUuidV7(value);
    if (normalized === null) {
      throw new InvalidEmailVerificationCodeIdError(value);
    }
    return new EmailVerificationCodeId(normalized);
  }

  equals(other: EmailVerificationCodeId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
