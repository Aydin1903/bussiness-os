-- 0021_projects_tasks — GERI ALMA
--
-- Tek tablo; index'ler ve politika onunla birlikte duser. `projects.projects`
-- yerinde kalir — bu migration onu OLUSTURMADI, yalnizca ona FK verdi.
--
-- ⚠️ Bu dosya `database.integration.spec`'in geri alma listesine de EKLENDI.
-- `0019`'un o listeye hic girmemis olmasi testi aylarca kirmizi birakmisti;
-- ders Slice 1'de kayda gecti (CLAUDE.md, Projeler bolumu).

DROP TABLE IF EXISTS projects.tasks;
