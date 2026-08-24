-- ===========================================================================
-- IK v2 — izin takibi + zenginlestirilmis calisan kaydi (ADR-0044)
-- ===========================================================================
--
-- ⚠️ YENI SEMA YOK. Mevcut `hr` semasina BIR tablo ve BES kolon eklenir.
--
-- Product Owner ADR-0043'un kapsamini ekranlari gordukten sonra reddetti:
-- _"izin gunleri vs yok ... bir IK'cinin ve patronun ihtiyaclarini goz onune
-- alarak tekrardan duzenle"_. Bu migration o talebin semadaki karsiligidir —
-- ama ADR-0043'un IKI YUK TASIYAN kararini bozmadan (§1, §2).

-- ===========================================================================
-- 1. ⚠️ UCRET DUZELTME — TEKILLIK KISITI KALKIYOR (ADR-0044 §1)
-- ===========================================================================
--
-- Kisitin gerekcesi suydu: "bugunku maas sorusunun IKI CEVABI olurdu ve
-- kazanani KARARLI SIRALAMA belirlerdi."
--
-- ⚠️ Belirsizlik DOGMUYOR, cunku siralama artik kararli degil ANLAMLI:
-- `(effective_from DESC, recorded_at DESC)` — EN SON YAZILAN KAZANIR, ki bir
-- DUZELTMENIN tanimi tam olarak budur.
--
-- ⚠️ DEFTER HALA EKLEME-YALNIZDIR: `update` metodu YOK, `compensation:delete`
-- izni YOK, veritabani yetkisi YOK (`GRANT SELECT, INSERT` — `0035`). Degisen
-- tek sey, ayni gune IKINCI BIR EKLEMENIN mesru sayilmasi.
--
-- ⚠️ Neden yerinde `UPDATE` degil: ADR-0043 §6.2'nin sozu ("maasi kim ne zaman
-- degistirdi sorusunun cevabi DEFTERIN KENDISIDIR") `platform/audit`i maas
-- tarafina baglamamanin TEK gerekcesiydi. Yerinde duzenleme o cevabi yok eder
-- ve borcu geri getirirdi.
ALTER TABLE hr.compensation_records
  DROP CONSTRAINT IF EXISTS compensation_effective_unique;
--> statement-breakpoint

-- Duzeltme sorgusunun erisim deseni: ayni calisan + ayni yururluk tarihi
-- icinde EN SON yazilan.
CREATE INDEX IF NOT EXISTS compensation_supersede_idx
  ON hr.compensation_records (tenant_id, employee_id, effective_from DESC, recorded_at DESC);
--> statement-breakpoint

