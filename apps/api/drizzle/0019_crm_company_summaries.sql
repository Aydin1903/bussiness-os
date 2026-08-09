-- ===========================================================================
-- crm.company_summaries — musteri ozeti ONBELLEGI (ADR-0032)
-- ===========================================================================
--
-- DEVELOPMENT_RULES 6: elle yazildi, geri alinabilir (`.down.sql`).
--
-- ===========================================================================
-- BU BIR KUYRUK DEGIL, ONBELLEK — ve fark yapisaldir
-- ===========================================================================
-- `knowledge.daily_report_runs` bir KUYRUKTUR: satirlari zamanlayici yaratir,
-- bir worker claim eder, `attempt_count`/`next_attempt_at`/`dead_lettered_at`
-- ile yeniden dener. Bu tabloda o kolonlarin HICBIRI yoktur ve bu bilinclidir.
--
-- Ozet ISTEK UZERINE uretilir (ADR-0032 §1). Cagiran bir insandir ve
-- oradadir: cagri coktugunde 502 gorur, isterse tekrar dener. Yeniden deneme
-- mekanizmasi kurmak, kullanicinin ZATEN yaptigi seyi altyapiya tasimak
-- olurdu.
--
-- Bunun ikinci ve daha onemli sonucu: WORKER OLMADIGI ICIN RLS ASIM YUZEYI
-- HIC DOGMUYOR. `0012` bir BYPASSRLS rolu ve iki `SECURITY DEFINER` fonksiyon
-- getirmisti (dosyanin kendisi bunu "asim yuzeyi" diye ayirmisti). Burada
-- ne yeni rol var, ne fonksiyon, ne `GRANT EXECUTE`. Her sorgu cagiranin
-- tenant baglamindaki normal transaction'da calisir.
--
-- ===========================================================================
-- `company_id` PRIMARY KEY — bir sirketin BIR ozeti vardir
-- ===========================================================================
-- Ayri bir `id` kolonu + `UNIQUE (company_id)` de ayni seyi saglardi ama
-- yanlis bir sey soylerdi: "ozetler bir koleksiyondur, sirket basina bir
-- tanesi var". Dogrusu tersi — bu tablo sirketin TURETILMIS bir alanidir,
-- kendi kimligi olan bir varlik degil.
--
-- Pratik sonucu: `ON DELETE CASCADE` ile silinen musterinin ozeti de gider.
-- ADR-0031'in `interactions` icin verdigi gerekcenin aynisi — silinen bir
-- musteri AI'in hafizasinda YASAMAYA DEVAM ETMEZ.
-- ===========================================================================

CREATE TABLE crm.company_summaries (
  company_id       uuid        PRIMARY KEY REFERENCES crm.companies (id) ON DELETE CASCADE,

  tenant_id        uuid        NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,

  -- AI ozeti. Claim alinip da uretim bitmeden once NULL olabilir.
  summary          text,

  -- =========================================================================
  -- ISRAF FRENI (ADR-0032 §2)
  -- =========================================================================
  -- Ozetin NEYDEN uretildigini tanimlayan opak imza. POST geldiginde bugunku
  -- imza hesaplanir; saklanan ile AYNIYSA model CAGRILMAZ ve mevcut ozet
  -- doner. "Yenile"ye ust uste basmak para harcamaz.
  --
  -- Bicim (`text`, cunku sekli SQL'e sizmamali ve degisebilmeli):
  --   {gorusme}:{maxGorusmeCreatedAt}:{firsat}:{maxFirsatUpdatedAt}:{kisi}:{sirketUpdatedAt}
  --
  -- SAYI VE ZAMAN BIRLIKTE, cunku ikisi farkli degisimi yakalar:
  --   - silme  -> sayi duser, en buyuk zaman damgasi DEGISMEZ
  --   - guncelleme -> sayi ayni kalir, zaman damgasi ILERLER
  -- Yalnizca birini tutmak, digerini sessizce gormezden gelmek olurdu.
  --
  -- NULL olabilir: satir claim ile aciliyor olabilir ve henuz ozet yok.
  source_watermark text,

  -- Dolu ise ozet URETILDI. Ayri bir `status` kolonu YOKTUR — durum zaman
  -- alanlarindan turer (`platform.outbox` ve `daily_report_runs` ile ayni
  -- disiplin: iki dogruluk kaynagi birbirini yalanlar).
  generated_at     timestamptz,

  -- =========================================================================
  -- ESZAMANLILIK CLAIM'I (ADR-0032 §3)
  -- =========================================================================
  -- Uretim SURUYOR isareti. Ikinci bir POST bu satiri claim EDEMEZ ve 409
  -- alir; iki kullanici ayni anda "ozet cikar" dediginde model IKI KEZ
  -- cagrilmaz.
  --
  -- Neden zaman damgasi, neden boolean degil: coken bir istek `true` biraksa
  -- satir SONSUZA KADAR kilitlenirdi ve elle mudahale gerekirdi. Zaman
  -- damgasiyla claim kendiliginden bayatlar (uygulama tarafinda iki dakika).
  -- `SKIP LOCKED` burada ise yaramaz — o, ayni anda calisan transaction'lar
  -- icindir; buradaki catisma AYRI ISTEKLER arasindadir ve LLM cagrisi
  -- boyunca transaction acik TUTULMAZ.
  generating_at    timestamptz,

  created_at       timestamptz NOT NULL DEFAULT now(),

  -- Uretilmis bir ozetin metni olmak ZORUNDA; bos metinli "basarili" ozet
  -- sessiz bir hatadir (`daily_report_runs` ile ayni kisit).
  CONSTRAINT company_summaries_summary_when_generated
    CHECK (generated_at IS NULL OR (summary IS NOT NULL AND length(btrim(summary)) > 0)),

  -- Uretilmis bir ozetin NEYDEN uretildigi de bilinmek ZORUNDA; imzasiz bir
  -- ozet israf frenini calistiramaz ve her istekte yeniden uretilirdi.
  CONSTRAINT company_summaries_watermark_when_generated
    CHECK (generated_at IS NULL OR source_watermark IS NOT NULL)
);
--> statement-breakpoint

-- Tek erisim deseni "bu sirketin ozeti" ve o PK'dir. Tenant bazli TARAMA
-- yoktur (liste ucu yok, worker yok), bu yuzden `tenant_id` uzerinde AYRI
-- index ACILMADI — yazilmayan sorgu icin index tutmak, her INSERT/UPDATE'e
-- bedel bindirmektir.

-- ===========================================================================
-- RLS — STANDART SABLON (MT §12.2). SAPMA YOK.
-- ===========================================================================
ALTER TABLE crm.company_summaries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE crm.company_summaries FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_isolation ON crm.company_summaries
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON crm.company_summaries TO businessos_app;
  END IF;
END
$$;
