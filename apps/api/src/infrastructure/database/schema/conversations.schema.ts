import { index, timestamp, uuid } from 'drizzle-orm/pg-core';

import { knowledgeSchema } from './knowledge.schema';
import { tenants } from './tenants.schema';

/**
 * `knowledge.conversations` — konusma hafizasi (ADR-0030 §1.1).
 *
 * ============================================================================
 * KONUSMA KULLANICIYA AITTIR, TENANT'A DEGIL
 * ============================================================================
 * RLS TENANT sinirini korur, KULLANICI sinirini korumaz: ayni tenant'taki iki
 * kullanici birbirinin konusmasini gormemelidir ve bu kisit RLS'in USTUNDE,
 * uygulama katmaninda uygulanir (`GET /me/memberships`'teki "kullanici yalnizca
 * KENDI uyeliklerini gorur" ile ayni disiplin).
 *
 * Bunu RLS'e tasimak `app.current_user_id` gibi ikinci bir GUC gerektirirdi ve
 * izolasyon modelinin yuzeyini genisletirdi — ADR-0028'de reddedilen yol.
 * ============================================================================
 */
export const conversations = knowledgeSchema.table(
  'conversations',
  {
    id: uuid('id').primaryKey(),

    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /** Konusmanin sahibi. Dogrulanmis token'dan gelir; FK YOKTUR (MT §12.4.3). */
    userId: uuid('user_id').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('conversations_tenant_user_idx').on(table.tenantId, table.userId, table.createdAt),
  ],
);
