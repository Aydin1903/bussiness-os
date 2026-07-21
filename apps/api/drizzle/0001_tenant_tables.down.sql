-- 0001_tenant_tables — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- Silme sirasi bagimliliklarin TERSIDIR: once memberships (tenants'a FK
-- veriyor), sonra fonksiyon, en son tenants.
--
-- CASCADE KULLANILMAZ. Bu migration'in olusturmadigi hicbir nesne bu dosya
-- tarafindan silinemez; baska bir tablo tenants'a bagimli hale gelmisse
-- geri alma HATA VERMELIDIR. Sessizce veri silen bir rollback, geri almanin
-- kendisinden daha tehlikelidir.
--
-- Politikalar ve index'ler tabloyla birlikte otomatik duser; ayrica
-- DROP edilmelerine gerek yoktur.

DROP TABLE IF EXISTS platform.memberships;
--> statement-breakpoint
DROP FUNCTION IF EXISTS platform.resolve_tenant(text);
--> statement-breakpoint
DROP TABLE IF EXISTS platform.tenants;
