-- 0001_tenant_tables — tenant ve membership tablolari + RLS
--
-- DEVELOPMENT_RULES 6: migration'lar ELLE yazilir, review edilir, geri
-- alinabilir. Bu dosya drizzle-kit ciktisi DEGILDIR: RLS politikalari,
-- CHECK kisitlari ve SECURITY DEFINER fonksiyonu sema tanimindan uretilemez.
--
-- MULTI_TENANT_ARCHITECTURE 16.5: RLS politikalari tablolarla AYNI
-- migration'dadir. Tablo bir migration'da, politikasi digerinde olsaydi
-- arada kalan pencere KORUMASIZ BIR TABLO olurdu.

-- ===========================================================================
-- platform.tenants
-- ===========================================================================
CREATE TABLE platform.tenants (
  id             uuid        PRIMARY KEY,
  slug           text        NOT NULL,
  name           text        NOT NULL,
  status         text        NOT NULL,
  owner_user_id  uuid        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  archived_at    timestamptz,

  CONSTRAINT tenants_status_check
    CHECK (status IN ('provisioning', 'active', 'suspended', 'archived', 'failed')),

  -- Domain'deki tutarlilik invariant'inin veritabani karsiligi:
  -- status = 'archived'  <=>  archived_at IS NOT NULL
  -- Iki yon de zorlanir. Yalnizca birini zorlamak, arsivden geri alinmis ama
  -- archived_at temizlenmemis bir satiri kabul etmek demektir.
  CONSTRAINT tenants_archived_at_consistency
    CHECK ((status = 'archived') = (archived_at IS NOT NULL)),

  CONSTRAINT tenants_archived_at_after_created
    CHECK (archived_at IS NULL OR archived_at >= created_at)
);
--> statement-breakpoint

