import { randomUUID } from 'node:crypto';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { APP_ROLE, APP_PASSWORD, createApplicationRole } from './support/database-roles';
import { POSTGRES_IMAGE } from './support/test-database';

/**
 * `projects` semasi — MT §12.6 ZORUNLU izolasyon testi (ADR-0033 Slice 1).
 *
 * CRM'in dersi burada BASTAN uygulaniyor: yeni bir tablo, dogrudan A<->B
 * izolasyon testi yazilmadan merge EDILMEZ.
 */

const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-00000000000a';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-00000000000b';
const USER_A = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';
const USER_B = '018f3a2b-7c4d-7e1f-9b3c-00000000000b';

describe('projects semasi (gercek PostgreSQL)', () => {
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
    await ownerPool.query('TRUNCATE projects.projects CASCADE');
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

  async function insertProject(
    tenantId: string,
    overrides: { name?: string; status?: string; companyId?: string | null } = {},
  ): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO projects.projects (id, tenant_id, name, status, company_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          id,
          tenantId,
          overrides.name ?? 'Web sitesi yenileme',
          overrides.status ?? 'planning',
          overrides.companyId ?? null,
        ],
      ),
    );
    return id;
  }

  describe('sema ve kisitlar', () => {
    it('tek tablo projects semasinda olusturuldu', async () => {
      const rows = await ownerPool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'projects' ORDER BY table_name",
      );

      // Slice 2 `tasks`, Slice 3 `progress_notes` + `progress_note_chunks`
      // ekleyecek. Bugun tek tablo olmasi BEKLENEN durumdur.
      expect(rows.rows.map((row) => row.table_name)).toEqual(['projects']);
    });

    it('proje adi TEKIL DEGILDIR (ADR-0033 §1 karari)', async () => {
      // Ayni adi tasiyan iki proje mesrudur: ayni isin iki donemi. Bu test
      // karari KAYIT ALTINA ALIR — biri "UNIQUE ekleyelim" derse kirmizi yanar.
      await insertProject(TENANT_A, { name: 'Web sitesi yenileme' });
      await expect(insertProject(TENANT_A, { name: 'Web sitesi yenileme' })).resolves.toBeDefined();
    });

    it('BOS proje adi reddedilir (veritabani seviyesinde)', async () => {
      await expect(insertProject(TENANT_A, { name: '   ' })).rejects.toThrow(
        /projects_name_not_blank/,
      );
    });

    it('GECERSIZ durum veritabaninda REDDEDILIR', async () => {
      await expect(insertProject(TENANT_A, { status: 'arsivlendi' })).rejects.toThrow(
        /projects_status_valid/,
      );
    });

    it('bitis baslangictan ONCE olamaz (veritabani seviyesinde)', async () => {
      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO projects.projects (id, tenant_id, name, started_on, due_on)
             VALUES ($1, $2, 'Ters tarihli', '2026-09-01', '2026-08-01')`,
            [randomUUID(), TENANT_A],
          ),
        ),
      ).rejects.toThrow(/projects_due_after_started/);
    });

    it('TEK BASINA bitis tarihi kabul edilir', async () => {
      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO projects.projects (id, tenant_id, name, due_on)
             VALUES ($1, $2, 'Yalniz bitis', '2026-08-01')`,
            [randomUUID(), TENANT_A],
          ),
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('cross-modul yumusak referans (ADR-0033 §2)', () => {
    it('company_id UZERINDE FOREIGN KEY YOKTUR', async () => {
      // ⚠️ BU TESTIN ISI, BIR SEYIN OLMADIGINI KANITLAMAKTIR.
      //
      // Mutlak Kural 5 cross-schema FK'yi yasaklar; hedef `crm.companies` baska
      // bir semadir. Biri iyi niyetle `.references()` eklerse migration yine
      // calisir (ayni veritabani!) ama modul ayrilabilirligi SESSIZCE kaybolur
      // ve `crm` semasini ayri bir DB'ye tasima yolu kapanir. Bu test o gun
      // kirmizi yanar.
      const rows = await ownerPool.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint
         WHERE conrelid = 'projects.projects'::regclass AND contype = 'f'`,
      );

      // Tek mesru FK `tenant_id -> platform.tenants` (MT §12.3 istisnasi).
      expect(rows.rows.map((row) => row.conname)).toHaveLength(1);
    });

    it('VAR OLMAYAN bir sirket id si YAZILABILIR — sarkan isaretci mesrudur', async () => {
      // ADR-0033 §2(d): silinen bir sirketin id'si sarkta kalir ve bu veri
      // bozulmasi DEGILDIR. Okuyan yol dayanikli olmak zorundadir; veritabani
      // burada bir sey dayatmaz — dayatamaz da.
      await expect(insertProject(TENANT_A, { companyId: randomUUID() })).resolves.toBeDefined();
    });
  });

  describe('RLS izolasyonu (MT §12.6)', () => {
    it('projects: tenant A, B nin projesini GOREMEZ', async () => {
      await insertProject(TENANT_A, { name: 'A nin projesi' });
      await insertProject(TENANT_B, { name: 'B nin projesi' });

      const rows = await asTenant(TENANT_A, async (client) => {
        // Filtre YAZILMADI; daraltmayi RLS yapti.
        const result = await client.query<{ name: string }>('SELECT name FROM projects.projects');
        return result.rows;
      });

      expect(rows.map((row) => row.name)).toEqual(['A nin projesi']);
    });

    it('projects: BASKA tenant adina yazmak WITH CHECK ile reddedilir', async () => {
      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('INSERT INTO projects.projects (id, tenant_id, name) VALUES ($1, $2, $3)', [
            randomUUID(),
            TENANT_B,
            'sizinti denemesi',
          ]),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('projects: tenant A, kendi kaydinin tenant_id sini TASIYAMAZ', async () => {
      await insertProject(TENANT_A);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('UPDATE projects.projects SET tenant_id = $1', [TENANT_B]),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('projects: tenant A, B nin projesini SILEMEZ', async () => {
      await insertProject(TENANT_B, { name: 'B nin projesi' });

      const deleted = await asTenant(TENANT_A, async (client) => {
        const result = await client.query('DELETE FROM projects.projects');
        return result.rowCount;
      });

      // Sifir satir: RLS silmeyi sessizce KAPSAM DISI birakti, hata vermedi.
      // Use case bunu `ProjectNotFoundError`e cevirir.
      expect(deleted).toBe(0);
    });

    it('TENANT CONTEXT YOKKEN sorgu SESSIZCE BOS DONMEZ, HATA VERIR', async () => {
      // MT §12.6 madde 4 — `missing_ok` kullanilmamasinin kaniti. Sessiz bos
      // sonuc "hic proje yok" gibi gorunur ve kullanici verisini kaybettigini
      // sanar.
      //
      // IKI mesaj da kabul edilir (`knowledge-schema` / `crm-schema` /
      // `tenant-isolation` ile ayni konvansiyon): PostgreSQL, oturumda parametre
      // HIC gorulmediyse "unrecognized configuration parameter", bir kez
      // `SET LOCAL` ile gorulduyse bos dize dondurur ve `::uuid` cast'i
      // "invalid input syntax" ile patlar. Havuzdan gelen baglantinin GECMISI
      // hangisinin gorunecegini belirler — ikisi de FAIL-CLOSED'dir ve testin
      // iddiasi tam olarak budur.
      //
      // ⚠️ Bu test ilk yazimda YALNIZCA ilk mesaji bekliyordu ve kirmizi yandi:
      // havuzdaki baglanti onceki testlerden geciyordu. Tek mesaj beklemek,
      // test sirasina bagli KIRILGAN bir iddiaydi.
      const client = await appPool.connect();
      try {
        await expect(client.query('SELECT * FROM projects.projects')).rejects.toThrow(
          /unrecognized configuration parameter|invalid input syntax/i,
        );
      } finally {
        client.release();
      }
    });
  });
});
