-- 0012_daily_report_runs — gunluk rapor kuyrugu + BESINCI dar rol (ADR-0030 §2)
--
-- DEVELOPMENT_RULES 6: elle yazildi, geri alinabilir.
--
-- ===========================================================================
-- NEDEN 0011'DEN AYRI
-- ===========================================================================
-- 0011 saf tenant-scoped VERIDIR. Bu migration beraberinde bir RLS ASIM
-- YUZEYI getiriyor (yeni BYPASSRLS rolu + SECURITY DEFINER fonksiyonlar).
-- Veri ile asimi ayri dosyalarda tutmak, 0009 (kolonlar) / 0010 (fonksiyonlar)
-- bolmesiyle ayni disiplindir: asim yuzeyi tek basina okunabilir ve tek basina
-- geri alinabilir olmalidir.
-- ===========================================================================

-- ===========================================================================
-- knowledge.daily_report_runs
--
-- Hem KUYRUK hem SONUC tablosudur: bekleyen is de, uretilmis rapor da ayni
-- satirdir. Ayri bir `notifications` tablosu KURULMAZ (ADR-0030 §2.2) —
-- bugun tek bildirim turu var, genel bir bildirim altyapisi erken soyutlama
-- olurdu.
--
-- SATIRLARI KIM YARATIR: use case, o gun ILK NOT eklendiginde upsert eder
-- ("tembel seed", ADR-0030 §2 / Product Owner karari). Zamanlayici tenant
-- LISTESI ARAMAZ — bu yuzden asagidaki dar rol GERCEKTEN tek tabloya yetkili
-- kalabiliyor. Yan fayda: hic not eklenmemis tenant icin satir hic olusmaz,
-- yani bos rapor uretilmez.
-- ===========================================================================
CREATE TABLE knowledge.daily_report_runs (
  id                uuid        PRIMARY KEY,

  tenant_id         uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- Raporun AIT OLDUGU gun (UTC). `timestamptz` degil `date`: rapor bir gune
  -- aittir, bir ana degil. Tenant bazli saat dilimi kapsam disi (ADR-0030 §2.3).
  report_date       date        NOT NULL,

  -- AI ozeti. Uretilene kadar NULL.
  summary           text,

  -- Dolu ise rapor URETILDI. `status` kolonu YOKTUR: durum bu iki zaman
  -- alanindan turer (`platform.outbox` ile birebir). Iki dogruluk kaynagi
  -- olsaydi biri digerini yalanlayabilirdi.
  generated_at      timestamptz,

  -- --- Teslimat yeniden deneme (migration 0009 deseni) --------------------
  attempt_count     integer     NOT NULL DEFAULT 0,
  last_error        text,
  next_attempt_at   timestamptz,
  dead_lettered_at  timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),

  -- IDEMPOTENCY ANAHTARI (ADR-0030 §2.1). Ayni tenant + ayni gun icin IKINCI
  -- bir satir olamaz; "tembel seed" upsert'i bu kisita dayanir ve kacirilan
  -- tick / yeniden baslatma / cift instance senaryolarini kendiliginden cozer.
  CONSTRAINT daily_report_runs_tenant_date_unique UNIQUE (tenant_id, report_date),

  CONSTRAINT daily_report_runs_attempt_count_check CHECK (attempt_count >= 0),

  -- Bir kayit ya uretilmistir ya olmustur, IKISI BIRDEN olamaz.
  CONSTRAINT daily_report_runs_terminal_state_check
    CHECK (NOT (generated_at IS NOT NULL AND dead_lettered_at IS NOT NULL)),

  -- Uretilmis bir raporun ozeti olmak ZORUNDA; bos ozetli "basarili" rapor
  -- sessiz bir hatadir.
  CONSTRAINT daily_report_runs_summary_when_generated
    CHECK (generated_at IS NULL OR (summary IS NOT NULL AND length(btrim(summary)) > 0))
);
--> statement-breakpoint

