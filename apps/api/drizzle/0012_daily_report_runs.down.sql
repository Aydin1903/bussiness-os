-- 0012_daily_report_runs — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- Fonksiyonlar ONCE dusurulur, GRANT'lar sonra: bir rolun yetkileri, sahip
-- oldugu nesneler dururken geri alinamaz (0010'un geri almasiyla ayni sira).
--
-- DIKKAT: geri alma, gunluk rapor kuyrugunun OKUMA yolunu tumuyle kaldirir ve
-- uretilmis raporlari siler. Ayrica dar rolun asim yuzeyi de kapanir.

DROP FUNCTION IF EXISTS knowledge.record_daily_report_failure(uuid, integer, text, timestamptz, timestamptz);
--> statement-breakpoint

DROP FUNCTION IF EXISTS knowledge.mark_daily_report_generated(uuid, text, timestamptz);
--> statement-breakpoint

DROP FUNCTION IF EXISTS knowledge.claim_daily_report_batch(integer, timestamptz, date);
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_report_worker') THEN
    REVOKE ALL ON knowledge.daily_report_runs FROM businessos_report_worker;
    REVOKE ALL ON SCHEMA knowledge FROM businessos_report_worker;
  END IF;
END
$$;
--> statement-breakpoint

-- Tablo en son: politikalari ve index'leri birlikte gider.
DROP TABLE IF EXISTS knowledge.daily_report_runs;
