-- 0031_invoicing_schema — GERI ALMA
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
--     sales_document_lines  -> sales_documents'a bagli (CASCADE)
--     sales_documents       -> KENDINE bagli (`converted_from_id`, RESTRICT)
--     number_sequences      -> bagimsiz
--
-- ⚠️ `sales_documents` KENDINE FK tasir (`converted_from_id`) ve bu, geri
-- almada `0030`da olmayan bir sekildir: `DROP TABLE` bir tablonun KENDI ic
-- referanslarini sorun etmez (tablo tumuyle gider), yani ek bir kademe
-- GEREKMEZ. Kayit, okuyanin "self-FK burada bir sorun mu" sorusunu bir kez
-- sorup gecmesi icin dusuldu.
--
-- ⚠️ TRIGGER VE FONKSIYON ACIKCA DUSURULUYOR. Trigger tabloyla birlikte
-- kendiliginden giderdi ama FONKSIYON GITMEZDI: `DROP TABLE` bir plpgsql
-- fonksiyonunu goturmez ve semada YETIM bir nesne kalirdi. Asagidaki
-- `DROP SCHEMA` (CASCADE'siz) o durumda PATLARDI — yani hata gorunur olurdu,
-- ama geri alma da calismazdi.
--
-- Sema en sonda dusurulur ve `CASCADE` KULLANILMAZ: icinde beklenmedik bir
-- nesne kaldiysa migration PATLAMALIDIR. `DROP SCHEMA ... CASCADE`, sessizce
-- ne sildigini soylemez (`0016` / `0020` / `0023` / `0026` / `0029` / `0030`un
-- ayni gerekcesi).
--
-- `vector` eklentisi BURADA DUSURULMEZ: onu `0011` kurdu ve bu modul zaten
-- kullanmiyor (ADR-0041 §5 — Faz 5'te vektor tasimayan ILK is modulu).

DROP TRIGGER IF EXISTS sales_document_lines_immutable_after_send
  ON invoicing.sales_document_lines;
--> statement-breakpoint

DROP TABLE IF EXISTS invoicing.sales_document_lines;
--> statement-breakpoint

DROP TABLE IF EXISTS invoicing.sales_documents;
--> statement-breakpoint

DROP TABLE IF EXISTS invoicing.number_sequences;
--> statement-breakpoint

DROP FUNCTION IF EXISTS invoicing.assert_document_editable();
--> statement-breakpoint

DROP SCHEMA IF EXISTS invoicing;
