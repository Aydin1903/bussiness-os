import { InvalidMembershipIdError } from './membership.error';
import { normalizeUuidV7 } from './uuid-v7';

/** Bir uyelik kaydinin kimligi. */
export class MembershipId {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static create(value: string): MembershipId {
    const normalized = normalizeUuidV7(value);
    if (normalized === null) {
      throw new InvalidMembershipIdError(value);
    }
    return new MembershipId(normalized);
  }

  equals(other: MembershipId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
