import { date, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { projects } from './projects.schema';
import { projectsSchema } from './projects-schema.schema';
import { tenants } from './tenants.schema';

/**
 * `projects.tasks` — gorev (ADR-0033 §1, §3, §4).
 *
 * ⚠️ `projectId` NULLABLE: projesiz gorev ("Yapilacaklar" kutusu) mesrudur ve
 * bu, `crm.interactions.company_id NOT NULL` kararindan bilincli bir sapmadir.
 * Ayrintili gerekce migration `0021_projects_tasks.sql`'de.
 *
 * ⚠️ `assigneeUserId` `.references()` ALMAZ: `platform.users` baska bir sema.
 * Dogrulama YAZMA ANINDA, `TenantAccessQuery` uzerinden yapilir.
 */
export const tasks = projectsSchema.table(
  'tasks',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    /** NULLABLE — projesiz gorev mesrudur. Proje silinince gorev de gider. */
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),

    title: text('title').notNull(),
    status: text('status').notNull().default('todo'),

    /** TAKVIM GUNU (`date`), an degil — saat dilimi sorusu v1'de dogmaz. */
    dueOn: date('due_on'),

    /** Cross-modul YUMUSAK referans — FK YOK, bilerek. `null` = atanmamis. */
    assigneeUserId: uuid('assignee_user_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('tasks_tenant_created_idx').on(table.tenantId, table.createdAt),
    index('tasks_tenant_project_idx').on(table.tenantId, table.projectId),
    index('tasks_tenant_assignee_idx').on(table.tenantId, table.assigneeUserId),
    index('tasks_tenant_due_idx').on(table.tenantId, table.dueOn),
  ],
);
