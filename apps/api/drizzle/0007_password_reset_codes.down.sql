-- 0007_password_reset_codes — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur. Tek tablo, bagimlilik
-- yok; index tabloyla birlikte otomatik duser. CASCADE kullanilmaz.

DROP TABLE IF EXISTS platform.password_reset_codes;
