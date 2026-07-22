import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { emailVerificationCodes } from '../../../infrastructure/database/schema';
import type { EmailVerificationCodeRepository } from '../application/email-verification-code.repository.port';
import type { EmailVerificationCode } from '../domain/email-verification-code.entity';
import type { EmailVerificationCodeId } from '../domain/email-verification-code-id.value-object';
import type { UserId } from '../../../shared/user-id.value-object';
import {
  toEmailVerificationCode,
  toEmailVerificationCodeRow,
} from './email-verification-code.mapper';

/** `EmailVerificationCodeRepository`'nin Drizzle implementasyonu (ADR-0019). */
@Injectable()
export class DrizzleEmailVerificationCodeRepository implements EmailVerificationCodeRepository {
  async save(code: EmailVerificationCode): Promise<void> {
    const { db } = requireTransaction();
    const row = toEmailVerificationCodeRow(code);

    await db
      .insert(emailVerificationCodes)
      .values(row)
      .onConflictDoUpdate({
        target: emailVerificationCodes.id,
        set: { attemptCount: row.attemptCount, consumedAt: row.consumedAt },
      });
  }

  async findActiveByUserId(userId: UserId): Promise<EmailVerificationCode | null> {
    const { db } = requireTransaction();

    // Tuketilmemis kodlardan en yenisi. Suresi dolmus olabilir — o karar domain'e
    // aittir (repository yalnizca `consumed_at IS NULL` filtreler).
    const rows = await db
      .select()
      .from(emailVerificationCodes)
      .where(
        and(
          eq(emailVerificationCodes.userId, userId.value),
          isNull(emailVerificationCodes.consumedAt),
        ),
      )
      .orderBy(desc(emailVerificationCodes.expiresAt))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toEmailVerificationCode(row);
  }

  async incrementAttemptCount(id: EmailVerificationCodeId): Promise<number | null> {
    const { db } = requireTransaction();

    // §7.3 ATOMIK artis: tek bir UPDATE ... attempt_count + 1 ... RETURNING.
    // Entity okunup geri YAZILMAZ — es zamanli istekler denemeleri atlatamaz.
    const rows = await db
      .update(emailVerificationCodes)
      .set({ attemptCount: sql`${emailVerificationCodes.attemptCount} + 1` })
      .where(eq(emailVerificationCodes.id, id.value))
      .returning({ attemptCount: emailVerificationCodes.attemptCount });

    return rows[0]?.attemptCount ?? null;
  }
}
