import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DrizzleTransactionManager } from '../../src/infrastructure/database/drizzle-transaction-manager.adapter';
import { SystemClock } from '../../src/infrastructure/clock/system-clock.adapter';
import { PublishTenantEventsUseCase } from '../../src/modules/tenant/application/publish-tenant-events.use-case';
import {
  MAX_TENANT_DELIVERY_ATTEMPTS,
  TENANT_RETRY_BASE_DELAY_MS,
} from '../../src/modules/tenant/application/tenant-outbox-retry.policy';
import { DrizzleTenantOutboxRepository } from '../../src/modules/tenant/infrastructure/drizzle-tenant-outbox.repository';
import { TenantOutboxRelay } from '../../src/modules/tenant/infrastructure/tenant-outbox-relay';
import { startTestDatabase, truncateTenantTables, type TestDatabase } from './support/test-database';

/**
 * Tenant outbox tuketicisi — gercek PostgreSQL (ADR-0006, MT 12.4.2).
 *
 * Dort seyi kanitlar:
 *   1. Bekleyen kayit gercekten islenip `published_at` aliyor mu — ve bunu
 *      TENANT CONTEXT'I OLMADAN, tenant'lar ARASI yapabiliyor mu,
 *   2. Basarisizlikta `attempt_count` artiyor ve `next_attempt_at` (backoff)
 *      yaziliyor mu; kayit backoff suresince kuyruktan CIKMIS gibi mi davraniyor,
 *   3. Dead-letter isaretlenen kayit bir daha ALINMIYOR mu,
 *   4. RLS asiminin SINIRI: `businessos_outbox_relay` rolu yalnizca
 *      `platform.outbox`'a erisebiliyor mu (ADR-0028 Constraint 2 esdegeri).
 *
 * En kritik iddia 4'tur: tuketici FORCE RLS'i asmak ZORUNDADIR ve o asimin dar
 * kaldigi ancak dogrudan dogrulanirsa bilinir.
 *
 * ============================================================================
 * `platform.outbox` FORCE RLS TASIR — testin kurulumunu da baglar
 * ============================================================================
 * Tablo sahibi (`ownerPool`) BILE politikaya takilir. Bu yuzden test verisi duz
 * bir INSERT ile yazilamaz; her yazma `SET LOCAL app.current_tenant_id` altinda
 * yapilir (`asTenant`). Bu bir test zahmeti degil, korumanin KANITIDIR: ayni
 * kisit yuzunden tuketici de fonksiyonlara ihtiyac duyuyor.
 * ============================================================================
 */
const TENANT_A = '018f3a2b-7c4d-7e1f-9b3c-000000000a01';
const TENANT_B = '018f3a2b-7c4d-7e1f-9b3c-000000000b01';
const OWNER_USER = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';

