-- Business OS — veritabani rolleri
--
-- ARCHITECTURE 3.3'un en kritik on kosulu: uygulama, tablo sahibi OLMAYAN bir
-- rol ile baglanir. Aksi halde ALTER TABLE ... FORCE ROW LEVEL SECURITY edilmis
-- olsa bile tablo sahibi politikalari bypass eder ve RLS'in tamami sessizce
-- devre disi kalir. Bu ayrimi Faz 2'de yapmaya kalkmak, o gune kadar yazilmis
-- her seyi yanlis rolle test etmis olmak demektir.
--
-- Buradaki parolalar YALNIZCA lokal gelistirme icindir. Production'da roller
-- secret manager'dan gelen parolalarla saglanir (DEVELOPMENT_RULES 8).

-- Migration'lari calistiran rol: DDL yetkisi var, superuser DEGIL.
CREATE ROLE businessos_owner
  LOGIN
  PASSWORD 'businessos_owner_dev'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOBYPASSRLS;

-- Uygulamanin runtime rolu: yalnizca DML. Hicbir tablonun sahibi degildir.
CREATE ROLE businessos_app
  LOGIN
  PASSWORD 'businessos_app_dev'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOBYPASSRLS;

-- ---------------------------------------------------------------------------
-- businessos_rls_reader — DAR, kontrollu RLS-asim rolu (ADR-0028)
--
-- TEK VAROLUS SEBEBI: `platform.list_user_memberships` SECURITY DEFINER
-- fonksiyonunun sahibi olmak. `platform.memberships` FORCE ROW LEVEL SECURITY
-- tasir (12.2); tablo sahibi (businessos_owner) bile politikaya takilir. Bir
-- kullanicinin TUM tenant'lardaki uyeliklerini tenant context'i OLMADAN okumak
-- (login sonrasi tenant secimi, ADR-0020) bu yuzden BYPASSRLS gerektirir.
--
-- Neden AYRI bir rol (businessos_owner'a BYPASSRLS vermek yerine): migration'lari
-- calistiran rol BYPASSRLS olsaydi, tum DDL akisi RLS'i sessizce bypass ederdi.
-- Asim, tek bir fonksiyon imzasinda ve tek bir dar rolde TOPLANIR.
--
-- NARROWNESS (ADR-0028 kisitlari):
--   * NOLOGIN — dogrudan baglanamaz; yalnizca fonksiyon icinde "canlanir".
--   * BYPASSRLS — tek yetenegi bu; baska hicbir sey icin degil.
--   * Bu rol yalnizca `list_user_memberships` fonksiyonunun sahibidir.
--   * SELECT YALNIZCA `platform.memberships` ve `platform.tenants`'a verilir
--     (migration 0008'de, tablo sahibi tarafindan) — baska HICBIR tabloya degil.
--   * Baska hicbir fonksiyona EXECUTE, hicbir yerde INSERT/UPDATE/DELETE YOK.
-- Bu kisitlar bir entegrasyon testiyle KANITLANIR (Constraint 2).
--
-- `GRANT ... TO businessos_owner`: owner'in fonksiyon sahipligini bu role
-- ATAYABILMESI icin (ALTER FUNCTION OWNER, uyelik + gecici CREATE gerektirir;
-- migration 0008). businessos_owner NOCREATEROLE oldugu icin rol burada,
-- superuser tarafindan olusturulur — migration icinde olusturulamaz.
CREATE ROLE businessos_rls_reader
  NOLOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  BYPASSRLS;

GRANT businessos_rls_reader TO businessos_owner;

-- ---------------------------------------------------------------------------
-- businessos_outbox_relay — DORDUNCU rol, ikinci kontrollu RLS-asim rolu
-- (ADR-0006, MULTI_TENANT_ARCHITECTURE 12.4.2, migration 0010)
--
-- TEK VAROLUS SEBEBI: tenant outbox tuketicisinin uc SECURITY DEFINER
-- fonksiyonunun (`claim_outbox_batch`, `mark_outbox_published`,
-- `record_outbox_failure`) sahibi olmak. `platform.outbox` FORCE ROW LEVEL
-- SECURITY tasir (0002); publisher sureci tenant'lar ARASI okumak zorundadir
-- ve tenant context'i yoktur.
--
-- NEDEN businessos_rls_reader YENIDEN KULLANILMADI: o rolun ADR-0028 Constraint
-- 2 sozlesmesi "yalnizca memberships/tenants'a SELECT, hicbir yerde
-- INSERT/UPDATE/DELETE YOK" der ve bir entegrasyon testiyle KANITLANIR. Outbox
-- yetkisi eklemek o sozlesmeyi ve testi kirardi. Iki asim, iki ayri dar rol.
--
-- NEDEN businessos_owner'a BYPASSRLS verilmedi: migration'lari calistiran rol
-- BYPASSRLS olsaydi tum DDL akisi RLS'i sessizce bypass ederdi (12.4.4 ile ayni
-- gerekce).
--
-- NARROWNESS:
--   * NOLOGIN — dogrudan baglanamaz; hicbir baglanti dizesine/.env'e girmez.
--   * BYPASSRLS — tek yetenegi bu.
--   * Yalnizca yukaridaki uc fonksiyonun sahibidir.
--   * SELECT + UPDATE YALNIZCA `platform.outbox`'a verilir (migration 0010'da,
--     tablo sahibi tarafindan) — baska HICBIR tabloya degil. INSERT/DELETE YOK.
--   * Standing sema-yazma yetkisi TUTMAZ (CREATE gecici verilip geri alinir).
-- Bu kisitlar bir entegrasyon testiyle KANITLANIR (Constraint 2 esdegeri).
CREATE ROLE businessos_outbox_relay
  NOLOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  BYPASSRLS;

GRANT businessos_outbox_relay TO businessos_owner;

-- Varsayilan genis yetkiler kaldirilir: erisim acikca verilir (deny by default).
REVOKE ALL ON DATABASE business_os FROM PUBLIC;

GRANT CONNECT ON DATABASE business_os TO businessos_owner;
GRANT CONNECT ON DATABASE business_os TO businessos_app;

-- Owner'in schema ve drizzle migration tablosunu olusturabilmesi icin gerekli.
GRANT CREATE ON DATABASE business_os TO businessos_owner;
