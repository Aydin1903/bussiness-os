-- 0009_outbox_retry — tenant outbox: teslimat yeniden deneme, backoff ve
-- dead-letter (ADR-0006, MULTI_TENANT_ARCHITECTURE 12.4.2)
--
-- DEVELOPMENT_RULES 6: elle yazildi, geri alinabilir.
--
-- ===========================================================================
-- NEDEN SIMDI
-- ===========================================================================
-- `platform.outbox`'in YAZMA yolu 0002'den beri var; OKUMA yolu hic yazilmadi.
-- Satirlar birikiyor, `published_at` sonsuza kadar NULL kaliyor. Bugun islevsel
-- bir hata uretmiyor (tek event `tenant.provisioning_requested` ve V1
-- provisioning senkron, ADR-0016) — ama ilk is modulu event uretmeye
-- basladiginda "yayinliyorum sanan ama yayinlamayan" bir sistem dogar.
--
-- Bu migration, Identity tarafinda `0006_identity_outbox_retry` ile kurulan
-- mekanizmanin AYNISINI tenant outbox'ina getirir. Kolon adlari, tipler ve
-- kisitlar BIREBIR ayni tutuldu: iki tablo ayni tuketici desenini paylasir ve
-- ayrisirlarsa bakim iki katina cikar.
-- ===========================================================================

-- Kac kez denendi. Dead-letter esigi bu sayaca bakar.
ALTER TABLE platform.outbox
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- Son hata metni — TESHIS icindir, yeniden deneme karari icin degil.
-- Sir TASIMAZ: yalnizca hata mesaji yazilir, event payload'i ASLA.
ALTER TABLE platform.outbox
  ADD COLUMN last_error text;
--> statement-breakpoint

-- Backoff: bu andan ONCE kayit yeniden denenmez. NULL = hemen hazir.
-- Acik bir "ne zaman" degeri, kuyruk sorgusunu tek bir karsilastirmaya indirir
-- ve politika degistiginde bekleyen satirlarin anlamini geriye donuk BOZMAZ.
ALTER TABLE platform.outbox
  ADD COLUMN next_attempt_at timestamptz;
--> statement-breakpoint

-- Dead-letter: kuyruktan CIKARILDI, ama SILINMEDI.
--
-- Ayri bir tablo yerine ayni tabloda isaret: ayri tablo kopyala+sil demektir
-- (iki yazma ve arada satir kaybetme ihtimali). Kayit, hata gecmisiyle birlikte
-- YERINDE incelenebilir kalir; asagidaki kismi index onlari zaten kuyruk
-- taramasinin disinda tutar.
ALTER TABLE platform.outbox
  ADD COLUMN dead_lettered_at timestamptz;
--> statement-breakpoint

-- Sayac negatif olamaz; bozuk bir deger sonsuz yeniden deneme uretirdi.
ALTER TABLE platform.outbox
  ADD CONSTRAINT outbox_attempt_count_check CHECK (attempt_count >= 0);
--> statement-breakpoint

-- Bir kayit ya yayinlanmistir ya olmustur, IKISI BIRDEN olamaz.
ALTER TABLE platform.outbox
  ADD CONSTRAINT outbox_terminal_state_check
  CHECK (NOT (published_at IS NOT NULL AND dead_lettered_at IS NOT NULL));
--> statement-breakpoint

-- Kuyruk index'i yenilenir: olu kayitlar artik taranmaz.
-- Siralama `next_attempt_at`'e gecer — kuyrugun basi "en eski" degil, "yeniden
-- denenmeye en erken hazir olan"dir. NULL'lar (hic denenmemis) once gelir.
DROP INDEX IF EXISTS platform.outbox_pending_idx;
--> statement-breakpoint

CREATE INDEX outbox_pending_idx
  ON platform.outbox (next_attempt_at NULLS FIRST, occurred_at)
  WHERE published_at IS NULL AND dead_lettered_at IS NULL;
--> statement-breakpoint

-- Olu kayitlarin incelenmesi icin ayri, kucuk index.
CREATE INDEX outbox_dead_letter_idx
  ON platform.outbox (dead_lettered_at)
  WHERE dead_lettered_at IS NOT NULL;
