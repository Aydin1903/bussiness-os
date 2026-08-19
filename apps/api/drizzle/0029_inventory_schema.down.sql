-- 0029_inventory_schema — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- ⚠️ BU DOSYA TEK BASINA YETMEZ. `database.integration.spec`'in geri alma
-- LISTESINE de eklenmis olmasi gerekir — Projeler Slice 1'de ogrenilen kalici
-- ders: migration `0019` yazildiginda listeye girmemisti ve test o gunden beri
-- kirmiziydi. Eksik olan down dosyasi degil, onu CALISTIRAN satirdi.
--
-- ⚠️ SIRA ONEMLI: `movements` ONCE dusurulur. `items`e `ON DELETE RESTRICT` ile
-- baglidir (ADR-0039 §3.3) — yani ebeveyni once dusurmek FK yuzunden PATLARDI.
-- ADR-0037'nin `0028 -> 0027` dersi burada TEK MIGRATION ICINDE geciyor.
--
-- Sema en sonda dusurulur ve `CASCADE` KULLANILMAZ: icinde beklenmedik bir
-- nesne kaldiysa migration PATLAMALIDIR. `DROP SCHEMA ... CASCADE`, sessizce ne
-- sildigini soylemez (`0016` / `0020` / `0023` / `0026`nin ayni gerekcesi).
--
-- `vector` eklentisi BURADA DUSURULMEZ: onu `0011` kurdu ve bes tablo daha
-- kullaniyor.

DROP TABLE IF EXISTS inventory.movements;
--> statement-breakpoint
DROP TABLE IF EXISTS inventory.items;
--> statement-breakpoint
DROP SCHEMA IF EXISTS inventory;
