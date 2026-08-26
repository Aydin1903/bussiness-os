-- ===========================================================================
-- marketing semasi — Faz 5'in ONBIRINCI is modulu (ADR-0047 §1)
-- ===========================================================================
--
-- `platform` disindaki ONIKINCI sema (`knowledge`, `crm`, `projects`,
-- `finance`, `appointments`, `documents`, `inventory`, `suppliers`,
-- `invoicing`, `hr`, `feedback`, `marketing`). Mutlak Kural 5: her modul kendi
-- semasina sahiptir ve cross-schema FK yasaktir (tek istisna
-- `platform.tenants`).
--
-- ROADMAP §3.5'in onbirinci sirasi: _"Anlatisal veri — CRM'in embedding
-- desenini yeniden kullanir"_.
--
-- ===========================================================================
-- ⚠️ SEMA ADI `marketing`, `campaign` DEGIL (ADR-0047 §1.1)
-- ===========================================================================
-- ADR-0035'in `booking` -> `appointments` dersi: sema · modul klasoru · rota ·
-- `data-module` · `module-colors.css` blogu AYNI KELIME olmalidir. Kelime
-- `module-colors.css`te ZATEN `marketing` diye secilmisti, yani bu sefer
-- yeniden adlandirma isi HIC DOGMADI.
--
-- ⚠️ IZIN KAYNAGI ise `campaign`. Modul anahtari ile izin kaynaginin ayrismasi
-- bu projede KURALDIR (`invoicing` -> `quote`/`invoice`, `inventory` ->
-- `stock_item`/`stock_movement`): modul bir HAFIZA ALANI, izin bir KAYNAK
-- uzerindedir.

CREATE SCHEMA IF NOT EXISTS marketing;
--> statement-breakpoint

-- Uygulama rolu semayi gorur ama icinde nesne OLUSTURAMAZ (02-schemas.sql
-- deseni; on bir onceki sema ile birebir ayni).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT USAGE ON SCHEMA marketing TO businessos_app;
  END IF;
END
$$;
--> statement-breakpoint

-- ===========================================================================
-- marketing.campaigns — KAMPANYA KAYDI
-- ===========================================================================
-- ⚠️ TAM DUZENLENEBILIR — `done` DAHIL (ADR-0047 §2)
-- ===========================================================================
-- Projede degistirilebilirligin BES sekli var; bu, BIRINCISININ tekrari
-- (`finance.transactions`) ve UC OLCUT de "hayir" dedigi icin secildi:
--
--   1. Bugunku bir sayi bu kayitlardan TURETILIYOR mu?  -> HAYIR (ROI yok)
--   2. Kayit SIRKETTEN CIKTI mi?                        -> HAYIR (gonderim yok)
--   3. Kayit BASKA BIRININ SOZU mu?                     -> HAYIR (kendi verimiz)
--
-- ⚠️ Ama asil gerekce dorduncusudur: `done`da KILITLEMEK, DURUMU YALAN
-- SOYLETIRDI. Bir kampanyanin SONUC NOTU tanimi geregi kampanya BITTIKTEN
-- SONRA yazilir; kilit olsaydi kullanici ya kampanyayi yapay olarak `active`
-- tutardi ya sonucu hic yazmazdi. ADR-0033'un "sahte Genel projesi" dersinin
-- en net sekli: bir kisit kullaniciyi YANLIS VERI GIRMEYE itiyorsa kisit
-- yanlistir.
--
-- ⚠️ SONUC: `status` BIR ETIKETTIR, BIR KILIT DEGIL. Durum gecisleri icin bir
-- durum makinesi YOKTUR — `draft`tan dogrudan `done`a gecmek gecerlidir
-- (bitmis bir kampanyayi geriye donuk kaydetmek gercek bir ihtiyactir).
--
-- ===========================================================================
-- ⚠️ TEKILLIK KISITI YOKTUR — ve bu bilincli (ADR-0047 §1.2)
-- ===========================================================================
-- "Instagram kampanyasi" her ay tekrarlanabilir ve ikisi de GERCEKTIR. Bir
-- `UNIQUE (tenant_id, name)`, gercek bir olguyu REDDEDERDI.
-- ⚠️ Dolayisiyla bu modulde **409 diye bir cevap yoktur** (ADR-0045'in
-- denetiminin ucuncu bulgusunun ayni sekli).

