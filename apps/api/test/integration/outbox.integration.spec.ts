import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DrizzleTransactionManager } from '../../src/infrastructure/database/drizzle-transaction-manager.adapter';
import { OutboxEventPublisher } from '../../src/infrastructure/events/outbox-event-publisher.adapter';
import { DrizzleTenantRepository } from '../../src/modules/tenant/infrastructure/drizzle-tenant.repository';
import { Tenant } from '../../src/modules/tenant/domain/tenant.entity';
import { TenantId } from '../../src/modules/tenant/domain/tenant-id.value-object';
import { TenantSlug } from '../../src/modules/tenant/domain/tenant-slug.value-object';
import { UserId } from '../../src/modules/tenant/domain/user-id.value-object';
import type { DomainEvent } from '../../src/shared/domain-event';
import { startTestDatabase, truncateTenantTables, type TestDatabase } from './support/test-database';

/**
 * Transactional outbox'in GERCEK PostgreSQL'e karsi dogrulanmasi (ADR-0006).
 *
 * Outbox'in tum degeri ATOMIKLIKTEN gelir: event, onu doguran veri
 * degisikligiyle ayni transaction'da yazilir. Bu testler o garantiyi dogrudan
 * kanitlar — birim testiyle kanitlanamaz, cunku kanitlanan sey veritabaninin
 * transaction semantigidir.
 */

const TENANT_A_ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000a';
const TENANT_B_ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000b';
const USER_A_ID = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';
const OCCURRED_AT = new Date('2026-07-21T10:00:00.000Z');

function eventFor(tenantId: string, eventId: string): DomainEvent {
  return {
    eventId,
    eventType: 'tenant.provisioning_requested',
    eventVersion: 1,
    tenantId,
    occurredAt: OCCURRED_AT,
    correlationId: 'corr-outbox',
    payload: { slug: 'acme', nested: { deger: 42 } },
  };
}

/**
 * RLS ihlalini `cause` zincirinde arar.
 *
 * Drizzle pg hatasini KENDI nesnesine sarar ve mesaji "Failed query: ..."
 * olarak degistirir; orijinal PostgreSQL mesaji `cause` altinda kalir. Ust
 * seviye mesaja bakan bir iddia, RLS ihlalini baska bir hatadan ayirt EDEMEZ.
 */
async function expectRlsViolation(operation: Promise<unknown>): Promise<void> {
  let thrown: unknown = null;
  try {
    await operation;
  } catch (error: unknown) {
    thrown = error;
  }

  expect(thrown).not.toBeNull();

  const messages: string[] = [];
  for (let current = thrown; current !== null && current !== undefined; ) {
    if (typeof current !== 'object') break;
    if ('message' in current && typeof current.message === 'string') {
      messages.push(current.message);
    }
    current = 'cause' in current ? current.cause : null;
  }

  expect(messages.join(' | ')).toMatch(/row-level security/i);
}

