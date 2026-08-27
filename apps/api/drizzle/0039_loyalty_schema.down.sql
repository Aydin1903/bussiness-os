-- 0039_loyalty_schema — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- ⚠️ IKI KADEME VE SIRA ZORUNLUDUR — `0038`den ayrildigimiz nokta budur.
-- Kampanya TEK tabloydu ve sema ici FK tasimiyordu; burada
-- `point_entries -> accounts` GERCEK BIR FK'dir (ayni sema, Mutlak Kural 5
-- ihlali yok). Cocuk once dusmelidir.
--
-- ⚠️ `DROP TABLE ... CASCADE` YAZILMADI ve bu bilincli: `CASCADE` bir kalinti
-- nesneyi SESSIZCE goturur. Sira dogruysa gerekmez; sira yanlissa PATLAMASI
-- gerekir (ADR-0048'in tohumlama betiginde ogrenilen ayni disiplin).
--
-- ⚠️ AYRI BIR `REVOKE` GEREKMEZ: yetkiler tabloyla birlikte duser. ⚠️ `0037`
-- ile `0034`ten farkli olarak burada geri alinacak bir KOLON BAZLI yetki de
-- yoktur — `accounts` uzerindeki `UPDATE` TAM verildi (bir kilit on kosulu,
-- ileri migration'da yazili) ve `point_entries` hic almadi.
--
-- ⚠️ `DROP SCHEMA` CASCADE'SIZDIR ve oyle kalmalidir. ⚠️ Bu semada BIR TRIGGER
-- VE BIR FONKSIYON VARDIR (`accounts_no_update`) ve ikisi de ACIKCA
-- dusurulur — ADR-0041'in `0031` dersi burada TETIKLENIYOR: `DROP TABLE`
-- trigger'i goturur ama fonksiyonu BIRAKIR.
--
-- ⚠️ O trigger BAKIYE ICIN DEGILDIR: bakiyenin negatif olamamasi bir
-- trigger'la degil, uygulamadaki tek kod yolu ve satir kilidiyle korunur
-- (ADR-0051 §4.4). Trigger, `SELECT ... FOR UPDATE`in zorunlu kildigi
-- `GRANT UPDATE`in yarattigi acikligi kapatir.

-- ⚠️ Trigger ve fonksiyon ONCE: `DROP TABLE` trigger'i goturur ama FONKSIYON
-- semada KALIR ve `DROP SCHEMA` (CASCADE'siz) o yuzden PATLARDI.
DROP TRIGGER IF EXISTS accounts_no_update ON loyalty.accounts;
--> statement-breakpoint

DROP FUNCTION IF EXISTS loyalty.accounts_no_update();
--> statement-breakpoint

DROP TABLE IF EXISTS loyalty.point_entries;
--> statement-breakpoint

DROP TABLE IF EXISTS loyalty.accounts;
--> statement-breakpoint

DROP SCHEMA IF EXISTS loyalty;
