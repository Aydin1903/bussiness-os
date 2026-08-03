import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { APP_ROLE, APP_PASSWORD, createApplicationRole } from './support/database-roles';
import { POSTGRES_IMAGE } from './support/test-database';

/**
 * MULTI_TENANT_ARCHITECTURE 12.6 — ZORUNLU IZOLASYON TESTLERI.
 *
 * "Bu test olmadan modul merge edilmez. Pazarlik konusu degildir."
 *
 * Alti maddenin tamami burada, GERCEK PostgreSQL'e karsi kanitlanir. Mock bir
 * veritabani RLS'i test etmez — ki test etmek istedigimiz tam olarak odur.
 *
 * KRITIK AYRINTI: sorgular `businessos_app` rolu ile calisir, container'in
 * varsayilan superuser'i ile DEGIL. Superuser RLS'i tumuyle atlar; onunla
 * yazilan bir izolasyon testi her zaman yesil yanar ve hicbir sey kanitlamaz.
 */

const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-00000000000a';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-00000000000b';
const USER_A = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';
const USER_B = '018f3a2b-7c4d-7e1f-9b3c-00000000000b';

describe('tenant izolasyonu (RLS)', () => {
  let container: StartedPostgreSqlContainer;
  /** Tablolarin sahibi. Yalnizca kurulum ve dogrulama icin. */
  let ownerPool: Pool;
  /** Uygulamanin gercekte kullandigi rol — RLS'e TABI. */
  let appPool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();

    ownerPool = new Pool({ connectionString: container.getConnectionUri() });

    // Sira onemli: rol ONCE olusturulur, migration SONRA calisir. Migration
    // rol mevcutsa ona yetki verir; yoksa o adimi atlar.
    await createApplicationRole(ownerPool, container.getDatabase());

    await migrate(drizzle(ownerPool), {
      migrationsFolder: 'drizzle',
      migrationsSchema: 'drizzle',
    });

    appPool = new Pool({
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      user: APP_ROLE,
      password: APP_PASSWORD,
    });

    // Iki tenant ve birer uyelik — sahip rolle, RLS disinda kurulur.
    await ownerPool.query(
      `INSERT INTO platform.tenants (id, slug, name, status, owner_user_id)
       VALUES ($1, 'tenant-a', 'Tenant A', 'active', $3),
              ($2, 'tenant-b', 'Tenant B', 'active', $4)`,
      [TENANT_A, TENANT_B, USER_A, USER_B],
    );

    await ownerPool.query(
      `INSERT INTO platform.memberships (id, tenant_id, user_id, role, status, joined_at)
       VALUES (gen_random_uuid(), $1, $3, 'owner', 'active', now()),
              (gen_random_uuid(), $2, $4, 'owner', 'active', now())`,
      [TENANT_A, TENANT_B, USER_A, USER_B],
    );
  });

  afterAll(async () => {
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  /**
   * Tenant context'i kurulmus bir transaction icinde is calistirir.
   *
   * SET LOCAL kullanilir, SET DEGIL: transaction bitince deger otomatik
   * temizlenir ve havuza donen baglantida onceki tenant'in kimligi KALMAZ
   * (DEVELOPMENT_RULES 4.3). Bu, madde 6'nin test ettigi davranistir.
   */
  async function inTenantContext<T>(
    tenantId: string,
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
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

  // --- Madde 1 ------------------------------------------------------------

  it('tenant A, tenant B nin uyelik kaydini okuyamaz', async () => {
    const rows = await inTenantContext(TENANT_A, async (client) => {
      const result = await client.query<{ id: string }>(
        'SELECT id FROM platform.memberships WHERE tenant_id = $1',
        [TENANT_B],
      );
      return result.rows;
    });

    expect(rows).toHaveLength(0);
  });

  it('tenant A, filtresiz sorguda yalnizca kendi uyeliklerini gorur', async () => {
    // Filtre YAZILMADAN da yalnizca kendi verisi doner: filtreleyen RLS'tir,
    // uygulama degil (13.3 kural 8).
    const rows = await inTenantContext(TENANT_A, async (client) => {
      const result = await client.query<{ tenant_id: string }>(
        'SELECT tenant_id FROM platform.memberships',
      );
      return result.rows;
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenant_id).toBe(TENANT_A);
  });

  it('tenant A, tenant B nin tenant kaydini okuyamaz', async () => {
    const rows = await inTenantContext(TENANT_A, async (client) => {
      const result = await client.query<{ id: string }>(
        'SELECT id FROM platform.tenants WHERE id = $1',
        [TENANT_B],
      );
      return result.rows;
    });

    expect(rows).toHaveLength(0);
  });

  // --- Madde 2 ------------------------------------------------------------

  it('tenant A, tenant B adina uyelik yazamaz', async () => {
    // WITH CHECK ihlali. Bu olmasaydi bir tenant digerinin verisini
    // ZENGINLESTIREBILIRDI.
    await expect(
      inTenantContext(TENANT_A, (client) =>
        client.query(
          `INSERT INTO platform.memberships (id, tenant_id, user_id, role, status, joined_at)
           VALUES (gen_random_uuid(), $1, $2, 'member', 'active', now())`,
          [TENANT_B, USER_A],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('tenant A, tenant B nin uyeligini silemez', async () => {
    const deleted = await inTenantContext(TENANT_A, async (client) => {
      const result = await client.query('DELETE FROM platform.memberships WHERE tenant_id = $1', [
        TENANT_B,
      ]);
      return result.rowCount;
    });

    // Satir gorunmedigi icin silinecek bir sey de yoktur.
    expect(deleted).toBe(0);

    const stillThere = await ownerPool.query('SELECT id FROM platform.memberships WHERE tenant_id = $1', [
      TENANT_B,
    ]);
    expect(stillThere.rowCount).toBe(1);
  });

  // --- Madde 3 ------------------------------------------------------------

  it('tenant A, kendi uyeliginin tenant_id sini tenant B ye tasiyamaz', async () => {
    // Sizintinin TERSI ama ayni derecede yikici: kendi kaydini digerine
    // gondermek. WITH CHECK bunu engeller.
    await expect(
      inTenantContext(TENANT_A, (client) =>
        client.query('UPDATE platform.memberships SET tenant_id = $1 WHERE tenant_id = $2', [
          TENANT_B,
          TENANT_A,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  // --- Madde 4 ------------------------------------------------------------

  it('tenant context kurulmadan uyelik sorgusu calismaz', async () => {
    // Sessizce BOS DONMEZ, HATA VERIR. Sessiz bos sonuc, hatayi uretimde
    // aylarca gizler (12.6 madde 4).
    await expect(appPool.query('SELECT id FROM platform.memberships')).rejects.toThrow(
      /unrecognized configuration parameter|invalid input syntax/i,
    );
  });

  it('tenant context kurulmadan tenant sorgusu calismaz', async () => {
    await expect(appPool.query('SELECT id FROM platform.tenants')).rejects.toThrow(
      /unrecognized configuration parameter|invalid input syntax/i,
    );
  });

  // --- Madde 5 ------------------------------------------------------------

  it('uygulama rolu BYPASSRLS yetkisi tasimaz', async () => {
    const result = await ownerPool.query<{ rolbypassrls: boolean; rolsuper: boolean }>(
      'SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = $1',
      [APP_ROLE],
    );

    expect(result.rows[0]?.rolbypassrls).toBe(false);
    expect(result.rows[0]?.rolsuper).toBe(false);
  });

  it('uygulama rolu tablolarin sahibi degildir', async () => {
    // Bu, RLS'in sessizce devre disi kalmasinin EN YAYGIN sebebidir.
    const result = await ownerPool.query<{ tablename: string; tableowner: string }>(
      "SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'platform'",
    );

    expect(result.rowCount).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(row.tableowner).not.toBe(APP_ROLE);
    }
  });

  it('tenant-scoped tablolarda RLS etkin ve FORCE edilmistir', async () => {
    const result = await ownerPool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'platform' AND c.relname = 'memberships'`,
    );

    expect(result.rows[0]?.relrowsecurity).toBe(true);
    expect(result.rows[0]?.relforcerowsecurity).toBe(true);
  });

  it('platform.tenants RLS etkindir ama FORCE edilmemistir', async () => {
    // BILINCLI SAPMA (0001_tenant_tables.sql): FORCE, SECURITY DEFINER
    // resolve_tenant fonksiyonunu da politikaya tabi kilar ve tenant
    // resolution'i imkansizlastirirdi. Bu test sapmayi KAYIT ALTINA ALIR —
    // biri "FORCE eksik" diye ekleyecek olursa test kirmizi yanar ve
    // gerekceyi okur.
    const result = await ownerPool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'platform' AND c.relname = 'tenants'`,
    );

    expect(result.rows[0]?.relrowsecurity).toBe(true);
    expect(result.rows[0]?.relforcerowsecurity).toBe(false);
  });

  // --- Madde 6 ------------------------------------------------------------

  it('transaction bittikten sonra havuza donen baglantida tenant kimligi kalmaz', async () => {
    // SET LOCAL yerine SET kullanilsaydi, bir sonraki istek ONCEKI tenant'in
    // kimligiyle sorgu calistirirdi — dogrudan tenant sizintisi.
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', TENANT_A]);
      await client.query('COMMIT');

      const leaked = await client.query<{ value: string | null }>(
        "SELECT current_setting('app.current_tenant_id', true) AS value",
      );

      expect(leaked.rows[0]?.value ?? '').not.toBe(TENANT_A);
    } finally {
      client.release();
    }
  });

  it('ayni baglanti farkli tenant context leriyle sirayla kullanilabilir', async () => {
    // Havuzdan alinan baglanti geri donup baskasina verildiginde dogru
    // calismali. Bu, madde 6'nin pratikteki karsiligidir.
    const first = await inTenantContext(TENANT_A, async (client) => {
      const r = await client.query<{ tenant_id: string }>('SELECT tenant_id FROM platform.memberships');
      return r.rows[0]?.tenant_id;
    });
    const second = await inTenantContext(TENANT_B, async (client) => {
      const r = await client.query<{ tenant_id: string }>('SELECT tenant_id FROM platform.memberships');
      return r.rows[0]?.tenant_id;
    });

    expect(first).toBe(TENANT_A);
    expect(second).toBe(TENANT_B);
  });

  // --- resolve_tenant: kontrollu asim -------------------------------------

  it('resolve_tenant, context olmadan slug u tenant a cevirir', async () => {
    // Tenant resolution'in calisabilmesinin sarti (8.2). Context YOK.
    const result = await appPool.query<{ tenant_id: string; tenant_status: string }>(
      'SELECT * FROM platform.resolve_tenant($1)',
      ['tenant-a'],
    );

    expect(result.rows[0]?.tenant_id).toBe(TENANT_A);
    expect(result.rows[0]?.tenant_status).toBe('active');
  });

  it('resolve_tenant bilinmeyen slug icin bos doner', async () => {
    const result = await appPool.query('SELECT * FROM platform.resolve_tenant($1)', ['yok-boyle']);

    expect(result.rowCount).toBe(0);
  });

  it('resolve_tenant yalnizca kimlik ve durum dondurur', async () => {
    // Asimin dar tutuldugunun kaniti: ad, sahip, plan gibi hicbir alan
    // sizmaz. Fonksiyon genisletilirse bu test kirmizi yanar.
    const result = await appPool.query('SELECT * FROM platform.resolve_tenant($1)', ['tenant-a']);

    expect(result.fields.map((f) => f.name).sort()).toEqual(['tenant_id', 'tenant_status']);
  });

  it('resolve_tenant listeleme yapamaz', async () => {
    // Fonksiyon tek bir slug alir; tum tenant'lari donduren bir cagri
    // YAZILAMAZ. NULL slug hicbir satir eslesmez.
    const result = await appPool.query('SELECT * FROM platform.resolve_tenant($1)', [null]);

    expect(result.rowCount).toBe(0);
  });

  // --- Veritabani seviyesindeki domain invariant'lari ---------------------

  it('arsivlenmemis tenant arsivleme zamani tasiyamaz', async () => {
    await expect(
      ownerPool.query(
        `INSERT INTO platform.tenants (id, slug, name, status, owner_user_id, archived_at)
         VALUES (gen_random_uuid(), 'bozuk-1', 'Bozuk', 'active', $1, now())`,
        [USER_A],
      ),
    ).rejects.toThrow(/tenants_archived_at_consistency/);
  });

  it('arsivlenmis tenant arsivleme zamani tasimak zorundadir', async () => {
    await expect(
      ownerPool.query(
        `INSERT INTO platform.tenants (id, slug, name, status, owner_user_id)
         VALUES (gen_random_uuid(), 'bozuk-2', 'Bozuk', 'archived', $1)`,
        [USER_A],
      ),
    ).rejects.toThrow(/tenants_archived_at_consistency/);
  });

  it('davet asamasindaki uyelik katilma zamani tasiyamaz', async () => {
    await expect(
      ownerPool.query(
        `INSERT INTO platform.memberships (id, tenant_id, user_id, role, status, joined_at)
         VALUES (gen_random_uuid(), $1, gen_random_uuid(), 'member', 'invited', now())`,
        [TENANT_A],
      ),
    ).rejects.toThrow(/memberships_joined_at_consistency/);
  });

  it('ayni kullanici ayni tenant ta iki kez uye olamaz', async () => {
    await expect(
      ownerPool.query(
        `INSERT INTO platform.memberships (id, tenant_id, user_id, role, status, joined_at)
         VALUES (gen_random_uuid(), $1, $2, 'member', 'active', now())`,
        [TENANT_A, USER_A],
      ),
    ).rejects.toThrow(/memberships_tenant_id_user_id_key/);
  });

  it('ayni kullanici FARKLI tenant larda uye olabilir', async () => {
    // ADR-0014: kimlik globaldir. Tekillik (tenant_id, user_id) uzerindedir,
    // yalnizca user_id uzerinde DEGIL.
    await expect(
      ownerPool.query(
        `INSERT INTO platform.memberships (id, tenant_id, user_id, role, status, joined_at)
         VALUES (gen_random_uuid(), $1, $2, 'member', 'active', now())`,
        [TENANT_B, USER_A],
      ),
    ).resolves.toBeDefined();
  });

  it('tanimsiz tenant durumu kabul edilmez', async () => {
    await expect(
      ownerPool.query(
        `INSERT INTO platform.tenants (id, slug, name, status, owner_user_id)
         VALUES (gen_random_uuid(), 'bozuk-3', 'Bozuk', 'deleted', $1)`,
        [USER_A],
      ),
    ).rejects.toThrow(/tenants_status_check/);
  });

  it('slug global olarak tekildir', async () => {
    await expect(
      ownerPool.query(
        `INSERT INTO platform.tenants (id, slug, name, status, owner_user_id)
         VALUES (gen_random_uuid(), 'tenant-a', 'Kopya', 'active', $1)`,
        [USER_A],
      ),
    ).rejects.toThrow(/tenants_slug_key/);
  });
});
