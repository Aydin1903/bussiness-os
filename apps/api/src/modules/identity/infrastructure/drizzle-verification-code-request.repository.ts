import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte } from 'drizzle-orm';

import { verificationCodeRequests } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import type { VerificationCodeRequestRepository } from '../application/verification-code-request.repository.port';
import type { Email } from '../domain/email.value-object';
import type { IpAddress } from '../domain/ip-address.value-object';
import type { VerificationCodeRequest } from '../domain/verification-code-request.entity';
import { toVerificationCodeRequestRow } from './verification-code-request.mapper';

/**
 * `VerificationCodeRequestRepository`'nin Drizzle implementasyonu (ADR-0019 §7.4).
 *
 * `DrizzleLoginAttemptRepository` ile ayni desen: `save` yalnizca INSERT'tir
 * (kayit degismezdir) ve sayimlar migration'daki index'leri kullanir. Fark,
 * burada KISMI index olmamasidir — resend sayaci istegin sonucuna bakmaz,
 * hepsini sayar.
 */
@Injectable()
export class DrizzleVerificationCodeRequestRepository implements VerificationCodeRequestRepository {
  async save(request: VerificationCodeRequest): Promise<void> {
    const { db } = requireTransaction();

    await db.insert(verificationCodeRequests).values(toVerificationCodeRequestRow(request));
  }

  async findLastRequestedAt(email: Email): Promise<Date | null> {
    const { db } = requireTransaction();

    const rows = await db
      .select({ requestedAt: verificationCodeRequests.requestedAt })
      .from(verificationCodeRequests)
      .where(eq(verificationCodeRequests.emailNormalized, email.value))
      .orderBy(desc(verificationCodeRequests.requestedAt))
      .limit(1);

    return rows[0]?.requestedAt ?? null;
  }

  async countByEmail(email: Email, since: Date): Promise<number> {
    return this.#count(
      and(
        eq(verificationCodeRequests.emailNormalized, email.value),
        gte(verificationCodeRequests.requestedAt, since),
      ),
    );
  }

  async countByIp(ipAddress: IpAddress, since: Date): Promise<number> {
    return this.#count(
      and(
        eq(verificationCodeRequests.ipAddress, ipAddress.value),
        gte(verificationCodeRequests.requestedAt, since),
      ),
    );
  }

  async #count(scope: ReturnType<typeof and>): Promise<number> {
    const { db } = requireTransaction();

    const rows = await db.select({ value: count() }).from(verificationCodeRequests).where(scope);

    return rows[0]?.value ?? 0;
  }
}
