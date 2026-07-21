import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { SystemClock } from '../../src/infrastructure/clock/system-clock.adapter';
import { DrizzleTransactionManager } from '../../src/infrastructure/database/drizzle-transaction-manager.adapter';
import { OutboxEventPublisher } from '../../src/infrastructure/events/outbox-event-publisher.adapter';
import { UuidV7IdGenerator } from '../../src/infrastructure/id/uuid-v7-id-generator.adapter';
import { ProvisionTenantUseCase } from '../../src/modules/tenant/application/provision-tenant.use-case';
import type { TenantProvisioningPolicy } from '../../src/modules/tenant/application/tenant-provisioning-policy.port';
import { TenantSlug } from '../../src/modules/tenant/domain/tenant-slug.value-object';
import { TenantSlugAlreadyTakenError } from '../../src/modules/tenant/domain/tenant.error';
import { UserId } from '../../src/modules/tenant/domain/user-id.value-object';
import { DrizzleMembershipRepository } from '../../src/modules/tenant/infrastructure/drizzle-membership.repository';
import { DrizzleTenantRepository } from '../../src/modules/tenant/infrastructure/drizzle-tenant.repository';
import { startTestDatabase, truncateTenantTables, type TestDatabase } from './support/test-database';

/**
 * ADR-0016'nin cekirdek garantisinin GERCEK VERITABANINDA kaniti:
 *
 *   "Sahipsiz bir tenant asla var olamaz. Bu atomiklik pazarlik konusu degildir."
 *
 * Birim testleri bunu fake'lerle kanitlamisti; fake'ler dogru yazilmis
 * olabilir ama transaction semantigi hakkinda YANLIS varsayabilir. Burada
 * gercek PostgreSQL transaction'i, gercek RLS ve gercek kisitlar devrede.
 *
 * Ayrica bu, provisioning akisinin RLS ile birlikte CALISTIGININ kanitidir:
 * memberships standart RLS'e tabidir ve context kurulmadan INSERT edilemez
 * (12.4). Use case'in tek runInTenantTransaction kullanmasinin sebebi budur.
 */

const OWNER_USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-00000000000a');
const CORRELATION_ID = 'corr-integration';

/** Identity modulu Faz 3'te gelecek; onkosul burada yapilandirilabilir. */
class ConfigurablePolicy implements TenantProvisioningPolicy {
  rejection: Error | null = null;

  assertCanProvision(): Promise<void> {
    return this.rejection === null ? Promise.resolve() : Promise.reject(this.rejection);
  }
}

