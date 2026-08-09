-- ===========================================================================
-- projects semasi — Faz 5'in IKINCI is modulu (ADR-0033 §1)
-- ===========================================================================
--
-- `platform` disindaki UCUNCU sema (`knowledge`, `crm`, `projects`). Mutlak
-- Kural 5: her modul kendi semasina sahiptir; `crm` semasini genisletmek iki
-- modulu tek RLS/retention/migration yuzeyinde birlestirir ve ayrilabilirligi
-- kaybettirirdi.
--
-- BU MIGRATION'DA GOREV DE AI DE YOK. `tasks` Slice 2'ye, `progress_notes` /
-- `progress_note_chunks` ve pgvector Slice 3'e aittir. Amac, `crm` semasinda
-- kanitlanmis sema + RLS + RBAC zincirini bir kez daha, en dar yuzeyle
-- kurmaktir.

CREATE SCHEMA IF NOT EXISTS projects;
--> statement-breakpoint

-- Uygulama rolu semayi gorur ama icinde nesne OLUSTURAMAZ (02-schemas.sql
-- deseni; `knowledge` ve `crm` semalariyla birebir ayni).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT USAGE ON SCHEMA projects TO businessos_app;
  END IF;
END
$$;
--> statement-breakpoint

-- ===========================================================================
-- projects.projects
-- ===========================================================================
--
-- Tablo adi semayla ayni ve bu KABUL EDILDI: SQL'de her zaman nitelenmis
-- yazilir (`projects.projects`) ve alternatifleri ("items", "records") tablonun
-- ne tuttugunu SOYLEMIYORDU.
--
-- ⚠️ `name` UZERINDE UNIQUE KISIT YOKTUR — `crm.companies` ile ayni gerekce ve
-- burada daha da guclu: ayni adi tasiyan iki proje (ayni isin iki donemi,
-- "Web sitesi yenileme" 2025 ve 2026) tamamen mesrudur. Tekillik dayatmak
-- kullaniciyi "Web sitesi yenileme 2" gibi SAHTE adlar yazmaya iter.
--
-- ===========================================================================
-- ⚠️ `company_id` BIR FOREIGN KEY DEGILDIR — ve bu bu modulun EN ONEMLI karari
-- ===========================================================================
-- Hedef tablo `crm.companies`, yani BASKA BIR SEMA. Mutlak Kural 5 cross-schema
-- FK'yi yasaklar (tek istisna `platform.tenants`). Bu bir tercih degil kisittir.
--
-- ADR-0033 §2 bu yuzden UC PARCALI bir desen kurdu ve UCU BIRDEN gereklidir:
--   (a) FK yok           — cunku yazilamaz
--   (b) sirket ADI kopyalanmaz, CRM'in public interface'inden okunur
--                        — kopyalansaydi yeniden adlandirmada BAYATLARDI
--   (c) o okuma `company:read` iznine baglidir
--                        — yoksa Projeler, CRM adlarini sizdiran bir yan kapi
--                          olurdu (ADR-0031 §5.3'un ayni dersi)
--
-- Sonucu: silinen bir sirketin id'si burada SARKTA KALIR. Cascade baska semaya
-- uzanamaz. Bu veri bozulmasi DEGILDIR (UUID yeniden kullanilmaz) ve okuyan her
-- yol bunu normal bir durum olarak ele almak ZORUNDADIR — "sirket kaydi
-- silinmis", bos ad ya da 500 degil.
--
-- ⚠️ KOLON BU SLICE'TA YAZILMIYOR. API'nin `companyId` kabul etmesi Slice 4'e
-- birakildi, cunku (b) ve (c) icin gereken `crm.public.ts` o slice'ta yaziliyor.
-- Dogrulanamayan bir isaretciyi bugunden kabul etmek, ilk gunden sarkan satir
-- uretmek olurdu. Kolon yine de SIMDI aciliyor: ADR uc migration ongoruyor ve
-- dorduncu bir ALTER'a gerek yok.
CREATE TABLE projects.projects (
  id                uuid        PRIMARY KEY,
  tenant_id         uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  name              text        NOT NULL,
  status            text        NOT NULL DEFAULT 'planning',
  description       text,

  -- Cross-modul YUMUSAK referans — FK YOK, bkz. yukaridaki blok.
  company_id        uuid,

  -- TAKVIM GUNU (`date`), an DEGIL: "Cuma'ya kadar" bir gundur, bir an degil.
  -- Bu secim tenant bazli saat dilimi sorusunu v1'de TUMUYLE ortadan kaldirir
  -- (ADR-0031 §3'un ayni karari).
  started_on        date,
  due_on            date,

  -- Yalnizca durum GERCEKTEN degistiginde ilerler (ADR-0033 §5). Ayni durumu
  -- tekrar gonderen bir `PATCH` sayaci SIFIRLAMAZ; aksi halde "bu proje 40
  -- gundur 'Devam Ediyor'" sinyali bir no-op guncellemeyle SESSIZCE silinirdi.
  status_changed_at timestamptz NOT NULL DEFAULT now(),

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT projects_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT projects_updated_after_created CHECK (updated_at >= created_at),

  -- Sozluk tabloda DA zorlanir: tablo modulun KENDISININDIR, kendi sozlugunu
  -- tasimasi mesru (`crm.opportunities.stage` ile ayni karar). Uygulama
  -- katmani ayni kumeyi kontrol eder; buradaki kisit, uygulamayi ATLAYAN her
  -- yolu (elle SQL, ileride bir betik) da baglar.
  CONSTRAINT projects_status_valid
    CHECK (status IN ('planning', 'in_progress', 'completed', 'cancelled')),

  -- Bitis, baslangictan ONCE olamaz. Yalnizca IKISI DE doluyken kontrol edilir;
  -- tek basina bir bitis tarihi ("Cuma'ya kadar, ne zaman basladigi belirsiz")
  -- mesru bir durumdur.
  CONSTRAINT projects_due_after_started CHECK (started_on IS NULL OR due_on IS NULL OR due_on >= started_on)
);
--> statement-breakpoint

-- MT §12.3: her sorgu `tenant_id` ile filtrelenir; bilesik index'te DAIMA ilk
-- kolon. Siralama `created_at DESC` oldugu icin ikinci kolon odur.
CREATE INDEX projects_tenant_created_idx ON projects.projects (tenant_id, created_at DESC);
--> statement-breakpoint

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2). SAPMA YOK.
--
-- `current_setting`'de `missing_ok` KULLANILMAZ: context kurulmamissa sorgu
-- SESSIZCE BOS DONMEZ, HATA VERIR (MT §12.6 madde 4). Bos sonuc "hic proje
-- yok" gibi gorunur ve kullanici verisini kaybettigini sanar.
-- ===========================================================================
ALTER TABLE projects.projects ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE projects.projects FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON projects.projects
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

-- Uygulama rolu: yalnizca DML. DDL yetkisi ASLA verilmez.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON projects.projects TO businessos_app;
  END IF;
END
$$;
