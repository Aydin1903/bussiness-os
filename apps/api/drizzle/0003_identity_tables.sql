-- 0003_identity_tables — Identity tablolari (Faz 3)
--
-- DEVELOPMENT_RULES 6: migration'lar ELLE yazilir, review edilir, geri
-- alinabilir. RLS/CHECK/grant sema tanimindan uretilemez.
--
-- ===========================================================================
-- RLS DURUMU — DIKKATLE OKUYUN
-- ===========================================================================
-- Bu migration'daki HICBIR tabloda ROW LEVEL SECURITY YOKTUR. Bu bir unutma
-- DEGIL, bilincli bir karardir (MULTI_TENANT_ARCHITECTURE 12.4 istisna listesi,
-- 12.4.3 Identity tablolari):
--
--   Kimlik, tenant'larin USTUNDE yasar (ADR-0014). Login/kayit/dogrulama, tenant
--   context'i KURULMADAN ONCE calisir — context'i kuracak olan sorgu context'e
--   dayanamaz. Standart `tenant_id = current_setting(...)` politikasi burada
--   uygulanamaz cunku bu tablolarin tenant_id'si YOKTUR.
--
-- Korumanin kaynagi RLS degil, UYGULAMA seviyesi telafi kontrolleridir:
--   * Yalnizca Identity modulunun repository'si bu tablolara dokunur (6.1).
--   * `users` uzerinde LISTELEME METODU yazilmaz — yalnizca findByEmail/findById.
--   * Hicbir yanit hesabin varligini sizdirmaz (kayit/giris/dogrulama ayni doner).
--   * Parola hash'i, kod hash'i, token hash'i hicbir DTO/event/log'a girmez.
--
-- Tenant ici kullanici listeleme AYRI bir yoldur: `memberships` (RLS korumali)
-- uzerinden JOIN — o zaman RLS memberships'i tenant'a daraltir ve JOIN yalnizca
-- o tenant'in uyelerini getirir (12.4.3).
-- ===========================================================================

-- ===========================================================================
-- platform.users
-- ===========================================================================
CREATE TABLE platform.users (
  id             uuid        PRIMARY KEY,
  email          text        NOT NULL,
  email_verified boolean     NOT NULL,
  status         text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT users_status_check
    CHECK (status IN ('pending', 'active', 'locked', 'deactivated')),

  -- Domain'deki tutarlilik invariant'inin (user.entity.ts) veritabani karsiligi:
  --   pending          -> email_verified = false (henuz dogrulanmadi)
  --   active | locked   -> email_verified = true  (yalnizca dogrulama ile ulasilir)
  --   deactivated       -> ikisi de gecerli (dogrulanmadan kapatilmis olabilir)
  CONSTRAINT users_status_email_verified_consistency CHECK (
    (status = 'pending'            AND email_verified = false) OR
    (status IN ('active', 'locked') AND email_verified = true)  OR
    (status = 'deactivated')
  )
);
--> statement-breakpoint

-- Tekilligin gercek garantisi (AUTH_ARCHITECTURE 8.1): normalize e-posta global tekil.
CREATE UNIQUE INDEX users_email_key ON platform.users (email);
--> statement-breakpoint

-- ===========================================================================
-- platform.credentials — users ile 1:1
-- ===========================================================================
CREATE TABLE platform.credentials (
  user_id             uuid        PRIMARY KEY REFERENCES platform.users (id) ON DELETE CASCADE,
  password_hash       text        NOT NULL,
  password_changed_at timestamptz NOT NULL
);
--> statement-breakpoint

-- ===========================================================================
-- platform.email_verification_codes
-- ===========================================================================
CREATE TABLE platform.email_verification_codes (
  id            uuid        PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES platform.users (id) ON DELETE CASCADE,
  code_hash     text        NOT NULL,
  attempt_count integer     NOT NULL DEFAULT 0,
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz,

  -- 5. yanlis denemede kod gecersizlesir (§7.3). Sayac bu araligin disina cikamaz.
  CONSTRAINT email_verification_codes_attempt_count_check
    CHECK (attempt_count >= 0 AND attempt_count <= 5)
);
--> statement-breakpoint
CREATE INDEX email_verification_codes_user_id_idx
  ON platform.email_verification_codes (user_id);
