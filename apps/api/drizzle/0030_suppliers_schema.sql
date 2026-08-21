-- ===========================================================================
-- suppliers semasi — Faz 5'in YEDINCI is modulu (ADR-0040 §1)
-- ===========================================================================
--
-- `platform` disindaki SEKIZINCI sema (`knowledge`, `crm`, `projects`,
-- `finance`, `appointments`, `documents`, `inventory`, `suppliers`).
-- Mutlak Kural 5: her modul kendi semasina sahiptir.
--
-- ROADMAP §3.5'in yedinci sirasi: _"CRM deseninin UCUZ TEKRARI — ayni sekil,
-- ters yon (satin alma)."_
--
-- ===========================================================================
-- ⚠️ "UCUZ TEKRAR" KOD KOPYALAMAK DEGILDIR (ADR-0040 §2)
-- ===========================================================================
-- Ucuzluk, verilecek KARAR SAYISININ az olmasidir. Bu migration CRM'in uc
-- tablosunu (sirket / kisi / gorusme) tekrar eder ama IKI SEYI KOPYALAMAZ:
--
--   1. FIRSAT + PIPELINE YOK (§2.1). Bir satis hattinin var olma sebebi
--      BELIRSIZ BIR GELIRIN asamalar boyunca ilerlemesidir. Satin almada bu
--      belirsizlik tedarikcide degil SIPARISTEDIR ve siparis kapsam disidir.
--      Kopyalansaydi hicbir sorunun cevabi olmayan bes asamali bir sozluk
--      olurdu.
--
--   2. ⚠️ CHUNK TABLOSU YOK (§2.2). CRM'in `interaction_chunks` tablosu bir
--      EMSAL DEGIL, bir MIRASTIR: chunk olcutu ADR-0035 §3 + ADR-0037 §3 ile
--      CRM'DEN SONRA yazildi. Olcut sudur:
--
--          chunk tablosu, metnin ust sinirini KULLANICI degil
--          VERININ KENDISI belirliyorsa acilir.
--
--      Tedarikci gorusmesi bir FORMA yazilir; sinirini BIZ koyariz
--      (`TARGET_CHUNK_CHARS`) ve parcalayici bu sinirin altinda HER ZAMAN tek
--      parca uretirdi. Ikinci tablo yalnizca bir `JOIN` maliyeti, ikinci bir
--      RLS politikasi ve retention listesinde ikinci bir satir olurdu.
--
--      ⚠️ Bedeli: sinir SUNUCUDA zorlanir ve asilirsa 422 doner. SESSIZ KIRPMA
--      YASAK — kirpsaydi kullanici notunun yarisinin arandigini HIC
--      ogrenemezdi. Uzun bir e-posta zincirinin dogru yeri BELGE moduludur.
--
-- ===========================================================================
-- ⚠️ CROSS-MODUL KENARI YOK — VE BU SEFER BIR ADAY REDDEDILIYOR (§4)
-- ===========================================================================
-- Bu semada baska bir modulun kaydina isaret eden HICBIR kolon yoktur.
-- ADR-0039'da (Stok) da kenar yoktu ama sebebi farkliydi: hedef sema MEVCUT
-- DEGILDI. Burada hedef VAR (`inventory` canli) ve ROADMAP §3.6 kenari acikca
-- sayiyor (_"Tedarikci → Stok"_) — yine de eklenmiyor:
--
--   (a) baglantinin bir FIILI yok: "bu tedarikci su kalemi saglar" bir OLGU
--       degil bir KATALOGDUR; olgu ancak bir siparisle dogar,
--   (b) sekil bugune kadarki desenin sekli DEGIL: tek nullable kolon degil bir
--       N:N ara tablosu, ve sarkan isaretciyi CATALLAR,
--   (c) gercek talep 8. modulden gelecek.
--
-- ⚠️ O gun `inventory.public.ts`i YAZAN modul STOK olacaktir (ADR-0039 §9.1) —
-- talip degil SAHIP yazar. Bagimlilik grafigi ALTI KENARDA kaliyor ve DAG:
--
--     katman 0: CRM · INVENTORY · SUPPLIERS  ← yeni, cikan kenari YOK
--     katman 1: Projeler ──► CRM
--     katman 2: Finans ──► CRM, Projeler · Randevu ──► CRM · Belge ──► CRM, Projeler

