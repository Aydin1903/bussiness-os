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
 * `inventory` semasi — MT §12.6 ZORUNLU izolasyon testi (ADR-0039 Slice 1).
 *
 * ============================================================================
 * ⚠️ BU DOSYA UC SEYIN KANITIDIR VE UCU DE BIRIM TESTIYLE GORULEMEZ
 * ============================================================================
 *   1. MIGRATION GERCEKTEN UYGULANDI (iki tablonun VARLIGI) — CLAUDE.md'nin
 *      kalici dersi: `_journal.json`a girmeyen bir migration "applied
 *      successfully" yazar, cikis kodu 0 verir ve HICBIR SEY UYGULAMAZ.
 *   2. ⚠️ §2'NIN TURETME KARARININ PERFORMANS OLCUMU — bu ADR'nin MERKEZI
 *      karari ve "olculmeden kapanmaz" diye kayitli.
 *   3. ⚠️ §3.2'NIN `FOR UPDATE` KILIDI GERCEKTEN SERILESTIRIYOR MU — sayim
 *      yarisi ancak IKI GERCEK BAGLANTIYLA gosterilebilir.
 */

const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000d1';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-0000000000d2';
const USER_A = '018f3a2b-7c4d-7e1f-9b3c-0000000000d1';
const USER_B = '018f3a2b-7c4d-7e1f-9b3c-0000000000d2';

