-- ===========================================================================
-- loyalty semasi — Faz 5'in ONIKINCI ve SON is modulu (ADR-0051 §1)
-- ===========================================================================
--
-- `platform` disindaki ONUCUNCU sema (`knowledge`, `crm`, `projects`,
-- `finance`, `appointments`, `documents`, `inventory`, `suppliers`,
-- `invoicing`, `hr`, `feedback`, `marketing`, `loyalty`). Mutlak Kural 5: her
-- modul kendi semasina sahiptir ve cross-schema FK yasaktir (tek istisna
-- `platform.tenants`).
--
-- ROADMAP §3.5'in onikinci sirasi. ⚠️ Kapsam notu "Puan · kademe" diyordu;
-- KADEME v2'ye birakildi (ADR-0051 §10.1) — bir kademe sistemi bir KURAL
-- MOTORUDUR ve ayricaliklari ODUL KATALOGUNU gerektirir; ayricaliksiz bir
-- kademe bir ETIKETTIR. Kademe TURETILEBILIR oldugu icin ertelemek hicbir
-- veri kaybettirmez.
--
-- ===========================================================================
-- ⚠️ BU MIGRATION'IN EN ONEMLI OZELLIGI — YINE BIR KOLONUN YOKLUGU
-- ===========================================================================
-- `loyalty.accounts`ta `balance` DIYE BIR KOLON YOKTUR (ADR-0051 §4.1).
-- Bakiye HER OKUMADA `point_entries`ten turetilir:
--
--     COALESCE(SUM(CASE WHEN direction = 'earn' THEN points ELSE -points END), 0)
--
-- Projede ON DORDUNCU kez verilen ayni karar (`quantity_on_hand`in reddi,
-- `finance.balances`in reddi, `last_activity_at`in reddi, `ends_at`in reddi,
-- `embedding_stale_at`in reddi ...). Karari veren sey yine HATANIN SEKLIDIR:
-- bir kolon tutulsaydi, onu guncellemeyi unutan bir yol SESSIZ ve MAKUL
-- GORUNEN yanlis bir bakiye uretirdi — musteri odul alamaz ve kimse nedenini
-- bilmezdi. Turetmede en kotu bozulma YAVASLIKTIR ve yavaslik kendini soyler.
--
-- ===========================================================================
-- ⚠️ VE BURADA BIR SINIR VAR — GIZLENMIYOR (ADR-0051 §4.4)
-- ===========================================================================
-- "Bakiye negatife dusemez" bir SATIRLAR ARASI kosuldur; bir `CHECK` onu
-- GOREMEZ (CHECK tek bir satiri gorur). Bir FK/`RESTRICT` de ilgisizdir.
--
-- ⚠️ Yani bu degismezin VERITABANI GARANTISI YOKTUR. Tek dayanak
-- UYGULAMADADIR: harcama yazan TEK bir kod yolu ve o yolun aldigi
-- `SELECT ... FOR UPDATE` satir kilidi (ADR-0051 §4.3).
--
-- ⚠️ `balance` kolonu + `CHECK (balance >= 0)` degerlendirildi ve
-- REDDEDILDI — takas acikca yazili: kolon veritabani garantisi verirdi ama
-- defterden KAYABILIRDI ve o hata SESSIZ olurdu; kilidin atlanmasi ise
-- GORUNURDUR (negatif bir bakiye ekranda durur).
--
-- ⚠️ Bir trigger da reddedildi: her `INSERT`te tam bir `SUM` kosardi ve
-- kilidi VERITABANINA GIZLERDI. (ADR-0041'in `assert_document_editable`
-- trigger'i bundan farklidir: o SABIT BIR KOLONU okur, bir toplam degil.)

CREATE SCHEMA IF NOT EXISTS loyalty;
--> statement-breakpoint

-- Uygulama rolu semayi gorur ama icinde nesne OLUSTURAMAZ (02-schemas.sql
-- deseni; on iki onceki sema ile birebir ayni).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT USAGE ON SCHEMA loyalty TO businessos_app;
  END IF;
END
$$;
--> statement-breakpoint

-- ===========================================================================
-- loyalty.accounts — BIR MUSTERININ PROGRAMDAKI KAYDI
-- ===========================================================================
-- ⚠️ GUNCELLENEBILIR HICBIR ALANI YOKTUR (ADR-0051 §2.2) — bu yuzden
-- `updated_at` kolonu da YOKTUR ve `PATCH` ucu de yoktur. `feedback.responses`
-- ile ayni gerekce: guncellenmeyen bir satirin guncellenme zamani da olmaz;
-- kolonu koymak OLMAYAN BIR YOLUN VAR OLDUGUNU ima ederdi.
--
-- ⚠️ `crm_contact_id` DEGISTIRILEMEZ ve gerekcesi serttir: onu degistirmek
-- BIR BAKIYEYI BASKA BIR INSANA DEVRETMEKTIR. Yanlis kisiye acilmis bir
-- hesabin dogru cozumu SILIP YENIDEN ACMAKTIR — gorunur, iz birakan ve niyeti
-- belli bir islem.

CREATE TABLE loyalty.accounts (
  id                  uuid          PRIMARY KEY,
  tenant_id           uuid          NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- =========================================================================
  -- ⚠️ CROSS-MODUL ISARETCI — VE PROJEDE ILK KEZ **ZORUNLU** (ADR-0051 §6.1)
  -- =========================================================================
  -- Bugune kadarki BES isaretcinin BESI DE nullable'di (`projects.company_id`,
  -- `appointments.crm_contact_id`, `hr.platform_user_id`,
  -- `feedback.crm_contact_id`, `marketing.crm_company_id`) ve gerekce hep
  -- ayniydi: "zorunlu olsaydi kullanici SAHTE KAYIT acardi".
  --
  -- ⚠️ BURADA O DERS TERS ISLIYOR. Bir isletme puan verdigi kisiyi ZATEN
  -- TANIMAK ZORUNDADIR (adiyla, telefonuyla) — yoksa musteri geri geldiginde
  -- puanini BULAMAZ. Yani zorunluluk uydurma veri uretmez, tam tersine GERCEK
  -- MUSTERI KAYDI uretir ve CRM'i zenginlestirir.
  --
  -- ⚠️ Alternatif (hesaba kendi `customer_name` kolonunu koymak) reddedildi:
  -- musteri kimliginin IKINCI BIR DOGRULUK KAYNAGINI acardi. ADR-0041'in
  -- `customer_name` istisnasi burada GECERLI DEGILDIR — o alan GONDERILMIS,
  -- DONDURULMUS bir belgedeydi; bir sadakat hesabi YASAYAN BIR ILISKIDIR.
  --
  -- ⚠️ FK YINE YOKTUR (Mutlak Kural 5). Dolayisiyla:
  --     `NOT NULL` "bir id VAR" garantisidir, "o musteri VAR" garantisi
  --     DEGILDIR. Ikisi karistirilirsa, kisita bakan biri referansin SAGLAM
  --     oldugunu sanir — saglam degildir, yalnizca DOLUDUR.
  crm_contact_id      uuid          NOT NULL,

  -- Satir ici aktor damgasi (ADR-0041 §8 deseni).
  created_by_user_id  uuid          NOT NULL,

  created_at          timestamptz   NOT NULL DEFAULT now(),

  -- =========================================================================
  -- ⚠️ TEKILLIK — VE BU, ADR-0047'NIN TAM TERSI BIR KARARDIR
  -- =========================================================================
  -- Kampanya'da `UNIQUE (tenant_id, name)` REDDEDILMISTI cunku "Instagram
  -- kampanyasi" her ay tekrarlanabilir ve ikisi de GERCEKTIR.
  --
  -- ⚠️ Burada ayni musteriye ikinci bir hesap GERCEK BIR OLGU DEGILDIR:
  -- bakiyeyi IKIYE BOLER ve hata SESSIZDIR — ekran calisir, iki satir yan yana
  -- durur, musteri puanlarinin yarisini goremez. ADR-0039'un `ABC-1`/`abc-1`
  -- SKU tuzaginin birebir ayni sekli; orada stok, burada bakiye bolunurdu.
  --
  -- ⚠️ Sonucu: bu modulde **409 VARDIR** (Kampanya ve Geri Bildirim'de yoktu).
  CONSTRAINT accounts_tenant_contact_unique UNIQUE (tenant_id, crm_contact_id),

  -- =========================================================================
  -- ⚠️ GEREKSIZ GORUNUR AMA ASAGIDAKI BILESIK FK'NIN ON KOSULUDUR
  -- =========================================================================
  -- `id` zaten birincil anahtardir, yani bu kisit tek basina hicbir yeni
  -- garanti getirmez. ⚠️ Silinirse `point_entries`in bilesik FK'si
  -- "there is no unique constraint matching given keys" ile PATLAR —
  -- ADR-0034'un `categories_id_direction_unique` kisitiyla BIREBIR AYNI
  -- durum ve orada da bir test onun VARLIGINI koruyor.
  CONSTRAINT accounts_tenant_id_unique UNIQUE (tenant_id, id)
);
--> statement-breakpoint

-- ===========================================================================
-- loyalty.point_entries — DEGISTIRILEMEZ DEFTER
-- ===========================================================================
-- ⚠️ Bakiye BU TABLODAN turetilir (yukari bakiniz).

CREATE TABLE loyalty.point_entries (
  id                  uuid          PRIMARY KEY,
  tenant_id           uuid          NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- =========================================================================
  -- ⚠️ `ON DELETE CASCADE` — VE BU, ADR-0039'UN `RESTRICT`INDEN BILINCLI SAPMA
  -- =========================================================================
  -- `inventory.movements -> items` `RESTRICT` tasir: hareketi olan bir kalem
  -- silinemez. Burada `CASCADE`, cunku iki soru FARKLI cevap veriyor
  -- (ADR-0051 §2.1):
  --
  --   Tek bir SATIRI silmek       -> bakiyeyi SESSIZCE YENIDEN YAZAR (yalan)
  --   ⚠️ HESABIN TAMAMINI silmek  -> bakiyeyi yeniden yazmaz, YOK EDER
  --
  -- ⚠️ Ve silme yolunun VAR OLMASI bir kolaylik degil bir YUKUMLULUKTUR:
  -- hesap BIR KISIYE baglidir ve silme hakki KVKK m.7/m.11'dir (ADR-0045'in
  -- ayni gerekcesi). `RESTRICT` secilseydi hareketi olan HER hesap silinemez
  -- olurdu — silinemeyen bir kisisel veri kaydi bir UYUM IHLALIDIR.
  --
  -- ⚠️ Bu FK AYNI SEMA icindedir, yani Mutlak Kural 5 ihlali YOKTUR.
  -- ⚠️ FK ASAGIDA, BILESIK OLARAK tanimlanir (`tenant_id, account_id`) — burada
  -- TEK BASINA bir `REFERENCES` YOKTUR. Gerekce OLCULDU, tahmin edilmedi (§).
  account_id          uuid          NOT NULL,

  -- =========================================================================
  -- ⚠️ ARITMETIK EKSEN — ISARETLI PUAN DEGIL (ADR-0051 §1.4)
  -- =========================================================================
  -- ADR-0034 §5 (gelir/gider) ve ADR-0039 §3 (giris/cikis) kararlarinin
  -- UCUNCU kez uygulanmasi. Isaretli bir miktar secilseydi, isaret koymayi
  -- unutan TEK bir yazma yolu bir harcamayi kazanc gibi toplardi ve hata
  -- SESSIZ ve MAKUL GORUNEN yanlis bir sayi uretirdi.
  --
  -- ⚠️ `is_correction` KOLONU YOKTUR — ADR-0039'dan bilincli sapma. Stok'ta o
  -- bayrak vardi cunku duzeltme satirlarini SISTEM uretiyordu (`recordCount`)
  -- ve sistem onlari ayirt edebiliyordu. Burada her satiri bir insan ACIK BIR
  -- YONLE yaziyor; bir `spend`in duzeltme mi odul mu oldugu ancak
  -- KULLANICININ KENDI HATASI HAKKINDAKI BEYANINA dayanirdi.
  -- ⚠️ Duzeltme TERS YONDE BIR SATIRDIR — ADR-0041'in "iskonto ALANI yok"
  -- karariyla ayni sekil. Durust bedeli yazili: "bu bir duzeltmeydi" bilgisi
  -- yalnizca `note`ta yasar ve SORGULANAMAZ.
  direction           text          NOT NULL,

  -- =========================================================================
  -- ⚠️ `integer` — `numeric` DEGIL (ADR-0051 §1.5)
  -- =========================================================================
  -- Stok `numeric(14,3)` kullanir cunku 3,5 kg GERCEKTIR. 3,5 PUAN DEGILDIR:
  -- puan SAYILIR, olculmez. Kesirli bir puan ilk kazandirma kuralinda
  -- (`her 10 TL = 1 puan`) bir YUVARLAMA sorusu acardi ve o soru v2'nindir.
  --
  -- ⚠️ UST SINIR YOKTUR ve bu bir karardir: `points <= 1000000` gibi bir kisit
  -- ICAT EDILMIS BIR SAYIDIR (ADR-0047 §1.3'un "yeni bir sayi icat edilmez"
  -- kurali). Bir tipo (50 yerine 50000) bakiyeyi sisirir — ama hata
  -- GORUNURDUR: bakiye ekranda ziplar ve telafi bir ters satirdir.
  points              integer       NOT NULL,

  -- ⚠️ BIR ETIKET, anlatisal metin DEGIL (ADR-0051 §3.1) — ve tam olarak bu
  -- yuzden EMBED EDILMEZ. Yuzlerce kayitta tekrar eden "Alisveris puani",
  -- ADR-0034 §6.1'in `Ocak kirasi / Subat kirasi` havuz kirlenmesinin birebir
  -- ayni seklidir (DORDUNCU kez). Ust sinir uygulamada 160 karakterdir.
  note                text,

  -- =========================================================================
  -- ⚠️ GELECEGE YAZILAMAZ — ve sebebi BIR SORUYU ORTADAN KALDIRMAKTIR (§1.6)
  -- =========================================================================
  -- Bakiye, tarihten BAGIMSIZ olarak butun satirlarin toplamidir. Gelecege
  -- tarihli bir `earn` yazilabilseydi, BUGUN HENUZ KAZANILMAMIS bir puan
  -- bugunun bakiyesinde gorunurdu ve "hangi bakiye dogru" sorusu IKI FARKLI
  -- cevaba sahip olurdu.
  --
  -- ⚠️ Kontrol UYGULAMADADIR (`FutureEntryDateError` -> 422), veritabaninda
  -- DEGIL: `CHECK (occurred_at <= now())` YAZILAMAZ cunku `now()` STABIL
  -- DEGILDIR ve bir CHECK kisitinda kullanilmasi PostgreSQL tarafindan
  -- reddedilir (kisitlar IMMUTABLE ifade ister). ⚠️ Yani bu, bilincli olarak
  -- uygulama katmaninda kalan IKINCI kuraldir (birincisi bakiye, yukarida).
  occurred_at         timestamptz   NOT NULL DEFAULT now(),

  -- =========================================================================
  -- ⚠️ BU DAMGA, PROJEDE ILK KEZ BIR DENETIM IZINDEN ZAYIF DEGIL (§2.4)
  -- =========================================================================
  -- ADR-0041 ve ADR-0047 satir ici damgayi kullanirken acikca yaziyordu:
  -- "bu bir denetim izi DEGILDIR; son durumu soyler, ne oldugunu SIRASIYLA
  -- anlatmaz." ⚠️ Ekleme-yalniz bir defterde DAMGANIN KENDISI SIRADIR — hicbir
  -- satir degismedigi icin "kim degistirdi" diye bir soru da yoktur.
  --
  -- ⚠️ Bu yuzden `platform/audit` bu modulde KULLANILMIYOR (ADR-0051 §2.4).
  -- ⚠️ Acikta kalan TEK durum: HESAP SILINIRSE defter de gider ve "kim sildi"
  -- sorulamaz — `platform.audit_log` bugun ALAN ADI saklar, bir SILME OLAYI
  -- degil; yani bu bosluk bir satir eklemekle degil aracin SEKLINI
  -- degistirmekle kapanir. Faz 6 KVKK denetiminin girdisidir.
  created_by_user_id  uuid          NOT NULL,

  created_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT point_entries_direction_valid
    CHECK (direction IN ('earn', 'spend')),

  CONSTRAINT point_entries_points_positive
    CHECK (points > 0),

  CONSTRAINT point_entries_note_not_blank
    CHECK (note IS NULL OR btrim(note) <> ''),

  -- =========================================================================
  -- ⚠️ BILESIK FK — VE BU, BIR OLCUMDEN DOGDU (Slice 1 entegrasyon testi)
  -- =========================================================================
  -- Ilk tasarim duz bir `REFERENCES loyalty.accounts (id)` idi. ⚠️ Slice 1'in
  -- entegrasyon testi bunun BIR TENANT SINIRI IHLALINE izin verdigini
  -- GOSTERDI: tenant A, tenant B'nin hesabina isaret eden bir defter satiri
  -- YAZABILIYORDU.
  --
  -- ⚠️ SEBEP: PostgreSQL'de referans butunlugu denetimi RLS'i ATLAR (RI
  -- sorgusu satir guvenligi DEVRE DISI kosar). Yani FK, cagiranin GOREMEDIGI
  -- bir satiri BULUR ve kabul eder. RLS'in `WITH CHECK`i yalnizca satirin
  -- KENDI `tenant_id`sini baglar — isaret ettigi satiri DEGIL.
  --
  -- ⚠️ Ayni tuzagin `ON DELETE CASCADE` tarafi ise LEHIMIZE calisiyor ve o da
  -- ayni testte kanitlandi: `businessos_app` rolune `DELETE` verilmemis olsa
  -- bile hesap silindiginde defter satirlari GERCEKTEN gidiyor.
  --
  -- Cozum ADR-0034'un `finance.transactions` deseninin AYNISIDIR: yon bilgisi
  -- yerine TENANT bilgisi bilesigin parcasi olur. `tenant_id` RLS tarafindan
  -- cagiranin tenant'ina ZORLANDIGI icin, baska bir tenant'in hesabina isaret
  -- eden bir satir artik VERITABANI SEVIYESINDE IMKANSIZDIR.
  --
  -- ⚠️ Uygulama katmani zaten guvenliydi (`lockAccountById` RLS'e tabidir ve
  -- gorunmeyen hesap icin 404 doner) — bu, o korumayi VERITABANINA indiren
  -- IKINCI katmandir.
  CONSTRAINT point_entries_tenant_account_fkey
    FOREIGN KEY (tenant_id, account_id)
    REFERENCES loyalty.accounts (tenant_id, id)
    ON DELETE CASCADE
);
--> statement-breakpoint

