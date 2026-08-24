-- ===========================================================================
-- platform.audit_log — DEGISMEZ denetim kaydi (ADR-0043 §6, kalem A)
-- ===========================================================================
--
-- ⚠️ YENI BIR SEMA DEGIL. Tablo MEVCUT `platform` semasina eklenir: bu bir is
-- modulu degil, ARCHITECTURE §6.2'nin platform zincirinin DORDUNCU halkasidir
-- (Tenant -> Identity -> Authorization -> AUDIT). Kendi semasini acmak, onu bir
-- is modulu gibi konumlandirir ve `hr`/`crm` ile ayni siniftaymis gibi
-- okunmasina yol acardi.
--
-- ⚠️ BU TABLO MULTI_TENANT_ARCHITECTURE §12.4'TE ZATEN YAZILIYDI ve satiri
-- BIREBIR uygulaniyor:
--
--     `platform.audit_log` | Degismez denetim kaydi | `tenant_id` tasir ->
--     STANDART RLS uygulanir; `UPDATE`/`DELETE` yetkisi HICBIR ROLE VERILMEZ
--
-- Yani buradaki hicbir sey yeni bir mimari karar degil; uc kez ertelenmis
-- (ADR-0034 §8 -> ADR-0039/0040 -> ADR-0041 §8) bir yazili kararin
-- UYGULANMASIDIR. Dokuman guncellenmedi cunku guncellenecek bir sey yoktu.
--
-- ===========================================================================
-- ⚠️ DEGER SAKLANMAZ — YALNIZCA HANGI ALANIN DEGISTIGI (ADR-0043 §6.5)
-- ===========================================================================
-- Klasik bir denetim izi `before`/`after` degerlerini tasir. BU TABLODA BOYLE
-- BIR KOLON YOKTUR ve eklenmemelidir. Uc gerekce:
--
--   1. ⚠️ ILK TUKETICI IK MODULUDUR ve orada degisen alanlardan biri MAAStir.
--      Eski maasi buraya yazmak, maas verisini IKINCI BIR TABLOYA KOPYALAMAK
--      demektir ve ADR-0043 §4.2'nin uc katmanli izolasyonunu (ayri tablo +
--      ayri izin + katkici yoklugu) TEK HAMLEDE deler.
--   2. Bir gun bir alan yanlislikla hassas veri tasirsa (ADR-0043 §3'un
--      siniri), deger saklayan bir denetim kaydi onu KALICI OLARAK cogaltir.
--   3. ⚠️ Ve maas icin BILGI KAYBI YOKTUR: eski deger zaten
--      `hr.compensation_records`ta durur (ekleme-yalniz defter, §6.2).
--
-- Bu, `shared/ai-usage-recorder.port.ts`in kurdugu disiplinin IKINCI
-- uygulamasidir: _"ICERIK TASINMAZ — YALNIZCA OLCU"_.
--
-- ⚠️ DURUST BEDEL: _"telefon numarasi neydi"_ ve _"unvani ne idi"_ SORULAMAZ.
-- Cevaplanan sey _"3 Mart'ta X kisisi bu calisanin `job_title` alanini
-- degistirdi"_dir. Hesap verebilirlik icin yeterli, geri alma icin degil.
--
-- ===========================================================================
-- ⚠️ SATIR BASINA BIR ALAN — `text[]` REDDEDILDI
-- ===========================================================================
-- Tek bir islemde iki alan degistiyse IKI SATIR yazilir. Bir dizi kolonu
-- (`changed_fields text[]`) tek satir uretirdi ve daha ucuz gorunur; ama:
--
--   * _"bu alan kac kez degisti"_ sorusu bir dizi kolonunda index'lenemez,
--   * ve bir gun deger eklemek isteyen biri icin dizi, `jsonb`e giden dogal
--     bir kapidir — yani §6.5'in sinirini ZAYIFLATIR.
--
-- ⚠️ AYNI ISLEMDE degisen alanlar `(resource_id, occurred_at, actor_user_id)`
-- uclusuyle GRUPLANABILIR: `AuditRecorder` tek bir `occurredAt` degeriyle
-- yazar (bkz. `audit-rows.ts`), yani ayni islemin satirlari BIREBIR AYNI
-- damgayi tasir. Ayri bir `operation_id` kolonu bu yuzden EKLENMEDI.
-- ===========================================================================