-- ===========================================================================
-- 2. CALISAN KAYDI ZENGINLESIYOR — BES ALAN (ADR-0044 §3)
-- ===========================================================================
--
-- ⚠️ Her biri ADR-0043 §3.5'in olcutunden gecirildi: "bir alan, v1'in bir
-- ozelliginin CALISMASI icin gerekli degilse yazilmaz."
--
-- ⚠️ HALA YAZILMAYANLAR (§3.5 aynen yururlukte): TC kimlik no · dogum tarihi ·
-- ev adresi · ozel telefon · acil durum kisisi · medeni hal · saglik verisi ·
-- din · sendika uyeligi. Talep "detay" idi, "her sey" DEGIL.
ALTER TABLE hr.employees
  ADD COLUMN IF NOT EXISTS department        text,
  ADD COLUMN IF NOT EXISTS employment_type   text NOT NULL DEFAULT 'full_time',
  ADD COLUMN IF NOT EXISTS work_mode         text NOT NULL DEFAULT 'office',
  ADD COLUMN IF NOT EXISTS contract_ends_on  date,
  -- ⚠️ HAK EDIS BIR MEVZUAT KURALI DEGIL, BIR SAYIDIR (§2.2).
  -- Turkiye'de kidemle degisir (14/20/26) ama bu ULKEYE OZEL MEVZUATTIR ve
  -- ulke degisince bastan yazilir — ADR-0041'in e-fatura ve ADR-0043'un bordro
  -- gerekcesiyle BIREBIR AYNI. Sistem carpar ve cikarir, KURAL BILMEZ.
  ADD COLUMN IF NOT EXISTS annual_leave_days integer NOT NULL DEFAULT 0,
  -- ⚠️ KENDINE REFERANS. `ON DELETE SET NULL`: bir yonetici silinirse astlari
  -- YETIM KALMAZ, yalnizca baglantisiz kalir.
  --
  -- ⚠️ DONGU (A -> B -> A) VERITABANINDA ENGELLENMEZ ve bu bilinclidir: bir
  -- dongu kontrolu ozyinelemeli sorgu ister ve HER YAZMADA calisirdi. Bunun
  -- yerine OKUMA tarafi dayanikli yazilir (derinlik siniri). Bilinen sinir.
  ADD COLUMN IF NOT EXISTS manager_employee_id uuid REFERENCES hr.employees (id) ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE hr.employees
  ADD CONSTRAINT employees_employment_type_valid
    CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'intern')),
  ADD CONSTRAINT employees_work_mode_valid
    CHECK (work_mode IN ('office', 'remote', 'hybrid')),
  ADD CONSTRAINT employees_leave_days_range
    CHECK (annual_leave_days >= 0 AND annual_leave_days <= 365),
  -- ⚠️ Bir calisan KENDI yoneticisi olamaz. Bu, dongunun EN KISA halidir ve
  -- tek satira bakarak dogrulanabildigi icin veritabaninda zorlanir; daha uzun
  -- donguler zorlanmaz (yukaridaki gerekce).
  ADD CONSTRAINT employees_manager_not_self
    CHECK (manager_employee_id IS NULL OR manager_employee_id <> id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS employees_department_idx
  ON hr.employees (tenant_id, department);
--> statement-breakpoint

-- ⚠️ Patronun alarm kalemi: yaklasan sozlesme bitisleri.
CREATE INDEX IF NOT EXISTS employees_contract_ends_idx
  ON hr.employees (tenant_id, contract_ends_on)
  WHERE contract_ends_on IS NOT NULL;
--> statement-breakpoint

-- ===========================================================================
-- 3. hr.leave_requests — IZIN TAKIBI (ADR-0044 §2, §5)
-- ===========================================================================
--
-- ⚠️⚠️ BU TABLODA "SEBEP" ALANI YOKTUR — VE BU, SUS DEGIL, ADR-0043 §3'UN
-- SINIRININ TASIYICISIDIR.
--
-- Bir izin kaydinin en dogal alani "sebep"tir ve oraya ILK YAZILACAK SEY
-- "RAPORLU"DUR. ADR-0043 §3 saglik verisini KVKK m.6 ozel nitelikli veri
-- rejimi geregi KESIN OLARAK disarida tutmustu; serbest not alani da tam bu
-- yuzden hic acilmamisti.
--
-- Bir "sebep" alani o sinirin ARKA KAPISIDIR: sinir yerinde gorunur, kullanici
-- onu ihlal eder ve hata SESSIZDIR — hicbir test kirmizi yanmaz, hicbir lint
-- uyarmaz.
--
-- ⚠️ AYNI SEBEPLE `type` NUMARALANDIRMASINDA `sick` / `raporlu` YOKTUR. Bir
-- izin turu olarak "hastalik" secmek, o satiri serbest metin olmasa bile bir
-- SAGLIK VERISI yapardi.
--
-- ⚠️ DURUST BEDEL: bir isletme raporlu gunleri bu modulde TAKIP EDEMEZ. Dogru
-- cevap "mazeret" diye yazmak DEGILDIR (o da veriyi orada tutar); dogru cevap,
-- ADR-0043 §3.4'un uc onkosulu saglandiginda AYRI bir ADR'dir. Sinir arayuzde
-- de yazilir.
CREATE TABLE hr.leave_requests (
  id                   uuid        PRIMARY KEY,
  tenant_id            uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- ⚠️ `ON DELETE CASCADE` — ucret defterinden BILINCLI SAPMA. Ucret gecmisi
  -- silinirse ADR-0043 §6.2'nin denetim cevabi kaybolur (o yuzden RESTRICT);
  -- bir izin kaydinin silinen bir calisandan sonra yasamasi ise ANLAMSIZDIR.
  --
  -- ⚠️ Pratikte izinler yine korunur: ucret kaydi olan calisan zaten silinemez.
  employee_id          uuid        NOT NULL REFERENCES hr.employees (id) ON DELETE CASCADE,

  type                 text        NOT NULL,
  starts_on            date        NOT NULL,
  ends_on              date        NOT NULL,
  status               text        NOT NULL DEFAULT 'pending',

  requested_by_user_id uuid        NOT NULL,
  requested_at         timestamptz NOT NULL,

  -- ⚠️ SATIR ICI AKTOR DAMGASI — bir DENETIM IZI DEGILDIR ve oyle
  -- adlandirilmaz (ADR-0041 §8.2'nin ayni ayrimi: olay gunlugu "ne oldu"yu
  -- sirasiyla anlatir, damga yalnizca SON DURUMU soyler). Burada YETERLIDIR
  -- cunku cevaplanacak soru tektir: "bu izni kim onayladi".
  --
  -- ⚠️ `platform.audit_log`a BAGLANMAZ: cevap zaten satirin uzerinde.
  decided_by_user_id   uuid,
  decided_at           timestamptz,

  -- ⚠️ `sick` / `raporlu` YOK (yukaridaki blok). Liste bilincli olarak saglik
  -- IMA ETMEYEN kalemlerden olusur.
  CONSTRAINT leave_type_valid
    CHECK (type IN ('annual', 'unpaid', 'excuse', 'administrative')),

  CONSTRAINT leave_status_valid
    CHECK (status IN ('pending', 'approved', 'rejected')),

  CONSTRAINT leave_dates_ordered CHECK (ends_on >= starts_on),

  -- ⚠️ KARAR TUTARLILIGI — `employees_ended_on_consistency` ile ayni sekil:
  -- bekleyen bir izin karar damgasi TASIYAMAZ, karara baglanmis bir izin
  -- damgasiz KALAMAZ. Aksi halde "kim onayladi" sorusu cevapsiz kalir ya da
  -- bekleyen bir izin onaylanmis gibi okunur.
  CONSTRAINT leave_decision_consistency CHECK (
    (status = 'pending'  AND decided_by_user_id IS NULL AND decided_at IS NULL) OR
    (status <> 'pending' AND decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL)
  )
);
--> statement-breakpoint

-- ⚠️ `days` KOLONU YOK (§2.5): gun sayisi `starts_on`/`ends_on`tan TURETILIR.
-- IS GUNU hesabi YAPILMAZ — resmi tatiller ULKEYE OZEL MEVZUATTIR ve hafta
-- sonu tanimi bile evrensel degildir. Sistem TAKVIM GUNU sayar.
--
-- ⚠️ BAKIYE DE KOLON DEGILDIR (§2.3): `annual_leave_days` eksi onaylanmis
-- `annual` izinlerin gun toplami. Projede ONBIRINCI kez ayni karar — kolonda
-- bozulma "3 gun izniniz kaldi" gibi SESSIZ ve MAKUL GORUNEN yanlis bir sayi
-- uretirdi.
CREATE INDEX leave_employee_idx
  ON hr.leave_requests (tenant_id, employee_id, starts_on DESC);
--> statement-breakpoint

-- Patronun ve IK'nin gunluk sorusu: "bugun kim izinde", "onay bekleyen var mi".
CREATE INDEX leave_status_range_idx
  ON hr.leave_requests (tenant_id, status, starts_on, ends_on);
--> statement-breakpoint

-- RLS — STANDART SABLON (MT §12.2), ONBIRINCI kez. SAPMA YOK.
ALTER TABLE hr.leave_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE hr.leave_requests FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON hr.leave_requests
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

-- ===========================================================================
-- ⚠️ YETKI — IZIN TABLOSU TAM CRUD ALIR, UCRET DEFTERI ALMAZ
-- ===========================================================================
-- Fark bilinclidir: bir izin talebi GUNCELLENIR (onaylanir/reddedilir), bir
-- ucret kaydi GUNCELLENMEZ (ADR-0043 §6.2 — degistirilemezligi denetim izinin
-- ta kendisidir).
--
-- ⚠️ `DELETE` veriliyor ama UYGULAMADA KULLANILMIYOR: `leave:delete` izni
-- kataloga YAZILMADI (§6) — reddedilen bir izin `rejected` olur, silinmez.
-- Yetkiyi vermek, ileride retention temizliginin bu tabloya uzanmasi icin
-- (ROADMAP §8.5); izin kataloguna yazmamak, bugun kimsenin silememesi icin.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON hr.leave_requests TO businessos_app;
  END IF;
END
$$;
