-- ===========================================================================
-- crm.opportunities — satis hatti (ADR-0031 §2, §3)
-- ===========================================================================
--
-- Bu slice'ta da AI YOK. Embedding ve katkicilar Slice 6-7'ye aittir.

CREATE TABLE crm.opportunities (
  id                uuid        PRIMARY KEY,
  tenant_id         uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- Sirket silinince firsat da gider: firsat sahipsiz kalamaz.
  company_id        uuid        NOT NULL REFERENCES crm.companies (id) ON DELETE CASCADE,

  -- Kisi OPSIYONELDIR ve silinince firsat OLMEZ, yalnizca baglantisi kopar.
  -- CASCADE olsaydi bir kisiyi silmek acik bir anlasmayi da silerdi — silme
  -- niyetiyle orantisiz bir yikim.
  contact_id        uuid        REFERENCES crm.contacts (id) ON DELETE SET NULL,

  title             text        NOT NULL,

  -- =========================================================================
  -- BES ASAMA — CHECK ile numaralandirilir
  -- =========================================================================
  -- `platform.rate_limits`ten (migration 0014) FARKLI: orada eylem adlarini
  -- numaralandiran CHECK KALDIRILMISTI cunku tablo PLATFORM'a aitti ve bir is
  -- modulunun sozlugunu tasiyamazdi. Burada tablo MODULUN KENDISININDIR; kendi
  -- sozlugunu tasimasi mesrudur ve tipin kacirdigini calisma zamaninda yakalar.
  --
  -- Product Owner "sabit 4 asama" dedi; son kutu ("Kazanildi/Kaybedildi") IKI
  -- AYRI SONUCTUR, bu yuzden bes deger (ADR-0031 §2).
  -- =========================================================================
  stage             text        NOT NULL DEFAULT 'potential',

  -- Para: `numeric`, `double precision` DEGIL. Kayan noktali sayida para
  -- tutmak yuvarlama hatasi biriktirir.
  estimated_value   numeric(14, 2),
  currency          text,

  -- Takip bir TAKVIM GUNUDUR, bir an degil. `date` secimi tenant bazli saat
  -- dilimi sorusunu (kapsam disi) v1'de TUMUYLE ortadan kaldirir: gun bazli
  -- bir alanda saat dilimi kaymasi diye bir sey yoktur (ADR-0031 §3).
  -- Bedeli acikca: gun ici saat verilemez.
  next_follow_up_on date,

  -- "Bu firsat kac gundur ayni asamada" — Slice 7'nin yapisal katkicisinin
  -- okuyacagi sinyal. Tam asama GECMISI tablosu KAPSAM DISI (ADR-0031 §2);
  -- bugun sorulan tek soru "ne kadar zamandir burada".
  stage_changed_at  timestamptz NOT NULL DEFAULT now(),

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT opportunities_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT opportunities_stage_valid CHECK (
    stage IN ('potential', 'in_discussion', 'proposal_sent', 'won', 'lost')
  ),
  CONSTRAINT opportunities_value_positive CHECK (
    estimated_value IS NULL OR estimated_value >= 0
  ),

  -- =========================================================================
  -- TUTAR VARSA PARA BIRIMI ZORUNLU (Product Owner onayi)
  -- =========================================================================
  -- Birimsiz bir tutar gercek bir VERI HATASIDIR ve toplamlari sessizce
  -- yanlis yapar. Cok para birimli TOPLAMA hala kapsam disi (ADR-0031):
  -- sakladigimiz sey birim, cevirdigimiz sey degil.
  CONSTRAINT opportunities_currency_required_with_value CHECK (
    estimated_value IS NULL OR currency IS NOT NULL
  ),
  CONSTRAINT opportunities_updated_after_created CHECK (updated_at >= created_at)
);
--> statement-breakpoint

-- MT §12.3: bilesik index'te `tenant_id` DAIMA ilk kolon.
CREATE INDEX opportunities_tenant_created_idx ON crm.opportunities (tenant_id, created_at DESC);
--> statement-breakpoint

CREATE INDEX opportunities_tenant_company_idx ON crm.opportunities (tenant_id, company_id);
--> statement-breakpoint

-- ===========================================================================
-- TAKIPLER GORUNUMUNUN INDEX'I — KISMI (partial)
-- ===========================================================================
-- `GET /crm/follow-ups` yalnizca takip tarihi OLAN ve KAPANMAMIS firsatlari
-- okur (ADR-0031 §3). Kismi index tam da o alt kumeyi kapsar: kapanmis
-- firsatlar ve tarihi olmayanlar index'e HIC girmez.
--
-- Bu bir performans suslemesi degil, gorunumun TANIMIDIR: sorgu bu yuklemle
-- yazilir ve index onunla birebir eslesir.
CREATE INDEX opportunities_follow_up_idx
  ON crm.opportunities (tenant_id, next_follow_up_on)
  WHERE next_follow_up_on IS NOT NULL AND stage NOT IN ('won', 'lost');
--> statement-breakpoint

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2). SAPMA YOK.
-- ===========================================================================
ALTER TABLE crm.opportunities ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE crm.opportunities FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON crm.opportunities
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON crm.opportunities TO businessos_app;
  END IF;
END
$$;