CREATE SCHEMA IF NOT EXISTS suppliers;
--> statement-breakpoint

-- Uygulama rolu semayi gorur ama icinde nesne OLUSTURAMAZ (02-schemas.sql
-- deseni; yedi onceki sema ile birebir ayni).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT USAGE ON SCHEMA suppliers TO businessos_app;
  END IF;
END
$$;
--> statement-breakpoint

-- ===========================================================================
-- suppliers.suppliers — TEDARIKCI FIRMASI
-- ===========================================================================
-- `crm.companies`in karsiligi. ⚠️ Sema ve tablo AYNI adi tasiyor — `projects`,
-- `appointments` ve `documents`taki cakismanin DORDUNCU tekrari; Drizzle sema
-- tanimi bu yuzden ayri bir dosyada (`suppliers-schema.schema.ts`).
CREATE TABLE suppliers.suppliers (
  id                 uuid          PRIMARY KEY,
  tenant_id          uuid          NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- =========================================================================
  -- AD TEKIL DEGILDIR — ve bu bilincli (ADR-0040 §1.1)
  -- =========================================================================
  -- Iki ayri sube, iki ayri sozlesme ya da ayni adi tasiyan iki firma
  -- MESRUDUR. Tekillik KIMLIK TASIYAN alanda zorlanir (asagida `tax_number`),
  -- ad alaninda degil — `crm.companies.name`in de tekil olmamasiyla ayni karar.
  name               text          NOT NULL,

  -- =========================================================================
  -- VERGI NUMARASI — OPSIYONEL, ama VARSA KUCUK/BUYUK HARFTEN BAGIMSIZ TEKIL
  -- =========================================================================
  -- ADR-0039 §1.1'in SKU icin yazdigi seklin IKINCI uygulamasi.
  --
  -- Nullable, cunku kucuk bir isletme tedarikcisinin vergi numarasini
  -- bilmeyebilir; zorunlu olsaydi kullanici `-` yazardi ve alan
  -- ANLAMSIZLASIRDI.
  --
  -- ⚠️ Tekillik `lower(tax_number)` uzerindedir. Ayni tuzel kisi icin IKI SATIR
  -- acilmasi tam olarak bu projenin reddettigi turden bir hatadir: ekran
  -- calisir, iki tedarikci yan yana durur ve GORUSME GECMISI IKIYE BOLUNUR.
  -- ⚠️ Bolunen sey yalnizca bir liste degil, AI'IN HAFIZASIDIR — yani modulun
  -- var olus sebebi. Hata SESSIZDIR.
  tax_number         text,

  -- Serbest metin — `crm.companies.industry`nin karsiligi ("hammadde",
  -- "ambalaj", "lojistik"). Hicbir sey zorlamaz, yalnizca etiketler.
  category           text,

  email              text,
  phone              text,
  website            text,
  address            text,

  -- =========================================================================
  -- ODEME KOSULLARI SERBEST METINDIR (ADR-0040 §1.2)
  -- =========================================================================
  -- Olcut projede UCUNCU kez ayni: KOLON BIR KISIT TASIYOR MU?
  --
  --   `appointments.status`      -> kodda enum     (dort hal her sektorde ayni)
  --   `finance.categories`       -> tenant tablosu (yon BILESIK FK ile zorlanir)
  --   `inventory.items.unit`     -> serbest metin  (hicbir sey zorlamiyor)
  --   `suppliers.payment_terms`  -> SERBEST METIN  (hicbir sey zorlamiyor)
  --
  -- "60 gun vadeli, 10 gun icinde odemede %2 iskonto" bir INSAN CUMLESIDIR.
  -- Yapisal hale getirmek (`net_days` + `discount_percent` + `discount_days`)
  -- uc kolon, uc dogrulama ve bir hesaplama kurali gerektirirdi — TASIDIGI TEK
  -- KISIT ICIN: hicbiri. Hicbir sorgu vadeye gore filtrelemiyor.
  --
  -- ⚠️ BUNUN DOGRUDAN SONUCU: "odeme vadesi yaklasan tedarikciler" diye bir
  -- YAPISAL KATKICI YAZILAMAZ (§3.2). Serbest metinden vade CIKARILAMAZ;
  -- regex ile "60 gun" aramak bir SESSIZ HATA MAKINESI olurdu — "60 is gunu"
  -- ile "60 gun" arasindaki farki bir regex bilmez ve ekran MAKUL GORUNEN
  -- YANLIS bir tarih gosterir.
  --
  -- ⚠️ Kabul edilen bedel: "60 gun", "60 gun vade" ve "net 60" yan yana
  -- yasayabilir. Cozumu bir tablo degil, arayuzde ONERI LISTESIDIR
  -- (`inventory.items.unit`in ayni telafisi).
  payment_terms      text,

  -- ⚠️ Yalnizca OLUSTURANI tutar; degisiklik denetim izi DEGILDIR. Bir
  -- tedarikcinin ODEME KOSULLARINI kimin degistirdigi SORULAMAZ
  -- (`platform/audit` borcu, tetikleyici 8. modul). ⚠️ ADR-0039'un aksine bu
  -- borc burada KENDILIGINDEN KAPANMAZ: degistirilemez bir defter yok.
  -- Cross-schema FK yasak: `platform.users` baska bir modulun tablosudur.
  created_by_user_id uuid,

  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT suppliers_name_not_blank CHECK (btrim(name) <> ''),

  -- "Girilmedi" ile "bos girildi" AYNI seydir; ikisi de `NULL`dur.
  CONSTRAINT suppliers_tax_number_not_blank
    CHECK (tax_number IS NULL OR btrim(tax_number) <> ''),
  CONSTRAINT suppliers_category_not_blank
    CHECK (category IS NULL OR btrim(category) <> ''),
  CONSTRAINT suppliers_email_not_blank    CHECK (email   IS NULL OR btrim(email)   <> ''),
  CONSTRAINT suppliers_phone_not_blank    CHECK (phone   IS NULL OR btrim(phone)   <> ''),
  CONSTRAINT suppliers_website_not_blank  CHECK (website IS NULL OR btrim(website) <> ''),
  CONSTRAINT suppliers_address_not_blank  CHECK (address IS NULL OR btrim(address) <> ''),
  CONSTRAINT suppliers_payment_terms_not_blank
    CHECK (payment_terms IS NULL OR btrim(payment_terms) <> ''),

  CONSTRAINT suppliers_updated_after_created CHECK (updated_at >= created_at)
);
--> statement-breakpoint

