import { date, index, numeric, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { financeSchema } from './finance.schema';
import { tenants } from './tenants.schema';

/**
 * `finance.transactions` — gerceklesmis nakit hareketi (ADR-0034 §2).
 *
 * ⚠️ `amount` `numeric` olarak tanimlidir ve Drizzle onu **`string`** dondurur.
 * Bu ISTENEN davranistir: para hicbir noktada JS `number`ina (IEEE754) girmez.
 * `{ mode: 'number' }` yazmak tam olarak kacinilan yuvarlama hatasini geri
 * getirirdi. Toplama SQL'de, `numeric` aritmetigiyle yapilir (Slice 3).
 *
 * ⚠️ `categoryId` uzerinde `.references()` YOKTUR ve bu bir eksik DEGILDIR:
 * kisit TEK KOLONLU degil, `(category_id, direction)` ciftini baglayan BILESIK
 * bir FK'dir (migration `0024`) ve Drizzle sema tanimi onu bu bicimde ifade
 * etmiyor. Tek kolonlu bir `.references()` eklemek, gercekte var olandan DAHA
 * ZAYIF bir kisiti temsil ederdi — okuyani yaniltirdi.
 *
 * ⚠️ `companyId` / `projectId` de FK DEGILDIR: hedefleri baska semalar
 * (`crm.companies`, `projects.projects`) ve Mutlak Kural 5 cross-schema FK'yi
 * yasaklar. Uc parcali yumusak referans deseninin gerekcesi migration'dadir.
 */
export const financeTransactions = financeSchema.table(
  'transactions',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /** `income` | `expense` — CHECK kisiti migration `0024`'te. */
    direction: text('direction').notNull(),

    /** ⚠️ `string` doner, `number` DEGIL — bkz. dosya yorumu. */
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    currency: text('currency').notNull(),

    /** TAKVIM GUNU (`date`), an degil — saat dilimi sorusu v1'de dogmaz. */
    occurredOn: date('occurred_on').notNull(),

    /** ⚠️ EMBED EDILMEZ (ADR-0034 §6.1) — duz kolon. */
    description: text('description'),

    /** Bileşik FK'nin (`category_id`, `direction`) yarisi. */
    categoryId: uuid('category_id'),

    /** Cross-modul YUMUSAK referanslar — FK YOK, API Slice 3'e kadar kabul etmez. */
    companyId: uuid('company_id'),
    projectId: uuid('project_id'),

    createdByUserId: uuid('created_by_user_id').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('transactions_tenant_occurred_idx').on(table.tenantId, table.occurredOn),
    index('transactions_tenant_category_idx').on(table.tenantId, table.categoryId),
  ],
);
