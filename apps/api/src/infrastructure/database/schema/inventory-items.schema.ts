import { sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

import { inventorySchema } from './inventory-schema.schema';
import { tenants } from './tenants.schema';

/**
 * `inventory.items` — bir stok kaleminin TANIMI (ADR-0039 §1).
 *
 * ============================================================================
 * ⚠️ BU TABLODA MIKTAR KOLONU YOKTUR — VE BU, MODULUN MERKEZI KARARIDIR
 * ============================================================================
 * Mevcut miktar `inventory.movements`tan HER OKUMADA turetilir (ADR-0039 §2).
 * Bir `quantity_on_hand` kolonu ikinci bir dogruluk kaynagi olurdu ve onu
 * guncellemeyi unutan bir yazma yolu SESSIZ ve MAKUL GORUNEN yanlis bir sayi
 * uretirdi.
 *
 * ⚠️ Biri "performans icin" bu tabloya bir miktar kolonu eklemek isterse:
 * karar ADR-0039 §2.2'de uc argumanla yazilidir ve yon TEKTIR — turetmeden
 * ONBELLEGE gecmek her zaman mumkun, tersi degil.
 *
 * ============================================================================
 * ⚠️ CHUNK TABLOSU YOK — VEKTOR AYNI SATIRDA (ADR-0039 §5)
 * ============================================================================
 * `appointments.appointments` ile ayni sinif, ikinci kez. Kural iki ADR'nin
 * birlikte urettigi olcuttur: chunk tablosu, metnin ust sinirini KULLANICI
 * degil VERININ KENDISI belirliyorsa acilir. Stok notu ("parti no X") bir
 * kimlik notudur; sinirini biz koyariz.
 *
 * ⚠️ `embedding` NULLABLE ve bu NORMALDIR: notsuz kalem cok yaygindir.
 */
export const inventoryItems = inventorySchema.table(
  'items',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    name: text('name').notNull(),

    /** ⚠️ Tekillik `lower(sku)` uzerinde — `ABC-1` ile `abc-1` AYNI kalemdir. */
    sku: text('sku'),

    /** SERBEST METIN: enum de tenant sozlugu de degil (ADR-0039 §4). */
    unit: text('unit').notNull(),

    /**
     * ⚠️ `NULL` ile `0` FARKLI SEYLERDIR: `NULL` = izleme yok, `0` = tukendiginde
     * haber ver. Ikisi de anlamlidir (ADR-0039 §6.1).
     */
    minQuantity: numeric('min_quantity', { precision: 14, scale: 3 }),

    /** ⚠️ Ust sinir DOMAINDE zorlanir; asilirsa 422 — sessiz kirpma YASAK. */
    note: text('note'),

    /** 1536 = `text-embedding-3-small` cikti boyutu. */
    embedding: vector('embedding', { dimensions: 1536 }),

    /** Hareketi olan kalem SILINEMEZ, arsivlenir (ADR-0039 §3.4). */
    archivedAt: timestamp('archived_at', { withTimezone: true }),

    /** ⚠️ Yalnizca OLUSTURANI tutar; degisiklik denetim izi DEGILDIR. */
    createdByUserId: uuid('created_by_user_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('items_name_not_blank', sql`btrim(${table.name}) <> ''`),
    check('items_unit_not_blank', sql`btrim(${table.unit}) <> ''`),
    check('items_sku_not_blank', sql`${table.sku} IS NULL OR btrim(${table.sku}) <> ''`),
    check('items_note_not_blank', sql`${table.note} IS NULL OR btrim(${table.note}) <> ''`),
    check(
      'items_min_quantity_not_negative',
      sql`${table.minQuantity} IS NULL OR ${table.minQuantity} >= 0`,
    ),

    index('items_tenant_name_idx').on(table.tenantId, table.name),
    /**
     * ⚠️ IFADE INDEX'I (`lower(sku)`) — Drizzle bunu tip olarak temsil eder ama
     * migration'daki KISMI yuklem (`WHERE sku IS NOT NULL`) burada YOKTUR.
     * `index.ts`in bas yorumundaki uyarinin somut bir ornegi: bu dosya yalnizca
     * TIP GUVENLIGI saglar, korumanin kaniti migration ve entegrasyon
     * testleridir.
     */
    uniqueIndex('items_tenant_sku_unique_idx').on(table.tenantId, sql`lower(${table.sku})`),
    index('items_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
  ],
);
