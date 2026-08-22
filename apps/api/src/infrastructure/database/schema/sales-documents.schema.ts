import {
  type AnyPgColumn,
  check,
  date,
  index,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { invoicingSchema } from './invoicing-schema.schema';
import { tenants } from './tenants.schema';

/**
 * `invoicing.sales_documents` — TEKLIF ve FATURA TASLAGI, TEK TABLO
 * (ADR-0041 §1, §1.1).
 *
 * ============================================================================
 * ⚠️ TEK TABLO + `kind` — emsal ADR-0034 §5, ama risk ZAYIF
 * ============================================================================
 * Gelir/gider tek `finance.transactions`ta yasar ve `direction` ile ayrilir;
 * ayni sekil ikinci kez. Iki ayri tablo (`quotes` + `invoices`) REDDEDILDI:
 * bedeli iki satir tablosu, iki durum makinesi, iki degistirilemezlik zorlamasi
 * ve tablolar arasi bir donusturme olurdu — karsiliginda onlenen tek sey
 * `kind` filtresini unutma riski.
 *
 * ⚠️ O riskin SEKLI karari belirledi:
 *
 *     `direction` unutulur -> SESSIZ, makul gorunen YANLIS BIR SAYI
 *     `kind` unutulur      -> yanlis listede satir; ekranda DERHAL gorunur
 *
 * Yani ADR-0034 tek tabloyu DAHA TEHLIKELI bir durumda secti.
 *
 * ============================================================================
 * ⚠️ `total` KOLONU YOKTUR (§1.3) — projede ONUNCU kez ayni karar
 * ============================================================================
 * Ara toplam, vergi ve genel toplam HER OKUMADA kalemlerden hesaplanir
 * (`domain/document-totals.ts`). "Gonderilmis belgenin toplami dondurulmali"
 * itirazinin cevabi bir kolon DEGIL, degistirilemezliktir (§2): kaynak
 * degismiyorsa turetilen deger de degismez. Donduran sey bir KOPYA degil BIR
 * KISITTIR.
 *
 * ============================================================================
 * ⚠️ `embedding` KOLONU DA YOKTUR (§5) — Faz 5'te BIR ILK
 * ============================================================================
 * Sekiz modulun sekizi de vektor tasiyordu. Bir teklif kalemi ADR-0034 §6.1'in
 * tarif ettigi seydir: yuzlerce neredeyse ozdes kisa vektor top-K havuzunu
 * kirletir. Bu modulun katkisi ANLAMSAL degil YAPISALDIR.
 */
export const salesDocuments = invoicingSchema.table(
  'sales_documents',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /** `'quote'` | `'invoice'` — CHECK kisiti migration `0031`'de. */
    kind: text('kind').notNull(),

    /**
     * ⚠️ TASLAKTA `null` (§1.6): numara belge DISARI CIKTIGI an uretilir.
     * Taslakta uretilseydi silinen her taslak bir numara YAKARDI.
     */
    number: text('number'),

    /** Gecerli kume `kind`'a BAGLI — CHECK migration'da. */
    status: text('status').notNull(),

    /**
     * ⚠️ CIPLAK `uuid`, FK YOK (§7.1): cross-schema FK yasak. Ad
     * `CompanyDirectory`den CALISMA ZAMANINDA cozulur; izin kapisi o arayuzun
     * icindedir.
     */
    companyId: uuid('company_id'),
    contactId: uuid('contact_id'),

    /**
     * ⚠️ DENORMALIZE — ve bu kuralin ISTISNASI DEGIL SINIRIDIR (§1.5).
     *
     * Denormalizasyon yasagi TURETILEBILIR bilgi icindir; gonderilmis bir
     * belgedeki ad turetilebilir DEGILDIR — o an DONDURULMUSTUR. Dizinden
     * okunsaydi gecmis belge GERIYE DONUK degisir ve musterinin elindeki
     * kagitla ayrisirdi.
     *
     * ⚠️ Sonucu: ayni ekranda IKI AD gorunebilir — belgeye BASILAN ad (bu
     * kolon) ve BUGUNKU musteri (`companyId` uzerinden dizinden). Bu bir kusur
     * degil, ayrimin ta kendisidir.
     */
    customerName: text('customer_name').notNull(),

    /** TAKVIM GUNU — projede BESINCI kez ayni karar. */
    issuedOn: date('issued_on').notNull(),

    /**
     * ⚠️ YALNIZCA teklif. "Suresi dolmus" bir DURUM DEGILDIR: her okumada
     * TURETILIR (`valid_until < today AND status = 'sent'`). Bir `expired`
     * durumu, onu yazacak zamanlanmis bir is gerektirirdi ve o is bir gun
     * kacirildiginda ekran SESSIZCE yanlis olurdu.
     */
    validUntil: date('valid_until'),

    /** ⚠️ YALNIZCA fatura. */
    dueOn: date('due_on'),

    /** ⚠️ BELGE BASINA TEK para birimi (§1.4) — satir basina DEGIL. */
    currency: text('currency').notNull(),

    /** ⚠️ EMBED EDILMEZ (§5): cogunlukla MATBU kosul metni. */
    notes: text('notes'),

    /**
     * ⚠️ Ok FATURA -> TEKLIF (§3). Tersi teklifi DEGISTIRMEK olurdu ve
     * donusturmenin butun vaadi "teklife tek kolon yazilmaz"dir.
     *
     * `restrict`: bir faturaya kaynaklik eden teklif SILINEMEZ.
     */
    convertedFromId: uuid('converted_from_id').references((): AnyPgColumn => salesDocuments.id, {
      onDelete: 'restrict',
    }),

    createdByUserId: uuid('created_by_user_id').notNull(),

    /**
     * ⚠️ AKTOR DAMGALARI — BIR DENETIM IZI DEGILDIR (§8.2).
     *
     * `platform/audit` bu iste ACILMADI: sorunun buyuk kismi §2 ile ortadan
     * kalkiyor (gonderilmis belgenin tutari degismez, yani "kim degistirdi"
     * diye bir soru yoktur). Geriye kalan DURUM GECISLERIDIR ve cevabi bu dort
     * kolondur — bir olay gunlugu degil, satirin uzerindeki DORT DAMGA.
     */
    sentAt: timestamp('sent_at', { withTimezone: true }),
    sentByUserId: uuid('sent_by_user_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedByUserId: uuid('decided_by_user_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('sales_documents_kind_valid', sql`${table.kind} IN ('quote', 'invoice')`),
    check('sales_documents_customer_name_not_blank', sql`btrim(${table.customerName}) <> ''`),
    check('sales_documents_currency_shape', sql`${table.currency} ~ '^[A-Z]{3}$'`),

    index('sales_documents_tenant_kind_issued_idx').on(table.tenantId, table.kind, table.issuedOn),
    index('sales_documents_tenant_kind_status_idx').on(table.tenantId, table.kind, table.status),

    /**
     * ⚠️ Migration'daki KISMI yuklem (`WHERE number IS NOT NULL`) burada
     * YOKTUR — `index.ts`in bas yorumundaki uyarinin somut ornegi: bu dosya
     * yalnizca TIP GUVENLIGI saglar, korumanin kaniti migration ve entegrasyon
     * testleridir.
     */
    uniqueIndex('sales_documents_tenant_kind_number_unique_idx').on(
      table.tenantId,
      table.kind,
      table.number,
    ),
  ],
);
