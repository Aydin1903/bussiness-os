-- 0020_projects_schema — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- Sema en sonda dusurulur ve `CASCADE` KULLANILMAZ: icinde beklenmedik bir
-- nesne kaldiysa migration PATLAMALIDIR. `DROP SCHEMA ... CASCADE`, sessizce
-- ne sildigini soylemez (`0016`'nin ayni gerekcesi).

DROP TABLE IF EXISTS projects.projects;
--> statement-breakpoint
DROP SCHEMA IF EXISTS projects;
