import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';
import { RETRIEVAL_CONTRIBUTOR_REGISTRY } from '../../src/platform/context/context.public';
import { type RetrievalContributorRegistry } from '../../src/platform/context/application/retrieval-contributor.port';
import { APP_PASSWORD, APP_ROLE, createApplicationRole } from './support/database-roles';
import { setIdentityTestEnv } from './support/identity-env';
import { POSTGRES_IMAGE } from './support/test-database';

/**
 * ⚠️ MAAS IZOLASYONUNUN UC KATMANI — ADR-0043 §4.2'nin MEKANIK KANITI.
 *
 * ============================================================================
 * NEDEN AYRI BIR DOSYA
 * ============================================================================
 * Uc katman uc AYRI yerde yasiyor (sema · izin katalogu · katkici defteri) ve
 * hicbiri digerini kapsamiyor. Tek tek kendi dosyalarina dagitilsalardi, "uc
 * katman VAR MI" sorusunu TEK BIR YERDEN cevaplamak mumkun olmazdi — ve bir
 * gun biri sessizce dusse, bunu fark edecek bir okuyucu olmazdi.
 *
 * ⚠️ EN KRITIK OLANI UCUNCUSUDUR: katkici yoklugu. Bu, maasin `POST /ask`
 * yoluna sizmasi icin ONCE BIR DOSYA ACILMASINI zorunlu kilar — yani hata
 * SESSIZ OLAMAZ. Ilk iki katman veriyi korur, ucuncusu KORUMANIN KENDISINI
 * gorunur kilar.
 */
