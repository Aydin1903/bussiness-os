import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { users } from '../../../infrastructure/database/schema';
import type { UserRepository } from '../application/user.repository.port';
import type { Email } from '../domain/email.value-object';
import type { User } from '../domain/user.entity';
import type { UserId } from '../../../shared/user-id.value-object';
import { toUser, toUserRow } from './user.mapper';

/**
 * `UserRepository`'nin Drizzle implementasyonu.
 *
 * `users` tenant-scoped DEGILDIR (MULTI_TENANT_ARCHITECTURE 12.4.3): RLS yok,
 * sorgular tenant context'i olmadan calisir. Yine de `requireTransaction`
 * kullanilir — havuza dogrudan erisim yasaktir (11.4 kural 2); use case
 * `runInTransaction` (context-siz) ile sarar.
 */
@Injectable()
export class DrizzleUserRepository implements UserRepository {
  async findById(id: UserId): Promise<User | null> {
    const { db } = requireTransaction();

    const rows = await db.select().from(users).where(eq(users.id, id.value)).limit(1);
    const row = rows[0];

    return row === undefined ? null : toUser(row);
  }

  async findByEmail(email: Email): Promise<User | null> {
    const { db } = requireTransaction();

    const rows = await db.select().from(users).where(eq(users.email, email.value)).limit(1);
    const row = rows[0];

    return row === undefined ? null : toUser(row);
  }

  async save(user: User): Promise<void> {
    const { db } = requireTransaction();
    const row = toUserRow(user);

    // created_at CONFLICT'te GUNCELLENMEZ: olusturulma zamani degismez.
    await db
      .insert(users)
      .values(row)
      .onConflictDoUpdate({
        target: users.id,
        set: { email: row.email, emailVerified: row.emailVerified, status: row.status },
      });
  }
}
