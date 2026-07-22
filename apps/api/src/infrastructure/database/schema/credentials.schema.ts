import { text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { platformSchema } from './platform.schema';
import { users } from './users.schema';

/**
 * `platform.credentials` — parola kimlik bilgisi (AUTH_ARCHITECTURE 5.3).
 *
 * `users` ile 1:1: birincil anahtar AYNI ZAMANDA `users`'a FK'dir. `users` ile
 * ayni schema (`platform`) ve ayni modul (Identity) icinde oldugu icin bu FK
 * cross-schema/cross-module yasagini (ARCHITECTURE 6.1) ihlal etmez.
 *
 * Parola hash'i ayri tabloda tutulur: bir `SELECT *` ile disari cikmasini
 * zorlastirir ve federasyonda (parolasiz SSO kullanicisi) belirsizlik uretmez.
 * MULTI_TENANT_ARCHITECTURE 12.4 istisna listesinde — tenant RLS yok.
 */
export const credentials = platformSchema.table('credentials', {
  /** Sahibi olan kullanici. Hem PK hem FK (1:1). */
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),

  /** PHC Argon2id string'i (parametreler dahil). Hicbir DTO/event/log'a girmez. */
  passwordHash: text('password_hash').notNull(),

  /**
   * Parolanin en son NE ZAMAN degistigi. Kademeli yeniden hash'leme bunu
   * DEGISTIRMEZ (parola ayni, yalnizca kodlama yukseldi — AUTH_ARCHITECTURE 6.3).
   */
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }).notNull(),
});
