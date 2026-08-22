import { randomUUID } from 'node:crypto';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { APP_ROLE, APP_PASSWORD, createApplicationRole } from './support/database-roles';
import { POSTGRES_IMAGE } from './support/test-database';

/**
 * `invoicing` semasi — MT §12.6 ZORUNLU izolasyon testi (ADR-0041 Slice 1).
 *
 * ============================================================================
 * ⚠️ BU DOSYA DORT SEYIN KANITIDIR VE DORDU DE BIRIM TESTIYLE GORULEMEZ
 * ============================================================================
 *   1. MIGRATION GERCEKTEN UYGULANDI (uc tablonun VARLIGI) — CLAUDE.md'nin
 *      kalici dersi: `_journal.json`a girmeyen bir migration "applied
 *      successfully" yazar, cikis kodu 0 verir ve HICBIR SEY UYGULAMAZ.
 *      Sayac (`drizzle.__drizzle_migrations`) da journal'a baglidir ve AYNI
 *      YALANI SOYLER; bu yuzden tablolarin VARLIGI iddia ediliyor.
 *   2. ⚠️ UCUNCU KATMAN GERCEKTEN CALISIYOR (§2): gonderilmis bir belgenin
 *      kalemlerine YAPILAN HAM SQL yazmasi VERITABANI tarafindan reddediliyor.
 *      Uygulama katmani bu testte HIC DEVREDE DEGIL — kanitlanan sey tam
 *      olarak "uygulama atlansa bile korunur"dur.
 *   3. ⚠️ `kind`-BAGIMLI CHECK'LER: teklife `issued`, faturaya `accepted`
 *      yazilamiyor ve tur-disi alanlar reddediliyor (§1.1, §1.2).
 *   4. TENANT IZOLASYONU — uc tablonun ucunde de `FORCE RLS`.
 */

const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000f1';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-0000000000f2';
const USER_A = '018f3a2b-7c4d-7e1f-9b3c-0000000000f1';
const USER_B = '018f3a2b-7c4d-7e1f-9b3c-0000000000f2';

