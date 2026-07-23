-- 0005_verification_code_requests — dogrulama kodu isteklerinin sayac defteri
-- (ADR-0019 §7.4: 60 sn bekleme · 5/saat hesap · 20/saat IP)
--
-- DEVELOPMENT_RULES 6: elle yazildi, geri alinabilir.
--
-- ===========================================================================
-- NEDEN AYRI TABLO — VE NEDEN KODLARIN KENDISINDEN SAYILMIYOR
-- ===========================================================================
-- Sayimlar `email_verification_codes` uzerinden yapilamaz: VAR OLMAYAN bir
-- e-posta icin kod satiri OLUSMAZ (P2 geregi istek yine 202 doner). Sayim
-- uretilen kodlardan yapilsaydi, 1000 farkli e-posta deneyen bir saldirgan IP
-- limitine HIC takilmazdi.
--
-- IP limiti ISTEGI saymak zorundadir, URETIMI degil. Bu yuzden defter,
-- istegin sonucundan bagimsiz olarak her istegi kaydeder.
--
-- FOREIGN KEY YOKTUR: `login_attempts` ile ayni gerekce — istek var olmayan
-- bir hesaba ait olabilir; yalnizca normalize e-posta (sayac anahtari) tutulur.
-- Tenant-scoped DEGILDIR (MT §12.4 istisna listesi): kimlik, tenant seciminden
-- oncedir.
-- ===========================================================================

CREATE TABLE platform.verification_code_requests (
  id               uuid        PRIMARY KEY,
  email_normalized text        NOT NULL,
  ip_address       text        NOT NULL,
  requested_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT verification_code_requests_email_not_blank
    CHECK (length(btrim(email_normalized)) > 0),
  CONSTRAINT verification_code_requests_ip_not_blank
    CHECK (length(btrim(ip_address)) > 0)
);
--> statement-breakpoint

-- Hesap bazli sinirlar: son gonderim zamani (60 sn) ve saatlik sayim (5).
-- Ikisi de ayni index'ten karsilanir.
CREATE INDEX verification_code_requests_email_idx
  ON platform.verification_code_requests (email_normalized, requested_at);
--> statement-breakpoint

-- Kaynak (IP) siniri: 20/saat.
CREATE INDEX verification_code_requests_ip_idx
  ON platform.verification_code_requests (ip_address, requested_at);
--> statement-breakpoint

-- Grant'lar: DDL ASLA verilmez (ARCHITECTURE 3.3). DELETE, ileride yazilacak
-- saklama/temizlik isi icindir; defter sinirsiz buyumemelidir.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, DELETE ON platform.verification_code_requests TO businessos_app;
  END IF;
END
$$;
