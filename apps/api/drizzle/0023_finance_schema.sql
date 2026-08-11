-- ===========================================================================
-- finance semasi — Faz 5'in UCUNCU is modulu (ADR-0034 §1, §3)
-- ===========================================================================
--
-- `platform` disindaki DORDUNCU sema (`knowledge`, `crm`, `projects`,
-- `finance`). Mutlak Kural 5: her modul kendi semasina sahiptir; `crm` ya da
-- `projects` semasini genisletmek iki modulu tek RLS/retention/migration
-- yuzeyinde birlestirir ve ayrilabilirligi kaybettirirdi.
--
-- BU MIGRATION'DA ISLEM DE AI DE YOK. `transactions` `0024`'e,
-- `commentaries` / `commentary_chunks` ve pgvector `0025`'e aittir. Amac,
-- uc semada kanitlanmis sema + RLS + RBAC zincirini bir kez daha, en dar
-- yuzeyle kurmaktir.

CREATE SCHEMA IF NOT EXISTS finance;
--> statement-breakpoint

-- Uygulama rolu semayi gorur ama icinde nesne OLUSTURAMAZ (02-schemas.sql
-- deseni; `knowledge`, `crm` ve `projects` semalariyla birebir ayni).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT USAGE ON SCHEMA finance TO businessos_app;
  END IF;
END
$$;
--> statement-breakpoint

-- ===========================================================================
-- finance.categories — PROJENIN ILK TENANT-TANIMLI SOZLUGU
-- ===========================================================================
--
-- Bugune kadarki her sozluk KODDA enum'du: `MembershipRole`,
-- `OpportunityStage`, `ProjectStatus`, `TaskStatus`. Hepsi dogruydu, cunku
-- `won`/`lost` her sirkette AYNI seyi anlatir.
--
-- Finans kategorisi oyle DEGILDIR: bir yazilim sirketinin "Sunucu maliyeti"
-- kalemiyle bir kafenin "Hammadde" kalemi ayni listede yasayamaz. Sabit bir
-- enum kullanicilarin cogunu "Diger"e siginmaya iter ve kategori bazli ozeti
-- ANLAMSIZLASTIRIR (ADR-0034 §3a).
--
-- Serbest metin de secilmedi (§3b): "Kira" / "kira" / "KIRA" uc ayri kategori
-- olur, toplamlar SESSIZCE bolunur ve nakit akisi ozeti DOGRU GORUNEN YANLIS
-- SAYILAR uretir. Bu, projenin tekrar tekrar reddettigi sessiz hatanin en
-- pahali turudur — cunku ciktisi bir SAYIDIR ve sayilara itiraz edilmez.
CREATE TABLE finance.categories (
  id          uuid        PRIMARY KEY,
  tenant_id   uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  name        text        NOT NULL,

  -- =========================================================================
  -- YON KATEGORIDE TUTULUR — ve `0024`'te BILESIK FK ile ZORLANIR
  -- =========================================================================
  -- `crm.opportunities.stage` ile ayni karar: tablo MODULUN KENDISININDIR,
  -- kendi sozlugunu tasimasi mesrudur ve tipin kacirdigini calisma zamaninda
  -- yakalar. Buradaki kisit, uygulamayi ATLAYAN her yolu (elle SQL, ileride
  -- bir ithalat betigi) da baglar.
  direction   text        NOT NULL,

  -- =========================================================================
  -- ARSIVLEME VAR, CUNKU SILME GECMISI SESSIZCE DEGISTIRIR
  -- =========================================================================
  -- Kullanimdaki bir kategoriyi silmek (ya da `SET NULL` ile kopartmak) gecen
  -- ayin raporunu BUGUN baska bir sey soyler hale getirirdi. `0024`'un FK'si
  -- `ON DELETE RESTRICT` tasiyacak; arsivleme ise kategoriyi YENI kayitlarda
  -- secilemez yapar, gecmiste birakir (ADR-0034 §3e).
  is_archived boolean     NOT NULL DEFAULT false,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT categories_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT categories_updated_after_created CHECK (updated_at >= created_at),

  CONSTRAINT categories_direction_valid CHECK (direction IN ('income', 'expense')),

  -- =========================================================================
  -- ⚠️ `id` ZATEN BIRINCIL ANAHTAR — BU KISIT GEREKSIZ GORUNUR AMA DEGILDIR
  -- =========================================================================
  -- `0024`'un bilesik yabanci anahtari
  --   FOREIGN KEY (category_id, direction) REFERENCES finance.categories (id, direction)
  -- hedef tarafta TAM OLARAK bu kolon ciftinde bir UNIQUE kisit ARAR;
  -- PostgreSQL "there is no unique constraint matching given keys" ile
  -- reddeder. Yani bu satir, "gelir kaydina gider kategorisi" hatasini
  -- veritabani seviyesinde imkansiz kilan mekanizmanin YARISIDIR
  -- (ADR-0034 §3c).
  --
  -- ⚠️ SILINIRSE `0024` UYGULANAMAZ. Hata derleme zamaninda degil, migration
  -- calisirken gorunur.
  CONSTRAINT categories_id_direction_unique UNIQUE (id, direction)
);
--> statement-breakpoint

-- ===========================================================================
-- AD TEKILLIGI — tenant + YON basina, BUYUK/KUCUK HARF DUYARSIZ
-- ===========================================================================
-- `lower(name)` olmadan "Kira" ve "kira" iki ayri satir olurdu ve serbest
-- metnin reddedilme gerekcesi (§3b) tablonun ICINDE yeniden dogardi.
--
-- Yon de anahtarin PARCASIDIR: "Danismanlik" hem bir gelir hem bir gider
-- kalemi olabilir (aldigimiz ve verdigimiz danismanlik) ve bu MESRUDUR.
--
-- ⚠️ ARSIVLENMISLER DE ANAHTARA DAHIL (kismi index DEGIL). Arsivlenmis "Kira"
-- varken ikinci bir "Kira" acilabilseydi ozet listesinde ayni adi tasiyan iki
-- satir gorunurdu. Dogru yol yenisini acmak degil, ESKISINI ARSIVDEN
-- CIKARMAKTIR.
CREATE UNIQUE INDEX categories_tenant_name_direction_idx
  ON finance.categories (tenant_id, lower(name), direction);
--> statement-breakpoint

-- MT §12.3: her sorgu `tenant_id` ile filtrelenir; bilesik index'te DAIMA ilk
-- kolon. Liste `direction` ile filtrelenip ada gore siralandigi icin ikinci ve
-- ucuncu kolonlar onlardir.
CREATE INDEX categories_tenant_direction_name_idx
  ON finance.categories (tenant_id, direction, name);
--> statement-breakpoint

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2). SAPMA YOK, DORDUNCU KEZ.
--
-- `current_setting`'de `missing_ok` KULLANILMAZ: context kurulmamissa sorgu
-- SESSIZCE BOS DONMEZ, HATA VERIR (MT §12.6 madde 4). Bos sonuc "hic kategori
-- yok" gibi gorunur ve kullanici verisini kaybettigini sanar.
-- ===========================================================================
ALTER TABLE finance.categories ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE finance.categories FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON finance.categories
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

-- Uygulama rolu: yalnizca DML. DDL yetkisi ASLA verilmez.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON finance.categories TO businessos_app;
  END IF;
END
$$;
