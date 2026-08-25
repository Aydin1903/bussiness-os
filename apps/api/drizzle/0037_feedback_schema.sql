-- ===========================================================================
-- feedback semasi — Faz 5'in ONUNCU is modulu (ADR-0045 §1)
-- ===========================================================================
--
-- `platform` disindaki ONBIRINCI sema (`knowledge`, `crm`, `projects`,
-- `finance`, `appointments`, `documents`, `inventory`, `suppliers`,
-- `invoicing`, `hr`, `feedback`). Mutlak Kural 5: her modul kendi semasina
-- sahiptir ve cross-schema FK yasaktir (tek istisna `platform.tenants`).
--
-- ROADMAP §3.5'in onuncu sirasi: _"Yanit toplama"_.
--
-- ===========================================================================
-- ⚠️ TEK TABLO — VE BU, MODULUN EN UCUZ TARAFI DEGIL EN PAHALI KARARIDIR
-- ===========================================================================
-- Bir geri bildirim UC seyden olusur: bir PUAN, opsiyonel bir YORUM ve
-- opsiyonel bir MUSTERI. Ucu de tek satirda yasar; ne chunk tablosu (§2) ne
-- anket tanimi tablosu (ADR-0045 §10) acilir.
--
-- ⚠️ "Anket" v1'de BIR VARLIK DEGILDIR. `feedback.surveys` ve
-- `responses.survey_id` v2'nin dogal buyume yoludur; bugun acmak SARKAN BIR
-- KOLON uretirdi — her satirda `NULL` tasiyan, hicbir sey dogrulamayan bir
-- isaretci.

CREATE SCHEMA IF NOT EXISTS feedback;
--> statement-breakpoint

-- Uygulama rolu semayi gorur ama icinde nesne OLUSTURAMAZ (02-schemas.sql
-- deseni; on onceki sema ile birebir ayni).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT USAGE ON SCHEMA feedback TO businessos_app;
  END IF;
END
$$;
--> statement-breakpoint

