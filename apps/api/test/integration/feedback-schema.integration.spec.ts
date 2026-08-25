import { randomUUID } from 'node:crypto';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { APP_ROLE, APP_PASSWORD, createApplicationRole } from './support/database-roles';
import { POSTGRES_IMAGE } from './support/test-database';

/**
 * `feedback` semasi — MT §12.6 ZORUNLU izolasyon testi (ADR-0045 Slice 1).
 *
 * ============================================================================
 * ⚠️ BU DOSYA DORT SEYIN KANITIDIR VE DORDU DE BIRIM TESTIYLE GORULEMEZ
 * ============================================================================
 *   1. MIGRATION GERCEKTEN UYGULANDI (tablonun VARLIGI) — CLAUDE.md'nin kalici
 *      dersi: `_journal.json`a girmeyen bir migration "applied successfully"
 *      yazar, cikis kodu 0 verir ve HICBIR SEY UYGULAMAZ.
 *   2. ⚠️ DEGISTIRILEMEZLIGIN UCUNCU KATMANI: `UPDATE ... SET rating`
 *      VERITABANI SEVIYESINDE reddedilir, ama `SET embedding` CALISIR. Kolon
 *      bazli yetki yalnizca gercek bir PostgreSQL'de gosterilebilir.
 *   3. ⚠️ SILME CALISIR — ve bu, `0033`/`0034`ten AYRILDIGIMIZ NOKTA. Gerekce
 *      KVKK'dir (§2.2): silme yolu olmayan bir tablo veri sahibinin silme
 *      talebini KARSILAYAMAZ.
 *   4. ⚠️ OLCEK KISITI (`rating BETWEEN 1 AND 5`) UYGULAMAYI ATLAYAN yollari da
 *      baglar — Zod ve domain HTTP'yi baglar, CHECK ham SQL'i.
 */

const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000f1';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-0000000000f2';
const USER_A = '018f3a2b-7c4d-7e1f-9b3c-0000000000f1';
const USER_B = '018f3a2b-7c4d-7e1f-9b3c-0000000000f2';

/** `EMBEDDING_DIMENSIONS` uzunlugunda gecerli bir vektor literali. */
const VECTOR = `[${Array.from({ length: 1536 }, () => '0.1').join(',')}]`;

