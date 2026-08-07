-- ===========================================================================
-- crm.interactions + crm.interaction_chunks (ADR-0031 §1, §4)
-- ===========================================================================
--
-- CRM'in AI'a ILK KEZ dokundugu migration. Desen ADR-0029'un
-- `notes`/`note_chunks`'inin AYNISIDIR — ama veri CRM'in KENDI semasindadir.
--
-- ===========================================================================
-- NEDEN `knowledge.notes`'a YAZILMADI
-- ===========================================================================
-- Mutlak Kural 6 acisindan yasaldi (public interface uzerinden). Yine de
-- secilmedi: cross-schema FK yasak oldugu icin SILME CASCADE'I YAZILAMAZDI ve
-- silinen bir musteri AI'in hafizasinda YASAMAYA DEVAM EDERDI.
--
-- Bu migration o gerekcenin somut karsiligidir: zincir artik
--   companies -> interactions -> interaction_chunks
-- ve ucu de tek bir DELETE ile gider.
-- ===========================================================================

CREATE TABLE crm.interactions (
  id             uuid        PRIMARY KEY,
  tenant_id      uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- Her gorusme BIR SIRKETE aittir (ADR-0031 §1.1 dogal hiyerarsi).
  company_id     uuid        NOT NULL REFERENCES crm.companies (id) ON DELETE CASCADE,

  -- Kisi ve firsat OPSIYONEL daraltmalardir; silinince gorusme OLMEZ.
  -- Gorusme bir KAYITTIR: kisiyi silmek gecmisi silmemelidir.
  contact_id     uuid        REFERENCES crm.contacts (id) ON DELETE SET NULL,
  opportunity_id uuid        REFERENCES crm.opportunities (id) ON DELETE SET NULL,

  author_user_id uuid        NOT NULL,

  -- Gorusmenin GERCEKLESTIGI gun — kayda gecirildigi an degil. Bir toplanti
  -- gunler sonra yazilabilir. `date`: takvim gunu, an degil (§3 ile ayni ilke).
  occurred_on    date        NOT NULL,

  body           text        NOT NULL,

  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT interactions_body_not_blank CHECK (btrim(body) <> '')
);
--> statement-breakpoint

CREATE INDEX interactions_tenant_occurred_idx
  ON crm.interactions (tenant_id, occurred_on DESC);
--> statement-breakpoint

-- "Bu sirketle tum gecmisimiz" en sik sorgudur.
CREATE INDEX interactions_tenant_company_idx ON crm.interactions (tenant_id, company_id);
--> statement-breakpoint

-- ===========================================================================
-- crm.interaction_chunks
-- ===========================================================================
--
-- `tenant_id` DENORMALIZE: RLS politikasi JOIN'siz calissin (`note_chunks`
-- ile birebir ayni gerekce).
CREATE TABLE crm.interaction_chunks (
  id             uuid         PRIMARY KEY,
  tenant_id      uuid         NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,
  interaction_id uuid         NOT NULL REFERENCES crm.interactions (id) ON DELETE CASCADE,

  chunk_index    integer      NOT NULL,

  -- =========================================================================
  -- ICERIK BAGLAM BASLIGI TASIR — Knowledge'dan BILINCLI SAPMA
  -- =========================================================================
  -- Knowledge yalnizca `note.body`'yi gomer. CRM'de bu KIRILIR: bir gorusmenin
  -- KIMLIGI (hangi sirket) FK kolonundadir, metinde degil. Satis temsilcisi
  -- "Toplanti iyi gecti, butce onaylandi" yazar — "Acme" kelimesi hic gecmez
  -- ve "Acme ile ne konustuk?" sorusu HICBIR chunk'la eslesmez.
  --
  -- Bu yuzden her parca, gomulmeden ONCE bir baslik alir:
  --     [Acme Tekstil · 2026-08-12] <parca metni>
  --
  -- BEDELI DURUSTCE: sirket adi DENORMALIZEDIR. Sirket yeniden
  -- adlandirilirsa eski parcalar eski adi tasir — ta ki `POST /crm/reindex`
  -- calisana kadar. O uc ILK GUNDEN vardir (Knowledge'da sonradan gelmisti);
  -- bu sapmanin telafisi tam olarak odur.
  -- =========================================================================
  content        text         NOT NULL,

  -- ADR-0029: `text-embedding-3-small` cikti boyutu 1536 (canli olcumle
  -- dogrulandi). Model degisirse kolon ve TUM vektorler yeniden uretilir.
  embedding      vector(1536) NOT NULL,

  created_at     timestamptz  NOT NULL DEFAULT now(),

  -- Yeniden uretimi IDEMPOTENT kilar. ADR-0029 bunu migration `0011`'de
  -- SONRADAN ogrendi; burada ilk gunden var.
  CONSTRAINT interaction_chunks_unique_index UNIQUE (interaction_id, chunk_index),
  CONSTRAINT interaction_chunks_index_positive CHECK (chunk_index >= 0),
  CONSTRAINT interaction_chunks_content_not_blank CHECK (btrim(content) <> '')
);
--> statement-breakpoint

CREATE INDEX interaction_chunks_tenant_idx ON crm.interaction_chunks (tenant_id);
--> statement-breakpoint

-- HNSW, IVFFlat DEGIL (ADR-0029 §1): veri buyudukce sorgu performansi daha
-- YUMUSAK bozunur. Operator `vector_cosine_ops` — sorgudaki `<=>` ile
-- eslesmezse index DEVRE DISI kalir ve sorgu tam tarama yapar.
CREATE INDEX interaction_chunks_embedding_idx
  ON crm.interaction_chunks USING hnsw (embedding vector_cosine_ops);
--> statement-breakpoint

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2). SAPMA YOK.
-- ===========================================================================
ALTER TABLE crm.interactions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE crm.interactions FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON crm.interactions
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

ALTER TABLE crm.interaction_chunks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE crm.interaction_chunks FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON crm.interaction_chunks
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON crm.interactions TO businessos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON crm.interaction_chunks TO businessos_app;
  END IF;
END
$$;
