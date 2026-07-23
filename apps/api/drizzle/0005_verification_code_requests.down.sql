-- 0005_verification_code_requests — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur. Tek tablo, bagimlilik
-- yok; index'ler tabloyla birlikte otomatik duser. CASCADE kullanilmaz.

DROP TABLE IF EXISTS platform.verification_code_requests;
