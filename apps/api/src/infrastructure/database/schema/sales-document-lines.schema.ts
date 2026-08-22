import { sql } from 'drizzle-orm';
import { check, integer, numeric, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { invoicingSchema } from './invoicing-schema.schema';
import { salesDocuments } from './sales-documents.schema';
import { tenants } from './tenants.schema';

/**
 * `invoicing.sales_document_lines` — belgenin satir kalemleri (ADR-0041 §1).
 *
 * ============================================================================
 * ⚠️ TOPLAM KOLONU YOKTUR — ne satirda ne baslikta (§1.3)
 * ============================================================================
 * `lineTotal` diye bir kolon ARANMASIN. Satir toplami da belge toplami da
 * `domain/document-totals.ts`te BigInt aritmetigiyle turetilir.
 *
 * ============================================================================
 * ⚠️ BU TABLO BIR TRIGGER ILE KORUNUYOR (§2) — ve ucuncu katman SART
 * ============================================================================
 * `sales_document_lines_immutable_after_send`: ebeveyn belge `draft` degilse
 * `INSERT`/`UPDATE`/`DELETE` VERITABANI seviyesinde reddedilir.
 *
 * Neden sart: KALEMLER AYRI BIR TABLODADIR, yani baslik uzerindeki bir kontrol
 * onlari KAPSAMAZ. Tek bir yeni yazma yolu (bir toplu duzenleme, bir goc
 * betigi) kontrolu atlarsa hata SESSIZ olur — gonderilmis bir belgenin toplami
 * degisir ve kimse fark etmez.
 *
 * ⚠️ Drizzle sema tanimi trigger'i TEMSIL ETMEZ; kaniti migration `0031` ve
 * entegrasyon testidir.
 */
export const salesDocumentLines = invoicingSchema.table(
  'sales_document_lines',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /** `cascade`: belgesiz bir satir ANLAMSIZDIR. Sema ici FK — mesru. */
    documentId: uuid('document_id')
      .notNull()
      .references(() => salesDocuments.id, { onDelete: 'cascade' }),

    /**
     * Kullanicinin verdigi SIRA.
     *
     * ⚠️ `createdAt`e birakilamaz: ayni islemde yazilan satirlar ayni ani tasir
     * ve belgede satirlarin sirasi KULLANICI ICIN anlamlidir.
     */
    position: integer('position').notNull(),

    /**
     * ⚠️ SERBEST METIN — stok kalemine BAGLI DEGIL (§7.3).
     *
     * `stockItemId` diye bir alan ARANMASIN: aday degerlendirildi ve
     * reddedildi. Baglantinin dogal beklentisi STOK DUSULMESIDIR ve o, bu
     * modulun envanterin dogrulugundan sorumlu olmasi demektir; fiyat zaten
     * `inventory`de yoktur; zorunlu kilinsaydi SAHTE KALEM uretirdi (bir
     * danismanlik saati bir stok kalemi degildir).
     */
    description: text('description').notNull(),

    /** ⚠️ HER ZAMAN POZITIF. JS'te `string` kalir (`quantity.ts` karari). */
    quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull(),

    /** Serbest metin — `inventory.items.unit` ile ayni karar. */
    unit: text('unit'),

    /**
     * ⚠️ ISARET KISITI YOK (§1.7): negatif birim fiyat bir ISKONTO SATIRIDIR.
     *
     * ADR-0034 §5'in reddettigi sey bu degildir — orada isaret bir ANLAM
     * EKSENI tasiyordu (gelir mi gider mi). Burada yalnizca ARITMETIKTIR ve
     * sonucu belgenin uzerinde YAZILIDIR.
     */
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),

    /**
     * ⚠️ BIR SAYIDIR, BIR KURAL DEGIL (§1.8).
     *
     * Sistem hicbir vergi kurali bilmez: muafiyet, tevkifat, ulke bazli oran —
     * hicbiri yoktur. Oran kullanicinin yazdigi bir sayidir; sistem CARPAR.
     */
    taxRate: numeric('tax_rate', { precision: 5, scale: 2 }).notNull().default('0'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('sales_document_lines_description_not_blank', sql`btrim(${table.description}) <> ''`),
    check('sales_document_lines_quantity_positive', sql`${table.quantity} > 0`),
    check('sales_document_lines_position_positive', sql`${table.position} > 0`),
    check(
      'sales_document_lines_tax_rate_range',
      sql`${table.taxRate} >= 0 AND ${table.taxRate} <= 100`,
    ),

    uniqueIndex('sales_document_lines_document_position_unique_idx').on(
      table.tenantId,
      table.documentId,
      table.position,
    ),
  ],
);
