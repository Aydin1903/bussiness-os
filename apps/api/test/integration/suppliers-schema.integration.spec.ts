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
 * `suppliers` semasi — MT §12.6 ZORUNLU izolasyon testi (ADR-0040 Slice 1).
 *
 * ============================================================================
 * ⚠️ BU DOSYA UC SEYIN KANITIDIR VE UCU DE BIRIM TESTIYLE GORULEMEZ
 * ============================================================================
 *   1. MIGRATION GERCEKTEN UYGULANDI (uc tablonun VARLIGI) — CLAUDE.md'nin
 *      kalici dersi: `_journal.json`a girmeyen bir migration "applied
 *      successfully" yazar, cikis kodu 0 verir ve HICBIR SEY UYGULAMAZ.
 *   2. ⚠️ FK YONLERI (§1.3): tedarikci silinince kisiler ve gorusmeler
 *      CASCADE ile gider (KVKK girdisi), ama KISI silinince gorusme kaydi
 *      YERINDE KALIR (`SET NULL`). Ikisi zit yonlerdir ve yalnizca gercek bir
 *      veritabaninda gosterilebilir.
 *   3. ⚠️ VERGI NO TEKILLIGI KUCUK/BUYUK HARFTEN BAGIMSIZ (§1.1) — ifade
 *      index'i Drizzle sema tanimindan URETILEMEZ.
 */

const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000e1';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-0000000000e2';
const USER_A = '018f3a2b-7c4d-7e1f-9b3c-0000000000e1';
const USER_B = '018f3a2b-7c4d-7e1f-9b3c-0000000000e2';

