import { sql } from 'drizzle-orm';
import { check, integer, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { invoicingSchema } from './invoicing-schema.schema';
import { tenants } from './tenants.schema';

/**
 * `invoicing.number_sequences` — belge numarasi sayaci (ADR-0041 §1.6).
 *
 * ============================================================================
 * ⚠️ TURETME BURADA REDDEDILDI — VE BU, §1.3'UN TAM TERSI BIR KARARDIR
 * ============================================================================
 * Bu proje turetmeyi ONUNCU kez secti (toplamlar, stok miktari, durgunluk...).
 * Numara icin SECMEDI, cunku olcut degil VERININ SEKLI farkli:
 *
 *     `max(number) + 1`  -> ⚠️ silinen bir taslaktan sonra numarayi YENIDEN
 *                           KULLANIR. Iki belge zaman icinde ayni numarayi
 *                           tasir; musteri ikisini de elinde tutar ve hata
 *                           BIZIM GOREMEDIGIMIZ yerde ortaya cikar.
 *     sayac tablosu      -> numara BIR KEZ verilir ve geri alinmaz. Bosluk
 *                           olusabilir (iptal edilen bir kesim) ve BU DOGRUDUR:
 *                           bosluk GORUNUR, tekrar GORUNMEZ.
 *
 * ⚠️ Sayac `SELECT ... FOR UPDATE` ile okunur — ADR-0039 §3.2'nin fiziksel
 * sayim kilidinin IKINCI uygulamasi. Iki es zamanli `issue` istegi ayni
 * numarayi alamaz; kilit DEKORATIF DEGILDIR.
 *
 * ============================================================================
 * ⚠️ RETENTION LISTESINE GIRMEZ
 * ============================================================================
 * Tenant + tur basina IKI SATIR, ebediyen. Yil numaranin ICINDE YOKTUR
 * (belgenin tarihi zaten `issued_on`da), yani sayac YILA GORE DE COGALMAZ.
 *
 * ROADMAP §8.5'in kendi olcutu — _"borcu doguran sey satirin ZAMANLA
 * COGALMASIDIR"_ — ADR-0040'in kapanis denetiminde ogrenildigi gibi ILK GUNDEN
 * uygulandi: borcu OLDUGUNDAN BUYUK gostermemek.
 */
export const invoicingNumberSequences = invoicingSchema.table(
  'number_sequences',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /** `'quote'` | `'invoice'` — iki sayac BAGIMSIZDIR. */
    kind: text('kind').notNull(),

    /** ⚠️ GERI ALINMAZ: iptal edilen bir kesim numarasini geri vermez. */
    nextValue: integer('next_value').notNull().default(1),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'number_sequences_pkey', columns: [table.tenantId, table.kind] }),
    check('number_sequences_kind_valid', sql`${table.kind} IN ('quote', 'invoice')`),
    check('number_sequences_next_value_positive', sql`${table.nextValue} > 0`),
  ],
);
