-- 0026_appointments_schema — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- ⚠️ BU DOSYA TEK BASINA YETMEZ. `database.integration.spec`'in geri alma
-- LISTESINE de eklenmis olmasi gerekir — Projeler Slice 1'de ogrenilen kalici
-- ders: migration `0019` yazildiginda listeye girmemisti ve test o gunden beri
-- kirmiziydi. Eksik olan down dosyasi degil, onu CALISTIRAN satirdi.
--
-- Sema en sonda dusurulur ve `CASCADE` KULLANILMAZ: icinde beklenmedik bir
-- nesne kaldiysa migration PATLAMALIDIR. `DROP SCHEMA ... CASCADE`, sessizce ne
-- sildigini soylemez (`0016` / `0020` / `0023`un ayni gerekcesi).
--
-- `vector` eklentisi BURADA DUSURULMEZ: onu `0011` kurdu ve dort tablo daha
-- kullaniyor. Burada dusurmek, bu migration'i geri almanin Knowledge/CRM/
-- Projeler/Finans'i da bozmasi demekti.

DROP TABLE IF EXISTS appointments.appointments;
--> statement-breakpoint
DROP SCHEMA IF EXISTS appointments;
