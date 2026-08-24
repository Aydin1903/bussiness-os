-- ===========================================================================
-- hr semasi — Faz 5'in DOKUZUNCU is modulu (ADR-0043 §1)
-- ===========================================================================
--
-- `platform` disindaki ONUNCU sema (`knowledge`, `crm`, `projects`, `finance`,
-- `appointments`, `documents`, `inventory`, `suppliers`, `invoicing`, `hr`).
-- Mutlak Kural 5: her modul kendi semasina sahiptir.
--
-- ⚠️ ANAHTAR `hr`: sema, modul klasoru, rota (`/app/hr`) ve `data-module` AYNI
-- kelime (ADR-0035'in `booking` -> `appointments` dersi, dokuzuncu kez).
--
-- ===========================================================================
-- ⚠️ BU SEMADA VEKTOR YOKTUR — ve bu, ikinci kez (ADR-0041'den sonra)
-- ===========================================================================
-- `embedding` kolonu, chunk tablosu, `reindex` ucu ve ORAN SINIRI YOKTUR.
-- Modul `POST /ask` havuzuna HIC baglanmaz: ne anlamsal ne yapisal bir
-- katkicisi vardir (ADR-0043 §5). Bu bir eksik degil, UC AYRI gerekcenin ayni
-- yere cikmasidir:
--
--   1. Anlatisal icerik YOK — cunku SERBEST NOT ALANI da yok (asagida).
--   2. Bir ekip listesi KATALOGDUR, olgu degil (ADR-0040 §3'un olcutu):
--      "12 aktif calisan" bir SAYIMDIR, haber degil, ve her cevapta bir taban
--      yuvasi isgal ederdi.
--   3. ⚠️ Ve bir GUVENLIK katmanidir (§4.2 katman 3): maas verisinin `/ask`
--      yoluna sizmasi icin once BIR KATKICI YAZILMASI gerekir — yani hata
--      sessiz OLAMAZ, bir dosya acilmasi gerekir.
--
-- ===========================================================================
-- ⚠️ SERBEST NOT ALANI YOKTUR — MODULUN EN BILINCLI EKSIGI (§1.1)
-- ===========================================================================
-- Sekiz modulun sekizinde bir `notes`/`description` alani var. Burada YOK,
-- cunku bir IK kaydindaki serbest metin alanina ILK YAZILACAK SEY SAGLIK
-- BILGISIDIR ("raporlu", "ameliyat sonrasi yarim gun", "kronik rahatsizligi
-- var").
--
-- ADR-0043 §3'un sinirini koyup yaninda bos bir metin kutusu birakmak, siniri
-- KULLANICIYA IHLAL ETTIRMEK olurdu — ve o veri sisteme girdigi an KVKK m.6'nin
-- ozel nitelikli veri rejimi devreye girer, HICBIR KONTROL OLMADAN. ⚠️ Hata
-- SESSIZDIR: hicbir test kirmizi yanmaz, hicbir lint uyarmaz, ekran calisir.
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS hr;
--> statement-breakpoint

-- Uygulama rolu semayi gorur ama icinde nesne OLUSTURAMAZ (02-schemas.sql
-- deseni; dokuz onceki sema ile birebir ayni).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT USAGE ON SCHEMA hr TO businessos_app;
  END IF;
END
$$;
--> statement-breakpoint

-- ===========================================================================
-- hr.employees — CALISANIN KENDISI
-- ===========================================================================
--
-- ⚠️ BU TABLO `platform.memberships` DEGILDIR ve ondan TURETILMEZ (§2).
-- "Kim bu sirkette calisiyor" ile "kimin sisteme girisi var" IKI AYRI
-- SORUDUR ve kumeler IKI YONDE DE ayrisir: depo gorevlisinin hesabi yoktur,
-- dis mali musavir calisan degildir.
--
-- ⚠️ Kararin en somut dayanagi KODDADIR: `identity.public.ts` yalnizca
-- `emailVerified` acar (ad, e-posta, listeleme YOK) ve `GET /v1/memberships`
-- yalnizca `userId`/`role`/`status`/`joinedAt` doner. Yani PLATFORMDA BUGUN
-- BIR CALISANIN ADINI VEREBILECEK HICBIR YUZEY YOKTUR — "uyelikten turet"
-- secenegi once o dosyayi GENISLETMEYI gerektirirdi.
CREATE TABLE hr.employees (
  id                 uuid        PRIMARY KEY,
  tenant_id          uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- ⚠️ TEK ALAN — `first_name`/`last_name` DEGIL (§1.6). Ayrim bir KULTUR
  -- VARSAYIMIDIR (tek adli, uc soyadli, sirali-ters yazilan adlar) ve global
  -- bir urunun cekirdegine konulamaz. Projede ad zaten tek alan olarak yasar
  -- (`crm.contacts`, `suppliers.contacts`). Bedeli: SOYADA GORE SIRALAMA YOK.
  full_name          text        NOT NULL,

  -- =========================================================================
  -- ⚠️ `job_title` — `role` KELIMESI SEMADA KULLANILMAZ (§1.3)
  -- =========================================================================
  -- Bu projede `role` TEK BIR SEY demektir: owner | admin | member | viewer
  -- (MT §7.5, ADR-0025). Bir IK kaydindaki "unvan" ise "Kidemli Muhasebe
  -- Uzmani"dir — YETKI DEGIL, IS TANIMI.
  --
  -- ⚠️ Ikisi ayni kelimeyle adlandirilsaydi hata SESSIZ VE TEHLIKELI olurdu:
  -- bir gun birisi `employees.role`a bakip YETKI KARARI verir, ya da
  -- `memberships.role`u ekranda "unvan" diye gosterirdi. Ikisi de bir tip
  -- hatasi uretmez.
  --
  -- SERBEST METIN, enum DEGIL: her sirketin unvan seti farklidir. Tenant
  -- tanimli bir sozluk (ADR-0034 §4'un deseni) burada bir SORUYU CEVAPLAMIYOR,
  -- yalnizca yazim birligi saglardi — v2.
  job_title          text,

  -- ⚠️ IS ILETISIMI. Adlar NITELENMISTIR ve bu bilinclidir (§3.5): `email`
  -- denseydi arayuz bir gun KISISEL e-postayi kabul ederdi ve fark GORULMEZDI.
  -- Ev adresi, ozel telefon, dogum tarihi, TC kimlik no ve acil durum kisisi
  -- KAPSAM DISIDIR — olcut: "bir alan, v1'in bir ozelliginin CALISMASI icin
  -- gerekli degilse yazilmaz" (KVKK veri minimizasyonu).
  work_email         text,
  work_phone         text,

  employment_status  text        NOT NULL DEFAULT 'active',
  started_on         date,
  ended_on           date,

  -- =========================================================================
  -- ⚠️ OPSIYONEL BAG — FK YOK (Mutlak Kural 5), SARKMA TOLERE EDILIR
  -- =========================================================================
  -- `platform.users`a FK VERILEMEZ (cross-schema FK yasak) ve VERILMEMELIDIR.
  -- Yazilirken DOGRULANIR: verilen id mevcut tenant'in AKTIF bir uyesi olmali
  -- (`TenantAccessQuery.resolveMemberAccess` — Projeler'in
  -- `TaskAssigneeNotMemberError` deseninin birebir aynisi, `tenant.public.ts`
  -- TEK SATIR degismeden).
  --
  -- ⚠️ Sarkma BURADA BIR BOZULMA DEGIL, DOGRU DURUMDUR (§2.5): ayrilan
  -- calisanin erisimi kesilir (uyelik gider), IK kaydi DURUR. Okuyan her yol
  -- buna dayanikli yazilir.
  platform_user_id   uuid,

  created_by_user_id uuid        NOT NULL,
  created_at         timestamptz NOT NULL,
  updated_at         timestamptz NOT NULL,

  CONSTRAINT employees_full_name_not_blank CHECK (btrim(full_name) <> ''),
  CONSTRAINT employees_status_valid        CHECK (employment_status IN ('active', 'ended')),

  -- ⚠️ Ayrilmis bir calisanin ayrilma tarihi OLMAK ZORUNDA; calisan birinin
  -- OLMAMALI. Aksi halde "ne zaman ayrildi" sorusu cevapsiz kalir ya da
  -- calisan biri ayrilmis gibi okunur.
  CONSTRAINT employees_ended_on_consistency CHECK (
    (employment_status = 'ended'  AND ended_on IS NOT NULL) OR
    (employment_status = 'active' AND ended_on IS NULL)
  ),

  CONSTRAINT employees_dates_ordered CHECK (
    started_on IS NULL OR ended_on IS NULL OR ended_on >= started_on
  )
);
--> statement-breakpoint

-- ⚠️ Bir platform kullanicisi EN FAZLA BIR calisan kaydina baglanir. Olmasaydi
-- iki calisan satiri ayni hesabi sahiplenir ve "bu kullanici kim" sorusunun
-- IKI CEVABI olurdu. Kismi index: `NULL` degerler tekillige girmez (hesabi
-- olmayan calisan sayisi sinirsizdir).
CREATE UNIQUE INDEX employees_platform_user_unique
  ON hr.employees (tenant_id, platform_user_id)
  WHERE platform_user_id IS NOT NULL;
--> statement-breakpoint

-- MT §12.3: bilesik index'te `tenant_id` DAIMA ilk kolon.
CREATE INDEX employees_tenant_status_idx ON hr.employees (tenant_id, employment_status, full_name);
--> statement-breakpoint

-- ===========================================================================
-- hr.compensation_records — EKLEME-YALNIZ UCRET DEFTERI
-- ===========================================================================
--
-- ⚠️ AYRI BIR TABLO OLMASI, §4.2'NIN BIRINCI IZOLASYON KATMANIDIR.
-- `employees`te maas kolonu YOKTUR: bir `SELECT *`in ya da bir liste
-- projeksiyonunun maasi YANLISLIKLA tasimasi boylece MUMKUN DEGILDIR.
--
-- ⚠️ GUNCEL UCRET TURETILIR (§1.5), kolonda saklanmaz — projede ONUNCU kez
-- ayni karar (`finance.balances` reddi, `ends_at` reddi, `inventory.items`ta
-- miktar kolonunun reddi, durgunlugun turetilmesi ...). Gerekce degismedi ve
-- HATANIN SEKLIDIR: kolonda bozulma _sessiz ve makul gorunen yanlis bir sayi_;
-- turetmede _olculebilir yavaslik_.
--
-- ⚠️ Bedel Stok'takinden KUCUKTUR ve olculmesine gerek yok: bir calisanin
-- ucret kaydi YILDA BIR-IKI artar, `inventory.movements` gibi sinirsiz
-- buyumez.
--
-- ⚠️ DEFTER DEGISTIRILEMEZ — ve gerekce UCUNCU KEZ FARKLIDIR:
--     `inventory.movements`      -> bugunku miktar ONDAN TURETILIR
--     `suppliers.interactions`   -> olmus bir gorusme "degismis" olmaz
--     `hr.compensation_records`  -> ⚠️ DEGISTIRILEMEZLIK DENETIM IZININ TA
--                                   KENDISIDIR (§6.2)
-- Ucuncusu yenidir: burada degistirilemezlik bir VERI BUTUNLUGU tedbiri degil,
-- bir HESAP VEREBILIRLIK mekanizmasidir. "Maasi kim, ne zaman degistirdi"
-- sorusu, degisikligin KENDISI BIR SATIR oldugu icin cevaplanir — ayri bir
-- denetim altyapisina ihtiyac duymadan.
CREATE TABLE hr.compensation_records (
  id                  uuid           PRIMARY KEY,
  tenant_id           uuid           NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- ⚠️ `ON DELETE RESTRICT` — `CASCADE` DEGIL (§1.4). `CASCADE` olsaydi bir
  -- calisani silmek ucret gecmisini de goturur ve §6.2'nin denetim cevabi
  -- SESSIZCE yok olurdu. ADR-0039'un `movements -> items` ile ayni sekli,
  -- farkli gerekce: orada BUGUNKU SAYI korunuyordu, burada GECMISIN KENDISI.
  employee_id         uuid           NOT NULL REFERENCES hr.employees (id) ON DELETE RESTRICT,

  -- ⚠️ `numeric` — TS tarafinda ASLA `number` degil (ADR-0034 §2c, DORDUNCU
  -- kez). Bir kez `number`a cevrilse yuvarlama hatasi KALICI olurdu ve
  -- ciktisi bir MAAS RAKAMIDIR.
  amount              numeric(14, 2) NOT NULL,

  -- ⚠️ Yalnizca SEKIL dogrulanir (`^[A-Z]{3}$`); kod listesi DOGRULANMAZ —
  -- "XYZ" gecerli sayilir (ADR-0034'un bilinen siniri, ikinci kez).
  currency            char(3)        NOT NULL,

  period              text           NOT NULL DEFAULT 'monthly',

  -- ⚠️ GELECEK TARIHLI KAYIT MESRUDUR: gelecek ayin zammi bugunden yazilir.
  -- Guncel ucret sorgusu bu yuzden `effective_from <= CURRENT_DATE` kisitini
  -- TASIMAK ZORUNDADIR; unutulursa gelecek tarihli bir zam BUGUN
  -- YURURLUKTEYMIS GIBI okunur ve hata SESSIZDIR.
  effective_from      date           NOT NULL,

  -- ⚠️ DENETIM IZININ MAAS TARAFINI KAPATAN KOLON (§6.2). `platform/audit`e
  -- ihtiyac duymadan "kim, ne zaman" sorusunu cevaplar.
  recorded_by_user_id uuid           NOT NULL,
  recorded_at         timestamptz    NOT NULL,

  CONSTRAINT compensation_amount_positive CHECK (amount > 0),
  CONSTRAINT compensation_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT compensation_period_valid    CHECK (period IN ('monthly', 'hourly', 'annual')),

  -- ⚠️ Ayni calisan icin ayni gune IKI kayit yazilamaz. Olmasaydi "bugunku
  -- maas" sorusunun IKI CEVABI olurdu ve kazanani KARARLI SIRALAMA belirlerdi;
  -- hata SESSIZ olurdu.
  CONSTRAINT compensation_effective_unique UNIQUE (employee_id, effective_from)
);
--> statement-breakpoint

-- Guncel ucret sorgusunun erisim deseni: calisan + tarih (en yeni once).
CREATE INDEX compensation_employee_effective_idx
  ON hr.compensation_records (tenant_id, employee_id, effective_from DESC);
--> statement-breakpoint

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2), ONUNCU kez. SAPMA YOK.
--
-- `missing_ok` KULLANILMAZ: context kurulmamissa sorgu SESSIZCE BOS DONMEZ,
-- HATA VERIR (MT §12.6 madde 4).
--
-- ⚠️ Bir IK tablosunda sessiz bos sonuc ozellikle tehlikelidir: ekip listesi
-- BOS gorunur ve okuyan kisi "kayit yok" diye okur — oysa kayitlar durmaktadir.
-- ===========================================================================
ALTER TABLE hr.employees ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE hr.employees FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON hr.employees
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

ALTER TABLE hr.compensation_records ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE hr.compensation_records FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON hr.compensation_records
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

-- ===========================================================================
-- ⚠️ YETKILER — DEFTER ILK GUNDEN DORT KATMANLI
-- ===========================================================================
-- `hr.employees` normal CRUD alir: unvan, is telefonu ve durum DEGISIR
-- (§6.3) — degisikligi `platform.audit_log` kaydeder.
--
-- ⚠️ `hr.compensation_records` YALNIZCA `SELECT, INSERT` alir. Bu, `0033` ve
-- `0034`un iki deftere SONRADAN ekledigi dorduncu katmanin BURADA ILK GUNDEN
-- konmasidir — ve burada digerlerinden DAHA yuku vardir: bu defterin
-- degistirilemezligi §6.2'ye gore DENETIM IZININ KENDISIDIR. Silinebilseydi
-- "maasi kim degistirdi" sorusunun cevabi da silinirdi.
--
-- ⚠️ `REVOKE` GEREKMEZ ve bu OLCULDU, varsayilmadi: `ALTER DEFAULT PRIVILEGES`
-- YALNIZCA `platform` semasi icin tanimlidir (sema-siz/global bir tanim da
-- YOKTUR — `pg_default_acl` sorgulandi). Yeni bir semada verilen yetki, tam
-- olarak YAZILAN yetkidir. `platform.audit_log`ta `REVOKE` sart olmasinin
-- sebebi tam olarak bu farkti.
--
-- ⚠️ `compensation:delete` izni de YOKTUR (§7.1) — yani koruma UC katmanlidir:
-- entity'de `update` metodu yok · izin yok · veritabani yetkisi yok.
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON hr.employees            TO businessos_app;
    GRANT SELECT, INSERT                 ON hr.compensation_records TO businessos_app;
  END IF;
END
$$;
