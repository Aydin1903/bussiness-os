-- 0041_one_tap_attempts — One Tap oran siniri defteri (ADR-0053 EK-1.4)
--
-- DEVELOPMENT_RULES 6: migration'lar ELLE yazilir, review edilir, geri
-- alinabilir.
--
-- ===========================================================================
-- ⚠️ BU TABLO NEDEN VAR — MEVCUT IKI MEKANIZMA DA KULLANILAMADI
-- ===========================================================================
-- `POST /auth/oauth/google/one-tap` KIMLIK ONCESI bir uctur ve `/start`tan
-- KATEGORIK OLARAK farklidir: saldirganin uretmesi gereken sey bizim
-- `aud`umuzla GECERLI BIR GOOGLE ID TOKEN'idir ve bunu HERHANGI BIR Google
-- hesabiyla uretebilir. Yani bariyer "bizim kodumuza sahip olmak"tan "bir
-- Google hesabina sahip olmak"a duser — ve uc, D2/D3 dallarinda KULLANICI
-- OLUSTURABILIR.
--
-- ⚠️ MEVCUT IKI DEFTER DE OLCULDU VE IKISI DE KULLANILAMAZ:
--
--   (1) `platform.rate_limits` -> `tenant_id uuid NOT NULL REFERENCES
--       platform.tenants` tasir ve RLS politikasi
--       `current_setting('app.current_tenant_id')`e dayanir; `enforceRateLimit`
--       imzasi da `tenantId` ISTER. Bu uc kimlik oncesidir: TENANT YOKTUR.
--
--   (2) `platform.login_attempts` (ADR-0022 kaba kuvvet defteri) -> ⚠️ BU BIR
--       USLUP TERCIHI DEGIL BIR SALDIRI YUZEYIDIR. Defter `(email, ip)` ile
--       anahtarlidir ve Katman 1 esigi BES HATADA KILITLER. One Tap hatalari
--       oraya yazilsaydi, saldirgan kurbanin e-postasiyla bes basarisiz One Tap
--       istegi gonderip ⚠️ KURBANIN PAROLA GIRISINI KILITLERDI. Iki sayacin
--       karistirilmasi, bir yolu digerini bozmak icin kullanilabilir kilar.
--
-- Karar: `platform.verification_code_requests` (`0005`) DESENI tekrarlanir —
-- o tablo da tenant'siz ve `ip_address` ile anahtarli.
--
-- ===========================================================================
-- ⚠️ HESAP BAZLI SAYAC YOKTUR — VE BU BILINCLIDIR
-- ===========================================================================
-- `verification_code_requests` hem `email_normalized` hem `ip_address` tutar.
-- Bu tablo ⚠️ YALNIZCA `ip_address` tutar ve e-posta kolonu ACILMAZ: e-posta
-- bazli bir sayac, yukarida (2)'de tarif edilen kilitleme saldirisini BU
-- TABLODA YENIDEN URETIRDI.
--
-- Bedeli durustce: tek bir IP'nin arkasindaki cok sayida mesru kullanici
-- (kurumsal NAT) ortak kotayi paylasir. Kabul edildi — alternatifi bir saldiri
-- yuzeyi acmakti.
--
-- ===========================================================================
-- RLS DURUMU
-- ===========================================================================
-- ROW LEVEL SECURITY YOKTUR — `0003_identity_tables` ve `0040` ile AYNI
-- gerekce (MT §12.4.3): kimlik tenant'larin USTUNDE yasar ve bu uc tenant
-- context'i KURULMADAN ONCE calisir. Tablonun `tenant_id`si yoktur; tenant
-- RLS'i koymak OLMAYAN BIR KAPSAMI VAR GIBI GOSTERMEK olurdu.
-- ===========================================================================

CREATE TABLE platform.one_tap_attempts (
  -- UUIDv7 — zaman sirali.
  id           uuid        PRIMARY KEY,

  -- ⚠️ TEK anahtar. E-posta KOLONU YOKTUR (yukaridaki blok).
  ip_address   text        NOT NULL,

  -- Zaman `Clock` port'undan gelir, `now()` DEGIL (DEVELOPMENT_RULES 3.2).
  -- Varsayilan bilincli olarak YOKTUR: bir `DEFAULT now()`, testlerin sahte
  -- saatini sessizce devre disi birakirdi.
  attempted_at timestamptz NOT NULL,

  -- Anlamsiz degerler elenir; IPv6 en fazla 45 karakterdir.
  CONSTRAINT one_tap_attempts_ip_not_blank CHECK (btrim(ip_address) <> ''),
  CONSTRAINT one_tap_attempts_ip_length    CHECK (length(ip_address) <= 45)
);
--> statement-breakpoint

-- Saatlik pencere sorgusunun TEK erisim yolu: (ip, zaman) — `DESC` cunku sorgu
-- daima "son N dakika" seklindedir.
CREATE INDEX one_tap_attempts_ip_time_idx
  ON platform.one_tap_attempts (ip_address, attempted_at DESC);
--> statement-breakpoint

-- ===========================================================================
-- ⚠️ YETKI — `0040`IN DERSI BURADA DA GECERLI
-- ===========================================================================
-- `0000_init`in `ALTER DEFAULT PRIVILEGES ... IN SCHEMA platform` satiri her
-- yeni platform tablosuna SESSIZCE SELECT+INSERT+UPDATE+DELETE verir. Bu blok
-- yazilmasaydi tablo tam `UPDATE` yetkisi tasirdi.
--
-- ⚠️ Bu bir EKLEME-YALNIZ defterdir: bir denemenin sonradan DEGISTIRILMESI
-- diye bir sey yoktur. `UPDATE` kaldirilir; `DELETE` KALIR cunku retention
-- temizligi bu tabloyu kirpacaktir (ROADMAP §8.5, liste 24 -> 25).
--
-- ⚠️ `REVOKE ALL` ONCE gelir: verilen yetki, varsayilanin ne oldugundan
-- BAGIMSIZ olarak tam olarak asagida yazilanlardir.
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    REVOKE ALL ON platform.one_tap_attempts FROM businessos_app;

    -- ⚠️ UPDATE YOK ve kolon bazli bir istisna da YOK: `0040`tan farkli olarak
    -- burada mesru TEK BIR mutasyon bile yoktur.
    GRANT SELECT, INSERT, DELETE ON platform.one_tap_attempts TO businessos_app;
  END IF;
END
$$;
