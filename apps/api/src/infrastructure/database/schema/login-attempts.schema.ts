import { boolean, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { platformSchema } from './platform.schema';

/**
 * `platform.login_attempts` — katmanli kaba kuvvet korumasinin kaydi (ADR-0022).
 *
 * FOREIGN KEY YOKTUR: basarisiz bir giris VAR OLMAYAN bir kullaniciya ait
 * olabilir (§9.1), bu yuzden `users`'a baglanamaz — yalnizca normalize e-postayi
 * (sayac anahtari) tasir. Tenant-scoped degildir (MULTI_TENANT_ARCHITECTURE 12.4
 * istisna listesi — tenant RLS yok); yalnizca kilit kararinda okunur.
 *
 * NOT: Gercek index'ler elle yazilan migration'da `WHERE succeeded = false` ile
 * KISMIDIR (sayaclar yalnizca basarisiz denemeleri sayar). Bu dosyadaki index
 * tanimlari yalnizca tip guvenligi/belge icindir; kismi kosul migration'dadir.
 */
export const loginAttempts = platformSchema.table(
  'login_attempts',
  {
    id: uuid('id').primaryKey(),

    /** Normalize e-posta. Katman 1 ve 2 sayac anahtari. */
    emailNormalized: text('email_normalized').notNull(),

    /** Istemci IP'si (text — ER ile uyumlu). Katman 1 ve 3 sayac anahtari. */
    ipAddress: text('ip_address').notNull(),

    succeeded: boolean('succeeded').notNull(),

    attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Katman 1: (e-posta, IP) — 5 hata / 15 dk.
    index('login_attempts_email_ip_idx').on(table.emailNormalized, table.ipAddress, table.attemptedAt),

    // Katman 2: e-posta — 20 hata / saat (ustel gecikme).
    index('login_attempts_email_idx').on(table.emailNormalized, table.attemptedAt),

    // Katman 3: IP — 50 hata / saat (429).
    index('login_attempts_ip_idx').on(table.ipAddress, table.attemptedAt),
  ],
);
