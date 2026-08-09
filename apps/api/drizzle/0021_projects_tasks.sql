-- ===========================================================================
-- projects.tasks — gorevler (ADR-0033 §1, §3, §4)
-- ===========================================================================
--
-- Bu migration'da da AI YOK. `progress_notes` / `progress_note_chunks` ve
-- pgvector Slice 3'e aittir.

-- ===========================================================================
-- ⚠️ `project_id` NULLABLE — ADR-0031'in `interactions.company_id NOT NULL`
-- kararindan BILINCLI SAPMA (ADR-0033 §3)
-- ===========================================================================
-- Ikisi ayni sorun DEGIL. Bir GORUSME tanimi geregi bir sirketle yapilir;
-- ebeveynsiz gorusme diye bir sey yoktur. Bir GOREV icin bu dogru degildir:
-- "faturayi gonder", "domaini yenile" gercek islerdir ve hicbiri bir proje
-- degildir.
--
-- NOT NULL'un bedeli burada ASIMETRIK ve modulun AMACINA zarar verir: zorunlu
-- kilinsaydi kullanici tek gorevlik SAHTE projeler acardi ("Genel", "Diger").
-- Bu yalnizca cirkin degil — Slice 4'un yapisal katkicisinin "durgun projeler"
-- sorgusu o sahte projelerle dolar ve AI GUVENLE YANLIS cevaplar uretirdi.
-- Modulun var olma sebebi dogru baglam uretmektir.
--
-- Varsayilan/gizli bir "Genel" projesi ile cozmek REDDEDILDI: veriye sizan
-- sihirli bir satirdir; silinebilir, yeniden adlandirilabilir ve her sorgu onu
-- ozel olarak elemek zorunda kalir (Mutlak Kural 9).
--
-- BU POLIMORFIZM DEGILDIR: tek bir opsiyonel ebeveyn var, CHECK yok, dallanma
-- yok. `WHERE project_id IS NULL` "Yapilacaklar" kutusudur.
--
-- `ON DELETE CASCADE`: proje silinince gorevleri de gider (ADR-0033 §8).
-- Projesiz gorevler cascade'e GIRMEZ; yalnizca acikca silinir.
--
-- ===========================================================================
-- ⚠️ `assignee_user_id` FK TASIMAZ
-- ===========================================================================
-- `platform.users` baska bir semadir (`crm.interactions.author_user_id` ile
-- ayni desen ve ayni gerekce). Ama YAZMA ANINDA dogrulanir: atanan kisi, icinde
-- bulunulan tenant'in AKTIF bir uyesi olmak zorundadir ve kontrol Tenant'in
-- public interface'i (`TenantAccessQuery`) uzerinden yapilir. Dogrulanmasaydi
-- baska bir tenant'in kullanici id'si yazilabilirdi — veri sizintisi degil (ad
-- zaten cozulemez) ama COZULEMEYEN BIR ISARETCI ureten cop veri olurdu.
--
-- `NULL` gecerli ve anlamli bir durumdur: ATANMAMIS gorev.
CREATE TABLE projects.tasks (
  id               uuid        PRIMARY KEY,
  tenant_id        uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,
  project_id       uuid        REFERENCES projects.projects (id) ON DELETE CASCADE,

  title            text        NOT NULL,
  status           text        NOT NULL DEFAULT 'todo',

  -- TAKVIM GUNU (`date`), an DEGIL — `projects.due_on` ile ayni gerekce.
  due_on           date,

  -- Cross-modul YUMUSAK referans: FK YOK, bkz. yukaridaki blok.
  assignee_user_id uuid,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tasks_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT tasks_updated_after_created CHECK (updated_at >= created_at),

  -- Sozluk tabloda DA zorlanir (`projects.status` ile ayni karar).
  CONSTRAINT tasks_status_valid CHECK (status IN ('todo', 'in_progress', 'done'))
);
--> statement-breakpoint

-- MT §12.3: bilesik index'te `tenant_id` DAIMA ilk kolon.
CREATE INDEX tasks_tenant_created_idx ON projects.tasks (tenant_id, created_at DESC);
--> statement-breakpoint

-- "Bu projenin gorevleri" en sik sorgudur. Ayni index, proje silinirken
-- cascade'in cocuklari bulmasini da hizlandirir.
--
-- ⚠️ `project_id` NULL olan satirlar da bu index'te YER ALIR ve bu KASITLI:
-- "Yapilacaklar kutusu" (`WHERE project_id IS NULL`) da ayni index'ten
-- yararlanir. Kismi bir index (`WHERE project_id IS NOT NULL`) kutuyu tam
-- taramaya birakirdi.
CREATE INDEX tasks_tenant_project_idx ON projects.tasks (tenant_id, project_id);
--> statement-breakpoint

-- "Kimin isleri" — atanmamis gorevler bu index'i SISIRMESIN diye KISMI.
CREATE INDEX tasks_tenant_assignee_idx ON projects.tasks (tenant_id, assignee_user_id)
  WHERE assignee_user_id IS NOT NULL;
--> statement-breakpoint

-- GECIKMIS gorevler.
--
-- ⚠️ Yuklem, sorgudaki yuklemle BIREBIR eslesmek ZORUNDA:
-- `due_on IS NOT NULL AND status <> 'done'`. Ikisi ayrisirsa index devre disi
-- kalir ve sorgu tam tarama yapar — CRM'in `0017`'de ogrendigi ayni ders
-- (`listFollowUps` yorumuna bakiniz). Gunun kendisi (`due_on < $today`)
-- yukleme GIRMEZ: `CURRENT_DATE` degismez degildir ve kismi index'te
-- kullanilamaz; zaten gun DISARIDAN (Clock) gelir.
CREATE INDEX tasks_tenant_due_idx ON projects.tasks (tenant_id, due_on)
  WHERE due_on IS NOT NULL AND status <> 'done';
--> statement-breakpoint

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2). SAPMA YOK.
-- ===========================================================================
ALTER TABLE projects.tasks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE projects.tasks FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON projects.tasks
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

-- Uygulama rolu: yalnizca DML. DDL yetkisi ASLA verilmez.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON projects.tasks TO businessos_app;
  END IF;
END
$$;
