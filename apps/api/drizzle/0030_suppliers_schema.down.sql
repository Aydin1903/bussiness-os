-- 0030_suppliers_schema — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- ⚠️ BU DOSYA TEK BASINA YETMEZ. `database.integration.spec`'in geri alma
-- LISTESINE de eklenmis olmasi gerekir — Projeler Slice 1'de ogrenilen kalici
-- ders: migration `0019` yazildiginda listeye girmemisti ve test o gunden beri
-- kirmiziydi. Eksik olan down dosyasi degil, onu CALISTIRAN satirdi.
--
-- ⚠️ SIRA ONEMLI ve bu migration'da UC KADEMELI:
--
--     interactions  → contacts'a (SET NULL) ve suppliers'a (CASCADE) bagli
--     contacts      → suppliers'a (CASCADE) bagli
--     suppliers     → koku
--
-- Cocuklari once dusurmek zorunludur; ebeveyni once dusurmek FK yuzunden
-- PATLARDI. ADR-0037'nin `0028 -> 0027` dersi burada TEK MIGRATION ICINDE ve
-- IKI kademe derinliginde geciyor (`0029` iki tabloluydu, bu uc tablolu).
--
-- Sema en sonda dusurulur ve `CASCADE` KULLANILMAZ: icinde beklenmedik bir
-- nesne kaldiysa migration PATLAMALIDIR. `DROP SCHEMA ... CASCADE`, sessizce ne
-- sildigini soylemez (`0016` / `0020` / `0023` / `0026` / `0029`un ayni
-- gerekcesi).
--
-- `vector` eklentisi BURADA DUSURULMEZ: onu `0011` kurdu ve alti tablo daha
-- kullaniyor.

DROP TABLE IF EXISTS suppliers.interactions;
--> statement-breakpoint
DROP TABLE IF EXISTS suppliers.contacts;
--> statement-breakpoint
DROP TABLE IF EXISTS suppliers.suppliers;
--> statement-breakpoint
DROP SCHEMA IF EXISTS suppliers;
