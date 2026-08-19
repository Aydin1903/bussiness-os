-- ===========================================================================
-- inventory semasi — Faz 5'in ALTINCI is modulu (ADR-0039 §1, §2, §3)
-- ===========================================================================
--
-- `platform` disindaki YEDINCI sema (`knowledge`, `crm`, `projects`, `finance`,
-- `appointments`, `documents`, `inventory`). Mutlak Kural 5: her modul kendi
-- semasina sahiptir.
--
-- ===========================================================================
-- ⚠️ BU MIGRATION'IN EN ONEMLI OZELLIGI BIR KOLONUN YOKLUGUDUR
-- ===========================================================================
-- `inventory.items`te `quantity_on_hand` DIYE BIR KOLON YOKTUR (ADR-0039 §2).
-- Mevcut miktar HER OKUMADA `movements`tan turetilir:
--
--     COALESCE(SUM(CASE WHEN direction = 'in' THEN quantity ELSE -quantity END), 0)
--
-- Projede DOKUZUNCU kez verilen ayni karar (`last_activity_at`in reddi,
-- `finance.balances`in reddi, `ends_at`in reddi, `daily_report_runs.status`un
-- reddi ...) — ama ILK KEZ GERCEK BIR BEDELLE: onceki sekizinde turetme ya ayni
-- satirin iki kolonundan ya da kucuk bir kumeden yapiliyordu; burada
-- SINIRSIZ BUYUYEN bir defter taraniyor.
--
-- Karari veren sey HATANIN SEKLIDIR: bir kolon tutulsaydi, onu guncellemeyi
-- unutan bir yazma yolu SESSIZ ve MAKUL GORUNEN yanlis bir sayi uretirdi ve
-- kimse fark etmezdi — ta ki fiziksel sayimda tutmayana kadar. Turetmede en
-- kotu bozulma YAVASLIKTIR; yavaslik olculebilir ve kendini soyler.
--
-- ⚠️ Ikinci kazanci: ES ZAMANLILIK. Ayni kaleme yazilan iki hareket birbiriyle
-- HIC CARPISMAZ (iki bagimsiz `INSERT`). Bir miktar kolonu olsaydi her hareket
-- ayni satiri okuyup yazardi.
--
-- ⚠️ Yon TEKTIR: turetmeden onbellege gecmek her zaman mumkundur; kolonla
-- baslanip deftere gecilirse HIC YAZILMAMIS hareket gecmisi geri uretilemez.
--
-- ===========================================================================
-- ⚠️ IKINCI ONEMLI KARAR: "DUZELTME" UCUNCU BIR YON DEGILDIR (ADR-0039 §3)
-- ===========================================================================
-- `direction` YALNIZCA `in`/`out` alir ve `quantity` HER ZAMAN POZITIFTIR.
-- Uc degerli bir `kind` (`in`/`out`/`adjustment`) reddedildi cunku
-- `adjustment` miktarin HANGI YONE gittigini soylemez; ya isaretli bir miktar
-- (ADR-0034 §5'in ACIKCA reddettigi — isaret koymayi unutan bir yol cikisi
-- giris gibi toplar, hata SESSIZDIR) ya da satir bazinda ANLAM DEGISTIREN
-- nullable bir `direction` gerekirdi.
--
-- Sebep ayri bir kolonda yasar: `is_correction`.

CREATE SCHEMA IF NOT EXISTS inventory;
--> statement-breakpoint

-- Uygulama rolu semayi gorur ama icinde nesne OLUSTURAMAZ (02-schemas.sql
-- deseni; alti onceki sema ile birebir ayni).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT USAGE ON SCHEMA inventory TO businessos_app;
  END IF;
END
$$;
--> statement-breakpoint

