-- 0015_platform_conversations — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- 0014'un aksine bu geri alma VERI KAYBETMEZ ve SIMETRIKTIR: ileri yonde de
-- geri yonde de tablo NESNE olarak tasinir, satir kopyalanmaz. Konusma
-- gecmisi, politikalar, FK + ON DELETE CASCADE ve index'ler ikisinde de
-- korunur.
--
-- Sira ileri yonun TERSI: once `messages` (cocuk), sonra `conversations`
-- (ebeveyn) — ki FK hicbir an cross-schema kalmasin.

ALTER TABLE platform.messages SET SCHEMA knowledge;
--> statement-breakpoint
ALTER TABLE platform.conversations SET SCHEMA knowledge;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge.conversations TO businessos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge.messages TO businessos_app;
  END IF;
END
$$;
