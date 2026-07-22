import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { refreshTokens } from '../../../infrastructure/database/schema';
import type { RefreshTokenRepository } from '../application/refresh-token.repository.port';
import type { RefreshToken } from '../domain/refresh-token.entity';
import type { RefreshTokenHash } from '../domain/refresh-token-hash.value-object';
import { toRefreshToken, toRefreshTokenRow } from './refresh-token.mapper';

/** `RefreshTokenRepository`'nin Drizzle implementasyonu (ADR-0021). */
@Injectable()
export class DrizzleRefreshTokenRepository implements RefreshTokenRepository {
  async save(token: RefreshToken): Promise<void> {
    const { db } = requireTransaction();
    const row = toRefreshTokenRow(token);

    // Rotation'da degisen tek sey used_at'tir (token'i tuketmek). Diger alanlar
    // sabittir; CONFLICT'te yalnizca used_at guncellenir.
    await db
      .insert(refreshTokens)
      .values(row)
      .onConflictDoUpdate({ target: refreshTokens.id, set: { usedAt: row.usedAt } });
  }

  async findByTokenHash(tokenHash: RefreshTokenHash): Promise<RefreshToken | null> {
    const { db } = requireTransaction();

    const rows = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash.value))
      .limit(1);
    const row = rows[0];

    return row === undefined ? null : toRefreshToken(row);
  }
}
