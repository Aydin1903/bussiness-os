import { boolean, index, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { financeSchema } from './finance.schema';
import { tenants } from './tenants.schema';

/**
 * `finance.categories` — gelir/gider kategorisi (ADR-0034 §3).
 *
 * ============================================================================
 * DOSYA ADI NEDEN `categories.schema.ts` DEGIL
 * ============================================================================
 * Bu klasor DUZDUR: tum modullerin tablo dosyalari yan yana durur. `categories`
 * bu duzlukte TEKIL DEGILDIR — Stok/Envanter (ROADMAP §3.5, 6. modul) kendi
 * kategorilerini isteyecek ve ayni dosya adini talep edecek.
 *
 * Ayni gerekce permission adinda da uygulandi (`finance_category:read`,
 * `category:read` DEGIL — ADR-0034 §7). Iki yerde ayni soruya ayni cevap.
 *
 * ⚠️ `direction` uzerindeki `UNIQUE (id, direction)` kisiti burada GORUNMEZ ve
 * bu bilinclidir: Drizzle sema tanimi yalnizca TIP GUVENLIGI saglar. O kisit
 * `0023`'te elle yazildi ve `0024`'un bilesik FK'sinin ON KOSULUDUR
 * (bkz. `index.ts`in ustundeki uyari).
 */
export const financeCategories = financeSchema.table(
  'categories',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    name: text('name').notNull(),

    /** `income` | `expense` — CHECK kisiti migration `0023`'te. */
    direction: text('direction').notNull(),

    /** Arsivlenen kategori YENI kayitlarda secilemez, gecmiste durur. */
    isArchived: boolean('is_archived').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // ⚠️ `lower(name)` bir IFADE index'idir: Drizzle'in kolon referansi bunu
    // ifade edemez, `sql` sablonu gerekir. Ad birebir migration'daki adla ayni
    // olmak ZORUNDA — repository unique ihlalini KISIT ADIYLA yakaliyor.
    uniqueIndex('categories_tenant_name_direction_idx').on(
      table.tenantId,
      sql`lower(${table.name})`,
      table.direction,
    ),
    index('categories_tenant_direction_name_idx').on(table.tenantId, table.direction, table.name),
  ],
);
