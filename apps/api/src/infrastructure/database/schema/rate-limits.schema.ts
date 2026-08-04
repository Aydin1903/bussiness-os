import { integer, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { knowledgeSchema } from './knowledge.schema';
import { tenants } from './tenants.schema';

/**
 * `knowledge.rate_limits` — kullanici + tenant bazli istek sayaci (ADR-0029 §5).
 *
 * Amac MALIYET KONTROLU, kaba kuvvet korumasi DEGIL. Bu ayrim biciminin
 * tamamini belirledi; ayrintili gerekce migration `0013_rate_limits.sql`'de.
 *
 * Sayac SATIRI tutulur, istek LOGU degil: tek deyimlik UPSERT es zamanli
 * isteklerde yarisi kokten keser ve satir sayisi kullanici + eylem basina
 * saatte BIRDE kalir.
 */
export const rateLimits = knowledgeSchema.table(
  'rate_limits',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /** Harcamayi YAPAN kullanici. IP DEGIL (ADR-0029 §5); FK YOKTUR (MT §12.4.3). */
    userId: uuid('user_id').notNull(),

    /** `RateLimitedAction`. Veritabaninda CHECK ile aynalanir. */
    action: text('action').notNull(),

    /** Saate yuvarlanmis pencere basi — sayacin kimliginin parcasidir. */
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),

    requestCount: integer('request_count').notNull().default(0),
  },
  (table) => [
    primaryKey({
      name: 'rate_limits_pkey',
      columns: [table.tenantId, table.userId, table.action, table.windowStart],
    }),
  ],
);
