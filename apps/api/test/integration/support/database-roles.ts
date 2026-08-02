import type { Pool } from 'pg';

/**
 * Testcontainers ile acilan veritabaninda uygulama rolunu olusturur.
 *
 * ============================================================================
 * NEDEN GEREKLI
 * ============================================================================
 * `docker/postgres/init/*.sql` script'leri YALNIZCA container ILK KEZ
 * olusturulurken calisir. Testcontainers her testte sifirdan bos bir
 * veritabani acar; orada `businessos_app` rolu YOKTUR.
 *
 * RLS'i test etmek icin bu rol SART: politikalar yalnizca TABLO SAHIBI
 * OLMAYAN bir rol icin uygulanir. Container'in varsayilan kullanicisi hem
 * superuser hem tablo sahibidir ve RLS'i tumuyle atlar — o kullaniciyla
 * yapilan bir "izolasyon testi" HER ZAMAN YESIL yanar ve HICBIR SEY KANITLAMAZ.
 *
 * ============================================================================
 * SAPMA RISKI VE KARSI ONLEMI
 * ============================================================================
 * Bu dosya `docker/postgres/init/01-roles.sql`'i birebir CALISTIRAMAZ: o
 * script sabit bir veritabani adina (`business_os`) GRANT verir, testcontainers
 * ise rastgele bir ad kullanir.
 *
 * Dolayisiyla burada bir KOPYA vardir ve kopya zamanla sapabilir. Karsi onlem:
 * izolasyon testlerindeki "uygulama rolu tablo sahibi degildir ve BYPASSRLS
 * tasimaz" testi (12.6 madde 5) bu rolun ozelliklerini DOGRUDAN dogrular.
 * Kopya saparsa o test kirmizi yanar.
 * ============================================================================
 */
export const APP_ROLE = 'businessos_app';
export const APP_PASSWORD = 'app_test_password';

/**
 * `businessos_rls_reader` — dar BYPASSRLS rolu (ADR-0028, `01-roles.sql` kopyasi).
 *
 * `0008_list_user_memberships` migration'i `list_user_memberships` fonksiyonunun
 * sahipligini bu role ATAR; dolayisiyla rol migrate'ten ONCE var olmalidir.
 * Ozellikleri (NOLOGIN + BYPASSRLS + yalnizca iki tabloya SELECT) Constraint 2
 * testiyle DOGRUDAN dogrulanir — bu kopya saparsa o test kirmizi yanar.
 */
export const RLS_READER_ROLE = 'businessos_rls_reader';

/**
 * `businessos_outbox_relay` — dar BYPASSRLS rolu (`01-roles.sql` kopyasi).
 *
 * Migration `0010_outbox_relay_functions` uc outbox fonksiyonunun sahipligini bu
 * role ATAR; dolayisiyla rol migrate'ten ONCE var olmalidir. Ozellikleri
 * (NOLOGIN + BYPASSRLS + yalnizca `platform.outbox`'a SELECT/UPDATE) Constraint
 * 2 esdegeri testiyle DOGRUDAN dogrulanir — bu kopya saparsa o test kirmizi yanar.
 */
export const OUTBOX_RELAY_ROLE = 'businessos_outbox_relay';

/**
 * Rolleri olusturur. Migration'dan ONCE cagrilmalidir: `0000_init`,
 * `0001_tenant_tables` ve `0008` roller mevcutsa onlara yetki verir.
 */
export async function createApplicationRole(pool: Pool, databaseName: string): Promise<void> {
  // NOBYPASSRLS acikca yazilir. Varsayilan zaten budur, ama bu satirin
  // varligi niyeti belgeler: bu rol RLS'e TABI OLMALIDIR.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
        CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PASSWORD}' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
      END IF;
    END
    $$;
  `);

  await pool.query(`GRANT CONNECT ON DATABASE "${databaseName}" TO ${APP_ROLE}`);

  // Dar BYPASSRLS rolu (ADR-0028). Migration 0008 sahipligi buna atar.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RLS_READER_ROLE}') THEN
        CREATE ROLE ${RLS_READER_ROLE} NOLOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
      END IF;
    END
    $$;
  `);

  // Ikinci dar BYPASSRLS rolu (12.4.2). Migration 0010 uc outbox fonksiyonunun
  // sahipligini buna atar.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${OUTBOX_RELAY_ROLE}') THEN
        CREATE ROLE ${OUTBOX_RELAY_ROLE} NOLOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
      END IF;
    END
    $$;
  `);
}
