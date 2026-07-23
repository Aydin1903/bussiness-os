-- 0006_identity_outbox_retry — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur. Ileri yonun TERSI
-- sirayla: once yeni index'ler, sonra kisitlar, sonra kolonlar; en son kuyruk
-- index'i 0004'teki HALINE geri kurulur.
--
-- DIKKAT: geri alma, dead-letter isaretlerini de silmis olur — olu kayitlar
-- yeniden "bekleyen" haline doner ve tuketici onlari tekrar dener. Bu bilinclidir:
-- kolon yoksa "olu" kavrami da yoktur.

DROP INDEX IF EXISTS platform.identity_outbox_dead_letter_idx;
--> statement-breakpoint

DROP INDEX IF EXISTS platform.identity_outbox_pending_idx;
--> statement-breakpoint

ALTER TABLE platform.identity_outbox
  DROP CONSTRAINT IF EXISTS identity_outbox_terminal_state_check;
--> statement-breakpoint

ALTER TABLE platform.identity_outbox
  DROP CONSTRAINT IF EXISTS identity_outbox_attempt_count_check;
--> statement-breakpoint

ALTER TABLE platform.identity_outbox DROP COLUMN IF EXISTS dead_lettered_at;
--> statement-breakpoint

ALTER TABLE platform.identity_outbox DROP COLUMN IF EXISTS next_attempt_at;
--> statement-breakpoint

ALTER TABLE platform.identity_outbox DROP COLUMN IF EXISTS last_error;
--> statement-breakpoint

ALTER TABLE platform.identity_outbox DROP COLUMN IF EXISTS attempt_count;
--> statement-breakpoint

-- 0004'teki kuyruk index'i aynen geri gelir.
CREATE INDEX identity_outbox_pending_idx
  ON platform.identity_outbox (occurred_at)
  WHERE published_at IS NULL;
