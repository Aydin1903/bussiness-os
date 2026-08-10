-- ===========================================================================
-- projects.progress_notes + projects.progress_note_chunks (ADR-0033 §1, §6)
-- ===========================================================================
--
-- Projeler'in AI'a ILK KEZ dokundugu migration. Desen `0018`'in
-- (`crm.interactions`) AYNISIDIR — ama veri Projeler'in KENDI semasindadir ve
-- gerekce her modul icin yeniden kurulmaz: cross-schema FK yasak oldugu icin
-- silme cascade'i baska bir semaya YAZILAMAZ, yani silinen bir proje AI'in
-- hafizasinda yasamaya devam ederdi.
--
-- Bu migration'la zincir tamamlanir:
--   projects -> tasks
--   projects -> progress_notes -> progress_note_chunks
-- ve hepsi tek bir DELETE ile gider (ADR-0033 §8).

-- ===========================================================================
-- ⚠️ TABLO ADI `notes` DEGIL `progress_notes` (ADR-0033 §1.1)
-- ===========================================================================
-- `knowledge.notes` zaten var. Ikinci bir `notes` tablosu, kodda her zaman
-- sema-nitelenmis yazilsa da INSAN KONUSMASINDA ("not tablosu sisti") ve
-- ROADMAP §8.5'in retention listesinde belirsizlik uretir.
--
-- Desen zaten CRM'de kuruldu: CRM gorusme kayitlarina `crm.notes` demedi,
-- `crm.interactions` dedi. HER MODUL KENDI KELIMESINI ALIR.
CREATE TABLE projects.progress_notes (
  id             uuid        PRIMARY KEY,
  tenant_id      uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- Her ilerleme notu BIR PROJEYE aittir (ADR-0033 §1, dogal hiyerarsi —
  -- `crm.interactions.company_id` ile ayni karar).
  --
  -- ⚠️ BEDELI ACIKCA: PROJESIZ gorevler (`tasks.project_id IS NULL`) ilerleme
  -- notu TASIYAMAZ. Kabul edildi (ADR-0033 §3): bir yapilacak maddesi bir
  -- satirdir, bir konu basligi degil. Alternatifi notlara POLIMORFIK ebeveyn
  -- vermekti (proje VEYA gorev + CHECK) ve ADR-0031 §1.1 tam olarak onu
  -- reddetti.
  project_id     uuid        NOT NULL REFERENCES projects.projects (id) ON DELETE CASCADE,

  -- Gorev OPSIYONEL bir daraltmadir; silinince not OLMEZ.
  -- Not bir KAYITTIR: gorevi silmek gecmisi silmemelidir
  -- (`crm.interactions.contact_id` ile birebir ayni gerekce).
  task_id        uuid        REFERENCES projects.tasks (id) ON DELETE SET NULL,

  author_user_id uuid        NOT NULL,

  body           text        NOT NULL,

  -- ⚠️ `occurred_on` YOK — `crm.interactions`tan BILINCLI FARK.
  -- Bir GORUSME gunler sonra yazilabilir (gerceklestigi gun ayri bir bilgidir);
  -- ilerleme notu ise AKAN bir gunluktur ve yazildigi an KAYIT ANIDIR.
  -- Olmayan bir ayrimi kolonlastirmak, doldurulmasi gereken bos bir alan
  -- uretirdi.
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT progress_notes_body_not_blank CHECK (btrim(body) <> '')
);
--> statement-breakpoint

CREATE INDEX progress_notes_tenant_created_idx
  ON projects.progress_notes (tenant_id, created_at DESC);
--> statement-breakpoint

-- "Bu projenin tum gecmisi" en sik sorgudur.
CREATE INDEX progress_notes_tenant_project_idx
  ON projects.progress_notes (tenant_id, project_id);
--> statement-breakpoint

-- ===========================================================================
-- projects.progress_note_chunks
-- ===========================================================================
--
-- `tenant_id` DENORMALIZE: RLS politikasi JOIN'siz calissin (`note_chunks` ve
-- `interaction_chunks` ile birebir ayni gerekce).
CREATE TABLE projects.progress_note_chunks (
  id               uuid         PRIMARY KEY,
  tenant_id        uuid         NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,
  progress_note_id uuid         NOT NULL REFERENCES projects.progress_notes (id) ON DELETE CASCADE,

  chunk_index      integer      NOT NULL,

  -- =========================================================================
  -- ICERIK BAGLAM BASLIGI TASIR — `0018`'in ayni karari
  -- =========================================================================
  -- Bir ilerleme notunun KIMLIGI (hangi proje) FK kolonundadir, METINDE
  -- DEGIL. Kullanici "Tasarim onaylandi, kodlamaya gecildi" yazar — "Web
  -- sitesi yenileme" kelimesi hic gecmez ve "Web sitesi projesinde ne oldu?"
  -- sorusu HICBIR chunk'la eslesmez.
  --
  -- Bu yuzden her parca, gomulmeden ONCE bir baslik alir:
  --     [Web sitesi yenileme · 2026-08-10] <parca metni>
  --
  -- ⚠️ GOREV ADI BASLIGA GIRMEZ ve bu bilincli: `0018` de kisi/firsat adini
  -- basliga koymadi, yalnizca sirket adini. Ikinci bir denormalize ad, ikinci
  -- bir bayatlama yuzeyi demektir ve kazanci bedelini karsilamiyor.
  --
  -- BEDELI DURUSTCE: proje adi DENORMALIZEDIR. Proje yeniden adlandirilirsa
  -- eski parcalar eski adi tasir — ta ki `POST /projects/reindex` calisana
  -- kadar. O uc ILK GUNDEN vardir.
  -- =========================================================================
  content          text         NOT NULL,

  -- ADR-0029: `text-embedding-3-small` cikti boyutu 1536. Model degisirse
  -- kolon ve TUM vektorler yeniden uretilir.
  embedding        vector(1536) NOT NULL,

  created_at       timestamptz  NOT NULL DEFAULT now(),

  -- Yeniden uretimi IDEMPOTENT kilar — ilk gunden (`0011`'in dersi).
  CONSTRAINT progress_note_chunks_unique_index UNIQUE (progress_note_id, chunk_index),
  CONSTRAINT progress_note_chunks_index_positive CHECK (chunk_index >= 0),
  CONSTRAINT progress_note_chunks_content_not_blank CHECK (btrim(content) <> '')
);
--> statement-breakpoint

CREATE INDEX progress_note_chunks_tenant_idx ON projects.progress_note_chunks (tenant_id);
--> statement-breakpoint

-- HNSW, IVFFlat DEGIL (ADR-0029 §1). Operator `vector_cosine_ops` — sorgudaki
-- `<=>` ile eslesmezse index DEVRE DISI kalir ve sorgu tam tarama yapar.
CREATE INDEX progress_note_chunks_embedding_idx
  ON projects.progress_note_chunks USING hnsw (embedding vector_cosine_ops);
--> statement-breakpoint

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2). SAPMA YOK.
-- ===========================================================================
ALTER TABLE projects.progress_notes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE projects.progress_notes FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON projects.progress_notes
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

ALTER TABLE projects.progress_note_chunks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE projects.progress_note_chunks FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON projects.progress_note_chunks
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON projects.progress_notes TO businessos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON projects.progress_note_chunks TO businessos_app;
  END IF;
END
$$;
