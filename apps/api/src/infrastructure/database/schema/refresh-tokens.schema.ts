import { index, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { platformSchema } from './platform.schema';
import { tokenFamilies } from './token-families.schema';

/**
 * `platform.refresh_tokens` — bir ailedeki tek refresh token (ADR-0021).
 *
 * 256-bit opak token DUZ saklanmaz: `token_hash` SHA-256 digest'idir ve lookup
 * bu hash uzerinden yapilir. Rotation her kullanimda `used_at`'i doldurur; ayni
 * hash'in ikinci kez sunulmasi yeniden kullanimdir. Oturum tenant seciminden
 * once basladigi icin tenant-scoped degildir (MULTI_TENANT_ARCHITECTURE 12.4).
 */
export const refreshTokens = platformSchema.table(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey(),

    familyId: uuid('family_id')
      .notNull()
      .references(() => tokenFamilies.id, { onDelete: 'cascade' }),

    /** SHA-256 digest (64 hex). Lookup anahtari. */
    tokenHash: text('token_hash').notNull(),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    /** Rotasyonda dolar; dolu ise token kullanilmis demektir. */
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => [
    // Lookup hash ile yapilir; tekil olmasi ≤1 satir dondurur ve cakismayi onler.
    uniqueIndex('refresh_tokens_token_hash_key').on(table.tokenHash),

    // "Bu ailenin token'lari" — aile iptalinde ve denetimde.
    index('refresh_tokens_family_id_idx').on(table.familyId),
  ],
);
