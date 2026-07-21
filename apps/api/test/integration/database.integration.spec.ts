import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Migration hattinin GERCEK PostgreSQL'e karsi calistigini kanitlar.
 *
 * DEVELOPMENT_RULES 5.3: entegrasyon testleri mock veritabani kullanmaz.
 * Bu testin asil degeri Faz 2'de ortaya cikacak: RLS politikalari yalnizca
 * gercek bir PostgreSQL'de dogrulanabilir. Faz 1'de o altyapiyi kuruyoruz.
 *
 * Container her calistirmada SIFIRDAN acilir — yani migration'lar bos bir
 * veritabaninda calisabildigini kanitlar. docker/postgres/init script'leri
 * burada CALISMAZ; bu yuzden 0000_init idempotent ve rol-bagimsiz yazildi.
 */
describe('veritabani migration hatti', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });

    await migrate(drizzle(pool), {
      migrationsFolder: 'drizzle',
      migrationsSchema: 'drizzle',
    });
  });

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  it('bos bir veritabaninda platform schema olusturur', async () => {
    const result = await pool.query(
      "SELECT 1 FROM information_schema.schemata WHERE schema_name = 'platform'",
    );

    expect(result.rowCount).toBe(1);
  });

  it('uygulanan migration i kaydeder', async () => {
    const result = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM drizzle.__drizzle_migrations',
    );

    expect(Number(result.rows[0]?.count)).toBeGreaterThan(0);
  });

  it('tenant tablolarini olusturur', async () => {
    // Faz 1'de bu test "tablo bulunmaz" diyordu. Faz 2 ile platform schema'si
    // dolmaya basladi; iddia guncellendi.
    const result = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'platform' ORDER BY table_name",
    );

    expect(result.rows.map((row) => row.table_name)).toEqual(['memberships', 'tenants']);
  });

  it('tenant cozumleme fonksiyonunu olusturur', async () => {
    const result = await pool.query(
      `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'platform' AND p.proname = 'resolve_tenant'`,
    );

    expect(result.rowCount).toBe(1);
  });

  // Migration'lar birden fazla kez calistirilabilir olmalidir: deploy sirasinda
  // ayni migration'in iki instance tarafindan tetiklenmesi olagan bir durumdur.
  it('yeniden calistirildiginda hata vermez', async () => {
    await expect(
      migrate(drizzle(pool), { migrationsFolder: 'drizzle', migrationsSchema: 'drizzle' }),
    ).resolves.toBeUndefined();
  });

  /**
   * DEVELOPMENT_RULES 6 ve 9.3 PR kontrol listesi: "Migration geri alinabilir".
   *
   * Bu testin degeri, kurali IDDIA etmek yerine KANITLAMASIDIR. Down dosyasi
   * yazilmis olabilir ama calismiyor olabilir — sirasi yanlis, bagimlilik
   * unutulmus, isim hatali. Geri alma yalnizca gercekten calistirildiginda
   * dogrulanir ve genellikle en cok ihtiyac duyuldugu anda denenir.
   *
   * Dosya sonunda durur: onceki testlerin kurdugu semayi bozdugu icin.
   */
  it('0001 migration i geri alinabilir ve yeniden uygulanabilir', async () => {
    const downSql = readFileSync(join('drizzle', '0001_tenant_tables.down.sql'), 'utf8');

    // rollback.mts ile AYNI ayirici — konvansiyon tek yerde bozulmamali.
    const statements = downSql
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    for (const statement of statements) {
      await pool.query(statement);
    }

    const afterRollback = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'platform'",
    );
    expect(afterRollback.rowCount).toBe(0);

    const functionGone = await pool.query(
      `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'platform' AND p.proname = 'resolve_tenant'`,
    );
    expect(functionGone.rowCount).toBe(0);

    // Ileri yon yeniden uygulanabilmeli: geri alma, bir daha ileri gidilemeyecek
    // bir duruma birakmamali.
    await pool.query('DELETE FROM drizzle.__drizzle_migrations WHERE hash IS NOT NULL');
    await migrate(drizzle(pool), { migrationsFolder: 'drizzle', migrationsSchema: 'drizzle' });

    const afterReapply = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'platform' ORDER BY table_name",
    );
    expect(afterReapply.rows.map((row) => row.table_name)).toEqual(['memberships', 'tenants']);
  });
});
