import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  APP_ROLE,
  OUTBOX_RELAY_ROLE,
  REPORT_WORKER_ROLE,
  RLS_READER_ROLE,
  createApplicationRole,
} from './support/database-roles';
import { POSTGRES_IMAGE } from './support/test-database';

/**
 * `platform` semasinin YETKI MATRISI — ADR-0043 Slice 1 sonrasi denetimin kaydi.
 *
 * ============================================================================
 * ⚠️ BU DOSYA NEDEN VAR: BIR YETKI SESSIZCE VERILEBILIYOR
 * ============================================================================
 * `0000_init` su satiri tasiyor ve YALNIZCA `platform` semasi icin:
 *
 *     ALTER DEFAULT PRIVILEGES FOR ROLE businessos_owner IN SCHEMA platform
 *       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO businessos_app
 *
 * Yani `platform` semasinda acilan HER YENI TABLO, migration'da tek satir
 * GRANT yazilmasa bile uygulama roluna DORT YETKIYI DE alir. Is semalarinda
 * (`crm`, `finance`, ...) boyle bir varsayilan YOKTUR — oradaki yetkiler her
 * migration'da ACIKCA yazilir, yani gorunurdur.
 *
 * ⚠️ Bu asimetri `platform.audit_log`ta gercek bir kusur uretti: MT §12.4
 * _"UPDATE/DELETE yetkisi HICBIR ROLE verilmez"_ diyor ve migration `0032`
 * yalnizca `GRANT SELECT, INSERT` yazmisti — ki bu bir NO-OP'tur (eksik olani
 * verir, FAZLA olani ALMAZ). Kural uygulanmis GORUNUYOR, gercekte
 * saglanmiyordu ve hata SESSIZDI: hicbir test kirmizi yanmaz, hicbir lint
 * uyarmaz, dokuman dogru okunurdu. Duzeltme acik bir `REVOKE`tur.
 *
 * ============================================================================
 * ⚠️ BU TESTIN ISI: MATRISI BUTUN OLARAK SABITLEMEK
 * ============================================================================
 * Tek tek tablolara bakan bir test, YENI eklenen tabloyu kacirir — kusurun
 * dogdugu yer tam olarak orasidir. Bu yuzden iddia "su tablo sunu tasiyor"
 * degil, **"matrisin TAMAMI budur"**: `platform`a yeni bir tablo eklendigi an
 * bu test kirmizi yanar ve ekleyen kisiyi _"bu tablo UPDATE/DELETE almali mi"_
 * sorusunu CEVAPLAMAYA zorlar.
 *
 * ⚠️ Yani bu dosya bir denetimin **kaydidir**: 2026-08-24'te `platform`
 * semasinin on alti tablosu tek tek sorgulandi; `audit_log` disinda
 * UPDATE/DELETE tasiyan her tablo icin o yetki GEREKLIDIR (asagida tek tek
 * gerekcelendirildi) — yani **kontrol edildi ve temiz**.
 */

/** Normal CRUD tablosu: dordu de gerekli. */
const FULL = ['DELETE', 'INSERT', 'SELECT', 'UPDATE'];

/** ⚠️ Yalnizca EKLENIR ve OKUNUR — MT §12.4. */
const APPEND_ONLY = ['INSERT', 'SELECT'];

/**
 * ⚠️ EKLENIR · OKUNUR · SILINIR — ama TABLO SEVIYESINDE GUNCELLENMEZ
 * (ADR-0053 §2.2, migration `0040`).
 *
 * `audit_log`tan FARKLIDIR ve fark onemlidir: orada hicbir sey degismez,
 * burada TEK BIR KOLON degisir (`last_login_at`) ve o yetki KOLON
 * SEVIYESINDE verilir — bu yuzden tablo seviyesi matriste `UPDATE`
 * GORUNMEZ. Kolon yetkisi ayri bir testte dogrulanir (asagida).
 */
const APPEND_AND_DELETE = ['DELETE', 'INSERT', 'SELECT'];

/**
 * `platform` semasinin TAM yetki matrisi.
 *
 * ⚠️ Her `FULL` satirinin yaninda o yetkinin NEDEN gerekli oldugu yazilidir.
 * Gerekce yazilamayan bir satir, `APPEND_ONLY` olmasi gereken bir satirdir.
 */
