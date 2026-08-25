-- 0037_feedback_schema — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- ⚠️ TEK TABLO, TEK KADEME: bu semada sema ici FK YOKTUR (`responses` hicbir
-- seye isaret etmez; `crm_contact_id` bir FK DEGILDIR — cross-schema FK
-- yasaktir, ADR-0045 §6.1). ADR-0043'un `0035`teki iki kademeli sirasi burada
-- GEREKMIYOR.
--
-- ⚠️ `DROP SCHEMA` CASCADE'SIZDIR ve oyle kalmalidir: bir kalinti nesne varsa
-- sessizce silinmesin, PATLASIN. Bu semada trigger ya da fonksiyon YOK
-- (ADR-0041'in `0031` dersi burada tetiklenmiyor), yani tek `DROP TABLE`
-- semayi bosaltmaya yeter.
--
-- ⚠️ KOLON BAZLI YETKI ICIN AYRI BIR `REVOKE` GEREKMEZ — `0034`ten AYRILDIGI
-- nokta: orada mevcut bir tablonun yetkisi daraltilmisti ve geri alma onu
-- eski haline dondurmek zorundaydi. Burada tablonun KENDISI dusuyor; yetkiler
-- (`GRANT UPDATE (embedding)` dahil) tabloyla birlikte gider.
--
-- ⚠️ GERI ALMA MUSTERININ SOZUNU YOK EDER. Bu, `0032`nin denetim kaydiyla ayni
-- siniftan bir kayiptir: silinen sey yalnizca veri degil, ISLETMENIN DISARIDAN
-- ALDIGI TEK SESTIR (§3.1) — ve tekrar toplanamaz.

DROP TABLE IF EXISTS feedback.responses;
--> statement-breakpoint

DROP SCHEMA IF EXISTS feedback;