describe('tenant provisioning (uctan uca, gercek PostgreSQL)', () => {
  let database: TestDatabase;
  let useCase: ProvisionTenantUseCase;
  let policy: ConfigurablePolicy;

  beforeAll(async () => {
    database = await startTestDatabase();

    policy = new ConfigurablePolicy();

    useCase = new ProvisionTenantUseCase({
      tenantRepository: new DrizzleTenantRepository(),
      membershipRepository: new DrizzleMembershipRepository(),
      provisioningPolicy: policy,
      eventPublisher: new OutboxEventPublisher(),
      transactionManager: new DrizzleTransactionManager(database.appPool),
      idGenerator: new UuidV7IdGenerator(),
      clock: new SystemClock(),
    });
  }, 180_000);

  afterAll(async () => {
    await database.stop();
  });

  beforeEach(async () => {
    await truncateTenantTables(database.ownerPool);
    await database.ownerPool.query('TRUNCATE platform.outbox CASCADE');
    policy.rejection = null;
  });

  function command(slug: string) {
    return {
      ownerUserId: OWNER_USER_ID,
      name: 'Acme Ltd.',
      slug: TenantSlug.create(slug),
      correlationId: CORRELATION_ID,
    };
  }

  it('tenant i provisioning durumunda olusturur', async () => {
    const tenant = await useCase.execute(command('acme'));

    const rows = await database.ownerPool.query<{ id: string; slug: string; status: string }>(
      'SELECT id, slug, status FROM platform.tenants',
    );

    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]?.id).toBe(tenant.id.value);
    expect(rows.rows[0]?.slug).toBe('acme');
    expect(rows.rows[0]?.status).toBe('provisioning');
  });

  it('owner uyeligini ayni islemde olusturur', async () => {
    const tenant = await useCase.execute(command('acme'));

    const rows = await database.ownerPool.query<{
      tenant_id: string;
      user_id: string;
      role: string;
      status: string;
    }>('SELECT tenant_id, user_id, role, status FROM platform.memberships');

    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]?.tenant_id).toBe(tenant.id.value);
    expect(rows.rows[0]?.user_id).toBe(OWNER_USER_ID.value);
    expect(rows.rows[0]?.role).toBe('owner');
    expect(rows.rows[0]?.status).toBe('active');
  });

  it('event i outbox a yazar', async () => {
    // Sahte publisher DEGIL, gercek outbox adapter'i. Event artik gercekten
    // veritabanina yaziliyor ve ayni transaction'da commit ediliyor.
    const tenant = await useCase.execute(command('acme'));

    const rows = await database.ownerPool.query<{
      tenant_id: string;
      event_type: string;
      correlation_id: string;
      published_at: Date | null;
      payload: Record<string, unknown>;
    }>('SELECT tenant_id, event_type, correlation_id, published_at, payload FROM platform.outbox');

    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]?.tenant_id).toBe(tenant.id.value);
    expect(rows.rows[0]?.event_type).toBe('tenant.provisioning_requested');
    expect(rows.rows[0]?.correlation_id).toBe(CORRELATION_ID);
    expect(rows.rows[0]?.published_at).toBeNull();
    expect(rows.rows[0]?.payload).toMatchObject({ slug: 'acme', ownerUserId: OWNER_USER_ID.value });
  });

  it('uretilen tenant kendi context inde okunabilir', async () => {
    // RLS'in dogru kuruldugunun kaniti: yeni tenant KENDI satirini gorur.
    const tenant = await useCase.execute(command('acme'));

    const client = await database.appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant_id',
        tenant.id.value,
      ]);
      const result = await client.query('SELECT id FROM platform.tenants');
      await client.query('COMMIT');

      expect(result.rowCount).toBe(1);
    } finally {
      client.release();
    }
  });

  // --- Atomiklik ----------------------------------------------------------

  it('provisioning basarisiz olursa TENANT, UYELIK ve EVENT birlikte geri gider', async () => {
    // ADR-0016 + ADR-0006: uc yazma da ayni transaction'da. Slug catismasi
    // gercek bir basarisizlik yolu — sahte bir hata enjekte etmeye gerek yok.
    await useCase.execute(command('acme'));

    await expect(useCase.execute(command('acme'))).rejects.toThrow(TenantSlugAlreadyTakenError);

    // Ilk cagrinin urettikleri duruyor, ikincininkiler HIC olusmadi.
    const tenants = await database.ownerPool.query('SELECT id FROM platform.tenants');
    const memberships = await database.ownerPool.query('SELECT id FROM platform.memberships');
    const events = await database.ownerPool.query('SELECT id FROM platform.outbox');

    expect(tenants.rowCount).toBe(1);
    expect(memberships.rowCount).toBe(1);
    expect(events.rowCount).toBe(1);
  });

  it('her tenant satirinin bir outbox event i vardir', async () => {
    // "Tenant var ama provisioning hic baslamadi" durumunun olusamayacaginin
    // dogrudan ifadesi.
    await useCase.execute(command('acme'));
    await useCase.execute(command('globex'));

    const eventsiz = await database.ownerPool.query(
      `SELECT t.id FROM platform.tenants t
       WHERE NOT EXISTS (
         SELECT 1 FROM platform.outbox o
         WHERE o.tenant_id = t.id AND o.event_type = 'tenant.provisioning_requested'
       )`,
    );

    expect(eventsiz.rowCount).toBe(0);
  });

  it('sahipsiz tenant olusturmaz', async () => {
    // Ayni garantinin dogrudan ifadesi: her tenant satirinin bir owner
    // uyeligi vardir.
    await useCase.execute(command('acme'));

    const orphans = await database.ownerPool.query(
      `SELECT t.id FROM platform.tenants t
       WHERE NOT EXISTS (
         SELECT 1 FROM platform.memberships m
         WHERE m.tenant_id = t.id AND m.role = 'owner' AND m.status = 'active'
       )`,
    );

    expect(orphans.rowCount).toBe(0);
  });

  // --- Onkosullar ---------------------------------------------------------

  it('onkosul saglanmazsa hicbir sey yazmaz', async () => {
    policy.rejection = new Error('Once e-postanizi dogrulayin');

    await expect(useCase.execute(command('acme'))).rejects.toThrow('Once e-postanizi dogrulayin');

    const tenants = await database.ownerPool.query('SELECT id FROM platform.tenants');
    const events = await database.ownerPool.query('SELECT id FROM platform.outbox');
    expect(tenants.rowCount).toBe(0);
    expect(events.rowCount).toBe(0);
  });

  it('alinmis slug ile ikinci tenant olusturmaz', async () => {
    await useCase.execute(command('acme'));

    await expect(useCase.execute(command('acme'))).rejects.toThrow(TenantSlugAlreadyTakenError);

    const tenants = await database.ownerPool.query('SELECT id FROM platform.tenants');
    expect(tenants.rowCount).toBe(1);
  });

  it('farkli slug larla birden fazla tenant olusturulabilir', async () => {
    const first = await useCase.execute(command('acme'));
    const second = await useCase.execute(command('globex'));

    expect(first.id.value).not.toBe(second.id.value);

    const tenants = await database.ownerPool.query('SELECT id FROM platform.tenants');
    expect(tenants.rowCount).toBe(2);

    // Ayni kullanici iki tenant'ta da owner olabilir (ADR-0014: kimlik global).
    const memberships = await database.ownerPool.query(
      'SELECT id FROM platform.memberships WHERE user_id = $1',
      [OWNER_USER_ID.value],
    );
    expect(memberships.rowCount).toBe(2);
  });

  it('olusturulan tenant slug uzerinden cozumlenebilir', async () => {
    // Provisioning ile resolution zincirinin birlesme noktasi (8.2).
    const tenant = await useCase.execute(command('acme'));

    const resolved = await database.appPool.query<{ tenant_id: string; tenant_status: string }>(
      'SELECT * FROM platform.resolve_tenant($1)',
      ['acme'],
    );

    expect(resolved.rows[0]?.tenant_id).toBe(tenant.id.value);
    expect(resolved.rows[0]?.tenant_status).toBe('provisioning');
  });
});
