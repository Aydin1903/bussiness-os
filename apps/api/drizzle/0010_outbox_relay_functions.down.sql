-- 0010_outbox_relay_functions — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- DIKKAT: geri alma, tenant outbox'inin OKUMA yolunu tumuyle kaldirir —
-- tuketici artik hicbir satir goremez ve kuyruk yeniden birikmeye baslar.
-- Bu bilinclidir: fonksiyon yoksa asim da yoktur.
--
-- Fonksiyonlar ONCE dusurulur, GRANT'lar sonra: fonksiyon sahibi olan rolun
-- yetkileri, sahip oldugu nesneler dururken geri alinamaz.

DROP FUNCTION IF EXISTS platform.record_outbox_failure(uuid, integer, text, timestamptz, timestamptz);
--> statement-breakpoint

DROP FUNCTION IF EXISTS platform.mark_outbox_published(uuid[], timestamptz);
--> statement-breakpoint

DROP FUNCTION IF EXISTS platform.claim_outbox_batch(integer, timestamptz);
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_outbox_relay') THEN
    REVOKE ALL ON platform.outbox FROM businessos_outbox_relay;
    REVOKE ALL ON SCHEMA platform FROM businessos_outbox_relay;
  END IF;
END
$$;
