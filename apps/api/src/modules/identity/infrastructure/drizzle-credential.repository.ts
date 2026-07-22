import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { credentials } from '../../../infrastructure/database/schema';
import type { CredentialRepository } from '../application/credential.repository.port';
import type { Credential } from '../domain/credential.entity';
import type { UserId } from '../../../shared/user-id.value-object';
import { toCredential, toCredentialRow } from './credential.mapper';

/** `CredentialRepository`'nin Drizzle implementasyonu. */
@Injectable()
export class DrizzleCredentialRepository implements CredentialRepository {
  async findByUserId(userId: UserId): Promise<Credential | null> {
    const { db } = requireTransaction();

    const rows = await db
      .select()
      .from(credentials)
      .where(eq(credentials.userId, userId.value))
      .limit(1);
    const row = rows[0];

    return row === undefined ? null : toCredential(row);
  }

  async save(credential: Credential): Promise<void> {
    const { db } = requireTransaction();
    const row = toCredentialRow(credential);

    await db
      .insert(credentials)
      .values(row)
      .onConflictDoUpdate({
        target: credentials.userId,
        set: { passwordHash: row.passwordHash, passwordChangedAt: row.passwordChangedAt },
      });
  }
}
