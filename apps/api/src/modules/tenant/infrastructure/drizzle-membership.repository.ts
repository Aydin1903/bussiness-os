import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { memberships } from '../../../infrastructure/database/schema';
import type { MembershipRepository } from '../application/membership.repository.port';
import type { MembershipId } from '../domain/membership-id.value-object';
import type { Membership } from '../domain/membership.entity';
import type { TenantId } from '../domain/tenant-id.value-object';
import type { UserId } from '../domain/user-id.value-object';
import { toMembership, toMembershipRow } from './membership.mapper';

@Injectable()
export class DrizzleMembershipRepository implements MembershipRepository {
  async findById(id: MembershipId): Promise<Membership | null> {
    const { db } = requireTransaction();

    const rows = await db.select().from(memberships).where(eq(memberships.id, id.value)).limit(1);
    const row = rows[0];

    return row === undefined ? null : toMembership(row);
  }

  /**
   * Tenant resolution'in erisim kararini veren sorgu (8.2 adim 6).
   *
   * `tenantId` parametresi 13.1'in istisnasidir ve port dosyasinda
   * gerekcelendirilmistir. RLS zaten filtreler; parametre burada bir TEKRARDIR
   * ama zararsizdir ve context kurulmus akislarda niyeti okunur kilar.
   */
  async findByTenantAndUser(tenantId: TenantId, userId: UserId): Promise<Membership | null> {
    const { db } = requireTransaction();

    const rows = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.tenantId, tenantId.value), eq(memberships.userId, userId.value)))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toMembership(row);
  }

  async save(membership: Membership): Promise<void> {
    const { db } = requireTransaction();
    const row = toMembershipRow(membership, new Date());

    await db
      .insert(memberships)
      .values(row)
      .onConflictDoUpdate({
        target: memberships.id,
        set: {
          role: row.role,
          status: row.status,
          joinedAt: row.joinedAt,
          updatedAt: row.updatedAt,
        },
      });
  }
}