describe('suppliers semasi (gercek PostgreSQL)', () => {
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
       VALUES ($1, 'tenant-sup-a', 'Tenant A', 'active', $3),
              ($2, 'tenant-sup-b', 'Tenant B', 'active', $4)`,
      [TENANT_A, TENANT_B, USER_A, USER_B],
    );
  }, 180_000);

  afterAll(async () => {
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  beforeEach(async () => {
    // ⚠️ SIRA: `CASCADE` zaten zinciri cozer ama en bagimliyi once yazmak
    // niyeti gosterir (`interactions` -> `contacts` -> `suppliers`).
    await ownerPool.query(
      'TRUNCATE suppliers.interactions, suppliers.contacts, suppliers.suppliers CASCADE',
    );
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

  async function insertSupplier(
    tenantId: string,
    overrides: { name?: string; taxNumber?: string | null; paymentTerms?: string | null } = {},
  ): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO suppliers.suppliers
           (id, tenant_id, name, tax_number, payment_terms, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          tenantId,
          overrides.name ?? 'Yildiz Civata',
          overrides.taxNumber === undefined ? null : overrides.taxNumber,
          overrides.paymentTerms === undefined ? null : overrides.paymentTerms,
          USER_A,
        ],
      ),
    );
    return id;
  }

  async function insertContact(tenantId: string, supplierId: string): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO suppliers.contacts (id, tenant_id, supplier_id, full_name)
         VALUES ($1, $2, $3, 'Ahmet Yilmaz')`,
        [id, tenantId, supplierId],
      ),
    );
    return id;
  }

  async function insertInteraction(
    tenantId: string,
    supplierId: string,
    overrides: { contactId?: string | null; body?: string } = {},
  ): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO suppliers.interactions
           (id, tenant_id, supplier_id, contact_id, author_user_id, occurred_on, body)
         VALUES ($1, $2, $3, $4, $5, '2026-08-21', $6)`,
        [
          id,
          tenantId,
          supplierId,
          overrides.contactId === undefined ? null : overrides.contactId,
          USER_A,
          overrides.body ?? 'fiyat listesi guncellendi',
        ],
      ),
    );
    return id;
  }

  async function countIn(tenantId: string, table: string): Promise<number> {
    const rows = await asTenant(tenantId, (client) =>
      client.query<{ n: string }>(`SELECT count(*) AS n FROM suppliers.${table}`),
    );
    return Number(rows.rows[0]?.n ?? '0');
  }

  describe('sema ve kisitlar', () => {
    it('⚠️ UC TABLO DA GERCEKTEN OLUSTURULDU', async () => {
      // ⚠️ CLAUDE.md'nin kalici dersi: `_journal.json`a girmeyen bir migration
      // "applied successfully" yazar, cikis kodu 0 verir ve HICBIR SEY
      // UYGULAMAZ. `database.integration.spec`in geri alma listesi bunu
      // YAKALAMAZ — `DROP TABLE IF EXISTS` olmayan tablo icin de basarilidir.
      //
      // Sayi saymak da yetmez: `drizzle.__drizzle_migrations` sayaci da
      // journal'a baglidir ve AYNI YALANI soyler.
      const rows = await ownerPool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'suppliers' ORDER BY table_name`,
      );

      expect(rows.rows.map((row) => row.table_name)).toEqual([
        'contacts',
        'interactions',
        'suppliers',
      ]);
    });

    it('⚠️ CHUNK TABLOSU YOKTUR — vektor `interactions` SATIRINDA (§2.2)', async () => {
      // CRM'in `interaction_chunks` tablosu bir EMSAL DEGIL, chunk olcutu
      // (ADR-0035 §3 + ADR-0037 §3) yazilmadan onceki bir MIRASTIR. Metnin ust
      // sinirini BIZ koyariz, dolayisiyla parcalayici her zaman tek parca
      // uretirdi.
      const columns = await ownerPool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'suppliers' AND table_name = 'interactions'`,
      );

      expect(columns.rows.map((row) => row.column_name)).toContain('embedding');
    });

    it('⚠️ `interactions`TA `updated_at` YOKTUR — EKLEME-YALNIZ (§1)', async () => {
      // Guncellenmeyen bir satirin guncellenme zamani olmaz. Kolonu koymak,
      // ileride birinin "demek ki guncellenebiliyor" diye okuyacagi SESSIZ BIR
      // DAVET olurdu.
      //
      // ⚠️ Bu, ADR-0039'un DEGISTIRILEMEZ DEFTERIYLE karistirilmamali: orada
      // BUGUNKU MIKTAR o defterden turetiliyordu; burada turetilen hicbir sayi
      // yok.
      const rows = await ownerPool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'suppliers' AND table_name = 'interactions'`,
      );

      expect(rows.rows.map((row) => row.column_name)).not.toContain('updated_at');
    });

    it('⚠️ ASAMA / FIRSAT KOLONU YOKTUR — "ters yon" (§2.1)', async () => {
      // CRM'in `opportunities` tablosunun bir karsiligi ACILMADI: satin almada
      // belirsizlik tedarikcide degil SIPARISTEDIR ve siparis kapsam disi.
      // ⚠️ Buraya bir `stage` eklemek, ADR-0036'nin esigini de birlikte getirir.
      const tables = await ownerPool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'suppliers'`,
      );
      const columns = await ownerPool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'suppliers' AND table_name = 'suppliers'`,
      );

      expect(tables.rows.map((row) => row.table_name)).not.toContain('opportunities');
      expect(columns.rows.map((row) => row.column_name)).not.toContain('stage');
    });

    it('⚠️ VERGI NO TEKILLIGI KUCUK/BUYUK HARFTEN BAGIMSIZ (§1.1)', async () => {
      // Ayni tuzel kisi icin iki satir acilmasi GORUSME GECMISINI — yani AI'IN
      // HAFIZASINI — ikiye bolerdi ve hata SESSIZ olurdu.
      await insertSupplier(TENANT_A, { taxNumber: 'TR-1234567890' });

      await expect(insertSupplier(TENANT_A, { taxNumber: 'tr-1234567890' })).rejects.toThrow(
        /suppliers_tenant_tax_number_unique_idx/,
      );
    });

    it('vergi numarasi OLMAYAN tedarikciler birbiriyle CAKISMAZ', async () => {
      await insertSupplier(TENANT_A, { taxNumber: null });

      await expect(insertSupplier(TENANT_A, { taxNumber: null })).resolves.toBeDefined();
    });

    it('ayni vergi numarasi FARKLI tenant ta serbesttir', async () => {
      await insertSupplier(TENANT_A, { taxNumber: 'TR-1' });

      await expect(insertSupplier(TENANT_B, { taxNumber: 'TR-1' })).resolves.toBeDefined();
    });

    it('⚠️ AYNI AD IKI KEZ MESRUDUR — tekillik ADDA DEGIL (§1.1)', async () => {
      // Iki ayri sube, iki ayri sozlesme ya da ayni adi tasiyan iki firma
      // mesrudur.
      await insertSupplier(TENANT_A, { name: 'Yildiz Civata' });

      await expect(insertSupplier(TENANT_A, { name: 'Yildiz Civata' })).resolves.toBeDefined();
    });

    it.each(['   ', ''])('BOS ad reddedilir', async (name) => {
      await expect(insertSupplier(TENANT_A, { name })).rejects.toThrow(/suppliers_name_not_blank/);
    });

    it('⚠️ ODEME KOSULLARI SERBEST METINDIR — hicbir bicim zorlanmaz (§1.2)', async () => {
      // Kolon HICBIR KISIT TASIMAZ. Bunun dogrudan sonucu §3.2'de yazili:
      // serbest metinden vade CIKARILAMAZ, dolayisiyla "odeme vadesi yaklasan"
      // bir YAPISAL KATKICI yazilamaz.
      await expect(
        insertSupplier(TENANT_A, {
          paymentTerms: '60 gun vadeli, 10 gun icinde odemede %2 iskonto',
        }),
      ).resolves.toBeDefined();
    });

    it('BOS odeme kosulu reddedilir (null serbest)', async () => {
      await expect(insertSupplier(TENANT_A, { paymentTerms: '  ' })).rejects.toThrow(
        /suppliers_payment_terms_not_blank/,
      );
    });

    it('BOS gorusme metni reddedilir', async () => {
      const supplierId = await insertSupplier(TENANT_A);

      await expect(insertInteraction(TENANT_A, supplierId, { body: '   ' })).rejects.toThrow(
        /supplier_interactions_body_not_blank/,
      );
    });
  });

  describe('⚠️ FK YONLERI — iki ZIT karar (§1.3)', () => {
    it('⚠️ TEDARIKCI silinince kisiler ve gorusmeler CASCADE ile GIDER (KVKK)', async () => {
      // ⚠️ Vektor `interactions` satirinin KENDISINDE yasadigi icin silinen bir
      // tedarikci AI'IN HAFIZASINDAN DA silinir — ADR-0031 §7'nin YEDINCI
      // uygulamasi. Gorusmeler `knowledge.notes`a yazilsaydi bu cascade
      // YAZILAMAZDI (cross-schema FK yasak).
      const supplierId = await insertSupplier(TENANT_A);
      const contactId = await insertContact(TENANT_A, supplierId);
      await insertInteraction(TENANT_A, supplierId, { contactId });

      await asTenant(TENANT_A, (client) =>
        client.query('DELETE FROM suppliers.suppliers WHERE id = $1', [supplierId]),
      );

      expect(await countIn(TENANT_A, 'contacts')).toBe(0);
      expect(await countIn(TENANT_A, 'interactions')).toBe(0);
    });

    it('⚠️ KISI silinince GORUSME KAYDI YERINDE KALIR (`SET NULL`)', async () => {
      // Ayrilan bir satin alma sorumlusunun silinmesi, o tedarikciyle ilgili
      // TUM kurumsal hafizayi goturseydi hata SESSIZ olurdu — kimse "birkac
      // gorusme eksildi" diye fark etmez.
      const supplierId = await insertSupplier(TENANT_A);
      const contactId = await insertContact(TENANT_A, supplierId);
      await insertInteraction(TENANT_A, supplierId, { contactId });

      await asTenant(TENANT_A, (client) =>
        client.query('DELETE FROM suppliers.contacts WHERE id = $1', [contactId]),
      );

      expect(await countIn(TENANT_A, 'interactions')).toBe(1);

      const rows = await asTenant(TENANT_A, (client) =>
        client.query<{ contact_id: string | null }>(
          'SELECT contact_id FROM suppliers.interactions',
        ),
      );
      expect(rows.rows[0]?.contact_id).toBeNull();
    });

    it('⚠️ "KULLANIMDA" HATASI YOKTUR — ADR-0039 dan farkli', async () => {
      // Stok'ta `movements.item_id` `ON DELETE RESTRICT` tasiyordu ve silme
      // VERITABANI SEVIYESINDE reddediliyordu. Burada boyle bir FK YOK: bir
      // "kullanimda" hatasi yazmak VAR OLMAYAN bir iliskiyi IMA EDERDI.
      const supplierId = await insertSupplier(TENANT_A);
      await insertInteraction(TENANT_A, supplierId);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('DELETE FROM suppliers.suppliers WHERE id = $1', [supplierId]),
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('RLS izolasyonu (MT §12.6)', () => {
    it('tenant A, B nin tedarikcisini GOREMEZ', async () => {
      await insertSupplier(TENANT_A, { name: 'A nin tedarikcisi' });
      await insertSupplier(TENANT_B, { name: 'B nin tedarikcisi' });

      const rows = await asTenant(TENANT_A, (client) =>
        // Filtre YAZILMADI; daraltmayi RLS yapti.
        client.query<{ name: string }>('SELECT name FROM suppliers.suppliers'),
      );

      expect(rows.rows.map((row) => row.name)).toEqual(['A nin tedarikcisi']);
    });

    it('⚠️ UC TABLONUN UCUNDE DE POLITIKA VAR — cocuklar ebeveyne EMANET DEGIL', async () => {
      // `contacts` ve `interactions` ebeveynleri uzerinden zaten daralirdi —
      // ama bu, korumayi bir JOIN'e ve yazan kisinin dikkatine emanet etmek
      // olurdu. `tenant_id` uc tabloda da DENORMALIZE ve uc politika da
      // BAGIMSIZ.
      const supplierB = await insertSupplier(TENANT_B);
      await insertContact(TENANT_B, supplierB);
      await insertInteraction(TENANT_B, supplierB);

      expect(await countIn(TENANT_A, 'contacts')).toBe(0);
      expect(await countIn(TENANT_A, 'interactions')).toBe(0);
    });

    it('BASKA tenant adina yazmak WITH CHECK ile reddedilir', async () => {
      const supplierId = await insertSupplier(TENANT_A);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO suppliers.interactions
               (id, tenant_id, supplier_id, author_user_id, occurred_on, body)
             VALUES ($1, $2, $3, $4, '2026-08-21', 'sizinti denemesi')`,
            [randomUUID(), TENANT_B, supplierId, USER_A],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('tenant A, B nin gorusmesini SILEMEZ', async () => {
      const supplierB = await insertSupplier(TENANT_B);
      await insertInteraction(TENANT_B, supplierB);

      const deleted = await asTenant(TENANT_A, async (client) => {
        const result = await client.query('DELETE FROM suppliers.interactions');
        return result.rowCount;
      });

      expect(deleted).toBe(0);
    });

    it('⚠️ TENANT CONTEXT YOKKEN sorgu SESSIZCE BOS DONMEZ, HATA VERIR', async () => {
      // MT §12.6 madde 4 — `missing_ok` kullanilmamasinin kaniti.
      const client = await appPool.connect();
      try {
        await expect(client.query('SELECT * FROM suppliers.suppliers')).rejects.toThrow(
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
        `SELECT has_schema_privilege($1, 'suppliers', 'USAGE')  AS usage,
                has_schema_privilege($1, 'suppliers', 'CREATE') AS create`,
        [APP_ROLE],
      );

      expect(rows.rows[0]).toEqual({ usage: true, create: false });
    });

    /**
     * ⚠️ HAFIF KAPANIS DENETIMININ MADDESI, OTOMATIKLESTIRILDI.
     *
     * Uc dar `BYPASSRLS` rolu de `suppliers` semasina KOR olmalidir. Onlarin
     * tek yetenegi RLS'i asmaktir; yeni bir semaya erisim kazanirlarsa o
     * semanin tenant izolasyonu SESSIZCE delinir.
     */
    it.each([RLS_READER_ROLE, OUTBOX_RELAY_ROLE, REPORT_WORKER_ROLE])(
      '%s dar rolu suppliers semasini HIC GORMEZ',
      async (role) => {
        const rows = await ownerPool.query<{ usage: boolean; create: boolean }>(
          `SELECT has_schema_privilege($1, 'suppliers', 'USAGE')  AS usage,
                  has_schema_privilege($1, 'suppliers', 'CREATE') AS create`,
          [role],
        );

        expect(rows.rows[0]).toEqual({ usage: false, create: false });
      },
    );

    it.each([RLS_READER_ROLE, OUTBOX_RELAY_ROLE, REPORT_WORKER_ROLE])(
      '%s dar rolunun suppliers tablolari uzerinde HICBIR grant i yok',
      async (role) => {
        const rows = await ownerPool.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM information_schema.role_table_grants
           WHERE table_schema = 'suppliers' AND grantee = $1`,
          [role],
        );

        expect(rows.rows[0]?.n).toBe(0);
      },
    );
  });
});
