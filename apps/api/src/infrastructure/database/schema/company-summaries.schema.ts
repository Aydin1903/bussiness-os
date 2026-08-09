import { text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { companies } from './companies.schema';
import { crmSchema } from './crm.schema';
import { tenants } from './tenants.schema';

/**
 * `crm.company_summaries` — musteri ozeti ONBELLEGI (ADR-0032).
 *
 * Kuyruk DEGIL: `attempt_count` / `next_attempt_at` / `dead_lettered_at`
 * yoktur. Ozet istek uzerine uretilir ve cagiran bir insandir — cokme
 * durumunda yeniden denemeyi o yapar.
 *
 * `companyId` PRIMARY KEY: bu tablo sirketin TURETILMIS bir alanidir, kendi
 * kimligi olan bir varlik degil. Cascade ile silinen musterinin ozeti de gider.
 */
export const companySummaries = crmSchema.table('company_summaries', {
  companyId: uuid('company_id')
    .primaryKey()
    .references(() => companies.id, { onDelete: 'cascade' }),

  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),

  summary: text('summary'),

  /** Ozetin NEYDEN uretildigini tanimlayan opak imza — israf freni. */
  sourceWatermark: text('source_watermark'),

  generatedAt: timestamp('generated_at', { withTimezone: true }),

  /** Uretim SURUYOR isareti; iki dakika sonra kendiliginden bayatlar. */
  generatingAt: timestamp('generating_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
