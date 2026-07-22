import { RefreshToken } from '../domain/refresh-token.entity';
import { RefreshTokenHash } from '../domain/refresh-token-hash.value-object';
import { RefreshTokenId } from '../domain/refresh-token-id.value-object';
import { TokenFamilyId } from '../domain/token-family-id.value-object';

/** `platform.refresh_tokens` satirinin ham bicimi. */
export interface RefreshTokenRow {
  readonly id: string;
  readonly familyId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
}

export function toRefreshToken(row: RefreshTokenRow): RefreshToken {
  return RefreshToken.fromPersistence({
    id: RefreshTokenId.create(row.id),
    familyId: TokenFamilyId.create(row.familyId),
    tokenHash: RefreshTokenHash.fromDigest(row.tokenHash),
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
  });
}

export function toRefreshTokenRow(token: RefreshToken): RefreshTokenRow {
  return {
    id: token.id.value,
    familyId: token.familyId.value,
    tokenHash: token.tokenHash.value,
    expiresAt: token.expiresAt,
    usedAt: token.usedAt,
  };
}
