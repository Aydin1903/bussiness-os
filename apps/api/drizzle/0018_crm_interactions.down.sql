-- 0018_crm_interactions — GERI ALMA
--
-- SIRA: once chunk'lar (cocuk), sonra gorusmeler (ebeveyn). `CASCADE` ileri
-- yonde SILME icindir; DDL bagimliligini cozmez.
--
-- ⚠️ Bu geri alma TUM EMBEDDING'LERI yok eder. Yeniden ileri alindiginda
-- chunk'lar BOS gelir; `POST /crm/reindex` ile yeniden uretilmeleri gerekir.
-- Kaynak veri (gorusme metinleri) de bu adimda gider, yani onarim ancak
-- gorusmeler yeniden yazilirsa mumkundur.

DROP TABLE IF EXISTS crm.interaction_chunks;
--> statement-breakpoint
DROP TABLE IF EXISTS crm.interactions;
