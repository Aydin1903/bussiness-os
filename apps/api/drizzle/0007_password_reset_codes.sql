-- 0007_password_reset_codes — parola sifirlama kodlari (ADR-0024)
--
-- DEVELOPMENT_RULES 6: elle yazildi, geri alinabilir.
--
-- ===========================================================================
-- NEDEN AYRI TABLO — email_verification_codes ile ayni desen, DAHA SIKI
-- ===========================================================================
-- Sifirlama kodu bir hesabi ELE GECIRMEYE yeter; dogrulama kodu yalnizca
-- aktive eder (§7.6). Tehdit modeli farkli oldugu icin parametreler daha
-- sikidir: 10 dk omur (15 degil) ve 3 yanlis deneme (5 degil). Iki akisi ayni
-- tabloda tutmak, birinin sinirini digerine sizdirir; bu yuzden AYRI tablo.
--
-- HMAC + pepper saklama email_verification_codes ile AYNIDIR (ADR-0024):
-- ham kod saklanmaz, yalnizca digest.
-- ===========================================================================

CREATE TABLE platform.password_reset_codes (
  id            uuid        PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES platform.users (id) ON DELETE CASCADE,
  code_hash     text        NOT NULL,
  attempt_count integer     NOT NULL DEFAULT 0,
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz,

  -- 3. yanlis denemede kod gecersizlesir (§7.6). Sayac bu araligin disina cikamaz.
  CONSTRAINT password_reset_codes_attempt_count_check
    CHECK (attempt_count >= 0 AND attempt_count <= 3)
);
--> statement-breakpoint

CREATE INDEX password_reset_codes_user_id_idx
  ON platform.password_reset_codes (user_id);
--> statement-breakpoint

-- Grant'lar: DDL ASLA verilmez (ARCHITECTURE 3.3). email_verification_codes ile
-- ayni erisim seti — dogrulama/consume/supersede icin UPDATE gerekir.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON platform.password_reset_codes TO businessos_app;
  END IF;
END
$$;