describe('tenant outbox tuketicisi (gercek PostgreSQL)', () => {
  let database: TestDatabase;
  let transactionManager: DrizzleTransactionManager;
  let repository: DrizzleTenantOutboxRepository;
  let relay: TenantOutboxRelay;

  beforeAll(async () => {
    database = await startTestDatabase();
    transactionManager = new DrizzleTransactionManager(database.appPool);
    repository = new DrizzleTenantOutboxRepository();

    const useCase = new PublishTenantEventsUseCase({
      outboxRepository: repository,
      transactionManager,
      clock: new SystemClock(),
      batchSize: 20,
    });
    // Relay burada yalnizca `runOnce` icin kullanilir; zamanlayici baslatilmaz.
    relay = new TenantOutboxRelay(useCase, { enabled: false, intervalMs: 5_000 });
  }, 180_000);

  afterAll(async () => {
    await database.stop();
  });

  beforeEach(async () => {
    await database.ownerPool.query('TRUNCATE platform.outbox CASCADE');
    await truncateTenantTables(database.ownerPool);
    await seedTenant(TENANT_A, 'acme');
    await seedTenant(TENANT_B, 'globex');
  });

  /** `platform.tenants` FORCE TASIMAZ (12.4.1); sahip rol dogrudan yazabilir. */
  async function seedTenant(id: string, slug: string): Promise<void> {
    await database.ownerPool.query(
      `INSERT INTO platform.tenants (id, name, slug, status, owner_user_id, created_at)
       VALUES ($1, $2, $3, 'active', $4, now())`,
      [id, slug.toUpperCase(), slug, OWNER_USER],
    );
  }

  /**
   * Sorguyu bir tenant context'i altinda calistirir (sahip rolle).
   *
   * `platform.outbox` FORCE tasidigi icin sahip rol de politikaya tabidir;
   * context olmadan INSERT/UPDATE/SELECT hepsi reddedilir.
   */
  async function asTenant(
    tenantId: string,
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<void> {
    const client = await database.ownerPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
      await client.query(sql, [...params]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  interface SeedOptions {
    readonly id?: string;
    readonly tenantId?: string;
    readonly eventType?: string;
    readonly attemptCount?: number;
    readonly nextAttemptAt?: Date | null;
    readonly deadLetteredAt?: Date | null;
  }

  async function seedEvent(options: SeedOptions = {}): Promise<string> {
    const id = options.id ?? randomUUID();
    const tenantId = options.tenantId ?? TENANT_A;

    await asTenant(
      tenantId,
      `INSERT INTO platform.outbox
         (id, tenant_id, event_type, event_version, payload, correlation_id,
          occurred_at, attempt_count, next_attempt_at, dead_lettered_at)
       VALUES ($1, $2, $3, 1, $4, 'corr-1', now(), $5, $6, $7)`,
      [
        id,
        tenantId,
        options.eventType ?? 'tenant.provisioning_requested',
        JSON.stringify({ tenantId, slug: 'acme' }),
        options.attemptCount ?? 0,
        options.nextAttemptAt ?? null,
        options.deadLetteredAt ?? null,
      ],
    );

    return id;
  }

  interface OutboxRow {
    readonly published_at: Date | null;
    readonly attempt_count: number;
    readonly last_error: string | null;
    readonly next_attempt_at: Date | null;
    readonly dead_lettered_at: Date | null;
  }

  /**
   * Satiri DOGRULAMA icin okur.
   *
   * RLS'i asmak icin tuketicinin kendi fonksiyonunu kullanmaz — dogrulama,
   * dogruladigi mekanizmaya dayanmamalidir. Bunun yerine BYPASSRLS tasiyan rol
   * kimligine gecilir.
   */
  async function rowOf(id: string): Promise<OutboxRow> {
    const client = await database.ownerPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE businessos_outbox_relay');
      const rows = await client.query<OutboxRow>(
        `SELECT published_at, attempt_count, last_error, next_attempt_at, dead_lettered_at
         FROM platform.outbox WHERE id = $1`,
        [id],
      );
      const row = rows.rows[0];
      if (row === undefined) {
        throw new Error(`outbox satiri bulunamadi: ${id}`);
      }
      return row;
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  }

  // --- 1. Mutlu yol ---------------------------------------------------------

  it('bekleyen kaydi isler ve published_at yazar', async () => {
    const id = await seedEvent();

    await relay.runOnce();

    expect((await rowOf(id)).published_at).not.toBeNull();
  });

  it('FARKLI tenant lara ait kayitlari AYNI turda isler (tenant context YOK)', async () => {
    // Asil iddia: FORCE RLS'e ragmen tuketici tenant'lar ARASI okuyabiliyor.
    const first = await seedEvent({ tenantId: TENANT_A });
    const second = await seedEvent({ tenantId: TENANT_B });

    await relay.runOnce();

    expect((await rowOf(first)).published_at).not.toBeNull();
    expect((await rowOf(second)).published_at).not.toBeNull();
  });

  it('claimPending kaydin tenant id sini TASIR (teslimat baglaminin parcasi)', async () => {
    await seedEvent({ tenantId: TENANT_B });

    const claimed = await transactionManager.runInTransaction(() =>
      repository.claimPending(10, new Date()),
    );

    expect(claimed[0]?.tenantId).toBe(TENANT_B);
  });

  it('islenmis kayit bir daha ALINMAZ (kismi index kuyruktan cikarir)', async () => {
    await seedEvent();
    await relay.runOnce();

    const claimed = await transactionManager.runInTransaction(() =>
      repository.claimPending(10, new Date()),
    );

    expect(claimed).toHaveLength(0);
  });

  it('handler i OLMAYAN tip isaretlenMEZ — gorunur kalir ve birikir', async () => {
    const id = await seedEvent({ eventType: 'crm.customer_created' });

    await relay.runOnce();

    // Eksik handler sessizce "islenmis" sayilmamali.
    expect((await rowOf(id)).published_at).toBeNull();
  });

  // --- 2. Basarisizlik: sayac + backoff GERCEKTEN yaziliyor mu -------------

  it('recordFailures sayaci, hatayi ve backoff anini KALICI yazar', async () => {
    const id = await seedEvent({ attemptCount: 0 });
    const nextAttemptAt = new Date(Date.now() + TENANT_RETRY_BASE_DELAY_MS);

    await transactionManager.runInTransaction(() =>
      repository.recordFailures([
        { id, attemptCount: 1, lastError: 'handler patladi', nextAttemptAt, deadLetteredAt: null },
      ]),
    );

    const row = await rowOf(id);
    expect(row.attempt_count).toBe(1);
    expect(row.last_error).toBe('handler patladi');
    expect(row.next_attempt_at?.getTime()).toBe(nextAttemptAt.getTime());
    expect(row.dead_lettered_at).toBeNull();
  });

  it('backoff suresi DOLMADAN kayit kuyrukta GORUNMEZ', async () => {
    const id = await seedEvent({ attemptCount: 1, nextAttemptAt: new Date(Date.now() + 60_000) });

    const claimed = await transactionManager.runInTransaction(() =>
      repository.claimPending(10, new Date()),
    );

    expect(claimed.map((record) => record.id)).not.toContain(id);
  });

  it('backoff suresi DOLUNCA kayit yeniden alinir ve ONCEKI sayaci tasir', async () => {
    const id = await seedEvent({ attemptCount: 1, nextAttemptAt: new Date(Date.now() - 1_000) });

    const claimed = await transactionManager.runInTransaction(() =>
      repository.claimPending(10, new Date()),
    );

    expect(claimed.map((record) => record.id)).toContain(id);
    // Sayac tuketiciye TASINIR: bir sonraki backoff/dead-letter karari buna bakar.
    expect(claimed.find((record) => record.id === id)?.attemptCount).toBe(1);
  });

  // --- 3. Dead-letter -------------------------------------------------------

  it('dead-letter isareti yazilir ve kayit kuyruktan CIKAR', async () => {
    const id = await seedEvent({ attemptCount: MAX_TENANT_DELIVERY_ATTEMPTS - 1 });

    await transactionManager.runInTransaction(() =>
      repository.recordFailures([
        {
          id,
          attemptCount: MAX_TENANT_DELIVERY_ATTEMPTS,
          lastError: 'kalici hata',
          nextAttemptAt: null,
          deadLetteredAt: new Date(),
        },
      ]),
    );

    const row = await rowOf(id);
    expect(row.attempt_count).toBe(MAX_TENANT_DELIVERY_ATTEMPTS);
    expect(row.dead_lettered_at).not.toBeNull();

    // Bir daha ASLA denenmez.
    const claimed = await transactionManager.runInTransaction(() =>
      repository.claimPending(10, new Date()),
    );
    expect(claimed.map((record) => record.id)).not.toContain(id);
  });

  it('olu kayit relay turunda da alinmaz', async () => {
    const id = await seedEvent({ deadLetteredAt: new Date() });

    await relay.runOnce();

    expect((await rowOf(id)).published_at).toBeNull();
  });

  it('bir kayit AYNI ANDA hem yayinlanmis hem olu OLAMAZ (CHECK kisiti)', async () => {
    const id = await seedEvent();

    await expect(
      asTenant(
        TENANT_A,
        'UPDATE platform.outbox SET published_at = now(), dead_lettered_at = now() WHERE id = $1',
        [id],
      ),
    ).rejects.toThrow(/outbox_terminal_state_check/);
  });

  it('attempt_count NEGATIF olamaz (CHECK kisiti)', async () => {
    const id = await seedEvent();

    await expect(
      asTenant(TENANT_A, 'UPDATE platform.outbox SET attempt_count = -1 WHERE id = $1', [id]),
    ).rejects.toThrow(/outbox_attempt_count_check/);
  });

  // --- 4. Constraint 2 esdegeri: RLS asiminin SINIRI -----------------------

  /**
   * Sorguyu `businessos_outbox_relay` rolu KIMLIGINDE calistirir.
   *
   * `SET LOCAL ROLE` + transaction: rol yalnizca transaction boyunca gecerlidir
   * ve ROLLBACK'te kendiliginden sifirlanir — havuz baglantisini KIRLETMEZ.
   * `me-memberships.integration.spec.ts`'teki `asRlsReader` ile ayni desen.
   */
  async function asOutboxRelay(sql: string): Promise<unknown> {
    const client = await database.ownerPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE businessos_outbox_relay');
      return await client.query(sql);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  }

  describe('businessos_outbox_relay dar rolu BASKA hicbir seye erisemez', () => {
    it('kendi fonksiyonlarinin dokundugu tabloya erisebilir (outbox)', async () => {
      // Bu IZINLIDIR — fonksiyonlarin calismasi icin gereklidir.
      await expect(asOutboxRelay('SELECT 1 FROM platform.outbox LIMIT 1')).resolves.toBeDefined();
    });

    it('BASKA tablolara SELECT REDDEDILIR (tenants, identity_outbox, users, memberships)', async () => {
      for (const table of ['tenants', 'identity_outbox', 'users', 'memberships', 'credentials']) {
        await expect(
          asOutboxRelay(`SELECT 1 FROM platform.${table} LIMIT 1`),
          `platform.${table} erisilebilir OLMAMALI`,
        ).rejects.toThrow(/permission denied/i);
      }
    });

    it('outbox a INSERT ve DELETE REDDEDILIR (yalnizca SELECT + UPDATE verildi)', async () => {
      await expect(
        asOutboxRelay(
          `INSERT INTO platform.outbox (id, tenant_id, event_type, event_version, payload,
             correlation_id, occurred_at)
           VALUES (gen_random_uuid(), '${TENANT_A}', 'x', 1, '{}'::jsonb, 'c', now())`,
        ),
      ).rejects.toThrow(/permission denied/i);

      await expect(asOutboxRelay('DELETE FROM platform.outbox')).rejects.toThrow(
        /permission denied/i,
      );
    });

    it('BASKA fonksiyonlara EXECUTE REDDEDILIR (resolve_tenant, list_user_memberships)', async () => {
      await expect(asOutboxRelay("SELECT platform.resolve_tenant('x')")).rejects.toThrow(
        /permission denied/i,
      );
      await expect(
        asOutboxRelay(`SELECT platform.list_user_memberships('${OWNER_USER}'::uuid)`),
      ).rejects.toThrow(/permission denied/i);
    });

    it('rol NOLOGIN ve BYPASSRLS tasir (dar ama tek yetenegi bypass)', async () => {
      const rows = await database.ownerPool.query<{ rolcanlogin: boolean; rolbypassrls: boolean }>(
        "SELECT rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname = 'businessos_outbox_relay'",
      );
      expect(rows.rows[0]?.rolcanlogin).toBe(false);
      expect(rows.rows[0]?.rolbypassrls).toBe(true);
    });

    it('standing sema-yazma yetkisi TUTMAZ (CREATE gecici verilip geri alindi)', async () => {
      const rows = await database.ownerPool.query<{ create: boolean }>(
        "SELECT has_schema_privilege('businessos_outbox_relay', 'platform', 'CREATE') AS create",
      );
      expect(rows.rows[0]?.create).toBe(false);
    });

    it('UYGULAMA rolu outbox u tenant context i OLMADAN OKUYAMAZ — asim yalnizca fonksiyonda', async () => {
      await seedEvent();

      // Duz SELECT: RLS politikasi `current_setting`e bakar ve context yoksa
      // HATA verir (sessiz bos sonuc DEGIL — 12.6 madde 4).
      const client = await database.appPool.connect();
      try {
        await expect(client.query('SELECT 1 FROM platform.outbox')).rejects.toThrow();
      } finally {
        client.release();
      }
    });
  });
});
