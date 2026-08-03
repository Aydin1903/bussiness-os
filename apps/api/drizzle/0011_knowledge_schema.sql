-- 0011_knowledge_schema — Knowledge modulu semasi (ADR-0029, ADR-0030)
--
-- DEVELOPMENT_RULES 6: elle yazildi, geri alinabilir.
--
-- ===========================================================================
-- PROJENIN ILK IS MODULU
-- ===========================================================================
-- Faz 1-3 platform cekirdegiydi (tenant, identity, authz). Bu, `platform`
-- disinda acilan ILK semadir ve ARCHITECTURE 6.1'in "her modul kendi
-- PostgreSQL semasina sahiptir" kuralinin ilk uygulamasidir.
--
-- Dort tablo iki ADR'den gelir:
--   ADR-0029: `notes` + `note_chunks` (AI Context Engine v1)
--   ADR-0030: `conversations` + `messages` (konusma hafizasi)
-- `daily_report_runs` AYRI migration'dadir (0012) cunku beraberinde bir RLS
-- asim yuzeyi getirir; veri ile asim ayri dosyalarda tutulur (0009/0010 ile
-- ayni bolme mantigi).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- pgvector — ADR-0029'un `vector(1536)` kolonu ve HNSW index'i icin
--
-- Bu satir, `docker-compose.yml` ve `test-database.ts`'in `pgvector/pgvector:pg17`
-- imajini kullanmasini ZORUNLU kilar. Resmi `postgres` imajinda eklenti YOKTUR
-- ve burasi "extension vector is not available" ile coker — sessizce degil,
-- gurultuyle: migration hatti tumuyle durur.
--
-- Extension `public` semasina kurulur (varsayilan): tip (`vector`) semadan
-- bagimsiz olarak her yerden gorunur olmalidir.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint

CREATE SCHEMA IF NOT EXISTS knowledge;
--> statement-breakpoint

-- Uygulama rolu semayi GORUR; tablo yetkileri asagida tek tek verilir.
-- `CREATE` VERILMEZ: DDL yalnizca migration'lara aittir (ARCHITECTURE 3.3).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT USAGE ON SCHEMA knowledge TO businessos_app;
  END IF;
END
$$;
--> statement-breakpoint

-- ===========================================================================
-- knowledge.notes — kurumsal hafizanin atomu (ADR-0029 §1)
-- ===========================================================================
CREATE TABLE knowledge.notes (
  id              uuid        PRIMARY KEY,

  -- Tenant sahipligi. `platform.tenants`'a FK — bu bir MODUL ARASI FK DEGILDIR
  -- (Mutlak Kural 5): tenant, modullerin ustunde yasayan platform kavramidir ve
  -- `platform.outbox` ayni FK'yi tasir. ON DELETE RESTRICT: tenant silinmeden
  -- once verisi bilincli olarak ele alinmali.
  tenant_id       uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- Notu yazan kullanici. `platform.users`'a FK YOKTUR: Identity tablolari
  -- tenant'siz ve ayri bir modulun icidir (MT §12.4.3, Mutlak Kural 5).
  -- Deger dogrulanmis token'dan gelir; butunluk uygulama katmanindadir.
  author_user_id  uuid        NOT NULL,

  -- Baslik OPSIYONEL (ADR-0029): kullanici hizlica bir dusunce birakabilmeli.
  title           text,
  body            text        NOT NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notes_body_not_blank CHECK (length(btrim(body)) > 0),
  -- Baslik varsa bos olamaz: `NULL` ile `''` arasindaki farki korur.
  CONSTRAINT notes_title_not_blank CHECK (title IS NULL OR length(btrim(title)) > 0),
  CONSTRAINT notes_updated_after_created CHECK (updated_at >= created_at)
);
--> statement-breakpoint

-- Gunluk rapor "son 24 saatte eklenen notlar" sorar (ADR-0030 §2.2); tenant
-- icinde zaman araligi taramasi bu index uzerinden gider.
CREATE INDEX notes_tenant_created_idx ON knowledge.notes (tenant_id, created_at);
--> statement-breakpoint

