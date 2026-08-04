-- ===========================================================================
-- knowledge.rate_limits — kullanici + tenant bazli istek sayaci (ADR-0029 §5)
-- ===========================================================================
--
-- AMAC: MALIYET KONTROLU, kaba kuvvet korumasi DEGIL.
--
-- Bu ayrim tablonun bicimini belirledi. `platform.login_attempts` istek basina
-- BIR SATIR yazar ve pencere icinde `COUNT(*)` ceker; cunku orada "hangi
-- deneme ne zaman, hangi IP'den" sorusunun cevabi guvenlik acisindan gerekli.
-- Burada o soru sorulmuyor — sorulan tek soru "bu saat icinde kac tane".
--
-- ===========================================================================
-- NEDEN SAYAC SATIRI, LOG DEGIL
-- ===========================================================================
-- 1. ATOMIKLIK. Maliyet saldirisinin sekli tam olarak ES ZAMANLILIKTIR: 100
--    paralel istek. "Once say, sonra yaz" deseninde hepsi 29 okur ve HEPSI
--    gecer. Tek deyimlik `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`
--    bunu kokten keser; sayim ve artirma ayni satir kilidinin altindadir.
--
-- 2. BUYUME. Log deseni kullanici basina saatte 30-60 satir yazardi; bu tablo
--    kullanici + eylem basina saatte BIR satir tutar.
--
-- Kaybedilen sey: "hangi istek ne zaman geldi" izi. Amac maliyet kontrolu
-- oldugu icin gerekli gorulmedi; denetim/analitik ihtiyaci dogarsa AYRI bir is.
--
-- ===========================================================================
-- PENCERE: SABIT SAAT DILIMI (kayan DEGIL) — ve bunun bedeli
-- ===========================================================================
-- `window_start = date_trunc('hour', now())`. Kayan pencere sayac satiriyla
-- kurulamaz, log gerektirir.
--
-- BEDELI: sinir ihlali penceresi. 10:59'da 30, 11:00'de 30 -> iki dakikada 60
-- istek; yani en kotu durumda hedeflenen butcenin IKI KATI, bir sinirda,
-- gecici olarak. Kabul edildi cunku bu rakamlar sert bir butce degil yumusak
-- bir maliyet frenidir (ADR-0029 §5).
--
-- YUKSELTME YOLU (gerekirse): iki kovali agirlikli sayac — Cloudflare deseni.
-- Su anki kova ile BIR ONCEKI kova, pencerede ne kadar ilerlendigine gore
-- agirliklandirilir:
--     tahmini = suanki + onceki * (1 - gecen_sure / pencere)
-- TABLO DEGISMEZ; yalnizca okuma formulu degisir. Bu yuzden simdi
-- yapilmiyor: geri donusu olmayan bir karar degil.
-- ===========================================================================
CREATE TABLE knowledge.rate_limits (
  tenant_id     uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- Kullanici KIMLIGI, IP DEGIL. ADR-0029 §5: harcamayi yapan kullanicidir,
  -- adres degil. `platform.users`'a FK YOKTUR — cross-schema FK Mutlak Kural
  -- 5 ile yasak (`knowledge.conversations.user_id` ile ayni gerekce).
  user_id       uuid        NOT NULL,

  -- Eylem basina AYRI KOVA: `/ask` butcesini bitirmek not eklemeyi
  -- ENGELLEMEZ. Iki eylemin maliyet profili de farklidir (ADR-0029 §5).
  action        text        NOT NULL,

  -- Pencerenin BASLANGICI, saate yuvarlanmis. Sayacin kimliginin parcasidir:
  -- yeni saat = yeni satir = sifirdan sayim. Ayri bir "sifirlama" isi YOK.
  window_start  timestamptz NOT NULL,

  request_count integer     NOT NULL DEFAULT 0,

  -- Uygulamada `RateLimitedAction` birlesim tipiyle aynadir. Veritabanindaki
  -- kisit, tipin kacirdigini yakalar: elle atilan bir INSERT veya ileride
  -- eklenip domain'e yazilmayan bir eylem SESSIZCE giremez.
  CONSTRAINT rate_limits_action_valid CHECK (action IN ('ask', 'create_note')),
  CONSTRAINT rate_limits_count_positive CHECK (request_count >= 0),

  -- UPSERT'in catisma hedefi. Ayrica sorgunun TEK index'i: bu birincil
  -- anahtar disinda bir erisim deseni yok.
  PRIMARY KEY (tenant_id, user_id, action, window_start)
);
--> statement-breakpoint

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2), 0011 ile BIREBIR AYNI, SAPMA YOK
--
-- `current_setting`'de `missing_ok` KULLANILMAZ: context kurulmamissa sorgu
-- SESSIZCE BOS DONMEZ, HATA VERIR (MT §12.6 madde 4).
--
-- ⚠️ Bir oran sinirlayicida sessiz bos sonuc, ozellikle tehlikelidir: sayac
-- her istekte 0 okunur ve sinir HIC devreye girmez. Yani hata, korumanin
-- kendisini gorunmez sekilde kapatirdi.
-- ===========================================================================
ALTER TABLE knowledge.rate_limits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE knowledge.rate_limits FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON knowledge.rate_limits
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

-- Uygulama rolu. DELETE dahil: retention temizligi (ROADMAP §8.3) bu tabloyu
-- da kapsayacak.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge.rate_limits TO businessos_app;
  END IF;
END
$$;
