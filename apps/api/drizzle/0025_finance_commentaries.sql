-- ===========================================================================
-- finance.commentaries + finance.commentary_chunks (ADR-0034 §1.1, §6.1)
-- ===========================================================================
--
-- Finans'in AI'a ILK KEZ dokundugu migration. Desen `0018`/`0022`'nin
-- AYNISIDIR — ama BU MODULDE GOMULEN SEY FARKLIDIR ve fark bu dosyanin en
-- onemli kaydidir.
--
-- ===========================================================================
-- ⚠️ ISLEM ACIKLAMALARI GOMULMEZ — GOMULEN SEY YORUMLARDIR (ADR-0034 §6.1)
-- ===========================================================================
-- `finance.transactions.description` duz bir kolondur ve OYLE KALIR. Onu
-- gommek uc sebeple reddedildi:
--
--   1. ORTAK HAVUZU KIRLETIR. Global top-K 8'dir ve DORT anlamsal kaynak ayni
--      havuzda siralanir. "Ocak kirasi", "Subat kirasi", "Mart kirasi"
--      birbirine neredeyse OZDES kisa vektorlerdir; bir kira sorusunda sekiz
--      yuvanin yarisini bunlar doldurur ve DIGER UC MODULUN en iyi parcalarini
--      disari iter. Yani bu, Finans'in degil `POST /ask`in karari.
--   2. CEVABI ZATEN YAPISAL KATKICI VERIYOR. "Gecen ay ne kadar harcadik" bir
--      aciklamada yazmaz, `amount` kolonunda yazar.
--   3. PARA HARCAR. Islem, projedeki en yuksek hacimli yazma yoludur.
--
-- Yorum ise gercekten ANLATISALDIR ve baska hicbir kolonda yasamaz:
-- "Mart'ta nakit sikisti cunku X musterisi odemeyi geciktirdi." CLAUDE.md'nin
-- "finansal hafiza" ifadesinin karsiligi tam olarak budur — rakamlar zaten
-- tabloda, NEDENi yorumda.

-- ===========================================================================
-- ⚠️ TABLO ADI `notes` DEGIL `commentaries` (ADR-0034 §1.1)
-- ===========================================================================
-- `knowledge.notes`, `crm.interactions`, `projects.progress_notes` var.
-- Dorduncu bir `notes`, kodda her zaman sema-nitelenmis yazilsa da INSAN
-- KONUSMASINDA ve ROADMAP §8.5'in retention listesinde belirsizlik uretir.
-- HER MODUL KENDI KELIMESINI ALIR; Finans'inki `commentaries`tir (arayuzde
-- "Finansal yorum").
CREATE TABLE finance.commentaries (
  id             uuid        PRIMARY KEY,
  tenant_id      uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  author_user_id uuid        NOT NULL,

  -- =========================================================================
  -- ⚠️ EBEVEYN YOK — `progress_notes.project_id`den BILINCLI FARK
  -- =========================================================================
  -- Bir ilerleme notu tanimi geregi bir projeye aittir. Bir finansal yorum ise
  -- bir DONEM hakkindadir, tek bir kayit hakkinda degil: "Mart'ta nakit
  -- sikisti" cumlesi hicbir islem satirina ait degildir, hepsinin USTUNDEDIR.
  --
  -- Bir `transaction_id` eklemek cazipti ve REDDEDILDI: yorumu tek bir satira
  -- baglamak, tam da onun tasidigi TOPLU bakisi yok ederdi. Ayrica islem
  -- silinince yorum da giderdi — oysa "o ay neden zordu" bilgisi, o aya ait
  -- tek bir kaydin silinmesinden BAGIMSIZ olarak degerlidir.
  --
  -- Sonucu: bu tabloda CASCADE ZINCIRI YOKTUR. Yorumlar yalnizca tenant
  -- silinirse gider (ki `ON DELETE RESTRICT` onu da engeller).
  -- =========================================================================

  -- Yorumun ILGILI OLDUGU gun/donem. `created_at`ten AYRI: Nisan'da Mart
  -- hakkinda yazilir. TAKVIM GUNU (`date`), an degil — projede besinci kez.
  occurred_on    date        NOT NULL,

  body           text        NOT NULL,

  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT commentaries_body_not_blank CHECK (btrim(body) <> '')
);
--> statement-breakpoint