CREATE TABLE marketing.campaigns (
  id                  uuid          PRIMARY KEY,
  tenant_id           uuid          NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  name                text          NOT NULL,

  -- ⚠️ SERBEST METIN — ADR-0045 §1.5'in AYNI karari, ikinci kez.
  -- "Hangi kanaldan" sorusunun cevabi tenant'a gore degisir (Instagram,
  -- e-posta, Google Ads, fuar). Bir enum ilk musteride yanlis olurdu; bir
  -- tenant-tanimli sozluk ise BIR KOLONLUK ETIKET icin ikinci bir CRUD
  -- yuzeyi demekti.
  -- ⚠️ Bedeli yazili: `"instagram"` ve `"Instagram"` IKI AYRI degerdir
  -- (ADR-0039'un `kg`/`Kg` varyanti, UCUNCU kez) ve kanala gore gruplama
  -- GUVENILMEZDIR. Kanal bir ETIKETTIR, bir boyut degil.
  channel             text,

  -- ⚠️ `date`, `timestamptz` DEGIL (ADR-0047 §1.5).
  -- Bir randevu bir ANDIR; bir kampanyanin SAATI YOKTUR — "1-15 Eylul" bir gun
  -- araligidir. `timestamptz` secmek OLMAYAN BIR BILGIYI UYDURMAK olurdu: gun
  -- basi hangi saat dilimine gore hesaplanacakti? ADR-0035'in yazili siniri
  -- ("tenant bazli saat dilimi YOK") o gun bu module SIZARDI ve "kampanya
  -- 1 Eylul'de basladi" iddiasi kullanicinin bulundugu yere gore DEGISIRDI.
  starts_on           date          NOT NULL,

  -- ⚠️ NULL = SURESIZ/ACIK UCLU kampanya ve bu GERCEK BIR DURUMDUR: surekli
  -- yayindaki bir Google Ads kampanyasinin bitisi yoktur. Zorunlu kilmak
  -- kullaniciyi UYDURMA BIR TARIH yazmaya iterdi (ADR-0033'un dersi,
  -- DORDUNCU kez).
  ends_on             date,

  -- ⚠️ SABIT ENUM — `channel`in TAM TERSI ve ikisinin yan yana durmasi
  -- kasitlidir: `channel`in degerleri TENANT'A GORE degisir, `status`un
  -- degerleri IS MANTIGINI SURER (hangi kampanya "aktif" sayilir). Serbest
  -- birakmak kodu SORGULANAMAZ kilardi.
  -- ⚠️ CHECK, uygulamayi ATLAYAN yollari da baglar (`appointments_status_valid`
  -- ile ayni karar) ve Zod ile SENKRON kalmak zorundadir.
  -- ⚠️ `cancelled` YOKTUR: iptal edilen bir kampanya YAPILMAMIS bir
  -- kampanyadir, kaydi silinir. Dorduncu bir durum "bitti" ile "hic olmadi"yi
  -- ayni listede tutar ve ileride bir sayim SESSIZCE yanlis olurdu.
  status              text          NOT NULL DEFAULT 'draft',

  -- ⚠️ OPSIYONEL ve ust siniri `TARGET_CHUNK_CHARS`ten TURETILIR (ADR-0047
  -- §1.3). Chunk tablosu YOK: metnin ust sinirini KULLANICI degil BIZ
  -- belirliyoruz, yani parcalayici her zaman tek parca uretirdi.
  -- ⚠️ Sinir asilirsa 422 — SESSIZ KIRPMA YASAK (ADR-0035 §3, altinci kez).
  result_note         text,

  -- ⚠️ CROSS-MODUL ISARETCI — FK YOK (Mutlak Kural 5), `null` YAYGIN DURUM.
  -- ⚠️ BU BIR "HEDEF KITLE" DEGILDIR ve arayuzde de oyle adlandirilmaz
  -- (ADR-0047 §6.2): bir kampanyanin hedef kitlesi bir KUMEdir ve CRM'de
  -- `segment` diye bir kavram YOKTUR. Bu kolon dar bir seyi soyler:
  -- "bu kampanya TEK bir hesaba ozeldi" (ortak etkinlik, bayiye ozel kampanya).
  -- ⚠️ Zorunlu olsaydi kullanici SAHTE CRM SIRKETLERI acardi ve bedeli bu
  -- modulde kalmazdi: CRM'in musteri listesi kirlenirdi.
  crm_company_id      uuid,

  -- ⚠️ Satirin kendi kolonu — chunk tablosu YOK. ONUNCU vektor tablosu.
  -- ⚠️ Vektor YALNIZCA `result_note` VARSA uretilir: adi ve tarihi olan ama
  -- sonucu yazilmamis on kampanya, "Eylul kampanyasi / Ekim kampanyasi" gibi
  -- NEREDEYSE OZDES kisa vektorler uretirdi — ADR-0034 §6.1'in
  -- `Ocak kirasi / Subat kirasi` kirlenmesinin birebir ayni sekli, UCUNCU kez.
  embedding           vector(1536),

  -- Satir ici aktor damgasi (ADR-0041 §8 deseni).
  -- ⚠️ BU BIR DENETIM IZI DEGILDIR: son durumu soyler, "ne oldu"yu SIRASIYLA
  -- anlatmaz. `platform/audit` bu modulde BILEREK kullanilmiyor (ADR-0047
  -- §2.4): denetim izi, degistirilmesi BIR BASKASINI ETKILEYEN alanlar
  -- icindir ve bir kampanya notunu duzeltmek hicbir kisinin hakkini, hicbir
  -- mali kaydi, hicbir turetilmis rakami degistirmez.
  created_by_user_id  uuid          NOT NULL,

  created_at          timestamptz   NOT NULL DEFAULT now(),

  -- ⚠️ VAR — ve bu, ADR-0045'in TAM TERSI bir karardir. Orada kolon BILEREK
  -- konmamisti ("guncellenmeyen bir satirin guncellenme zamani da olmaz").
  -- Burada yol GERCEKTEN VAR (§2), yani kolon da var. Iki modulun ayni kolonda
  -- ters karar vermesi bir tutarsizlik degil, AYNI OLCUTUN IKI FARKLI CEVABIDIR.
  updated_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT campaigns_name_not_blank
    CHECK (btrim(name) <> ''),

  CONSTRAINT campaigns_status_valid
    CHECK (status IN ('draft', 'active', 'done')),

  -- ⚠️ `ends_on` NULL olabilir; NULL ISE KISIT UYGULANMAZ (acik uclu kampanya).
  CONSTRAINT campaigns_dates_ordered
    CHECK (ends_on IS NULL OR ends_on >= starts_on),

  CONSTRAINT campaigns_result_note_not_blank
    CHECK (result_note IS NULL OR btrim(result_note) <> ''),

  CONSTRAINT campaigns_channel_not_blank
    CHECK (channel IS NULL OR btrim(channel) <> ''),

  CONSTRAINT campaigns_updated_after_created
    CHECK (updated_at >= created_at)
);
--> statement-breakpoint

