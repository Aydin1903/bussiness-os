-- ===========================================================================
-- documents.document_chunks — CHUNK TABLOSU GERI DONUYOR (ADR-0037 §3)
-- ===========================================================================
--
-- ⚠️ BU MIGRATION, BIR ONCEKI MODULUN KARARINI TERSINE CEVIRIR — ve tersligi
-- gizlenmiyor. Randevu (`0026`) chunk tablosunu BILINCLI OLARAK REDDETMISTI:
-- vektor satirin kendi kolonundaydi. Belge onu GERI GETIRIR.
--
-- Iki karar CELISMIYOR cunku AYNI OLCUT iki farkli cevap veriyor — metnin ust
-- sinirini KIM belirliyor:
--
--   Randevu `service_note`  : sinir BIZIM (`TARGET_CHUNK_CHARS`'a esitlendi)
--                             -> parcalayici HER ZAMAN tek parca uretirdi
--                             -> ikinci tablo yalnizca bir join maliyeti olurdu
--
--   Belge icerigi           : sinir DOSYANIN (on sayfalik bir sozlesme)
--                             -> parcalayici on, yuz, uc yuz parca uretir
--                             -> tek vektor BUTUN SOZLESMENIN ORTALAMASI olurdu
--
-- ADR-0035 §3a chunking'in NE COZDUGUNU yazmisti: "uzun anlatisal govdeleri
-- boler; tek bir vektor, uzun metnin yalnizca ortalamasini temsil eder —
-- spesifik bir cumle kaybolur." Bir sozlesme tam olarak budur: "fesih bildirimi
-- otuz gun oncesinden yapilir" cumlesi on sayfanin tek vektorunde KAYBOLUR. Bu
-- modulun tek isi o cumleyi bulabilmektir.
--
-- ⚠️ BU BIR ICAT DEGIL, BESINCI UYGULAMADIR: `knowledge.note_chunks` ·
-- `crm.interaction_chunks` · `projects.progress_note_chunks` ·
-- `finance.commentary_chunks` — desen degistirilmeden aliniyor.
--
-- Iki ADR'nin birlikte urettigi kural, bundan sonraki anlatisal modullerin
-- okuyacagi sey budur:
--
--     Chunk tablosu, metnin ust sinirini KULLANICI DEGIL VERININ KENDISI
--     belirliyorsa acilir.

-- ===========================================================================
-- `tenant_id` DENORMALIZE: RLS politikasi JOIN'siz calissin (`note_chunks`,
-- `interaction_chunks`, `progress_note_chunks` ve `commentary_chunks` ile
-- birebir ayni gerekce).
-- ===========================================================================
CREATE TABLE documents.document_chunks (
  id          uuid         PRIMARY KEY,
  tenant_id   uuid         NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- ⚠️ `ON DELETE CASCADE` — ve bu, RETENTION KOLUNU BELIRLER (ROADMAP §8.5).
  -- Dogru retention kolu `documents.documents`tir; yalnizca parca silen bir is
  -- YETIM EBEVEYN birakirdi. `conversations` denetiminde ogrenilen ders,
  -- besinci kez ILK GUNDEN uygulaniyor.
  --
  -- ⚠️ Ayni cascade, §7'nin "yeni dosya eskisini DEGISTIRIR" karariniin da
  -- mekanigidir: dosya degisiminde parcalar TUMUYLE silinip yeniden uretilir.
  -- Kismi guncelleme YOKTUR.
  document_id uuid         NOT NULL REFERENCES documents.documents (id) ON DELETE CASCADE,

  chunk_index integer      NOT NULL,

  -- =========================================================================
  -- BAGLAM BASLIGI — VE BU MODULDE BAGLI VARLIK ADI KONMAZ (ADR-0037 §8.1)
  -- =========================================================================
  -- Her parca gomulmeden once bir baslik alir:
  --     [Belge · Ofis Kira Sozlesmesi 2026.pdf · sozlesme] <parca metni>
  --
  -- Uc parca: SABIT etiket + DOSYA ADI + (varsa) kullanicinin ETIKETI.
  --
  -- ⚠️ RANDEVU'DAN BILINCLI SAPMA. `0026` bagli CRM kisisinin ADINI basliga
  -- koymus ve bedelini (bayatlama) `reindex` ile odemisti. Burada konmaz cunku
  -- ADR-0033'un kurali IKI bagli varlik oldugunda yon gosteriyor: "ikinci bir
  -- denormalize ad ikinci bir bayatlama yuzeyi demektir" — basliga YALNIZCA BIR
  -- ad girer. Belgenin IKI opsiyonel baglantisi var (§4); ikisini koymak kurali
  -- ihlal eder, BIRINI secmek KEYFIDIR. Ucuncu yol secildi: HICBIRI.
  --
  -- Yerine konan `original_filename` kaydin KENDI kolonudur, baska bir
  -- modulden kopyalanmaz ve HICBIR ZAMAN bayatlamaz.
  --
  -- ⚠️ Bedeli acikca: "Ahmet'le olan sozlesmede ne yaziyordu" sorusu, ad dosya
  -- adinda ya da etikette gecmiyorsa ESLESMEZ (ADR-0037 bilinen sinirlar).
  --
  -- ⚠️ `reindex` YINE DE ILK GUNDEN VAR: etiket degisimi ve dosya degisimi
  -- basligi bayatlatir, ve embedding cokmesi parcasiz belge birakir.
  -- =========================================================================
  content     text         NOT NULL,

  -- ADR-0029: `text-embedding-3-small` cikti boyutu 1536. Model degisirse kolon
  -- ve TUM vektorler yeniden uretilir.
  --
  -- ⚠️ `NOT NULL` — `appointments.embedding`den fark. Orada vektorsuz satir
  -- MESRUYDU (notsuz randevu). Burada bir PARCA vektorsuz var olamaz: parca
  -- zaten yalnizca gomulmek icin uretilir. "Metni cikarilamamis belge"
  -- (taranmis PDF, §6.3) bu tabloda SIFIR SATIRLA ifade edilir — vektorsuz bir
  -- satirla degil.
  embedding   vector(1536) NOT NULL,

  created_at  timestamptz  NOT NULL DEFAULT now(),

  -- Yeniden uretimi IDEMPOTENT kilar — ilk gunden (`0011`'in dersi, besinci
  -- kez). ⚠️ TENANT-SCOPED (ADR-0037 §1): `document_id` zaten global olarak
  -- benzersiz oldugu icin `tenant_id` teknik olarak gereksizdir, ama unique
  -- kisitlar bu projede DAIMA tenant-scoped yazilir (MT §12.3) ve istisna
  -- acmak kurali zayiflatirdi.
  CONSTRAINT document_chunks_unique_index UNIQUE (tenant_id, document_id, chunk_index),
  CONSTRAINT document_chunks_index_positive CHECK (chunk_index >= 0),
  CONSTRAINT document_chunks_content_not_blank CHECK (btrim(content) <> '')
);
--> statement-breakpoint

