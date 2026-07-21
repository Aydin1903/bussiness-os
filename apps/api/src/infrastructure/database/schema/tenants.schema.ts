import { index, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { platformSchema } from './platform.schema';

/**
 * `platform.tenants` — tenant kayitlarinin tablosu (ADR-0012).
 *
 * BU TABLO TENANT-SCOPED DEGILDIR: tenant'in KENDISIDIR, dolayisiyla
 * `tenant_id` kolonu tasimaz. MULTI_TENANT_ARCHITECTURE 12.4'teki platform
 * tablolari istisna listesindedir ve standart `tenant_id = current_setting(...)`
 * politikasi yerine `id = current_setting(...)` politikasina tabidir.
 *
 * RLS politikalari ve CHECK kisitlari BURADA DEGIL, elle yazilan migration'da
 * tanimlidir (`drizzle/0001_tenant_tables.sql`): Drizzle sema tanimi RLS
 * uretemez ve DEVELOPMENT_RULES 6 migration'larin elle yazilmasini sart kosar.
 * Bu dosya yalnizca TIP GUVENLIGI icindir.
 */
export const tenants = platformSchema.table(
  'tenants',
  {
    /** UUIDv7 — uygulama tarafindan uretilir, veritabani default'u YOKTUR. */
    id: uuid('id').primaryKey(),

    /** Subdomain etiketi. Routing kimligi; guvenlik kimligi DEGIL (6.1). */
    slug: text('slug').notNull(),

    name: text('name').notNull(),

    /** provisioning | active | suspended | archived | failed — CHECK migration'da. */
    status: text('status').notNull(),

    /**
     * Tenant'i acan kullanici. Identity modulune ait bir kimliktir; bu yuzden
     * FOREIGN KEY YOKTUR — ARCHITECTURE 6.1 cross-schema FK'yi yasaklar,
     * referans id ile tutulur.
     */
    ownerUserId: uuid('owner_user_id').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * Arsivleme zamani. `status = 'archived'` ile birebir tutarli olmak
     * zorundadir; kisit migration'da CHECK olarak zorlanir ve domain'deki
     * ayni invariant'i veritabani seviyesinde tekrarlar.
     *
     * NOT: bu bir soft-delete kolonu DEGILDIR. DEVELOPMENT_RULES 6 varsayilan
     * olarak `deleted_at` ister; tenant'ta silme iki asamalidir (arsivle ->
     * operator onayiyla kalici sil, 6.4) ve arsivleme zaten bir DURUMDUR.
     * Ikinci bir silme bayragi eklemek iki dogruluk kaynagi yaratirdi.
     */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    // Slug GLOBAL TEKILDIR. Tekilligin gercek garantisi burasidir; uygulamadaki
    // existsBySlug yalnizca bir nezaket kontroludur (ADR-0016).
    uniqueIndex('tenants_slug_key').on(table.slug),

    // "Bu kullanicinin actigi tenant'lar" sorgusu icin.
    index('tenants_owner_user_id_idx').on(table.ownerUserId),
  ],
);