-- Tenant + tarih: liste ekraninin ve yapisal katkicinin ortak erisim yolu.
CREATE INDEX campaigns_tenant_starts_idx
  ON marketing.campaigns (tenant_id, starts_on DESC);
--> statement-breakpoint

-- ⚠️ `campaign-gap` katkicisinin sorgusu: BITMIS ama SONUCU YAZILMAMIS.
-- Kismi index, tam olarak o kumeyi hedefler ve tablo buyudukce taramayi
-- kucuk tutar.
CREATE INDEX campaigns_missing_result_idx
  ON marketing.campaigns (tenant_id, ends_on DESC)
  WHERE status = 'done' AND result_note IS NULL;
--> statement-breakpoint

-- Anlamsal arama — HNSW, dokuz onceki vektor tablosuyla ayni parametreler.
CREATE INDEX campaigns_embedding_idx
  ON marketing.campaigns
  USING hnsw (embedding vector_cosine_ops);
--> statement-breakpoint

ALTER TABLE marketing.campaigns ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE marketing.campaigns FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON marketing.campaigns
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

-- ===========================================================================
-- ⚠️ YETKI — ve burada ADR-0043 Slice 1c'nin KOLON BAZLI deseni GEREKMEZ
-- ===========================================================================
-- `feedback.responses` ve `suppliers.interactions`ta `UPDATE` yalnizca
-- `embedding` kolonundaydi, cunku o satirlar DEGISTIRILEMEZDI.
--
-- ⚠️ Burada satirin HER ALANI guncellenebilir (§2), yani bir `REVOKE UPDATE`
-- yazmak KENDI KARARIMIZLA CELISIRDI. `0000_init`in `ALTER DEFAULT
-- PRIVILEGES` satiri zaten dogru yetkiyi veriyor; acikca tekrar etmek, olmayan
-- bir kisitlamanin VAR OLDUGUNU ima ederdi.
--
-- ⚠️ Bu bir ihmal degil bir KARARDIR ve ADR-0043'un yetki denetimi
-- (`platform-grants.integration.spec`) `platform` semasini kapsar; is
-- semalarinin yetkisi her modulun kendi kararidir.
--
-- ⚠️ AMA YETKININ KENDISI ACIKCA VERILMEK ZORUNDADIR — `0000_init`in
-- `ALTER DEFAULT PRIVILEGES` satiri YALNIZCA `platform` semasi icin
-- tanimlidir (ADR-0043 Slice 1b'nin bulgusu). Yeni bir semada verilen yetki,
-- tam olarak YAZILAN yetkidir; yazilmazsa uygulama rolu tabloyu GOREMEZ.
--
-- ⚠️ `UPDATE` KOLON BAZLI DEGIL, TAM: bu modulde satirin her alani
-- guncellenebilir (§2). `feedback.responses`ta `GRANT UPDATE (embedding)`
-- yaziliydi cunku ORASI degistirilemezdi — buradaki fark bir gevseklik degil,
-- iki modulun FARKLI kararlarinin dogrudan sonucudur.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON marketing.campaigns TO businessos_app;
  END IF;
END
$$;