-- Liste ekraninin erisim yolu: en yeni hesap once.
CREATE INDEX accounts_tenant_created_idx
  ON loyalty.accounts (tenant_id, created_at DESC);
--> statement-breakpoint

-- ⚠️ BAKIYE SORGUSUNUN TASIYICISI. Turetme karari (`balance` kolonu yok) bu
-- indekse dayanir: hesap basina toplam, bu indeks uzerinden okunur.
CREATE INDEX point_entries_tenant_account_idx
  ON loyalty.point_entries (tenant_id, account_id);
--> statement-breakpoint

-- Duvarin "son 30 gun" uydulari (kazandirilan / kullanilan).
CREATE INDEX point_entries_tenant_occurred_idx
  ON loyalty.point_entries (tenant_id, occurred_at DESC);
--> statement-breakpoint

ALTER TABLE loyalty.accounts      ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE loyalty.accounts      FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE loyalty.point_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE loyalty.point_entries FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON loyalty.accounts
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

CREATE POLICY tenant_isolation ON loyalty.point_entries
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

-- ===========================================================================
-- ⚠️ YETKI — FIIL LISTESI BU MODULUN KARARINI YANSITIR, KOPYALANMAZ
-- ===========================================================================
-- CLAUDE.md'nin migration kontrol listesinin DORDUNCU maddesi: `0000_init`in
-- `ALTER DEFAULT PRIVILEGES ... IN SCHEMA platform` satiri YALNIZCA `platform`
-- semasi icindir (ADR-0043 Slice 1b'nin bulgusu). Yeni bir semada verilen
-- yetki, TAM OLARAK YAZILAN YETKIDIR.
--
-- ⚠️ Unutulursa hata SESSIZDIR ve ADR-0047'nin uygulamasinda GERCEKTEN
-- YASANDI: `marketing.campaigns` icin GRANT yazilmamisti ve UC KATKICI BIRDEN
-- sessizce `degraded` dondu.
--
-- ⚠️ Fiil listesi bu modulde IKI YERDE de daraltilmistir ve ikisi de birer
-- KARARDIR:
--
--   loyalty.accounts      -> SELECT, INSERT, DELETE, ⚠️ **UPDATE**
--                            ⚠️ VE `UPDATE` BURADA BIR GUNCELLEME YETKISI
--                            DEGILDIR — bir KILIT ON KOSULUDUR (asagida).
--
--   loyalty.point_entries -> SELECT, INSERT           ⚠️ UPDATE ve DELETE YOK
--                            Degistirilemezligin UCUNCU KATMANI (§2.3).
--                            Ilk ikisi uygulamadadir (entity'de `update`
--                            metodu yok · `loyalty_point:delete` DIYE BIR IZIN
--                            YOK); bu satir korumayi VERITABANINA indirir.
--
-- ⚠️ VE BURADA ADR §2.3'UN ACIK BIRAKTIGI SORU VAR: `point_entries`e `DELETE`
-- verilmezse, hesap silindiginde `ON DELETE CASCADE` calisir mi?
--
-- Beklenen cevap EVET'tir: PostgreSQL'de referans butunlugu tetikleyicileri
-- BASVURULAN TABLONUN SAHIBININ yetkisiyle kosar, yani cagiranin `DELETE`
-- iznine bakilmaz; `FORCE RLS` politikasi ise yine uygulanir ve
-- `app.current_tenant_id` transaction icinde ZATEN SET EDILMISTIR.
--
-- ⚠️ AMA BU BIR IDDIADIR, BIR OLCUM DEGIL — ve bir entegrasyon testi
-- (`loyalty-schema.integration.spec.ts`) onu GERCEK BIR VERITABANINDA
-- kanitlar. Yanlis cikarsa cozum `GRANT DELETE` ile geniz gecmek DEGIL,
-- ADR §2.3'te yazili yoldur.
-- ===========================================================================
-- ⚠️⚠️ `accounts` UZERINDEKI `UPDATE` — OLCULMUS BIR ZORUNLULUK, BIR TERCIH DEGIL
-- ===========================================================================
-- ADR-0051 §2.2 ve §Slice 1'in yazili GRANT listesi `accounts` icin
-- "UPDATE YOK" diyordu. ⚠️ Slice 1'in entegrasyon testi bunun MODULU
-- CALISMAZ HALE GETIRDIGINI olctu: HER puan hareketi 500 donuyordu.
--
--     permission denied for table accounts
--     ... from "loyalty"."accounts" where id = $1 limit $2 FOR UPDATE
--
-- ⚠️ SEBEP: PostgreSQL'de `SELECT ... FOR UPDATE` bir SATIR KILIDIDIR ve
-- kilitlemek TANIM GEREGI "bu satiri degistirebilirim" demektir. Planlayici
-- kilitlenen tablo icin `ACL_SELECT_FOR_UPDATE` ister ve o, kaynak kodda
-- ACIKCA `ACL_UPDATE`e esittir. Yani ⚠️ **KILIT, `UPDATE` YETKISI OLMADAN
-- ALINAMAZ** — ve bu modulde kilit, bakiyenin negatife dusmemesinin TEK
-- dayanagidir (§4.4).
--
-- ⚠️ IKI SECENEK VARDI VE IKINCISI SECILDI:
--
--   (a) Advisory kilit (`pg_advisory_xact_lock`) — yetki istemez, ama kilit
--       SATIRA DEGIL bir HASH'e baglanir; `inventory`nin deseninden ayrisir ve
--       okuyanin ikinci bir mekanizmayi ogrenmesini gerektirir.
--   (b) ⚠️ `GRANT UPDATE` + ⚠️ **HER GUNCELLEMEYI REDDEDEN BIR TRIGGER**.
--
-- (b) secildi cunku ⚠️ KORUMAYI ZAYIFLATMAZ, GUCLENDIRIR: bir `GRANT`in
-- yoklugu yalnizca UYGULAMA ROLUNU baglar, bir trigger ise TABLO SAHIBINI DE
-- baglar (ADR-0043'un `audit_log_append_only` deseni, ikinci kez). Yani
-- `accounts` artik `businessos_owner` icin de degistirilemezdir.
--
-- ⚠️ Kayda geciyor cunku bu satiri okuyan biri `UPDATE`i gorup "demek ki hesap
-- guncellenebiliyor" diye okuyabilir. ⚠️ OKUNAMAZ: asagidaki trigger her
-- `UPDATE` denemesini reddeder ve bir entegrasyon testi ikisini birden
-- kilitler.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON loyalty.accounts      TO businessos_app;
    GRANT SELECT, INSERT                 ON loyalty.point_entries TO businessos_app;
  END IF;
END
$$;
--> statement-breakpoint

-- ===========================================================================
-- ⚠️ HESAP DEGISTIRILEMEZ — VE BU TRIGGER TABLO SAHIBINI DE BAGLAR
-- ===========================================================================
-- ADR-0051 §2.2: hesabin guncellenebilir hicbir alani yoktur. `crm_contact_id`
-- degistirilemez cunku onu degistirmek BIR BAKIYEYI BASKA BIR INSANA
-- DEVRETMEKTIR; yanlis kisiye acilmis bir hesabin dogru cozumu SILIP YENIDEN
-- ACMAKTIR.
--
-- ⚠️ `DELETE` KAPSAM DISIDIR ve bu, `audit_log_append_only`den AYRILDIGIMIZ
-- NOKTADIR: orada trigger `UPDATE OR DELETE` yakalar (denetim izi silinemez);
-- burada silme MESRUDUR ve bir YUKUMLULUKTUR (KVKK m.7/m.11, §2.1).
CREATE FUNCTION loyalty.accounts_no_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'loyalty.accounts guncellenemez: bir hesabin musterisini degistirmek bir BAKIYEYI BASKA BIR INSANA DEVRETMEKTIR (ADR-0051 §2.2). Dogru islem: hesabi SIL ve yeniden AC.'
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint

CREATE TRIGGER accounts_no_update
  BEFORE UPDATE ON loyalty.accounts
  FOR EACH ROW
  EXECUTE FUNCTION loyalty.accounts_no_update();
