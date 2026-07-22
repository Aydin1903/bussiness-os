import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { tokenFamilies } from '../../../infrastructure/database/schema';
import type { TokenFamilyRepository } from '../application/token-family.repository.port';
import type { TokenFamily } from '../domain/token-family.entity';
import type { TokenFamilyId } from '../domain/token-family-id.value-object';
import { toTokenFamily, toTokenFamilyRow } from './token-family.mapper';

/** `TokenFamilyRepository`'nin Drizzle implementasyonu (ADR-0021). */
@Injectable()
export class DrizzleTokenFamilyRepository implements TokenFamilyRepository {
  async findById(id: TokenFamilyId): Promise<TokenFamily | null> {
    const { db } = requireTransaction();

    const rows = await db
      .select()
      .from(tokenFamilies)
      .where(eq(tokenFamilies.id, id.value))
      .limit(1);
    const row = rows[0];

    return row === undefined ? null : toTokenFamily(row);
  }

  async save(family: TokenFamily): Promise<void> {
    const { db } = requireTransaction();
    const row = toTokenFamilyRow(family);

    // user_id ve created_at CONFLICT'te GUNCELLENMEZ; degisen yalnizca iptaldir.
    await db
      .insert(tokenFamilies)
      .values(row)
      .onConflictDoUpdate({
        target: tokenFamilies.id,
        set: { revokedReason: row.revokedReason, revokedAt: row.revokedAt },
      });
  }
}
