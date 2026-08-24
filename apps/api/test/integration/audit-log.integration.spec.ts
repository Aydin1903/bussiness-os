import { randomUUID } from 'node:crypto';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { APP_ROLE, APP_PASSWORD, createApplicationRole } from './support/database-roles';
import { POSTGRES_IMAGE } from './support/test-database';

/**
 * `platform.audit_log` — ADR-0043 §6 (kalem A), migration `0032`.
 *
 * ============================================================================
 * ⚠️ BU DOSYA DORT SEYIN KANITIDIR VE DORDU DE BIRIM TESTIYLE GORULEMEZ
 * ============================================================================
 *   1. ⚠️ **DEGER KOLONU YOKTUR** (§6.5) — kolon kumesi BIREBIR sabitlenir.
 *      `audit-rows.spec.ts` uygulamanin deger yazmadigini kanitlar; burasi
 *      degerin YAZILACAK BIR YERI OLMADIGINI kanitlar. Ikisi ayri sorulardir:
 *      biri bugunku kodu, digeri yarinki kodu baglar.
 *   2. ⚠️ **DEGISMEZLIK IKI KATMANLIDIR** — yetki (`businessos_app`te UPDATE/
 *      DELETE yok) ve trigger (TABLO SAHIBINI de reddeder). Ikisi de yalnizca
 *      gercek bir veritabaninda gosterilebilir.
 *   3. MIGRATION GERCEKTEN UYGULANDI (tablonun + trigger'in + index'lerin
 *      VARLIGI) — CLAUDE.md'nin kalici dersi.
 *   4. RLS izolasyonu (MT §12.6): tenant A, B'nin denetim kaydini GOREMEZ ve
 *      onun adina YAZAMAZ; context'siz sorgu SESSIZCE BOS DONMEZ, HATA VERIR.
 */

const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000d1';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-0000000000d2';
const USER_A = '018f3a2b-7c4d-7e1f-9b3c-0000000000d1';
const USER_B = '018f3a2b-7c4d-7e1f-9b3c-0000000000d2';
const EMPLOYEE = '018f3a2b-7c4d-7e1f-9b3c-0000000000e9';

/** Tablonun IZIN VERILEN kolon kumesi — ADR-0043 §6.4'un tablosuyla birebir. */
const ALLOWED_COLUMNS = [
  'action',
  'actor_user_id',
  'field_name',
  'id',
  'occurred_at',
  'resource_id',
  'resource_type',
  'tenant_id',
];

