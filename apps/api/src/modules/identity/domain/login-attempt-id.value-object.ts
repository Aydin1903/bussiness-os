import { normalizeUuidV7 } from '../../../shared/uuid-v7';
import { InvalidLoginAttemptIdError } from './identity.error';

/** Bir giris denemesi kaydinin kimligi (AUTH_ARCHITECTURE 5.2, ADR-0022). */
export class LoginAttemptId {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static create(value: string): LoginAttemptId {
    const normalized = normalizeUuidV7(value);
    if (normalized === null) {
      throw new InvalidLoginAttemptIdError(value);
    }
    return new LoginAttemptId(normalized);
  }

  equals(other: LoginAttemptId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
