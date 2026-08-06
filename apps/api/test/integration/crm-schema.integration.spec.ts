import { randomUUID } from 'node:crypto';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { APP_ROLE, APP_PASSWORD, createApplicationRole } from './support/database-roles';
import { POSTGRES_IMAGE } from './support/test-database';

/**
 * `crm` semasi — MT §12.6 ZORUNLU izolasyon testi (ADR-0031 Slice 4).
 *
 * Slice 2'nin dersi burada BASTAN uygulaniyor: yeni bir tablo, dogrudan A<->B
 * izolasyon testi yazilmadan merge EDILMEZ. Bir CRM'de sizinti ozellikle
 * yikicidir — sizan sey musteri listesidir.
 */

const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-00000000000a';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-00000000000b';
const USER_A = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';
const USER_B = '018f3a2b-7c4d-7e1f-9b3c-00000000000b';

describe('crm semasi (gercek PostgreSQL)', () => {
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
    });

    await ownerPool.query(
      `INSERT INTO platform.tenants (id, slug, name, status, owner_user_id)
       VALUES ($1, 'tenant-a', 'Tenant A', 'active', $3),
              ($2, 'tenant-b', 'Tenant B', 'active', $4)`,
      [TENANT_A, TENANT_B, USER_A, USER_B],
    );
  }, 180_000);

  afterAll(async () => {
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  beforeEach(async () => {
    await ownerPool.query('TRUNCATE crm.contacts, crm.companies CASCADE');
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

  async function insertCompany(tenantId: string, name = 'Acme'): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query('INSERT INTO crm.companies (id, tenant_id, name) VALUES ($1, $2, $3)', [
        id,
        tenantId,
        name,
      ]),
    );
    return id;
  }

  async function insertContact(tenantId: string, companyId: string): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO crm.contacts (id, tenant_id, company_id, full_name)
         VALUES ($1, $2, $3, 'Ayse Yilmaz')`,
        [id, tenantId, companyId],
      ),
    );
    return id;
  }

  describe('sema ve kisitlar', () => {
    it('iki tablo crm semasinda olusturuldu', async () => {
      const rows = await ownerPool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'crm' ORDER BY table_name",
      );

      expect(rows.rows.map((row) => row.table_name)).toEqual(['companies', 'contacts']);
    });

    it('sirket adi TEKIL DEGILDIR (ADR-0031 Slice 4 karari)', async () => {
      // Ayni isimli iki kayit MESRUDUR: ayni grubun iki sirketi, ayni adi
      // tasiyan farkli subeler. Bu test karari KAYIT ALTINA ALIR — biri
      // "UNIQUE ekleyelim" derse kirmizi yanar ve gerekceyi okur.
      await insertCompany(TENANT_A, 'Acme');
      await expect(insertCompany(TENANT_A, 'Acme')).resolves.toBeDefined();
    });

    it('BOS sirket adi reddedilir (veritabani seviyesinde)', async () => {
      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('INSERT INTO crm.companies (id, tenant_id, name) VALUES ($1, $2, $3)', [
            randomUUID(),
            TENANT_A,
            '   ',
          ]),
        ),
      ).rejects.toThrow(/companies_name_not_blank/);
    });

    it('kisi VAR OLMAYAN sirkete baglanamaz (FK)', async () => {
      await expect(insertContact(TENANT_A, randomUUID())).rejects.toThrow(/foreign key/i);
    });
  });

  describe('RLS izolasyonu (MT §12.6)', () => {
    it('companies: tenant A, B nin sirketini GOREMEZ', async () => {
      await insertCompany(TENANT_A, 'A nin sirketi');
      await insertCompany(TENANT_B, 'B nin sirketi');

      const rows = await asTenant(TENANT_A, async (client) => {
        // Filtre YAZILMADI; daraltmayi RLS yapti.
        const result = await client.query<{ name: string }>('SELECT name FROM crm.companies');
        return result.rows;
      });

      expect(rows.map((row) => row.name)).toEqual(['A nin sirketi']);
    });

    it('contacts: tenant A, B nin kisisini GOREMEZ', async () => {
      const companyB = await insertCompany(TENANT_B);
      await insertContact(TENANT_B, companyB);

      const rows = await asTenant(TENANT_A, async (client) => {
        const result = await client.query<{ id: string }>('SELECT id FROM crm.contacts');
        return result.rows;
      });

      expect(rows).toHaveLength(0);
    });

    it('companies: BASKA tenant adina yazmak WITH CHECK ile reddedilir', async () => {
      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('INSERT INTO crm.companies (id, tenant_id, name) VALUES ($1, $2, $3)', [
            randomUUID(),
            TENANT_B,
            'sizinti denemesi',
          ]),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('companies: tenant A, kendi kaydinin tenant_id sini TASIYAMAZ', async () => {
      await insertCompany(TENANT_A);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('UPDATE crm.companies SET tenant_id = $1', [TENANT_B]),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('tenant A, B nin kaydini SILEMEZ (silme de RLS e tabidir)', async () => {
      const companyB = await insertCompany(TENANT_B);

      const deleted = await asTenant(TENANT_A, async (client) => {
        const result = await client.query('DELETE FROM crm.companies WHERE id = $1', [companyB]);
        return result.rowCount;
      });

      // Hata degil, SIFIR SATIR: RLS satiri gorunmez kilar, gorunmeyen satir
      // silinemez. Uygulama bunu 404'e cevirir.
      expect(deleted).toBe(0);
    });

    it('tenant context KURULMADAN sorgu HATA verir', async () => {
      // Sessiz bos sonuc bir CRM'de "musteri kaydi yok" gibi gorunur ve
      // kullanici veriyi kaybettigini sanar (MT §12.6 madde 4).
      for (const table of ['companies', 'contacts']) {
        await expect(
          appPool.query(`SELECT 1 FROM crm.${table}`),
          `crm.${table} context siz calismamali`,
        ).rejects.toThrow(/unrecognized configuration parameter|invalid input syntax/i);
      }
    });

    it('her iki tablo da ENABLE + FORCE tasiyor', async () => {
      for (const table of ['companies', 'contacts']) {
        const result = await ownerPool.query<{
          relrowsecurity: boolean;
          relforcerowsecurity: boolean;
        }>(
          `SELECT relrowsecurity, relforcerowsecurity
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'crm' AND c.relname = $1`,
          [table],
        );

        expect(result.rows[0]?.relrowsecurity, `${table} ENABLE`).toBe(true);
        expect(result.rows[0]?.relforcerowsecurity, `${table} FORCE`).toBe(true);
      }
    });

    it('uygulama rolu crm tablolarinin SAHIBI degildir', async () => {
      // FORCE RLS sahibi de kapsar; ama sahiplik ayrica DDL yetkisi demektir.
      const result = await ownerPool.query<{ count: string }>(
        `SELECT count(*) AS count FROM pg_tables
         WHERE schemaname = 'crm' AND tableowner = $1`,
        [APP_ROLE],
      );

      expect(result.rows[0]?.count).toBe('0');
    });
  });

  describe('CASCADE (ADR-0031 §7)', () => {
    it('sirket silinince kisileri de gider', async () => {
      const companyId = await insertCompany(TENANT_A);
      await insertContact(TENANT_A, companyId);

      const remaining = await asTenant(TENANT_A, async (client) => {
        await client.query('DELETE FROM crm.companies WHERE id = $1', [companyId]);
        const result = await client.query<{ count: string }>(
          'SELECT count(*) AS count FROM crm.contacts',
        );
        return result.rows[0]?.count;
      });

      // Bu cascade `crm` semasinin VAR OLMA GEREKCESIDIR: Slice 6'da zincir
      // `interactions` ve `interaction_chunks`'a uzayacak ve silinen musteri
      // AI hafizasindan da silinecek. Gorusmeler `knowledge.notes`'a
      // yazilsaydi cross-schema FK yasagi yuzunden bu YAZILAMAZDI.
      expect(remaining).toBe('0');
    });
  });
});
