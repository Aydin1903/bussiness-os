import { date, index, numeric, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { companies } from './companies.schema';
import { contacts } from './contacts.schema';
import { crmSchema } from './crm.schema';
import { tenants } from './tenants.schema';

/**
 * `crm.opportunities` — satis hatti (ADR-0031 §2).
 *
 * `contactId` silinince NULL'lanir (firsat olmez); `companyId` silinince
 * firsat da gider. Ayrintili gerekce migration `0017`'de.
 */
export const opportunities = crmSchema.table(
  'opportunities',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),

    title: text('title').notNull(),
    stage: text('stage').notNull().default('potential'),

    /** `numeric` — para kayan noktali sayida tutulmaz. Drizzle string doner. */
    estimatedValue: numeric('estimated_value', { precision: 14, scale: 2 }),
    currency: text('currency'),

    /** TAKVIM GUNU (`date`), an degil — saat dilimi sorusu v1'de dogmaz. */
    nextFollowUpOn: date('next_follow_up_on'),

    /** Yalnizca asama GERCEKTEN degistiginde guncellenir (ADR-0031 Slice 5). */
    stageChangedAt: timestamp('stage_changed_at', { withTimezone: true }).notNull().defaultNow(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('opportunities_tenant_created_idx').on(table.tenantId, table.createdAt),
    index('opportunities_tenant_company_idx').on(table.tenantId, table.companyId),
  ],
);
