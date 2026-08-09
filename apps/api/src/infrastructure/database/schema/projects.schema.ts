import { date, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { projectsSchema } from './projects-schema.schema';
import { tenants } from './tenants.schema';

/**
 * `projects.projects` — proje kaydi (ADR-0033 §1).
 *
 * ⚠️ `companyId` bir FOREIGN KEY DEGILDIR ve `.references()` ALMAZ: hedef
 * `crm.companies`, yani baska bir sema (Mutlak Kural 5). Yumusak referansin uc
 * parcali gerekcesi migration `0020_projects_schema.sql`'de.
 *
 * ⚠️ `name` uzerinde UNIQUE kisit YOKTUR: ayni adi tasiyan iki proje (ayni isin
 * iki donemi) mesrudur. Ayrintili gerekce yine migration'da.
 */
export const projects = projectsSchema.table(
  'projects',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    name: text('name').notNull(),
    status: text('status').notNull().default('planning'),
    description: text('description'),

    /** Cross-modul YUMUSAK referans — FK YOK, bilerek. */
    companyId: uuid('company_id'),

    /** TAKVIM GUNU (`date`), an degil — saat dilimi sorusu v1'de dogmaz. */
    startedOn: date('started_on'),
    dueOn: date('due_on'),

    /** Yalnizca durum GERCEKTEN degistiginde guncellenir (ADR-0033 §5). */
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }).notNull().defaultNow(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('projects_tenant_created_idx').on(table.tenantId, table.createdAt)],
);
