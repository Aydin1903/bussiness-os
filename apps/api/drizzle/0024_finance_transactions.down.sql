-- 0024_finance_transactions — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- ⚠️ `0023`'TEN ONCE ALINMALIDIR: bu tablo `finance.categories`'e bilesik bir
-- FK tasir ve `0023` semayi dusurmeden once bu gitmeli.
-- `database.integration.spec`'in geri alma listesi bu sirayi zorlar.

DROP TABLE IF EXISTS finance.transactions;
