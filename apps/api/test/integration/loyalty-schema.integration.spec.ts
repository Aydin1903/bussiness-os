import { randomUUID } from 'node:crypto';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { APP_PASSWORD, APP_ROLE, createApplicationRole } from './support/database-roles';
import { POSTGRES_IMAGE } from './support/test-database';

/**
 * `loyalty` semasi — MT §12.6 ZORUNLU izolasyon testi (ADR-0051 Slice 1).
 *
 * ============================================================================
 * ⚠️ BU DOSYA ADR'NIN IKI ZORUNLU TESTINDEN IKISINI TASIR
 * ============================================================================
 *   ZORUNLU TEST 2 — ⚠️ **CASCADE + GRANT**: ADR §2.3 su IDDIAYI yazdi ve
 *   "bir olcum degil" diye acikca isaretledi:
 *
 *     _"`point_entries`e `DELETE` verilmezse, hesap silindiginde
 *       `ON DELETE CASCADE` calisir mi? Beklenen cevap EVET'tir: referans
 *       butunlugu tetikleyicileri BASVURULAN TABLONUN SAHIBININ yetkisiyle
 *       kosar. ⚠️ AMA BU BIR IDDIADIR."_
 *
 *   ⚠️ Bu dosya o iddiayi GERCEK BIR PostgreSQL'de sinar. Yanlis cikarsa
 *   ADR'de YAZILI cozum uygulanir (acik `DELETE FROM point_entries` + yalnizca
 *   o yol icin `GRANT DELETE`), "gecelim" DEGIL.
 *
 * Ayrica dordu birden kanitlanir ve DORDU DE birim testiyle GORULEMEZ:
 *   1. MIGRATION GERCEKTEN UYGULANDI (tablolarin VARLIGI) — CLAUDE.md'nin
 *      kalici dersi: `_journal.json`a girmeyen bir migration "applied
 *      successfully" yazar, cikis kodu 0 verir ve HICBIR SEY UYGULAMAZ.
 *   2. ⚠️ YETKI LISTESI KOPYALANMADI: `accounts`ta `UPDATE` YOK,
 *      `point_entries`te `UPDATE` ve `DELETE` YOK.
 *   3. ⚠️ TEKILLIK ham SQL'i de baglar — ADR-0047'nin TAM TERSI bir karar.
 *   4. ⚠️ RLS izolasyonu iki tenant ile.
 */

const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000fa';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-0000000000fb';
const USER_A = '018f3a2b-7c4d-7e1f-9b3c-0000000000fa';
const USER_B = '018f3a2b-7c4d-7e1f-9b3c-0000000000fb';

