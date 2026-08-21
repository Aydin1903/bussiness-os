import { sql } from 'drizzle-orm';
import { check, index, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { suppliersSchema } from './suppliers-schema.schema';
import { tenants } from './tenants.schema';

/**
 * `suppliers.suppliers` — tedarikci firmasi (ADR-0040 §1).
 *
 * `crm.companies`in karsiligi: ROADMAP §3.5'in _"CRM deseninin ucuz tekrari —
 * ayni sekil, TERS YON (satin alma)"_ tanimi.
 *
 * ============================================================================
 * ⚠️ "TERS YON"UN SOMUT KARSILIGI: FIRSAT/PIPELINE YOKTUR (ADR-0040 §2.1)
 * ============================================================================
 * CRM'in `opportunities` tablosunun bu modulde bir karsiligi ACILMAZ. Bir satis
 * hattinin var olma sebebi BELIRSIZ BIR GELIRIN asamalar boyunca ilerlemesidir;
 * satin alma tarafinda belirsizlik tedarikcide degil SIPARISTEDIR ve siparis
 * kapsam disidir (§9).
 *
 * ⚠️ Bunun dogrudan sonucu: bu modulun YAPISAL KATKICISI YOKTUR. CRM'in
 * `crm-pipeline` katkicisi tam olarak o tablodan besleniyordu.
 *
 * ============================================================================
 * ⚠️ AD TEKIL DEGIL, VERGI NUMARASI TEKIL (§1.1)
 * ============================================================================
 * Tekillik `lower(tax_number)` uzerindedir — `inventory.items.sku` deseninin
 * IKINCI uygulamasi. Ayni tuzel kisi icin iki satir acilmasi GORUSME GECMISINI
 * ve dolayisiyla AI'IN HAFIZASINI ikiye bolerdi; hata sessizdir.
 */
export const supplierCompanies = suppliersSchema.table(
  'suppliers',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    name: text('name').notNull(),

    /** ⚠️ Tekillik `lower(tax_number)` uzerinde — ayni tuzel kisi TEK satirdir. */
    taxNumber: text('tax_number'),

    /** Serbest metin — `crm.companies.industry`nin karsiligi. */
    category: text('category'),

    email: text('email'),
    phone: text('phone'),
    website: text('website'),
    address: text('address'),

    /**
     * ⚠️ SERBEST METIN: enum de tenant sozlugu de degil (ADR-0040 §1.2).
     *
     * Kolon HICBIR KISIT TASIMAZ — ne filtrelenir ne hesaplanir, yalnizca
     * okunur. Bunun sonucu bir eksiklik degil bir KARARDIR: vade
     * SORGULANAMAZ, dolayisiyla "odeme vadesi yaklasan" bir yapisal katkici
     * YAZILAMAZ (§3.2). Serbest metinden vade cikarmak sessiz hata uretirdi.
     */
    paymentTerms: text('payment_terms'),

    /** ⚠️ Yalnizca OLUSTURANI tutar; degisiklik denetim izi DEGILDIR. */
    createdByUserId: uuid('created_by_user_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('suppliers_name_not_blank', sql`btrim(${table.name}) <> ''`),
    check(
      'suppliers_tax_number_not_blank',
      sql`${table.taxNumber} IS NULL OR btrim(${table.taxNumber}) <> ''`,
    ),
    check(
      'suppliers_payment_terms_not_blank',
      sql`${table.paymentTerms} IS NULL OR btrim(${table.paymentTerms}) <> ''`,
    ),

    index('suppliers_tenant_name_idx').on(table.tenantId, table.name),

    /**
     * ⚠️ IFADE INDEX'I (`lower(tax_number)`) — Drizzle bunu tip olarak temsil
     * eder ama migration'daki KISMI yuklem (`WHERE tax_number IS NOT NULL`)
     * burada YOKTUR. `index.ts`in bas yorumundaki uyarinin somut bir ornegi:
     * bu dosya yalnizca TIP GUVENLIGI saglar, korumanin kaniti migration ve
     * entegrasyon testleridir.
     */
    uniqueIndex('suppliers_tenant_tax_number_unique_idx').on(
      table.tenantId,
      sql`lower(${table.taxNumber})`,
    ),
  ],
);
