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
 * Rolu olusturur. Migration'dan ONCE cagrilmalidir: `0000_init` ve
 * `0001_tenant_tables` rol mevcutsa ona yetki verir, yoksa o adimi atlar.
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
}
