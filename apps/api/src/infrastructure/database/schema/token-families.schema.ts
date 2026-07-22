import { index, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { platformSchema } from './platform.schema';
import { users } from './users.schema';

/**
 * `platform.token_families` — bir giristen dogan refresh zinciri (ADR-0021).
 *
 * Hirsizlik tespitinin birimidir: yeniden kullanim tespit edilince TUM aile
 * iptal edilir. Oturum tenant seciminden ONCE basladigi icin tenant-scoped
 * degildir (MULTI_TENANT_ARCHITECTURE 12.4 istisna listesi — tenant RLS yok).
 * Tutarlilik CHECK'leri migration'da (revoked_at <=> revoked_reason).
 */
export const tokenFamilies = platformSchema.table(
  'token_families',
  {
    id: uuid('id').primaryKey(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** Iptal nedeni (10 deger) veya null. CHECK migration'da. */
    revokedReason: text('revoked_reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    /** Iptal zamani; `revoked_reason` ile birlikte var olur veya birlikte yok. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    // "Bu kullanicinin aileleri" — logout-all / parola degisiminde toplu iptal.
    index('token_families_user_id_idx').on(table.userId),
  ],
);
