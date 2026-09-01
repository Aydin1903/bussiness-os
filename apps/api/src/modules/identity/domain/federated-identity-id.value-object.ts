import { normalizeUuidV7 } from '../../../shared/uuid-v7';
import { InvalidFederatedIdentityIdError } from './identity.error';

/** Bir sosyal giris baglantisinin kimligi (ADR-0053 §2). */
export class FederatedIdentityId {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static create(value: string): FederatedIdentityId {
    const normalized = normalizeUuidV7(value);
    if (normalized === null) {
      throw new InvalidFederatedIdentityIdError(value);
    }
    return new FederatedIdentityId(normalized);
  }

  equals(other: FederatedIdentityId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
