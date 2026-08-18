-- ===========================================================================
-- documents semasi — Faz 5'in BESINCI is modulu (ADR-0037 §1, §2, §4)
-- ===========================================================================
--
-- `platform` disindaki ALTINCI sema (`knowledge`, `crm`, `projects`, `finance`,
-- `appointments`, `documents`). Mutlak Kural 5: her modul kendi semasina
-- sahiptir.
--
-- ===========================================================================
-- ⚠️ BU MODUL PROJEDE ILK KEZ PostgreSQL DISINA KALICI DURUM YAZIYOR
-- ===========================================================================
-- Dosyanin KENDISI burada degil, nesne deposundadir (Cloudflare R2 — ADR-0037
-- §5, ADR-0009'un acik biraktigi saglayici secimi). Bu tablo dosyanin
-- METADATA'sini tutar ve `storage_key` ile ona isaret eder.
--
-- ⚠️ NESNE DEPOSUNDA RLS YOKTUR. Bugune kadar tenant izolasyonunun bir kismi
-- veritabani tarafindan ZORLANIYORDU; orada boyle bir mekanizma yok. Tek
-- mekanik dayanak ANAHTARIN KENDISIDIR:
--
--     tenants/<tenantId>/documents/<documentId>/<uuid>-<dosya-adi>
--
-- Bu yuzden bir okuma yolu anahtari HER ZAMAN VERITABANINDAN alir; istemciden
-- gelen bir anahtarla ASLA nesne okunmaz (aksi halde bir tenant, digerinin
-- anahtarini tahmin ederek okuyabilirdi).
--
-- ===========================================================================
-- ⚠️ IKI DOGRULUK KAYNAGI VAR — VE SIRA BILINCLI SECILDI (ADR-0037 §5.3)
-- ===========================================================================
-- Nesne deposu ile bu tablo arasinda ATOMIK ISLEM YOKTUR. Soru "tutarsizlik
-- olur mu" degil, HANGI tutarsizligin olacagidir. Karar: her zaman YETIM NESNE
-- tarafinda kalinir, NESNESIZ KAYIT asla.
--
--   YUKLEME: once R2'ye yaz  -> sonra bu satiri ac
--   SILME:   once bu satiri sil -> sonra R2 nesnesini sil
--
-- Gerekce simetrik degildir: yetim nesne GORUNMEZ bir maliyettir (fatura),
-- nesnesiz kayit ise GORUNUR bir bozukluktur — kullanici listede duran belgeye
-- tiklar, indiremez, ve hata HER DENEMEDE tekrarlanir.
--
-- ⚠️ Yetim nesne temizligi v1'de YOKTUR (ADR-0037 bilinen sinirlar) ve
-- retention karariyla (ROADMAP §8.5) AYNI GUN verilmelidir.
--
-- ===========================================================================
-- CHUNK TABLOSU BU MIGRATION'DA DEGIL, `0028`DE
-- ===========================================================================
-- Ayrilmasinin sebebi slice sinirlaridir: bu migration BASINA BUYRUK bir belge
-- arsividir (yukle, listele, indir, sil). `0028` onun ustune HAFIZAYI ekler.
-- Ikisi tek dosyada olsaydi iki farkli risk sinifi (nesne deposu tutarliligi +
-- AI hatti) tek bir geri alma adiminda karisirdi.

CREATE SCHEMA IF NOT EXISTS documents;
--> statement-breakpoint

-- Uygulama rolu semayi gorur ama icinde nesne OLUSTURAMAZ (02-schemas.sql
-- deseni; bes onceki sema ile birebir ayni).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT USAGE ON SCHEMA documents TO businessos_app;
  END IF;
END
$$;
--> statement-breakpoint

-- ===========================================================================
-- documents.documents — saklanan bir dosyanin METADATA'si
-- ===========================================================================
CREATE TABLE documents.documents (
  id                 uuid        PRIMARY KEY,
  tenant_id          uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- Kullaniciya GOSTERILEN ad. Anahtarda temizlenmis (`sanitize`) hali durur;
  -- burada OLDUGU GIBI saklanir — Turkce karakterler, bosluklar dahil.
  original_filename  text        NOT NULL,

  -- =========================================================================
  -- ⚠️ TENANT-SCOPED UNIQUE — SUSLEME DEGIL, KORKULUK (ADR-0037 §1)
  -- =========================================================================
  -- Iki satirin AYNI nesneyi isaret etmesi, birini silmenin digerini SESSIZCE
  -- bozmasi demekti: ikinci kayit listede durur, indirilemez. §7'nin "her yeni
  -- yukleme YENI bir anahtar uretir" karari bunu zaten garanti eder; bu kisit
  -- onu veritabani seviyesinde KILITLER.
  --
  -- Tenant-scoped (MT §12.3): anahtar zaten `tenants/<tenantId>/...` ile
  -- basladigi icin global cakisma pratikte imkansizdir, ama unique kisitlar bu
  -- projede DAIMA tenant-scoped yazilir ve istisna acmak kurali zayiflatirdi.
  storage_key        text        NOT NULL,

  -- ⚠️ ICERIKTEN tespit edilmis tur — istemcinin gonderdigi `Content-Type`
  -- basligindan DEGIL (ADR-0037 §6.1). Ikisi de istemci tarafindan serbestce
  -- yazilabilir ve bir ayristiriciya yanlis turde govde vermek, ayristiricinin
  -- saldiri yuzeyini acmanin en kisa yoludur.
  --
  -- v1 ALLOWLIST'i: `application/pdf` ve DOCX. CHECK kisiti asagida.
  mime_type          text        NOT NULL,

  -- ⚠️ `bigint`, `integer` DEGIL. Sinir bugun 20 MB (bir URUN ayari, §6.1) ama
  -- kolonun TIPI bir urun ayarina baglanmaz: `integer` 2 GB'da tasar ve o gun
  -- bir `ALTER TABLE` gerekirdi.
  size_bytes         bigint      NOT NULL,

  -- =========================================================================
  -- SERBEST ETIKET — SABIT ENUM YOK, TENANT SOZLUGU DE YOK (ADR-0037 §2)
  -- =========================================================================
  -- Bir enum, on iki sektorun belge turlerini BUGUNDEN bilmeyi gerektirirdi:
  -- bir hukuk burosunun "vekaletname"si, bir insaat firmasinin "hakedis"i ve
  -- bir ajansin "brief"i ayni listede yasayamaz. Sabit liste kullaniciyi SAHTE
  -- KATEGORIYE iterdi (ADR-0033'un `tasks.project_id` dersi) — ve sahte etiket
  -- yalnizca kotu bir kayit degildir: `0028`in baglam basligina girer ve AI'a
  -- YANLIS BILGI ogretir.
  --
  -- ADR-0034'un tenant-tanimli sozlugu de DEGIL: Finans kategorisinin YAPISAL
  -- bir isi vardi (yon + bilesik FK). Etiketin yoktur — hicbir hesabin, hicbir
  -- kisitin, hicbir katkicinin dogrulugu onun sabitligine dayanmaz.
  --
  -- ⚠️ Bedeli acikca: yazim farklari BIRIKIR ("Sozlesme" / "sozlesme"). v1 iki
  -- telafi kurar (trim + bos dize `NULL`a; filtre buyuk/kucuk harf duyarsiz) ve
  -- UCUNCUSUNU KURMAZ: otomatik birlestirme YOKTUR — kullanicinin kastini
  -- tahmin etmektir.
  label              text,

  -- =========================================================================
  -- IKI CROSS-MODUL YUMUSAK REFERANS — FK YOK, BIRBIRINDEN BAGIMSIZ (§4)
  -- =========================================================================
  -- Hedefler `crm.contacts.id` ve `projects.projects.id`, yani BASKA SEMALAR;
  -- Mutlak Kural 5 cross-schema FK'yi yasaklar. Adlar buraya KOPYALANMAZ, her
  -- okumada `crm.public.ts` / `projects.public.ts` uzerinden cozulur ve izin
  -- kapilari (`contact:read` / `project:read`) O ARAYUZLERIN ICINDEDIR.
  --
  -- ⚠️ IKISI DE OPSIYONEL VE BAGIMSIZ: bir belge ikisine birden, yalnizca
  -- birine ya da HICBIRINE bagli olabilir. Zorunlu kilmak kullaniciyi sahte
  -- baglantilar kurmaya iterdi — bir sirket ana kira sozlesmesi hicbirine ait
  -- degildir.
  --
  -- ⚠️ SARKAN ISAERTCI MESRUDUR: silinen bir kisinin/projenin id'si burada
  -- kalir. Bunlar projedeki DORDUNCU ve BESINCI sarkan isaretcidir.
  crm_contact_id     uuid,
  project_id         uuid,

  -- `interactions.author_user_id` / `appointments.created_by_user_id` ile ayni
  -- desen ve ayni gerekce (cross-schema FK yasak).
  --
  -- ⚠️ Yalnizca YUKLEYENI tutar; DENETIM IZI DEGILDIR. Bir belgeyi kimin
  -- degistirdigi ya da sildigi SORULAMAZ (ADR-0034 §8'in borcu, besinci kez).
  created_by_user_id uuid,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT documents_storage_key_unique UNIQUE (tenant_id, storage_key),

  CONSTRAINT documents_size_positive CHECK (size_bytes > 0),

  -- ⚠️ ALLOWLIST VERITABANINDA DA YAZILI. Uygulama katmani zaten reddediyor
  -- (415, §6.1); CHECK ise uygulamayi ATLAYAN yollari baglar —
  -- `appointments_status_valid` ile ayni karar ve ayni bedel: sozluk IKI YERDE
  -- yasar ve senkron kalmak zorundadir.
  CONSTRAINT documents_mime_type_allowed CHECK (
    mime_type IN (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  ),

  CONSTRAINT documents_filename_not_blank CHECK (btrim(original_filename) <> ''),
  CONSTRAINT documents_storage_key_not_blank CHECK (btrim(storage_key) <> ''),

  -- "Girilmedi" ile "bos girildi" AYNI seydir; ikisi de `NULL`dur.
  CONSTRAINT documents_label_not_blank CHECK (label IS NULL OR btrim(label) <> ''),

  CONSTRAINT documents_updated_after_created CHECK (updated_at >= created_at)
);
--> statement-breakpoint

-- ===========================================================================
-- INDEX'LER — MT §12.3: bilesik index'te `tenant_id` DAIMA ilk kolon
-- ===========================================================================
-- Modulun BIRINCIL okuma yolu: "en son yuklenenler". `finance.commentaries`in
-- `(tenant_id, created_at DESC)` index'iyle ayni sekil.
CREATE INDEX documents_tenant_created_idx
  ON documents.documents (tenant_id, created_at DESC);
--> statement-breakpoint

-- "Bu kisinin belgeleri" / "bu projenin belgeleri" — IKI AYRI index, bilesik
-- bir tane DEGIL: iki referans BAGIMSIZDIR (§4) ve sorgular da bagimsiz gelir.
CREATE INDEX documents_tenant_contact_idx
  ON documents.documents (tenant_id, crm_contact_id);
--> statement-breakpoint

CREATE INDEX documents_tenant_project_idx
  ON documents.documents (tenant_id, project_id);
--> statement-breakpoint

-- Etiket filtresi (§2c) — arama buyuk/kucuk harf DUYARSIZ oldugu icin index de
-- oyle olmak zorunda; duz bir `(tenant_id, label)` index'i `lower(label) = ...`
-- sorgusunda KULLANILMAZDI ve hata SESSIZ olurdu (tam tarama, dogru sonuc).
CREATE INDEX documents_tenant_label_idx
  ON documents.documents (tenant_id, lower(label));
--> statement-breakpoint

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2). SAPMA YOK, ALTINCI KEZ.
--
-- `current_setting`'de `missing_ok` KULLANILMAZ: context kurulmamissa sorgu
-- SESSIZCE BOS DONMEZ, HATA VERIR (MT §12.6 madde 4).
--
-- ⚠️ BU KORUMA NESNE DEPOSUNA UZANMAZ. Burada RLS var; R2'de yok. Iki
-- izolasyon mekanizmasi FARKLIDIR ve ikincisi tumuyle ANAHTAR DUZENINE
-- dayanir (dosya basi).
-- ===========================================================================
ALTER TABLE documents.documents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE documents.documents FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON documents.documents
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

-- Uygulama rolu: yalnizca DML. DDL yetkisi ASLA verilmez.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON documents.documents TO businessos_app;
  END IF;
END
$$;
