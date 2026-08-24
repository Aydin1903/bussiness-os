-- 0035_hr_schema — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- ⚠️ SIRA ZORUNLU VE KENDI ICINDE IKI KADEMELI: `compensation_records` ONCE
-- duser cunku `hr.employees`e `ON DELETE RESTRICT` ile baglidir (§1.4) —
-- ebeveyni once dusurmek FK ihlali verirdi. ADR-0039'un `0029` dersi
-- (`movements` -> `items`) burada TEK MIGRATION ICINDE gecerlidir.
--
-- ⚠️ `DROP SCHEMA` CASCADE'SIZDIR ve oyle kalmalidir: bir kalinti nesne varsa
-- sessizce silinmesin, PATLASIN. Bu semada trigger ya da fonksiyon YOK
-- (ADR-0041'in `0031` dersi burada tetiklenmiyor), yani iki `DROP TABLE`
-- semayi bosaltmaya yeter.
--
-- ⚠️ UCRET GECMISI GERI GELMEZ. Bu, `0032`nin denetim kaydiyla ayni siniftan
-- bir kayiptir: silinen sey yalnizca veri degil, "maasi kim ne zaman
-- degistirdi" sorusunun CEVABIDIR (§6.2).

DROP TABLE IF EXISTS hr.compensation_records;
--> statement-breakpoint

DROP TABLE IF EXISTS hr.employees;
--> statement-breakpoint

DROP SCHEMA IF EXISTS hr;