-- Kuyruk taramasi: yalnizca BEKLEYENLER, olu kayitlar elenir. Siralama
-- `next_attempt_at`'e gore — kuyrugun basi "en eski" degil, "yeniden denenmeye
-- en erken hazir olan"dir (0009 ile ayni mantik).
CREATE INDEX daily_report_runs_pending_idx
  ON knowledge.daily_report_runs (next_attempt_at NULLS FIRST, report_date)
  WHERE generated_at IS NULL AND dead_lettered_at IS NULL;
--> statement-breakpoint

CREATE INDEX daily_report_runs_dead_letter_idx
  ON knowledge.daily_report_runs (dead_lettered_at)
  WHERE dead_lettered_at IS NOT NULL;
--> statement-breakpoint

-- Dashboard "en son rapor" sorar (ADR-0030 §2.2).
CREATE INDEX daily_report_runs_tenant_date_idx
  ON knowledge.daily_report_runs (tenant_id, report_date DESC);
--> statement-breakpoint

-- RLS — standart sablon, 0011'deki dort tabloyla AYNI.
ALTER TABLE knowledge.daily_report_runs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE knowledge.daily_report_runs FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON knowledge.daily_report_runs
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge.daily_report_runs TO businessos_app;
  END IF;
END
$$;
--> statement-breakpoint

-- ===========================================================================
-- BESINCI DAR ROL: businessos_report_worker (ADR-0030 §2.4)
--
-- Zamanlayici, hangi tenant'in raporunun bekledigini gormek icin
-- `daily_report_runs`'i TENANT'LAR ARASI okumak zorundadir ve tenant context'i
-- yoktur. `FORCE RLS` altinda `businessos_app` bunu yapamaz — outbox
-- tuketicisiyle (MT §12.4.2) BIREBIR ayni problem sinifi.
--
-- `businessos_outbox_relay` YENIDEN KULLANILMAZ: onun sozlesmesi "yalnizca
-- platform.outbox" der ve bir testle kanitlanir; yetki eklemek o testi ve
-- ADR-0028'in sozlesmesini kirardi.
--
-- ⚠️ ADR-0030 §2.4 KURALI: bu desen bir sonraki ihtiyacta (ALTINCI dar rol)
-- GENELLESTIRILMEK ZORUNDADIR — ertelenemez. Besinci rol bir EGILIMDIR;
-- altincisini "bir kere daha ayni sey" diyerek eklemek o kurali ihlal eder.
--
-- NARROWNESS: rol YALNIZCA `knowledge.daily_report_runs`'a yetkilidir.
-- `notes`, `note_chunks`, `conversations`, `messages`, `platform.*` — hicbirine
-- erisemez. Bu, "tembel seed" karari sayesinde mumkun: worker tenant listesi
-- aramadigi icin `platform.tenants`'a ihtiyaci YOK.
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_report_worker') THEN
    GRANT USAGE ON SCHEMA knowledge TO businessos_report_worker;
    -- SELECT + UPDATE yeter: INSERT "tembel seed" ile app rolunun isidir,
    -- DELETE hicbir zaman gerekmez.
    GRANT SELECT, UPDATE ON knowledge.daily_report_runs TO businessos_report_worker;
    -- Sahiplik atamasi icin GECICI; asagida geri alinir.
    GRANT CREATE ON SCHEMA knowledge TO businessos_report_worker;
  END IF;
