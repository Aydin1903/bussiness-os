import { index, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { projects } from './projects.schema';
import { projectsSchema } from './projects-schema.schema';
import { tasks } from './tasks.schema';
import { tenants } from './tenants.schema';

/**
 * `projects.progress_notes` — ilerleme notu (ADR-0033 §1).
 *
 * Adi `notes` DEGIL: `knowledge.notes` ile karismasin diye (her modul kendi
 * kelimesini alir — CRM'in `interactions` demesiyle ayni karar).
 *
 * `taskId` silinince NULL'lanir (not olmez); `projectId` silinince not de
 * gider. Ayrintili gerekce migration `0022`'de.
 */
export const progressNotes = projectsSchema.table(
  'progress_notes',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** OPSIYONEL daraltma; gorev silinince not OLMEZ. */
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),

    authorUserId: uuid('author_user_id').notNull(),
    body: text('body').notNull(),

    /** ⚠️ `occurredOn` YOK: ilerleme notu AKAN bir gunluktur (bkz. `0022`). */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('progress_notes_tenant_created_idx').on(table.tenantId, table.createdAt),
    index('progress_notes_tenant_project_idx').on(table.tenantId, table.projectId),
  ],
);
