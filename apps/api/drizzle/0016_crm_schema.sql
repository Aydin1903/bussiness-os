-- ===========================================================================
-- crm semasi — Faz 5'in ilk IS modulu (ADR-0031 §1)
-- ===========================================================================
--
-- `platform` disindaki IKINCI sema (ilki `knowledge`). Mutlak Kural 5: her
-- modul kendi semasina sahiptir; `knowledge` semasini genisletmek iki modulu
-- tek RLS/retention/migration yuzeyinde birlestirir ve ayrilabilirligi
-- kaybettirirdi.
--
-- BU MIGRATION'DA AI YOK. `interactions` / `interaction_chunks` ve pgvector
-- Slice 6'ya aittir; burada amac sema + RLS + RBAC zincirini AI
-- karmasikligi OLMADAN kanitlamaktir.

CREATE SCHEMA IF NOT EXISTS crm;
--> statement-breakpoint

-- Uygulama rolu semayi gorur ama icinde nesne OLUSTURAMAZ (02-schemas.sql
-- deseni; `knowledge` semasiyla birebir ayni).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT USAGE ON SCHEMA crm TO businessos_app;
  END IF;
END
$$;
--> statement-breakpoint

-- ===========================================================================
-- crm.companies
-- ===========================================================================
--
-- ⚠️ `name` UZERINDE UNIQUE KISIT YOKTUR — ve bu bilincli (Product Owner
-- onayi, ADR-0031 Slice 4).
--
-- Gercek bir CRM'de ayni isimli iki kayit MESRUDUR: ayni grubun iki sirketi,
-- ayni adi tasiyan farkli subeler. Tekillik dayatmak kullaniciyi "Acme 2" gibi
-- SAHTE adlar yazmaya iter — yani veriyi duzeltmez, bozar.
--
-- Mukerrer kayit bir VERI KALITESI sorunudur, bir butunluk kisiti degil;
-- cozumu birlestirme (merge) akisidir ve o ayri bir istir.
--
-- Durust bedeli: mukerrer kayitlar birikir ve AI hafizasi ayni musteriyi iki
-- kez gorebilir (Slice 6'da gorusmeler eklendiginde). Kabul edildi.
CREATE TABLE crm.companies (
  id         uuid        PRIMARY KEY,
  tenant_id  uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  name       text        NOT NULL,
  industry   text,
  email      text,
  phone      text,
  website    text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT companies_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT companies_updated_after_created CHECK (updated_at >= created_at)
);
--> statement-breakpoint

-- MT §12.3: her sorgu `tenant_id` ile filtrelenir; bilesik index'te DAIMA ilk
-- kolon. Siralama `created_at DESC` oldugu icin ikinci kolon odur.
CREATE INDEX companies_tenant_created_idx ON crm.companies (tenant_id, created_at DESC);
--> statement-breakpoint

-- ===========================================================================
-- crm.contacts
-- ===========================================================================
--
-- `company_id` NOT NULL: her kisi BIR SIRKETE aittir (ADR-0031 §1.1'in dogal
-- hiyerarsi karari). Polimorfik ebeveyn ya da "sahipsiz kisi" hali secilmedi;
-- kazanci "bu sirketin tum kisileri" sorgusunun tek kolonla cevaplanmasidir.
--
-- `ON DELETE CASCADE` — ADR-0031 §7. Sirket silinince kisileri de gider. Bu,
-- `crm` semasinin var olma gerekcesinin somut karsiligidir: Slice 6'da zincir
-- `interactions` ve `interaction_chunks`'a uzayacak ve SILINEN MUSTERI AI
-- HAFIZASINDAN DA SILINECEK. Cross-schema FK yasak oldugu icin bu cascade,
-- gorusmeler `knowledge.notes`'a yazilsaydi YAZILAMAZDI.
CREATE TABLE crm.contacts (
  id         uuid        PRIMARY KEY,
  tenant_id  uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,
  company_id uuid        NOT NULL REFERENCES crm.companies (id) ON DELETE CASCADE,

  full_name  text        NOT NULL,
  title      text,
  email      text,
  phone      text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT contacts_full_name_not_blank CHECK (btrim(full_name) <> ''),
  CONSTRAINT contacts_updated_after_created CHECK (updated_at >= created_at)
);
--> statement-breakpoint

CREATE INDEX contacts_tenant_created_idx ON crm.contacts (tenant_id, created_at DESC);
--> statement-breakpoint

-- "Bu sirketin kisileri" en sik sorgudur; `tenant_id` yine ilk kolon.
CREATE INDEX contacts_tenant_company_idx ON crm.contacts (tenant_id, company_id);
--> statement-breakpoint

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2). SAPMA YOK.
--
-- `current_setting`'de `missing_ok` KULLANILMAZ: context kurulmamissa sorgu
-- SESSIZCE BOS DONMEZ, HATA VERIR (MT §12.6 madde 4). Bir CRM'de sessiz bos
-- sonuc "musteri kaydi yok" gibi gorunur ve kullanici veriyi kaybettigini
-- sanar.
-- ===========================================================================
ALTER TABLE crm.companies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE crm.companies FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON crm.companies
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

ALTER TABLE crm.contacts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE crm.contacts FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON crm.contacts
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

-- Uygulama rolu: yalnizca DML. DDL yetkisi ASLA verilmez.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON crm.companies TO businessos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON crm.contacts TO businessos_app;
  END IF;
END
$$;
