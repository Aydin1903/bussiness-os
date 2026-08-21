import { sql } from 'drizzle-orm';
import { check, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { supplierCompanies } from './suppliers.schema';
import { suppliersSchema } from './suppliers-schema.schema';
import { tenants } from './tenants.schema';

/**
 * `suppliers.contacts` — tedarikcideki kisi (ADR-0040 §1).
 *
 * `crm.contacts`in karsiligi, birebir. `supplierId` ZORUNLU ve entity'de
 * DEGISTIRILEMEZ: her kisi bir tedarikciye aittir (`Contact`in ayni karari).
 *
 * ============================================================================
 * ⚠️ `ON DELETE CASCADE` — VE BU BIR KVKK GIRDISIDIR (§1.3)
 * ============================================================================
 * Silinen bir tedarikcinin kisileri ve gorusmeleri ONUNLA BIRLIKTE gider ve
 * bunu VERITABANI garanti eder. Zincir sema icidir, yani FK MESRUDUR — Mutlak
 * Kural 5 CROSS-SCHEMA FK'yi yasaklar.
 *
 * ADR-0031 §7'nin YEDINCI uygulamasi ve ayni kanit: vektor bu semada oldugu
 * icin silinen bir tedarikci AI'IN HAFIZASINDAN DA silinir. Gorusmeler
 * `knowledge.notes`a yazilsaydi bu cascade YAZILAMAZDI.
 *
 * ⚠️ TABLO ADI `contacts`, degisken adi `supplierContacts`. Sema icinde ad
 * cakismasi yoktur (`suppliers.contacts` vs `crm.contacts`); cakisan sey
 * TypeScript export'udur — `crm.contacts` zaten `contacts` adiyla export
 * ediliyor ve iki farkli tablo tek kelimeyi paylasamaz.
 */
export const supplierContacts = suppliersSchema.table(
  'contacts',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => supplierCompanies.id, { onDelete: 'cascade' }),

    fullName: text('full_name').notNull(),
    title: text('title'),
    email: text('email'),
    phone: text('phone'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('supplier_contacts_full_name_not_blank', sql`btrim(${table.fullName}) <> ''`),

    /** "Bu tedarikcinin kisileri" — detay sayfasinin birincil sorgusu. */
    index('supplier_contacts_tenant_supplier_idx').on(table.tenantId, table.supplierId),
  ],
);