-- Slug GLOBAL TEKILDIR. Tekilligin gercek garantisi burasidir; uygulamadaki
-- existsBySlug yalnizca nezaket kontroludur — "once kontrol et sonra yaz"
-- bir yaris kosuludur (ADR-0016).
CREATE UNIQUE INDEX tenants_slug_key ON platform.tenants (slug);
--> statement-breakpoint
CREATE INDEX tenants_owner_user_id_idx ON platform.tenants (owner_user_id);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- platform.tenants — RLS
--
-- DIKKAT: bu tabloda FORCE ROW LEVEL SECURITY BILINCLI OLARAK YOKTUR.
-- Diger tum tenant-scoped tablolarda FORCE ZORUNLUDUR (12.2); burasi
-- istisnadir ve sebebi asagidaki resolve_tenant fonksiyonudur.
--
-- FORCE, politikalari TABLO SAHIBI icin de uygular. Uygulanmis olsaydi
-- SECURITY DEFINER fonksiyonu da (sahip olarak calisir) politikaya takilir ve
-- tenant resolution IMKANSIZ hale gelirdi.
--
-- Guvenlik acisindan kayip SINIRLIDIR: uygulama zaten tablo sahibi OLMAYAN
-- businessos_app rolu ile baglanir, dolayisiyla politika uygulamaya TAM
-- OLARAK uygulanir. FORCE yalnizca "uygulama sahip rolle baglanirsa" senaryosu
-- icin ek katman olurdu — ve o senaryo ayrica yasak ve TEST EDILIYOR
-- (12.6 madde 5). platform.memberships dahil diger tum tablolarda FORCE durur.
-- ---------------------------------------------------------------------------
ALTER TABLE platform.tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Bir tenant yalnizca KENDI satirini gorur ve yazar (12.4).
-- current_setting'de missing_ok KULLANILMAZ: context kurulmamissa sorgu
-- SESSIZCE BOS DONMEZ, HATA VERIR (12.6 madde 4). Sessiz bos sonuc, hatayi
-- uretimde aylarca gizler.
CREATE POLICY tenant_self_isolation ON platform.tenants
  USING      (id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- platform.resolve_tenant — tenant resolution icin KONTROLLU RLS asimi
--
-- Neden gerekli: MULTI_TENANT_ARCHITECTURE 8.2'deki cozum zinciri, tenant
-- context'i KURULMADAN once slug'i tenant'a cevirmek zorundadir. Context'i
-- kuracak olan sorgu, context'e dayanamaz — dairesel bir bagimlilik.
--
-- Neden guvenli: asim bir FONKSIYON IMZASINDA toplanmistir.
--   * Yalnizca (id, status) doner — ad, sahip, plan veya baska hicbir alan yok.
--   * Tek bir slug alir; LISTELEME YAPILAMAZ. `findAll` yazmak imkansizdir.
--   * STABLE ve salt-okunur; hicbir sey degistirmez.
--   * search_path sabitlenmistir — SECURITY DEFINER fonksiyonlarinda
--     search_path zehirlenmesi bilinen bir saldiri yoludur.
--
-- Donen tenant bir IPUCUDUR, yetki kaynagi DEGILDIR: erisim karari daima
-- dogrulanmis JWT claim'i ile verilir (ADR-0015).
-- ---------------------------------------------------------------------------
CREATE FUNCTION platform.resolve_tenant(p_slug text)
RETURNS TABLE (tenant_id uuid, tenant_status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = platform, pg_temp
AS $$
  SELECT t.id, t.status
  FROM platform.tenants t
  WHERE t.slug = p_slug;
$$;
--> statement-breakpoint

-- Varsayilan olarak herkese EXECUTE verilir; once geri alinir.
REVOKE ALL ON FUNCTION platform.resolve_tenant(text) FROM PUBLIC;
--> statement-breakpoint

-- ===========================================================================
-- platform.memberships
-- ===========================================================================
CREATE TABLE platform.memberships (
  id          uuid        PRIMARY KEY,
  tenant_id   uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,
  user_id     uuid        NOT NULL,
  role        text        NOT NULL,
  status      text        NOT NULL,
  joined_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT memberships_role_check
    CHECK (role IN ('owner', 'admin', 'member', 'viewer')),

  CONSTRAINT memberships_status_check
    CHECK (status IN ('invited', 'active', 'suspended', 'revoked')),

  -- Domain'deki joinedAt invariant'inin karsiligi:
  --   invited            -> joined_at BOS olmali (henuz katilmadi)
  --   active | suspended -> joined_at DOLU olmali
  --   revoked            -> ikisi de gecerli; davet asamasinda mi aktifken mi
  --                         iptal edildigi belirsizdir ve BILINCLI olarak
  --                         zorlanmaz. Zorlanirsa gercek senaryolardan biri
  --                         reddedilirdi.
  CONSTRAINT memberships_joined_at_consistency CHECK (
    (status = 'invited'                    AND joined_at IS NULL)     OR
    (status IN ('active', 'suspended')     AND joined_at IS NOT NULL) OR
    (status = 'revoked')
  )
);
--> statement-breakpoint

-- Tenant-scoped tekillik (12.3): UNIQUE(user_id) DEGIL.
-- Global tekil olsaydi bir tenant'in uyeligi digerinin yazmasini engeller ve
-- o kullanicinin platformda var oldugunu SIZDIRIRDI.
CREATE UNIQUE INDEX memberships_tenant_id_user_id_key
  ON platform.memberships (tenant_id, user_id);
--> statement-breakpoint
CREATE INDEX memberships_tenant_id_idx ON platform.memberships (tenant_id);
--> statement-breakpoint
CREATE INDEX memberships_user_id_idx ON platform.memberships (user_id);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- platform.memberships — RLS (12.2 STANDART SABLONU, sapma yok)
-- ---------------------------------------------------------------------------
ALTER TABLE platform.memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform.memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- USING okumayi, WITH CHECK yazmayi korur. IKISI DE ZORUNLUDUR: WITH CHECK
-- olmadan bir kullanici kendi satirinin tenant_id'sini BASKA bir tenant'a
-- tasiyabilir — sizintinin tersi, ama ayni derecede yikici.
CREATE POLICY tenant_isolation ON platform.memberships
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

-- ===========================================================================
-- Uygulama rolune yetkiler
--
-- 0000_init DEFAULT PRIVILEGES tanimladi; ama o yalnizca migration rolu
-- tablolari olusturdugunda ve rol O ANDA mevcutsa isler. Burada acikca
-- veriyoruz ki rol sonradan olusturulmus ortamlarda da dogru calissin.
-- DDL yetkisi ASLA verilmez (ARCHITECTURE 3.3).
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON platform.tenants     TO businessos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON platform.memberships TO businessos_app;
    GRANT EXECUTE ON FUNCTION platform.resolve_tenant(text)      TO businessos_app;
  END IF;
END
$$;