--> statement-breakpoint

-- ===========================================================================
-- platform.token_families
-- ===========================================================================
CREATE TABLE platform.token_families (
  id             uuid        PRIMARY KEY,
  user_id        uuid        NOT NULL REFERENCES platform.users (id) ON DELETE CASCADE,
  revoked_reason text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz,

  CONSTRAINT token_families_revoked_reason_check CHECK (
    revoked_reason IS NULL OR revoked_reason IN (
      'logout', 'logout-all', 'token-reuse-detected', 'password-changed',
      'user-deactivated', 'user-locked', 'member-removed', 'member-suspended',
      'tenant-suspended', 'tenant-archived'
    )
  ),

  -- Domain'deki tutarlilik invariant'i: iptal nedeni ile iptal zamani ya
  -- birlikte var ya da birlikte yok.
  CONSTRAINT token_families_revocation_consistency
    CHECK ((revoked_reason IS NULL) = (revoked_at IS NULL)),

  CONSTRAINT token_families_revoked_at_after_created
    CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
--> statement-breakpoint
CREATE INDEX token_families_user_id_idx ON platform.token_families (user_id);
--> statement-breakpoint

-- ===========================================================================
-- platform.refresh_tokens
-- ===========================================================================
CREATE TABLE platform.refresh_tokens (
  id         uuid        PRIMARY KEY,
  family_id  uuid        NOT NULL REFERENCES platform.token_families (id) ON DELETE CASCADE,
  token_hash text        NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
--> statement-breakpoint

-- Lookup hash ile yapilir; tekillik ≤1 satir dondurur ve cakismayi onler.
CREATE UNIQUE INDEX refresh_tokens_token_hash_key ON platform.refresh_tokens (token_hash);
--> statement-breakpoint
CREATE INDEX refresh_tokens_family_id_idx ON platform.refresh_tokens (family_id);
--> statement-breakpoint

-- ===========================================================================
-- platform.login_attempts — FK YOK (e-posta var olmayan hesaba ait olabilir)
-- ===========================================================================
CREATE TABLE platform.login_attempts (
  id               uuid        PRIMARY KEY,
  email_normalized text        NOT NULL,
  ip_address       text        NOT NULL,
  succeeded        boolean     NOT NULL,
  attempted_at     timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Katman index'leri KISMIDIR: sayaclar yalnizca BASARISIZ denemeleri sayar
-- (ADR-0022), bu yuzden index yalnizca onlari tutar. Bu, hem sorgulari hizlandirir
-- hem de basarili girislerin index'i sismesini onler.
CREATE INDEX login_attempts_email_ip_idx
  ON platform.login_attempts (email_normalized, ip_address, attempted_at)
  WHERE succeeded = false;
--> statement-breakpoint
CREATE INDEX login_attempts_email_idx
  ON platform.login_attempts (email_normalized, attempted_at)
  WHERE succeeded = false;
--> statement-breakpoint
CREATE INDEX login_attempts_ip_idx
  ON platform.login_attempts (ip_address, attempted_at)
  WHERE succeeded = false;
--> statement-breakpoint

-- ===========================================================================
-- Uygulama rolune yetkiler (ARCHITECTURE 3.3: DDL ASLA verilmez)
--
-- login_attempts DEGISMEZDIR: UPDATE verilmez. DELETE yalnizca saklama suresi
-- temizligi icindir (§13.3). Diger tablolar dogrulama/rehash/consume/revoke
-- gibi mesru UPDATE'lere ihtiyac duyar.
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON platform.users                     TO businessos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON platform.credentials               TO businessos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON platform.email_verification_codes  TO businessos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON platform.token_families            TO businessos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON platform.refresh_tokens            TO businessos_app;
    GRANT SELECT, INSERT, DELETE         ON platform.login_attempts            TO businessos_app;
  END IF;
END
$$;
