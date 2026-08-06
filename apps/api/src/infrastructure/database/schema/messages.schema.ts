import { check, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { conversations } from './conversations.schema';
import { platformSchema } from './platform.schema';
import { tenants } from './tenants.schema';

/**
 * `platform.messages` — konusmanin turleri (ADR-0030 §1.1).
 *
 * `role` yalnizca `user` | `assistant` alir. `system` YOKTUR: sistem promptu
 * adapter'da uretilir ve SAKLANMAZ — saklansaydi prompt degisikligi gecmis
 * konusmalari geriye donuk olarak yeniden yorumlardi.
 *
 * Bu iki rol, ADR-0030 §1.3'teki `history` parametresinin tasidigi rollerle
 * BIREBIR aynidir.
 *
 * En hizli buyuyen tablo: her soru-cevap IKI satir. Retention kurali henuz yok
 * (ROADMAP §8.3).
 */
export const messages = platformSchema.table(
  'messages',
  {
    id: uuid('id').primaryKey(),

    /** DENORMALIZE — `note_chunks.tenantId` ile AYNI gerekce. */
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),

    role: text('role').notNull(),
    content: text('content').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // "Son N mesaj cifti" sorgusu (ADR-0030 §1.2) bu index uzerinden gider.
    index('messages_conversation_created_idx').on(table.conversationId, table.createdAt),

    check('messages_role_valid', sql`role IN ('user', 'assistant')`),
    check('messages_content_not_blank', sql`length(btrim(content)) > 0`),
  ],
);