describe('platform.audit_log (gercek PostgreSQL)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    ownerPool = new Pool({ connectionString: container.getConnectionUri() });
    await createApplicationRole(ownerPool, container.getDatabase());
    await migrate(drizzle(ownerPool), { migrationsFolder: 'drizzle', migrationsSchema: 'drizzle' });

    appPool = new Pool({
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      user: APP_ROLE,
      password: APP_PASSWORD,
      max: 5,
    });

    await ownerPool.query(
      `INSERT INTO platform.tenants (id, slug, name, status, owner_user_id)
       VALUES ($1, 'tenant-audit-a', 'Tenant A', 'active', $3),
              ($2, 'tenant-audit-b', 'Tenant B', 'active', $4)`,
      [TENANT_A, TENANT_B, USER_A, USER_B],
    );
  }, 180_000);

  afterAll(async () => {
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  beforeEach(async () => {
    // ⚠️ `TRUNCATE` kullanilir, `DELETE` DEGIL: `DELETE` degismezlik
    // trigger'ina takilirdi. Satir seviyesi trigger `TRUNCATE`i gormez ve bu
    // BILINCLIDIR (migration yorumu) — test kurulumu icin tek yol budur.
    await ownerPool.query('TRUNCATE platform.audit_log');
  });

  async function asTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function insertEntry(
    tenantId: string,
    overrides: {
      actorUserId?: string | null;
      action?: string;
      fieldName?: string | null;
      resourceId?: string;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO platform.audit_log
           (id, tenant_id, actor_user_id, occurred_at, resource_type, resource_id, action, field_name)
         VALUES ($1, $2, $3, now(), 'hr.employee', $4, $5, $6)`,
        [
          id,
          tenantId,
          overrides.actorUserId === undefined ? USER_A : overrides.actorUserId,
          overrides.resourceId ?? EMPLOYEE,
          overrides.action ?? 'updated',
          overrides.fieldName === undefined ? 'job_title' : overrides.fieldName,
        ],
      ),
    );
    return id;
  }

  // ==========================================================================
  // 1. ⚠️ DEGER SAKLANMAZ — YALNIZCA ALAN ADI (ADR-0043 §6.5)
  // ==========================================================================
  describe('⚠️ DEGER KOLONU YOKTUR', () => {
    it('kolon kumesi BIREBIR sabittir — fazladan bir kolon testi KIRAR', () => {
      // ⚠️ BU TESTIN ISI BIR YOKLUGU KORUMAKTIR. `audit-rows.spec.ts`
      // uygulamanin bugun deger yazmadigini kanitlar; bu test degerin
      // YAZILACAK BIR YERI olmadigini kanitlar. Bir gun birisi
      // `ALTER TABLE ... ADD COLUMN old_value text` yazarsa, uygulama kodu hic
      // degismese bile bu test kirmizi yanar ve ADR-0043 §6.5'i okumaya
      // zorlar.
      return ownerPool
        .query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'platform' AND table_name = 'audit_log'
           ORDER BY column_name`,
        )
        .then((result) => {
          expect(result.rows.map((row) => row.column_name)).toEqual(ALLOWED_COLUMNS);
        });
    });

    it('deger tasiyabilecek adlarda HICBIR kolon yoktur', () => {
      // Ikinci bir agdan gecirilir: yukaridaki test kolon kumesini sabitler,
      // bu test NIYETI adlandirir. Biri guncellenip digeri unutulursa fark
      // gorunur olur.
      const forbidden = [
        'value',
        'old_value',
        'new_value',
        'before_value',
        'after_value',
        'previous_value',
        'payload',
        'details',
        'diff',
        'changes',
        'data',
      ];

      return ownerPool
        .query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'platform' AND table_name = 'audit_log'`,
        )
        .then((result) => {
          const columns = result.rows.map((row) => row.column_name);
          for (const name of forbidden) {
            expect(columns).not.toContain(name);
          }
        });
    });

    it('yazilan satirda maasin kendisi DEGIL, alanin ADI durur', async () => {
      // Senaryonun tamami: IK'da bir maas degisti. Denetim kaydi bunu
      // `field_name = 'amount'` olarak tutar. Eski/yeni tutar hicbir yerde
      // YOKTUR — ve zaten `hr.compensation_records`ta durur (§6.2).
      await insertEntry(TENANT_A, { fieldName: 'amount' });

      const rows = await asTenant(TENANT_A, (client) =>
        client
          .query<{ field_name: string | null }>('SELECT * FROM platform.audit_log')
          .then((result) => result.rows),
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.field_name).toBe('amount');
      expect(Object.keys(rows[0] ?? {}).sort()).toEqual(ALLOWED_COLUMNS);
    });
  });

  // ==========================================================================
  // 2. ⚠️ DEGISMEZLIK — IKI KATMAN
  // ==========================================================================
  describe('⚠️ DEGISMEZ', () => {
    it('KATMAN 1 — `businessos_app` UPDATE ve DELETE yetkisi TASIMAZ', async () => {
      // MT §12.4'un yazili kurali: "UPDATE/DELETE yetkisi hicbir role verilmez".
      const result = await ownerPool.query<{
        can_select: boolean;
        can_insert: boolean;
        can_update: boolean;
        can_delete: boolean;
      }>(
        `SELECT has_table_privilege($1, 'platform.audit_log', 'SELECT') AS can_select,
                has_table_privilege($1, 'platform.audit_log', 'INSERT') AS can_insert,
                has_table_privilege($1, 'platform.audit_log', 'UPDATE') AS can_update,
                has_table_privilege($1, 'platform.audit_log', 'DELETE') AS can_delete`,
        [APP_ROLE],
      );

      expect(result.rows[0]).toEqual({
        can_select: true,
        can_insert: true,
        can_update: false,
        can_delete: false,
      });
    });

    it('KATMAN 1 — uygulama rolunun UPDATE denemesi REDDEDILIR', async () => {
      await insertEntry(TENANT_A);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query("UPDATE platform.audit_log SET field_name = 'work_phone'"),
        ),
      ).rejects.toThrow();
    });

    it('⚠️ KATMAN 2 — TABLO SAHIBI bile UPDATE edemez (trigger)', async () => {
      // Katman 1 yalnizca `businessos_app`i baglar. `businessos_owner` tablonun
      // SAHIBIDIR: yetkisi GRANT ile degil sahiplikle gelir ve katman 1'i
      // tumuyle asar. ADR-0041 §2'nin trigger karariyla ayni sinif — kontrol
      // uygulama katmaninin ULASAMADIGI yere konur.
      await insertEntry(TENANT_A);

      await expect(
        ownerPool.query("UPDATE platform.audit_log SET action = 'created'"),
      ).rejects.toThrow(/degismezdir/i);
    });

    it('⚠️ KATMAN 2 — TABLO SAHIBI bile DELETE edemez (trigger)', async () => {
      await insertEntry(TENANT_A);

      await expect(ownerPool.query('DELETE FROM platform.audit_log')).rejects.toThrow(
        /degismezdir/i,
      );

      const remaining = await ownerPool.query('SELECT id FROM platform.audit_log');
      expect(remaining.rowCount).toBe(1);
    });
  });

  // ==========================================================================
  // 3. MIGRATION GERCEKTEN UYGULANDI
  // ==========================================================================
  describe('migration', () => {
    it('degismezlik trigger i ve fonksiyonu GERCEKTEN olusturuldu', async () => {
      const trigger = await ownerPool.query(
        `SELECT 1 FROM pg_trigger t
           JOIN pg_class c ON c.oid = t.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'platform' AND c.relname = 'audit_log'
            AND t.tgname = 'audit_log_append_only' AND NOT t.tgisinternal`,
      );
      const fn = await ownerPool.query(
        `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'platform' AND p.proname = 'audit_log_append_only'`,
      );

      expect(trigger.rowCount).toBe(1);
      expect(fn.rowCount).toBe(1);
    });

    it('iki index de olusturuldu ve ikisi de `tenant_id` ile baslar (MT §12.3)', async () => {
      const result = await ownerPool.query<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef FROM pg_indexes
          WHERE schemaname = 'platform' AND tablename = 'audit_log'
            AND indexname <> 'audit_log_pkey'
          ORDER BY indexname`,
      );

      expect(result.rows.map((row) => row.indexname)).toEqual([
        'audit_log_recent_idx',
        'audit_log_resource_idx',
      ]);
      for (const row of result.rows) {
        expect(row.indexdef).toMatch(/\(tenant_id/);
      }
    });

    it('RLS ENABLE + FORCE tasir (MT §12.2)', async () => {
      const result = await ownerPool.query<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT c.relrowsecurity, c.relforcerowsecurity FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'platform' AND c.relname = 'audit_log'`,
      );

      expect(result.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    });
  });

  // ==========================================================================
  // 4. KISITLAR
  // ==========================================================================
  describe('kisitlar', () => {
    it('`updated` bir ALAN adlandirmak ZORUNDADIR', async () => {
      await expect(insertEntry(TENANT_A, { fieldName: null })).rejects.toThrow(
        /audit_log_field_name_matches_action/,
      );
    });

    it('`created` alan adi TASIYAMAZ', async () => {
      await expect(
        insertEntry(TENANT_A, { action: 'created', fieldName: 'job_title' }),
      ).rejects.toThrow(/audit_log_field_name_matches_action/);
    });

    it('`created` ve `deleted` alan adi OLMADAN yazilir', async () => {
      await expect(
        insertEntry(TENANT_A, { action: 'created', fieldName: null }),
      ).resolves.toBeTypeOf('string');
      await expect(
        insertEntry(TENANT_A, { action: 'deleted', fieldName: null }),
      ).resolves.toBeTypeOf('string');
    });

    it('taninmayan bir fiil REDDEDILIR', async () => {
      await expect(insertEntry(TENANT_A, { action: 'archived' })).rejects.toThrow(
        /audit_log_action_valid/,
      );
    });

    it('⚠️ aktor NULL olabilir — sistem/worker (§6.4)', async () => {
      await insertEntry(TENANT_A, { actorUserId: null });

      const rows = await asTenant(TENANT_A, (client) =>
        client
          .query<{ actor_user_id: string | null }>('SELECT actor_user_id FROM platform.audit_log')
          .then((result) => result.rows),
      );

      expect(rows[0]?.actor_user_id).toBeNull();
    });

    it('⚠️ kaynak turu NUMARALANDIRILMAZ — platform modul sozlugunu bilmez', async () => {
      // `platform.rate_limits.action` ile ayni karar: bir CHECK listesi, her
      // yeni modulde bir PLATFORM migration i gerektirirdi.
      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO platform.audit_log
               (id, tenant_id, actor_user_id, occurred_at, resource_type, resource_id, action, field_name)
             VALUES ($1, $2, $3, now(), 'gelecek.modul', $4, 'created', NULL)`,
            [randomUUID(), TENANT_A, USER_A, EMPLOYEE],
          ),
        ),
      ).resolves.toBeDefined();
    });
  });

  // ==========================================================================
  // 5. RLS IZOLASYONU (MT §12.6)
  // ==========================================================================
  describe('tenant izolasyonu', () => {
    it('baska tenant in denetim kaydi GORUNMEZ', async () => {
      await insertEntry(TENANT_A);
      await insertEntry(TENANT_B);

      const seenByA = await asTenant(TENANT_A, (client) =>
        client
          .query<{ tenant_id: string }>('SELECT tenant_id FROM platform.audit_log')
          .then((result) => result.rows),
      );

      expect(seenByA).toHaveLength(1);
      expect(seenByA[0]?.tenant_id).toBe(TENANT_A);
    });

    it('baska tenant adina YAZILAMAZ (WITH CHECK)', async () => {
      // Sizintinin TERSI ama ayni derecede yikici: bir tenant, digerinin
      // denetim gecmisine satir UYDURABILIRDI.
      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO platform.audit_log
               (id, tenant_id, actor_user_id, occurred_at, resource_type, resource_id, action, field_name)
             VALUES ($1, $2, $3, now(), 'hr.employee', $4, 'created', NULL)`,
            [randomUUID(), TENANT_B, USER_B, EMPLOYEE],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('⚠️ tenant context OLMADAN sorgu SESSIZCE BOS DONMEZ, HATA VERIR', async () => {
      // MT §12.6 madde 4 — `missing_ok` kullanilmadi. Bir denetim listesinde
      // sessiz bos sonuc en kotu bozulmadir: okuyan kisi "hicbir degisiklik
      // olmamis" diye okur.
      await insertEntry(TENANT_A);

      // ⚠️ IKI mesaj da kabul edilir ve sebebi HAVUZDUR: `set_config(..., true)`
      // ile bir kez tanimlanmis ozel bir GUC, transaction bitince TANIMSIZ
      // olmaz — BOS DIZEYE doner. Yani havuzdan gelen bir baglantida hata
      // "unrecognized configuration parameter" degil "invalid input syntax for
      // type uuid" olur. Ikisi de FAIL CLOSED'dir; `tenant-isolation
      // .integration.spec.ts` ayni ikili kaliba sahiptir.
      const client = await appPool.connect();
      try {
        await expect(client.query('SELECT id FROM platform.audit_log')).rejects.toThrow(
          /unrecognized configuration parameter|invalid input syntax/i,
        );
      } finally {
        client.release();
      }
    });
  });
});