describe('feedback semasi (gercek PostgreSQL)', () => {
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
       VALUES ($1, 'tenant-fb-a', 'Tenant A', 'active', $3),
              ($2, 'tenant-fb-b', 'Tenant B', 'active', $4)`,
      [TENANT_A, TENANT_B, USER_A, USER_B],
    );
  }, 180_000);

  afterAll(async () => {
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  beforeEach(async () => {
    await ownerPool.query('TRUNCATE feedback.responses CASCADE');
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

  async function insertResponse(
    tenantId: string,
    overrides: { rating?: number; comment?: string | null; channel?: string | null } = {},
  ): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO feedback.responses
           (id, tenant_id, rating, comment, channel, received_at, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, now(), $6)`,
        [
          id,
          tenantId,
          overrides.rating ?? 2,
          overrides.comment === undefined ? 'siparisim iki hafta gecikti' : overrides.comment,
          overrides.channel === undefined ? 'Google' : overrides.channel,
          USER_A,
        ],
      ),
    );
    return id;
  }

  async function countIn(tenantId: string): Promise<number> {
    const rows = await asTenant(tenantId, (client) =>
      client.query<{ n: string }>('SELECT count(*) AS n FROM feedback.responses'),
    );
    return Number(rows.rows[0]?.n ?? '0');
  }

  // ==========================================================================
  // Sema ve kisitlar
  // ==========================================================================

  describe('sema ve kisitlar', () => {
    it('⚠️ TABLO GERCEKTEN OLUSTURULDU — migration UYGULANDI', async () => {
      // ⚠️ CLAUDE.md'nin kalici dersi: `_journal.json`a girmeyen bir migration
      // "applied successfully" yazar, cikis kodu 0 verir ve HICBIR SEY
      // UYGULAMAZ. `database.integration.spec`in geri alma listesi bunu
      // YAKALAMAZ — `DROP TABLE IF EXISTS` olmayan tablo icin de basarilidir.
      //
      // Sayi saymak da yetmez: `drizzle.__drizzle_migrations` sayaci da
      // journal'a baglidir ve AYNI YALANI soyler.
      const rows = await ownerPool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'feedback' ORDER BY table_name`,
      );

      expect(rows.rows.map((row) => row.table_name)).toEqual(['responses']);
    });

    it('⚠️ CHUNK TABLOSU YOKTUR — vektor AYNI SATIRDA (§1.2)', async () => {
      // Kural (ADR-0035 §3 + ADR-0037 §3): chunk tablosu, metnin ust sinirini
      // KULLANICI degil VERININ KENDISI belirliyorsa acilir. Yorumun ust
      // sinirini BIZ koyariz (`TARGET_CHUNK_CHARS`).
      const columns = await ownerPool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'feedback' AND table_name = 'responses'`,
      );

      expect(columns.rows.map((row) => row.column_name)).toContain('embedding');
    });

    it('⚠️ `updated_at` KOLONU YOKTUR — kayit GUNCELLENMEZ (§2)', async () => {
      // Guncellenmeyen bir satirin guncellenme zamani olmaz. Kolonu koymak,
      // ileride birinin "demek ki guncellenebiliyor" diye okuyacagi SESSIZ BIR
      // DAVET olurdu.
      const columns = await ownerPool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'feedback' AND table_name = 'responses'`,
      );

      expect(columns.rows.map((row) => row.column_name)).not.toContain('updated_at');
    });

    it('⚠️ `crm_contact_id` bir FK DEGILDIR — cross-schema FK yasak (§6.1)', async () => {
      // Mutlak Kural 5. Tek istisna `platform.tenants`tir; bu tablonun TEK
      // yabanci anahtari odur.
      const rows = await ownerPool.query<{ constraint_name: string; foreign_table: string }>(
        `SELECT tc.constraint_name, ccu.table_name AS foreign_table
           FROM information_schema.table_constraints tc
           JOIN information_schema.constraint_column_usage ccu
             ON ccu.constraint_name = tc.constraint_name
          WHERE tc.table_schema = 'feedback' AND tc.constraint_type = 'FOREIGN KEY'`,
      );

      expect(rows.rows.map((row) => row.foreign_table)).toEqual(['tenants']);
    });

    it('⚠️ OLCEK KISITI ham SQL i de baglar — 0 ve 6 REDDEDILIR (§1.3)', async () => {
      // Zod ve domain HTTP'den geleni baglar; CHECK HTTP'yi ATLAYAN her yolu.
      await expect(insertResponse(TENANT_A, { rating: 0 })).rejects.toThrow(
        /feedback_responses_rating_range/,
      );
      await expect(insertResponse(TENANT_A, { rating: 6 })).rejects.toThrow(
        /feedback_responses_rating_range/,
      );
    });

    it('1 ve 5 SINIR degerleri kabul edilir', async () => {
      await expect(insertResponse(TENANT_A, { rating: 1 })).resolves.toBeTypeOf('string');
      await expect(insertResponse(TENANT_A, { rating: 5 })).resolves.toBeTypeOf('string');
    });

    it('⚠️ BOS yorum/kanal REDDEDILIR — "girilmedi" ile "bos girildi" AYNI SEY', async () => {
      await expect(insertResponse(TENANT_A, { comment: '   ' })).rejects.toThrow(
        /comment_not_blank/,
      );
      await expect(insertResponse(TENANT_A, { channel: '' })).rejects.toThrow(/channel_not_blank/);
    });

    it('yorumsuz ve kanalsiz kayit GECERLIDIR (§1.4)', async () => {
      await expect(insertResponse(TENANT_A, { comment: null, channel: null })).resolves.toBeTypeOf(
        'string',
      );
    });
  });

  // ==========================================================================
  // ⚠️ DEGISTIRILEMEZLIGIN UCUNCU KATMANI — VERITABANI (§2.3)
  // ==========================================================================

  describe('⚠️ KATMAN 3: degistirilemez ama SILINEBILIR (§2)', () => {
    it('⚠️ PUAN degistirilemez — `UPDATE ... SET rating` YETKIYLE reddedilir', async () => {
      // ADR-0045 §2: kayit BIZIM SOZUMUZ DEGIL, bir UCUNCU KISININ beyanidir.
      // Ilk iki katman UYGULAMA seviyesindeydi (izin yok + metot yok); bu satir
      // korumayi VERITABANINA indirir.
      const id = await insertResponse(TENANT_A);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('UPDATE feedback.responses SET rating = 5 WHERE id = $1', [id]),
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it('⚠️ YORUM degistirilemez — musterinin sozu YENIDEN YAZILAMAZ', async () => {
      const id = await insertResponse(TENANT_A);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query("UPDATE feedback.responses SET comment = 'guzeldi' WHERE id = $1", [id]),
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it('⚠️ AMA `embedding` YAZILABILIR — reindex yolu KIRILMADI (kolon seviyesi yetki)', async () => {
      // ⚠️ BU TESTIN ISI BIR YETENEGI KORUMAKTIR. Duz bir `REVOKE UPDATE`
      // `setResponseEmbedding`i — yani hem olusturma sonrasi vektor yazimini
      // hem `POST /feedback/reindex`i — SESSIZCE kirardi: kayitlar vektorsuz
      // kalir, arama bulmaz, kullanici nedenini ogrenemezdi.
      //
      // ⚠️ Tuzak ONCEDEN COZULMUS olarak geldi: ADR-0043 Slice 1c bunu
      // `suppliers.interactions`ta SONRADAN kesfetmisti.
      const id = await insertResponse(TENANT_A);

      const updated = await asTenant(TENANT_A, async (client) => {
        const result = await client.query(
          'UPDATE feedback.responses SET embedding = $1::vector WHERE id = $2 RETURNING id',
          [VECTOR, id],
        );
        return result.rowCount;
      });

      expect(updated).toBe(1);
    });

    it('⚠️ `embedding` ile ICERIK BIRLIKTE yazilamaz', async () => {
      // Kolon seviyesi yetkinin en ince ayrimi: tek deyimde iki kolona yazmak
      // TAMAMEN reddedilir. Aksi halde vektor yazimi, icerik degistirmenin
      // ARKA KAPISI olurdu.
      const id = await insertResponse(TENANT_A);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            'UPDATE feedback.responses SET embedding = $1::vector, rating = 5 WHERE id = $2',
            [VECTOR, id],
          ),
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it('⚠️ SILME CALISIR — ve bu `0033`/`0034`ten AYRILDIGIMIZ NOKTA (§2.2)', async () => {
      // `inventory.movements` ve `suppliers.interactions` `DELETE` yetkisini
      // KAYBETMISTI. Burada BILEREK duruyor: bir yorum KISISEL VERI ICEREBILIR
      // ve veri sahibinin SILME TALEBI HAKKI vardir (KVKK m.7 / m.11). Silme
      // yolu olmayan bir tablo o talebi KARSILAYAMAZDI.
      const id = await insertResponse(TENANT_A);

      const deleted = await asTenant(TENANT_A, async (client) => {
        const result = await client.query('DELETE FROM feedback.responses WHERE id = $1', [id]);
        return result.rowCount;
      });

      expect(deleted).toBe(1);
      expect(await countIn(TENANT_A)).toBe(0);
    });

    it('⚠️ SILINEN KAYITLA BIRLIKTE VEKTOR DE GIDER — ikinci temizlik yolu GEREKMEZ', async () => {
      // `embedding` satirin KENDI kolonunda yasar (§1.2), yani silinen bir geri
      // bildirim AI'IN HAFIZASINDAN DA silinir. Chunk tablosu baska bir semada
      // olsaydi bu cascade YAZILAMAZDI (ADR-0031 §7'nin ayni gerekcesi).
      const id = await insertResponse(TENANT_A);
      await asTenant(TENANT_A, (client) =>
        client.query('UPDATE feedback.responses SET embedding = $1::vector WHERE id = $2', [
          VECTOR,
          id,
        ]),
      );

      await asTenant(TENANT_A, (client) =>
        client.query('DELETE FROM feedback.responses WHERE id = $1', [id]),
      );

      const left = await asTenant(TENANT_A, (client) =>
        client.query<{ n: string }>(
          'SELECT count(*) AS n FROM feedback.responses WHERE embedding IS NOT NULL',
        ),
      );

      expect(left.rows[0]?.n).toBe('0');
    });

    it('⚠️ uygulama rolu: SELECT + INSERT + DELETE, `UPDATE` YALNIZCA `embedding`', async () => {
      const table = await ownerPool.query<{ privs: string }>(
        `SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
           FROM information_schema.role_table_grants
          WHERE table_schema = 'feedback' AND table_name = 'responses' AND grantee = $1`,
        [APP_ROLE],
      );

      const columns = await ownerPool.query<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.column_privileges
          WHERE table_schema = 'feedback' AND table_name = 'responses'
            AND grantee = $1 AND privilege_type = 'UPDATE'
          ORDER BY column_name`,
        [APP_ROLE],
      );

      // ⚠️ `UPDATE` TABLO SEVIYESINDE YOK — yalnizca kolon seviyesinde.
      expect(table.rows[0]?.privs).toBe('DELETE,INSERT,SELECT');
      expect(columns.rows.map((row) => row.column_name)).toEqual(['embedding']);
    });
  });

  // ==========================================================================
  // RLS — MT §12.6
  // ==========================================================================

  describe('RLS izolasyonu', () => {
    it('RLS + FORCE etkin', async () => {
      const rows = await ownerPool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        `SELECT c.relrowsecurity, c.relforcerowsecurity
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'feedback' AND c.relname = 'responses'`,
      );

      expect(rows.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    });

    it('bir tenant DIGERININ kaydini GORMEZ', async () => {
      await insertResponse(TENANT_B);

      expect(await countIn(TENANT_A)).toBe(0);
      expect(await countIn(TENANT_B)).toBe(1);
    });

    it('BASKA tenant adina yazmak WITH CHECK ile reddedilir', async () => {
      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO feedback.responses
               (id, tenant_id, rating, comment, received_at, created_by_user_id)
             VALUES ($1, $2, 3, 'sizinti denemesi', now(), $3)`,
            [randomUUID(), TENANT_B, USER_A],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('⚠️ bir tenant DIGERININ kaydini SILEMEZ — RLS silmeyi de daraltir', async () => {
      // `DELETE` yetkisi VAR (§2.2) ama RLS onu KENDI satirlariyla sinirlar.
      const id = await insertResponse(TENANT_B);

      const deleted = await asTenant(TENANT_A, async (client) => {
        const result = await client.query('DELETE FROM feedback.responses WHERE id = $1', [id]);
        return result.rowCount;
      });

      expect(deleted).toBe(0);
      expect(await countIn(TENANT_B)).toBe(1);
    });

    it('⚠️ TENANT CONTEXT YOKKEN sorgu SESSIZCE BOS DONMEZ, HATA VERIR', async () => {
      // MT §12.6 madde 4 — `missing_ok` kullanilmamasinin kaniti.
      const client = await appPool.connect();
      try {
        await expect(client.query('SELECT * FROM feedback.responses')).rejects.toThrow(
          /unrecognized configuration parameter|invalid input syntax/i,
        );
      } finally {
        client.release();
      }
    });
  });

  // ==========================================================================
  // ⚠️ `reindex` is listesinin IKI YUKLEMI
  // ==========================================================================

  describe('⚠️ onarim is listesi — IKI YUKLEM SART', () => {
    it('⚠️ YORUMSUZ kayit is listesine GIRMEZ — sonsuz kilitlenmeyi onler', async () => {
      // `embedding IS NULL` TEK BASINA, yorumsuz kayitlari da secerdi: onlar
      // KALICI OLARAK vektorsuzdur (gomulecek metin yok). Sonucu bir SESSIZ
      // KILITLENME olurdu — onarim her cagrida ayni satirlari secer,
      // `repaired: 0` doner ve gercekten onarilmasi gerekenlere HIC SIRA
      // GELMEZDI.
      await insertResponse(TENANT_A, { comment: null });
      const withComment = await insertResponse(TENANT_A, { comment: 'gec geldi' });

      const rows = await asTenant(TENANT_A, (client) =>
        client.query<{ id: string }>(
          `SELECT id FROM feedback.responses
            WHERE embedding IS NULL AND comment IS NOT NULL`,
        ),
      );

      expect(rows.rows.map((row) => row.id)).toEqual([withComment]);
    });

    it('vektoru yazilan kayit is listesinden DUSER', async () => {
      const id = await insertResponse(TENANT_A, { comment: 'gec geldi' });
      await asTenant(TENANT_A, (client) =>
        client.query('UPDATE feedback.responses SET embedding = $1::vector WHERE id = $2', [
          VECTOR,
          id,
        ]),
      );

      const rows = await asTenant(TENANT_A, (client) =>
        client.query<{ id: string }>(
          `SELECT id FROM feedback.responses
            WHERE embedding IS NULL AND comment IS NOT NULL`,
        ),
      );

      expect(rows.rows).toHaveLength(0);
    });
  });
});
