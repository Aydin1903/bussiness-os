import { Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';

import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { memberships } from '../../../infrastructure/database/schema';
import type {
  MembershipPage,
  MembershipPageResult,
  MembershipRepository,
  UserMembershipRowPage,
} from '../application/membership.repository.port';
import type { MembershipId } from '../domain/membership-id.value-object';
import type { Membership } from '../domain/membership.entity';
import type { TenantId } from '../domain/tenant-id.value-object';
import type { UserId } from '../../../shared/user-id.value-object';
import { toMembership, toMembershipRow } from './membership.mapper';

/**
 * `platform.list_user_memberships` fonksiyonunun ham satiri (+ pencere sayimi).
 *
 * `type` (interface degil): drizzle `db.execute<T>` T'nin `Record<string, unknown>`
 * kisitini saglamasini bekler; object-literal `type` implicit index signature
 * tasir, `interface` tasimaz — bu yuzden `consistent-type-definitions` burada
 * bilincli olarak devre disi.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type UserMembershipQueryRow = {
  readonly tenant_id: string;
  readonly tenant_name: string;
  readonly tenant_slug: string;
  readonly membership_role: string;
  readonly membership_status: string;
  /** `count(*) OVER ()` — pg bigint'i string dondurur; cevrimi asagida. */
  readonly total: string;
};

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

  /**
   * MEVCUT tenant'in uyelikleri, sayfali. Tenant filtresi YOK: RLS zaten aktif
   * context'in tenant'ina daraltir (12.4). `tenant_id`'yi elle eklemek gereksiz
   * bir tekrardir ve RLS'in tek dogruluk kaynagi olmasini golgeler.
   */
  async listByTenant(page: MembershipPage): Promise<MembershipPageResult> {
    const { db } = requireTransaction();

    // Tek sorguda hem sayfa hem toplam: pencere fonksiyonu `count(*) OVER ()`
    // ayri bir COUNT sorgusundan kacinir ve iki sorgu arasi tutarsizligi onler.
    const rows = await db
      .select({ row: memberships, total: sql<number>`count(*) over ()`.mapWith(Number) })
      .from(memberships)
      // DETERMINISTIK siralama: `joined_at` NULL olabilir (davetli), bu yuzden
      // ana anahtar `id`'dir — tekildir ve iki sayfanin ortusmesini onler.
      .orderBy(asc(memberships.id))
      .limit(page.limit)
      .offset(page.offset);

    return {
      items: rows.map((r) => toMembership(r.row)),
      total: rows[0]?.total ?? 0,
    };
  }

  /**
   * Kullanicinin TUM tenant'lardaki switchable uyelikleri (ADR-0028).
   *
   * Okuma, kontrollu SECURITY DEFINER fonksiyonu `platform.list_user_memberships`
   * uzerinden yapilir: fonksiyon BYPASSRLS sahibiyle FORCE-RLS memberships'i asar
   * ve YALNIZCA verilen kullanicinin aktif uyelik + aktif tenant satirlarini
   * doner. Tenant filtresi/context BURADA yok — fonksiyon zaten daraltir.
   *
   * `count(*) OVER ()`: sayfa ve toplam tek sorguda; ayri COUNT'tan ve iki sorgu
   * arasi tutarsizliktan kacinir. Siralama DETERMINISTIK (`tenant_name`, tie-break
   * `tenant_id`) — iki sayfanin ortusmesini onler.
   */
  async listUserMemberships(
    userId: UserId,
    limit: number,
    offset: number,
  ): Promise<UserMembershipRowPage> {
    const { db } = requireTransaction();

    const result = await db.execute<UserMembershipQueryRow>(sql`
      SELECT tenant_id, tenant_name, tenant_slug, membership_role, membership_status,
             count(*) OVER () AS total
      FROM platform.list_user_memberships(${userId.value})
      ORDER BY tenant_name ASC, tenant_id ASC
      LIMIT ${limit} OFFSET ${offset}
    `);

    return {
      items: result.rows.map((row) => ({
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        tenantSlug: row.tenant_slug,
        role: row.membership_role,
        status: row.membership_status,
      })),
      // Bigint string olarak doner; sayfa bossa toplam da 0'dir.
      total: Number(result.rows[0]?.total ?? 0),
    };
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