-- ===========================================================================
-- suppliers.contacts — TEDARIKCIDEKI KISI
-- ===========================================================================
-- `crm.contacts`in karsiligi, birebir.
--
-- ⚠️ `ON DELETE CASCADE` ve bu ADR-0040 §1.3'un KVKK girdisidir: silinen bir
-- tedarikcinin kisileri ve gorusmeleri ONUNLA BIRLIKTE gider ve bunu
-- VERITABANI garanti eder. Zincir sema icidir, yani FK MESRUDUR (Mutlak Kural
-- 5 CROSS-SCHEMA FK'yi yasaklar).
--
-- ⚠️ Vektor de bu zincirde: `interactions.embedding` ayni satirda yasadigi
-- icin silinen bir tedarikci AI'IN HAFIZASINDAN DA SILINIR — ADR-0031 §7'nin
-- YEDINCI uygulamasi ve CRM verisinin Knowledge'a yazilmamasinin ayni kaniti.
CREATE TABLE suppliers.contacts (
  id                 uuid          PRIMARY KEY,
  tenant_id          uuid          NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  supplier_id        uuid          NOT NULL REFERENCES suppliers.suppliers (id) ON DELETE CASCADE,

  full_name          text          NOT NULL,
  title              text,
  email              text,
  phone              text,

  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT supplier_contacts_full_name_not_blank CHECK (btrim(full_name) <> ''),
  CONSTRAINT supplier_contacts_title_not_blank CHECK (title IS NULL OR btrim(title) <> ''),
  CONSTRAINT supplier_contacts_email_not_blank CHECK (email IS NULL OR btrim(email) <> ''),
  CONSTRAINT supplier_contacts_phone_not_blank CHECK (phone IS NULL OR btrim(phone) <> ''),
  CONSTRAINT supplier_contacts_updated_after_created CHECK (updated_at >= created_at)
);
--> statement-breakpoint

-- ===========================================================================
-- suppliers.interactions — GORUSME GUNLUGU (ekleme-yalniz)
-- ===========================================================================
-- ⚠️ BU TABLODA `updated_at` YOKTUR (ADR-0040 §1) ve bu bir unutma DEGILDIR:
-- gorusme gunlugu EKLEME-YALNIZDIR (`supplier_interaction:create`, `write`
-- degil — ADR-0031 §6'nin ayni adlandirmasi). Guncellenmeyen bir satirin
-- guncellenme zamani olmaz; kolonu koymak, ileride birinin "demek ki
-- guncellenebiliyor" diye okuyacagi SESSIZ BIR DAVET olurdu.
--
-- ===========================================================================
-- ⚠️ BU, ADR-0039'UN "DEGISTIRILEMEZ DEFTERI" DEGILDIR — KARISTIRILMASIN
-- ===========================================================================
-- `inventory.movements` degistirilemez cunku BUGUNKU MIKTAR ondan TURETILIR;
-- gecmisi degistirmek bugunu SESSIZCE YENIDEN YAZARDI. Burada oyle bir sey
-- YOK: bu tablodan turetilen HICBIR SAYI yoktur. Gunluk yalnizca
-- GUNCELLENMIYOR — cunku bir gorusme olduktan sonra "degismis" olmaz.
--
-- Ayrimin pratik sonucu: burada uc katmanli bir koruma (izin yok + FK RESTRICT
-- + entity metodu yok) GEREKMEZ; tek gereken `update` metodunun ve `write`
-- izninin OLMAMASIDIR.
CREATE TABLE suppliers.interactions (
  id                 uuid          PRIMARY KEY,
  tenant_id          uuid          NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- ⚠️ NOT NULL: ADR-0031 §1.1'in gerekcesi aynen gecerli — "gorusme tanimi
  -- geregi bir sirketle yapilir." Bir tedarikciye bagli olmayan gorusme, bu
  -- modulun degil Knowledge'in kaydidir.
  supplier_id        uuid          NOT NULL REFERENCES suppliers.suppliers (id) ON DELETE CASCADE,

  -- =========================================================================
  -- ⚠️ `ON DELETE SET NULL` — `CASCADE` DEGIL (ADR-0040 §1.3)
  -- =========================================================================
  -- Bir KISININ silinmesi, KONUSULANIN KAYDINI silmemelidir. `CASCADE`
  -- olsaydi ayrilan bir satin alma sorumlusunun silinmesi, o tedarikciyle
  -- ilgili TUM kurumsal hafizayi goturur ve hata SESSIZ olurdu — kimse "birkac
  -- gorusme eksildi" diye fark etmez.
  --
  -- `crm.opportunities.contact_id` ile ayni kural.
  contact_id         uuid          REFERENCES suppliers.contacts (id) ON DELETE SET NULL,

  author_user_id     uuid          NOT NULL,

  -- `YYYY-MM-DD` — gorusmenin GERCEKLESTIGI gun. `crm.interactions.occurred_on`
  -- ile ayni tip: bir tedarikci gorusmesinin SAATI anlamli bir boyut degildir
  -- (randevunun aksine, ADR-0035 §2c).
  occurred_on        date          NOT NULL,

  -- =========================================================================
  -- ANLAMSAL YUZEY — VEKTORU AYNI SATIRDA (ADR-0040 §2.2)
  -- =========================================================================
  -- ⚠️ Ust sinir DOMAINDE zorlanir (`MAX_INTERACTION_BODY_CHARS` =
  -- `TARGET_CHUNK_CHARS`); asilirsa 422 doner ve SESSIZ KIRPMA YASAKTIR.
  --
  -- ⚠️ `embedding` NULLABLE ve bu bir ARIZA DEGIL, iki asamali yazma akisinin
  -- (T1 kayit / T2 vektor) dogal ara halidir: embedding cokerse GORUSME
  -- KAYBOLMAZ, yalnizca aranamaz kalir. TEK onarim yolu
  -- (`POST /suppliers/reindex`) hem bunu hem BAYAT baslikli vektorleri kapatir.
  body               text          NOT NULL,
  embedding          vector(1536),

  created_at         timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT supplier_interactions_body_not_blank CHECK (btrim(body) <> '')
);
--> statement-breakpoint

-- ===========================================================================
-- INDEX'LER
-- ===========================================================================
-- MT §12.3: bilesik index'te `tenant_id` DAIMA ilk kolon.

-- Tedarikci listesi alfabetiktir; sayfalama bunun uzerinden calisir.
CREATE INDEX suppliers_tenant_name_idx ON suppliers.suppliers (tenant_id, name);
--> statement-breakpoint

-- ⚠️ VERGI NO TEKILLIGI KUCUK/BUYUK HARFTEN BAGIMSIZ (§1.1). Kismi index:
-- vergi numarasi olmayan tedarikciler birbiriyle CAKISMAZ. (`NULL` degerler
-- tekillige zaten girmez, ama kismi yuklem NIYETI ACIKCA yazar.)
CREATE UNIQUE INDEX suppliers_tenant_tax_number_unique_idx
  ON suppliers.suppliers (tenant_id, lower(tax_number)) WHERE tax_number IS NOT NULL;
--> statement-breakpoint

-- "Bu tedarikcinin kisileri" — detay sayfasinin birincil sorgusu.
CREATE INDEX supplier_contacts_tenant_supplier_idx
  ON suppliers.contacts (tenant_id, supplier_id);
--> statement-breakpoint

-- "Bu tedarikciyle ne konustuk" — detay sayfasinin ikinci sorgusu, en yeni
-- once (`finance.transactions`in `desc` siralamasiyla ayni sinif: bir GECMIS
-- akisi, `appointments`in takvim `asc`i degil).
CREATE INDEX supplier_interactions_tenant_supplier_occurred_idx
  ON suppliers.interactions (tenant_id, supplier_id, occurred_on DESC);
--> statement-breakpoint

-- Tum tedarikciler arasinda "son ne konusuldu" akisi (`/suppliers/interactions`).
CREATE INDEX supplier_interactions_tenant_occurred_idx
  ON suppliers.interactions (tenant_id, occurred_on DESC);
--> statement-breakpoint

-- HNSW, IVFFlat DEGIL (ADR-0029 §1). Operator `vector_cosine_ops` — sorgudaki
-- `<=>` ile eslesmezse index DEVRE DISI kalir ve sorgu TAM TARAMA yapar;
-- sessiz bir performans coku.
CREATE INDEX supplier_interactions_embedding_idx
  ON suppliers.interactions USING hnsw (embedding vector_cosine_ops);
--> statement-breakpoint

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2). SAPMA YOK, YEDINCI KEZ.
--
-- `current_setting`'de `missing_ok` KULLANILMAZ: context kurulmamissa sorgu
-- SESSIZCE BOS DONMEZ, HATA VERIR (MT §12.6 madde 4).
--
-- ⚠️ Uc tablonun UCUNDE de. `contacts` ve `interactions` ebeveynleri uzerinden
-- zaten daralirdi — ama bu, korumayi bir JOIN'e ve yazan kisinin dikkatine
-- emanet etmek olurdu. `tenant_id` uc tabloda da DENORMALIZE ve uc politika da
-- BAGIMSIZ.
-- ===========================================================================
ALTER TABLE suppliers.suppliers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE suppliers.suppliers FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON suppliers.suppliers
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

ALTER TABLE suppliers.contacts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE suppliers.contacts FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON suppliers.contacts
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

ALTER TABLE suppliers.interactions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE suppliers.interactions FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON suppliers.interactions
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

-- Uygulama rolu: yalnizca DML. DDL yetkisi ASLA verilmez.
--
-- ⚠️ `interactions` uzerinde `UPDATE` DE veriliyor ve bu, ekleme-yalniz karariyla
-- CELISMEZ: vektor `UPDATE` ile yaziliyor (`setEmbedding` — ag cagrisi
-- transaction disinda kaldigi icin ikinci bir deyim). Ekleme-yalnizlik metnin
-- kendisi icindir ve UYGULAMA katmaninda tutulur: `update` metodu yok,
-- `supplier_interaction:write` izni yok, `PATCH` ucu yok.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON suppliers.suppliers    TO businessos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON suppliers.contacts     TO businessos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON suppliers.interactions TO businessos_app;
  END IF;
END
$$;