describe('invoicing semasi (gercek PostgreSQL)', () => {
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
       VALUES ($1, 'tenant-inv-a', 'Tenant A', 'active', $3),
              ($2, 'tenant-inv-b', 'Tenant B', 'active', $4)`,
      [TENANT_A, TENANT_B, USER_A, USER_B],
    );
  }, 180_000);

  afterAll(async () => {
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  beforeEach(async () => {
    // ⚠️ SIRA: kalemler once (belgelere `CASCADE` ile bagli), sonra belgeler.
    await ownerPool.query(
      'TRUNCATE invoicing.sales_document_lines, invoicing.sales_documents, invoicing.number_sequences CASCADE',
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

  async function insertDocument(
    tenantId: string,
    overrides: {
      kind?: string;
      status?: string;
      validUntil?: string | null;
      dueOn?: string | null;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO invoicing.sales_documents
           (id, tenant_id, kind, status, customer_name, issued_on,
            valid_until, due_on, currency, created_by_user_id)
         VALUES ($1, $2, $3, $4, 'Yildiz Ltd.', '2026-08-22', $5, $6, 'TRY', $7)`,
        [
          id,
          tenantId,
          overrides.kind ?? 'quote',
          overrides.status ?? 'draft',
          overrides.validUntil ?? null,
          overrides.dueOn ?? null,
          USER_A,
        ],
      ),
    );
    return id;
  }

  async function insertLine(tenantId: string, documentId: string, position = 1): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO invoicing.sales_document_lines
           (id, tenant_id, document_id, position, description, quantity, unit_price, tax_rate)
         VALUES ($1, $2, $3, $4, 'M8 civata', 500, 12.50, 20)`,
        [id, tenantId, documentId, position],
      ),
    );
    return id;
  }

  async function countIn(tenantId: string, table: string): Promise<number> {
    const rows = await asTenant(tenantId, (client) =>
      client.query<{ n: string }>(`SELECT count(*) AS n FROM invoicing.${table}`),
    );
    return Number(rows.rows[0]?.n ?? '0');
  }

  it('⚠️ UC TABLO DA GERCEKTEN OLUSTURULDU', async () => {
    const { rows } = await ownerPool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'invoicing' ORDER BY table_name`,
    );

    expect(rows.map((row) => row.table_name)).toEqual([
      'number_sequences',
      'sales_document_lines',
      'sales_documents',
    ]);
  });

  it('uc tabloda da RLS + FORCE acik', async () => {
    const { rows } = await ownerPool.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'invoicing' AND c.relkind = 'r'
        ORDER BY c.relname`,
    );

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
    }
  });

  it('tenant izolasyonu: A nin belgesi B ye GORUNMEZ', async () => {
    await insertDocument(TENANT_A);

    expect(await countIn(TENANT_A, 'sales_documents')).toBe(1);
    expect(await countIn(TENANT_B, 'sales_documents')).toBe(0);
  });

  describe('⚠️ UCUNCU KATMAN: degistirilemezlik TRIGGER I (§2)', () => {
    it('TASLAK belgenin kalemleri yazilabilir', async () => {
      const id = await insertDocument(TENANT_A, { status: 'draft' });

      await expect(insertLine(TENANT_A, id)).resolves.toBeDefined();
    });

    it('⚠️ GONDERILMIS belgeye kalem EKLENEMEZ — uygulama HIC DEVREDE DEGIL', async () => {
      // ⚠️ Bu testin butun degeri burada: asagidaki `INSERT` HAM SQL'dir.
      // `assertEditable()` cagrilmiyor, `PATCH` ucu kullanilmiyor. Yani
      // kanitlanan sey "uygulama atlansa bile korunur"dur — ve kalemler AYRI
      // BIR TABLODA oldugu icin baslik uzerindeki kontrol onlari KAPSAMAZ.
      const id = await insertDocument(TENANT_A, { status: 'sent' });

      await expect(insertLine(TENANT_A, id)).rejects.toThrow(/not editable/);
    });

    it('⚠️ GONDERILMIS belgenin kalemi GUNCELLENEMEZ ve SILINEMEZ', async () => {
      const id = await insertDocument(TENANT_A, { status: 'draft' });
      const lineId = await insertLine(TENANT_A, id);

      await ownerPool.query(`UPDATE invoicing.sales_documents SET status = 'sent' WHERE id = $1`, [
        id,
      ]);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('UPDATE invoicing.sales_document_lines SET quantity = 1 WHERE id = $1', [
            lineId,
          ]),
        ),
      ).rejects.toThrow(/not editable/);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('DELETE FROM invoicing.sales_document_lines WHERE id = $1', [lineId]),
        ),
      ).rejects.toThrow(/not editable/);
    });

    it('⚠️ EBEVEYN SILINDIGINDE CASCADE CALISIR — trigger kendi kendini KILITLEMEZ', async () => {
      // ⚠️ Trigger'daki "ebeveyn yoksa izin ver" dali DEKORATIF DEGILDIR:
      // `ON DELETE CASCADE` once ebeveyni siler, sonra cocuklara `DELETE`
      // uygular. O dal olmasaydi `draft` OLMAYAN bir belgenin silinmesi
      // (retention, tenant temizligi) KENDI trigger'ina takilirdi.
      const id = await insertDocument(TENANT_A, { status: 'draft' });
      await insertLine(TENANT_A, id);
      await ownerPool.query(`UPDATE invoicing.sales_documents SET status = 'sent' WHERE id = $1`, [
        id,
      ]);

      await ownerPool.query('DELETE FROM invoicing.sales_documents WHERE id = $1', [id]);

      expect(await countIn(TENANT_A, 'sales_document_lines')).toBe(0);
    });
  });

  describe('⚠️ `kind`-BAGIMLI CHECK ler (§1.1, §1.2)', () => {
    it('teklife `issued` YAZILAMAZ', async () => {
      await expect(insertDocument(TENANT_A, { kind: 'quote', status: 'issued' })).rejects.toThrow(
        /sales_documents_status_valid/,
      );
    });

    it('faturaya `accepted` YAZILAMAZ', async () => {
      await expect(
        insertDocument(TENANT_A, { kind: 'invoice', status: 'accepted' }),
      ).rejects.toThrow(/sales_documents_status_valid/);
    });

    it('⚠️ faturaya `valid_until` YAZILAMAZ (tur-disi alan)', async () => {
      await expect(
        insertDocument(TENANT_A, { kind: 'invoice', validUntil: '2026-09-01' }),
      ).rejects.toThrow(/sales_documents_quote_only_fields/);
    });

    it('⚠️ teklife `due_on` YAZILAMAZ', async () => {
      await expect(
        insertDocument(TENANT_A, { kind: 'quote', dueOn: '2026-09-01' }),
      ).rejects.toThrow(/sales_documents_invoice_only_fields/);
    });
  });

  describe('belge numarasi (§1.6)', () => {
    it('⚠️ numara TENANT + TUR icinde tekildir, taslaklar (numarasiz) CAKISMAZ', async () => {
      const first = await insertDocument(TENANT_A);
      const second = await insertDocument(TENANT_A);

      // Iki taslak da numarasiz — kismi index sayesinde CAKISMAZLAR.
      expect(first).not.toBe(second);

      await asTenant(TENANT_A, (client) =>
        client.query(`UPDATE invoicing.sales_documents SET number = 'TKF-000001' WHERE id = $1`, [
          first,
        ]),
      );

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(`UPDATE invoicing.sales_documents SET number = 'TKF-000001' WHERE id = $1`, [
            second,
          ]),
        ),
      ).rejects.toThrow(/sales_documents_tenant_kind_number_unique_idx/);
    });

    it('AYNI numara BASKA TENANT ta serbesttir', async () => {
      const a = await insertDocument(TENANT_A);
      const b = await insertDocument(TENANT_B);

      await asTenant(TENANT_A, (client) =>
        client.query(`UPDATE invoicing.sales_documents SET number = 'TKF-000001' WHERE id = $1`, [
          a,
        ]),
      );

      await expect(
        asTenant(TENANT_B, (client) =>
          client.query(`UPDATE invoicing.sales_documents SET number = 'TKF-000001' WHERE id = $1`, [
            b,
          ]),
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('kisitlar', () => {
    it('miktar POZITIF olmali', async () => {
      const id = await insertDocument(TENANT_A);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO invoicing.sales_document_lines
               (id, tenant_id, document_id, position, description, quantity, unit_price)
             VALUES ($1, $2, $3, 1, 'x', 0, 10)`,
            [randomUUID(), TENANT_A, id],
          ),
        ),
      ).rejects.toThrow(/sales_document_lines_quantity_positive/);
    });

    it('⚠️ NEGATIF BIRIM FIYAT SERBESTTIR — iskonto satiri (§1.7)', async () => {
      const id = await insertDocument(TENANT_A);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO invoicing.sales_document_lines
               (id, tenant_id, document_id, position, description, quantity, unit_price)
             VALUES ($1, $2, $3, 1, 'Sadakat indirimi', 1, -500)`,
            [randomUUID(), TENANT_A, id],
          ),
        ),
      ).resolves.toBeDefined();
    });

    it('vergi orani 0..100 araligindadir', async () => {
      const id = await insertDocument(TENANT_A);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO invoicing.sales_document_lines
               (id, tenant_id, document_id, position, description, quantity, unit_price, tax_rate)
             VALUES ($1, $2, $3, 1, 'x', 1, 10, 120)`,
            [randomUUID(), TENANT_A, id],
          ),
        ),
      ).rejects.toThrow(/sales_document_lines_tax_rate_range/);
    });

    it('para birimi SEKLI zorlanir', async () => {
      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO invoicing.sales_documents
               (id, tenant_id, kind, status, customer_name, issued_on, currency, created_by_user_id)
             VALUES ($1, $2, 'quote', 'draft', 'X', '2026-08-22', 'try', $3)`,
            [randomUUID(), TENANT_A, USER_A],
          ),
        ),
      ).rejects.toThrow(/sales_documents_currency_shape/);
    });

    it('⚠️ bir belge KENDISINDEN turetilemez', async () => {
      const id = randomUUID();

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO invoicing.sales_documents
               (id, tenant_id, kind, status, customer_name, issued_on, currency,
                converted_from_id, created_by_user_id)
             VALUES ($1, $2, 'invoice', 'draft', 'X', '2026-08-22', 'TRY', $1, $3)`,
            [id, TENANT_A, USER_A],
          ),
        ),
      ).rejects.toThrow(/sales_documents_not_self_converted/);
    });

    it('⚠️ faturaya kaynaklik eden teklif SILINEMEZ (`RESTRICT`, §3)', async () => {
      const quoteId = await insertDocument(TENANT_A, { kind: 'quote', status: 'draft' });
      const invoiceId = randomUUID();

      await asTenant(TENANT_A, (client) =>
        client.query(
          `INSERT INTO invoicing.sales_documents
             (id, tenant_id, kind, status, customer_name, issued_on, currency,
              converted_from_id, created_by_user_id)
           VALUES ($1, $2, 'invoice', 'draft', 'X', '2026-08-22', 'TRY', $3, $4)`,
          [invoiceId, TENANT_A, quoteId, USER_A],
        ),
      );

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('DELETE FROM invoicing.sales_documents WHERE id = $1', [quoteId]),
        ),
      ).rejects.toThrow(/foreign key|violates/i);
    });
  });
});
