-- ===========================================================================
-- knowledge.rate_limits -> platform.rate_limits (ADR-0031 §4.2)
-- ===========================================================================
--
-- NEDEN TASINIYOR
-- Oran siniri bir MALIYET mekanizmasidir ve her AI kullanan modul ayni seye
-- ihtiyac duyar. Tabloyu `knowledge` semasinda birakmak, CRM icin ikinci
-- (`crm.rate_limits`), Finans icin ucuncu ozdes tabloyu getirirdi. ADR-0025'in
-- Authorization icin kurdugu desen burada tekrarlaniyor: PLATFORM MEKANIZMAYI
-- SAHIPLENIR, MODUL KENDI KALEMINI DEKLARE EDER.
--
-- Tablonun bicimi, gerekcesi ve pencere karari DEGISMEDI — ayrintili anlatim
-- migration `0013_rate_limits.sql`'de duruyor ve hala gecerlidir (sayac
-- satiri vs istek logu, sabit saat penceresi ve bedeli, yukseltme yolu).
--
-- ===========================================================================
-- VERI TASINMIYOR — ve bu bir tercih degil, bir KISIT
-- ===========================================================================
-- Migration'lar `businessos_owner` ile kosar ve o rol NOBYPASSRLS'tir;
-- `knowledge.rate_limits` ise FORCE ROW LEVEL SECURITY tasir. Buradaki bir
-- `INSERT ... SELECT`, tenant context'i kurulmadigi icin politikadaki
-- `current_setting('app.current_tenant_id')` uzerinden HATA VERIR — sessizce
-- bos donmez bile.
--
-- Kopyalamak ALTINCI bir BYPASSRLS rolu gerektirirdi ve bu, ADR-0030 §2.4'un
-- "ertelenemez genellestirme" kuralini tetiklerdi: en fazla BIR SAATLIK sayac
-- icin kendi basina buyuk bir is.
--
-- BEDELI ACIKCA: gecis aninda her kullanici taze saatlik kota alir. Sinirli
-- (<= 1 pencere), kendiliginden iyilesir, ve en kotu durumda bir kullanici
-- sinirda butcesinin ~2 katini harcar — ki bu, sabit pencere tasariminin
-- ZATEN kabul ettigi tasmanin aynisidir (ADR-0029 §5). Product Owner onayi.
-- ===========================================================================

CREATE TABLE platform.rate_limits (
  tenant_id     uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- Kullanici KIMLIGI, IP DEGIL. ADR-0029 §5: harcamayi yapan kullanicidir,
  -- adres degil. `platform.users`'a FK YOKTUR — 0013 ile ayni gerekce.
  user_id       uuid        NOT NULL,

  -- Eylem basina AYRI KOVA: `/ask` butcesini bitirmek not eklemeyi ENGELLEMEZ.
  action        text        NOT NULL,

  -- Pencerenin BASLANGICI, saate yuvarlanmis. Sayacin kimliginin parcasidir.
  window_start  timestamptz NOT NULL,

  request_count integer     NOT NULL DEFAULT 0,

  -- =========================================================================
  -- NUMARALANDIRAN CHECK KISITI BILEREK YOK — 0013'ten SAPMA
  -- =========================================================================
  -- 0013'te `CHECK (action IN ('ask','create_note'))` vardi ve "tipin
  -- kacirdigini kisit yakalar" diye gerekcelendirilmisti. O gerekce hala
  -- dogru; ama bu tablo artik PLATFORM'a ait ve Knowledge'in sozlugunu
  -- icinde tasiyamaz: CRM'in `create_interaction`'i eklendiginde PLATFORM
  -- migration'i yazmak gerekirdi ve platform her modulun eylemlerini bilmek
  -- zorunda kalirdi (ADR-0025'in acikca yasakladigi bagimlilik).
  --
  -- KAYBEDILEN KORUMA DURUSTCE: elle atilan bir INSERT ya da yanlis yazilmis
  -- bir eylem adi artik veritabaninda YAKALANMAZ. Tek koruma modulun kendi
  -- birlesim tipidir (`modules/knowledge/knowledge.rate-limits.ts`).
  -- Product Owner onayi: modul siniri, veritabani seviyesi kisittan
  -- onceliklidir (ADR-0031 §4.2).
  --
  -- Anlamsiz (semantik tasimayan) kisitlar KALIYOR: bos ya da devasa bir
  -- eylem adi hicbir modulde mesru degildir ve bunu bilmek is semantigi
  -- gerektirmez.
  -- =========================================================================
  CONSTRAINT rate_limits_action_not_blank CHECK (btrim(action) <> ''),
  CONSTRAINT rate_limits_action_length CHECK (length(action) <= 64),
  CONSTRAINT rate_limits_count_positive CHECK (request_count >= 0),

  -- UPSERT'in catisma hedefi ve tablonun TEK erisim deseni.
  PRIMARY KEY (tenant_id, user_id, action, window_start)
);
--> statement-breakpoint

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2). 0013 ile BIREBIR AYNI, SAPMA YOK.
--
-- `missing_ok` KULLANILMAZ: context kurulmamissa sorgu SESSIZCE BOS DONMEZ,
-- HATA VERIR (MT §12.6 madde 4).
--
-- ⚠️ Bir oran sinirlayicida sessiz bos sonuc ozellikle tehlikelidir: sayac
-- her istekte 0 okunur ve sinir HIC devreye girmez — yani hata, korumanin
-- kendisini gorunmez sekilde kapatirdi.
-- ===========================================================================
ALTER TABLE platform.rate_limits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform.rate_limits FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON platform.rate_limits
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

-- Uygulama rolu. DELETE dahil: retention temizligi (ROADMAP §8.4) bu tabloyu
-- da kapsayacak.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON platform.rate_limits TO businessos_app;
  END IF;
END
$$;
--> statement-breakpoint

-- Eski tablo DUSER. Veri tasinmadi (bkz. yukaridaki gerekce); bu satir
-- geriye donusu olmayan tek adimdir ve down migration'i onu yeniden kurar
-- (yine BOS olarak — kayip veri sayaclardir, geri getirilemez ve gerekmez).
DROP TABLE IF EXISTS knowledge.rate_limits;