describe('transactional outbox (gercek PostgreSQL)', () => {
  let database: TestDatabase;
  let transactionManager: DrizzleTransactionManager;
  let publisher: OutboxEventPublisher;
  let tenantRepository: DrizzleTenantRepository;

  beforeAll(async () => {
    database = await startTestDatabase();
    transactionManager = new DrizzleTransactionManager(database.appPool);
    publisher = new OutboxEventPublisher();
    tenantRepository = new DrizzleTenantRepository();
  }, 180_000);

  afterAll(async () => {
    await database.stop();
  });

  beforeEach(async () => {
    await database.ownerPool.query('TRUNCATE platform.outbox CASCADE');
    await truncateTenantTables(database.ownerPool);
  });

  /** Outbox satiri tenants'a FK verir; once tenant olmali. */
  async function seedTenant(id: string, slug: string): Promise<void> {
    await transactionManager.runInTenantTransaction(id, async () => {
      await tenantRepository.save(
        Tenant.provision({
          id: TenantId.create(id),
          slug: TenantSlug.create(slug),
          name: `Tenant ${slug}`,
          ownerUserId: UserId.create(USER_A_ID),
          createdAt: OCCURRED_AT,
        }),
      );
    });
  }

  it('event i outbox a yazar', async () => {
    await seedTenant(TENANT_A_ID, 'acme');

    await transactionManager.runInTenantTransaction(TENANT_A_ID, async () => {
      await publisher.publish(eventFor(TENANT_A_ID, '018f3a2b-7c4d-7e1f-8a2b-000000000001'));
    });

    const rows = await database.ownerPool.query<{
      id: string;
      tenant_id: string;
      event_type: string;
      event_version: number;
      correlation_id: string;
      published_at: Date | null;
    }>('SELECT * FROM platform.outbox');

    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]?.id).toBe('018f3a2b-7c4d-7e1f-8a2b-000000000001');
    expect(rows.rows[0]?.tenant_id).toBe(TENANT_A_ID);
    expect(rows.rows[0]?.event_type).toBe('tenant.provisioning_requested');
    expect(rows.rows[0]?.event_version).toBe(1);
    expect(rows.rows[0]?.correlation_id).toBe('corr-outbox');
  });

  it('yeni event i yayinlanmamis olarak isaretler', async () => {
    await seedTenant(TENANT_A_ID, 'acme');

    await transactionManager.runInTenantTransaction(TENANT_A_ID, async () => {
      await publisher.publish(eventFor(TENANT_A_ID, '018f3a2b-7c4d-7e1f-8a2b-000000000002'));
    });

    const rows = await database.ownerPool.query<{ published_at: Date | null }>(
      'SELECT published_at FROM platform.outbox',
    );

    // Yayinlama publisher surecinin isidir; yazan taraf doldurmaz.
    expect(rows.rows[0]?.published_at).toBeNull();
  });

  it('payload i jsonb olarak eksiksiz saklar', async () => {
    await seedTenant(TENANT_A_ID, 'acme');

    await transactionManager.runInTenantTransaction(TENANT_A_ID, async () => {
      await publisher.publish(eventFor(TENANT_A_ID, '018f3a2b-7c4d-7e1f-8a2b-000000000003'));
    });

    const rows = await database.ownerPool.query<{ payload: Record<string, unknown> }>(
      'SELECT payload FROM platform.outbox',
    );

    // Ic ice yapi da korunmali: publisher payload'i oldugu gibi tasiyacak.
    expect(rows.rows[0]?.payload).toEqual({ slug: 'acme', nested: { deger: 42 } });
  });

  // --- Atomiklik: outbox'in var olus sebebi -------------------------------

  it('transaction geri alinirsa event de kalmaz', async () => {
    // ADR-0006'nin cekirdegi. Event dogrudan kuyruga yazilsaydi bu senaryoda
    // is degisikligi geri gider ama event yayinlanmis olarak KALIRDI.
    await seedTenant(TENANT_A_ID, 'acme');

    await expect(
      transactionManager.runInTenantTransaction(TENANT_A_ID, async () => {
        await publisher.publish(eventFor(TENANT_A_ID, '018f3a2b-7c4d-7e1f-8a2b-000000000004'));
        throw new Error('is mantigi patladi');
      }),
    ).rejects.toThrow('is mantigi patladi');

    const rows = await database.ownerPool.query('SELECT id FROM platform.outbox');
    expect(rows.rowCount).toBe(0);
  });

  it('transaction disinda yayin yapmayi reddeder', async () => {
    // Transaction'siz yazilan bir outbox satiri outbox'i ANLAMSIZ kilar:
    // atomiklik garantisi tam olarak transaction'dan gelir.
    await expect(
      publisher.publish(eventFor(TENANT_A_ID, '018f3a2b-7c4d-7e1f-8a2b-000000000005')),
    ).rejects.toThrow(/Aktif transaction yok/);
  });

  it('ayni event i iki kez yazmayi reddeder', async () => {
    await seedTenant(TENANT_A_ID, 'acme');
    const event = eventFor(TENANT_A_ID, '018f3a2b-7c4d-7e1f-8a2b-000000000006');

    await transactionManager.runInTenantTransaction(TENANT_A_ID, async () => {
      await publisher.publish(event);
    });

    // Ayni eventId'nin iki kez URETILMESI bir hatadir; birincil anahtar bunu
    // yakalar. (Handler tarafindaki at-least-once idempotency'si ayri konu.)
    await expect(
      transactionManager.runInTenantTransaction(TENANT_A_ID, async () => {
        await publisher.publish(event);
      }),
    ).rejects.toThrow();
  });

  it('tenant siz event i acikca reddeder', async () => {
    await seedTenant(TENANT_A_ID, 'acme');

    const tenantlessEvent: DomainEvent = { ...eventFor(TENANT_A_ID, '018f3a2b-7c4d-7e1f-8a2b-000000000007'), tenantId: null };

    // Sessizce yutulmaz: Identity modulu geldiginde bu hata, karar verilmesi
    // gereken yeri gosterir (15.1).
    await expect(
      transactionManager.runInTenantTransaction(TENANT_A_ID, async () => {
        await publisher.publish(tenantlessEvent);
      }),
    ).rejects.toThrow(/Tenant'siz event/);
  });

  // --- RLS ----------------------------------------------------------------

  it('baska tenant in outbox satirini okuyamaz', async () => {
    await seedTenant(TENANT_A_ID, 'acme');
    await seedTenant(TENANT_B_ID, 'globex');

    await transactionManager.runInTenantTransaction(TENANT_B_ID, async () => {
      await publisher.publish(eventFor(TENANT_B_ID, '018f3a2b-7c4d-7e1f-8a2b-000000000008'));
    });

    const visible = await transactionManager.runInTenantTransaction(TENANT_A_ID, async () => {
      const result = await database.appPool.query('SELECT 1');
      return result.rowCount;
    });
    expect(visible).toBe(1); // havuz calisiyor

    // A'nin context'inde B'nin satiri gorunmez.
    const client = await database.appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant_id',
        TENANT_A_ID,
      ]);
      const rows = await client.query('SELECT id FROM platform.outbox');
      await client.query('COMMIT');

      expect(rows.rowCount).toBe(0);
    } finally {
      client.release();
    }
  });

  it('baska tenant adina event yazamaz', async () => {
    await seedTenant(TENANT_A_ID, 'acme');
    await seedTenant(TENANT_B_ID, 'globex');

    // WITH CHECK ihlali: A'nin context'inde B'ye ait event yazilamaz.
    await expectRlsViolation(
      transactionManager.runInTenantTransaction(TENANT_A_ID, async () => {
        await publisher.publish(eventFor(TENANT_B_ID, '018f3a2b-7c4d-7e1f-8a2b-000000000009'));
      }),
    );
  });
});
