-- 0009_outbox_retry — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur. Ileri yonun TERSI
-- sirayla: once yeni index'ler, sonra kisitlar, sonra kolonlar; en son kuyruk
-- index'i 0002'deki HALINE geri kurulur.
--
-- DIKKAT: geri alma, dead-letter isaretlerini de silmis olur — olu kayitlar
-- yeniden "bekleyen" haline doner ve tuketici onlari tekrar dener. Bu bilinclidir:
-- kolon yoksa "olu" kavrami da yoktur. (0006'nin geri almasiyla ayni uyari.)

DROP INDEX IF EXISTS platform.outbox_dead_letter_idx;
--> statement-breakpoint

DROP INDEX IF EXISTS platform.outbox_pending_idx;
--> statement-breakpoint

ALTER TABLE platform.outbox
  DROP CONSTRAINT IF EXISTS outbox_terminal_state_check;
--> statement-breakpoint

ALTER TABLE platform.outbox
  DROP CONSTRAINT IF EXISTS outbox_attempt_count_check;
--> statement-breakpoint

ALTER TABLE platform.outbox DROP COLUMN IF EXISTS dead_lettered_at;
--> statement-breakpoint

ALTER TABLE platform.outbox DROP COLUMN IF EXISTS next_attempt_at;
--> statement-breakpoint

ALTER TABLE platform.outbox DROP COLUMN IF EXISTS last_error;
--> statement-breakpoint

ALTER TABLE platform.outbox DROP COLUMN IF EXISTS attempt_count;
--> statement-breakpoint

-- 0002'deki kuyruk index'i aynen geri gelir.
CREATE INDEX outbox_pending_idx
  ON platform.outbox (occurred_at)
  WHERE published_at IS NULL;
