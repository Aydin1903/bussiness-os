-- 0003_identity_tables — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- Silme sirasi bagimliliklarin TERSIDIR: once FK VEREN tablolar, sonra hedefleri.
--   refresh_tokens -> token_families
--   credentials / email_verification_codes / token_families -> users
-- login_attempts bagimsizdir.
--
-- CASCADE KULLANILMAZ: bu migration'in olusturmadigi hicbir nesne bu dosya
-- tarafindan silinemez. Baska bir tablo bunlara bagimli hale gelmisse geri alma
-- HATA VERMELIDIR — sessizce veri silen bir rollback, geri almanin kendisinden
-- daha tehlikelidir. Index'ler tablolariyla birlikte otomatik duser.

DROP TABLE IF EXISTS platform.login_attempts;
--> statement-breakpoint
DROP TABLE IF EXISTS platform.refresh_tokens;
--> statement-breakpoint
DROP TABLE IF EXISTS platform.email_verification_codes;
--> statement-breakpoint
DROP TABLE IF EXISTS platform.credentials;
--> statement-breakpoint
DROP TABLE IF EXISTS platform.token_families;
--> statement-breakpoint
DROP TABLE IF EXISTS platform.users;
