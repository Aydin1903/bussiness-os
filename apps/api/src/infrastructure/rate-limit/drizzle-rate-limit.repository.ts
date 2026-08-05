import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { rateLimits } from '../database/schema';
import { requireTransaction } from '../database/transaction-context';
import type {
  RateLimitRepository,
  RegisterRequestInput,
} from '../../shared/rate-limit.repository.port';

/**
 * `RateLimitRepository`'nin Drizzle implementasyonu (ADR-0029 §5).
 *
 * Kendi transaction'ini ACMAZ: sinir use case'tedir (MT §13.3 kural 2).
 * Tenant daraltmasi RLS'tedir — elle `WHERE tenant_id` YOKTUR; `tenant_id`
 * yalnizca satirin KIMLIGININ parcasi oldugu icin yazilir.
 */
@Injectable()
export class DrizzleRateLimitRepository implements RateLimitRepository {
  /**
   * ⚠️ TEK DEYIM, iki degil.
   *
   * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` sayimi ve artirmayi ayni
   * satir kilidinin altina alir. Es zamanli iki istek geldiginde ikincisi
   * birincinin commit'ini BEKLER ve 2 gorur — "once SELECT sonra UPDATE"
   * deseninde ikisi de 1 gorurdu.
   *
   * `excluded` KULLANILMAZ: artirma mevcut satirin degerine dayanir
   * (`rate_limits.request_count + 1`), gelen satira degil.
   */
  async registerRequest(input: RegisterRequestInput): Promise<number> {
    const { db } = requireTransaction();

    const rows = await db
      .insert(rateLimits)
      .values({
        tenantId: input.tenantId,
        userId: input.userId,
        action: input.action,
        windowStart: input.windowStart,
        requestCount: 1,
      })
      .onConflictDoUpdate({
        target: [rateLimits.tenantId, rateLimits.userId, rateLimits.action, rateLimits.windowStart],
        set: { requestCount: sql`${rateLimits.requestCount} + 1` },
      })
      .returning({ requestCount: rateLimits.requestCount });

    const count = rows[0]?.requestCount;
    if (count === undefined) {
      // Ulasilmaz: UPSERT daima bir satir doner. Sessizce 0 varsaymak, sinirin
      // HIC devreye girmemesi demek olurdu — fail closed.
      throw new Error('Oran siniri sayaci guncellenemedi.');
    }

    return count;
  }
}
