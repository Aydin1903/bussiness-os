import { date, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { financeSchema } from './finance.schema';
import { tenants } from './tenants.schema';

/**
 * `finance.commentaries` — donem yorumu (ADR-0034 §1.1, §6.1).
 *
 * ⚠️ Bu tablo, Finans'ta EMBED EDILEN TEK yuzeydir. `finance.transactions
 * .description` duz bir kolondur ve gomulmez — gerekce migration `0025`'te
 * (ozetle: binlerce neredeyse ozdes kisa vektor ORTAK top-K havuzunu kirletir).
 *
 * ⚠️ EBEVEYNI YOKTUR — `progress_notes.project_id`den bilincli fark. Bir
 * finansal yorum bir DONEM hakkindadir, tek bir kayit hakkinda degil.
 * Dolayisiyla bu tabloda cascade zinciri yoktur.
 */
export const financeCommentaries = financeSchema.table(
  'commentaries',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    authorUserId: uuid('author_user_id').notNull(),

    /** Yorumun ILGILI OLDUGU gun; `createdAt`ten AYRI (Nisan'da Mart icin). */
    occurredOn: date('occurred_on').notNull(),

    body: text('body').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('commentaries_tenant_created_idx').on(table.tenantId, table.createdAt),
    index('commentaries_tenant_occurred_idx').on(table.tenantId, table.occurredOn),
  ],
);
