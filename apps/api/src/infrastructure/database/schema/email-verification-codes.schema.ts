import { index, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { platformSchema } from './platform.schema';
import { users } from './users.schema';

/**
 * `platform.email_verification_codes` — 6 haneli dogrulama kodu (ADR-0019).
 *
 * Kod DUZ saklanmaz: `code_hash` HMAC-SHA256 + pepper digest'idir. Deneme
 * sayaci ATOMIK artar (§7.3); tam kod yasam dongusu AUTH_ARCHITECTURE 7'dedir.
 * MULTI_TENANT_ARCHITECTURE 12.4 istisna listesinde — kullanici henuz hicbir
 * tenant'a ait olmayabilir, tenant RLS yok. CHECK'ler migration'da.
 */
export const emailVerificationCodes = platformSchema.table(
  'email_verification_codes',
  {
    id: uuid('id').primaryKey(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** HMAC-SHA256 digest (64 hex). */
    codeHash: text('code_hash').notNull(),

    /** 0-5 arasi; 5. yanlis denemede kod gecersizlesir. Sinir CHECK migration'da. */
    attemptCount: integer('attempt_count').notNull().default(0),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    /** Tek kullanimlik: dogrulaninca dolar. */
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [
    // "Bu kullanicinin aktif kodu" sorgusu (findActiveByUserId).
    index('email_verification_codes_user_id_idx').on(table.userId),
  ],
);
