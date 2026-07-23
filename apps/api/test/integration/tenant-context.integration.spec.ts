import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DrizzleTransactionManager } from '../../src/infrastructure/database/drizzle-transaction-manager.adapter';
import { requireTransaction } from '../../src/infrastructure/database/transaction-context';
import { memberships } from '../../src/infrastructure/database/schema';
import { runWithTenantContext } from '../../src/infrastructure/tenant/tenant-context';
import { MissingTenantContextError } from '../../src/shared/transaction-manager.port';
import { startTestDatabase, truncateTenantTables, type TestDatabase } from './support/test-database';

/**
 * Ambient tenant context -> RLS baglantisi (gercek PostgreSQL).
 *
 * ============================================================================
 * BU TESTIN KANITLADIGI SEY
 * ============================================================================
 * `runInCurrentTenantTransaction`, istegin context'ini `SET LOCAL
 * app.current_tenant_id`'ye cevirir ve RLS GERCEKTEN daralir. Birim testleri
 * fake transaction manager ile calisir ve RLS'i hic gormez; buradaki sorgular
 * uygulama roluyle (`businessos_app`) calisir ve politikalara TABIDIR.
 *
 * Sahip rolle test edilseydi HER SEY YESIL YANAR ve hicbir sey kanitlanmazdi.
 * ============================================================================
 */

const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000a1';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-0000000000a2';
const USER_A = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';
const USER_B = '018f3a2b-7c4d-7e1f-9b3c-00000000000b';
const MEMBERSHIP_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000c1';
const MEMBERSHIP_B = '018f3a2b-7c4d-7e1f-8a2b-0000000000c2';

function contextFor(tenantId: string, userId: string) {
  return {
    tenantId,
    userId,
    role: 'owner',
    correlationId: 'corr-1',
    source: 'http' as const,
  };
}

describe('tenant context -> RLS baglantisi (gercek PostgreSQL)', () => {
  let database: TestDatabase;
  let transactionManager: DrizzleTransactionManager;

  beforeAll(async () => {
    database = await startTestDatabase();
    // UYGULAMA havuzu: RLS'e tabidir. Sahip havuzu politikaları atlar.
    transactionManager = new DrizzleTransactionManager(database.appPool);
  }, 180_000);

  afterAll(async () => {
    await database.stop();
  });

  beforeEach(async () => {
    await truncateTenantTables(database.ownerPool);

    await database.ownerPool.query(
      `INSERT INTO platform.tenants (id, slug, name, status, owner_user_id)
       VALUES ($1, 'tenant-a', 'Tenant A', 'active', $3),
              ($2, 'tenant-b', 'Tenant B', 'active', $4)`,
      [TENANT_A, TENANT_B, USER_A, USER_B],
    );
    await database.ownerPool.query(
      `INSERT INTO platform.memberships (id, tenant_id, user_id, role, status, joined_at)
       VALUES ($1, $3, $5, 'owner', 'active', now()),
              ($2, $4, $6, 'owner', 'active', now())`,
      [MEMBERSHIP_A, MEMBERSHIP_B, TENANT_A, TENANT_B, USER_A, USER_B],
    );
  });

  /** Aktif transaction icindeki membership satirlarini sayar. */
  async function countVisibleMemberships(): Promise<number> {
    const { db } = requireTransaction();
    const rows = await db.select().from(memberships);
    return rows.length;
  }

  it('context YOKSA transaction ACILMAZ — fail closed', async () => {
    await expect(
      transactionManager.runInCurrentTenantTransaction(async () => countVisibleMemberships()),
    ).rejects.toThrow(MissingTenantContextError);
  });

  it('context varsa RLS o tenant a DARALIR', async () => {
    const visible = await runWithTenantContext(contextFor(TENANT_A, USER_A), () =>
      transactionManager.runInCurrentTenantTransaction(async () => countVisibleMemberships()),
    );

    // Iki tenant'in ikisinin de uyeligi var; yalnizca A'ninki gorunur.
    expect(visible).toBe(1);
  });

  it('BASKA tenant in satiri context altinda GORUNMEZ', async () => {
    const rows = await runWithTenantContext(contextFor(TENANT_A, USER_A), () =>
      transactionManager.runInCurrentTenantTransaction(async () => {
        const { db } = requireTransaction();
        return db.select().from(memberships);
      }),
    );

    expect(rows.map((row) => row.tenantId)).toEqual([TENANT_A]);
  });

  it('farkli context, farkli sonuc — ayni havuz', async () => {
    const fromA = await runWithTenantContext(contextFor(TENANT_A, USER_A), () =>
      transactionManager.runInCurrentTenantTransaction(async () => {
        const { db } = requireTransaction();
        return db.select().from(memberships);
      }),
    );
    const fromB = await runWithTenantContext(contextFor(TENANT_B, USER_B), () =>
      transactionManager.runInCurrentTenantTransaction(async () => {
        const { db } = requireTransaction();
        return db.select().from(memberships);
      }),
    );

    expect(fromA.map((r) => r.tenantId)).toEqual([TENANT_A]);
    expect(fromB.map((r) => r.tenantId)).toEqual([TENANT_B]);
  });

  it('transaction tenant id yi transaction store una tasir', async () => {
    const carried = await runWithTenantContext(contextFor(TENANT_A, USER_A), () =>
      transactionManager.runInCurrentTenantTransaction(async () =>
        Promise.resolve(requireTransaction().tenantId),
      ),
    );

    expect(carried).toBe(TENANT_A);
  });

  it('SET LOCAL transaction sonrasi baglantida KALMAZ', async () => {
    await runWithTenantContext(contextFor(TENANT_A, USER_A), () =>
      transactionManager.runInCurrentTenantTransaction(async () => countVisibleMemberships()),
    );

    // Ayni havuzdan gelen bir sonraki transaction, context'siz oldugu icin
    // REDDEDILMELI — onceki `SET LOCAL` sizmis olsaydi sessizce calisirdi.
    await expect(
      transactionManager.runInCurrentTenantTransaction(async () => countVisibleMemberships()),
    ).rejects.toThrow(MissingTenantContextError);
  });

  it('hata durumunda ROLLBACK olur ve yazim kalmaz', async () => {
    await expect(
      runWithTenantContext(contextFor(TENANT_A, USER_A), () =>
        transactionManager.runInCurrentTenantTransaction(async () => {
          const { db } = requireTransaction();
          await db.insert(memberships).values({
            id: '018f3a2b-7c4d-7e1f-8a2b-0000000000c9',
            tenantId: TENANT_A,
            userId: '018f3a2b-7c4d-7e1f-9b3c-00000000000c',
            role: 'member',
            status: 'active',
            joinedAt: new Date(),
          });
          throw new Error('use case patladi');
        }),
      ),
    ).rejects.toThrow('use case patladi');

    const rows = await database.ownerPool.query(
      'SELECT 1 FROM platform.memberships WHERE tenant_id = $1',
      [TENANT_A],
    );
    expect(rows.rowCount).toBe(1);
  });

  it('acik tenantId alan surum context ten BAGIMSIZ calisir (bootstrap yolu)', async () => {
    // Cozumleme/provisioning context KURULMADAN once calisir; o yol korunmali.
    const visible = await transactionManager.runInTenantTransaction(TENANT_B, async () =>
      countVisibleMemberships(),
    );

    expect(visible).toBe(1);
  });
});