-- ===========================================================================
-- inventory.items — bir stok KALEMININ TANIMI
-- ===========================================================================
-- ⚠️ Bu tablo kalemin NE OLDUGUNU tutar, NE KADAR OLDUGUNU DEGIL. Miktar
-- `movements`tan turetilir (yukari bakiniz).
CREATE TABLE inventory.items (
  id                 uuid          PRIMARY KEY,
  tenant_id          uuid          NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  name               text          NOT NULL,

  -- =========================================================================
  -- SKU — OPSIYONEL, ama VARSA KUCUK/BUYUK HARFTEN BAGIMSIZ TEKIL (§1.1)
  -- =========================================================================
  -- Nullable, cunku kucuk bir isletme SKU kullanmayabilir; zorunlu olsaydi
  -- kullanici `1`, `2`, `3` yazardi ve alan ANLAMSIZLASIRDI.
  --
  -- ⚠️ Tekillik `lower(sku)` uzerindedir. `ABC-1` ile `abc-1`in IKI AYRI kalem
  -- olmasi tam olarak bu projenin reddettigi turden bir hatadir: ekran calisir,
  -- iki satir yan yana durur ve STOK IKIYE BOLUNUR. Hata sessizdir; yalnizca
  -- "neden hep eksik cikiyoruz" sorusuyla fark edilir.
  sku                text,

  -- =========================================================================
  -- BIRIM SERBEST METINDIR — enum de tenant sozlugu de DEGIL (ADR-0039 §4)
  -- =========================================================================
  -- Olcut projede ucuncu kez ayni: KOLON BIR KISIT TASIYOR MU?
  --
  --   `appointments.status`  -> kodda enum   (dort hal her sektorde ayni sey)
  --   `finance.categories`   -> tenant tablosu (yon BILESIK FK ile ondan zorlanir)
  --   `documents.tags`       -> serbest metin (hicbir sey zorlamiyor)
  --   `inventory.items.unit` -> SERBEST METIN (hicbir sey zorlamiyor)
  --
  -- Birim ne filtrelenir ne toplanir; yalnizca OKUNUR. Bir tenant sozlugu
  -- olsaydi bir tablo + FK + "kullanimda" hatasi + yonetim ekrani, TASIDIGI
  -- TEK KISIT ICIN odenirdi: hicbiri.
  --
  -- ⚠️ Kabul edilen bedel: `kg`, `Kg` ve `kilogram` yan yana yasayabilir.
  -- Cozumu bir tablo degil, arayuzde ONERI LISTESIDIR.
  --
  -- ⚠️ BUNUN DOGRUDAN SONUCU: farkli kalemlerin miktarlari TOPLANMAZ. 3 kg un
  -- ile 12 adet vidanin toplami YOKTUR — ADR-0034'un "farkli para birimleri
  -- toplanmaz" kuralinin ayni sekli, ikinci kez. Modulde "toplam stok" diye bir
  -- rakam BULUNMAZ.
  unit               text          NOT NULL,

  -- =========================================================================
  -- ESIK — NULLABLE, ve `NULL` ile `0` FARKLI SEYLERDIR (ADR-0039 §6.1)
  -- =========================================================================
  --   NULL -> bu kalem IZLENMIYOR; hicbir zaman alarm uretmez
  --   0    -> TUKENDIGINDE haber ver (miktar <= 0)
  --
  -- ⚠️ Esigi zorunlu kilsaydik kullanici `0` yazardi ve "izlenmiyor" hali
  -- YAPILANDIRILMIS GIBI gorunurdu — iki farkli olguyu tek degere sikistirmanin
  -- bu moduldeki karsiligi.
  min_quantity       numeric(14,3),

  -- =========================================================================
  -- ANLAMSAL YUZEY — VE VEKTORU AYNI SATIRDA (ADR-0039 §5)
  -- =========================================================================
  -- ⚠️ CHUNK TABLOSU YOK. Bu, ADR-0035'in (Randevu) deseni; ADR-0037'nin
  -- (Belge) degil. Iki ADR'nin birlikte urettigi kural: _chunk tablosu, metnin
  -- ust sinirini KULLANICI degil VERININ KENDISI belirliyorsa acilir._
  --
  -- Stok notu birinci gruptadir: "parti no X, tedarikci Y" bir KIMLIK NOTUDUR,
  -- bir anlati degil. Ust sinirini BIZ koyariz (`TARGET_CHUNK_CHARS`) ve
  -- parcalayici bu sinirin altinda HER ZAMAN tek parca uretirdi.
  --
  -- ⚠️ Bedeli: sinir SUNUCUDA zorlanir ve asilirsa 422 doner. SESSIZ KIRPMA
  -- YASAK — kirpsaydi kullanici notunun yarisinin arandigini HIC ogrenemezdi.
  --
  -- ⚠️ `embedding` NULLABLE ve bu bir ARIZA DEGIL NORMALDIR: notsuz kalem cok
  -- yaygin olacaktir (bir vidanin notu olmaz). Ayni kolon "gomulememis" halini
  -- de tasir ve TEK onarim yolu (`POST /inventory/reindex`) ikisini birden
  -- kapatir.
  note               text,
  embedding          vector(1536),

  -- =========================================================================
  -- ARSIVLEME — SILME DEGIL (ADR-0039 §3.4)
  -- =========================================================================
  -- Hareketi olan bir kalem SILINEMEZ (asagidaki FK bunu VERITABANI
  -- SEVIYESINDE zorlar). Kullanimdan kalkan kalem ARSIVLENIR.
  --
  -- ⚠️ Arsivlenmis kalem yapisal katkiciya GIRMEZ: arsivlenmis bir kalemin
  -- stogunun azalmasi HABER DEGILDIR.
  archived_at        timestamptz,

  -- ⚠️ Yalnizca OLUSTURANI tutar; degisiklik denetim izi DEGILDIR (ADR-0039
  -- § Bilinen sinirlar — `platform/audit` borcu, tetikleyici 8. modul).
  -- Cross-schema FK yasak: `platform.users` baska bir modulun tablosudur.
  created_by_user_id uuid,

  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT items_name_not_blank    CHECK (btrim(name) <> ''),
  CONSTRAINT items_unit_not_blank    CHECK (btrim(unit) <> ''),

  -- "Girilmedi" ile "bos girildi" AYNI seydir; ikisi de `NULL`dur.
  CONSTRAINT items_sku_not_blank     CHECK (sku  IS NULL OR btrim(sku)  <> ''),
  -- Bos bir not BOS BIR EMBEDDING CAGRISI demek olurdu: para harcayan, hicbir
  -- sey aramayan bir vektor.
  CONSTRAINT items_note_not_blank    CHECK (note IS NULL OR btrim(note) <> ''),

  -- ⚠️ `>= 0`, `> 0` DEGIL: sifir esik MESRUDUR ve "tukendiginde haber ver"
  -- demektir. Negatif bir esik ise anlamsizdir — hicbir zaman tetiklenmeyen bir
  -- alarm, yapilandirilmis gorunen bir hicliktir.
  CONSTRAINT items_min_quantity_not_negative
    CHECK (min_quantity IS NULL OR min_quantity >= 0),

  CONSTRAINT items_updated_after_created CHECK (updated_at >= created_at)
);
--> statement-breakpoint

