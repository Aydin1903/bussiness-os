import { date, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { companies } from './companies.schema';
import { contacts } from './contacts.schema';
import { crmSchema } from './crm.schema';
import { opportunities } from './opportunities.schema';
import { tenants } from './tenants.schema';

/**
 * `crm.interactions` — gorusme kaydi (ADR-0031 §1).
 *
 * EKLEME-YALNIZ bir gunluktur: `PATCH`/`DELETE` ucu YOKTUR. Silme yalnizca
 * sirket cascade'i uzerinden gerceklesir.
 */
export const interactions = crmSchema.table(
  'interactions',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    /** Silinince gorusme OLMEZ: gorusme bir KAYITTIR, gecmis silinmemeli. */
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
      onDelete: 'set null',
    }),

    authorUserId: uuid('author_user_id').notNull(),

    /** Gorusmenin GERCEKLESTIGI gun — kayda gecirildigi an degil. */
    occurredOn: date('occurred_on').notNull(),

    body: text('body').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('interactions_tenant_occurred_idx').on(table.tenantId, table.occurredOn),
    index('interactions_tenant_company_idx').on(table.tenantId, table.companyId),
  ],
);
