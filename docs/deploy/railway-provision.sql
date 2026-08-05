-- =============================================================================
-- Business OS — Railway PostgreSQL provisioning
-- =============================================================================
--
-- ⚠️ BU DOSYA NEDEN VAR
--
-- `docker/postgres/init/*.sql` betikleri YALNIZCA bos bir veri dizininde,
-- `docker-entrypoint-initdb.d` sozlesmesi geregi calisir. Railway'in YONETILEN
-- PostgreSQL'i onlari HIC gormez. Yani Railway'de:
--
--   * bes rolun HICBIRI yoktur,
--   * `vector` eklentisi kurulu degildir,
--   * `platform` semasi ve default privilege'lar yoktur.
--
-- =============================================================================
-- BU ADIM ATLANIRSA NE OLUR — sessiz ve en tehlikeli hata
-- =============================================================================
-- Railway'in verdigi hazir baglanti dizesi SUPERUSER'a aittir. Uygulamayi
-- dogrudan onunla baglamak calisir gorunur — ve TENANT IZOLASYONUNU TUMUYLE
-- KAPATIR: superuser, `FORCE ROW LEVEL SECURITY` edilmis tablolarda bile
-- politikalari bypass eder.
--
-- Hicbir hata alinmaz. Testler gecer. Saglik ucu 200 doner. Ve her tenant
-- digerinin verisini gorur. ARCHITECTURE 3.3'un ve `01-roles.sql`'in var olma
-- sebebi tam olarak budur.
--
-- Bu yuzden bu betik ISTEGE BAGLI DEGILDIR.
-- =============================================================================
--
-- KULLANIM
--   1. Asagidaki iki `__DEGISTIR__` parolasini kendi urettigin degerlerle
--      degistir (NOLOGIN roller parola TASIMAZ — dogrudan baglanamazlar).
--   2. Railway → Postgres servisi → "Data" sekmesi → sorgu alanina yapistir.
--   3. En alttaki DOGRULAMA sorgularini calistir ve ciktiyi kontrol et.
--
-- Bu dosyaya GERCEK PAROLA YAZILMAZ ve commit EDILMEZ.
-- =============================================================================

-- --- 1. Eklenti ------------------------------------------------------------
-- ADR-0029: embedding `vector(1536)` + HNSW index olarak saklanir.
-- `vector` TRUSTED bir eklenti DEGILDIR; kurulumu superuser ister. Railway'in
-- `postgres` rolu superuser'dir, yani bu satir burada calisir.
--
-- HATA ALIRSAN ("could not open extension control file"): kullandigin Postgres
-- imaji pgvector TASIMIYOR demektir. Servisi silip pgvector'lu bir template ile
-- yeniden kur. `docker-compose.yml`'de `postgres:17-alpine` yerine
-- `pgvector/pgvector:pg17` secilmesinin sebebi birebir aynidir.
CREATE EXTENSION IF NOT EXISTS vector;

-- --- 2. Roller -------------------------------------------------------------
-- `docker/postgres/init/01-roles.sql` ile AYNI rol seti ve AYNI gerekceler.
-- Ayrintili aciklamalar orada; burada tekrarlanmaz, yalnizca Railway farklari
-- not edilir.

-- Migration'lari calistiran rol: DDL var, superuser YOK.
CREATE ROLE businessos_owner
  LOGIN
  PASSWORD '__DEGISTIR_OWNER_PAROLASI__'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOBYPASSRLS;

-- Uygulamanin runtime rolu: yalnizca DML, hicbir tablonun sahibi DEGIL.
-- RLS'in calisabilmesinin on kosulu budur.
CREATE ROLE businessos_app
  LOGIN
  PASSWORD '__DEGISTIR_APP_PAROLASI__'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOBYPASSRLS;

-- Uc dar RLS-asim rolu (ADR-0028 · MT §12.4.2 · ADR-0030 §2.4).
-- NOLOGIN: dogrudan baglanamazlar, hicbir baglanti dizesine girmezler.
-- Yalnizca SECURITY DEFINER fonksiyonlarin sahibi olarak "canlanirlar".
CREATE ROLE businessos_rls_reader
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;

CREATE ROLE businessos_outbox_relay
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;

CREATE ROLE businessos_report_worker
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;

