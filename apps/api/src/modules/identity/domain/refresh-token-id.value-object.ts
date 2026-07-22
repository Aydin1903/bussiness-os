import { normalizeUuidV7 } from '../../../shared/uuid-v7';
import { InvalidRefreshTokenIdError } from './identity.error';

/** Bir refresh token kaydinin kimligi (AUTH_ARCHITECTURE 5.2). */
export class RefreshTokenId {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static create(value: string): RefreshTokenId {
    const normalized = normalizeUuidV7(value);
    if (normalized === null) {
      throw new InvalidRefreshTokenIdError(value);
    }
    return new RefreshTokenId(normalized);
  }

  equals(other: RefreshTokenId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
