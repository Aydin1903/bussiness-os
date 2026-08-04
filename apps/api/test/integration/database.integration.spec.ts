import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POSTGRES_IMAGE } from './support/test-database';

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
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
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

  it('platform tablolarini olusturur', async () => {
    // Faz 1'de "tablo bulunmaz" diyordu; Faz 2 ile tenant tablolari, Faz 3 ile
    // Identity tablolari eklendi. Iddia her fazda guncellenir.
    const result = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'platform' ORDER BY table_name",
    );

    expect(result.rows.map((row) => row.table_name)).toEqual([
      'credentials',
      'email_verification_codes',
      'identity_outbox',
      'login_attempts',
      'memberships',
      'outbox',
      'password_reset_codes',
      'refresh_tokens',
      'tenants',
      'token_families',
      'users',
      'verification_code_requests',
    ]);
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
  it('tum migration lar geri alinabilir ve yeniden uygulanabilir', async () => {
    // Sira TERSTIR (en yeni once): 0003 -> 0002 -> 0001. Ileri yonun tersini
    // uygulamayan bir geri alma, bagimlilik yuzunden hata verir — bu testin
    // yakaladigi ilk sey tam olarak buydu. Identity tablolari (0003) tenant
    // tablolarina FK vermez; yine de konvansiyon geregi en yeni once alinir.
    const downFiles = [
      // 0013 de 0011'in semasinin icindedir; 0012 ile arasinda bagimlilik yok
      // ama sema dusmeden once ikisi de gitmeli.
      '0013_rate_limits.down.sql',
      // 0012, 0011'in actigi semanin icindedir (fonksiyonlar + tablo); once o
      // geri alinir, sonra sema dusurulebilir.
      '0012_daily_report_runs.down.sql',
      // 0011 `knowledge` semasini ve dort tabloyu dusurur.
      '0011_knowledge_schema.down.sql',
      // 0010 outbox'a (0002) bagimlidir: uc SECURITY DEFINER fonksiyonu ve dar
      // role verilen yetkileri kaldirir.
      '0010_outbox_relay_functions.down.sql',
      // 0009 outbox kolonlarini geri alir; 0010'un fonksiyonlari o kolonlari
      // okudugu icin ONDAN SONRA gelir.
      '0009_outbox_retry.down.sql',
      // 0008 memberships/tenants'a (0001) bagimlidir; fonksiyonu ve dar role
      // verilen yetkileri kaldirir.
      '0008_list_user_memberships.down.sql',
      '0007_password_reset_codes.down.sql',
      '0006_identity_outbox_retry.down.sql',
      '0005_verification_code_requests.down.sql',
      '0004_identity_outbox.down.sql',
      '0003_identity_tables.down.sql',
      '0002_outbox.down.sql',
      '0001_tenant_tables.down.sql',
    ];

    for (const file of downFiles) {
      const downSql = readFileSync(join('drizzle', file), 'utf8');

      // rollback.mts ile AYNI ayirici — konvansiyon tek yerde bozulmamali.
      const statements = downSql
        .split('--> statement-breakpoint')
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0);

      for (const statement of statements) {
        await pool.query(statement);
      }
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
    expect(afterReapply.rows.map((row) => row.table_name)).toEqual([
      'credentials',
      'email_verification_codes',
      'identity_outbox',
      'login_attempts',
      'memberships',
      'outbox',
      'password_reset_codes',
      'refresh_tokens',
      'tenants',
      'token_families',
      'users',
      'verification_code_requests',
    ]);
  });
});
