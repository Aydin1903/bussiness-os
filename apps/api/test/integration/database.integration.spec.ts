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
      // ⚠️ `audit_log` — ADR-0043 §6 / migration `0032`. Bu satir, migration'in
      // GERCEKTEN uygulandiginin kanitidir: `_journal.json`a girmeyen bir
      // migration "applied successfully" yazar, cikis kodu 0 verir ve HICBIR
      // SEY UYGULAMAZ (CLAUDE.md kalici dersi). Geri alma listesi bunu
      // yakalamaz — `DROP TABLE IF EXISTS` olmayan tablo icin de basarilidir.
      'audit_log',
      'conversations',
      'credentials',
      'email_verification_codes',
      // ⚠️ 0040 (ADR-0053 §2). Bu liste ALFABETIKTIR ve TAM ESITLIKLE
      // karsilastirilir: yeni bir platform tablosu eklenip buraya
      // yazilmazsa test KIRMIZI yanar — migration'in gercekten uygulandigini
      // iddia eden kanit adiminin ta kendisi (CLAUDE.md kalici dersi).
      'federated_identities',
      'identity_outbox',
      'login_attempts',
      'memberships',
      'messages',
      // ⚠️ 0041 (ADR-0053 EK-1.4). Liste ALFABETIKTIR ve TAM ESITLIKLE
      // karsilastirilir — yeni bir platform tablosu buraya yazilmazsa test
      // KIRMIZI yanar.
      'one_tap_attempts',
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
      // ⚠️ 0041, `platform.one_tap_attempts` (ADR-0053 EK-1.4).
      //
      // ⚠️ `0040`TAN DA DAHA BASIT: o tablonun `platform.users`a giden bir
      // FK'si vardi; bunun HICBIR referansi yoktur — ne verir ne alir. Down
      // dosyasi tek satirdir ve sira acisindan nereye konsa calisirdi;
      // konvansiyon geregi yine EN YENI ONCE.
      //
      // ⚠️ BU SATIR MIGRATION ILE AYNI COMMIT'TE EKLENDI (`0019`un dersi).
      '0041_one_tap_attempts.down.sql',
      // ⚠️ 0040, `platform.federated_identities` (ADR-0053 §2).
      //
      // ⚠️ TEK KADEMELI ve `0039`dan ayrildigi nokta budur: orada sema ici
      // GERCEK bir FK vardi (`point_entries -> accounts`) ve cocuk once
      // dusmeliydi; burada tek FK `platform.users`a gider ve o tablo bu
      // migration'in disindadir.
      //
      // ⚠️ AYRICA `0033`/`0034`TEN DE AYRILIR: onlar MEVCUT tablolarin
      // yetkisini daraltmisti, yani down dosyalari yetkiyi geri vermek
      // zorundaydi. Burada yetkiler tabloya baglidir (`pg_class` ACL) ve
      // `DROP TABLE` ile birlikte giderler.
      //
      // ⚠️ BU SATIR MIGRATION ILE AYNI COMMIT'TE EKLENDI (`0019`un dersi).
      '0040_federated_identities.down.sql',
      // ⚠️ 0039, `loyalty` semasi + IKI tablo (ADR-0051 §1, Slice 1).
      // ⚠️ Down dosyasi IKI KADEMELIDIR ve `0038`den ayrildigi nokta budur:
      // Kampanya tek tabloydu ve sema ici FK tasimiyordu; burada
      // `point_entries -> accounts` GERCEK BIR FK'dir (ayni sema) ve COCUK
      // ONCE dusmelidir. `CASCADE` bilerek yazilmadi — sira yanlissa
      // PATLAMASI gerekir.
      '0039_loyalty_schema.down.sql',
      // ⚠️ 0038, `marketing` semasi + TEK tablo (ADR-0047 §1, Slice 1).
      // Down dosyasi TEK KADEMEDIR: sema ici FK yok, trigger yok. `0037`den
      // ayrildigi tek nokta, geri alinacak KOLON BAZLI BIR YETKININ DE
      // OLMAMASIDIR — bu modulde satir tam duzenlenebilir (ADR-0047 §2).
      '0038_marketing_schema.down.sql',
      // 0037, `feedback` semasi + TEK tablo (ADR-0045 §1, Slice 1). ⚠️ Down
      // dosyasi TEK KADEMELI: bu semada sema ici FK YOKTUR (`crm_contact_id`
      // bir FK DEGILDIR — cross-schema FK yasak), yani `0035`in iki kademeli
      // sirasi burada GEREKMIYOR. Trigger/fonksiyon da yok, `DROP SCHEMA`
      // CASCADE'siz yeter (`0031`in dersi burada tetiklenmiyor).
      //
      // ⚠️ BU SATIR MIGRATION ILE AYNI COMMIT'TE EKLENDI (`0019`un dersi).
      '0037_feedback_schema.down.sql',
      // 0036, IK v2 (ADR-0044): `hr.leave_requests` + BES kolon + tekillik
      // kisitinin KALDIRILMASI. ⚠️ Geri alma sirasi TERSTIR ve son adim
      // (tekillik kisitini geri koymak) GERCEK VERIYLE CELISEBILIR: ileri
      // yonde ayni yururluk tarihine bir DUZELTME yazilmis olabilir. Testte
      // veri yoktur, yani gecer; uretimde patlamasi DOGRUDUR (down dosyasinin
      // kendi uyarisi).
      //
      // ⚠️ BU SATIR MIGRATION ILE AYNI COMMIT'TE EKLENDI (`0019`un dersi).
      '0036_hr_v2_leave_and_employee_details.down.sql',
      // 0035, `hr` semasi + IKI tablo (ADR-0043 §1, Slice 2). ⚠️ Down dosyasi
      // KENDI ICINDE IKI KADEMELI: `compensation_records` ONCE duser cunku
      // `employees`e `ON DELETE RESTRICT` ile baglidir — ebeveyni once
      // dusurmek FK ihlali verirdi (`0029`un dersi, tek migration icinde).
      //
      // ⚠️ Trigger/fonksiyon YOK, yani `DROP SCHEMA` CASCADE'siz yeter
      // (`0031`in dersi burada tetiklenmiyor).
      //
      // ⚠️ BU SATIR MIGRATION ILE AYNI COMMIT'TE EKLENDI (`0019`un dersi).
      '0035_hr_schema.down.sql',
      // 0034 ve 0033 — YETKI migration'lari (ADR-0043 Slice 1'in denetiminden
      // dogdu). ⚠️ Ikisi de YENI TABLO ACMAZ: mevcut tablolarin `businessos_app`
      // yetkisini daraltir (savunma derinligi, ADR-0039 §3.3'e DORDUNCU katman).
      //
      // ⚠️ Bu yuzden geri almalari da bir tablo DUSURMEZ, yetkiyi geri VERIR —
      // ve bu, listedeki diger her satirdan farkli bir sekildir. Sirasi yine de
      // en yeniden eskiye: yetki islemleri birbirinden bagimsiz oldugu icin
      // teknik bir zorunluluk degil, KONVANSIYON geregi.
      //
      // ⚠️ BU IKI SATIR MIGRATION ILE AYNI COMMIT'TE EKLENDI (`0019`un dersi).
      '0034_suppliers_interactions_revoke.down.sql',
      '0033_inventory_movements_revoke.down.sql',
      // 0032, `platform.audit_log` + BIR TRIGGER + BIR FONKSIYON (ADR-0043 §6).
      // ⚠️ YENI SEMA YOK — tablo mevcut `platform` semasina eklendi, yani
      // `DROP SCHEMA` diye bir adim YOKTUR ve olmamalidir (`platform`
      // semasini dusurmek butun sistemi gotururdu).
      //
      // ⚠️ `DROP TABLE` trigger'i goturur ama FONKSIYONU GOTURMEZ — `0031`in
      // dersi burada TEK MIGRATION ICINDE gecerli; ikisi de acikca dusuruluyor
      // ve fonksiyon TABLODAN SONRA (bagimlilik yonu).
      //
      // ⚠️ BU SATIR MIGRATION ILE AYNI COMMIT'TE EKLENDI (`0019`un dersi).
      '0032_platform_audit_log.down.sql',
      // 0031, `invoicing` semasi + UC tablo + BIR TRIGGER + BIR FONKSIYON.
      // ⚠️ Down dosyasi yalnizca tablolari dusurmuyor: `DROP TABLE` bir plpgsql
      // fonksiyonunu GOTURMEZ ve semada yetim bir nesne kalirdi — `DROP SCHEMA`
      // (CASCADE'siz) o durumda patlardi. Trigger tabloyla giderdi, fonksiyon
      // GITMEZDI; ikisi de acikca dusuruluyor.
      //
      // ⚠️ `sales_documents` KENDINE FK tasir (`converted_from_id`) ve bu ek bir
      // kademe GEREKTIRMEZ: `DROP TABLE` tablonun kendi ic referanslarini sorun
      // etmez. Kayit, okuyanin soruyu bir kez sorup gecmesi icin.
      //
      // ⚠️ BU SATIR MIGRATION ILE AYNI COMMIT'TE EKLENDI (`0019`un dersi).
      '0031_invoicing_schema.down.sql',
      // 0030, `suppliers` semasi + UC tablo. ⚠️ Down dosyasi KENDI ICINDE UC
      // KADEMELI: `interactions` -> `contacts` -> `suppliers`. Cocuklari once
      // dusurmek zorunludur (`interactions` HEM `contacts`a HEM `suppliers`a
      // bagli); ebeveyni once dusurmek FK ihlali verirdi. `0029` iki tabloluydu
      // ve tek kademeydi.
      //
      // ⚠️ BU SATIR MIGRATION ILE AYNI COMMIT'TE EKLENDI (`0019`un dersi).
      '0030_suppliers_schema.down.sql',
      // 0029, `inventory` semasi + IKI tablo. ⚠️ Down dosyasi KENDI ICINDE de
      // sirali: `movements` ONCE dusuyor cunku `items`e `ON DELETE RESTRICT` ile
      // bagli (ADR-0039 §3.3) — ebeveyni once dusurmek FK ihlali verirdi.
      // ADR-0037'nin `0028 -> 0027` dersi burada TEK MIGRATION ICINDE geciyor.
      //
      // ⚠️ BU SATIR MIGRATION ILE AYNI COMMIT'TE EKLENDI (`0019`un dersi).
      '0029_inventory_schema.down.sql',
      // 0028, `documents.document_chunks`. ⚠️ 0027'DEN ONCE: parca tablosu
      // `documents.documents`e FK tasir ve once ebeveyni dusurmek FK ihlali
      // verir. Bu, ADR-0037'nin IKI migration'a bolunmesinin dogrudan sonucu —
      // `0026` tek tabloluydu ve boyle bir zincir tasimiyordu.
      //
      // ⚠️ BU IKI SATIR MIGRATION ILE AYNI COMMIT'TE EKLENDI. `0019`un dersi
      // (bir migration bu listeye hic girmemisti ve test o gunden beri
      // kirmiziydi) bir kez daha uygulanmadi diye degil, UYGULANMASIN diye.
      '0028_documents_chunks.down.sql',
      // 0027, `documents` semasi ve `documents.documents`. TUM onceki modul
      // migration'larindan ONCE alinir (konvansiyon: en yeni once) ama
      // aralarinda BAGIMLILIK YOKTUR — cross-schema FK yasak (Mutlak Kural 5).
      //
      // ⚠️ Bu geri alma R2'DEKI NESNELERI SILMEZ ve SILEMEZ: nesne deposu ayri
      // bir dogruluk kaynagidir (ADR-0037 §5.3) ve bir SQL dosyasindan
      // erisilemez. Geri alma "temiz" degil YARIM olur — durustce kayitli.
      '0027_documents_schema.down.sql',
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
      // ⚠️ `audit_log` (0032) burada da sayilir: geri alma, ILERI YONUN
      // yeniden uygulanabilir kaldigini kanitlar. Tablo listesinden dusseydi
      // down dosyasinin bir seyi kalici olarak bozdugu anlasilirdi.
      'audit_log',
      'conversations',
      'credentials',
      'email_verification_codes',
      // ⚠️ 0040 — geri alma sonrasi YENIDEN uygulandiginda da burada olmali.
      'federated_identities',
      'identity_outbox',
      'login_attempts',
      'memberships',
      'messages',
      // ⚠️ 0041 — geri alma sonrasi YENIDEN uygulandiginda da burada olmali.
      'one_tap_attempts',
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
