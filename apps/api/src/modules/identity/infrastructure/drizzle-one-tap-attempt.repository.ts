import { Injectable } from '@nestjs/common';
import { and, count, eq, gte } from 'drizzle-orm';

import { oneTapAttempts } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { type OneTapAttemptRepository } from '../application/one-tap-attempt.repository.port';
import { type IpAddress } from '../domain/ip-address.value-object';

/** `OneTapAttemptRepository`'nin Drizzle implementasyonu (ADR-0053 EK-1.4). */
@Injectable()
export class DrizzleOneTapAttemptRepository implements OneTapAttemptRepository {
  async countByIpSince(ipAddress: IpAddress, since: Date): Promise<number> {
    const { db } = requireTransaction();

    const rows = await db
      .select({ total: count() })
      .from(oneTapAttempts)
      .where(
        and(eq(oneTapAttempts.ipAddress, ipAddress.value), gte(oneTapAttempts.attemptedAt, since)),
      );

    return rows[0]?.total ?? 0;
  }

  /**
   * ⚠️ YALNIZCA `INSERT`. Guncelleme metodu YOKTUR ve `0041` tablo seviyesinde
   * `UPDATE` yetkisini de VERMEZ — ikisi ayni seyi soyler.
   */
  async record(input: { id: string; ipAddress: IpAddress; attemptedAt: Date }): Promise<void> {
    const { db } = requireTransaction();

    await db.insert(oneTapAttempts).values({
      id: input.id,
      ipAddress: input.ipAddress.value,
      attemptedAt: input.attemptedAt,
    });
  }
}
