import { randomUUID } from 'node:crypto';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  APP_ROLE,
  APP_PASSWORD,
  OUTBOX_RELAY_ROLE,
  REPORT_WORKER_ROLE,
  RLS_READER_ROLE,
  createApplicationRole,
} from './support/database-roles';
import { POSTGRES_IMAGE } from './support/test-database';

/**
 * `finance` semasi — MT §12.6 ZORUNLU izolasyon testi (ADR-0034 Slice 1).
 *
 * CRM ve Projeler'in dersi burada da BASTAN uygulaniyor: yeni bir tablo,
 * dogrudan A<->B izolasyon testi yazilmadan merge EDILMEZ.
 *
 * ⚠️ Bu dosya ayrica HAFIF kapanis denetiminin bir maddesini OTOMATIKLESTIRIR
 * ("dar rollerin yeni semaya gorunmedigi kontrolu"). CRM ve Projeler'de o
 * madde elle gezilmisti; uc dar rol her yeni semada yeniden sorulmasi gereken
 * ayni soruyu soruyor ve elle sorulan bir soru bir gun sorulmaz.
 */

const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-00000000000a';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-00000000000b';
const USER_A = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';
const USER_B = '018f3a2b-7c4d-7e1f-9b3c-00000000000b';

describe('finance semasi (gercek PostgreSQL)', () => {
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
    await ownerPool.query('TRUNCATE finance.categories CASCADE');
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

  async function insertCategory(
    tenantId: string,
    overrides: { name?: string; direction?: string; archived?: boolean } = {},
  ): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO finance.categories (id, tenant_id, name, direction, is_archived)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          id,
          tenantId,
          overrides.name ?? 'Kira',
          overrides.direction ?? 'expense',
          overrides.archived ?? false,
        ],
      ),
    );
    return id;
  }

  describe('sema ve kisitlar', () => {
    it('TEK tablo finance semasinda olusturuldu', async () => {
      // ⚠️ Bu satir her yeni tabloda guncellenir. `crm-schema`nin "bes tablo"
      // iddiasinin `0019`dan sonra guncellenmemis olmasi testi aylarca kirmizi
      // birakmisti; `0024` ve `0025` geldiginde buraya donulecek.
      const rows = await ownerPool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'finance' ORDER BY table_name",
      );

      expect(rows.rows.map((row) => row.table_name)).toEqual(['categories']);
    });

    it('BOS kategori adi reddedilir (veritabani seviyesinde)', async () => {
      await expect(insertCategory(TENANT_A, { name: '   ' })).rejects.toThrow(
        /categories_name_not_blank/,
      );
    });

    it('GECERSIZ yon veritabaninda REDDEDILIR', async () => {
      // Sozluk hem kodda (`FINANCE_DIRECTIONS`) hem CHECK'te yazili; buradaki
      // kisit uygulamayi ATLAYAN her yolu da baglar.
      await expect(insertCategory(TENANT_A, { direction: 'transfer' })).rejects.toThrow(
        /categories_direction_valid/,
      );
    });

    it('AYNI ad + AYNI yon IKI KEZ yazilamaz', async () => {
      await insertCategory(TENANT_A, { name: 'Kira', direction: 'expense' });

      await expect(
        insertCategory(TENANT_A, { name: 'Kira', direction: 'expense' }),
      ).rejects.toThrow(/categories_tenant_name_direction_idx/);
    });

    it('ad tekilligi BUYUK/KUCUK HARF DUYARSIZDIR', async () => {
      // Serbest metnin reddedilme gerekcesi (ADR-0034 §3b) tablonun ICINDE
      // yeniden dogmasin diye: "Kira" ve "kira" ayni kategoridir.
      await insertCategory(TENANT_A, { name: 'Kira' });

      await expect(insertCategory(TENANT_A, { name: 'KIRA' })).rejects.toThrow(
        /categories_tenant_name_direction_idx/,
      );
    });

    it('AYNI ad FARKLI yonde MESRUDUR', async () => {
      // "Danismanlik" hem aldigimiz hem verdigimiz olabilir.
      await insertCategory(TENANT_A, { name: 'Danismanlik', direction: 'expense' });

      await expect(
        insertCategory(TENANT_A, { name: 'Danismanlik', direction: 'income' }),
      ).resolves.toBeDefined();
    });

    it('ARSIVLENMIS bir kategori de ad tekilligine DAHILDIR', async () => {
      // ⚠️ Unique index KISMI DEGILDIR ve bu bilincli: iki ayni adli satir ozet
      // listesinde yan yana gorunurdu. Dogru yol yenisini acmak degil eskisini
      // ARSIVDEN CIKARMAKTIR — `DuplicateCategoryError`in mesaji bunu soyluyor.
      await insertCategory(TENANT_A, { name: 'Kira', archived: true });

      await expect(insertCategory(TENANT_A, { name: 'Kira' })).rejects.toThrow(
        /categories_tenant_name_direction_idx/,
      );
    });

    it('ayni ad FARKLI TENANT ta mesrudur', async () => {
      await insertCategory(TENANT_A, { name: 'Kira' });
      await expect(insertCategory(TENANT_B, { name: 'Kira' })).resolves.toBeDefined();
    });

    it('(id, direction) UNIQUE kisiti VARDIR — 0024 un bilesik FK si buna dayanir', async () => {
      // ⚠️ BU TESTIN ISI, GEREKSIZ GORUNEN BIR KISITIN VARLIGINI KORUMAKTIR.
      //
      // `id` zaten birincil anahtar, dolayisiyla bu kisit "fazladan" gorunur ve
      // bir temizlikte silinmeye adaydir. Silinirse migration `0024`
      // "there is no unique constraint matching given keys" ile PATLAR —
      // yani hata tip denetiminde degil, migration calisirken gorunur.
      const rows = await ownerPool.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint
         WHERE conrelid = 'finance.categories'::regclass AND contype = 'u'
         ORDER BY conname`,
      );

      expect(rows.rows.map((row) => row.conname)).toContain('categories_id_direction_unique');
    });

    it('SEMA DISINA FOREIGN KEY YOKTUR', async () => {
      // Tek mesru FK `tenant_id -> platform.tenants` (MT §12.3 istisnasi).
      const rows = await ownerPool.query<{ target: string }>(
        `SELECT confrelid::regclass::text AS target FROM pg_constraint
         WHERE conrelid = 'finance.categories'::regclass AND contype = 'f'`,
      );

      expect(rows.rows.map((row) => row.target)).toEqual(['platform.tenants']);
    });
  });

  describe('RLS izolasyonu (MT §12.6)', () => {
    it('tenant A, B nin kategorisini GOREMEZ', async () => {
      await insertCategory(TENANT_A, { name: 'A nin kalemi' });
      await insertCategory(TENANT_B, { name: 'B nin kalemi' });

      const rows = await asTenant(TENANT_A, async (client) => {
        // Filtre YAZILMADI; daraltmayi RLS yapti.
        const result = await client.query<{ name: string }>('SELECT name FROM finance.categories');
        return result.rows;
      });

      expect(rows.map((row) => row.name)).toEqual(['A nin kalemi']);
    });

    it('BASKA tenant adina yazmak WITH CHECK ile reddedilir', async () => {
      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            'INSERT INTO finance.categories (id, tenant_id, name, direction) VALUES ($1, $2, $3, $4)',
            [randomUUID(), TENANT_B, 'sizinti denemesi', 'expense'],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('tenant A, kendi kaydinin tenant_id sini TASIYAMAZ', async () => {
      await insertCategory(TENANT_A);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('UPDATE finance.categories SET tenant_id = $1', [TENANT_B]),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('tenant A, B nin kategorisini SILEMEZ', async () => {
      await insertCategory(TENANT_B, { name: 'B nin kalemi' });

      const deleted = await asTenant(TENANT_A, async (client) => {
        const result = await client.query('DELETE FROM finance.categories');
        return result.rowCount;
      });

      // Sifir satir: RLS silmeyi sessizce KAPSAM DISI birakti, hata vermedi.
      // Use case bunu `CategoryNotFoundError`e cevirir.
      expect(deleted).toBe(0);
    });

    it('TENANT CONTEXT YOKKEN sorgu SESSIZCE BOS DONMEZ, HATA VERIR', async () => {
      // MT §12.6 madde 4 — `missing_ok` kullanilmamasinin kaniti. Sessiz bos
      // sonuc "hic kategori yok" gibi gorunur ve kullanici verisini
      // kaybettigini sanar.
      //
      // IKI mesaj da kabul edilir (`projects-schema` / `crm-schema` ile ayni
      // konvansiyon): PostgreSQL, oturumda parametre HIC gorulmediyse
      // "unrecognized configuration parameter", bir kez `SET LOCAL` ile
      // gorulduyse bos dize dondurur ve `::uuid` cast'i "invalid input syntax"
      // ile patlar. Havuzdan gelen baglantinin GECMISI hangisinin gorunecegini
      // belirler — ikisi de FAIL-CLOSED'dir ve testin iddiasi tam olarak budur.
      const client = await appPool.connect();
      try {
        await expect(client.query('SELECT * FROM finance.categories')).rejects.toThrow(
          /unrecognized configuration parameter|invalid input syntax/i,
        );
      } finally {
        client.release();
      }
    });
  });

  describe('uygulama rolu ve DAR ROLLER (Constraint 2 esdegeri)', () => {
    it('uygulama rolu semayi GORUR ama icinde nesne OLUSTURAMAZ', async () => {
      const rows = await ownerPool.query<{ usage: boolean; create: boolean }>(
        `SELECT has_schema_privilege($1, 'finance', 'USAGE')  AS usage,
                has_schema_privilege($1, 'finance', 'CREATE') AS create`,
        [APP_ROLE],
      );

      expect(rows.rows[0]).toEqual({ usage: true, create: false });
    });

    /**
     * ⚠️ HAFIF KAPANIS DENETIMININ MADDESI, OTOMATIKLESTIRILDI.
     *
     * Uc dar `BYPASSRLS` rolu de `finance` semasina KOR olmalidir. Onlarin tek
     * yetenegi RLS'i asmaktir; yeni bir semaya erisim kazanirlarsa o semanin
     * tenant izolasyonu SESSIZCE delinir — RLS'i zaten atliyorlar, geriye
     * yalnizca GRANT kaliyor.
     *
     * `01-roles.sql` hicbirine `finance` yetkisi vermiyor ve migration `0023` de
     * vermiyor. Bu test o YOKLUGU koruyor: biri ileride toplu bir
     * `GRANT ... ON ALL TABLES IN SCHEMA finance` yazarsa burada kirmizi yanar.
     */
    it.each([RLS_READER_ROLE, OUTBOX_RELAY_ROLE, REPORT_WORKER_ROLE])(
      '%s dar rolu finance semasini HIC GORMEZ',
      async (role) => {
        const rows = await ownerPool.query<{ usage: boolean; create: boolean }>(
          `SELECT has_schema_privilege($1, 'finance', 'USAGE')  AS usage,
                  has_schema_privilege($1, 'finance', 'CREATE') AS create`,
          [role],
        );

        expect(rows.rows[0]).toEqual({ usage: false, create: false });
      },
    );

    it.each([RLS_READER_ROLE, OUTBOX_RELAY_ROLE, REPORT_WORKER_ROLE])(
      '%s dar rolunun finance.categories uzerinde HICBIR grant i yok',
      async (role) => {
        const rows = await ownerPool.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM information_schema.role_table_grants
           WHERE table_schema = 'finance' AND grantee = $1`,
          [role],
        );

        expect(rows.rows[0]?.n).toBe(0);
      },
    );
  });
});
