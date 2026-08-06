import { index, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { crmSchema } from './crm.schema';
import { tenants } from './tenants.schema';

/**
 * `crm.companies` — musteri kaydi (ADR-0031 §1).
 *
 * ⚠️ `name` uzerinde UNIQUE kisit YOKTUR: ayni isimli iki kayit gercek bir
 * CRM'de mesrudur. Ayrintili gerekce migration `0016_crm_schema.sql`'de.
 */
export const companies = crmSchema.table(
  'companies',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    name: text('name').notNull(),
    industry: text('industry'),
    email: text('email'),
    phone: text('phone'),
    website: text('website'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('companies_tenant_created_idx').on(table.tenantId, table.createdAt)],
);