-- ===========================================================================
-- feedback.responses — GERI BILDIRIM KAYDI
-- ===========================================================================
-- ⚠️ BU TABLODA `updated_at` YOKTUR (ADR-0045 §1.1) ve bu bir unutma DEGILDIR:
-- kayit GUNCELLENMEZ (§2). Guncellenmeyen bir satirin guncellenme zamani da
-- olmaz; kolonu koymak, ileride birinin "demek ki guncellenebiliyor" diye
-- okuyacagi SESSIZ BIR DAVET olurdu (`suppliers.interactions`in ayni karari).
--
-- ===========================================================================
-- ⚠️ DEGISTIRILEMEZ AMA SILINEBILIR — PROJEDE UCUNCU BIR SEKIL (ADR-0045 §2)
-- ===========================================================================
-- Bugune kadar iki sekil vardi:
--
--   `finance.transactions`    -> guncellenir DE silinir DE (yanlis tutar
--                                duzeltilebilmeli)
--   `inventory.movements`     -> NE guncellenir NE silinir (bugunku miktar
--                                ondan TURETILIR; koruma uc katmanli)
--   `suppliers.interactions`  -> guncellenmez, silinmez (bir gorusme olduktan
--                                sonra "degismis" olmaz)
--
-- Burasi UCUNCUSU: GUNCELLENMEZ ama SILINIR. Iki yarisi ayri gerekcelere
-- dayanir ve celiskili DEGILDIR — biri ICERIGI korur, digeri KISIYI:
--
--   GUNCELLEME YOK -> kayit BIZIM SOZUMUZ DEGIL, bir UCUNCU KISININ
--     beyanidir; calisan onu yalnizca AKTARIR. Musterinin soyledigini
--     degistirmek kurumsal hafizaya bir YALAN yazmaktir. Ustelik ortalama ve
--     "dusuk puan sayisi" bu satirlardan TURETILIR — gecmisi degistirmek
--     bugunku tabloyu SESSIZCE yeniden yazardi (ADR-0039'un olcutu).
--
--   SILME VAR -> ⚠️ VE GEREKCESI KOLAYLIK DEGIL, KVKK'DIR. Bir yorum kisisel
--     veri ICEREBILIR (ad, telefon, sikayet detayi) ve veri sahibinin silme
--     talebi hakki vardir (KVKK m.7 / m.11). Silme yolu olmayan bir tablo o
--     talebi KARSILAYAMAZ — ve bunu Faz 6'nin KVKK kontrol noktasinda
--     kesfetmek, tabloyu O GUN degistirmek demekti.
--
-- ⚠️ Silme GERCEK bir `DELETE`tir, "soft-delete" DEGIL: `deleted_at` isaretli
-- bir satir, silinmesi ISTENEN veriyi tabloda TUTMAYA devam ederdi — yani
-- yukumlulugu karsiliyor GORUNUP karsilamazdi.
CREATE TABLE feedback.responses (
  id                 uuid          PRIMARY KEY,
  tenant_id          uuid          NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- =========================================================================
  -- PUAN — OLCEK SABIT 1..5 (ADR-0045 §1.3)
  -- =========================================================================
  -- ⚠️ `scale` KOLONU YOKTUR ve bu bilincli: NPS bir sayi degil bir
  -- METODOLOJIDIR (0..10 olcek + promoter/detractor formulu). Ayni tabloya
  -- karistirilsaydi `rating`in ANLAMI satirdan satira degisir ve ortalama
  -- SESSIZCE YANLIS olurdu.
  --
  -- ⚠️ OLCEGIN SABIT OLMASININ DOGRUDAN KAZANCI: ortalama ANLAMLIDIR. ADR-0034
  -- (para birimi) ve ADR-0039 (birim) "farkli birimler TOPLANMAZ" demisti;
  -- burada butun puanlar ayni olcektedir, yani Stok'un _"toplam stok diye bir
  -- rakam yoktur"_ kisiti bu modulde ILK KEZ GECERLI DEGILDIR.
  rating             smallint      NOT NULL,

  -- =========================================================================
  -- ANLAMSAL YUZEY — OPSIYONEL, VEKTORU AYNI SATIRDA (ADR-0045 §1.2, §1.4)
  -- =========================================================================
  -- ⚠️ Ust sinir DOMAINDE zorlanir (`MAX_FEEDBACK_COMMENT_CHARS` =
  -- `TARGET_CHUNK_CHARS`); asilirsa 422 doner ve SESSIZ KIRPMA YASAKTIR.
  --
  -- ⚠️ OPSIYONEL OLMASININ BEDELI ACIKCA KAYITLIDIR (§3.5): yorumsuz bir
  -- kaydin embed edilecek metni YOKTUR, yani `POST /ask` havuzunda HICBIR SESI
  -- OLMAZ. Zorunlu kilmak bedeli kaldirmaz, YERINI DEGISTIRIRDI: kullanici
  -- `"-"` yazar ve havuza ANLAMSIZ VEKTORLER girerdi (ADR-0033'un "sahte Genel
  -- projesi" dersi).
  comment            text,

  -- =========================================================================
  -- KANAL — SERBEST METIN (ADR-0045 §1.5)
  -- =========================================================================
  -- Olcut projede DORDUNCU kez ayni: KOLON BIR KISIT TASIYOR MU?
  --
  --   `appointments.status`     -> kodda enum     (dort hal her sektorde ayni)
  --   `finance.categories`      -> tenant tablosu (yon BILESIK FK ile zorlanir)
  --   `inventory.items.unit`    -> serbest metin  (hicbir sey zorlamiyor)
  --   `feedback.channel`        -> SERBEST METIN  (hicbir sey zorlamiyor)
  --
  -- Kanal listesi tenant'a gore degisir (Google, Trendyol, telefon, kagit
  -- form); bir enum ILK MUSTERIDE yanlis olurdu ve tenant-tanimli bir sozluk
  -- BIR KOLONLUK ETIKET icin ikinci bir CRUD yuzeyi demekti.
  --
  -- ⚠️ Kabul edilen bedel: `"google"` ve `"Google"` IKI AYRI DEGER olur
  -- (`inventory.items.unit`in `kg`/`Kg` varyanti, ikinci kez) ve KANALA GORE
  -- GRUPLAMA GUVENILMEZDIR. Kanal v1'de bir ETIKETTIR, bir BOYUT degil.
  channel            text,

  -- =========================================================================
  -- ⚠️ CROSS-MODUL ISARETCI — FK YOK, NULL YAYGIN (ADR-0045 §6)
  -- =========================================================================
  -- `crm.contacts`a isaret eder ama FK TASIMAZ: cross-schema FK yasaktir
  -- (Mutlak Kural 5). Ad DENORMALIZE EDILMEZ, her okumada `crm.public.ts`in
  -- `ContactDirectory`sinden cozulur ve okuma `contact:read` iznine BAGLIDIR.
  --
  -- ⚠️ NULLABLE VE `NULL` YAYGIN DURUMDUR: gercek geri bildirimlerin cogu
  -- ANONIMDIR (Google yorumu, QR kod, kagit form). Zorunlu olsaydi kullanici
  -- SAHTE CRM KISILERI acardi — ve bedeli bu modulde kalmazdi: CRM'in MUSTERI
  -- LISTESI kirlenirdi. ⚠️ Yani zorunluluk, BASKA BIR MODULUN hafizasini
  -- zehirlerdi (ADR-0033 §2 ve ADR-0043 §2'nin ayni dersi, ucuncu kez).
  --
  -- ⚠️ SARKAN ISARETCI TOLERE EDILIR (projede DORDUNCU): CRM hala domain event
  -- yayinlamiyor, silinen bir kisinin id'si burada kalir ve okuyan her yol buna
  -- DAYANIKLI yazilir (ad cozulemezse GOSTERILMEZ, uydurulmaz).
  crm_contact_id     uuid,

  -- Geri bildirimin ALINDIGI an. ⚠️ `timestamptz` (`date` DEGIL): bir geri
  -- bildirim bir ANDA gelir ve ayni gun icinde sirasi anlamlidir.
  -- Ofsetsiz bir zaman dizesi 422 ile reddedilir (ADR-0035'in dogrulama dersi).
  received_at        timestamptz   NOT NULL,

  -- ⚠️ NULLABLE ve bu bir ARIZA DEGIL, iki asamali yazma akisinin (T1 kayit /
  -- T2 vektor) dogal ara halidir: embedding cokerse GERI BILDIRIM KAYBOLMAZ,
  -- yalnizca aranamaz kalir. `POST /feedback/reindex` onarir.
  --
  -- ⚠️ YORUMSUZ KAYITTA KALICI OLARAK `NULL`DUR ve bu da bir ariza degildir —
  -- gomulecek metin yoktur (§1.4).
  embedding          vector(1536),

  -- ⚠️ Yalnizca KAYDI GIRENI tutar; bir denetim izi DEGILDIR (ADR-0041 §8'in
  -- satir ici aktor damgasi). Burada borc KENDILIGINDEN KAPANIR: satir
  -- guncellenmedigi icin "bu puani kim degistirdi" diye BIR SORU YOKTUR.
  -- Cross-schema FK yasak: `platform.users` baska bir modulun tablosudur.
  created_by_user_id uuid          NOT NULL,

  created_at         timestamptz   NOT NULL DEFAULT now(),

  -- ⚠️ OLCEK VERITABANINDA ZORLANIR — yalnizca Zod'da degil. Zod HTTP'den
  -- gelen istegi baglar; bu kisit HTTP'yi ATLAYAN her yolu baglar.
  CONSTRAINT feedback_responses_rating_range CHECK (rating BETWEEN 1 AND 5),

  -- "Girilmedi" ile "bos girildi" AYNI seydir; ikisi de `NULL`dur.
  CONSTRAINT feedback_responses_comment_not_blank
    CHECK (comment IS NULL OR btrim(comment) <> ''),
  CONSTRAINT feedback_responses_channel_not_blank
    CHECK (channel IS NULL OR btrim(channel) <> '')
);
--> statement-breakpoint

-- ===========================================================================
-- INDEX'LER
-- ===========================================================================
-- MT §12.3: bilesik index'te `tenant_id` DAIMA ilk kolon.

-- Liste bir GECMIS AKISIDIR ("en son ne geldi") — `finance.transactions` ve
-- `suppliers.interactions` ile ayni sinif, `appointments`in takvim `asc`i
-- DEGIL. Duvarin "son 30 gun" penceresi de bu index uzerinden calisir.
CREATE INDEX feedback_responses_tenant_received_idx
  ON feedback.responses (tenant_id, received_at DESC);
--> statement-breakpoint

-- Puan bandi filtresi ("dusuk puanlar") ve duvarin `<= 2` sayaci.
CREATE INDEX feedback_responses_tenant_rating_received_idx
  ON feedback.responses (tenant_id, rating, received_at DESC);
--> statement-breakpoint

-- HNSW, IVFFlat DEGIL (ADR-0029 §1). Operator `vector_cosine_ops` — sorgudaki
-- `<=>` ile eslesmezse index DEVRE DISI kalir ve sorgu TAM TARAMA yapar;
-- sessiz bir performans coku.
CREATE INDEX feedback_responses_embedding_idx
  ON feedback.responses USING hnsw (embedding vector_cosine_ops);
--> statement-breakpoint

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2). SAPMA YOK, ONUNCU KEZ.
--
-- `current_setting`'de `missing_ok` KULLANILMAZ: context kurulmamissa sorgu
-- SESSIZCE BOS DONMEZ, HATA VERIR (MT §12.6 madde 4).
-- ===========================================================================
ALTER TABLE feedback.responses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE feedback.responses FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON feedback.responses
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

-- ===========================================================================
-- ⚠️ YETKI — DEGISTIRILEMEZLIGIN UCUNCU KATMANI, ILK GUNDEN (ADR-0045 §2.3)
-- ===========================================================================
-- Koruma UC katmanlidir ve ucu de AYNI SEYI soyler:
--
--   1. `feedback:write` DIYE BIR IZIN YOKTUR (katalogda `create` + `delete`)
--   2. Entity'de `update` metodu, repository'de `update` YOKTUR
--   3. ⚠️ VERITABANI: `UPDATE` yalnizca `embedding` KOLONUNDA
--
-- ⚠️ UCUNCU KATMAN, ADR-0043 Slice 1c'nin KOLON BAZLI deseninin ILK GUNDEN
-- uygulanmasidir. `0034` bunu `suppliers.interactions`a SONRADAN eklerken bir
-- TUZAK yakalamisti: duz bir `REVOKE UPDATE`, vektor yazan yolu (olusturma
-- sonrasi `setEmbedding` + `reindex`) SESSIZCE KIRARDI. Burada ayni yol var
-- (`setResponseEmbedding` + `POST /feedback/reindex`), yani tuzak ONCEDEN
-- COZULMUS olarak geliyor:
--
--     GRANT UPDATE (embedding)  -> vektor yazimi CALISIR
--     UPDATE ... SET rating     -> permission denied
--     UPDATE ... SET embedding, comment (birlikte) -> permission denied
--
-- ⚠️ TEK MESRU MUTASYON TURETILMIS VEKTORDUR; icerik kolonlari disaridadir.
--
-- ⚠️ `DELETE` VERILIYOR ve bu bir unutma DEGIL, §2'nin KARARIDIR (KVKK).
-- `inventory.movements` (`0033`) ve `suppliers.interactions` (`0034`) `DELETE`
-- yetkisini KAYBETMISTI; burada BILEREK duruyor.
--
-- ⚠️ `REVOKE` GEREKMEZ ve bu OLCULDU, varsayilmadi (ADR-0043'un `0035`te
-- kaydettigi ayni olcum): `ALTER DEFAULT PRIVILEGES` YALNIZCA `platform`
-- semasi icin tanimlidir. Yeni bir semada verilen yetki, tam olarak YAZILAN
-- yetkidir. `0033`/`0034`te `REVOKE` sart olmasinin sebebi, o tablolarin
-- yetkilerini ONCEDEN ALMIS olmalariydi.
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, DELETE ON feedback.responses TO businessos_app;
    GRANT UPDATE (embedding)     ON feedback.responses TO businessos_app;
  END IF;
END
$$;
