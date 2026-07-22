import { Injectable } from '@nestjs/common';
import { and, count, eq, gte } from 'drizzle-orm';

import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { loginAttempts } from '../../../infrastructure/database/schema';
import type { LoginAttemptRepository } from '../application/login-attempt.repository.port';
import type { Email } from '../domain/email.value-object';
import type { IpAddress } from '../domain/ip-address.value-object';
import type { LoginAttempt } from '../domain/login-attempt.entity';
import { toLoginAttemptRow } from './login-attempt.mapper';

/**
 * `LoginAttemptRepository`'nin Drizzle implementasyonu (ADR-0022).
 *
 * Sayimlar yalnizca BASARISIZ denemeleri (`succeeded = false`) sayar ve migration'daki
 * kismi index'leri kullanir. `save` yalnizca INSERT'tir — kayit degismezdir.
 */
@Injectable()
export class DrizzleLoginAttemptRepository implements LoginAttemptRepository {
  async save(attempt: LoginAttempt): Promise<void> {
    const { db } = requireTransaction();

    await db.insert(loginAttempts).values(toLoginAttemptRow(attempt));
  }

  async countFailuresByEmailAndIp(
    email: Email,
    ipAddress: IpAddress,
    since: Date,
  ): Promise<number> {
    return this.#countFailures(
      and(
        eq(loginAttempts.emailNormalized, email.value),
        eq(loginAttempts.ipAddress, ipAddress.value),
        gte(loginAttempts.attemptedAt, since),
      ),
    );
  }

  async countFailuresByEmail(email: Email, since: Date): Promise<number> {
    return this.#countFailures(
      and(eq(loginAttempts.emailNormalized, email.value), gte(loginAttempts.attemptedAt, since)),
    );
  }

  async countFailuresByIp(ipAddress: IpAddress, since: Date): Promise<number> {
    return this.#countFailures(
      and(eq(loginAttempts.ipAddress, ipAddress.value), gte(loginAttempts.attemptedAt, since)),
    );
  }

  async #countFailures(scope: ReturnType<typeof and>): Promise<number> {
    const { db } = requireTransaction();

    const rows = await db
      .select({ value: count() })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.succeeded, false), scope));

    return rows[0]?.value ?? 0;
  }
}
