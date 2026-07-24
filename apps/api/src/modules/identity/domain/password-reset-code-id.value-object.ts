import { normalizeUuidV7 } from '../../../shared/uuid-v7';
import { InvalidPasswordResetCodeIdError } from './identity.error';

/** Bir parola sifirlama kodu kaydinin kimligi (ADR-0024). */
export class PasswordResetCodeId {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static create(value: string): PasswordResetCodeId {
    const normalized = normalizeUuidV7(value);
    if (normalized === null) {
      throw new InvalidPasswordResetCodeIdError(value);
    }
    return new PasswordResetCodeId(normalized);
  }

  equals(other: PasswordResetCodeId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
