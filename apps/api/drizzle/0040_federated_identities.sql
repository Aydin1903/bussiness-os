-- 0040_federated_identities — Sosyal giris (OAuth) kimlik baglantilari (ADR-0053)
--
-- DEVELOPMENT_RULES 6: migration'lar ELLE yazilir, review edilir, geri
-- alinabilir. RLS/CHECK/grant sema tanimindan uretilemez.
--
-- ===========================================================================
-- ⚠️ BU TABLONUN VAR OLMA SEBEBI: E-POSTA BIR KIMLIK ANAHTARI DEGILDIR
-- ===========================================================================
-- ADR-0053 §1'in karari tek cumleyle: kimligin capasi saglayicinin DEGISMEZ
-- `sub` degeridir, e-posta DEGIL. E-posta yalnizca BIR KEZ — baglama aninda,
-- adapter'in verdigi bir HUKUM altinda (§6) — kullanilir; ondan sonra bir daha
-- ASLA kimlik anahtari olmaz.
--
-- ⚠️ Gerekce teorik degil: **nOAuth** (2023). Saldirgan kendi Microsoft Entra
-- tenant'ini acar, `mail` alanina kurbanin adresini yazar (Entra bunu
-- DOGRULAMAZ) ve "Microsoft ile giris"e basar. E-postayi kimlik anahtari sayan
-- uygulamada sonuc TAM HESAP DEVRIDIR. Bu tablo, o anahtari `sub`a tasiyarak
-- saldiriyi YAPISAL OLARAK imkansiz kilar.
--
-- ===========================================================================
-- RLS DURUMU — DIKKATLE OKUYUN
-- ===========================================================================
-- Bu tabloda ROW LEVEL SECURITY YOKTUR ve bu bir unutma DEGIL, bilincli bir
-- karardir — `0003_identity_tables` ile BIREBIR ayni gerekce
-- (MULTI_TENANT_ARCHITECTURE 12.4 istisna listesi, 12.4.3):
--
--   Kimlik, tenant'larin USTUNDE yasar (ADR-0014). OAuth callback'i tenant
--   context'i KURULMADAN ONCE calisir — context'i kuracak olan sorgu context'e
--   dayanamaz. Bu tablonun `tenant_id`si YOKTUR; tenant RLS'i koymak, OLMAYAN
--   BIR KAPSAMI VAR GIBI GOSTERMEK olurdu.
--
-- Korumanin kaynagi RLS degil, uygulama seviyesi telafi kontrolleridir:
--   * Yalnizca Identity modulunun repository'si bu tabloya dokunur (6.1).
--   * LISTELEME yalnizca `user_id` bazlidir — global bir liste metodu YOKTUR.
--   * Hicbir yanit hesabin varligini sizdirmaz (ADR-0053 §1.3, D3).
-- ===========================================================================

CREATE TABLE platform.federated_identities (
  -- UUIDv7 — zaman sirali.
  id               uuid        PRIMARY KEY,

  -- Sahibi olan kullanici. `credentials` ile AYNI davranis: kullanici silinirse
  -- kimlik bilgisi de gider.
  user_id          uuid        NOT NULL REFERENCES platform.users (id) ON DELETE CASCADE,

  -- =========================================================================
  -- `provider` — CHECK ile numaralandirilir, PostgreSQL enum'u DEGIL
  -- =========================================================================
  -- ADR-0034'un `direction` deseni: yeni bir saglayici tek satirlik bir
  -- `ALTER ... ADD CONSTRAINT`tir; enum turunu degistirmek daha pahalidir.
  --
  -- ⚠️ `apple` LISTEDE YOKTUR ve bu bilinclidir (ADR-0053 §15): Apple Developer
  -- Program uyeligi tamamlanmadi. Eklendigi gun degisecek sey BU SATIR ve bir
  -- adapter dosyasidir — is mantigi degil.
  -- =========================================================================
  provider         text        NOT NULL,

  -- =========================================================================
  -- ⚠️ KIMLIGIN TEK CAPASI. Saglayicinin `sub` claim'i.
  -- =========================================================================
  -- Bu kolon UPDATE EDILEMEZ (asagidaki yetki blogu). Sebebi tek cumleyle:
  -- `provider_subject` uzerinde UPDATE yetkisi, hatali bir repository metodu ya
  -- da bir enjeksiyon icin DOGRUDAN HESAP DEVRI PRIMITIFIDIR — saldirgan kendi
  -- satirinin sahibini kurbanla degistirir.
  -- =========================================================================
  provider_subject text        NOT NULL,

  -- =========================================================================
  -- ⚠️ YALNIZCA TESHIS. HICBIR SORGUDA JOIN/WHERE ANAHTARI DEGILDIR.
  -- =========================================================================
  -- Adi bilerek `email` DEGIL `email_at_link`: baglama ANININ FOTOGRAFIDIR,
  -- bugunku gercek degil. Bir gun bir sorgu bu kolon uzerinden eslesme yaparsa
  -- ADR-0053 §1'in tamami SESSIZCE cozulur — nOAuth geri gelir.
  --
  -- Nullable: D3 dalinda saglayici hic e-posta vermemis olabilir (§1.3).
  -- =========================================================================
  email_at_link    text,

  -- Zaman `Clock` port'undan gelir, `now()` DEGIL (DEVELOPMENT_RULES 3.2).
  -- Varsayilan bilincli olarak YOKTUR: bir `DEFAULT now()`, testlerin sahte
  -- saatini sessizce devre disi birakirdi.
  linked_at        timestamptz NOT NULL,

  -- ⚠️ Bu tablodaki TEK guncellenebilir kolon (asagidaki yetki blogu).
  -- Nullable: baglama anindan sonraki ilk girise kadar bos kalir.
  last_login_at    timestamptz,

  CONSTRAINT federated_identities_provider_check
    CHECK (provider IN ('google', 'microsoft', 'linkedin', 'facebook')),

  -- Anlamsiz (semantik tasimayan) kisitlar: bos ya da devasa bir `sub` hicbir
  -- saglayicida mesru degildir ve bunu bilmek saglayici semantigi gerektirmez.
  CONSTRAINT federated_identities_subject_not_blank
    CHECK (btrim(provider_subject) <> ''),
  CONSTRAINT federated_identities_subject_length
    CHECK (length(provider_subject) <= 255),
  CONSTRAINT federated_identities_email_not_blank
    CHECK (email_at_link IS NULL OR btrim(email_at_link) <> ''),
  CONSTRAINT federated_identities_email_length
    CHECK (email_at_link IS NULL OR length(email_at_link) <= 320)
);
--> statement-breakpoint

