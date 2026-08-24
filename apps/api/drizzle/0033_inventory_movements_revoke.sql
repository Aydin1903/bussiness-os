-- ===========================================================================
-- inventory.movements — DEGISTIRILEMEZ DEFTERE DORDUNCU KATMAN (ADR-0039 §3.3)
-- ===========================================================================
--
-- ⚠️ YENI TABLO YOK. Bu migration MEVCUT bir tablonun yalnizca YETKISINI
-- daraltir. Sema, kolon, kisit, index, RLS politikasi — hicbirine dokunulmaz.
--
-- ===========================================================================
-- NEDEN: UC KATMAN VARDI, VERITABANI ONLARDAN BIRI DEGILDI
-- ===========================================================================
-- ADR-0039 §3.3 defteri "degistirilemez" ilan etti ve korumayi ACIKCA UC
-- KATMAN olarak saydi:
--
--     1. entity/repository'de `update` metodu YOK
--     2. `stock_movement:delete` izni YOK (katalogda hic tanimlanmadi)
--     3. `movements -> items ON DELETE RESTRICT`
--
-- ⚠️ Ucu de UYGULAMA seviyesindedir — ucuncusu bile: `RESTRICT` bir KALEMIN
-- silinmesini engeller, bir HAREKETIN silinmesini DEGIL. Yani
-- `DELETE FROM inventory.movements` veritabani tarafindan hicbir zaman
-- reddedilmiyordu; yalnizca o SQL'i yazan bir kod yolu yoktu.
--
-- Bu migration DORDUNCU bir katman ekler ve digerlerinden farkli bir yerde
-- durur: uygulama katmaninin ULASAMADIGI yerde. Bir SQL enjeksiyonu, elle
-- acilmis bir psql oturumu ya da gelecekte yanlislikla yazilmis bir repository
-- metodu, ilk uc katmanin hicbirine takilmaz — buna takilir.
--
-- ⚠️ MEVCUT UC KATMANA DOKUNULMADI. Bu bir DEGISTIRME degil, bir EKLEMEDIR
-- (savunma derinligi). ADR-0039'un karari yururluktedir.
--
-- ===========================================================================
-- ⚠️ NEDEN `REVOKE`, NEDEN "GRANT YAZMAMAK" YETMIYOR
-- ===========================================================================
-- Migration `0029` bu tabloya `GRANT SELECT, INSERT, UPDATE, DELETE` yazmisti
-- (is semalarinda yetkiler her migration'da ACIKCA verilir; `platform`daki
-- gibi bir `ALTER DEFAULT PRIVILEGES` yoktur). Dolayisiyla yetki GERCEKTEN
-- verilmis durumdadir ve geri alinmasi gerekir — ADR-0043 Slice 1'de
-- `platform.audit_log`ta ogrenilen dersin aynisi, ters sebeple.
--
-- ===========================================================================
-- ⚠️ NE KIRILMIYOR — OLCULDU, VARSAYILMADI
-- ===========================================================================
--   * Uygulamada `inventory.movements` uzerinde `update()` ya da `delete()`
--     cagrisi YOKTUR: repository yalnizca `insert` eder (fiziksel sayim dahil).
--   * Bu tabloya isaret eden bir FK YOKTUR, yani bir `CASCADE`/`SET NULL`
--     eylemi onu hedeflemiyor.
--   * Kendi FK'leri (`item_id`, `tenant_id`) `RESTRICT`tir — `RESTRICT` cocuk
--     satiri DEGISTIRMEZ, yalnizca ebeveynin silinmesini reddeder.
--   * ⚠️ FK eylemlerinin yetki gerektirip gerektirmedigi ayrica OLCULDU
--     (bkz. `0034`in ayni bolumu): RI trigger'lari REFERENCING tablonun sahibi
--     olarak kosar, cagiranin yetkisine BAKILMAZ.
--
-- ⚠️ Retention: `inventory.movements` silinirse GECMIS degil BUGUNKU SAYI
-- degisir (ROADMAP §8.5'in baglayici kurali). Bu tabloda temizlik zaten
-- `businessos_app` ile yapilamamaliydi; artik YAPILAMAZ.
-- ===========================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    REVOKE UPDATE, DELETE ON inventory.movements FROM businessos_app;
  END IF;
END
$$;
