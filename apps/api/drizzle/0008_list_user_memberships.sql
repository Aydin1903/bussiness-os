-- 0008_list_user_memberships — kullanicinin TUM tenant'lardaki uyelikleri (ADR-0028)
--
-- DEVELOPMENT_RULES 6: elle yazildi, geri alinabilir.
--
-- ===========================================================================
-- NEDEN GEREKLI — ve neden KONTROLLU RLS ASIMI
-- ===========================================================================
-- Login sonrasi kullanici bir tenant SECMELIDIR (ADR-0020 iki asamali token):
-- "hangi tenant'lara uyeyim?" sorusu, tenant context'i KURULMADAN once
-- cevaplanmalidir — cunku context'i kuracak olan secimin kendisidir.
--
-- `platform.memberships` FORCE ROW LEVEL SECURITY tasir (0001, 12.2): tablo
-- sahibi (businessos_owner) BILE politikaya takilir. `resolve_tenant` yalnizca
-- `tenants` FORCE OLMADIGI icin calisir; memberships icin ayni numara ise
-- yaramaz. Bu yuzden okuma, BYPASSRLS tasiyan DAR bir rolun (businessos_rls_reader,
-- 01-roles.sql) sahip oldugu bir SECURITY DEFINER fonksiyonunda TOPLANIR.
--
-- NEDEN GUVENLI (resolve_tenant ile ayni felsefe):
--   * Asim tek bir FONKSIYON IMZASINDA. `p_user_id` ISTEMCIDEN DEGIL,
--     dogrulanmis identity token'dan gelir (controller) — kullanici yalnizca
--     KENDI uyeliklerini gorebilir (WHERE m.user_id = p_user_id).
--   * Yalnizca switchable tenant'lar doner: aktif uyelik + aktif tenant.
--   * STABLE, salt-okunur; search_path sabitlenmistir.
--   * businessos_rls_reader NOLOGIN + SELECT yalnizca memberships/tenants'a;
--     baska hicbir tabloya/fonksiyona erisemez (ADR-0028 Constraint 2).
--
-- ROL-BAGIMSIZLIK (0000/0001 ile ayni konvansiyon): role bagli adimlar
-- `IF EXISTS` ile sarilir. `database.integration` testi rolleri OLUSTURMADAN
-- bos bir container'da migrate eder; orada fonksiyon, migration'i calistiran
-- superuser'a ait olur ve RLS'i zaten superuser olarak asar. Uretim/dev ve
-- diger entegrasyon testlerinde rol vardir ve tam mekanizma kurulur.
-- ===========================================================================

-- Dar role, fonksiyonun okudugu iki tabloya SELECT (baska hicbir tabloya degil)
-- ve sahiplik atamasi icin GECICI CREATE. Rol yoksa atlanir.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_rls_reader') THEN
    GRANT SELECT ON platform.memberships TO businessos_rls_reader;
    GRANT SELECT ON platform.tenants      TO businessos_rls_reader;
    GRANT USAGE, CREATE ON SCHEMA platform TO businessos_rls_reader;
  END IF;
END
$$;
--> statement-breakpoint

CREATE FUNCTION platform.list_user_memberships(p_user_id uuid)
RETURNS TABLE (
  tenant_id         uuid,
  tenant_name       text,
  tenant_slug       text,
  membership_role   text,
  membership_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = platform, pg_temp
AS $$
  SELECT t.id, t.name, t.slug, m.role, m.status
  FROM platform.memberships m
  JOIN platform.tenants t ON t.id = m.tenant_id
  WHERE m.user_id = p_user_id
    AND m.status = 'active'    -- yalnizca erisim veren uyelik (grantsAccess)
    AND t.status = 'active';   -- yalnizca operasyonel tenant (isOperational)
$$;
--> statement-breakpoint

-- Sahipligi dar role atar (fonksiyon artik BYPASSRLS ile FORCE-RLS memberships'i
-- okur) ve gecici CREATE'i geri alir. Rol yoksa fonksiyon migration'i calistirana
-- ait kalir (yalnizca rol-bagimsiz testte; orada superuser zaten RLS'i asar).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_rls_reader') THEN
    ALTER FUNCTION platform.list_user_memberships(uuid) OWNER TO businessos_rls_reader;
    REVOKE CREATE ON SCHEMA platform FROM businessos_rls_reader;
  END IF;
END
$$;
--> statement-breakpoint

-- Deny by default: once herkesten al, sonra yalnizca uygulama rolune ver.
REVOKE ALL ON FUNCTION platform.list_user_memberships(uuid) FROM PUBLIC;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT EXECUTE ON FUNCTION platform.list_user_memberships(uuid) TO businessos_app;
  END IF;
END
$$;