describe('loyalty semasi (gercek PostgreSQL)', () => {
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
       VALUES ($1, 'tenant-ly-a', 'Tenant A', 'active', $3),
              ($2, 'tenant-ly-b', 'Tenant B', 'active', $4)`,
      [TENANT_A, TENANT_B, USER_A, USER_B],
    );
  }, 180_000);

  afterAll(async () => {
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  beforeEach(async () => {
    await ownerPool.query('TRUNCATE loyalty.point_entries, loyalty.accounts CASCADE');
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

  async function insertAccount(tenantId: string, contactId = randomUUID()): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO loyalty.accounts (id, tenant_id, crm_contact_id, created_by_user_id)
         VALUES ($1, $2, $3, $4)`,
        [id, tenantId, contactId, USER_A],
      ),
    );
    return id;
  }

  async function insertEntry(
    tenantId: string,
    accountId: string,
    overrides: { direction?: string; points?: number; note?: string | null } = {},
  ): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO loyalty.point_entries
           (id, tenant_id, account_id, direction, points, note, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          tenantId,
          accountId,
          overrides.direction ?? 'earn',
          overrides.points ?? 100,
          overrides.note === undefined ? 'Alisveris puani' : overrides.note,
          USER_A,
        ],
      ),
    );
    return id;
  }

  // ==========================================================================
  // Sema ve kisitlar
  // ==========================================================================

  describe('sema ve kisitlar', () => {
    it('⚠️ IKI TABLO DA GERCEKTEN OLUSTURULDU — migration UYGULANDI', async () => {
      // ⚠️ `database.integration.spec`in geri alma listesi bunu YAKALAMAZ:
      // `DROP TABLE IF EXISTS` OLMAYAN bir tablo icin de basarilidir. Sayi
      // saymak da yetmez — `drizzle.__drizzle_migrations` sayaci da journal'a
      // baglidir ve AYNI YALANI soyler.
      const rows = await ownerPool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'loyalty' ORDER BY table_name`,
      );

      expect(rows.rows.map((row) => row.table_name)).toEqual(['accounts', 'point_entries']);
    });

    it('⚠️ `balance` KOLONU YOKTUR — bakiye TURETILIR (§4.1)', async () => {
      // Projede ON DORDUNCU kez ayni karar. Bir kolon tutulsaydi, onu
      // guncellemeyi unutan bir yol SESSIZ ve MAKUL GORUNEN yanlis bir bakiye
      // uretirdi.
      const columns = await ownerPool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'loyalty' AND table_name = 'accounts'`,
      );

      const names = columns.rows.map((row) => row.column_name);
      expect(names).not.toContain('balance');
      expect(names).not.toContain('points');
      // ⚠️ `updated_at` de YOK: guncellenmeyen bir satirin guncellenme zamani
      // da olmaz (§2.2) ve kolonu koymak OLMAYAN BIR YOLU ima ederdi.
      expect(names).not.toContain('updated_at');
    });

    it('⚠️ `crm_contact_id` NOT NULL — ama bir FK DEGIL (§6.1)', async () => {
      // ⚠️ Bu testin isi bir AYRIMI kilitlemektir: `NOT NULL` "bir id VAR"
      // garantisidir, "o musteri VAR" garantisi DEGILDIR. Cross-schema FK
      // yasaktir (Mutlak Kural 5); tek istisna `platform.tenants`.
      const nullable = await ownerPool.query<{ is_nullable: string }>(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_schema = 'loyalty' AND table_name = 'accounts'
           AND column_name = 'crm_contact_id'`,
      );
      expect(nullable.rows[0]?.is_nullable).toBe('NO');

      const fks = await ownerPool.query<{ foreign_table: string }>(
        `SELECT ccu.table_name AS foreign_table
           FROM information_schema.table_constraints tc
           JOIN information_schema.constraint_column_usage ccu
             ON ccu.constraint_name = tc.constraint_name
          WHERE tc.table_schema = 'loyalty' AND tc.constraint_type = 'FOREIGN KEY'
          ORDER BY ccu.table_name`,
      );

      // `accounts -> tenants`, `point_entries -> tenants`,
      // `point_entries -> accounts` (⚠️ BILESIK: iki kolon, iki satir doner)
      expect(fks.rows.map((row) => row.foreign_table).sort()).toEqual([
        'accounts',
        'accounts',
        'tenants',
        'tenants',
      ]);
    });

    it('⚠️ TEKILLIK ham SQL i de baglar — ADR-0047 in TAM TERSI karar (§1.2)', async () => {
      // Kampanya'da `UNIQUE(name)` REDDEDILMISTI (ayni ad her ay tekrarlanir
      // ve ikisi de GERCEKTIR). Burada ikinci bir hesap bakiyeyi IKIYE BOLER
      // ve hata SESSIZDIR — ADR-0039'un `ABC-1`/`abc-1` SKU tuzagi.
      const contactId = randomUUID();
      await insertAccount(TENANT_A, contactId);

      await expect(insertAccount(TENANT_A, contactId)).rejects.toThrow(
        /accounts_tenant_contact_unique/,
      );
    });

    it('⚠️ AYNI KISI FARKLI TENANT TA hesap acabilir — tekillik TENANT ICINDEDIR', async () => {
      const contactId = randomUUID();
      await insertAccount(TENANT_A, contactId);
      await expect(insertAccount(TENANT_B, contactId)).resolves.toBeTypeOf('string');
    });

    it('⚠️ `points > 0` ve `direction` kisitlari ham SQL i baglar (§1.4)', async () => {
      // Zod ve domain HTTP'den geleni baglar; CHECK HTTP'yi ATLAYAN her yolu.
      // ⚠️ Isaretli miktar ACIKCA reddedilir: -100 "harcama" DEGILDIR.
      const accountId = await insertAccount(TENANT_A);

      await expect(insertEntry(TENANT_A, accountId, { points: 0 })).rejects.toThrow(
        /point_entries_points_positive/,
      );
      await expect(insertEntry(TENANT_A, accountId, { points: -100 })).rejects.toThrow(
        /point_entries_points_positive/,
      );
      await expect(insertEntry(TENANT_A, accountId, { direction: 'adjustment' })).rejects.toThrow(
        /point_entries_direction_valid/,
      );
    });

    it('⚠️ BOS aciklama REDDEDILIR — "girilmedi" ile "bos girildi" AYNI SEY', async () => {
      const accountId = await insertAccount(TENANT_A);
      await expect(insertEntry(TENANT_A, accountId, { note: '   ' })).rejects.toThrow(
        /point_entries_note_not_blank/,
      );
      await expect(insertEntry(TENANT_A, accountId, { note: null })).resolves.toBeTypeOf('string');
    });

    it('⚠️ `is_correction` KOLONU YOKTUR — ADR-0039 dan bilincli sapma (§1.4)', async () => {
      // Stok'ta bayragi SISTEM koyuyordu (`recordCount`); burada her satiri bir
      // insan yaziyor ve bayrak KENDI HATASI HAKKINDAKI BEYANINA dayanirdi.
      // Duzeltme TERS YONDE BIR SATIRDIR (ADR-0041'in iskonto karari).
      const columns = await ownerPool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'loyalty' AND table_name = 'point_entries'`,
      );

      expect(columns.rows.map((row) => row.column_name)).not.toContain('is_correction');
    });
  });

  // ==========================================================================
  // ⚠️ ZORUNLU TEST 2 — YETKI LISTESI + CASCADE IDDIASI (§2.3)
  // ==========================================================================

  describe('⚠️ KATMAN 3: veritabani yetkisi (§2.3)', () => {
    it('⚠️⚠️ accounts ta UPDATE VAR — ama bir KILIT ON KOSULU olarak (OLCULDU)', async () => {
      // ==========================================================================
      // ⚠️ BU TEST DE BIR KUSUR BULDU VE TASARIMI DEGISTIRDI
      // ==========================================================================
      // ADR-0051'in yazili GRANT listesi `accounts` icin "UPDATE YOK" diyordu.
      // ⚠️ Slice 1'in HTTP testi bunun MODULU CALISMAZ HALE GETIRDIGINI olctu:
      // HER puan hareketi 500 donuyordu —
      //
      //     permission denied for table accounts
      //     ... where id = $1 limit $2 FOR UPDATE
      //
      // ⚠️ SEBEP: `SELECT ... FOR UPDATE` bir SATIR KILIDIDIR ve kilitlemek
      // TANIM GEREGI "bu satiri degistirebilirim" demektir. PostgreSQL kilitli
      // tablo icin `ACL_SELECT_FOR_UPDATE` ister ve o, kaynak kodda ACIKCA
      // `ACL_UPDATE`e esittir. Yani KILIT, `UPDATE` YETKISI OLMADAN ALINAMAZ —
      // ve bu modulde kilit, bakiyenin negatife dusmemesinin TEK dayanagidir.
      //
      // ⚠️ Koruma ZAYIFLAMADI, GUCLENDI: bir `GRANT`in yoklugu yalnizca
      // UYGULAMA ROLUNU baglar; asagidaki trigger TABLO SAHIBINI DE baglar.
      const rows = await ownerPool.query<{
        can_select: boolean;
        can_insert: boolean;
        can_update: boolean;
        can_delete: boolean;
      }>(
        `SELECT has_table_privilege($1, 'loyalty.accounts', 'SELECT') AS can_select,
                has_table_privilege($1, 'loyalty.accounts', 'INSERT') AS can_insert,
                has_table_privilege($1, 'loyalty.accounts', 'UPDATE') AS can_update,
                has_table_privilege($1, 'loyalty.accounts', 'DELETE') AS can_delete`,
        [APP_ROLE],
      );

      expect(rows.rows[0]).toEqual({
        can_select: true,
        can_insert: true,
        // ⚠️ `true` — ve bu bir GUNCELLEME YETKISI DEGIL, bir KILIT ON KOSULU.
        // Gercek guncellemeyi bir sonraki test reddettiriyor.
        can_update: true,
        can_delete: true,
      });
    });

    it('⚠️⚠️ AMA GERCEK BIR `UPDATE` TRIGGER TARAFINDAN REDDEDILIR', async () => {
      // ⚠️ BU TEST, BIR ONCEKININ ACTIGI DELIGI KAPATAN SEYI KILITLER.
      // `GRANT UPDATE` verildigi icin yetki katmani artik BOS; korumayi
      // `accounts_no_update` trigger'i tasiyor (ADR-0043'un
      // `audit_log_append_only` deseni, ikinci kez).
      const accountId = await insertAccount(TENANT_A);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('UPDATE loyalty.accounts SET crm_contact_id = $1 WHERE id = $2', [
            randomUUID(),
            accountId,
          ]),
        ),
      ).rejects.toThrow(/guncellenemez/i);
    });

    it('⚠️⚠️ TRIGGER TABLO SAHIBINI DE BAGLAR — `businessos_owner` da guncelleyemez', async () => {
      // ⚠️ ISTE BU YUZDEN KORUMA ZAYIFLAMADI GUCLENDI: bir `GRANT`in yoklugu
      // tablo sahibini HIC baglamazdi. `ownerPool` `businessos_owner`dir ve
      // migration'lari o kosturur — yine de reddediliyor.
      const accountId = await insertAccount(TENANT_A);

      await expect(
        ownerPool.query('UPDATE loyalty.accounts SET crm_contact_id = $1 WHERE id = $2', [
          randomUUID(),
          accountId,
        ]),
      ).rejects.toThrow(/guncellenemez/i);
    });

    it('⚠️ AMA SILME TRIGGER A TAKILMAZ — `audit_log`tan AYRILDIGIMIZ NOKTA', async () => {
      // `audit_log_append_only` `UPDATE OR DELETE` yakalar (denetim izi
      // silinemez). Burada silme MESRUDUR ve bir YUKUMLULUKTUR (KVKK m.7/m.11).
      const accountId = await insertAccount(TENANT_A);

      const deleted = await asTenant(TENANT_A, async (client) => {
        const result = await client.query('DELETE FROM loyalty.accounts WHERE id = $1', [
          accountId,
        ]);
        return result.rowCount;
      });

      expect(deleted).toBe(1);
    });

    it('⚠️ point_entries te UPDATE ve DELETE YOK — degistirilemezligin 3. katmani', async () => {
      const rows = await ownerPool.query<{
        can_select: boolean;
        can_insert: boolean;
        can_update: boolean;
        can_delete: boolean;
      }>(
        `SELECT has_table_privilege($1, 'loyalty.point_entries', 'SELECT') AS can_select,
                has_table_privilege($1, 'loyalty.point_entries', 'INSERT') AS can_insert,
                has_table_privilege($1, 'loyalty.point_entries', 'UPDATE') AS can_update,
                has_table_privilege($1, 'loyalty.point_entries', 'DELETE') AS can_delete`,
        [APP_ROLE],
      );

      expect(rows.rows[0]).toEqual({
        can_select: true,
        can_insert: true,
        can_update: false,
        can_delete: false,
      });
    });

    it('⚠️ BIR SATIR GUNCELLENEMEZ — bakiye SESSIZCE yeniden yazilamaz', async () => {
      const accountId = await insertAccount(TENANT_A);
      const entryId = await insertEntry(TENANT_A, accountId, { points: 500 });

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('UPDATE loyalty.point_entries SET points = 5 WHERE id = $1', [entryId]),
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it('⚠️ TEK BIR SATIR SILINEMEZ — 500 puanlik hesap 200 e dusurulemez', async () => {
      const accountId = await insertAccount(TENANT_A);
      const entryId = await insertEntry(TENANT_A, accountId, { points: 300 });

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('DELETE FROM loyalty.point_entries WHERE id = $1', [entryId]),
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it('⚠️⚠️ ADR §2.3 IN IDDIASI: `DELETE` YETKISI OLMADAN CASCADE CALISIR MI', async () => {
      // ==========================================================================
      // ⚠️ BU, SLICE'IN ZORUNLU IKINCI TESTIDIR
      // ==========================================================================
      // ADR-0051 §2.3 sunu YAZDI ve "bir olcum degil, BIR IDDIA" diye acikca
      // isaretledi:
      //
      //   "PostgreSQL'de referans butunlugu tetikleyicileri BASVURULAN TABLONUN
      //    SAHIBININ yetkisiyle kosar, yani cagiranin `DELETE` iznine BAKILMAZ
      //    — ama tablolar `FORCE RLS` oldugu icin POLITIKA YINE UYGULANIR ve
      //    `app.current_tenant_id` transaction icinde ZATEN SET EDILMISTIR."
      //
      // ⚠️ Iddia burada, `businessos_app` rolunun `point_entries` uzerinde
      // `can_delete = false` oldugu (bir onceki test) DOGRULANMIS haldeyken
      // sinaniyor.
      const accountId = await insertAccount(TENANT_A);
      await insertEntry(TENANT_A, accountId, { points: 100 });
      await insertEntry(TENANT_A, accountId, { direction: 'spend', points: 40 });

      const before = await ownerPool.query<{ n: string }>(
        'SELECT count(*) AS n FROM loyalty.point_entries WHERE account_id = $1',
        [accountId],
      );
      expect(Number(before.rows[0]?.n)).toBe(2);

      // ⚠️ UYGULAMANIN YAPTIGI SEY: yalnizca `accounts`tan siler. Acik bir
      // `DELETE FROM point_entries` YOKTUR.
      const deleted = await asTenant(TENANT_A, async (client) => {
        const result = await client.query('DELETE FROM loyalty.accounts WHERE id = $1', [
          accountId,
        ]);
        return result.rowCount;
      });
      expect(deleted).toBe(1);

      // ⚠️ KANIT: defter satirlari GERCEKTEN gitti mi? `ownerPool` ile
      // (RLS'siz, tenant filtresi olmadan) sayiliyor — uygulama rolunun
      // goremedigi bir kalinti da yakalansin diye.
      const after = await ownerPool.query<{ n: string }>(
        'SELECT count(*) AS n FROM loyalty.point_entries WHERE account_id = $1',
        [accountId],
      );
      expect(Number(after.rows[0]?.n)).toBe(0);
    });
  });

  // ==========================================================================
  // RLS — MT §12.6
  // ==========================================================================

  describe('RLS izolasyonu', () => {
    it('bir tenant digerinin hesaplarini GOREMEZ', async () => {
      await insertAccount(TENANT_A);
      await insertAccount(TENANT_B);

      const seen = await asTenant(TENANT_A, (client) =>
        client.query<{ n: string }>('SELECT count(*) AS n FROM loyalty.accounts'),
      );

      expect(Number(seen.rows[0]?.n)).toBe(1);
    });

    it('⚠️⚠️ BASKA TENANT IN hesabina hareket YAZILAMAZ — BILESIK FK (OLCULDU)', async () => {
      // ==========================================================================
      // ⚠️ BU TEST BIR KUSUR BULDU VE TASARIMI DEGISTIRDI
      // ==========================================================================
      // ILK TASARIM duz bir `account_id -> accounts (id)` FK'siydi ve bu test
      // KIRMIZI YANDI: tenant A, tenant B'nin hesabina isaret eden bir defter
      // satiri YAZABILIYORDU.
      //
      // ⚠️ SEBEP: PostgreSQL'de referans butunlugu denetimi RLS'i ATLAR (RI
      // sorgusu satir guvenligi DEVRE DISI kosar). Yani FK, cagiranin GOREMEDIGI
      // bir satiri BULUR ve kabul eder. RLS'in `WITH CHECK`i yalnizca satirin
      // KENDI `tenant_id`sini baglar — ISARET ETTIGI SATIRI DEGIL.
      //
      // ⚠️ Uygulama katmani bundan ETKILENMIYORDU (`lockAccountById` RLS'e
      // tabidir ve gorunmeyen hesap icin 404 doner) — yani kusur HTTP'den
      // ERISILEBILIR DEGILDI. Yine de kapatildi: bu projede savunma
      // KATMANLIDIR ve bir gun ikinci bir yazma yolu eklenirse tek koruma
      // "hatirlamak" olurdu.
      //
      // Cozum ADR-0034'un `finance.transactions` bilesik FK deseninin
      // AYNISIDIR: `tenant_id` bilesigin parcasi olur.
      const accountB = await insertAccount(TENANT_B);

      await expect(insertEntry(TENANT_A, accountB)).rejects.toThrow(
        /point_entries_tenant_account_fkey/,
      );
    });

    it('⚠️ BILESIK FK NIN ON KOSULU KORUNUYOR — `accounts_tenant_id_unique`', async () => {
      // ⚠️ `id` zaten birincil anahtar oldugu icin bu kisit GEREKSIZ GORUNUR ve
      // bir gun "temizlik" diye silinebilir. Silinirse migration
      // "there is no unique constraint matching given keys" ile PATLAR —
      // ADR-0034'un `categories_id_direction_unique` kisitinin ayni durumu.
      const rows = await ownerPool.query<{ constraint_name: string }>(
        `SELECT constraint_name FROM information_schema.table_constraints
          WHERE table_schema = 'loyalty' AND table_name = 'accounts'
            AND constraint_type = 'UNIQUE'
          ORDER BY constraint_name`,
      );

      expect(rows.rows.map((row) => row.constraint_name)).toEqual([
        'accounts_tenant_contact_unique',
        'accounts_tenant_id_unique',
      ]);
    });

    it('⚠️ BAKIYE TENANT ICINDE TURETILIR — eksik filtre YANLIS BIR SAYI uretirdi', async () => {
      const accountA = await insertAccount(TENANT_A);
      await insertEntry(TENANT_A, accountA, { points: 250 });
      const accountB = await insertAccount(TENANT_B);
      await insertEntry(TENANT_B, accountB, { points: 999 });

      const balance = await asTenant(TENANT_A, (client) =>
        client.query<{ balance: string }>(
          `SELECT COALESCE(SUM(CASE WHEN direction = 'earn' THEN points ELSE -points END), 0) AS balance
             FROM loyalty.point_entries`,
        ),
      );

      // ⚠️ 250, 1249 DEGIL. Bu modulde eksik bir tenant filtresi "eksik liste"
      // degil YANLIS BIR SAYI uretirdi.
      expect(Number(balance.rows[0]?.balance)).toBe(250);
    });
  });
});
