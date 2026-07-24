import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { passwordResetCodes } from '../../../infrastructure/database/schema';
import type { PasswordResetCodeRepository } from '../application/password-reset-code.repository.port';
import type { PasswordResetCode } from '../domain/password-reset-code.entity';
import type { PasswordResetCodeId } from '../domain/password-reset-code-id.value-object';
import type { UserId } from '../../../shared/user-id.value-object';
import { toPasswordResetCode, toPasswordResetCodeRow } from './password-reset-code.mapper';

/**
 * `PasswordResetCodeRepository`'nin Drizzle implementasyonu (ADR-0024).
 *
 * `DrizzleEmailVerificationCodeRepository` ile birebir ayni — yalnizca tablo
 * farkli.
 */
@Injectable()
export class DrizzlePasswordResetCodeRepository implements PasswordResetCodeRepository {
  async save(code: PasswordResetCode): Promise<void> {
    const { db } = requireTransaction();
    const row = toPasswordResetCodeRow(code);

    await db
      .insert(passwordResetCodes)
      .values(row)
      .onConflictDoUpdate({
        target: passwordResetCodes.id,
        set: { attemptCount: row.attemptCount, consumedAt: row.consumedAt },
      });
  }

  async findActiveByUserId(userId: UserId): Promise<PasswordResetCode | null> {
    const { db } = requireTransaction();

    const rows = await db
      .select()
      .from(passwordResetCodes)
      .where(
        and(eq(passwordResetCodes.userId, userId.value), isNull(passwordResetCodes.consumedAt)),
      )
      .orderBy(desc(passwordResetCodes.expiresAt))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toPasswordResetCode(row);
  }

  async incrementAttemptCount(id: PasswordResetCodeId): Promise<number | null> {
    const { db } = requireTransaction();

    // §7.3 ATOMIK artis: tek bir UPDATE ... attempt_count + 1 ... RETURNING.
    const rows = await db
      .update(passwordResetCodes)
      .set({ attemptCount: sql`${passwordResetCodes.attemptCount} + 1` })
      .where(eq(passwordResetCodes.id, id.value))
      .returning({ attemptCount: passwordResetCodes.attemptCount });

    return rows[0]?.attemptCount ?? null;
  }
}