describe('IK maas izolasyonu — uc katman (gercek PostgreSQL)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    ownerPool = new Pool({ connectionString: container.getConnectionUri() });
    await createApplicationRole(ownerPool, container.getDatabase());
    await migrate(drizzle(ownerPool), { migrationsFolder: 'drizzle', migrationsSchema: 'drizzle' });
  }, 180_000);

  afterAll(async () => {
    await ownerPool.end();
    await container.stop();
  });

  // ==========================================================================
  // KATMAN 1 — AYRI TABLO
  // ==========================================================================
  describe('⚠️ KATMAN 1: maas AYRI TABLODA', () => {
    it('`hr.employees` ucret tasiyabilecek HICBIR kolon TASIMAZ', async () => {
      // ⚠️ Bu, bir `SELECT *`in ya da bir liste projeksiyonunun maasi
      // YANLISLIKLA tasimasini imkansiz kilar. Bir gun birisi
      // `ALTER TABLE hr.employees ADD COLUMN salary numeric` yazarsa, uygulama
      // kodu hic degismese bile bu test KIRMIZI yanar.
      const result = await ownerPool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'hr' AND table_name = 'employees'
          ORDER BY column_name`,
      );

      const columns = result.rows.map((row) => row.column_name);

      expect(columns).toEqual([
        'created_at',
        'created_by_user_id',
        'employment_status',
        'ended_on',
        'full_name',
        'id',
        'job_title',
        'platform_user_id',
        'started_on',
        'tenant_id',
        'updated_at',
        'work_email',
        'work_phone',
      ]);

      for (const forbidden of ['salary', 'amount', 'wage', 'compensation', 'currency']) {
        expect(columns).not.toContain(forbidden);
      }
    });

    it('⚠️ `hr.employees` SERBEST NOT ALANI da TASIMAZ (§1.1)', async () => {
      // Sekiz modulun sekizinde bir `notes`/`description` var. Burada YOK,
      // cunku bir IK kaydindaki serbest metne ILK YAZILACAK SEY SAGLIK
      // BILGISIDIR — ve §3'un siniri sessizce ihlal edilirdi.
      const result = await ownerPool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'hr' AND table_name = 'employees'`,
      );

      const columns = result.rows.map((row) => row.column_name);

      for (const forbidden of ['note', 'notes', 'description', 'comment', 'remarks']) {
        expect(columns).not.toContain(forbidden);
      }
    });

    it('⚠️ SAGLIK ve OZEL NITELIKLI veri kolonlari YOKTUR (§3.5)', async () => {
      const result = await ownerPool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'hr'`,
      );

      const columns = result.rows.map((row) => row.column_name);

      for (const forbidden of [
        'national_id',
        'tc_kimlik_no',
        'birth_date',
        'home_address',
        'personal_phone',
        'emergency_contact',
        'health_status',
        'blood_type',
        'disability',
        'religion',
      ]) {
        expect(columns).not.toContain(forbidden);
      }
    });
  });

  // ==========================================================================
  // KATMAN 3 — ⚠️ KATKICI YOKLUGU (en kritik olan)
  // ==========================================================================
  describe('⚠️ KATMAN 3: `POST /ask` havuzunda IK yok', () => {
    it('⚠️ katkici defterinde `hr` onekli HICBIR KAYNAK YOKTUR', async () => {
      // ==========================================================================
      // ⚠️ BU TEST BU SLICE'IN EN ONEMLI TESTIDIR
      // ==========================================================================
      // Iddia: maas verisi `/ask` yoluna HICBIR SEKILDE ulasamaz. Ilk iki
      // katman (ayri tablo, dar izin) VERIYI korur; bu katman KORUMANIN
      // KENDISINI korur — bir gun birisi "ekip ozeti" katkicisi eklemek
      // isterse, once BU TESTI kirmasi gerekir ve ADR-0043 §5'i okumaya
      // zorlanir.
      //
      // ⚠️ ADR-0042 tersini ONGORMUSTU ("9. modul IK bir yapisal katkici
      // eklerse T2 HEMEN atesler"). Ongoru ters yonde gerceklesti: eklenmedi.
      process.env.DATABASE_URL = `postgresql://${APP_ROLE}:${APP_PASSWORD}@${container.getHost()}:${String(container.getPort())}/${container.getDatabase()}`;
      await setIdentityTestEnv();

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

      try {
        const registry = moduleRef.get<RetrievalContributorRegistry>(
          RETRIEVAL_CONTRIBUTOR_REGISTRY,
        );
        const sources = registry.all().map((contributor) => contributor.source);

        // Defter GERCEKTEN dolu — yani test "hicbir sey kayitli degil" gibi
        // bir bos-gecerlilik uzerine kurulu DEGIL.
        expect(sources.length).toBeGreaterThanOrEqual(10);

        const hrSources = sources.filter(
          (source) => source === 'hr' || source.startsWith('hr-') || source.startsWith('hr.'),
        );

        expect(hrSources).toEqual([]);

        // Ekip/maas cagristiran hicbir etiket de olmamali.
        for (const source of sources) {
          expect(source).not.toMatch(/employee|salary|compensation|payroll|personel/i);
        }
      } finally {
        await moduleRef.close();
      }
    }, 120_000);
  });

  // ==========================================================================
  // UCRET DEFTERI — EKLEME-YALNIZ, ILK GUNDEN UC KATMAN
  // ==========================================================================
  describe('⚠️ ucret defteri DEGISTIRILEMEZ', () => {
    it('uygulama rolu `compensation_records`ta YALNIZCA SELECT + INSERT tasir', async () => {
      // ⚠️ `0033`/`0034`un iki deftere SONRADAN ekledigi dorduncu katman
      // burada ILK GUNDEN var. Ve burada digerlerinden DAHA agir bir yuku
      // vardir: bu defterin degistirilemezligi §6.2'ye gore DENETIM IZININ TA
      // KENDISIDIR.
      const result = await ownerPool.query<{ privs: string }>(
        `SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
           FROM information_schema.role_table_grants
          WHERE table_schema = 'hr' AND table_name = 'compensation_records' AND grantee = $1`,
        [APP_ROLE],
      );

      expect(result.rows[0]?.privs).toBe('INSERT,SELECT');
    });

    it('`hr.employees` TAM CRUD tasir — daraltma YALNIZCA deftere', async () => {
      // ⚠️ Unvan, is telefonu ve durum DEGISIR (§6.3) — degisikligi
      // `platform.audit_log` kaydeder. Daraltma yanlislikla genisletilirse bu
      // test yakalar.
      const result = await ownerPool.query<{ privs: string }>(
        `SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
           FROM information_schema.role_table_grants
          WHERE table_schema = 'hr' AND table_name = 'employees' AND grantee = $1`,
        [APP_ROLE],
      );

      expect(result.rows[0]?.privs).toBe('DELETE,INSERT,SELECT,UPDATE');
    });

    it('⚠️ `REVOKE` GEREKMEDI — `hr` semasinda varsayilan yetki YOK', async () => {
      // ⚠️ `platform.audit_log`ta `REVOKE` SART olmustu cunku `0000_init`
      // YALNIZCA `platform` semasi icin `ALTER DEFAULT PRIVILEGES` tanimlar.
      // Yeni bir semada verilen yetki, tam olarak YAZILAN yetkidir — bu test
      // o farki sabitler.
      const result = await ownerPool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_default_acl d
           JOIN pg_namespace n ON n.oid = d.defaclnamespace
          WHERE n.nspname = 'hr'`,
      );

      expect(result.rows[0]?.n).toBe(0);
    });
  });

  // ==========================================================================
  // SEMA — migration GERCEKTEN uygulandi
  // ==========================================================================
  describe('sema', () => {
    it('iki tablo da GERCEKTEN olusturuldu', async () => {
      // CLAUDE.md kalici dersi: `_journal.json`a girmeyen bir migration
      // "applied successfully" yazar, cikis kodu 0 verir ve HICBIR SEY
      // UYGULAMAZ. Geri alma listesi bunu YAKALAMAZ.
      const result = await ownerPool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'hr' ORDER BY table_name`,
      );

      expect(result.rows.map((row) => row.table_name)).toEqual([
        'compensation_records',
        'employees',
      ]);
    });

    it('iki tablo da RLS ENABLE + FORCE tasir (MT §12.2)', async () => {
      const result = await ownerPool.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'hr' AND c.relkind = 'r'
          ORDER BY c.relname`,
      );

      expect(result.rows).toEqual([
        { relname: 'compensation_records', relrowsecurity: true, relforcerowsecurity: true },
        { relname: 'employees', relrowsecurity: true, relforcerowsecurity: true },
      ]);
    });
  });
});