-- "Son yorumlar" en sik sorgudur; `occurred_on` DONEME gore listeleme icin.
CREATE INDEX commentaries_tenant_created_idx
  ON finance.commentaries (tenant_id, created_at DESC);
--> statement-breakpoint

CREATE INDEX commentaries_tenant_occurred_idx
  ON finance.commentaries (tenant_id, occurred_on DESC);
--> statement-breakpoint

-- ===========================================================================
-- finance.commentary_chunks
-- ===========================================================================
--
-- `tenant_id` DENORMALIZE: RLS politikasi JOIN'siz calissin (`note_chunks`,
-- `interaction_chunks` ve `progress_note_chunks` ile birebir ayni gerekce).
CREATE TABLE finance.commentary_chunks (
  id            uuid         PRIMARY KEY,
  tenant_id     uuid         NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,
  commentary_id uuid         NOT NULL REFERENCES finance.commentaries (id) ON DELETE CASCADE,

  chunk_index   integer      NOT NULL,

  -- =========================================================================
  -- BAGLAM BASLIGI — ve BU MODULDE BAYATLAMA YUZEYI YOK
  -- =========================================================================
  -- Her parca gomulmeden once bir baslik alir:
  --     [Finansal yorum · 2026-03-31] <parca metni>
  --
  -- ⚠️ `0018`/`0022`DEN ONEMLI BIR FARK: baslikta DENORMALIZE EDILMIS BIR AD
  -- YOKTUR. Orada sirket/proje adi kopyalaniyordu ve yeniden adlandirma
  -- parcalari BAYATLATIYORDU (`reindex`in ikinci isi buydu). Burada baslik
  -- yalnizca SABIT bir etiket ve kaydin KENDI tarihidir; ikisi de degismez.
  --
  -- Sonucu: bu moduldeki `reindex` YALNIZCA eksik parcalari onarir, bayat ad
  -- tazelemez — cunku bayatlayacak ad yoktur.
  --
  -- Sabit etiket bosuna degil: model parcanin NEREDEN geldigini metinden
  -- anlar ve bir gider kalemiyle bir donem yorumunu karistirmaz.
  -- =========================================================================
  content       text         NOT NULL,

  -- ADR-0029: `text-embedding-3-small` cikti boyutu 1536. Model degisirse
  -- kolon ve TUM vektorler yeniden uretilir.
  embedding     vector(1536) NOT NULL,

  created_at    timestamptz  NOT NULL DEFAULT now(),

  -- Yeniden uretimi IDEMPOTENT kilar — ilk gunden (`0011`'in dersi, dorduncu
  -- kez).
  CONSTRAINT commentary_chunks_unique_index UNIQUE (commentary_id, chunk_index),
  CONSTRAINT commentary_chunks_index_positive CHECK (chunk_index >= 0),
  CONSTRAINT commentary_chunks_content_not_blank CHECK (btrim(content) <> '')
);
--> statement-breakpoint

CREATE INDEX commentary_chunks_tenant_idx ON finance.commentary_chunks (tenant_id);
--> statement-breakpoint

-- HNSW, IVFFlat DEGIL (ADR-0029 §1). Operator `vector_cosine_ops` — sorgudaki
-- `<=>` ile eslesmezse index DEVRE DISI kalir ve sorgu tam tarama yapar.
CREATE INDEX commentary_chunks_embedding_idx
  ON finance.commentary_chunks USING hnsw (embedding vector_cosine_ops);
--> statement-breakpoint

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2). SAPMA YOK.
-- ===========================================================================
ALTER TABLE finance.commentaries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE finance.commentaries FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON finance.commentaries
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

ALTER TABLE finance.commentary_chunks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE finance.commentary_chunks FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON finance.commentary_chunks
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON finance.commentaries TO businessos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON finance.commentary_chunks TO businessos_app;
  END IF;
END
$$;
