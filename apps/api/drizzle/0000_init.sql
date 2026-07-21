-- 0000_init — platform schema iskeleti
--
-- DEVELOPMENT_RULES 6: migration'lar ELLE yazilir, review edilir, geri alinabilir.
-- Bu migration TABLO OLUSTURMAZ. Faz 1'in amaci semayi degil, migration hattini
-- ayaga kaldirmaktir. Tablolar ilgili modul yazildikca Faz 2+ ile gelir.
--
-- Idempotent yazildi: docker/postgres/init script'leri yalnizca container ilk
-- kez olusturulurken calisir. Testcontainers ile ayaga kalkan bos bir veritabani
-- veya temiz bir CI ortami icin schema'nin migration tarafindan da saglanmasi gerekir.

CREATE SCHEMA IF NOT EXISTS platform;
--> statement-breakpoint
-- Uygulama rolu her ortamda bulunmayabilir (orn. Testcontainers ile acilan izole
-- test veritabani). Rol yoksa yetkilendirme adimi atlanir; migration ortamdan
-- bagimsiz calisir.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    -- Uygulama rolu schema'yi gorur ama icinde nesne OLUSTURAMAZ.
    GRANT USAGE ON SCHEMA platform TO businessos_app;

    -- Bundan sonra migration rolunun olusturacagi tablolarda uygulama rolune
    -- otomatik DML yetkisi verilir. DDL yetkisi asla verilmez (ARCHITECTURE 3.3).
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA platform '
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO businessos_app',
      current_user
    );

    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA platform '
      'GRANT USAGE, SELECT ON SEQUENCES TO businessos_app',
      current_user
    );
  END IF;
END
$$;
