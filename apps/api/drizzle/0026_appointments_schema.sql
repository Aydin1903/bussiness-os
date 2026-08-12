-- ===========================================================================
-- appointments semasi — Faz 5'in DORDUNCU is modulu (ADR-0035 §1, §2, §3)
-- ===========================================================================
--
-- `platform` disindaki BESINCI sema (`knowledge`, `crm`, `projects`, `finance`,
-- `appointments`). Mutlak Kural 5: her modul kendi semasina sahiptir; `crm`
-- semasini genisletmek iki modulu tek RLS/retention/migration yuzeyinde
-- birlestirir ve ayrilabilirligi kaybettirirdi. Ayrica randevu GELECEGE bakar,
-- gorusme GECMISE — ayni tabloda iki farkli olgu.
--
-- ===========================================================================
-- ⚠️ SEMA ADI, MODUL ADI VE `data-module` ANAHTARI UCU DE `appointments`
-- ===========================================================================
-- `module-colors.css` bu modulun paletini bir donem `[data-module='booking']`
-- altinda tasidi. ADR-0035 §1.1 onu `appointments` yapti: iki adli tek bir
-- modul, `data-module="appointments"` yazan bir layout'un HICBIR paletle
-- eslesmemesi demekti — ekran calisir, terracotta kalir, lint yakalamaz.
--
-- ===========================================================================
-- BU MIGRATION'DA TEK TABLO VAR — VE BU MODULUN EN TARTISMALI KARARIDIR
-- ===========================================================================
-- Bugune kadar DORT anlamsal kaynagin DORDU DE ayri bir `*_chunks` tablosu
-- tasidi (`knowledge.note_chunks`, `crm.interaction_chunks`,
-- `projects.progress_note_chunks`, `finance.commentary_chunks`). Randevu
-- BESINCISINI ACMAZ (ADR-0035 §3): `service_note` DOGRUDAN bu satirin
-- `embedding` kolonuna gomulur.
--
-- Gerekce chunking'in NE COZDUGUDUR: uzun anlatisal govdelerin tek vektorde
-- erimesini. Randevu notu boyle bir metin degildir ("Dis temizligi + kontrol")
-- ve bir randevu TEK SEFERLIK bir olaydir. Bir ikinci tablo, ayri RLS
-- politikasi + `tenant_id` denormalizasyonu + `UNIQUE (parent, index)` +
-- CASCADE zinciri + retention'da IKINCI bir satir demekti — tek bir kolonun isi
-- icin.
--
-- ⚠️ Bedeli: uzunluk artik bir KISITTIR. `service_note` chunk'lanmadigi icin
-- embedding modelinin girdi sinirini asamaz; sinir domain katmaninda zorlanir
-- ve asilirsa 422 doner. SESSIZ KIRPMA YASAK (ADR-0035 §3d).
--
-- ===========================================================================
-- SLICE 1'DE UC KOLON ACILIR AMA API ONLARI KABUL ETMEZ
-- ===========================================================================
-- `crm_contact_id` (Slice 2), `service_note` + `embedding` (Slice 3). Kolonlari
-- simdi acmak, ADR-0033 Slice 1'in ogrettigi dersle CELISMEZ: orada ogrenilen
-- sey "dogrulanamayan bir ISARETCIYI KABUL ETMEK ilk gunden sarkan satir
-- uretir"di — yani API'nin kabul etmemesi. Kolonun bos durmasi zararsizdir ve
-- ikinci bir `ALTER TABLE` migration'inin getirisi yoktur.

CREATE SCHEMA IF NOT EXISTS appointments;
--> statement-breakpoint

-- Uygulama rolu semayi gorur ama icinde nesne OLUSTURAMAZ (02-schemas.sql
-- deseni; dort onceki sema ile birebir ayni).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT USAGE ON SCHEMA appointments TO businessos_app;
  END IF;
END
$$;
--> statement-breakpoint