CREATE INDEX document_chunks_tenant_idx ON documents.document_chunks (tenant_id);
--> statement-breakpoint

-- "Bu belgenin parcalari" — silme/yeniden uretme yolunun sorgusu.
CREATE INDEX document_chunks_document_idx ON documents.document_chunks (document_id);
--> statement-breakpoint

-- HNSW, IVFFlat DEGIL (ADR-0029 §1). Operator `vector_cosine_ops` — sorgudaki
-- `<=>` ile eslesmezse index DEVRE DISI kalir ve sorgu TAM TARAMA yapar; sessiz
-- bir performans coku.
--
-- ⚠️ BU, PROJENIN ALTINCI VEKTOR TASIYAN TABLOSUDUR (ROADMAP §8.5). Depolama
-- tarafindaki asil yuk bu tablolardadir ve bu modul digerlerinden DAHA COK
-- ekleyecektir: kayit basina TEK vektor degil, ON-YUZ vektor.
CREATE INDEX document_chunks_embedding_idx
  ON documents.document_chunks USING hnsw (embedding vector_cosine_ops);
--> statement-breakpoint

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2). SAPMA YOK.
-- ===========================================================================
ALTER TABLE documents.document_chunks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE documents.document_chunks FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON documents.document_chunks
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON documents.document_chunks TO businessos_app;
  END IF;
END
$$;