describe('inventory semasi (gercek PostgreSQL)', () => {
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
    // ⚠️ SIRA: once `movements` — `items`e `ON DELETE RESTRICT` ile bagli.
    await ownerPool.query('TRUNCATE inventory.movements, inventory.items CASCADE');
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

  async function insertItem(
    tenantId: string,
    overrides: {
      name?: string;
      sku?: string | null;
      unit?: string;
      minQuantity?: string | null;
      note?: string | null;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO inventory.items
           (id, tenant_id, name, sku, unit, min_quantity, note, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          tenantId,
          overrides.name ?? 'Vida M8',
          overrides.sku === undefined ? null : overrides.sku,
          overrides.unit ?? 'adet',
          overrides.minQuantity === undefined ? null : overrides.minQuantity,
          overrides.note === undefined ? null : overrides.note,
          USER_A,
        ],
      ),
    );
    return id;
  }

  async function insertMovement(
    tenantId: string,
    itemId: string,
    overrides: { direction?: string; quantity?: string; isCorrection?: boolean } = {},
  ): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO inventory.movements
           (id, tenant_id, item_id, direction, quantity, is_correction, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          tenantId,
          itemId,
          overrides.direction ?? 'in',
          overrides.quantity ?? '10',
          overrides.isCorrection ?? false,
          USER_A,
        ],
      ),
    );
    return id;
  }

  /** ⚠️ MIKTARIN TEK TANIMI — repository'deki `QUANTITY_SUM` ile AYNI ifade. */
  const QUANTITY_SQL = `COALESCE(SUM(CASE WHEN direction = 'in' THEN quantity ELSE -quantity END), 0)`;

  async function quantityOf(tenantId: string, itemId: string): Promise<string> {
    const rows = await asTenant(tenantId, (client) =>
      client.query<{ quantity: string }>(
        `SELECT ${QUANTITY_SQL} AS quantity FROM inventory.movements WHERE item_id = $1`,
        [itemId],
      ),
    );
    return rows.rows[0]?.quantity ?? '0';
  }

  describe('sema ve kisitlar', () => {
    it('⚠️ IKI TABLO DA GERCEKTEN OLUSTURULDU', () => {
      // ⚠️ CLAUDE.md'nin kalici dersi: `_journal.json`a girmeyen bir migration
      // "applied successfully" yazar, cikis kodu 0 verir ve HICBIR SEY
      // UYGULAMAZ. `database.integration.spec`in geri alma listesi bunu
      // YAKALAMAZ — `DROP TABLE IF EXISTS` olmayan tablo icin de basarilidir.
      //
      // Sayi saymak da yetmez: `drizzle.__drizzle_migrations` sayaci da
      // journal'a baglidir ve AYNI YALANI soyler.
      return ownerPool
        .query<{ table_name: string }>(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'inventory' ORDER BY table_name",
        )
        .then((rows) => {
          expect(rows.rows.map((row) => row.table_name)).toEqual(['items', 'movements']);
        });
    });

    it('⚠️ `items`TE MIKTAR KOLONU YOKTUR — modulun merkezi karari (§2)', async () => {
      // ⚠️ BU IDDIA BIR SEYIN YOKLUGUNU KORUR. Biri "performans icin" bir
      // miktar kolonu eklerse ikinci bir dogruluk kaynagi dogar ve onu
      // guncellemeyi unutan her yazma yolu SESSIZ ve MAKUL GORUNEN yanlis bir
      // sayi uretir. Karar ADR-0039 §2.2'de uc argumanla yazilidir ve yon
      // TEKTIR: turetmeden onbellege gecmek mumkun, tersi degil.
      const rows = await ownerPool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'inventory' AND table_name = 'items'`,
      );
      const columns = rows.rows.map((row) => row.column_name);

      expect(columns).not.toContain('quantity');
      expect(columns).not.toContain('quantity_on_hand');
      expect(columns).not.toContain('stock');
    });

    it('⚠️ `movements`TA `updated_at` YOKTUR — defter degistirilemez (§3.3)', async () => {
      // Guncellenmeyen bir satirin guncellenme zamani olmaz. Kolonu koymak,
      // ileride birinin "demek ki guncellenebiliyor" diye okuyacagi SESSIZ BIR
      // DAVET olurdu.
      const rows = await ownerPool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'inventory' AND table_name = 'movements'`,
      );

      expect(rows.rows.map((row) => row.column_name)).not.toContain('updated_at');
    });

    it.each(['0', '-5'])('miktar %s REDDEDILIR — isaret `direction`dadir', async (quantity) => {
      const itemId = await insertItem(TENANT_A);

      await expect(insertMovement(TENANT_A, itemId, { quantity })).rejects.toThrow(
        /movements_quantity_positive/,
      );
    });

    it('⚠️ GECERSIZ YON reddedilir — `adjustment` UCUNCU BIR YON DEGILDIR (§3.1)', async () => {
      // Uc degerli bir `kind` ya isaretli miktar (ADR-0034 §5'in acikca
      // reddettigi) ya da satir bazinda anlam degistiren nullable bir
      // `direction` gerektirirdi. Sebep ayri bir kolonda yasar: `is_correction`.
      const itemId = await insertItem(TENANT_A);

      await expect(insertMovement(TENANT_A, itemId, { direction: 'adjustment' })).rejects.toThrow(
        /movements_direction_valid/,
      );
    });

    it('⚠️ SKU TEKILLIGI KUCUK/BUYUK HARFTEN BAGIMSIZ (§1.1)', async () => {
      // `ABC-1` ile `abc-1`in iki AYRI kalem olmasi STOGU IKIYE BOLERDI ve hata
      // SESSIZ olurdu: ekran calisir, iki satir yan yana durur.
      await insertItem(TENANT_A, { sku: 'VDA-M8' });

      await expect(insertItem(TENANT_A, { sku: 'vda-m8' })).rejects.toThrow(
        /items_tenant_sku_unique_idx/,
      );
    });

    it('SKU suz kalemler birbiriyle CAKISMAZ', async () => {
      await insertItem(TENANT_A, { sku: null });
      await expect(insertItem(TENANT_A, { sku: null })).resolves.toBeDefined();
    });

    it('ayni SKU FARKLI tenant ta serbesttir', async () => {
      await insertItem(TENANT_A, { sku: 'VDA-M8' });
      await expect(insertItem(TENANT_B, { sku: 'VDA-M8' })).resolves.toBeDefined();
    });

    it('⚠️ ESIK `0` KABUL EDILIR ama NEGATIF reddedilir (§6.1)', async () => {
      // `0` = "tukendiginde haber ver" ve MESRUDUR; negatif bir esik ise hicbir
      // zaman tetiklenmeyen bir alarm, yani YAPILANDIRILMIS GORUNEN BIR HICLIK.
      await expect(insertItem(TENANT_A, { minQuantity: '0' })).resolves.toBeDefined();
      await expect(insertItem(TENANT_A, { minQuantity: '-1' })).rejects.toThrow(
        /items_min_quantity_not_negative/,
      );
    });

    it.each(['   ', ''])('BOS not reddedilir (null serbest)', async (note) => {
      // Bos bir not BOS BIR EMBEDDING CAGRISI demek olurdu: para harcayan,
      // hicbir sey aramayan bir vektor.
      await expect(insertItem(TENANT_A, { note })).rejects.toThrow(/items_note_not_blank/);
    });

    it('⚠️ HAREKETI OLAN KALEM SILINEMEZ — `ON DELETE RESTRICT` (§3.4)', async () => {
      // ⚠️ Bu, §3.3'un YARISIDIR: `CASCADE` olsaydi DEGISTIRILEMEZ ilan edilen
      // defter TEK BIR `DELETE` ile yok edilebilirdi. Iki karar ancak birlikte
      // tutar.
      const itemId = await insertItem(TENANT_A);
      await insertMovement(TENANT_A, itemId);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('DELETE FROM inventory.items WHERE id = $1', [itemId]),
        ),
      ).rejects.toThrow(/violates foreign key constraint/i);
    });

    it('HAREKETSIZ kalem SILINEBILIR — yanlis acilmis kaydi temizlemek mesru', async () => {
      const itemId = await insertItem(TENANT_A);

      const deleted = await asTenant(TENANT_A, async (client) => {
        const result = await client.query('DELETE FROM inventory.items WHERE id = $1', [itemId]);
        return result.rowCount;
      });

      expect(deleted).toBe(1);
    });

    it('SEMA DISINA FOREIGN KEY YOKTUR', async () => {
      // ⚠️ Bir seyin YOKLUGUNU kanitliyor. `movements -> items` ayni sema icinde
      // oldugu icin MESRUDUR; disariya cikan tek FK `platform.tenants`tir.
      const rows = await ownerPool.query<{ source: string; target: string }>(
        `SELECT conrelid::regclass::text AS source, confrelid::regclass::text AS target
         FROM pg_constraint
         WHERE connamespace = 'inventory'::regnamespace AND contype = 'f'
         ORDER BY source, target`,
      );

      expect(rows.rows).toEqual([
        { source: 'inventory.items', target: 'platform.tenants' },
        { source: 'inventory.movements', target: 'inventory.items' },
        { source: 'inventory.movements', target: 'platform.tenants' },
      ]);
    });

    it('HNSW index i vector_cosine_ops ile kurulmus', async () => {
      const rows = await ownerPool.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
         WHERE schemaname = 'inventory' AND indexname = 'items_embedding_idx'`,
      );

      expect(rows.rows[0]?.indexdef).toMatch(/USING hnsw .*vector_cosine_ops/);
    });

    it('⚠️ TURETME index i (tenant_id, item_id) uzerinde — §2 ye hizmet eder', async () => {
      const rows = await ownerPool.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
         WHERE schemaname = 'inventory' AND indexname = 'movements_tenant_item_idx'`,
      );

      expect(rows.rows[0]?.indexdef).toMatch(/\(tenant_id, item_id\)/);
    });
  });

  // ==========================================================================
  // ⚠️ §2 — TURETME: DOGRULUK VE PERFORMANS
  // ==========================================================================
  describe('⚠️ MIKTAR TURETILIR (ADR-0039 §2)', () => {
    it('giris - cikis dogru toplanir', async () => {
      const itemId = await insertItem(TENANT_A);
      await insertMovement(TENANT_A, itemId, { direction: 'in', quantity: '10' });
      await insertMovement(TENANT_A, itemId, { direction: 'in', quantity: '5.5' });
      await insertMovement(TENANT_A, itemId, { direction: 'out', quantity: '3.25' });

      expect(await quantityOf(TENANT_A, itemId)).toBe('12.250');
    });

    it('HIC HAREKETI OLMAYAN kalem `0` doner, `NULL` DEGIL', async () => {
      // "Hic hareket yok" ile "toplami sifir" AYNI STOK DURUMUDUR; cagirani iki
      // farkli sekilde ele almaya zorlamak, birini unutmaya davettir.
      const itemId = await insertItem(TENANT_A);

      expect(await quantityOf(TENANT_A, itemId)).toBe('0');
    });

    it('⚠️ MEVCUTTAN FAZLA CIKIS NEGATIF URETIR — engellenmez, GORUNUR olur', async () => {
      // ADR-0039 §Alternatifler: engellemek isletmeyi YALAN SOYLEMEYE iter.
      // v1 kayit tutar, kural koymaz; negatiflik yapisal katkida 0.95 ile
      // raporlanir (fiziksel olarak imkansiz = kayit tutarsiz).
      const itemId = await insertItem(TENANT_A);
      await insertMovement(TENANT_A, itemId, { direction: 'out', quantity: '3' });

      expect(await quantityOf(TENANT_A, itemId)).toBe('-3.000');
    });

    it('⚠️ TURETME PERFORMANS OLCUMU — ADR-0039 §2.3 in ZORUNLU maddesi', async () => {
      // ============================================================================
      // BU TEST, ADR'NIN MERKEZI KARARININ BEDELINI OLCER
      // ============================================================================
      // §2 miktari turetmeyi secti ve gerekcelerinden biri "en kotu bozulma
      // YAVASLIKTIR; yavaslik OLCULEBILIR ve kendini soyler" idi. Bu test o
      // cumleyi bir iddiaya cevirir.
      //
      // ⚠️ ADR-0039 §2.3: bu, turetme kararinin EN SICAK uygulamasidir —
      // Finans'in ozeti donem bazinda okunur, Stok'unki HER LISTEDE.
      //
      // ⚠️ Esik GENIS tutuldu (1 sn): amac bir performans regresyonunu
      // yakalamak degil, KATASTROFIK bir sapmayi (index dusmus, `HAVING` tam
      // tarama yapiyor) yakalamak. Dar bir esik CI makinesinde ARALIKLI
      // KIRMIZI yanardi ve o, degerinden cok gurultu uretirdi.
      const itemId = await insertItem(TENANT_A);

      // 5000 hareket — gercekci bir yillik defter buyuklugu.
      await asTenant(TENANT_A, (client) =>
        client.query(
          `INSERT INTO inventory.movements
             (id, tenant_id, item_id, direction, quantity, created_by_user_id)
           SELECT gen_random_uuid(), $1, $2,
                  CASE WHEN i % 3 = 0 THEN 'out' ELSE 'in' END,
                  1, $3
           FROM generate_series(1, 5000) AS i`,
          [TENANT_A, itemId, USER_A],
        ),
      );

      const started = Date.now();
      const quantity = await quantityOf(TENANT_A, itemId);
      const elapsed = Date.now() - started;

      // 5000 hareket: 3334 giris, 1666 cikis -> 1668
      expect(quantity).toBe('1668.000');
      expect(elapsed).toBeLessThan(1000);

      // ⚠️ SAYI KAYDA GECER: ADR-0039'un kapanis denetimi bu olcumu ister ve
      // "olculmeden kapanmaz" der. CI ciktisinda gorunur olmasi, ilerideki bir
      // sapmanin FARK EDILEBILMESI icindir.
      // eslint-disable-next-line no-console
      console.log(`[ADR-0039 §2.3] 5000 hareketli turetme: ${String(elapsed)} ms`);
    }, 60_000);
  });

  // ==========================================================================
  // ⚠️ §3.2 — `FOR UPDATE` KILIDI
  // ==========================================================================
  describe('⚠️ SAYIM KILIDI — `SELECT ... FOR UPDATE` (ADR-0039 §3.2)', () => {
    it('kilit ALTINDAKI kalem satirini ikinci transaction BEKLER', async () => {
      // ============================================================================
      // BU TEST OLMASAYDI KILIT "DEKORATIF" OLABILIRDI
      // ============================================================================
      // Fiziksel sayim mevcut miktari OKUYUP ona gore bir duzeltme YAZAR. Arada
      // baska bir hareket yazilirsa duzeltme YANLIS MIKTARDA olur ve hata
      // SESSIZDIR — sayim, duzeltmesi gereken farki YENIDEN URETIR.
      //
      // ⚠️ Kilit ANCAK HER YAZMA YOLU ONU ALIRSA anlamlidir; birim testi
      // (`inventory.use-cases.spec.ts`) her iki yolun da `lockItemById`
      // cagirdigini kilitler, BU test kilidin GERCEKTEN serilestirdigini.
      const itemId = await insertItem(TENANT_A);

      const first = await appPool.connect();
      const second = await appPool.connect();

      try {
        await first.query('BEGIN');
        await first.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', TENANT_A]);
        await first.query('SELECT id FROM inventory.items WHERE id = $1 FOR UPDATE', [itemId]);

        await second.query('BEGIN');
        await second.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', TENANT_A]);

        // ⚠️ `NOWAIT`: kilit tutulmuyorsa bu sorgu BASARILI olurdu ve test
        // sessizce yesil yanardi. `NOWAIT` sayesinde "kilit yok" durumu
        // GORUNUR bir basarisizliga donusur.
        await expect(
          second.query('SELECT id FROM inventory.items WHERE id = $1 FOR UPDATE NOWAIT', [itemId]),
        ).rejects.toThrow(/could not obtain lock/i);

        await second.query('ROLLBACK');
        await first.query('COMMIT');
      } finally {
        first.release();
        second.release();
      }
    });

    it('kilit BIRAKILINCA ikinci transaction devam eder', async () => {
      // Kilidin KALICI olmadiginin kaniti: aksi halde ayni kaleme yazan herkes
      // sonsuza kadar bloklanirdi.
      const itemId = await insertItem(TENANT_A);

      const first = await appPool.connect();
      try {
        await first.query('BEGIN');
        await first.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', TENANT_A]);
        await first.query('SELECT id FROM inventory.items WHERE id = $1 FOR UPDATE', [itemId]);
        await first.query('COMMIT');
      } finally {
        first.release();
      }

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('SELECT id FROM inventory.items WHERE id = $1 FOR UPDATE NOWAIT', [itemId]),
        ),
      ).resolves.toBeDefined();
    });

    it('⚠️ FARKLI KALEMLER BIRBIRINI BLOKLAMAZ — kilit KALEM BAZINDA', async () => {
      // Bedeli sinirli tutan sey budur: ayni kaleme yazanlar serilesir, farkli
      // kalemlere yazanlar HIC carpismaz (§2'nin "hareketler carpismaz"
      // kazanci buyuk olcude korunur).
      const itemA = await insertItem(TENANT_A, { sku: 'A-1' });
      const itemB = await insertItem(TENANT_A, { sku: 'B-1' });

      const first = await appPool.connect();
      try {
        await first.query('BEGIN');
        await first.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', TENANT_A]);
        await first.query('SELECT id FROM inventory.items WHERE id = $1 FOR UPDATE', [itemA]);

        await expect(
          asTenant(TENANT_A, (client) =>
            client.query('SELECT id FROM inventory.items WHERE id = $1 FOR UPDATE NOWAIT', [itemB]),
          ),
        ).resolves.toBeDefined();

        await first.query('COMMIT');
      } finally {
        first.release();
      }
    });
  });

  describe('RLS izolasyonu (MT §12.6)', () => {
    it('tenant A, B nin kalemini GOREMEZ', async () => {
      await insertItem(TENANT_A, { name: 'A nin vidasi' });
      await insertItem(TENANT_B, { name: 'B nin vidasi' });

      const rows = await asTenant(TENANT_A, async (client) => {
        // Filtre YAZILMADI; daraltmayi RLS yapti.
        const result = await client.query<{ name: string }>('SELECT name FROM inventory.items');
        return result.rows;
      });

      expect(rows.map((row) => row.name)).toEqual(['A nin vidasi']);
    });

    it('⚠️ MIKTAR TENANT LAR ARASI TOPLANMAZ — RLS turetmeyi de korur', async () => {
      // ⚠️ BU MODULDE RLS'IN BEDELI DAHA AGIR: miktar bir TOPLAMDIR, yani eksik
      // bir filtre "eksik liste" degil YANLIS BIR SAYI uretirdi.
      const itemA = await insertItem(TENANT_A);
      const itemB = await insertItem(TENANT_B);
      await insertMovement(TENANT_A, itemA, { quantity: '10' });
      await insertMovement(TENANT_B, itemB, { quantity: '999' });

      expect(await quantityOf(TENANT_A, itemA)).toBe('10.000');
    });

    it('BASKA tenant adina yazmak WITH CHECK ile reddedilir', async () => {
      const itemId = await insertItem(TENANT_A);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO inventory.movements
               (id, tenant_id, item_id, direction, quantity, created_by_user_id)
             VALUES ($1, $2, $3, 'in', 1, $4)`,
            [randomUUID(), TENANT_B, itemId, USER_A],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('tenant A, B nin hareketini SILEMEZ', async () => {
      const itemB = await insertItem(TENANT_B);
      await insertMovement(TENANT_B, itemB);

      const deleted = await asTenant(TENANT_A, async (client) => {
        const result = await client.query('DELETE FROM inventory.movements');
        return result.rowCount;
      });

      expect(deleted).toBe(0);
    });

    it('⚠️ TENANT CONTEXT YOKKEN sorgu SESSIZCE BOS DONMEZ, HATA VERIR', async () => {
      // MT §12.6 madde 4 — `missing_ok` kullanilmamasinin kaniti.
      //
      // ⚠️ Bedeli bu modulde OZELLIKLE agirdir ve §2'nin dogrudan sonucudur:
      // miktar bir TOPLAMDIR. Sessizce bos donen bir `movements` sorgusu, hata
      // degil "STOK SIFIR" olarak okunur — yanlis bir SAYI, eksik bir liste
      // degil.
      const client = await appPool.connect();
      try {
        await expect(client.query('SELECT * FROM inventory.movements')).rejects.toThrow(
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
        `SELECT has_schema_privilege($1, 'inventory', 'USAGE')  AS usage,
                has_schema_privilege($1, 'inventory', 'CREATE') AS create`,
        [APP_ROLE],
      );

      expect(rows.rows[0]).toEqual({ usage: true, create: false });
    });

    /**
     * ⚠️ HAFIF KAPANIS DENETIMININ MADDESI, OTOMATIKLESTIRILDI.
     *
     * Uc dar `BYPASSRLS` rolu de `inventory` semasina KOR olmalidir. Onlarin
     * tek yetenegi RLS'i asmaktir; yeni bir semaya erisim kazanirlarsa o
     * semanin tenant izolasyonu SESSIZCE delinir.
     */
    it.each([RLS_READER_ROLE, OUTBOX_RELAY_ROLE, REPORT_WORKER_ROLE])(
      '%s dar rolu inventory semasini HIC GORMEZ',
      async (role) => {
        const rows = await ownerPool.query<{ usage: boolean; create: boolean }>(
          `SELECT has_schema_privilege($1, 'inventory', 'USAGE')  AS usage,
                  has_schema_privilege($1, 'inventory', 'CREATE') AS create`,
          [role],
        );

        expect(rows.rows[0]).toEqual({ usage: false, create: false });
      },
    );

    it.each([RLS_READER_ROLE, OUTBOX_RELAY_ROLE, REPORT_WORKER_ROLE])(
      '%s dar rolunun inventory tablolari uzerinde HICBIR grant i yok',
      async (role) => {
        const rows = await ownerPool.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM information_schema.role_table_grants
           WHERE table_schema = 'inventory' AND grantee = $1`,
          [role],
        );

        expect(rows.rows[0]?.n).toBe(0);
      },
    );
  });
});
