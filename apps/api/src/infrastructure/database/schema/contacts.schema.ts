import { index, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { companies } from './companies.schema';
import { crmSchema } from './crm.schema';
import { tenants } from './tenants.schema';

/**
 * `crm.contacts` — sirketteki kisi (ADR-0031 §1).
 *
 * `companyId` NOT NULL ve `ON DELETE CASCADE`: her kisi bir sirkete aittir ve
 * sirket silinince kisileri de gider (ADR-0031 §7). Bu cascade, `crm`
 * semasinin var olma gerekcesidir — gorusmeler `knowledge.notes`'a
 * yazilsaydi cross-schema FK yasagi yuzunden YAZILAMAZDI.
 */
export const contacts = crmSchema.table(
  'contacts',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    fullName: text('full_name').notNull(),
    title: text('title'),
    email: text('email'),
    phone: text('phone'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('contacts_tenant_created_idx').on(table.tenantId, table.createdAt),
    index('contacts_tenant_company_idx').on(table.tenantId, table.companyId),
  ],
);