-- Owner'in fonksiyon sahipligini bu rollere ATAYABILMESI icin (ALTER FUNCTION
-- OWNER TO, uyelik gerektirir; migration 0008/0010/0012).
GRANT businessos_rls_reader    TO businessos_owner;
GRANT businessos_outbox_relay  TO businessos_owner;
GRANT businessos_report_worker TO businessos_owner;

-- --- 3. Veritabani yetkileri ----------------------------------------------
-- Lokalde veritabani adi `business_os`; Railway'de `railway`. Ad'i sabit
-- yazmak yerine `current_database()` uzerinden dinamik kuruluyor ki betik
-- hangi veritabaninda calistirilirsa calistirilsin dogru olsun.
DO $$
DECLARE
  db text := quote_ident(current_database());
BEGIN
  -- Deny by default: varsayilan genis yetkiler kaldirilir.
  EXECUTE format('REVOKE ALL ON DATABASE %s FROM PUBLIC', db);

  EXECUTE format('GRANT CONNECT ON DATABASE %s TO businessos_owner', db);
  EXECUTE format('GRANT CONNECT ON DATABASE %s TO businessos_app', db);

  -- Owner'in sema ve drizzle migration tablosunu olusturabilmesi icin.
  EXECUTE format('GRANT CREATE ON DATABASE %s TO businessos_owner', db);
END
$$;

-- --- 4. Sema iskeleti ------------------------------------------------------
-- `docker/postgres/init/02-schemas.sql` ile ayni.
CREATE SCHEMA IF NOT EXISTS platform AUTHORIZATION businessos_owner;

-- Uygulama rolu semayi gorur ama icinde nesne OLUSTURAMAZ.
GRANT USAGE ON SCHEMA platform TO businessos_app;

-- Owner'in bundan sonra olusturacagi her tablo icin uygulama rolune otomatik
-- DML yetkisi. DDL yetkisi ASLA verilmez.
ALTER DEFAULT PRIVILEGES FOR ROLE businessos_owner IN SCHEMA platform
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO businessos_app;

ALTER DEFAULT PRIVILEGES FOR ROLE businessos_owner IN SCHEMA platform
  GRANT USAGE, SELECT ON SEQUENCES TO businessos_app;

-- public semasi kilitlenir: hicbir modul oraya tablo birakmaz.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- =============================================================================
-- DOGRULAMA — yukaridakiler calistiktan SONRA ayri ayri calistir
-- =============================================================================

-- (a) pgvector kurulu mu? Bir satir donmeli.
--     SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';

-- (b) Bes rol de olustu mu? Bes satir donmeli.
--     `rolbypassrls` YALNIZCA uc dar rolde `true` olmali;
--     `businessos_owner` ve `businessos_app` icin MUTLAKA `false`.
--     SELECT rolname, rolcanlogin, rolbypassrls, rolsuper
--     FROM pg_roles WHERE rolname LIKE 'businessos%' ORDER BY rolname;

-- (c) `platform` semasinin sahibi businessos_owner mi?
--     SELECT nspname, pg_get_userbyid(nspowner) AS owner
--     FROM pg_namespace WHERE nspname = 'platform';

-- =============================================================================
-- MIGRATION'LARDAN SONRA — asil sinav
-- =============================================================================
-- Bu proje icin "deploy calisti" demek "health 200 dondu" DEMEK DEGILDIR.
-- Asil soru RLS'in gercekten acik olup olmadigidir. Migration'lar kostuktan
-- sonra:
--
-- (d) Tenant verisi tutan her tablo hem ENABLE hem FORCE tasimali.
--     `relforcerowsecurity = false` olan TEK BIR satir bile bir izolasyon
--     deligidir.
--     SELECT schemaname, tablename, rowsecurity, relforcerowsecurity
--     FROM pg_tables t
--     JOIN pg_class c ON c.relname = t.tablename
--     WHERE schemaname IN ('platform', 'knowledge')
--     ORDER BY schemaname, tablename;
--
-- (e) Uygulama rolu HICBIR tablonun sahibi OLMAMALI. Bos sonuc BEKLENIR;
--     tek satir donerse RLS o tabloda sessizce bypass ediliyor demektir.
--     SELECT schemaname, tablename FROM pg_tables
--     WHERE tableowner = 'businessos_app';
-- =============================================================================
