import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, lte, or } from 'drizzle-orm';

import { identityOutbox } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import type {
  IdentityOutboxRecord,
  IdentityOutboxRepository,
  OutboxDeliveryFailure,
} from '../application/identity-outbox.repository.port';

/**
 * `IdentityOutboxRepository`'nin Drizzle implementasyonu (ADR-0006).
 *
 * Kendi transaction'ini ACMAZ: sinir tuketici use case'indedir. Kilidin
 * gonderim boyunca tutulabilmesi bunu zaten zorunlu kilar — repository kendi
 * transaction'ini acsaydi kilit SELECT biter bitmez birakilir ve iki instance
 * ayni kaydi teslim edebilirdi.
 */
@Injectable()
export class DrizzleIdentityOutboxRepository implements IdentityOutboxRepository {
  async claimPending(limit: number, now: Date): Promise<IdentityOutboxRecord[]> {
    const { db } = requireTransaction();

    const rows = await db
      .select()
      .from(identityOutbox)
      .where(
        and(
          isNull(identityOutbox.publishedAt),
          // Olu mektup kuyrukta DEGILDIR; bir daha hic denenmez.
          isNull(identityOutbox.deadLetteredAt),
          // Backoff: zamani gelmemis kayit atlanir. `NULL` = hic denenmedi,
          // hemen hazir.
          or(isNull(identityOutbox.nextAttemptAt), lte(identityOutbox.nextAttemptAt, now)),
        ),
      )
      // Once zamani gelenler (NULL'lar en basta), sonra olus sirasi.
      .orderBy(asc(identityOutbox.nextAttemptAt), asc(identityOutbox.occurredAt))
      .limit(limit)
      // `skipLocked`: baska bir instance'in isledigi satirda BEKLEME, atla.
      // Beklemek iki tuketiciyi birbirine kilitler ve kuyrugu seri hale getirir.
      .for('update', { skipLocked: true });

    return rows.map(toRecord);
  }

  async markPublished(ids: readonly string[], publishedAt: Date): Promise<void> {
    if (ids.length === 0) {
      // `inArray` bos liste ile gecersiz SQL uretir; erken donmek daha durust.
      return;
    }

    const { db } = requireTransaction();

    await db
      .update(identityOutbox)
      .set({ publishedAt })
      .where(inArray(identityOutbox.id, [...ids]));
  }

  async recordFailures(failures: readonly OutboxDeliveryFailure[]): Promise<void> {
    const { db } = requireTransaction();

    // Her kaydin sayaci ve yeniden deneme ani FARKLIDIR; tek bir toplu UPDATE
    // ile yazilamaz. Basarisizlik nadir oldugu icin N sorgu kabul edilebilir —
    // ve tur zaten batch boyutuyla sinirlidir.
    for (const failure of failures) {
      await db
        .update(identityOutbox)
        .set({
          attemptCount: failure.attemptCount,
          lastError: failure.lastError,
          nextAttemptAt: failure.nextAttemptAt,
          deadLetteredAt: failure.deadLetteredAt,
        })
        .where(eq(identityOutbox.id, failure.id));
    }
  }
}

/**
 * `jsonb` kolonu `unknown` doner. Tip yuklemi ile daraltilir; `as` ile zorlamak
 * (DEVELOPMENT_RULES 2.3) bozuk bir satiri "gecerli payload" gibi gosterirdi.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Satiri okuma modeline cevirir. Payload'in ALANLARI burada dogrulanmaz. */
function toRecord(row: typeof identityOutbox.$inferSelect): IdentityOutboxRecord {
  if (!isRecord(row.payload)) {
    throw new TypeError(`identity_outbox.payload nesne degil: ${row.id}`);
  }

  return {
    id: row.id,
    eventType: row.eventType,
    eventVersion: row.eventVersion,
    // Alanlarin ayristirilmasi tuketicinin isidir (verification-email.builder.ts):
    // repository'nin her event tipinin sozlesmesini bilmesi gerekmez.
    payload: row.payload,
    correlationId: row.correlationId,
    occurredAt: row.occurredAt,
    attemptCount: row.attemptCount,
  };
}
