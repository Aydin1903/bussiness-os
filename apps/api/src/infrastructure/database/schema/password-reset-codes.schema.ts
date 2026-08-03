import { index, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { platformSchema } from './platform.schema';
import { users } from './users.schema';

/**
 * `platform.password_reset_codes` — parola sifirlama kodu (ADR-0024).
 *
 * `email_verification_codes` ile AYNI desen, DAHA SIKI parametreler: 10 dk omur
 * ve 3 yanlis deneme (§7.6). Kod DUZ saklanmaz — `code_hash` HMAC-SHA256 + pepper
 * digest'idir. Deneme sayaci ATOMIK artar. Tenant RLS yok (kullanici tenant'siz
 * olabilir; MULTI_TENANT_ARCHITECTURE 12.4 istisnasi). CHECK'ler migration'da.
 */
export const passwordResetCodes = platformSchema.table(
  'password_reset_codes',
  {
    id: uuid('id').primaryKey(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** HMAC-SHA256 digest (64 hex). */
    codeHash: text('code_hash').notNull(),

    /** 0-3 arasi; 3. yanlis denemede kod gecersizlesir. Sinir CHECK migration'da. */
    attemptCount: integer('attempt_count').notNull().default(0),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    /** Tek kullanimlik: sifirlaninca (veya supersede edilince) dolar. */
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [index('password_reset_codes_user_id_idx').on(table.userId)],
);