-- ===========================================================================
-- inventory.movements — DEGISTIRILEMEZ DEFTER (ADR-0039 §3, §3.3)
-- ===========================================================================
-- ⚠️ BU TABLODA `updated_at` YOKTUR ve bu bir unutma DEGILDIR: guncellenmeyen
-- bir satirin guncellenme zamani olmaz. Kolonu koymak, ileride birinin
-- "demek ki guncellenebiliyor" diye okuyacagi SESSIZ BIR DAVET olurdu.
--
-- ⚠️ ADR-0034'TEN BILINCLI SAPMA. Finans islemi DUZELTILEBILIR ("yanlis tutar
-- duzeltilebilmeli"); envanter hareketi duzeltilemez. Fark §2'den dogar:
--
--   Finans -> her islem KENDI BASINA bir olgudur; duzeltmek o olguyu duzeltir.
--   Stok   -> bugunku miktar GECMISIN TAMAMINDAN turetilir; gecmisi
--             degistirmek BUGUNU SESSIZCE YENIDEN YAZAR.
--
-- Telafi yolu zaten var ve kullanicinin zaten yaptigi sey: TERS YONDE bir
-- hareket yazmak (fiziksel sayim akisi bunu otomatik yapar).
CREATE TABLE inventory.movements (
  id                 uuid          PRIMARY KEY,
  tenant_id          uuid          NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- =========================================================================
  -- ⚠️ `ON DELETE RESTRICT` — `CASCADE` DEGIL, VE BU §3.3'UN YARISIDIR
  -- =========================================================================
  -- `CASCADE` olsaydi, DEGISTIRILEMEZ ilan edilen defter TEK BIR `DELETE` ILE
  -- YOK EDILEBILIRDI. Iki karar ancak birlikte tutar.
  --
  -- Sonucu: hareketi olan bir kalemi silme denemesi VERITABANI SEVIYESINDE
  -- reddedilir (SQLSTATE 23503). Repository bunu `StockItemHasMovementsError`e
  -- cevirir ve filtre 409'a tasir — `finance.categories`in `CategoryInUseError`
  -- deseninin IKINCI uygulamasi.
  --
  -- ⚠️ FK ayni sema icindedir, yani MESRUDUR: Mutlak Kural 5 CROSS-SCHEMA FK'yi
  -- yasaklar, sema ici FK'yi degil.
  item_id            uuid          NOT NULL REFERENCES inventory.items (id) ON DELETE RESTRICT,

  -- =========================================================================
  -- ARITMETIK EKSEN — iki degerli, NOT NULL (ADR-0039 §3.1)
  -- =========================================================================
  -- Toplama HER ZAMAN ayni tek ifadedir ve hicbir satir istisna degildir:
  --   SUM(CASE WHEN direction = 'in' THEN quantity ELSE -quantity END)
  direction          text          NOT NULL,

  -- ⚠️ HER ZAMAN POZITIF. Isaret `direction` kolonundadir, sayida DEGIL
  -- (ADR-0034 §5'in ayni karari, ikinci modulde).
  --
  -- `numeric(14,3)`: kg/litre kesirlidir; `integer` secmek "yarim kilo un"u
  -- temsil edilemez kilardi. ⚠️ Miktar hicbir noktada JS `number`ina
  -- CEVRILMEZ — paranin ayni karari.
  quantity           numeric(14,3) NOT NULL,

  -- =========================================================================
  -- SEBEP — "duzeltme" burada yasar, `direction`da DEGIL (ADR-0039 §3.1)
  -- =========================================================================
  -- ⚠️ Bir susleme sanilmasin: bir isletme icin "gercek akis" ile "sayimda
  -- ortaya cikan fark" FARKLI SEYLERDIR. Ikincisinin toplami FIRE/KAYIP
  -- demektir ve tek bir kolonla sorulabilir olmasi degerlidir. Tek degerde
  -- birlestirmek, ADR-0035 §2b'nin `no_show`/`cancelled` ayrimini yok etmekle
  -- ayni siniftan bir kayip olurdu.
  is_correction      boolean       NOT NULL DEFAULT false,

  -- ⚠️ `timestamptz` — bir AN. Hareket "dun aksam" olabilir ve kullanici onu
  -- bugun girer; `created_at` ile `occurred_at` AYNI SEY DEGILDIR.
  occurred_at        timestamptz   NOT NULL DEFAULT now(),

  -- ⚠️ BU NOT EMBED EDILMEZ. Anlamsal yuzey KALEMIN notudur (`items.note`);
  -- hareket notu bir serbest aciklamadir ("irsaliye 4412"). Embed edilseydi
  -- ortak top-K havuzu binlerce neredeyse ozdes kisa vektorle kirlenirdi —
  -- ADR-0034 §6.1'in `transactions.description` icin verdigi ayni karar.
  note               text,

  created_by_user_id uuid,
  created_at         timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT movements_direction_valid CHECK (direction IN ('in', 'out')),
  CONSTRAINT movements_quantity_positive CHECK (quantity > 0),
  CONSTRAINT movements_note_not_blank CHECK (note IS NULL OR btrim(note) <> '')
);
--> statement-breakpoint

-- ===========================================================================
-- INDEX'LER
-- ===========================================================================
-- MT §12.3: bilesik index'te `tenant_id` DAIMA ilk kolon.

-- Kalem listesi alfabetiktir; sayfalama bunun uzerinden calisir.
CREATE INDEX items_tenant_name_idx ON inventory.items (tenant_id, name);
--> statement-breakpoint

-- ⚠️ SKU TEKILLIGI KUCUK/BUYUK HARFTEN BAGIMSIZ (§1.1). Kismi index: SKU'suz
-- kalemler birbiriyle CAKISMAZ (`NULL` degerler tekillige girmez, ama kismi
-- yuklem niyeti ACIKCA yazar).
CREATE UNIQUE INDEX items_tenant_sku_unique_idx
  ON inventory.items (tenant_id, lower(sku)) WHERE sku IS NOT NULL;
--> statement-breakpoint

-- ===========================================================================
-- ⚠️ BU INDEX §2'NIN TURETME KARARINA HIZMET EDER
-- ===========================================================================
-- Miktar HER LISTEDE ve HER `POST /ask` cagrisinda hesaplanir; toplama bu
-- index uzerinden yapilir. Turetme karari "sorgu yavaslarsa gorunur olur"
-- dedigi icin, olcum kapanis denetiminde ZORUNLU bir maddedir.
CREATE INDEX movements_tenant_item_idx ON inventory.movements (tenant_id, item_id);
--> statement-breakpoint

-- Hareket defteri listesi: "en son ne oldu" — `finance.transactions`in `desc`
-- siralamasiyla ayni sinif (bir GECMIS akisi).
CREATE INDEX movements_tenant_occurred_idx
  ON inventory.movements (tenant_id, occurred_at DESC);
--> statement-breakpoint

-- HNSW, IVFFlat DEGIL (ADR-0029 §1). Operator `vector_cosine_ops` — sorgudaki
-- `<=>` ile eslesmezse index DEVRE DISI kalir ve sorgu TAM TARAMA yapar;
-- sessiz bir performans coku.
CREATE INDEX items_embedding_idx
  ON inventory.items USING hnsw (embedding vector_cosine_ops);
--> statement-breakpoint

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2). SAPMA YOK, ALTINCI KEZ.
--
-- `current_setting`'de `missing_ok` KULLANILMAZ: context kurulmamissa sorgu
-- SESSIZCE BOS DONMEZ, HATA VERIR (MT §12.6 madde 4).
--
-- ⚠️ Bedeli bu modulde OZELLIKLE agirdir ve §2'nin dogrudan sonucudur: miktar
-- bir TOPLAMDIR. Sessizce bos donen bir `movements` sorgusu, hata degil
-- "STOK SIFIR" olarak okunur — yanlis bir sayi, eksik bir liste degil.
-- ===========================================================================
ALTER TABLE inventory.items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE inventory.items FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON inventory.items
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

ALTER TABLE inventory.movements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE inventory.movements FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON inventory.movements
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

-- Uygulama rolu: yalnizca DML. DDL yetkisi ASLA verilmez.
--
-- ⚠️ `movements` uzerinde `UPDATE` ve `DELETE` DE VERILIYOR ve bu, §3.3 ile
-- CELISMEZ: degistirilemezlik bir UYGULAMA kuralidir (uc yok, use case yok) ve
-- geri alma/retention islerinin sahibi de bu roldur. Grant'i kismak, ileride
-- retention isini (acilis hareketi yazip eskileri kirpma) YAPILAMAZ kilardi.
-- Kuralin kaniti testtedir: `PATCH`/`DELETE` ucu YOKTUR.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON inventory.items     TO businessos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON inventory.movements TO businessos_app;
  END IF;
END
$$;
