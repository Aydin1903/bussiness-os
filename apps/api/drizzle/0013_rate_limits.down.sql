-- 0013_rate_limits — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- DIKKAT: geri alma, projenin EN PAHALI iki ucundaki (`/knowledge/ask` ve
-- `/knowledge/notes`) maliyet korumasini TUMUYLE kaldirir. Uygulama kodu bu
-- tabloyu bekliyorsa once o geri alinmalidir; aksi halde her istek T0'da
-- hata verir (fail closed — sessizce sinirsiz calismaz).

DROP TABLE IF EXISTS knowledge.rate_limits;
