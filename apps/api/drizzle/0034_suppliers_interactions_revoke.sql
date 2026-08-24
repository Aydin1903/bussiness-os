-- ===========================================================================
-- suppliers.interactions — EKLEME-YALNIZ GUNLUGE VERITABANI KATMANI (ADR-0040)
-- ===========================================================================
--
-- ⚠️ YENI TABLO YOK. Mevcut bir tablonun yalnizca YETKISI daraltilir.
--
-- ADR-0040 gorusme gunlugunu "EKLEME-YALNIZ" ilan etti ve korumayi UYGULAMA
-- seviyesinde birakti: _"`update` metodunun ve `supplier_interaction:write`
-- izninin olmamasi YETER."_ Bu migration o cumleye bir veritabani katmani
-- ekler — ADR-0039'un defteriyle ayni desen, `0033` ile ayni iste.
--
-- ===========================================================================
-- ⚠️⚠️ BURADA `0033`TEN AYRILIYORUZ: TABLO SEVIYESINDE `UPDATE` ALINAMAZ
-- ===========================================================================
-- `inventory.movements` hicbir zaman guncellenmez. Bu tablo GUNCELLENIR — ama
-- yalnizca TEK BIR KOLONDA:
--
--     `DrizzleSupplierRepository.setInteractionEmbedding(...)`
--       -> UPDATE suppliers.interactions SET embedding = $1 WHERE id = $2
--
-- Bu yol CANLI ve IKI YERDEN cagriliyor: (1) her gorusme olusturmadan sonra
-- vektorun yazilmasi — `INSERT` sirasinda `embedding` bilerek BOS birakilir,
-- cunku vektor uretimi bir AG CAGRISI gerektirir ve transaction'in disindadir;
-- (2) `POST /suppliers/reindex` (ADR-0040'in `staleAfterRename` telafisi).
--
-- ⚠️ DUZ BIR `REVOKE UPDATE` BU IKI YOLU DA KIRARDI: yeniden adlandirmadan
-- sonra vektorler bayat kalir, arama bulmaz ve kullanici NEDENINI ogrenemezdi.
-- Yani "ayni deseni uygula" talimatinin duz karsiligi, calisan bir ozelligi
-- sessizce bozardi.
--
-- ⚠️ COZUM KOLON SEVIYESI YETKIDIR — VE OLCULDU:
--
--     GRANT UPDATE (embedding)  -> vektor yazimi CALISIR
--     UPDATE ... SET body       -> permission denied
--     UPDATE ... SET embedding, body (birlikte) -> permission denied
--     DELETE                    -> permission denied
--
-- Sonuc TALEP EDILENDEN GUCLUDUR: gorusmenin ICERIGI (`body`, `occurred_on`,
-- `contact_id`, `author_user_id`) veritabani seviyesinde DEGISTIRILEMEZ hale
-- gelir; degisebilen tek sey TURETILMIS bir alandir (vektor). "Ekleme-yalniz"
-- iddiasi boylece kolon granulunde DOGRU olur.
--
-- ===========================================================================
-- ⚠️ FK EYLEMLERI KIRILMIYOR — VARSAYILMADI, OLCULDU
-- ===========================================================================
-- Bu tablo IKI FK eyleminin HEDEFIDIR ve ikisi de ADR-0040 §1.3'un kararidir:
--
--     supplier_id -> suppliers.suppliers ON DELETE CASCADE   (satir SILINIR)
--     contact_id  -> suppliers.contacts  ON DELETE SET NULL  (satir GUNCELLENIR)
--
-- Yani "DELETE'i ve UPDATE'i geri al" demek, ilk bakista tedarikci silmeyi ve
-- kisi silmeyi de kirmak demektir. KIRMIYOR: PostgreSQL'de RI trigger'lari
-- REFERENCING tablonun SAHIBI olarak kosar; cagiran rolun yetkisine BAKILMAZ.
--
-- ⚠️ Bu, dokumantasyona guvenilerek degil, YALITILMIS BIR DENEYLE olculdu
-- (yetkisiz rolle CASCADE ve SET NULL denendi, ikisi de calisti ve `SET NULL`
-- satiri YERINDE BIRAKTI — ADR-0040 §1.3'un tam olarak bekledigi davranis).
-- Bir entegrasyon testi bunu artik surekli kilitliyor.
-- ===========================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    REVOKE UPDATE, DELETE ON suppliers.interactions FROM businessos_app;

    -- ⚠️ TEK MESRU MUTASYON: turetilmis vektor. Icerik kolonlari disaridadir.
    GRANT UPDATE (embedding) ON suppliers.interactions TO businessos_app;
  END IF;
END
$$;
