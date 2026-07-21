-- 0000_init — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
-- Konvansiyon: her `NNNN_ad.sql` icin bir `NNNN_ad.down.sql` bulunur ve
-- `pnpm db:rollback` en son uygulanan migration'i bu dosyayla geri alir.
--
-- RESTRICT bilinclidir, CASCADE DEGIL: schema'da tablo kalmissa bu komut
-- HATA VERIR. Geri alma islemi asla sessizce veri silmez; once tablolari
-- olusturan migration'lar geri alinmalidir.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA platform '
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM businessos_app',
      current_user
    );

    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA platform '
      'REVOKE USAGE, SELECT ON SEQUENCES FROM businessos_app',
      current_user
    );

    REVOKE USAGE ON SCHEMA platform FROM businessos_app;
  END IF;
END
$$;
--> statement-breakpoint
DROP SCHEMA IF EXISTS platform RESTRICT;
