-- 0010_outbox_relay_functions — tenant outbox tuketicisi icin KONTROLLU RLS
-- asimi (ADR-0006, MULTI_TENANT_ARCHITECTURE 12.4.2)
--
-- DEVELOPMENT_RULES 6: elle yazildi, geri alinabilir.
--
-- ===========================================================================
-- NEDEN GEREKLI — ve neden SADE BIR `SECURITY DEFINER` YETMEZ
-- ===========================================================================
-- Publisher sureci tenant'lar ARASI okumak zorundadir: kuyrukta hangi tenant'in
-- event'i varsa onu isler. `platform.outbox` standart RLS sablonunu tasir
-- (`ENABLE` + `FORCE`, 0002) ve politika `tenant_id = current_setting(...)`
-- der — tenant context'i olmayan bir surec HICBIR satir goremez.
--
-- 12.4.2 bu isi "resolve_tenant deseninin aynisi" diye tasarlamisti. O plan
-- BUGUN CALISMAZ ve onu curuten metin ayni dokumanda, 12.4.4'tedir:
--
--   `resolve_tenant` yalnizca `platform.tenants` FORCE TASIMADIGI icin calisir.
--   `FORCE`, `SECURITY DEFINER` fonksiyonunu SAHIBI ICIN DE politikaya tabi
--   kilar ve `businessos_owner` bilincle NOBYPASSRLS'tir.
--
-- `platform.outbox` FORCE tasir. Dolayisiyla cozum 12.4.4'un (ADR-0028)
-- desenidir: asim, `BYPASSRLS` tasiyan DAR bir rolun sahip oldugu
-- `SECURITY DEFINER` fonksiyonlarda TOPLANIR.
--
-- NEDEN GUVENLI (resolve_tenant / list_user_memberships ile ayni felsefe):
--   * Asim UC FONKSIYON IMZASINDA. Genel bir "outbox'i oku" yetkisi YOKTUR.
--   * Fonksiyonlar YALNIZCA `platform.outbox`'a dokunur; baska tablo yok.
--   * `claim_outbox_batch` limit ALIR — sinirsiz listeleme yapilamaz.
--   * Donen alanlar teslimat icin gerekli olanlarla sinirlidir.
--   * search_path sabitlenmistir — SECURITY DEFINER fonksiyonlarinda
--     search_path zehirlenmesi bilinen bir saldiri yoludur.
--   * `businessos_outbox_relay` NOLOGIN: dogrudan baglanilamaz, hicbir baglanti
--     dizesine/`.env`'e girmez. Yalnizca fonksiyon icinde "canlanir".
--
-- 12.4.2 ayrica "ucuncu bir veritabani rolu eklenmeyecektir" diyordu. O ongoru
-- IKI KEZ yanlis cikti: ucuncu rol 12.4.4 ile (ADR-0028), dorduncusu bu
-- migration ile eklendi. Gerekcesi ("docker init, README, .env ve config'e
-- yayilan degisiklik") NOLOGIN bir rol icin gecerli degildir: degisiklik
-- `01-roles.sql` + buradaki GRANT'lar ile sinirlidir.
--
-- ROL-BAGIMSIZLIK (0000/0001/0008 ile ayni konvansiyon): role bagli adimlar
-- `IF EXISTS` ile sarilir. `database.integration` testi rolleri OLUSTURMADAN
-- bos bir container'da migrate eder; orada fonksiyonlar migration'i calistiran
-- superuser'a ait olur ve RLS'i zaten superuser olarak asar.
-- ===========================================================================

-- Dar role, fonksiyonlarin dokundugu TEK tabloya yetki (baska hicbir tabloya
-- degil) ve sahiplik atamasi icin GECICI CREATE. Rol yoksa atlanir.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_outbox_relay') THEN
    GRANT SELECT, UPDATE ON platform.outbox TO businessos_outbox_relay;
    GRANT USAGE, CREATE ON SCHEMA platform TO businessos_outbox_relay;
  END IF;
END
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- platform.claim_outbox_batch — bekleyen kayitlari KILITLEYEREK getirir
--
-- "Claim" adi bilincli: kayitlar yalnizca okunmaz, cagiran transaction adina
-- REZERVE edilir. `FOR UPDATE SKIP LOCKED` bekleyen degil ATLAYAN bir kilittir:
-- iki instance ayni satiri isleyip ayni event'i iki kez teslim edemez, ve mesgul
-- satir digerinin turunu bloklamaz.
--
-- VOLATILE (STABLE degil): satir kilitler, yani yan etkisi vardir.
-- ---------------------------------------------------------------------------
CREATE FUNCTION platform.claim_outbox_batch(p_limit integer, p_now timestamptz)
RETURNS TABLE (
  id             uuid,
  tenant_id      uuid,
  event_type     text,
  event_version  integer,
  payload        jsonb,
  correlation_id text,
  occurred_at    timestamptz,
  attempt_count  integer
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = platform, pg_temp
AS $$
  SELECT o.id, o.tenant_id, o.event_type, o.event_version, o.payload,
         o.correlation_id, o.occurred_at, o.attempt_count
  FROM platform.outbox o
  WHERE o.published_at IS NULL
    AND o.dead_lettered_at IS NULL          -- olu mektup kuyrukta DEGILDIR
    AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= p_now)  -- backoff
  ORDER BY o.next_attempt_at NULLS FIRST, o.occurred_at
  LIMIT p_limit
  FOR UPDATE SKIP LOCKED;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- platform.mark_outbox_published — teslim edilenleri isaretler
--
-- Dizi alir, tek UPDATE yapar. `published_at IS NULL` kosulu idempotency
-- saglar: iki kez isaretlemek ilk zamani EZMEZ.
-- ---------------------------------------------------------------------------
CREATE FUNCTION platform.mark_outbox_published(p_ids uuid[], p_published_at timestamptz)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = platform, pg_temp
AS $$
  UPDATE platform.outbox
  SET published_at = p_published_at
  WHERE id = ANY(p_ids)
    AND published_at IS NULL;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- platform.record_outbox_failure — sayac, son hata, backoff veya olu mektup
--
-- Her kaydin sayaci ve yeniden deneme ani FARKLIDIR; toplu tek UPDATE ile
-- yazilamaz. Basarisizlik nadir oldugu icin cagri basina bir satir kabul
-- edilebilir — ve tur zaten batch boyutuyla sinirlidir.
--
-- BASARISIZLIK DA YAZILMAK ZORUNDADIR: yazilmasaydi sayac hic artmaz, backoff
-- hic uygulanmaz ve kayit her turda yeniden denenirdi.
-- ---------------------------------------------------------------------------
CREATE FUNCTION platform.record_outbox_failure(
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
SET search_path = platform, pg_temp
AS $$
  UPDATE platform.outbox
  SET attempt_count    = p_attempt_count,
      last_error       = p_last_error,
      next_attempt_at  = p_next_attempt_at,
      dead_lettered_at = p_dead_lettered_at
  WHERE id = p_id;
$$;
--> statement-breakpoint

-- Sahipligi dar role atar (fonksiyonlar artik BYPASSRLS ile FORCE-RLS outbox'i
-- okur/yazar) ve gecici CREATE'i geri alir. Rol yoksa fonksiyonlar migration'i
-- calistirana ait kalir (yalnizca rol-bagimsiz testte; orada superuser zaten
-- RLS'i asar).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_outbox_relay') THEN
    ALTER FUNCTION platform.claim_outbox_batch(integer, timestamptz)
      OWNER TO businessos_outbox_relay;
    ALTER FUNCTION platform.mark_outbox_published(uuid[], timestamptz)
      OWNER TO businessos_outbox_relay;
    ALTER FUNCTION platform.record_outbox_failure(uuid, integer, text, timestamptz, timestamptz)
      OWNER TO businessos_outbox_relay;

    REVOKE CREATE ON SCHEMA platform FROM businessos_outbox_relay;
  END IF;
END
$$;
--> statement-breakpoint

-- Varsayilan olarak herkese EXECUTE verilir; once geri alinir, sonra YALNIZCA
-- uygulama roluna verilir (deny by default — 0001/0008 ile ayni disiplin).
REVOKE ALL ON FUNCTION platform.claim_outbox_batch(integer, timestamptz) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION platform.mark_outbox_published(uuid[], timestamptz) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION platform.record_outbox_failure(uuid, integer, text, timestamptz, timestamptz) FROM PUBLIC;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT EXECUTE ON FUNCTION platform.claim_outbox_batch(integer, timestamptz)
      TO businessos_app;
    GRANT EXECUTE ON FUNCTION platform.mark_outbox_published(uuid[], timestamptz)
      TO businessos_app;
    GRANT EXECUTE ON FUNCTION platform.record_outbox_failure(uuid, integer, text, timestamptz, timestamptz)
      TO businessos_app;
  END IF;
END
$$;