END
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- knowledge.claim_daily_report_batch — bekleyen raporlari KILITLEYEREK getirir
--
-- `platform.claim_outbox_batch` (0010) ile birebir simetrik: `FOR UPDATE SKIP
-- LOCKED` — bekleyen degil ATLAYAN kilit; iki instance ayni raporu iki kez
-- uretemez, mesgul satir digerinin turunu bloklamaz.
--
-- `p_today`: rapor gunu gecmis VEYA bugun olan satirlar alinir. Zamanlayicinin
-- sabit UTC saatini gecip gecmedigi karari UYGULAMADADIR — SQL'e gomulmez ki
-- config'ten degistirilebilsin.
-- ---------------------------------------------------------------------------
CREATE FUNCTION knowledge.claim_daily_report_batch(
  p_limit integer,
  p_now   timestamptz,
  p_today date
)
RETURNS TABLE (
  id            uuid,
  tenant_id     uuid,
  report_date   date,
  attempt_count integer
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = knowledge, pg_temp
AS $$
  SELECT r.id, r.tenant_id, r.report_date, r.attempt_count
  FROM knowledge.daily_report_runs r
  WHERE r.generated_at IS NULL
    AND r.dead_lettered_at IS NULL
    AND r.report_date <= p_today
    AND (r.next_attempt_at IS NULL OR r.next_attempt_at <= p_now)
  ORDER BY r.next_attempt_at NULLS FIRST, r.report_date
  LIMIT p_limit
  FOR UPDATE SKIP LOCKED;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- knowledge.mark_daily_report_generated — uretilen raporu isaretler
--
-- `generated_at IS NULL` kosulu idempotency saglar: iki kez isaretlemek ILK
-- ozeti ve zamani EZMEZ (`mark_outbox_published` ile ayni disiplin).
-- ---------------------------------------------------------------------------
CREATE FUNCTION knowledge.mark_daily_report_generated(
  p_id           uuid,
  p_summary      text,
  p_generated_at timestamptz
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = knowledge, pg_temp
AS $$
  UPDATE knowledge.daily_report_runs
  SET summary = p_summary,
      generated_at = p_generated_at,
      -- Basarili uretimden sonra backoff anlamsizdir; temizlenir.
      next_attempt_at = NULL
  WHERE id = p_id
    AND generated_at IS NULL;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- knowledge.record_daily_report_failure — sayac, hata, backoff veya olu mektup
--
-- BASARISIZLIK DA YAZILMAK ZORUNDADIR: yazilmasaydi sayac artmaz, backoff
-- uygulanmaz ve kayit her turda yeniden denenirdi (0010 ile ayni ders).
-- ---------------------------------------------------------------------------
CREATE FUNCTION knowledge.record_daily_report_failure(
  p_id               uuid,
  p_attempt_count    integer,
  p_last_error       text,
  p_next_attempt_at  timestamptz,
  p_dead_lettered_at timestamptz
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = knowledge, pg_temp
AS $$
  UPDATE knowledge.daily_report_runs
  SET attempt_count    = p_attempt_count,
      last_error       = p_last_error,
      next_attempt_at  = p_next_attempt_at,
      dead_lettered_at = p_dead_lettered_at
  WHERE id = p_id;
$$;
--> statement-breakpoint

-- Sahipligi dar role atar (fonksiyonlar artik BYPASSRLS ile FORCE-RLS tabloyu
-- okur/yazar) ve gecici CREATE'i geri alir. Rol yoksa fonksiyonlar migration'i
-- calistirana ait kalir (yalnizca rol-bagimsiz `database.integration` testinde;
-- orada superuser zaten RLS'i asar).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_report_worker') THEN
    ALTER FUNCTION knowledge.claim_daily_report_batch(integer, timestamptz, date)
      OWNER TO businessos_report_worker;
    ALTER FUNCTION knowledge.mark_daily_report_generated(uuid, text, timestamptz)
      OWNER TO businessos_report_worker;
    ALTER FUNCTION knowledge.record_daily_report_failure(uuid, integer, text, timestamptz, timestamptz)
      OWNER TO businessos_report_worker;

    REVOKE CREATE ON SCHEMA knowledge FROM businessos_report_worker;
  END IF;
END
$$;
--> statement-breakpoint

-- Deny by default: once herkesten geri alinir, sonra YALNIZCA uygulama roluna
-- verilir (0001/0008/0010 ile ayni disiplin).
REVOKE ALL ON FUNCTION knowledge.claim_daily_report_batch(integer, timestamptz, date) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION knowledge.mark_daily_report_generated(uuid, text, timestamptz) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION knowledge.record_daily_report_failure(uuid, integer, text, timestamptz, timestamptz) FROM PUBLIC;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT EXECUTE ON FUNCTION knowledge.claim_daily_report_batch(integer, timestamptz, date)
      TO businessos_app;
    GRANT EXECUTE ON FUNCTION knowledge.mark_daily_report_generated(uuid, text, timestamptz)
      TO businessos_app;
    GRANT EXECUTE ON FUNCTION knowledge.record_daily_report_failure(uuid, integer, text, timestamptz, timestamptz)
      TO businessos_app;
  END IF;
END
$$;
