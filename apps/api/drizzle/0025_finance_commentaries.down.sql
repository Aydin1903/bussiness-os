-- 0025_finance_commentaries — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- ⚠️ `commentary_chunks` ONCE dusurulur: `commentaries`e FK tasir. `CASCADE`
-- KULLANILMAZ — beklenmedik bir bagimlilik kalmissa migration PATLAMALIDIR.
--
-- ⚠️ Bu dosya `0024`/`0023`ten ONCE calisir ama onlardan BAGIMSIZDIR:
-- `commentaries`in `finance.transactions` ya da `finance.categories` ile
-- hicbir FK iliskisi YOKTUR (ADR-0034 §1.1 — yorumun ebeveyni yok).

DROP TABLE IF EXISTS finance.commentary_chunks;
--> statement-breakpoint
DROP TABLE IF EXISTS finance.commentaries;