const EXPECTED_APP_GRANTS: readonly (readonly [string, readonly string[], string])[] = [
  // ⚠️ TEK ISTISNA — degismez denetim kaydi (ADR-0043 §6, MT §12.4).
  ['audit_log', APPEND_ONLY, 'DEGISMEZ denetim kaydi — MT §12.4 acikca yasaklar'],

  ['conversations', FULL, 'retention temizligi (ROADMAP §8.5)'],
  ['credentials', FULL, 'parola degistirme -> UPDATE'],
  ['email_verification_codes', FULL, 'deneme sayaci -> UPDATE; tuketilen kod -> DELETE'],

  // ⚠️ ADR-0053 §2.2: `provider_subject` uzerinde UPDATE bir HESAP DEVRI
  // PRIMITIFIDIR. Tablo seviyesinde UPDATE KALDIRILDI; tek mesru mutasyon
  // (`last_login_at`) KOLON SEVIYESINDE verildi. DELETE gereklidir —
  // `DELETE /me/identities/:provider` (§4.4).
  [
    'federated_identities',
    APPEND_AND_DELETE,
    'baglanti kaldirma -> DELETE; guncelleme YALNIZCA last_login_at kolonunda',
  ],
  ['identity_outbox', FULL, 'yayin damgasi + attempt_count -> UPDATE; olu mektup -> DELETE'],
  ['login_attempts', FULL, 'retention temizligi (ROADMAP §8.5)'],
  ['memberships', FULL, 'rol/durum degisikligi -> UPDATE; uyelik kaldirma -> DELETE'],
  ['messages', FULL, 'retention temizligi — EN HIZLI BUYUYEN tablo'],
  // ⚠️ ADR-0053 EK-1.4: One Tap oran siniri defteri. EKLEME-YALNIZ —
  // `federated_identities`ten FARKLI olarak kolon bazli bir istisna da YOKTUR:
  // burada mesru TEK BIR mutasyon bile yoktur. DELETE retention icin kalir.
  [
    'one_tap_attempts',
    APPEND_AND_DELETE,
    'retention temizligi -> DELETE; guncelleme HICBIR kolonda yok',
  ],
  ['outbox', FULL, 'yayin damgasi + attempt_count -> UPDATE; olu mektup -> DELETE'],
  ['password_reset_codes', FULL, 'tuketilen kod -> UPDATE/DELETE'],
  ['rate_limits', FULL, 'UPSERT -> UPDATE; retention -> DELETE (migration 0014)'],
  ['refresh_tokens', FULL, 'rotation + iptal -> UPDATE'],
  ['tenants', FULL, 'tenant yasam dongusu (status) -> UPDATE'],
  ['token_families', FULL, 'oturum sonlandirma -> UPDATE'],
  ['users', FULL, 'e-posta dogrulama, durum, profil -> UPDATE'],
  ['verification_code_requests', FULL, 'retention temizligi (ROADMAP §8.5)'],
];

/**
 * Uc dar `BYPASSRLS` rolunun TUM veritabanindaki grant listesi.
 *
 * ⚠️ Kapsam bilerek TEK BIR SEMA DEGIL, veritabaninin tamamidir: bir dar rolun
 * tek yetenegi RLS'i ASMAKTIR, yani yeni bir tabloya erisim kazandigi an o
 * tablonun tenant izolasyonu SESSIZCE delinir. Sema bazli testler (Constraint 2
 * esdegeri, her is semasinda var) yeni bir PLATFORM tablosunu kacirirdi —
 * `audit_log` tam olarak oyle bir tablodur.
 */
const EXPECTED_NARROW_GRANTS: readonly (readonly [string, string, string, readonly string[]])[] = [
  [OUTBOX_RELAY_ROLE, 'platform', 'outbox', ['SELECT', 'UPDATE']],
  [REPORT_WORKER_ROLE, 'knowledge', 'daily_report_runs', ['SELECT', 'UPDATE']],
  [RLS_READER_ROLE, 'platform', 'memberships', ['SELECT']],
  [RLS_READER_ROLE, 'platform', 'tenants', ['SELECT']],
];

interface GrantRow {
  readonly grantee: string;
  readonly table_schema: string;
  readonly table_name: string;
  readonly privs: string;
}

