-- ===========================================================================
-- invoicing semasi — Faz 5'in SEKIZINCI is modulu (ADR-0041 §1)
-- ===========================================================================
--
-- `platform` disindaki DOKUZUNCU sema (`knowledge`, `crm`, `projects`,
-- `finance`, `appointments`, `documents`, `inventory`, `suppliers`,
-- `invoicing`). Mutlak Kural 5: her modul kendi semasina sahiptir.
--
-- ROADMAP §3.5'in sekizinci sirasi: _"Finans uzantisi — 3'e bagimli, ondan once
-- gelemez."_
--
-- ===========================================================================
-- ⚠️ "FINANS UZANTISI" BIR KENAR DEGIL, BIR MIRASTIR (ADR-0041 §7.2)
-- ===========================================================================
-- Bu semada `finance` semasina isaret eden HICBIR kolon yoktur ve olmayacaktir.
-- Devralinan sey kod ya da satir degil, ALINMIS KARARLARDIR:
--
--     para `numeric`, `double precision` DEGIL      (ADR-0034 §2)
--     para birimi BELGE basina, satir basina DEGIL
--     kur cevrimi YOK — para birimleri TOPLANMAZ
--     para birimi yalnizca SEKIL olarak dogrulanir  (`^[A-Z]{3}$`)
--     tarih TAKVIM GUNUDUR (`date`), an degil
--
-- ⚠️ Kesilen bir fatura `finance.transactions`a satir YAZMAZ: o tablo
-- GERCEKLESMIS NAKIT HAREKETIDIR, tahakkuk degil. Fatura kesmek para almak
-- degildir. Tahsilat kapsam disidir (§12) ve geldiginde YONU BELIRSIZDIR —
-- ikisi ayni anda yazilirsa DONGU olur (Tenant <-> Identity tuzagi).
--
-- ===========================================================================
-- ⚠️ TEK BELGE TABLOSU + `kind` — IKI TABLO REDDEDILDI (ADR-0041 §1.1)
-- ===========================================================================
-- Emsal dogrudan ADR-0034 §5'tir: gelir ve gider tek `finance.transactions`
-- tablosunda yasar ve `direction` kolonuyla ayrilir. Ayni sekil, IKINCI kez.
--
-- ⚠️ Ama riskin SEKLI oradakinden ZAYIFTIR ve karari bu belirledi:
--
--     `direction` unutulur -> SESSIZ ve MAKUL GORUNEN YANLIS BIR SAYI
--                             (gider gelir gibi toplanir, ekran bir rakam
--                             gosterir, hicbir sey patlamaz)
--     `kind` unutulur      -> fatura listesinde TEKLIFLER gorunur; ekranda
--                             DERHAL goze carpar, bir sayiyi bozmaz
--
-- Yani ADR-0034 tek tabloyu DAHA TEHLIKELI bir durumda secti; burada
-- secmemek tutarsizlik olurdu. Riski uc mekanizma bagliyor: repository'de
-- genel bir `list()` YOKTUR (her metot turunu ADINDA tasir), asagidaki
-- `kind`-bagimli CHECK'ler ve bir entegrasyon testi.
--
-- ===========================================================================
-- ⚠️ TABLO ADI `sales_documents`, `documents` DEGIL
-- ===========================================================================
-- `invoicing.documents` sema-nitelenmis oldugu icin YASALDI ama
-- `documents.documents` ile yan yana okundugunda iki farkli kavrami ayni
-- kelimeyle adlandirirdi. Ayni belirsizlik izin tarafinda da REDDEDILDI:
-- `document:read` Belge modulunun IZNIDIR (§9.1) ve bu modulunkiler
-- `quote:*` / `invoice:*`tir.
--
-- ===========================================================================
-- ⚠️ BU MIGRATION'DA VEKTOR YOKTUR — ve bu Faz 5'te BIR ILKTIR (§5)
-- ===========================================================================
-- Sekiz modulun sekizi de bir `vector(1536)` kolonu ya da bir chunk tablosu
-- acmisti. Burada HICBIRI yok: bir teklif kalemi ("M8 civata · 500 adet ·
-- 12,50") ADR-0034 §6.1'in tarif ettigi seyin ta kendisidir — yuzlerce
-- neredeyse OZDES kisa vektor, K=8'lik top-K havuzunu kirletir ve diger
-- kaynaklarin en iyi parcalarini disari iter.
--
-- Bu modulun kurumsal hafizaya katkisi ANLAMSAL degil YAPISALDIR
-- (`invoicing-pipeline`): cevabi bir metinde degil `status` · `valid_until` ·
-- `converted_from_id` kolonlarinin ARITMETIGINDE yazar.

CREATE SCHEMA IF NOT EXISTS invoicing;
--> statement-breakpoint

-- Uygulama rolu semayi gorur ama icinde nesne OLUSTURAMAZ (02-schemas.sql
-- deseni; sekiz onceki sema ile birebir ayni).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT USAGE ON SCHEMA invoicing TO businessos_app;
  END IF;
END
$$;
--> statement-breakpoint

-- ===========================================================================
-- invoicing.sales_documents — TEKLIF ve FATURA TASLAGI, TEK TABLO
-- ===========================================================================
CREATE TABLE invoicing.sales_documents (
  id                 uuid          PRIMARY KEY,
  tenant_id          uuid          NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- =========================================================================
  -- `kind` — 'quote' | 'invoice'
  -- =========================================================================
  -- ⚠️ Gecerli DURUM KUMESI bu kolona BAGLIDIR (asagidaki CHECK). Yani
  -- "faturaya `accepted` yazmak" ya da "teklife `issued` yazmak" veritabani
  -- seviyesinde IMKANSIZDIR — uygulamayi ATLAYAN her yol da baglanir.
  kind               text          NOT NULL,

  -- =========================================================================
  -- BELGE NUMARASI — TASLAKTA `NULL` (ADR-0041 §1.6)
  -- =========================================================================
  -- Numara, belge DISARI CIKTIGI an uretilir (teklif `sent`, fatura `issued`).
  -- Taslakta uretilseydi silinen her taslak bir numara YAKARDI ve kullanici
  -- numaralar arasindaki bosluklari HATA SANARDI.
  --
  -- ⚠️ Uretim `invoicing.number_sequences` uzerinden ve `SELECT ... FOR UPDATE`
  -- kilidiyle yapilir — ADR-0039 §3.2'nin fiziksel sayim kilidinin IKINCI
  -- uygulamasi. `max(number) + 1` REDDEDILDI: silinen bir taslaktan sonra
  -- numarayi YENIDEN KULLANIRDI ve iki belge zaman icinde ayni numarayi
  -- tasirdi — hata BIZIM GOREMEDIGIMIZ yerde, musterinin elinde ortaya cikardi.
  number             text,

  -- Gecerli kume `kind`'a bagli (asagidaki CHECK).
  status             text          NOT NULL,

  -- =========================================================================
  -- CROSS-MODUL: CIPLAK `uuid`, FK YOK (ADR-0041 §7.1)
  -- =========================================================================
  -- Cross-schema FK YASAK (Mutlak Kural 5). Adlar `CompanyDirectory` /
  -- `ContactDirectory` uzerinden CALISMA ZAMANINDA cozulur ve izin kapisi
  -- (`company:read` / `contact:read`) O ARAYUZLERIN ICINDEDIR.
  --
  -- ⚠️ `crm.public.ts` BU ISTE TEK SATIR DEGISMEDI: iki dizin de zaten vardi
  -- (`CompanyDirectory`yi Projeler, `ContactDirectory`yi Randevu yazdi).
  -- ADR-0037 §4.1'in kurali — "yeni TALIP -> dosya degismez" — IKINCI kez
  -- talip tarafindan dogrulandi.
  --
  -- ⚠️ Sarkan isaretci TOLERE EDILIR (ADR-0033 §2d, ALTINCI kez) ve burada
  -- BEDELI YOKTUR: belgeye basilan ad `customer_name` kolonunda durur, yani
  -- silinen bir sirket belgeyi OKUNAMAZ HALE GETIRMEZ.
  company_id         uuid,
  contact_id         uuid,

  -- =========================================================================
  -- ⚠️ `customer_name` DENORMALIZE — KURALIN ISTISNASI DEGIL, SINIRI (§1.5)
  -- =========================================================================
  -- Projede bes kez "ad denormalize edilmez, dizinden okunur" karari verildi
  -- (ADR-0033 §2b). Burada KOLONDA saklaniyor ve gerekce bir taviz degil,
  -- kuralin kapsaminin dogru okunmasidir:
  --
  --     DENORMALIZASYON YASAGI *TURETILEBILIR* BILGI ICINDIR.
  --     GONDERILMIS BIR BELGEDEKI AD TURETILEBILIR DEGILDIR —
  --     O AN DONDURULMUSTUR.
  --
  -- Bir teklifi "Yildiz Ltd." adina gonderdiyseniz ve musteri ertesi ay unvan
  -- degistirdiyse, GECMIS BELGE ESKI ADI GOSTERMEYE DEVAM ETMELIDIR. Dizinden
  -- okunsaydi belge GERIYE DONUK DEGISIRDI — musterinin elindeki kagitla
  -- sistemdeki kayit ayrisirdi ve hata SESSIZ olurdu.
  --
  -- ⚠️ `NOT NULL` ama `company_id` `NULL` olabilir: CRM'de kayitli olmayan bir
  -- musteriye teklif yazmak MESRUDUR. Zorunlu kilmak, ADR-0033'un sahte "Genel"
  -- projesi ve ADR-0034'un sahte kategorisi dersinin UCUNCU tekrari olurdu.
  customer_name      text          NOT NULL,

  -- TAKVIM GUNU (`date`), an DEGIL — projede BESINCI kez ayni karar. Tenant
  -- bazli saat dilimi sorusunu tumuyle ortadan kaldirir.
  issued_on          date          NOT NULL,

  -- ⚠️ YALNIZCA teklif (CHECK). "Suresi dolmus" bir DURUM DEGILDIR (§1.3'un
  -- ayni disiplini): `valid_until < CURRENT_DATE AND status = 'sent'` her
  -- okumada TURETILIR. Bir `expired` durumu, onu yazacak bir zamanlanmis is
  -- gerektirirdi ve o is bir gun kacirildiginda ekran SESSIZCE yanlis olurdu.
  valid_until        date,

  -- ⚠️ YALNIZCA fatura (CHECK).
  due_on             date,

  -- ⚠️ BELGE BASINA TEK PARA BIRIMI (§1.4). Iki para birimli bir belgenin
  -- TOPLAMI YOKTUR (ADR-0034'un ayni kurali); zorlamak yerine kullaniciya iki
  -- belge yazdirmak, yanlis bir tek rakam uretmekten iyidir.
  currency           text          NOT NULL,

  -- ⚠️ EMBED EDILMEZ (§5): bir teklifin serbest metni cogunlukla STANDART
  -- KOSUL METNIDIR ("fiyatlarimiz 30 gun gecerlidir") — anlatisal degil MATBU.
  notes              text,

  -- =========================================================================
  -- ⚠️ "FATURAYA DONUSTUR" — OK FATURA -> TEKLIF (ADR-0041 §3)
  -- =========================================================================
  -- Kolon YENI FATURADA durur. Tersi (teklifte bir `invoice_id`) teklifi
  -- DEGISTIRMEK olurdu ve §2'yi delerdi — oysa donusturmenin butun vaadi
  -- "teklife tek kolon yazilmaz"dir.
  --
  -- ⚠️ `ON DELETE RESTRICT`: bir faturaya kaynaklik eden teklif SILINEMEZ.
  -- (`accepted` bir teklif zaten silinemez — §2; kisit IKINCI dayanaktir.)
  --
  -- ⚠️ IKINCI KEZ DONUSTURME ENGELLENMEZ: bir teklif iki faturaya bolunebilir
  -- (kismi teslimat) ve bu mesru bir istir. Bedeli kayitli: "bu teklifin ne
  -- kadari faturalandi" sorusu v1'de SORULAMAZ.
  converted_from_id  uuid          REFERENCES invoicing.sales_documents (id) ON DELETE RESTRICT,

  created_by_user_id uuid          NOT NULL,

  -- =========================================================================
  -- ⚠️ AKTOR DAMGALARI — BU BIR DENETIM IZI DEGILDIR (ADR-0041 §8.2)
  -- =========================================================================
  -- `platform/audit` BU ISTE ACILMADI (§8, Product Owner karari). Sorunun
  -- BUYUK KISMI §2 ile ortadan kalkiyor: gonderilmis bir belgenin tutari
  -- DEGISMEZ, yani "kim degistirdi" diye bir soru YOKTUR — olay OLMAZ.
  --
  -- Geriye kalan sey DURUM GECISLERIDIR ve cevabi asagidaki dort kolondur.
  -- ⚠️ Bir OLAY GUNLUGU DEGIL, satirin kendi uzerindeki DORT DAMGADIR: bir
  -- olay gunlugu "ne oldu"yu sirasiyla anlatir, damga yalnizca SON DURUMU
  -- soyler.
  --
  -- ⚠️ ACIKTA KALAN, ertelemenin durust bedeli: TASLAK uzerindeki duzenlemeler
  -- IZLENMEZ ve silinen bir taslak IZ BIRAKMAZ. Kabul edildi — taslak henuz
  -- DISARI CIKMAMISTIR. ADR-0034 / 0039 / 0040'in borclari ACIK KALIR; bu
  -- migration onlari DEVRALMAZ. Tetikleyici 9. module (IK — KVKK) ve
  -- odeme/tahsilat gunune YENIDEN ADRESLENDI.
  sent_at            timestamptz,
  sent_by_user_id    uuid,
  decided_at         timestamptz,
  decided_by_user_id uuid,

  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT sales_documents_kind_valid CHECK (kind IN ('quote', 'invoice')),

  -- ⚠️ GECERLI DURUM KUMESI `kind`'A BAGLI. Tek bir CHECK iki durum makinesini
  -- birden tasir ve TEK TABLO karariniin (§1.1) bedelini veritabani seviyesinde
  -- oder: yanlis eslesme UYGULAMAYA HIC ULASMADAN reddedilir.
  CONSTRAINT sales_documents_status_valid CHECK (
    (kind = 'quote'   AND status IN ('draft', 'sent', 'accepted', 'rejected')) OR
    (kind = 'invoice' AND status IN ('draft', 'issued', 'cancelled'))
  ),

  -- ⚠️ `valid_until` YALNIZCA teklifte, `due_on` ve `converted_from_id`
  -- YALNIZCA faturada. Tek tablonun "kind'a bagli alan" riskini kapatan sey
  -- tam olarak bu iki satirdir.
  CONSTRAINT sales_documents_quote_only_fields CHECK (
    kind = 'quote' OR valid_until IS NULL
  ),
  CONSTRAINT sales_documents_invoice_only_fields CHECK (
    kind = 'invoice' OR (due_on IS NULL AND converted_from_id IS NULL)
  ),

  -- ⚠️ Bir belge KENDISINDEN turetilemez.
  CONSTRAINT sales_documents_not_self_converted CHECK (
    converted_from_id IS NULL OR converted_from_id <> id
  ),

  CONSTRAINT sales_documents_customer_name_not_blank CHECK (btrim(customer_name) <> ''),
  CONSTRAINT sales_documents_number_not_blank
    CHECK (number IS NULL OR btrim(number) <> ''),
  CONSTRAINT sales_documents_notes_not_blank
    CHECK (notes IS NULL OR btrim(notes) <> ''),

  -- Sekil dogrulanir, KOD LISTESI dogrulanmaz — ADR-0034'un ayni karari.
  -- ⚠️ Bedeli acikca: "XYZ" gecerli sayilir.
  CONSTRAINT sales_documents_currency_shape CHECK (currency ~ '^[A-Z]{3}$'),

  CONSTRAINT sales_documents_updated_after_created CHECK (updated_at >= created_at)
);
--> statement-breakpoint

-- ===========================================================================
-- invoicing.sales_document_lines — SATIR KALEMLERI
-- ===========================================================================
-- ⚠️ TOPLAM KOLONU YOKTUR — ne satirda ne baslikta (ADR-0041 §1.3). Projede
-- ONUNCU kez ayni karar (`finance.balances`in reddi, `inventory.items.quantity`
-- reddi, `ends_at` reddi, durgunlugun turetilmesi...).
--
-- ⚠️ "Gonderilmis belgenin toplami DONDURULMALI" itirazinin cevabi bir KOLON
-- DEGIL, §2'dir: gonderilmis belgenin kalemleri DEGISTIRILEMEZ, yani kaynak
-- degismiyorsa turetilen deger de degismez. Donduran sey bir KOPYA degil BIR
-- KISITTIR. Bir `total` kolonu tam tersi riski dogururdu: kalem degisir, kolon
-- guncellenmeyi unutur, ekran IKI FARKLI DOGRU gosterir.
CREATE TABLE invoicing.sales_document_lines (
  id                 uuid          PRIMARY KEY,
  tenant_id          uuid          NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- Sema ici FK — MESRU (Mutlak Kural 5 yalnizca CROSS-SCHEMA FK'yi yasaklar).
  -- `CASCADE`: belgesiz bir satir ANLAMSIZDIR.
  document_id        uuid          NOT NULL REFERENCES invoicing.sales_documents (id) ON DELETE CASCADE,

  -- Kullanicinin verdigi SIRA. Belgede satirlarin sirasi ANLAMLIDIR ve
  -- `created_at`e birakilamaz (ayni islemde yazilan satirlar ayni ani tasir).
  position           integer       NOT NULL,

  -- =========================================================================
  -- ⚠️ SERBEST METIN — stok kalemine BAGLI DEGIL (ADR-0041 §7.3)
  -- =========================================================================
  -- `stock_item_id` diye bir kolon ARANMASIN. Aday DEGERLENDIRILDI ve
  -- REDDEDILDI; ADR-0039 §9.1 dizini kimin yazacagini yazmis olsa bile:
  --
  --   (a) baglantinin dogal beklentisi STOK DUSULMESIDIR ve o, bu modulun
  --       envanterin DOGRULUGUNDAN SORUMLU olmasi demektir — tek bir kolon
  --       degil, BIR MODULUN ANLAMININ GENISLEMESI,
  --   (b) fiyat orada YOK (ADR-0039 §12 maliyeti kapsam disi birakti), yani
  --       dizinden gelecek sey yalnizca ad ve birimdir,
  --   (c) zorunlu kilinsaydi SAHTE KALEM uretirdi: bir danismanlik saati, bir
  --       kargo bedeli ya da "ozel imalat" bir stok kalemi DEGILDIR.
  --
  -- ⚠️ O gun geldiginde dizini YINE STOK YAZAR — talip degil SAHIP.
  description        text          NOT NULL,

  -- ⚠️ HER ZAMAN POZITIF. JS'te `string` kalir (`quantity.ts` / `money.ts`
  -- karari, ucuncu kez): bir kez `number`a cevrilse yuvarlama hatasi KALICI
  -- olurdu ve ciktisi bir PARA RAKAMIDIR.
  quantity           numeric(14,3) NOT NULL,

  -- Serbest metin (`inventory.items.unit` ile ayni karar — hicbir sey zorlamaz).
  unit               text,

  -- =========================================================================
  -- ⚠️ ISARET KISITI YOKTUR — VE BU ADR-0034 §5'E AYKIRI DEGIL (§1.7)
  -- =========================================================================
  -- Negatif birim fiyat MESRUDUR: bir iskonto satiri ("Sadakat indirimi × 1 ×
  -- -500") gercek bir belge satiridir ve alternatifi ayri bir `discount` kolonu
  -- + ayri bir hesaplama kuralidir.
  --
  -- ADR-0034'un reddettigi sey BU DEGILDIR: orada isaret bir ANLAM EKSENI
  -- tasiyordu (gelir mi gider mi) ve isareti unutmak kaydin TURUNU
  -- degistiriyordu. Burada isaret yalnizca ARITMETIKTIR ve sonucu BELGENIN
  -- UZERINDE YAZILIDIR — kullanici onu okur, gizli bir ozet rakami degildir.
  unit_price         numeric(14,2) NOT NULL,

  -- =========================================================================
  -- ⚠️ `tax_rate` BIR SAYIDIR, BIR KURAL DEGIL (ADR-0041 §1.8)
  -- =========================================================================
  -- Sistem hicbir vergi KURALI bilmez: muafiyet, tevkifat, ulke bazli oran,
  -- istisna kodu — hicbiri yoktur. Oran KULLANICININ YAZDIGI BIR SAYIDIR;
  -- sistem yalnizca CARPAR. ADR-0034'un "vergi hesabi kapsam disi" siniri
  -- KORUNUR.
  tax_rate           numeric(5,2)  NOT NULL DEFAULT 0,

  created_at         timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT sales_document_lines_description_not_blank CHECK (btrim(description) <> ''),
  CONSTRAINT sales_document_lines_unit_not_blank CHECK (unit IS NULL OR btrim(unit) <> ''),
  CONSTRAINT sales_document_lines_quantity_positive CHECK (quantity > 0),
  CONSTRAINT sales_document_lines_position_positive CHECK (position > 0),
  CONSTRAINT sales_document_lines_tax_rate_range CHECK (tax_rate >= 0 AND tax_rate <= 100)
);
--> statement-breakpoint

-- ===========================================================================
-- invoicing.number_sequences — BELGE NUMARASI SAYACI
-- ===========================================================================
-- ⚠️ RETENTION LISTESINE GIRMEZ (ADR-0041 §1.6): tenant + tur basina IKI SATIR,
-- ebediyen. Yil numaranin ICINDE YOKTUR (belgenin tarihi zaten `issued_on`da),
-- yani sayac YILA GORE DE COGALMAZ.
--
-- ROADMAP §8.5'in kendi olcutu — _"borcu doguran sey satirin ZAMANLA
-- COGALMASIDIR"_ — ADR-0040'in kapanis denetiminde ogrenildigi gibi ILK GUNDEN
-- uygulandi: borcu OLDUGUNDAN BUYUK gostermemek.
CREATE TABLE invoicing.number_sequences (
  tenant_id          uuid          NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,
  kind               text          NOT NULL,

  -- Bir sonraki numara. ⚠️ GERI ALINMAZ: iptal edilen bir kesim numarasini
  -- geri vermez ve bosluk olusabilir. BU DOGRUDUR — bosluk GORUNUR, tekrar
  -- GORUNMEZ.
  next_value         integer       NOT NULL DEFAULT 1,

  updated_at         timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT number_sequences_pkey PRIMARY KEY (tenant_id, kind),
  CONSTRAINT number_sequences_kind_valid CHECK (kind IN ('quote', 'invoice')),
  CONSTRAINT number_sequences_next_value_positive CHECK (next_value > 0)
);
--> statement-breakpoint

-- ===========================================================================
-- ⚠️ UCUNCU KATMAN: DEGISTIRILEMEZLIK TRIGGER'I (ADR-0041 §2)
-- ===========================================================================
-- Koruma UC KATMANLIDIR ve ucuncusu SART:
--
--     domain      -> `SalesDocument.replaceLines()` `draft` disinda firlatir
--     uc          -> `PATCH`/`DELETE` yalnizca `draft`ta; aksi halde 409
--     VERITABANI  -> bu trigger
--
-- ⚠️ Ucuncusu neden SART: KALEMLER AYRI BIR TABLODADIR, yani baslik uzerindeki
-- bir kontrol onlari KAPSAMAZ. Tek bir yeni yazma yolu (ileride bir toplu
-- duzenleme, bir goc betigi) kontrolu atlarsa hata SESSIZ olur: gonderilmis bir
-- belgenin toplami degisir ve KIMSE FARK ETMEZ.
--
-- ⚠️ ADR-0039'un DEGISTIRILEMEZ DEFTERIYLE KARISTIRILMASIN: orada koruma HER
-- ZAMAN gecerliydi cunku BUGUNKU MIKTAR o defterden turetiliyordu. Burada
-- koruma YALNIZCA `draft` SONRASI gecerlidir — taslak serbestce duzenlenir.
CREATE FUNCTION invoicing.assert_document_editable() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_id     uuid;
  parent_status text;
BEGIN
  target_id := COALESCE(NEW.document_id, OLD.document_id);

  SELECT status INTO parent_status
    FROM invoicing.sales_documents
   WHERE id = target_id;

  -- ⚠️ EBEVEYN YOKSA IZIN VER — ve bu satir DEKORATIF DEGILDIR.
  -- `ON DELETE CASCADE` ile bir belge silindiginde PostgreSQL once ebeveyni
  -- siler, SONRA cocuklara `DELETE` uygular. O anda ebeveyn ARTIK GORUNMEZ ve
  -- bu dal calisir. Olmasaydi, `draft` OLMAYAN bir belgenin silinmesi
  -- (ornegin tenant temizligi ya da ileride bir retention isi) kendi
  -- trigger'ina takilirdi.
  IF parent_status IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF parent_status <> 'draft' THEN
    RAISE EXCEPTION
      'sales document % is not editable (status=%)', target_id, parent_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
--> statement-breakpoint

CREATE TRIGGER sales_document_lines_immutable_after_send
  BEFORE INSERT OR UPDATE OR DELETE ON invoicing.sales_document_lines
  FOR EACH ROW EXECUTE FUNCTION invoicing.assert_document_editable();
--> statement-breakpoint

-- ===========================================================================
-- INDEX'LER
-- ===========================================================================
-- MT §12.3: bilesik index'te `tenant_id` DAIMA ilk kolon.

-- Liste ekranlarinin birincil sorgusu: "bu turden belgeler, en yeni once".
CREATE INDEX sales_documents_tenant_kind_issued_idx
  ON invoicing.sales_documents (tenant_id, kind, issued_on DESC);
--> statement-breakpoint

-- Yapisal katkicinin (`invoicing-pipeline`) sorgusu durum uzerinden gider.
CREATE INDEX sales_documents_tenant_kind_status_idx
  ON invoicing.sales_documents (tenant_id, kind, status);
--> statement-breakpoint

-- ⚠️ BELGE NUMARASI TENANT + TUR ICINDE TEKILDIR. Kismi index: taslaklar
-- (numarasiz) birbiriyle CAKISMAZ.
CREATE UNIQUE INDEX sales_documents_tenant_kind_number_unique_idx
  ON invoicing.sales_documents (tenant_id, kind, number) WHERE number IS NOT NULL;
--> statement-breakpoint

-- ⚠️ "Kabul edilmis ama FATURALANMAMIS teklif" sorgusu bir `NOT EXISTS` ile
-- bu kolonu tarar — yapisal katkicinin EN YUKSEK SKORLU (0.95) satiri.
CREATE INDEX sales_documents_tenant_converted_from_idx
  ON invoicing.sales_documents (tenant_id, converted_from_id)
  WHERE converted_from_id IS NOT NULL;
--> statement-breakpoint

-- Musteri detayindan "bu musteriye kestigimiz belgeler".
CREATE INDEX sales_documents_tenant_company_idx
  ON invoicing.sales_documents (tenant_id, company_id) WHERE company_id IS NOT NULL;
--> statement-breakpoint

-- ⚠️ Satirlar HER ZAMAN belge + sira ile okunur; tekillik siranin
-- KULLANICI TARAFINDAN gorulen anlamini korur.
CREATE UNIQUE INDEX sales_document_lines_document_position_unique_idx
  ON invoicing.sales_document_lines (tenant_id, document_id, position);
--> statement-breakpoint

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2). SAPMA YOK, SEKIZINCI KEZ.
--
-- `current_setting`'de `missing_ok` KULLANILMAZ: context kurulmamissa sorgu
-- SESSIZCE BOS DONMEZ, HATA VERIR (MT §12.6 madde 4).
--
-- ⚠️ UC TABLONUN UCUNDE de — `number_sequences` DAHIL. Sayac tablosu "ic bir
-- ayrinti" gibi gorunur ama tenant BASINA satir tasir: RLS'siz birakilsaydi
-- bir tenant'in numara sayaci BASKA BIR TENANT tarafindan ilerletilebilirdi.
-- ===========================================================================
ALTER TABLE invoicing.sales_documents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invoicing.sales_documents FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON invoicing.sales_documents
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

ALTER TABLE invoicing.sales_document_lines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invoicing.sales_document_lines FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON invoicing.sales_document_lines
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

ALTER TABLE invoicing.number_sequences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invoicing.number_sequences FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON invoicing.number_sequences
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

-- Uygulama rolu: yalnizca DML. DDL yetkisi ASLA verilmez.
--
-- ⚠️ `sales_document_lines` uzerinde `UPDATE`/`DELETE` VERILIYOR ve bu,
-- degistirilemezlik karariyla CELISMEZ: taslak satirlari duzenlenebilir
-- olmak ZORUNDADIR. Gonderilmis belgeyi koruyan sey grant degil TRIGGER'dir —
-- ve trigger, grant'in aksine DURUMA bakar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON invoicing.sales_documents      TO businessos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON invoicing.sales_document_lines TO businessos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON invoicing.number_sequences     TO businessos_app;
  END IF;
END
$$;
