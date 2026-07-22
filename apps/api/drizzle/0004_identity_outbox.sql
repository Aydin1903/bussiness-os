-- 0004_identity_outbox — tenant'siz Identity event akisi (Ç4, AUTH_ARCHITECTURE 15.1)
--
-- DEVELOPMENT_RULES 6: elle yazildi, geri alinabilir.
--
-- ===========================================================================
-- NEDEN AYRI TABLO, NEDEN RLS YOK
-- ===========================================================================
-- Identity event'leri (UserRegistered, UserLoggedIn) tanimi geregi TENANT'SIZDIR.
-- platform.outbox `tenant_id NOT NULL` tasir ve standart RLS'e tabidir; onu
-- gevsetmek herkesin tenant'siz satir yazabilmesi demekti. Bu yuzden AYRI tablo,
-- `tenant_id` kolonu YOK.
--
-- TENANT RLS YOK (MT §12.4.3 istisnasi): tenant'siz oldugu icin scope edilemez.
-- Diger Identity tablolariyla ayni SIKI erisim: yalnizca Identity modulunun
-- publisher/repository'si dokunur, LISTELEME METODU yazilmaz. Korumanin kaynagi
-- RLS degil, uygulama seviyesi modul izolasyonudur.
-- ===========================================================================

CREATE TABLE platform.identity_outbox (
  id             uuid        PRIMARY KEY,
  event_type     text        NOT NULL,
  event_version  integer     NOT NULL,
  payload        jsonb       NOT NULL,
  correlation_id text        NOT NULL,
  occurred_at    timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  -- Publisher doldurur. NULL = henuz yayinlanmadi.
  published_at   timestamptz,

  CONSTRAINT identity_outbox_event_version_check CHECK (event_version >= 1),
  CONSTRAINT identity_outbox_event_type_not_blank CHECK (length(btrim(event_type)) > 0)
);
--> statement-breakpoint

-- Kuyruk taramasi YALNIZCA bekleyen satirlara bakar; kismi index yayinlanmis
-- satirlar biriktikce buyumeyi onler. Siralama occurred_at uzerinden.
CREATE INDEX identity_outbox_pending_idx
  ON platform.identity_outbox (occurred_at)
  WHERE published_at IS NULL;
--> statement-breakpoint

-- Grant'lar: yazim (publish -> INSERT) bugun; SELECT/UPDATE/DELETE gelecek
-- tuketici surecine (yayinlama). DDL ASLA verilmez (ARCHITECTURE 3.3).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON platform.identity_outbox TO businessos_app;
  END IF;
END
$$;