CREATE TABLE platform.audit_log (
  -- UUIDv7 — zaman sirali. Ayni `occurred_at` degerine sahip satirlar arasinda
  -- kararli bir ikincil siralama anahtari verir (ORDER BY occurred_at, id).
  id            uuid        PRIMARY KEY,

  -- RLS ekseni. MT §12.3: `NOT NULL` + `platform.tenants`a FK (modul -> platform
  -- yonlu TEK istisna). `ON DELETE RESTRICT`: denetim kaydi olan bir tenant
  -- silinemez — `platform.rate_limits` ile ayni secim, daha guclu bir gerekceyle.
  tenant_id     uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- =========================================================================
  -- ⚠️ NULL = SISTEM/WORKER. Sahte bir kullanici UYDURULMAZ.
  -- =========================================================================
  -- Bir arka plan isi (bugun `DailyReportWorker`, yarin retention) veri
  -- degistirebilir ve o degisikligin bir INSANI aktoru yoktur. Bos birakmak
  -- yerine sistemi temsil eden sahte bir uuid yazmak, denetim kaydini
  -- OKUYAN kisiyi yanlis yonlendirirdi.
  --
  -- FK YOKTUR (MT §12.4.3 ile ayni gerekce): `platform.users` tenant-scoped
  -- degildir ve bir denetim kaydi, kullanici silinse bile AYAKTA KALMALIDIR.
  -- =========================================================================
  actor_user_id uuid,

  -- Zaman `Clock` port'undan gelir, `now()` DEGIL (DEVELOPMENT_RULES 3.2).
  -- Varsayilan bilincli olarak YOKTUR: bir `DEFAULT now()`, testlerin sahte
  -- saatini sessizce devre disi birakirdi.
  occurred_at   timestamptz NOT NULL,

  -- =========================================================================
  -- KAYNAK — `<modul>.<kaynak>` bicimi, ornek: `hr.employee`
  -- =========================================================================
  -- ⚠️ NUMARALANDIRAN CHECK KISITI YOKTUR ve bu, `platform.rate_limits`in
  -- (`0014`) `action` kolonuyla BIREBIR AYNI karardir: platform, modullerin
  -- kaynak sozlugunu BILMEZ. Bilseydi her yeni modul bir PLATFORM migration'i
  -- gerektirirdi (ADR-0025'in acikca yasakladigi bagimlilik).
  --
  -- KAYBEDILEN KORUMA DURUSTCE: yanlis yazilmis bir kaynak adi veritabaninda
  -- YAKALANMAZ. Tek koruma cagiran modulun kendi sabitidir.
  --
  -- Anlamsiz (semantik tasimayan) kisitlar KALIR — bos ya da devasa bir ad
  -- hicbir modulde mesru degildir ve bunu bilmek is semantigi gerektirmez.
  -- =========================================================================
  resource_type text        NOT NULL,

  -- Ciplak uuid. ⚠️ FK YOKTUR ve OLAMAZ: hedef baska bir semadadir ve
  -- cross-schema FK YASAKTIR (Mutlak Kural 5). Kayit silinse bile denetim
  -- satiri kalir — zaten AMACI budur.
  resource_id   uuid        NOT NULL,

  -- =========================================================================
  -- ⚠️ `action` NUMARALANDIRILIR — ve bu, yukaridaki `resource_type`
  -- kararindan SAPMA DEGILDIR
  -- =========================================================================
  -- Ayrim su: `resource_type` bir MODUL sozlugudur (platform onu yorumlayamaz),
  -- `action` ise bir PLATFORM fiilidir. Uc deger platformun kendi
  -- soz dagarcigidir ve bir modul dorduncusunu getiremez — getirmesi gereken
  -- gun, bu tablo degil O KARAR tartisilir.
  -- =========================================================================
  action        text        NOT NULL,

  -- Degisen alanin ADI. ⚠️ DEGERI DEGIL (yukaridaki blok).
  field_name    text,

  CONSTRAINT audit_log_action_valid
    CHECK (action IN ('created', 'updated', 'deleted')),

  CONSTRAINT audit_log_resource_type_not_blank CHECK (btrim(resource_type) <> ''),
  CONSTRAINT audit_log_resource_type_length    CHECK (length(resource_type) <= 64),
  CONSTRAINT audit_log_field_name_not_blank
    CHECK (field_name IS NULL OR btrim(field_name) <> ''),
  CONSTRAINT audit_log_field_name_length
    CHECK (field_name IS NULL OR length(field_name) <= 64),

  -- =========================================================================
  -- ⚠️ SEKIL KISITI — uygulama katmanina GUVENILMEZ
  -- =========================================================================
  -- `updated` bir ALAN adlandirmak ZORUNDADIR: adlandirmayan bir guncelleme
  -- kaydi _"bir sey degisti ama ne oldugunu bilmiyoruz"_ demektir ve denetim
  -- izinin tek isini yapmaz.
  --
  -- `created`/`deleted` ise alan adi TASIYAMAZ: bir kaydin olusturulmasi
  -- "tek bir alanin" olayi degildir. Tasisaydi okuyan kisi, geri kalan
  -- alanlarin olusturulmadigini sanabilirdi.
  -- =========================================================================
  CONSTRAINT audit_log_field_name_matches_action CHECK (
    (action =  'updated' AND field_name IS NOT NULL) OR
    (action <> 'updated' AND field_name IS NULL)
  )
);
--> statement-breakpoint

-- ===========================================================================
-- INDEX'LER — MT §12.3: bilesik index'te `tenant_id` DAIMA ilk kolon
-- ===========================================================================
-- Iki erisim deseni var ve ikisi de gercek:
--   1. "Bu kaydin gecmisi"  -> `GET /audit?resourceType=&resourceId=`
--   2. "Son ne oldu"        -> `GET /audit` (filtresiz akis)
--
-- Ikincisi birincinin index'ini KULLANAMAZ (`resource_type` ortada kalir), o
-- yuzden ayri bir index gerekir.
--
-- ⚠️ BEDELI DURUSTCE: bu tablo `messages`tan sonra EN HIZLI BUYUYECEK tablodur
-- (ADR-0043 §6.7) ve her INSERT iki index guncelleyecektir. Kabul edildi:
-- alternatif, denetim kaydini OKUNAMAZ yapmakti.
CREATE INDEX audit_log_resource_idx
  ON platform.audit_log (tenant_id, resource_type, resource_id, occurred_at DESC, id DESC);
--> statement-breakpoint

CREATE INDEX audit_log_recent_idx
  ON platform.audit_log (tenant_id, occurred_at DESC, id DESC);
--> statement-breakpoint

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2). SAPMA YOK.
--
-- `missing_ok` KULLANILMAZ: context kurulmamissa sorgu SESSIZCE BOS DONMEZ,
-- HATA VERIR (MT §12.6 madde 4).
--
-- ⚠️ Bir denetim kaydinda sessiz bos sonuc ozellikle tehlikelidir: liste her
-- zaman bos gorunur ve okuyan kisi _"hicbir degisiklik olmamis"_ diye okur —
-- yani kayit tutuluyor olmasina ragmen SIFIR sonuc, tutulmuyormus gibi
-- gorunur. Denetim izinin en kotu bozulma bicimi budur.
-- ===========================================================================
ALTER TABLE platform.audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform.audit_log FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON platform.audit_log
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

