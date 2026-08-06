-- 0016_crm_schema — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- ⚠️ SIRA: once `contacts` (cocuk), sonra `companies` (ebeveyn). `CASCADE`
-- ileri yonde silme icindir; DDL bagimliligini cozmez.
--
-- Sema en sonda dusurulur ve `CASCADE` KULLANILMAZ: icinde beklenmedik bir
-- nesne kaldiysa migration PATLAMALIDIR. `DROP SCHEMA ... CASCADE`, sessizce
-- ne sildigini soylemez.

DROP TABLE IF EXISTS crm.contacts;
--> statement-breakpoint
DROP TABLE IF EXISTS crm.companies;
--> statement-breakpoint
DROP SCHEMA IF EXISTS crm;