-- ===========================================================================
-- appointments.appointments — kaydedilmis bir bulusma
-- ===========================================================================
CREATE TABLE appointments.appointments (
  id                 uuid         PRIMARY KEY,
  tenant_id          uuid         NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- =========================================================================
  -- CROSS-MODUL YUMUSAK REFERANS — FK YOK (ADR-0035 §4)
  -- =========================================================================
  -- Hedef `crm.contacts.id`, yani BASKA BIR SEMA; Mutlak Kural 5 cross-schema
  -- FK'yi yasaklar. Kisi ADI buraya KOPYALANMAZ: kopyalansaydi kisi yeniden
  -- adlandirildiginda randevu listesi eski adi gostermeye devam ederdi
  -- (turetilebilir bilgiyi kaliciya yazmak — projede alti kez reddedilen ayni
  -- karar). Ad, calisma zamaninda `crm.public.ts`ten okunur ve izin kapisi
  -- (`contact:read`) O ARAYUZUN ICINDEDIR.
  --
  -- ⚠️ SARKAN ISARETCI MESRUDUR ve tolere edilir: silinen bir kisinin id'si
  -- burada kalir. Veritabani bunu dayatamaz — dayatmasi cross-schema FK
  -- gerektirirdi. Okuyan her yol `contactName: null`a dayanikli yazilir.
  --
  -- ⚠️ SLICE 1'DE API BU KOLONU KABUL ETMEZ (yazma yolu Slice 2).
  crm_contact_id     uuid,

  -- =========================================================================
  -- ANLAMSAL YUZEY — VE ONUN VEKTORU AYNI SATIRDA (ADR-0035 §3)
  -- =========================================================================
  -- ⚠️ SLICE 1'DE API BU IKI KOLONU DA KABUL ETMEZ (yazma yolu Slice 3).
  --
  -- `embedding` NULLABLE ve bu bir ARIZA DEGIL NORMALDIR: notsuz randevu cok
  -- yaygindir (takvime yalnizca saat yazmak icin kurulmus bir kayit). Ayni
  -- kolon, ADR-0029 §4'un iki transaction'li akisinin uretebildigi
  -- "gomulememis" halini de tasir ve AYNI onarim yolu
  -- (`POST /appointments/reindex`, Slice 3) ikisini birden kapatir.
  service_note       text,
  embedding          vector(1536),

  -- =========================================================================
  -- ⚠️ `timestamptz` — ONCEKI UC MODULDEN BILINCLI SAPMA (ADR-0035 §2c)
  -- =========================================================================
  -- ADR-0031 §3 (takip tarihi), ADR-0033 §5 (son tarih) ve ADR-0034 §2e (odeme
  -- gunu) `date` secmisti; gerekce her seferinde ayniydi: "bir takvim gunudur,
  -- saat bilgisi tasimaz". RANDEVU BUNUN TAM TERSIDIR — 14:30'da olan bir
  -- bulusmayi `date` ile temsil etmek modulun VAR OLUS SEBEBINI yok eder.
  --
  -- ⚠️ Bedeli acikca: bu modul, tenant bazli SAAT DILIMI sorusunu onceki uc
  -- modulun erteledigi yerden GERI GETIRIR. v1'in karari: sunucu UTC dondurur,
  -- cevrimi ISTEMCI yapar. Cok bolgeli bir tenant icin bu YANLIS GORUNUR ve
  -- kullanicinin FARK EDEBILECEGI bir yanlistir (ADR-0035 bilinen sinirlar).
  scheduled_at       timestamptz  NOT NULL,

  -- =========================================================================
  -- SURE DAKIKA CINSINDEN — `ends_at` KOLONU YOK (ADR-0035 §2d)
  -- =========================================================================
  -- Bitis zamani `scheduled_at + duration_minutes` ile TURETILIR. Projede
  -- YEDINCI kez verilen ayni karar (`last_activity_at`in reddi,
  -- `finance.balances`in reddi, `daily_report_runs.status`un reddi ...): iki
  -- kolon tutulsaydi biri guncellenip digeri unutuldugunda hata SESSIZ olurdu
  -- ve haftalik takvim gridinde UST USTE BINEN bir blok cizilirdi.
  duration_minutes   integer      NOT NULL,

  -- =========================================================================
  -- DURUM KODDA ENUM — TENANT-TANIMLI DEGIL (ADR-0035 §2a)
  -- =========================================================================
  -- Finans kategorisi tenant tablosuna cikmisti cunku "Sunucu maliyeti" ile
  -- "Hammadde" ayni listede yasayamaz. Randevu durumu OYLE DEGILDIR: dort hal
  -- her sektorde ayni seyi anlatir (`OpportunityStage` / `ProjectStatus` ile
  -- ayni degerlendirme).
  --
  -- ⚠️ `no_show` `cancelled`DAN AYRI ve bu bu modulun en degerli ayrimidir:
  -- iptal bir HABERDIR, gelmemek bir KAYIPTIR (ayrilan zaman bosa gitti). Tek
  -- degerde birlestirmek Slice 4'un yapisal katkicisinin alarm sinyalini
  -- TUMUYLE yok ederdi — "gelmedi orani" diye bir sey hesaplanamazdi.
  --
  -- ⚠️ Sozluk hem KODDA (`APPOINTMENT_STATUSES`) hem burada yazilir ve ikisi
  -- senkron kalmak zorundadir. Ayrim bilincli: CHECK, uygulamayi ATLAYAN
  -- yollari da baglar (`projects_status_valid` ile ayni karar).
  status             text         NOT NULL DEFAULT 'scheduled',

  -- `interactions.author_user_id` / `transactions.created_by_user_id` ile ayni
  -- desen ve ayni gerekce (cross-schema FK yasak — `platform.users` baska bir
  -- modulun tablosudur).
  --
  -- ⚠️ NULLABLE: yalnizca OLUSTURANI tutar ve bir DENETIM IZI DEGILDIR. Bir
  -- randevunun saatini kimin degistirdigi SORULAMAZ (ADR-0035 §5;
  -- `platform/audit` ARCHITECTURE §6.2'de yazili, kod olarak yok).
  created_by_user_id uuid,

  created_at         timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT appointments_duration_positive CHECK (duration_minutes > 0),

  CONSTRAINT appointments_status_valid
    CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),

  -- "Girilmedi" ile "bos girildi" AYNI seydir; ikisi de `NULL`dur. Bos bir
  -- dize Slice 3'te BOS BIR EMBEDDING CAGRISI demek olurdu — para harcayan,
  -- hicbir sey aramayan bir vektor.
  CONSTRAINT appointments_service_note_not_blank
    CHECK (service_note IS NULL OR btrim(service_note) <> ''),

  CONSTRAINT appointments_updated_after_created CHECK (updated_at >= created_at)
);
--> statement-breakpoint