-- ===========================================================================
-- ⚠️ DEGISMEZLIK — KATMAN 1: YETKI (MT §12.4'un yazili kurali)
-- ===========================================================================
-- _"`UPDATE`/`DELETE` yetkisi HICBIR ROLE VERILMEZ."_
--
-- `platform.rate_limits`ten (0014) BILINCLI SAPMA: orada `DELETE` retention
-- icin verilmisti. Burada VERILMEZ ve bedeli kayitlidir:
--
-- ⚠️ RETENTION TEMIZLIGI BU TABLODA `businessos_app` ILE YAPILAMAZ. Bu bir
-- eksiklik degil, kararin ta kendisidir: denetim kaydini silebilen bir
-- uygulama rolu, denetim kaydini ANLAMSIZ kilar. Retention karari
-- (ROADMAP §8.5) geldiginde ya ayri bir rol tanimlar ya da acikca gozden
-- gecirilmis bir migration yazar — ikisi de GORUNUR islerdir.
--
-- ===========================================================================
-- ⚠️⚠️ `REVOKE` SART — CUNKU YETKI VERMEMEK YETMIYOR
-- ===========================================================================
-- BU SATIR BIR TESTIN BULDUGU GERCEK BIR KUSURU KAPATIYOR ve kaydedilmesi
-- gerekiyor: `0000_init` su satiri tasiyor —
--
--     ALTER DEFAULT PRIVILEGES ... IN SCHEMA platform
--       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO businessos_app
--
-- Yani `platform` semasinda acilan HER YENI TABLO, hicbir sey yazilmasa bile
-- uygulama roluna DORT YETKIYI DE otomatik verir. Yalnizca `GRANT SELECT,
-- INSERT` yazmak bir NO-OP'tur: eksik olani vermez, FAZLA olani ALMAZ.
--
-- ⚠️ Sonucu su olurdu: MT §12.4'un yazili kurali ("UPDATE/DELETE yetkisi
-- HICBIR ROLE verilmez") uygulanmis GORUNUR ama GERCEKTE saglanmazdi ve hata
-- SESSIZ olurdu — hicbir test kirmizi yanmaz, hicbir lint uyarmaz, dokuman
-- dogru okunur. Kusur ancak yetkiyi DOGRUDAN sorgulayan bir test yazildigi
-- icin gorundu (`audit-log.integration.spec.ts`, "KATMAN 1").
--
-- ⚠️ Katman 2 (trigger) bu durumda da yazmayi engellerdi — ama savunmanin bir
-- katmani sessizce yok olmus olurdu ve "iki katman" iddiasi YANLIS olurdu.
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT  SELECT, INSERT ON platform.audit_log TO businessos_app;
    REVOKE UPDATE, DELETE ON platform.audit_log FROM businessos_app;
  END IF;
END
$$;
--> statement-breakpoint

-- ===========================================================================
-- ⚠️ DEGISMEZLIK — KATMAN 2: TRIGGER (yetkinin YETMEDIGI yer)
-- ===========================================================================
-- Katman 1 yalnizca `businessos_app`i baglar. `businessos_owner` tablonun
-- SAHIBIDIR ve sahibin `UPDATE`/`DELETE` yetkisi GRANT ile verilmez, sahiplikle
-- gelir — yani migration'lar ve elle acilan bir psql oturumu katman 1'i
-- tumuyle asar.
--
-- Bu, ADR-0041 §2'nin trigger kararinin AYNI SINIFIDIR: orada da uygulama
-- katmanindaki kontrol yetmiyordu (kalemler ayri tablodaydi) ve ucuncu bir
-- katman VERITABANINA konmustu.
--
-- ⚠️ `TRUNCATE` BU TRIGGER'A TAKILMAZ (satir seviyesi trigger degildir) ve bu
-- BILINCLIDIR: test kurulumlari `TRUNCATE` kullanir. Uretimde `TRUNCATE`
-- yetkisi zaten `businessos_app`te yoktur.
-- ===========================================================================
CREATE FUNCTION platform.audit_log_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'platform.audit_log degismezdir: % islemi reddedildi (ADR-0043 §6.4, MT §12.4).',
    TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON platform.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION platform.audit_log_append_only();
