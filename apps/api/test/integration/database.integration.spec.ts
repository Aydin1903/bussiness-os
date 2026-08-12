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
      'conversations',
      'credentials',
      'email_verification_codes',
      'identity_outbox',
      'login_attempts',
      'memberships',
      'messages',
      'outbox',
      'password_reset_codes',
      'rate_limits',
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
      // 0026, `appointments` semasi ve tek tablosu. TUM `finance`/`projects`/
      // `crm` migration'larindan ONCE alinir (konvansiyon: en yeni once) ama
      // aralarinda BAGIMLILIK YOKTUR — cross-schema FK yasak (Mutlak Kural 5)
      // ve bu modulde `*_chunks` tablosu da yok (ADR-0035 §3), yani sema ici
      // bir zincir bile tasimiyor. Dusurulecek tek nesne var.
      //
      // ⚠️ BU SATIR MIGRATION ILE AYNI COMMIT'TE EKLENDI. `0019`un dersi
      // (asagida) bir kez daha uygulanmadi diye degil, UYGULANMASIN diye.
      '0026_appointments_schema.down.sql',
      // 0025, yorumlar + parcalar. 0023'ten ONCE (sema onlari icerir); `0024`
      // ile arasinda BAGIMLILIK YOK — yorumun ebeveyni yoktur (ADR-0034 §1.1),
      // yani `transactions` ya da `categories` ile FK iliskisi tasimaz.
      '0025_finance_commentaries.down.sql',
      // 0024, `finance.transactions`. 0023'ten ONCE: `finance.categories`'e
      // BILESIK bir FK tasir ve 0023 semayi dusurmeden once bu gitmeli.
      '0024_finance_transactions.down.sql',
      // 0023, `finance` semasi ve `finance.categories`. `projects` ve `crm`'den
      // BAGIMSIZDIR (cross-schema FK yok) ama konvansiyon geregi en yeni once
      // alinir. ⚠️ Bu satir migration ile AYNI COMMIT'te eklendi — `0019`un
      // dersi (asagida) bir kez daha uygulanmadi diye degil, uygulanmasin diye.
      '0023_finance_schema.down.sql',
      // 0022, ilerleme notlari + parcalar. 0021/0020'den ONCE:
      // `projects.tasks` ve `projects.projects`'e FK tasir.
      '0022_projects_progress_notes.down.sql',
      // 0021, `projects.tasks`. 0020'den ONCE: `projects.projects`'e FK tasir
      // ve 0020 semayi dusurmeden once bu gitmeli.
      '0021_projects_tasks.down.sql',
      // 0020, `projects` semasi ve `projects.projects`. `crm`'den
      // BAGIMSIZDIR (cross-schema FK yok — ADR-0033 §2).
      '0020_projects_schema.down.sql',
      // 0019, `crm.company_summaries`. 0016'dan ONCE: `crm.companies`'e FK
      // tasir.
      //
      // ⚠️ BU SATIR GECIKMELI EKLENDI. Migration `0019` (ADR-0032, commit
      // `f564ecd`) yazildiginda bu listeye GIRMEDI ve test o gunden beri
      // kirmiziydi: geri alma `0016`'da "cannot drop table crm.companies
      // because other objects depend on it" ile patliyordu. Testin var olma
      // gerekcesi ("down dosyasi yazilmis olabilir ama calismiyor olabilir")
      // burada kendini KANITLADI — eksik olan down dosyasi degil, onu
      // CALISTIRAN satirdi.
      '0019_crm_company_summaries.down.sql',
      // 0018, gorusmeler + parcalar. 0017/0016'dan ONCE: `crm.companies` ve
      // `crm.opportunities`'e FK tasir.
      '0018_crm_interactions.down.sql',
      // 0017, `crm.opportunities`. 0016'dan ONCE: tablo `crm.companies`'e FK
      // tasir ve 0016 semayi dusurmeden once bu gitmeli.
      '0017_crm_opportunities.down.sql',
      // 0016, `crm` semasini ve iki tablosunu dusurur. EN BASTA olmali:
      // `crm.companies` -> `platform.tenants` FK'si tasir ve geri alinmazsa
      // asagida `platform.tenants` DUSURULEMEZ.
      '0016_crm_schema.down.sql',
      // 0015, konusma tablolarini `platform`'a tasir. EN BASTA olmali: geri
      // alinmazsa `platform.conversations` ayakta kalir ve asagida
      // `platform.tenants` DUSURULEMEZ (FK).
      '0015_platform_conversations.down.sql',
      // 0014, `knowledge.rate_limits`'i `platform.rate_limits` yapar. EN BASTA
      // olmali: geri alinmazsa `platform.rate_limits` ayakta kalir ve asagida
      // `platform.tenants` DUSURULEMEZ (FK). Bu testin yakaladigi ikinci
      // bagimlilik hatasi tam olarak buydu.
      '0014_platform_rate_limits.down.sql',
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
      'conversations',
      'credentials',
      'email_verification_codes',
      'identity_outbox',
      'login_attempts',
      'memberships',
      'messages',
      'outbox',
      'password_reset_codes',
      'rate_limits',
      'refresh_tokens',
      'tenants',
      'token_families',
      'users',
      'verification_code_requests',
    ]);
  });
});