-- ===========================================================================
-- ⚠️ IKI TEKILLIK — IKISI DE AYRI BIR SEYI ENGELLER
-- ===========================================================================
-- (1) Bir saglayici hesabi EN FAZLA BIR kullaniciya baglanir. Olmasaydi iki
--     ayri `User` ayni Google hesabini paylasabilir ve "bu kim" sorusunun
--     cevabi kalmazdi.
CREATE UNIQUE INDEX federated_identities_provider_subject_key
  ON platform.federated_identities (provider, provider_subject);
--> statement-breakpoint

-- (2) Bir kullanicinin saglayici basina EN FAZLA BIR hesabi olur. Iki Google
--     hesabi arayuzde _"hangisi bu"_ belirsizligi uretirdi ve karsiliginda
--     hicbir sey kazandirmazdi (ADR-0053 §2.1).
CREATE UNIQUE INDEX federated_identities_user_provider_key
  ON platform.federated_identities (user_id, provider);
--> statement-breakpoint

-- Kullanicinin baglantilarini listelemek (`GET /me/identities`) ve baglantiyi
-- kaldirmak icin. (2) numarali index bunu zaten karsilar; ayri bir index
-- ACILMAZ — yazildigi takdirde ayni erisim yolu icin ikinci bir bakim maliyeti
-- olurdu.

-- ===========================================================================
-- ⚠️⚠️ YETKI — BURASI BU MIGRATION'IN EN ONEMLI BOLUMUDUR
-- ===========================================================================
-- ADR-0043 Slice 1b'nin bulgusu BU TABLODA DOGRUDAN TETIKLENIR:
--
--     `0000_init`in
--       ALTER DEFAULT PRIVILEGES ... IN SCHEMA platform
--         GRANT SELECT, INSERT, UPDATE, DELETE ... TO businessos_app
--     satiri, HER YENI platform tablosuna SESSIZCE uygulanir.
--
-- Yani bu blok yazilmasaydi `businessos_app` bu tabloda TAM `UPDATE` yetkisi
-- tasirdi ve `provider_subject` guncellenebilir olurdu. ⚠️ MT §12.4'un yazili
-- kurali "uygulanmis GORUNUR ama uygulanmaz" — ADR-0043'un tam olarak
-- yakaladigi hata sinifi.
--
-- ⚠️ `REVOKE ALL` ONCE gelir: boylece verilen yetki, VARSAYILANIN NE OLDUGUNA
-- BAKILMAKSIZIN tam olarak asagida yazilanlardir. "Varsayilan zaten dogruydu"
-- varsayimi, bu projede bir kez yanlis cikti.
--
-- ⚠️ Fiil listesi KOPYALANMADI, KARAR VERILDI (yeni migration kontrol
-- listesinin 4. adimi):
--
--     SELECT              -> giris ve `GET /me/identities`
--     INSERT              -> baglama (D2/D3)
--     DELETE              -> `DELETE /me/identities/:provider`
--     UPDATE (last_login_at) -> ⚠️ TEK mesru mutasyon: islemsel bir damga
--
-- Sonuc `suppliers.interactions` (`0034`) deseninin AYNISIDIR ve ondan DAHA
-- GUCLUDUR: orada degisebilen tek sey turetilmis bir vektordu, burada
-- degisebilen tek sey bir zaman damgasidir. `user_id`, `provider` ve
-- `provider_subject` veritabani seviyesinde DEGISTIRILEMEZ.
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    REVOKE ALL ON platform.federated_identities FROM businessos_app;

    GRANT SELECT, INSERT, DELETE ON platform.federated_identities TO businessos_app;

    -- ⚠️ TEK mesru mutasyon. Kimlik kolonlari disaridadir.
    GRANT UPDATE (last_login_at) ON platform.federated_identities TO businessos_app;
  END IF;
END
$$;
