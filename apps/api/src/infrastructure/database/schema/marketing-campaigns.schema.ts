import { sql } from 'drizzle-orm';
import { check, date, index, text, timestamp, uuid, vector } from 'drizzle-orm/pg-core';

import { marketingSchema } from './marketing-schema.schema';
import { tenants } from './tenants.schema';

/**
 * `marketing.campaigns` — kampanya kaydi (ADR-0047 §1, §2).
 *
 * ============================================================================
 * ⚠️ TAM DUZENLENEBILIR — `done` DAHIL (ADR-0047 §2)
 * ============================================================================
 * Projede degistirilebilirligin BES sekli var; bu, BIRINCISININ tekrari
 * (`finance.transactions`). Uc olcut de "hayir" dedi:
 *
 *   1. Bugunku bir sayi bu kayitlardan TURETILIYOR mu?  -> HAYIR (ROI yok)
 *   2. Kayit SIRKETTEN CIKTI mi?                        -> HAYIR (gonderim yok)
 *   3. Kayit BASKA BIRININ SOZU mu?                     -> HAYIR (kendi verimiz)
 *
 * ⚠️ Asil gerekce dorduncusudur: `done`da KILITLEMEK DURUMU YALAN SOYLETIRDI.
 * Sonuc notu tanimi geregi kampanya BITTIKTEN SONRA yazilir; kilit olsaydi
 * kullanici ya kampanyayi yapay olarak `active` tutardi ya sonucu hic yazmazdi.
 *
 * ============================================================================
 * ⚠️ CHUNK TABLOSU YOK — birlesik olcut, DORDUNCU kez (ADR-0047 §1.3)
 * ============================================================================
 * ADR-0035 §3 + ADR-0037 §3 + ADR-0040 §1 + ADR-0045 §1.2'nin birlikte
 * urettigi kural: _chunk tablosu, metnin ust sinirini KULLANICI degil VERININ
 * KENDISI belirliyorsa acilir._ Sonuc notunun ust sinirini BIZ koyariz
 * (`MAX_CAMPAIGN_RESULT_NOTE_CHARS` = `TARGET_CHUNK_CHARS`).
 *
 * ⚠️ `updated_at` VAR — ve bu, `feedback.responses`in TAM TERSI bir karar.
 * Orada kolon BILEREK konmamisti; burada yol GERCEKTEN VAR. Ayni olcutun iki
 * farkli cevabi.
 */
export const marketingCampaigns = marketingSchema.table(
  'campaigns',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    name: text('name').notNull(),

    /**
     * ⚠️ SERBEST METIN — ADR-0045 §1.5'in AYNI karari, ikinci kez.
     *
     * Bedeli yazili: `"instagram"` ve `"Instagram"` IKI AYRI degerdir
     * (ADR-0039'un `kg`/`Kg` varyanti, UCUNCU kez) ve kanala gore gruplama
     * GUVENILMEZDIR. Kanal bir ETIKETTIR, bir boyut degil.
     */
    channel: text('channel'),

    /**
     * ⚠️ `date`, `timestamptz` DEGIL (ADR-0047 §1.5).
     *
     * Bir randevu bir ANDIR; bir kampanyanin SAATI YOKTUR. `timestamptz`
     * secmek OLMAYAN BIR BILGIYI UYDURMAK olurdu ve ADR-0035'in "tenant bazli
     * saat dilimi YOK" siniri bu module SIZARDI.
     */
    startsOn: date('starts_on').notNull(),

    /** ⚠️ `null` = SURESIZ kampanya — gercek bir durum (surekli Google Ads). */
    endsOn: date('ends_on'),

    /**
     * ⚠️ SABIT ENUM — `channel`in TAM TERSI. `channel`in degerleri TENANT'A
     * GORE degisir; `status`un degerleri IS MANTIGINI SURER.
     *
     * ⚠️ Zod ile SENKRON kalmak zorundadir; CHECK uygulamayi ATLAYAN yollari
     * da baglar (`appointments_status_valid` ile ayni karar).
     */
    status: text('status').notNull().default('draft'),

    /** ⚠️ OPSIYONEL; vektor YALNIZCA bu alan VARSA uretilir (§3.1). */
    resultNote: text('result_note'),

    /**
     * ⚠️ HEDEF KITLE DEGILDIR (ADR-0047 §6.2).
     *
     * Bir kampanyanin hedef kitlesi bir KUMEdir ve CRM'de `segment` diye bir
     * kavram YOKTUR. Bu kolon dar bir seyi soyler: _"bu kampanya TEK bir
     * hesaba ozeldi"_. FK YOK (Mutlak Kural 5), `null` YAYGIN DURUM.
     */
    crmCompanyId: uuid('crm_company_id'),

    /** ⚠️ Satirin kendi kolonu — ONUNCU vektor tablosu. */
    embedding: vector('embedding', { dimensions: 1536 }),

    createdByUserId: uuid('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('campaigns_name_not_blank', sql`btrim(${table.name}) <> ''`),
    check('campaigns_status_valid', sql`${table.status} IN ('draft', 'active', 'done')`),
    check(
      'campaigns_dates_ordered',
      sql`${table.endsOn} IS NULL OR ${table.endsOn} >= ${table.startsOn}`,
    ),
    check(
      'campaigns_result_note_not_blank',
      sql`${table.resultNote} IS NULL OR btrim(${table.resultNote}) <> ''`,
    ),
    check(
      'campaigns_channel_not_blank',
      sql`${table.channel} IS NULL OR btrim(${table.channel}) <> ''`,
    ),
    check('campaigns_updated_after_created', sql`${table.updatedAt} >= ${table.createdAt}`),
    index('campaigns_tenant_starts_idx').on(table.tenantId, table.startsOn.desc()),
  ],
);
