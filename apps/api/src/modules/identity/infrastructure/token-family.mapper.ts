import { TokenFamily } from '../domain/token-family.entity';
import { TokenFamilyId } from '../domain/token-family-id.value-object';
import { parseTokenFamilyRevocationReason } from '../domain/token-family-revocation-reason.value-object';
import { UserId } from '../../../shared/user-id.value-object';

/** `platform.token_families` satirinin ham bicimi. */
export interface TokenFamilyRow {
  readonly id: string;
  readonly userId: string;
  readonly revokedReason: string | null;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
}

export function toTokenFamily(row: TokenFamilyRow): TokenFamily {
  return TokenFamily.fromPersistence({
    id: TokenFamilyId.create(row.id),
    userId: UserId.create(row.userId),
    revokedReason:
      row.revokedReason === null ? null : parseTokenFamilyRevocationReason(row.revokedReason),
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
  });
}

export function toTokenFamilyRow(family: TokenFamily): TokenFamilyRow {
  return {
    id: family.id.value,
    userId: family.userId.value,
    revokedReason: family.revokedReason,
    createdAt: family.createdAt,
    revokedAt: family.revokedAt,
  };
}
