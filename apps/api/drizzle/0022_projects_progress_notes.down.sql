-- 0022_projects_progress_notes — GERI ALMA
--
-- ⚠️ SIRA: once `progress_note_chunks` (cocuk), sonra `progress_notes`
-- (ebeveyn). `CASCADE` ileri yonde silme icindir; DDL bagimliligini cozmez
-- (`0016`'nin ayni dersi).
--
-- ⚠️ KAYIP TELAFI EDILEMEZ: bu tablolar bir onbellek DEGIL, kaynak veridir.
-- `0019`'un geri almasindan farki tam olarak budur — orada silinen sey
-- yeniden uretilebilen bir ozetti; burada kullanicinin YAZDIGI metin gider.
--
-- Bu dosya `database.integration.spec`'in geri alma listesine de EKLENDI
-- (Slice 1'de kayda gecen ders).

DROP TABLE IF EXISTS projects.progress_note_chunks;
--> statement-breakpoint
DROP TABLE IF EXISTS projects.progress_notes;
