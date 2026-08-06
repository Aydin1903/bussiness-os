-- ===========================================================================
-- knowledge.conversations / knowledge.messages -> platform.* (ADR-0031 §5.2.1)
-- ===========================================================================
--
-- NEDEN TASINIYOR
-- Retrieval ucu `platform/context`'e tasindi: tek bir `POST /api/v1/ask` var ve
-- moduller ona `RetrievalContributor` ile katki veriyor. Konusma tablolarini
-- `knowledge` semasinda birakmak, bir PLATFORM bileseninin bir IS MODULUNUN
-- semasina yazmasi demekti — Mutlak Kural 5'in dogrudan ihlali. Tek kacis yolu
-- (konusmayi Knowledge'a public interface uzerinden yazdirmak) bagimlilik
-- yonunu TERSINE cevirirdi: platform, is moduluna bagimli hale gelirdi.
--
-- Anlam da bunu soyluyor: konusma artik "Knowledge'a sorulan sorularin
-- gecmisi" degil, "SIRKETE sorulan sorularin gecmisi".
--
-- ===========================================================================
-- VERI TASINIYOR — Slice 2'nin (0014) GEREKCESI BURADA GECERSIZ
-- ===========================================================================
-- 0014'te veri tasinmadi cunku (a) saatlik sayaclar tanimi geregi oluydu ve
-- (b) FORCE RLS + NOBYPASSRLS yuzunden `INSERT ... SELECT` zaten HATA
-- veriyordu.
--
-- Burada IKISI DE gecerli degil:
--   (a) `conversations`/`messages` KULLANICI VERISIDIR — gercek soru-cevap
--       gecmisi. ROADMAP §8.4 bunlari zaten "kullanici verisi" olarak ayri
--       siniflandirir; silmek gercek bir urun kaybi olurdu.
--   (b) Satir KOPYALANMIYOR. `ALTER TABLE ... SET SCHEMA` tabloyu NESNE
--       olarak tasir; hicbir satir OKUNMAZ, dolayisiyla RLS hic devreye
--       girmez ve 0014'u engelleyen sey burada YOKTUR.
--
-- OLCULDU (dev veritabaninda, ROLLBACK'li deney — varsayim degil):
--   veri korundu · `tenant_isolation` politikasi tasindi · ENABLE+FORCE
--   korundu · FK korundu · index korundu · `businessos_app` grant'i korundu ·
--   ON DELETE CASCADE tasima SONRASI hala calisiyor · eski sema bos kaldi.
--
-- ===========================================================================
-- IKI `ALTER` AYNI DOSYADA — ve bu zorunlu
-- ===========================================================================
-- `messages.conversation_id` -> `conversations.id` FK'si vardir. Yalnizca
-- birini tasimak, FK'yi bir an icin CROSS-SCHEMA yapardi — Mutlak Kural 5'in
-- yasakladigi sey. drizzle migration dosyayi tek transaction'da kostugu icin
-- bu ara durum disaridan GORUNMEZ; ikisini ayri dosyalara bolmek o garantiyi
-- kaybettirirdi.
-- ===========================================================================

ALTER TABLE knowledge.conversations SET SCHEMA platform;
--> statement-breakpoint
ALTER TABLE knowledge.messages SET SCHEMA platform;
--> statement-breakpoint

-- ===========================================================================
-- YETKILER ACIKCA YENIDEN VERILIYOR
-- ===========================================================================
-- Tabloya DOGRUDAN verilmis grant'lar tasima ile birlikte gelir (olculdu).
-- Yine de acikca yaziliyor: `ALTER DEFAULT PRIVILEGES ... IN SCHEMA knowledge`
-- yeni semada GECERSIZDIR ve bundan sonra bu tablolara verilecek yetkiler o
-- varsayilana dayanamaz. `GRANT` idempotenttir; var olani tekrar vermek
-- zararsizdir, eksik kalmasi ise sessiz bir 500 uretirdi.
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON platform.conversations TO businessos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON platform.messages TO businessos_app;
  END IF;
END
$$;