-- ===========================================================================
-- knowledge.note_chunks — embedding'in yasadigi yer (ADR-0029 §1)
--
-- NEDEN AYRI TABLO: embedding'in yasam dongusu note'unkinden BAGIMSIZDIR.
-- Model veya saglayici degisince tum chunk'lar yeniden uretilir, `notes`
-- degismez. Ayni ayrim port sinirinda da uygulandi (ADR-0030 §1.3).
-- ===========================================================================
CREATE TABLE knowledge.note_chunks (
  id           uuid        PRIMARY KEY,

  -- DENORMALIZE: RLS politikasi `notes` ile JOIN yapmadan calisabilsin.
  -- Politika her satirda degerlendirilir; JOIN gerektiren bir politika hem
  -- yavas hem de kirilgan olurdu.
  tenant_id    uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- Not silinince chunk'lari da gider: chunk tek basina anlamsizdir.
  note_id      uuid        NOT NULL REFERENCES knowledge.notes (id) ON DELETE CASCADE,

  chunk_index  integer     NOT NULL,
  content      text        NOT NULL,

  -- 1536 = `text-embedding-3-small` cikti boyutu; canli API testiyle
  -- DOGRULANDI (ADR-0029 "Not — canli API dogrulamasi"). Model degisirse bu
  -- kolon ve TUM satirlar yeniden uretilir.
  embedding    vector(1536) NOT NULL,

  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT note_chunks_index_non_negative CHECK (chunk_index >= 0),
  CONSTRAINT note_chunks_content_not_blank CHECK (length(btrim(content)) > 0),
  -- Ayni not icinde ayni sira iki kez olamaz; yeniden uretim idempotent olsun.
  CONSTRAINT note_chunks_note_index_unique UNIQUE (note_id, chunk_index)
);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- HNSW index — ADR-0029 §1 (IVFFlat DEGIL)
--
-- Gerekce (ADR): veri buyudukce sorgu performansi daha YUMUSAK bozunur; urun
-- yuz binlerce kullanici hedefliyor. IVFFlat ayrica anlamli bir liste sayisi
-- icin ONCEDEN veri ister — bos bir tabloda kurulamaz.
--
-- `vector_cosine_ops`: OpenAI embedding'leri normalize edilmis vektorlerdir ve
-- kosinus benzerligi bu ailenin standart olcusudur.
--
-- DIKKAT: index tenant'a gore BOLUNMEZ. Benzerlik aramasi RLS politikasinin
-- filtresi ALTINDA calisir; index tum tenant'lari kapsar ama sorgu yalnizca
-- kendi tenant'inin satirlarini gorur.
-- ---------------------------------------------------------------------------
CREATE INDEX note_chunks_embedding_idx
  ON knowledge.note_chunks USING hnsw (embedding vector_cosine_ops);
--> statement-breakpoint

CREATE INDEX note_chunks_note_id_idx ON knowledge.note_chunks (note_id);
--> statement-breakpoint

-- ===========================================================================
-- knowledge.conversations — konusma hafizasi (ADR-0030 §1.1)
-- ===========================================================================
CREATE TABLE knowledge.conversations (
  id          uuid        PRIMARY KEY,
  tenant_id   uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- Konusma KULLANICIYA aittir (tenant'a degil): ayni tenant'taki iki kullanici
  -- birbirinin konusmasini gormemelidir. Bu kisit RLS'in USTUNDE, uygulama
  -- katmaninda uygulanir — RLS tenant sinirini korur, kullanici sinirini degil.
  user_id     uuid        NOT NULL,

  created_at  timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX conversations_tenant_user_idx
  ON knowledge.conversations (tenant_id, user_id, created_at);
--> statement-breakpoint

-- ===========================================================================
-- knowledge.messages — konusmanin turleri (ADR-0030 §1.1)
-- ===========================================================================
CREATE TABLE knowledge.messages (
  id               uuid        PRIMARY KEY,

  -- DENORMALIZE — `note_chunks.tenant_id` ile AYNI gerekce.
  tenant_id        uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  conversation_id  uuid        NOT NULL REFERENCES knowledge.conversations (id) ON DELETE CASCADE,

  -- `user` | `assistant` — ADR-0030 §1.3'teki `history` parametresinin tasidigi
  -- iki rol. `system` YOK: sistem promptu adapter'da uretilir, saklanmaz.
  role             text        NOT NULL,
  content          text        NOT NULL,

  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT messages_role_valid CHECK (role IN ('user', 'assistant')),
  CONSTRAINT messages_content_not_blank CHECK (length(btrim(content)) > 0)
);
--> statement-breakpoint

-- "Son N mesaj cifti" sorgusu (ADR-0030 §1.2) bu index uzerinden gider.
CREATE INDEX messages_conversation_created_idx
  ON knowledge.messages (conversation_id, created_at);
--> statement-breakpoint

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2), dort tabloda da SAPMA YOK
--
-- `platform.outbox` ile BIREBIR ayni: ENABLE + FORCE + USING + WITH CHECK.
-- `current_setting`'de `missing_ok` KULLANILMAZ: context kurulmamissa sorgu
-- SESSIZCE BOS DONMEZ, HATA VERIR (MT §12.6 madde 4). Sessiz bos sonuc, hatayi
-- uretimde aylarca gizler.
--
-- FORCE: tablo sahibi icin de uygulanir. `platform.tenants`'taki istisna
-- (FORCE yok) yalnizca `resolve_tenant` icindir ve buraya GENISLETILMEZ.
-- ===========================================================================
ALTER TABLE knowledge.notes            ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE knowledge.notes            FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE knowledge.note_chunks      ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE knowledge.note_chunks      FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE knowledge.conversations    ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE knowledge.conversations    FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE knowledge.messages         ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE knowledge.messages         FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON knowledge.notes
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

CREATE POLICY tenant_isolation ON knowledge.note_chunks
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

CREATE POLICY tenant_isolation ON knowledge.conversations
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

CREATE POLICY tenant_isolation ON knowledge.messages
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge.notes         TO businessos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge.note_chunks   TO businessos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge.conversations TO businessos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge.messages      TO businessos_app;
  END IF;
END
$$;