describe('platform semasi yetki matrisi (gercek PostgreSQL)', () => {
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

  async function grantsFor(grantee: string, schema?: string): Promise<GrantRow[]> {
    const result = await ownerPool.query<GrantRow>(
      `SELECT grantee, table_schema, table_name,
              string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
         FROM information_schema.role_table_grants
        WHERE grantee = $1
          AND ($2::text IS NULL OR table_schema = $2)
        GROUP BY grantee, table_schema, table_name
        ORDER BY table_schema, table_name`,
      [grantee, schema ?? null],
    );

    return result.rows;
  }

  // ==========================================================================
  // ⚠️ DENETIMIN KAYDI — matrisin TAMAMI
  // ==========================================================================
  it('⚠️ `businessos_app`in platform yetkileri BIREBIR beklenen matristir', async () => {
    // Yeni bir platform tablosu eklenirse bu test KIRMIZI yanar ve ekleyen
    // kisiyi "bu tablo UPDATE/DELETE almali mi" sorusunu cevaplamaya zorlar.
    // Kusurun dogdugu yer tam olarak orasiydi.
    const rows = await grantsFor(APP_ROLE, 'platform');

    expect(rows.map((row) => [row.table_name, row.privs.split(',')])).toEqual(
      EXPECTED_APP_GRANTS.map(([table, privs]) => [table, [...privs]]),
    );
  });

  it('⚠️ `platform.audit_log` YALNIZCA SELECT + INSERT tasir (MT §12.4)', async () => {
    // Ayri bir test olarak da durur: yukaridaki matris testi bir gun toplu
    // guncellenirse, bu satir tek basina hala kuralin bekcisidir.
    const rows = await grantsFor(APP_ROLE, 'platform');
    const auditLog = rows.find((row) => row.table_name === 'audit_log');

    expect(auditLog?.privs).toBe('INSERT,SELECT');
  });

  it('⚠️ TABLO SEVIYESINDE UPDATE tasimayan tablolar TAM OLARAK UCTUR', async () => {
    // 2026-08-24 denetimi: on alti tablo tek tek sorgulandi ve `audit_log`
    // disinda UPDATE/DELETE tasiyan HER tablo icin o yetki GEREKLIDIR
    // (gerekceler `EXPECTED_APP_GRANTS`ta satir satir yazili).
    // Yani sonuc: KONTROL EDILDI, TEMIZ.
    //
    // ⚠️ 2026-09-01'de IKINCI satir eklendi: `federated_identities`
    // (ADR-0053 §2.2). IKISI AYNI SEY DEGILDIR ve ayrim burada kaydedilir:
    //   `audit_log`             -> HICBIR kolon degismez (append-only).
    //   `federated_identities`  -> TEK kolon degisir (`last_login_at`) ve o
    //                              yetki KOLON SEVIYESINDEDIR, yani bu tablo
    //                              seviyesi listesinde gorunmez.
    //   `one_tap_attempts`      -> ⚠️ HICBIR kolon degismez ve kolon bazli bir
    //                              istisna da YOKTUR (2026-09-02, EK-1.4).
    //                              `audit_log`a en yakin olan budur; farki
    //                              yalnizca DELETE tasimasidir (retention).
    const rows = await grantsFor(APP_ROLE, 'platform');
    const restricted = rows.filter((row) => !row.privs.includes('UPDATE'));

    expect(restricted.map((row) => row.table_name)).toEqual([
      'audit_log',
      'federated_identities',
      'one_tap_attempts',
    ]);
  });

  /**
   * ⚠️ ADR-0053 §2.2'NIN ASIL KILIDI — KOLON SEVIYESI YETKI.
   *
   * Yukaridaki matris `federated_identities`in tablo seviyesinde UPDATE
   * tasimadigini soyler ama BU YETMEZ: kolon yetkisi yanlislikla
   * `provider_subject`e verilseydi matris DEGISMEZ ve hata SESSIZ olurdu.
   *
   * Bu test tam olarak o bosluğu kapatir: guncellenebilen kolon kumesinin
   * TAM OLARAK `{last_login_at}` oldugunu iddia eder.
   */
  it('⚠️ `federated_identities`te UPDATE edilebilen TEK kolon `last_login_at`tir', async () => {
    const result = await ownerPool.query<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.column_privileges
        WHERE grantee = $1
          AND table_schema = 'platform'
          AND table_name = 'federated_identities'
          AND privilege_type = 'UPDATE'
        ORDER BY column_name`,
      [APP_ROLE],
    );

    expect(result.rows.map((row) => row.column_name)).toEqual(['last_login_at']);
  });

  /**
   * ⚠️ `one_tap_attempts` KOLON BAZLI BIR ISTISNA DA TASIMAZ.
   *
   * `federated_identities`te tablo seviyesi UPDATE yoktu ama bir kolonda vardi;
   * burada HICBIR kolonda yoktur. Bu testin isi o ayrimi kilitlemek: biri
   * ileride "digeriyle ayni yapalim" deyip `GRANT UPDATE (...)` eklerse
   * EKLEME-YALNIZ iddiasi sessizce cozulurdu.
   */
  it('⚠️ `one_tap_attempts`te UPDATE edilebilen HICBIR kolon yoktur', async () => {
    const result = await ownerPool.query<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.column_privileges
        WHERE grantee = $1
          AND table_schema = 'platform'
          AND table_name = 'one_tap_attempts'
          AND privilege_type = 'UPDATE'`,
      [APP_ROLE],
    );

    expect(result.rows).toHaveLength(0);
  });

  // ==========================================================================
  // ⚠️ SESSIZ YETKININ KAYNAGI — mekanizmanin kendisi sabitleniyor
  // ==========================================================================
  it('⚠️ varsayilan yetki YALNIZCA `platform` semasinda vardir ve DORT yetki verir', async () => {
    // Bu test bir SORUNU degil, bir MEKANIZMAYI kilitler. Varsayilan yetki
    // kaldirilirsa ya da bir is semasina eklenirse, sessiz yetki probleminin
    // sekli degisir ve bu dosyanin gerekcesi yeniden okunmalidir.
    const result = await ownerPool.query<{ schema: string; acl: string }>(
      `SELECT n.nspname AS schema, d.defaclacl::text AS acl
         FROM pg_default_acl d
         JOIN pg_namespace n ON n.oid = d.defaclnamespace
        WHERE d.defaclobjtype = 'r'
        ORDER BY n.nspname`,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.schema).toBe('platform');
    // `arwd` = INSERT, SELECT, UPDATE, DELETE.
    expect(result.rows[0]?.acl).toContain(`${APP_ROLE}=arwd`);
  });

  // ==========================================================================
  // ⚠️ DAR ROLLER — kapsam TEK SEMA DEGIL, TUM VERITABANI
  // ==========================================================================
  it('⚠️ uc dar rolun TUM veritabanindaki grant listesi BIREBIR sabittir', async () => {
    const rows = [
      ...(await grantsFor(RLS_READER_ROLE)),
      ...(await grantsFor(OUTBOX_RELAY_ROLE)),
      ...(await grantsFor(REPORT_WORKER_ROLE)),
    ].sort((a, b) =>
      `${a.grantee}${a.table_schema}${a.table_name}`.localeCompare(
        `${b.grantee}${b.table_schema}${b.table_name}`,
      ),
    );

    expect(
      rows.map((row) => [row.grantee, row.table_schema, row.table_name, row.privs.split(',')]),
    ).toEqual(
      [...EXPECTED_NARROW_GRANTS]
        .sort((a, b) => `${a[0]}${a[1]}${a[2]}`.localeCompare(`${b[0]}${b[1]}${b[2]}`))
        .map(([grantee, schema, table, privs]) => [grantee, schema, table, [...privs]]),
    );
  });

  it.each([RLS_READER_ROLE, OUTBOX_RELAY_ROLE, REPORT_WORKER_ROLE])(
    '⚠️ %s dar rolu `platform.audit_log`a KORDUR',
    async (role) => {
      // Bir dar rolun tek yetenegi RLS'i ASMAKTIR. Denetim kaydinda bu, tum
      // tenant'larin "kim ne yapti" gecmisini gormek demektir.
      const result = await ownerPool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM information_schema.role_table_grants
          WHERE table_schema = 'platform' AND table_name = 'audit_log' AND grantee = $1`,
        [role],
      );

      expect(result.rows[0]?.n).toBe(0);
    },
  );

  it('PUBLIC uygulamanin HICBIR semasinda grant TASIMAZ', async () => {
    // ⚠️ Kapsam UYGULAMA semalaridir, veritabaninin tamami DEGIL: testcontainers
    // `docker/postgres/init/01-roles.sql`i CALISTIRMAZ, dolayisiyla oradaki
    // `REVOKE ALL ON DATABASE ... FROM PUBLIC` uygulanmaz ve PostgreSQL'in
    // `pg_catalog` / `information_schema` uzerindeki varsayilan PUBLIC
    // yetkileri yerinde kalir (~191 satir). Onlari saymak, kendi semalarimiz
    // hakkinda hicbir sey soylemeyen bir testi kirmizi yakardi.
    const result = await ownerPool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.role_table_grants
        WHERE grantee = 'PUBLIC'
          AND table_schema NOT IN ('pg_catalog', 'information_schema')`,
    );

    expect(result.rows[0]?.n).toBe(0);
  });
});
