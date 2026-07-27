-- 0008_list_user_memberships (down)
--
-- Fonksiyonu ve dar role verilen yetkileri geri alir. ROLUN KENDISI burada
-- DUSURULMEZ: rol yasam dongusu bootstrap katmaninindir (01-roles.sql), bir
-- migration'in degil. Role bagli adimlar `IF EXISTS` ile sarilir (up ile ayni
-- rol-bagimsizlik konvansiyonu).

-- Fonksiyon dar role aittir; DROP icin caller o rolun uyesi olmali (uretimde
-- businessos_owner) ya da superuser (testlerde). DROP, fonksiyonun tum EXECUTE
-- grant'larini da kaldirir.
DROP FUNCTION IF EXISTS platform.list_user_memberships(uuid);
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_rls_reader') THEN
    REVOKE SELECT ON platform.tenants      FROM businessos_rls_reader;
    REVOKE SELECT ON platform.memberships  FROM businessos_rls_reader;
    REVOKE USAGE  ON SCHEMA platform       FROM businessos_rls_reader;
  END IF;
END
$$;