-- ===========================================================================
-- INDEX'LER — BIRINCISI BU MODULUN BIRINCIL OKUMA YOLUDUR
-- ===========================================================================
-- MT §12.3: bilesik index'te `tenant_id` DAIMA ilk kolon.
--
-- Haftalik takvim "su iki an arasindaki randevular" diye sorar; bu, modulun en
-- sik calisan sorgusudur ve `finance.transactions`in `(tenant_id,
-- occurred_on)` index'iyle ayni sekildedir.
CREATE INDEX appointments_tenant_scheduled_idx
  ON appointments.appointments (tenant_id, scheduled_at);
--> statement-breakpoint

-- "Bu kisinin randevulari" — Slice 2'de yazma yolu acilinca okunmaya baslar.
CREATE INDEX appointments_tenant_contact_idx
  ON appointments.appointments (tenant_id, crm_contact_id);
--> statement-breakpoint

-- ===========================================================================
-- HNSW, IVFFlat DEGIL (ADR-0029 §1). Operator `vector_cosine_ops` — sorgudaki
-- `<=>` ile eslesmezse index DEVRE DISI kalir ve sorgu TAM TARAMA yapar; sessiz
-- bir performans coku.
--
-- ⚠️ INDEX BUGUN BOS BIR KOLONUN UZERINDE. NULL degerler indekslenmez (btree
-- ile ayni davranis), yani Slice 1'de maliyeti sifirdir. Simdi kurulmasinin
-- sebebi Slice 3'te hatirlamaya guvenmemektir — unutulsaydi anlamsal katkici
-- SESSIZCE tam tarama yapardi ve hicbir test kirmizi yanmazdi.
-- ===========================================================================
CREATE INDEX appointments_embedding_idx
  ON appointments.appointments USING hnsw (embedding vector_cosine_ops);
--> statement-breakpoint

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2). SAPMA YOK, BESINCI KEZ.
--
-- `current_setting`'de `missing_ok` KULLANILMAZ: context kurulmamissa sorgu
-- SESSIZCE BOS DONMEZ, HATA VERIR (MT §12.6 madde 4). Bedeli bu modulde de
-- agirdir: sessiz bos sonuc "bugun hic randevu yok" gibi gorunur ve kullanici
-- gunu bos sanip evine gider.
-- ===========================================================================
ALTER TABLE appointments.appointments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE appointments.appointments FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON appointments.appointments
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

-- Uygulama rolu: yalnizca DML. DDL yetkisi ASLA verilmez.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON appointments.appointments TO businessos_app;
  END IF;
END
$$;
