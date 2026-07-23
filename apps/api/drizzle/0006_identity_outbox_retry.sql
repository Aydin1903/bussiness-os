-- 0006_identity_outbox_retry — teslimat yeniden deneme, backoff ve dead-letter
-- (ADR-0006, AUTH_ARCHITECTURE 16.1)
--
-- DEVELOPMENT_RULES 6: elle yazildi, geri alinabilir.
--
-- ===========================================================================
-- NEDEN SIMDI
-- ===========================================================================
-- Bugune kadar bagli olan `ConsoleEmailAdapter` ASLA hata vermiyordu; teslimat
-- hatasi teorik bir riskti ve kayit sonsuza kadar yeniden deneniyordu. Resend
-- gercek bir dis servistir: gecersiz adres, oran siniri ve kesinti GERCEKTIR.
--
-- Mekanizma olmadan tek bir gecersiz adres kuyrugu sonsuza kadar mesgul eder ve
-- ARKASINDAKI gecerli e-postalari geciktirir. Bu, AUTH_ARCHITECTURE 16.1'de
-- "Resend baglanmadan ONCE zorunlu" diye kayitli borctur.
-- ===========================================================================

-- Kac kez denendi. Dead-letter esigi bu sayaca bakar.
ALTER TABLE platform.identity_outbox
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- Son hata metni — TESHIS icindir, yeniden deneme karari icin degil.
-- Sir TASIMAZ: adapter yalnizca saglayicinin durum/mesajini yazar, e-posta
-- govdesini veya dogrulama kodunu ASLA (P1).
ALTER TABLE platform.identity_outbox
  ADD COLUMN last_error text;
--> statement-breakpoint

-- Backoff: bu andan ONCE kayit yeniden denenmez. NULL = hemen hazir.
-- Sutun yerine "son deneme + hesapla" yaklasimi da mumkundu; acik bir "ne zaman"
-- degeri, kuyruk sorgusunu tek bir karsilastirmaya indirir ve politikayi
-- degistirdigimizde bekleyen satirlarin anlamini geriye donuk BOZMAZ.
ALTER TABLE platform.identity_outbox
  ADD COLUMN next_attempt_at timestamptz;
--> statement-breakpoint

-- Dead-letter: kuyruktan CIKARILDI, ama SILINMEDI.
--
-- Ayri bir tablo yerine ayni tabloda isaret: ayri tablo kopyala+sil demektir
-- (iki yazma ve arada satir kaybetme ihtimali). Kayit, hata gecmisiyle birlikte
-- YERINDE incelenebilir kalir; asagidaki kismi index onlari zaten kuyruk
-- taramasinin disinda tutar.
ALTER TABLE platform.identity_outbox
  ADD COLUMN dead_lettered_at timestamptz;
--> statement-breakpoint

-- Sayac negatif olamaz; bozuk bir deger sonsuz yeniden deneme uretirdi.
ALTER TABLE platform.identity_outbox
  ADD CONSTRAINT identity_outbox_attempt_count_check CHECK (attempt_count >= 0);
--> statement-breakpoint

-- Bir kayit ya yayinlanmistir ya olmustur, IKISI BIRDEN olamaz.
ALTER TABLE platform.identity_outbox
  ADD CONSTRAINT identity_outbox_terminal_state_check
  CHECK (NOT (published_at IS NOT NULL AND dead_lettered_at IS NOT NULL));
--> statement-breakpoint

-- Kuyruk index'i yenilenir: olu kayitlar artik taranmaz.
-- Siralama `next_attempt_at`'e gecer — kuyrugun basi "en eski" degil, "yeniden
-- denenmeye en erken hazir olan"dir. NULL'lar (hic denenmemis) once gelir.
DROP INDEX IF EXISTS platform.identity_outbox_pending_idx;
--> statement-breakpoint

CREATE INDEX identity_outbox_pending_idx
  ON platform.identity_outbox (next_attempt_at NULLS FIRST, occurred_at)
  WHERE published_at IS NULL AND dead_lettered_at IS NULL;
--> statement-breakpoint

-- Olu kayitlarin incelenmesi icin ayri, kucuk index.
CREATE INDEX identity_outbox_dead_letter_idx
  ON platform.identity_outbox (dead_lettered_at)
  WHERE dead_lettered_at IS NOT NULL;
