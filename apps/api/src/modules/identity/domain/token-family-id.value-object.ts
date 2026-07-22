import { normalizeUuidV7 } from '../../../shared/uuid-v7';
import { InvalidTokenFamilyIdError } from './identity.error';

/** Bir token ailesinin kimligi — bir giristen dogan refresh zinciri (ADR-0021). */
export class TokenFamilyId {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static create(value: string): TokenFamilyId {
    const normalized = normalizeUuidV7(value);
    if (normalized === null) {
      throw new InvalidTokenFamilyIdError(value);
    }
    return new TokenFamilyId(normalized);
  }

  equals(other: TokenFamilyId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
