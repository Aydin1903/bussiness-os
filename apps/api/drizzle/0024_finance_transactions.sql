-- ===========================================================================
-- finance.transactions — gerceklesmis nakit hareketi (ADR-0034 §2, §3c, §4)
-- ===========================================================================
--
-- ⚠️ BU TABLO BIR MUHASEBE DEFTERI DEGILDIR. Kaydettigi sey GERCEKLESMIS nakit
-- hareketidir: para girdi, para cikti. Tahakkuk ("fatura kesildi ama tahsil
-- edilmedi"), vergi, yasal defter ve muhasebe entegrasyonu KAPSAM DISIDIR
-- (ADR-0034 §11) — bu bir asama degil bir SINIRDIR.
--
-- BU MIGRATION'DA AI YOK. `commentaries` / `commentary_chunks` ve pgvector
-- `0025`'e aittir.

CREATE TABLE finance.transactions (
  id                  uuid          PRIMARY KEY,
  tenant_id           uuid          NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- =========================================================================
  -- YON KOLONDA, TUTARIN ISARETINDE DEGIL
  -- =========================================================================
  -- Cazip alternatif tek kolondu: gider NEGATIF yazilir, yon turetilir.
  -- REDDEDILDI (ADR-0034 §2b). Isaret koymayi unutan TEK bir yazma yolu bir
  -- gideri gelir gibi toplar ve hata SESSIZDIR: ekran bir sayi gosterir, sayi
  -- yanlistir, hicbir sey patlamaz.
  --
  -- `direction` + `amount > 0` ayni bilgiyi tasir ama CHECK ile ZORLANABILIR,
  -- index'lenebilir ve filtrelenebilir.
  direction           text          NOT NULL,

  -- =========================================================================
  -- PARA: `numeric`, `double precision` DEGIL
  -- =========================================================================
  -- Kayan noktali sayida para tutmak yuvarlama hatasi biriktirir
  -- (`crm.opportunities.estimated_value` ile ayni karar).
  --
  -- ⚠️ `crm`den SAPMA: orada tutar OPSIYONELDI (bir tahmindi) ve kisit
  -- "tutar varsa para birimi zorunlu" seklindeydi. Burada tutar KAYDIN
  -- KENDISIDIR — tutarsiz bir gelir/gider kaydi diye bir sey yoktur.
  -- Kosullu kisit KOSULSUZA sadelesir.
  amount              numeric(14,2) NOT NULL,
  currency            text          NOT NULL,

  -- TAKVIM GUNU (`date`), an DEGIL — projede DORDUNCU kez ayni karar. Bir odeme
  -- tarihi bir takvim gunudur; bu secim tenant bazli saat dilimi sorusunu v1'de
  -- TUMUYLE ortadan kaldirir. Bedeli acikca: gun ici saat verilemez.
  occurred_on         date          NOT NULL,

  -- ⚠️ EMBED EDILMEZ (ADR-0034 §6.1). Duz bir kolondur: listede gorunur,
  -- filtrelenir, ve ADR-0011'in FTS kaleminin en dogal adayidir. Anlamsal
  -- yuzey `0025`'in `commentaries` tablosudur.
  description         text,

  -- =========================================================================
  -- KATEGORI: NULLABLE, ve YONU BILESIK FK ILE ZORLANIR (asagida)
  -- =========================================================================
  -- Zorunlu kilmak kullaniciyi tek kalemlik sahte kategoriler acmaya iterdi —
  -- ADR-0033 §3'un SAHTE "Genel" PROJESI dersinin birebir aynisi, ikinci kez.
  -- Kategorisiz kayit mesrudur ("hizli gir, sonra siniflandir") ve ozet bunu
  -- `Kategorisiz` olarak ACIKCA gosterir, gizlemez.
  category_id         uuid,

  -- =========================================================================
  -- ⚠️ CROSS-MODUL YUMUSAK REFERANSLAR — FK YOK, IKI TANE (ADR-0034 §4)
  -- =========================================================================
  -- Hedefler `crm.companies` ve `projects.projects`, yani BASKA SEMALAR.
  -- Mutlak Kural 5 cross-schema FK'yi yasaklar (tek istisna `platform.tenants`).
  --
  -- ADR-0033 §2'nin uc parcali deseni DEGISTIRILMEDEN uygulanir:
  --   (a) FK yok           — cunku yazilamaz
  --   (b) ad kopyalanmaz   — CRM/Projeler'in public interface'inden okunur
  --   (c) okuma hedefin iznine bagli (`company:read` / `project:read`)
  --   (d) sarkan isaretci TOLERE EDILIR, okuyan yol dayanikli yazilir
  --
  -- ⚠️ KOLONLAR BU SLICE'TA ACILIYOR AMA API ONLARI KABUL ETMIYOR. Yazma yolu
  -- SLICE 3'e birakildi, cunku (b) ve (c) icin gereken `projects.public.ts` o
  -- slice'ta yaziliyor. Dogrulanamayan bir cross-modul isaretciyi bugunden
  -- kabul etmek, ILK GUNDEN sarkan satir uretmek olurdu — ADR-0033 Slice 1'in
  -- birebir ayni karari ve ayni gerekcesi.
  company_id          uuid,
  project_id          uuid,

  -- Kaydi KIM girdi. FK YOK (`platform.users` baska sema) — `interactions
  -- .author_user_id` / `progress_notes.author_user_id` ile ayni desen.
  --
  -- ⚠️ BU BIR DENETIM IZI DEGILDIR: yalnizca OLUSTURANI tutar. Bir tutarin ne
  -- zaman, kim tarafindan DEGISTIRILDIGI sorulamaz (ADR-0034 §8'in acikca
  -- yazdigi bedel). `platform/audit` ARCHITECTURE'da var ama KOD OLARAK YOK.
  created_by_user_id  uuid          NOT NULL,

  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT transactions_direction_valid CHECK (direction IN ('income', 'expense')),

  -- Tutar DAIMA POZITIF — yonu `direction` tasir (yukaridaki blok).
  CONSTRAINT transactions_amount_positive CHECK (amount > 0),

  -- ISO 4217 SEKLI zorlanir, KOD LISTESI dogrulanmaz. Liste zamanla degisir ve
  -- veritabaninda tutulan bir kod listesi bakim borcu uretir; sekil kontrolu
  -- ise "TRY" ile "try" ve "TRYY" ayrimini yapmaya yeter.
  CONSTRAINT transactions_currency_shape CHECK (currency ~ '^[A-Z]{3}$'),

  -- "Girilmedi" ile "bos girildi" ayni seydir: uygulama bos dizeyi NULL'a
  -- cevirir, kisit uygulamayi ATLAYAN yolu baglar.
  CONSTRAINT transactions_description_not_blank CHECK (description IS NULL OR btrim(description) <> ''),

  CONSTRAINT transactions_updated_after_created CHECK (updated_at >= created_at),

  -- =========================================================================
  -- ⚠️ BILESIK YABANCI ANAHTAR — BU MODULUN EN ONEMLI KISITI (ADR-0034 §3c)
  -- =========================================================================
  -- "Gelir kaydina gider kategorisi" hatasini VERITABANI SEVIYESINDE imkansiz
  -- kilar. Uygulama katmani ayni kontrolu zaten yapiyor ve daha iyi bir hata
  -- mesaji uretiyor; buradaki kisit uygulamayi ATLAYAN her yolu (elle SQL,
  -- ileride bir ithalat betigi) da baglar.
  --
  -- Kazanc somuttur: yanlis yondeki bir kategori, ozetin KATEGORI KIRILIMINI
  -- sessizce bozardi — "Kira" kalemi gelir tarafinda gorunurdu.
  --
  -- ⚠️ `MATCH SIMPLE` (varsayilan) ZORUNLUDUR ve burada bir ayrinti degil,
  -- KATEGORININ NULLABLE OLABILMESININ KOSULUDUR: `MATCH SIMPLE`'da kolonlardan
  -- HERHANGI BIRI NULL ise kisit hic uygulanmaz, yani `category_id IS NULL`
  -- satirlar serbestce yazilabilir. `MATCH FULL` yazilsaydi ("ya hepsi dolu ya
  -- hepsi NULL") `direction` NOT NULL oldugu icin KATEGORISIZ KAYIT
  -- IMKANSIZLASIRDI — ve bu, yukaridaki "sahte kategori" tuzagini geri
  -- getirirdi.
  --
  -- ⚠️ Hedef taraftaki `UNIQUE (id, direction)` kisiti (`0023`) BU FK'NIN ON
  -- KOSULUDUR. Silinirse bu migration "there is no unique constraint matching
  -- given keys" ile PATLAR.
  --
  -- `ON DELETE RESTRICT`: kullanimdaki kategori SILINEMEZ. `SET NULL` olsaydi
  -- kategori silmek gecmis ozetleri SESSIZCE degistirirdi — gecen ayin raporu
  -- bugun baska bir sey soylerdi. Dogru eylem ARSIVLEMEKTIR (`0023`).
  CONSTRAINT transactions_category_direction_fkey
    FOREIGN KEY (category_id, direction)
    REFERENCES finance.categories (id, direction)
    ON DELETE RESTRICT
);
--> statement-breakpoint

-- ===========================================================================
-- INDEX'LER — MT §12.3: bilesik index'te `tenant_id` DAIMA ilk kolon
-- ===========================================================================
--
-- Birincil erisim yolu TARIH ARALIGIDIR: hem liste ("son hareketler") hem
-- Slice 3'un nakit akisi ozeti (`WHERE occurred_on BETWEEN ... `) bu index'i
-- kullanir. Siralama azalan oldugu icin index de oyle.
CREATE INDEX transactions_tenant_occurred_idx
  ON finance.transactions (tenant_id, occurred_on DESC);
--> statement-breakpoint

-- Kategori kirilimi (Slice 3) ve "bu kategori kullaniliyor mu" sorusu.
-- ⚠️ Ikincisi bir performans suslemesi DEGIL: `ON DELETE RESTRICT` her kategori
-- silme denemesinde bu kolonu tarar; index'siz her silme TAM TARAMA olurdu.
CREATE INDEX transactions_tenant_category_idx
  ON finance.transactions (tenant_id, category_id);
--> statement-breakpoint

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2). SAPMA YOK, BESINCI KEZ.
--
-- `current_setting`'de `missing_ok` KULLANILMAZ: context kurulmamissa sorgu
-- SESSIZCE BOS DONMEZ, HATA VERIR (MT §12.6 madde 4). Burada bedeli daha da
-- agir olurdu — bos sonuc "bu ay hic hareket yok" gibi gorunur ve kullanici
-- YANLIS BIR FINANSAL TABLO gorurdu.
-- ===========================================================================
ALTER TABLE finance.transactions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE finance.transactions FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON finance.transactions
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

-- Uygulama rolu: yalnizca DML. DDL yetkisi ASLA verilmez.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON finance.transactions TO businessos_app;
  END IF;
END
$$;
