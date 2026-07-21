-- 0002_outbox — transactional outbox tablosu
--
-- ADR-0006 ve ARCHITECTURE 7.1: bir domain event, onu doguran veri
-- degisikligiyle AYNI TRANSACTION'da kaydedilir. Aksi halde DB commit olur,
-- surec coker ve event HIC yayinlanmaz — sistem kalici olarak tutarsiz kalir.
--
-- DEVELOPMENT_RULES 6: elle yazildi, geri alinabilir.

CREATE TABLE platform.outbox (
  -- Event'in kendi kimligi. Ayni event'in iki kez YAZILMASI bir hatadir ve
  -- birincil anahtar bunu engeller. (Handler tarafindaki at-least-once
  -- idempotency'si ayri bir konudur; bu kisit URETIM tarafini korur.)
  id              uuid        PRIMARY KEY,

  -- NOT NULL — bilincli. MULTI_TENANT_ARCHITECTURE 15.1 Identity
  -- event'lerinin tenant'siz olabilecegini soyler, ama asagidaki RLS
  -- politikasi ile NULL satir yazilamaz ve politikayi gevsetmek herkesin
  -- tenant'siz satir yazabilmesi demektir. Identity modulu geldiginde ayri
  -- karar verilecek.
  tenant_id       uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  event_type      text        NOT NULL,
  event_version   integer     NOT NULL,
  payload         jsonb       NOT NULL,
  correlation_id  text        NOT NULL,

  occurred_at     timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Publisher doldurur. NULL = henuz yayinlanmadi.
  published_at    timestamptz,

  CONSTRAINT outbox_event_version_check CHECK (event_version >= 1),
  CONSTRAINT outbox_event_type_not_blank CHECK (length(btrim(event_type)) > 0)
);
--> statement-breakpoint

-- Kuyruk taramasi YALNIZCA bekleyen satirlara bakar. Kismi index, yayinlanmis
-- satirlar biriktikce index'in buyumesini engeller — outbox zamanla en buyuk
-- tablolardan biri olur ve tam index bellekte tutulamaz hale gelir.
--
-- Siralama occurred_at uzerinden: publisher event'leri olusma sirasina gore
-- teslim etmelidir.
CREATE INDEX outbox_pending_idx
  ON platform.outbox (occurred_at)
  WHERE published_at IS NULL;
--> statement-breakpoint
CREATE INDEX outbox_tenant_id_idx ON platform.outbox (tenant_id);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- RLS — STANDART SABLON (12.2), sapma yok
--
-- Yazma tarafi bu politika altinda sorunsuz calisir: event, use case'in tenant
-- transaction'i icinde yazilir ve context zaten kurulmustur.
--
-- OKUMA TARAFI (publisher sureci) HENUZ YOK. Publisher tenant'lar arasi okumak
-- zorundadir ve FORCE RLS ile bu imkansizdir; cozum, resolve_tenant ile ayni
-- desen olacaktir: SECURITY DEFINER bir claim fonksiyonu (FOR UPDATE SKIP
-- LOCKED). Ucuncu bir veritabani rolu EKLENMEYECEKTIR — bkz. 12.4.
--
-- Bugun eklenmedi cunku tuketen bir surec yok; test edilemeyecek bir asim
-- yuzeyi acmak, acmamaktan kotudur.
-- ---------------------------------------------------------------------------
ALTER TABLE platform.outbox ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform.outbox FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON platform.outbox
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON platform.outbox TO businessos_app;
  END IF;
END
$$;
