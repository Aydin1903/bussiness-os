import { boolean, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { platformSchema } from './platform.schema';

/**
 * `platform.users` — global kullanici kimligi (ADR-0014, AUTH_ARCHITECTURE 5).
 *
 * BU TABLO TENANT-SCOPED DEGILDIR ve olamaz: kimlik tenant'larin ustunde yasar.
 * MULTI_TENANT_ARCHITECTURE 12.4 istisna listesindedir — standart tenant RLS
 * UYGULANMAZ; erisim Identity repository'sinden dogrudan yapilir (12.4.3) ve
 * koruma uygulama seviyesindedir (listeleme metodu yok, modul izolasyonu,
 * yanit hesap varligini sizdirmaz).
 *
 * CHECK kisitlari ve grant'lar elle yazilan migration'dadir; bu dosya yalnizca
 * TIP GUVENLIGI icindir (DEVELOPMENT_RULES 6).
 */
export const users = platformSchema.table(
  'users',
  {
    /** UUIDv7 — uygulama uretir, veritabani default'u yoktur. */
    id: uuid('id').primaryKey(),

    /** Normalize (lowercase + NFKC) e-posta; GLOBAL TEKIL. */
    email: text('email').notNull(),

    /**
     * Kalici bir ozelliktir: bir kez dogrulaninca hep dogrulanmis kalir.
     * `status` ile tutarliligi migration'daki CHECK ile zorlanir
     * (pending -> false, active/locked -> true).
     */
    emailVerified: boolean('email_verified').notNull(),

    /** pending | active | locked | deactivated — CHECK migration'da. */
    status: text('status').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Tekilligin gercek garantisi burasidir (AUTH_ARCHITECTURE 8.1): aksi halde
    // ayni e-posta iki hesaba duser ve tekillik atlatilabilir.
    uniqueIndex('users_email_key').on(table.email),
  ],
);
