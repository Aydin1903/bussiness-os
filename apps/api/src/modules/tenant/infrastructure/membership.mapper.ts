import { MembershipId } from '../domain/membership-id.value-object';
import { MembershipRole } from '../domain/membership-role.value-object';
import { parseMembershipStatus } from '../domain/membership-status.value-object';
import { Membership } from '../domain/membership.entity';
import { TenantId } from '../domain/tenant-id.value-object';
import { UserId } from '../domain/user-id.value-object';

/** `platform.memberships` satirinin ham bicimi. */
export interface MembershipRow {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
  readonly status: string;
  readonly joinedAt: Date | null;
}

export function toMembership(row: MembershipRow): Membership {
  return Membership.fromPersistence({
    id: MembershipId.create(row.id),
    tenantId: TenantId.create(row.tenantId),
    userId: UserId.create(row.userId),
    role: MembershipRole.create(row.role),
    status: parseMembershipStatus(row.status),
    joinedAt: row.joinedAt,
  });
}

export function toMembershipRow(
  membership: Membership,
  now: Date,
): MembershipRow & { updatedAt: Date } {
  return {
    id: membership.id.value,
    tenantId: membership.tenantId.value,
    userId: membership.userId.value,
    role: membership.role.value,
    status: membership.status,
    joinedAt: membership.joinedAt,
    updatedAt: now,
  };
}
