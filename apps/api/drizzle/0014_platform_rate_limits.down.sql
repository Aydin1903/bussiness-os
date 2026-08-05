-- 0014_platform_rate_limits — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- ⚠️ SAYAC VERISI GERI GELMEZ — ve gelmesi de gerekmez. Ileri yonde veri
-- tasinmadi (FORCE RLS + NOBYPASSRLS engeli, bkz. `0014_platform_rate_limits.sql`);
-- geri donuste de tasinmaz. Kaybedilen sey en fazla icinde bulunulan saatin
-- sayaclaridir ve gecmis pencereler tanimi geregi zaten oludur.
--
-- DIKKAT: bu geri alma, `knowledge.rate_limits`'i 0013'teki haliyle YENIDEN
-- KURAR — numaralandiran CHECK kisiti DAHIL. Yani geri alindiktan sonra
-- yalnizca 'ask' ve 'create_note' kabul edilir; baska bir modulun eylemi
-- (ornegin CRM'in `create_interaction`'i) REDDEDILIR. Bu bilinclidir: 0013'e
-- donmek, o gunun sozlesmesine donmektir.
--
-- Uygulama kodu `platform.rate_limits`'i bekliyorsa once o geri alinmalidir;
-- aksi halde her istek T0'da hata verir (fail closed — sessizce sinirsiz
-- calismaz).

CREATE TABLE IF NOT EXISTS knowledge.rate_limits (
  tenant_id     uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,
  user_id       uuid        NOT NULL,
  action        text        NOT NULL,
  window_start  timestamptz NOT NULL,
  request_count integer     NOT NULL DEFAULT 0,

  CONSTRAINT rate_limits_action_valid CHECK (action IN ('ask', 'create_note')),
  CONSTRAINT rate_limits_count_positive CHECK (request_count >= 0),

  PRIMARY KEY (tenant_id, user_id, action, window_start)
);
--> statement-breakpoint

ALTER TABLE knowledge.rate_limits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE knowledge.rate_limits FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON knowledge.rate_limits
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge.rate_limits TO businessos_app;
  END IF;
END
$$;
--> statement-breakpoint

DROP TABLE IF EXISTS platform.rate_limits;
