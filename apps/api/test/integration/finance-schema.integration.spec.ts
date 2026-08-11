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
    await ownerPool.query(
      'TRUNCATE finance.commentary_chunks, finance.commentaries, finance.transactions, finance.categories CASCADE',
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
    it('DORT tablo finance semasinda olusturuldu', async () => {
      // ⚠️ Bu satir her yeni tabloda guncellenir. `crm-schema`nin "bes tablo"
      // iddiasinin `0019`dan sonra guncellenmemis olmasi testi aylarca kirmizi
      // birakmisti.
      const rows = await ownerPool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'finance' ORDER BY table_name",
      );

      expect(rows.rows.map((row) => row.table_name)).toEqual([
        'categories',
        'commentaries',
        'commentary_chunks',
        'transactions',
      ]);
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

  describe('islemler — bilesik FK ve para kisitlari (ADR-0034 §2, §3c)', () => {
    async function insertTransaction(
      tenantId: string,
      overrides: {
        direction?: string;
        amount?: string;
        currency?: string;
        occurredOn?: string;
        categoryId?: string | null;
        description?: string | null;
      } = {},
    ): Promise<string> {
      const id = randomUUID();
      await asTenant(tenantId, (client) =>
        client.query(
          `INSERT INTO finance.transactions
             (id, tenant_id, direction, amount, currency, occurred_on, category_id, description, created_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            id,
            tenantId,
            overrides.direction ?? 'expense',
            overrides.amount ?? '1500.00',
            overrides.currency ?? 'TRY',
            overrides.occurredOn ?? '2026-08-01',
            overrides.categoryId ?? null,
            overrides.description ?? null,
            USER_A,
          ],
        ),
      );
      return id;
    }

    it('KATEGORISIZ islem yazilabilir — MATCH SIMPLE in kaniti', async () => {
      // ⚠️ BU TEST BILESIK FK'NIN `MATCH SIMPLE` OLDUGUNU KANITLAR.
      // `MATCH FULL` yazilsaydi ("ya hepsi dolu ya hepsi NULL") `direction`
      // NOT NULL oldugu icin kategorisiz kayit IMKANSIZ olurdu — ve bu, sahte
      // kategori tuzagini geri getirirdi.
      await expect(insertTransaction(TENANT_A, { categoryId: null })).resolves.toBeDefined();
    });

    it('AYNI yondeki kategori kabul edilir', async () => {
      const categoryId = await insertCategory(TENANT_A, { direction: 'expense' });
      await expect(
        insertTransaction(TENANT_A, { direction: 'expense', categoryId }),
      ).resolves.toBeDefined();
    });

    it('⚠️ TERS yondeki kategori VERITABANI SEVIYESINDE reddedilir', async () => {
      // Bu modulun en onemli kisiti: "gelir kaydina gider kategorisi" imkansiz.
      // Uygulama katmani da kontrol ediyor ama bu satir, uygulamayi ATLAYAN her
      // yolu (elle SQL, ileride bir ithalat betigi) baglar.
      const categoryId = await insertCategory(TENANT_A, { direction: 'expense' });

      await expect(
        insertTransaction(TENANT_A, { direction: 'income', categoryId }),
      ).rejects.toThrow(/transactions_category_direction_fkey/);
    });

    it('VAR OLMAYAN kategori reddedilir', async () => {
      await expect(insertTransaction(TENANT_A, { categoryId: randomUUID() })).rejects.toThrow(
        /transactions_category_direction_fkey/,
      );
    });

    it('⚠️ KULLANIMDAKI kategori SILINEMEZ (ON DELETE RESTRICT)', async () => {
      // ADR-0034 §3e. `SET NULL` olsaydi kategori silmek gecmis ozetleri
      // SESSIZCE degistirirdi — gecen ayin raporu bugun baska bir sey soylerdi.
      //
      // ⚠️ Bu yol Slice 1'de URETILEMEZDI (isaret eden tablo yoktu) ve
      // `CategoryInUseError` o gun "bugun tetiklenemez" notuyla yazilmisti.
      // Artik tetiklenebiliyor.
      const categoryId = await insertCategory(TENANT_A, { direction: 'expense' });
      await insertTransaction(TENANT_A, { categoryId });

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('DELETE FROM finance.categories WHERE id = $1', [categoryId]),
        ),
      ).rejects.toThrow(/transactions_category_direction_fkey|foreign key/i);
    });

    it('KULLANILMAYAN kategori silinebilir', async () => {
      const categoryId = await insertCategory(TENANT_A, { direction: 'expense' });

      const deleted = await asTenant(TENANT_A, async (client) => {
        const result = await client.query('DELETE FROM finance.categories WHERE id = $1', [
          categoryId,
        ]);
        return result.rowCount;
      });

      expect(deleted).toBe(1);
    });

    it.each(['0', '-1', '0.00'])('tutar %s reddedilir — daima POZITIF', async (amount) => {
      await expect(insertTransaction(TENANT_A, { amount })).rejects.toThrow(
        /transactions_amount_positive/,
      );
    });

    it('tutar iki ondalige YUVARLANIR (numeric(14,2))', async () => {
      // ⚠️ Veritabani burada SESSIZCE yuvarlar; uygulama katmani bu yuzden
      // ikiden fazla ondaligi REDDEDER (`money.ts`). Ikisi ayni sey degildir:
      // biri veriyi degistirir, digeri istegi geri cevirir.
      const id = await insertTransaction(TENANT_A, { amount: '10.005' });

      const rows = await asTenant(TENANT_A, (client) =>
        client.query<{ amount: string }>('SELECT amount FROM finance.transactions WHERE id = $1', [
          id,
        ]),
      );

      expect(rows.rows[0]?.amount).toBe('10.01');
    });

    it.each(['try', 'TRYY', 'TR', 'T1R'])('para birimi %s reddedilir', async (currency) => {
      await expect(insertTransaction(TENANT_A, { currency })).rejects.toThrow(
        /transactions_currency_shape/,
      );
    });

    it('GECERSIZ yon reddedilir', async () => {
      await expect(insertTransaction(TENANT_A, { direction: 'transfer' })).rejects.toThrow(
        /transactions_direction_valid/,
      );
    });

    it('BOS aciklama reddedilir (null serbest)', async () => {
      await expect(insertTransaction(TENANT_A, { description: '   ' })).rejects.toThrow(
        /transactions_description_not_blank/,
      );
      await expect(insertTransaction(TENANT_A, { description: null })).resolves.toBeDefined();
    });

    it('cross-modul kolonlari FK TASIMAZ', async () => {
      // ⚠️ Yine bir seyin YOKLUGUNU kanitliyor. Hedefler `crm.companies` ve
      // `projects.projects`, yani baska semalar; biri iyi niyetle
      // `.references()` eklerse migration calisir ama modul ayrilabilirligi
      // SESSIZCE kaybolur.
      const rows = await ownerPool.query<{ target: string }>(
        `SELECT confrelid::regclass::text AS target FROM pg_constraint
         WHERE conrelid = 'finance.transactions'::regclass AND contype = 'f'
         ORDER BY 1`,
      );

      // Iki mesru FK: `tenant_id -> platform.tenants` (MT §12.3 istisnasi) ve
      // bilesik `(category_id, direction) -> finance.categories` (SEMA ICI).
      expect(rows.rows.map((row) => row.target)).toEqual([
        'finance.categories',
        'platform.tenants',
      ]);
    });

    it('VAR OLMAYAN sirket/proje id si YAZILABILIR — sarkan isaretci mesrudur', async () => {
      // ADR-0034 §4: cascade baska semaya uzanamaz; okuyan yol dayanikli olmak
      // zorundadir. Veritabani burada bir sey dayatmaz — dayatamaz da.
      const id = randomUUID();
      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO finance.transactions
               (id, tenant_id, direction, amount, currency, occurred_on, company_id, project_id, created_by_user_id)
             VALUES ($1, $2, 'expense', '10.00', 'TRY', '2026-08-01', $3, $4, $5)`,
            [id, TENANT_A, randomUUID(), randomUUID(), USER_A],
          ),
        ),
      ).resolves.toBeDefined();
    });

    it('transactions: tenant A, B nin islemini GOREMEZ', async () => {
      await insertTransaction(TENANT_A, { amount: '111.00' });
      await insertTransaction(TENANT_B, { amount: '222.00' });

      const rows = await asTenant(TENANT_A, async (client) => {
        const result = await client.query<{ amount: string }>(
          'SELECT amount FROM finance.transactions',
        );
        return result.rows;
      });

      expect(rows.map((row) => row.amount)).toEqual(['111.00']);
    });

    it('transactions: BASKA tenant adina yazmak WITH CHECK ile reddedilir', async () => {
      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO finance.transactions
               (id, tenant_id, direction, amount, currency, occurred_on, created_by_user_id)
             VALUES ($1, $2, 'expense', '10.00', 'TRY', '2026-08-01', $3)`,
            [randomUUID(), TENANT_B, USER_A],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('transactions: tenant context i OLMADAN sorgu HATA verir', async () => {
      // Bedeli burada daha da agir olurdu: sessiz bos sonuc "bu ay hic hareket
      // yok" gibi gorunur ve kullanici YANLIS BIR FINANSAL TABLO gorurdu.
      const client = await appPool.connect();
      try {
        await expect(client.query('SELECT * FROM finance.transactions')).rejects.toThrow(
          /unrecognized configuration parameter|invalid input syntax/i,
        );
      } finally {
        client.release();
      }
    });
  });

  describe('yorumlar ve parcalar (ADR-0034 §6.1)', () => {
    async function insertCommentary(
      tenantId: string,
      overrides: { body?: string; occurredOn?: string } = {},
    ): Promise<string> {
      const id = randomUUID();
      await asTenant(tenantId, (client) =>
        client.query(
          `INSERT INTO finance.commentaries (id, tenant_id, author_user_id, occurred_on, body)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            id,
            tenantId,
            USER_A,
            overrides.occurredOn ?? '2026-03-31',
            overrides.body ?? 'Mart ta nakit sikisti',
          ],
        ),
      );
      return id;
    }

    async function insertChunk(tenantId: string, commentaryId: string, index = 0): Promise<void> {
      const vector = `[${Array.from({ length: 1536 }, () => '0.1').join(',')}]`;
      await asTenant(tenantId, (client) =>
        client.query(
          `INSERT INTO finance.commentary_chunks
             (id, tenant_id, commentary_id, chunk_index, content, embedding)
           VALUES ($1, $2, $3, $4, $5, $6::vector)`,
          [
            randomUUID(),
            tenantId,
            commentaryId,
            index,
            '[Finansal yorum · 2026-03-31] metin',
            vector,
          ],
        ),
      );
    }

    it('BOS yorum govdesi reddedilir (veritabani seviyesinde)', async () => {
      await expect(insertCommentary(TENANT_A, { body: '   ' })).rejects.toThrow(
        /commentaries_body_not_blank/,
      );
    });

    it('yorumun EBEVEYNI YOKTUR — hicbir FK islem/kategoriye isaret etmez', async () => {
      // ⚠️ BU TESTIN ISI BIR SEYIN OLMADIGINI KANITLAMAKTIR (ADR-0034 §1.1).
      // Bir `transaction_id` eklemek yorumun tasidigi TOPLU bakisi yok ederdi
      // ve islem silinince yorum da giderdi — oysa "o ay neden zordu" bilgisi
      // tek bir kaydin silinmesinden BAGIMSIZ olarak degerlidir.
      const rows = await ownerPool.query<{ target: string }>(
        `SELECT confrelid::regclass::text AS target FROM pg_constraint
         WHERE conrelid = 'finance.commentaries'::regclass AND contype = 'f'`,
      );

      expect(rows.rows.map((row) => row.target)).toEqual(['platform.tenants']);
    });

    it('yorum silinince PARCALARI da gider (CASCADE)', async () => {
      const commentaryId = await insertCommentary(TENANT_A);
      await insertChunk(TENANT_A, commentaryId);

      const remaining = await asTenant(TENANT_A, async (client) => {
        await client.query('DELETE FROM finance.commentaries WHERE id = $1', [commentaryId]);
        const result = await client.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM finance.commentary_chunks',
        );
        return result.rows[0]?.n;
      });

      expect(remaining).toBe(0);
    });

    it('AYNI (yorum, index) ikilisi IKI KEZ yazilamaz — onarim idempotent', async () => {
      const commentaryId = await insertCommentary(TENANT_A);
      await insertChunk(TENANT_A, commentaryId, 0);

      await expect(insertChunk(TENANT_A, commentaryId, 0)).rejects.toThrow(
        /commentary_chunks_unique_index/,
      );
    });

    it('NEGATIF chunk index reddedilir', async () => {
      const commentaryId = await insertCommentary(TENANT_A);
      await expect(insertChunk(TENANT_A, commentaryId, -1)).rejects.toThrow(
        /commentary_chunks_index_positive/,
      );
    });

    it('HNSW index i vector_cosine_ops ile kurulmus', async () => {
      // ⚠️ Operator sorgudaki `<=>` ile eslesmezse index DEVRE DISI kalir ve
      // sorgu tam tarama yapar — sessiz bir performans coku.
      const rows = await ownerPool.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
         WHERE schemaname = 'finance' AND indexname = 'commentary_chunks_embedding_idx'`,
      );

      expect(rows.rows[0]?.indexdef).toMatch(/USING hnsw .*vector_cosine_ops/);
    });

    it('commentaries: tenant A, B nin yorumunu GOREMEZ', async () => {
      await insertCommentary(TENANT_B, { body: 'B nin yorumu' });
      await insertCommentary(TENANT_A, { body: 'A nin yorumu' });

      const rows = await asTenant(TENANT_A, async (client) => {
        const result = await client.query<{ body: string }>(
          'SELECT body FROM finance.commentaries',
        );
        return result.rows;
      });

      expect(rows.map((row) => row.body)).toEqual(['A nin yorumu']);
    });

    it('commentary_chunks: tenant A, B nin parcasini GOREMEZ', async () => {
      const commentaryB = await insertCommentary(TENANT_B);
      await insertChunk(TENANT_B, commentaryB);

      const rows = await asTenant(TENANT_A, async (client) => {
        const result = await client.query<{ id: string }>(
          'SELECT id FROM finance.commentary_chunks',
        );
        return result.rows;
      });

      expect(rows).toHaveLength(0);
    });

    it.each(['commentaries', 'commentary_chunks'])(
      '%s: tenant context i OLMADAN sorgu HATA verir',
      async (table) => {
        const client = await appPool.connect();
        try {
          await expect(client.query(`SELECT 1 FROM finance.${table}`)).rejects.toThrow(
            /unrecognized configuration parameter|invalid input syntax/i,
          );
        } finally {
          client.release();
        }
      },
    );
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
