-- 0038_marketing_schema — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- ⚠️ TEK TABLO, TEK KADEME: bu semada sema ici FK YOKTUR (`campaigns` hicbir
-- seye isaret etmez; `crm_company_id` bir FK DEGILDIR — cross-schema FK
-- yasaktir, ADR-0047 §6.1). ADR-0043'un `0035`teki iki kademeli sirasi burada
-- GEREKMIYOR.
--
-- ⚠️ `DROP SCHEMA` CASCADE'SIZDIR ve oyle kalmalidir: bir kalinti nesne varsa
-- sessizce silinmesin, PATLASIN. Bu semada trigger ya da fonksiyon YOK
-- (ADR-0041'in `0031` dersi burada tetiklenmiyor), yani tek `DROP TABLE`
-- semayi bosaltmaya yeter.
--
-- ⚠️ AYRI BIR `REVOKE` GEREKMEZ ve sebebi `0037`den FARKLIDIR: orada geri alma
-- kolon bazli bir yetkiyi de goturuyordu; burada oyle bir yetki HIC YAZILMADI
-- (satir tam duzenlenebilir, ADR-0047 §2). Indexler ve politika tabloyla
-- birlikte duser.

DROP TABLE IF EXISTS marketing.campaigns;
--> statement-breakpoint

DROP SCHEMA IF EXISTS marketing;
