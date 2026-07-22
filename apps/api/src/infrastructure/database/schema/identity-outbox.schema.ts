import { sql } from 'drizzle-orm';
import { index, integer, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { platformSchema } from './platform.schema';

/**
 * `platform.identity_outbox` — TENANT'SIZ Identity event akisi (Ç4, §15.1).
 *
 * ============================================================================
 * NEDEN AYRI TABLO, NEDEN `tenant_id` YOK
 * ============================================================================
 * Identity event'leri (`UserRegistered`, `UserLoggedIn`) tanimi geregi
 * tenant'sizdir: kullanici henuz hicbir tenant'a ait degildir. `platform.outbox`
 * `tenant_id NOT NULL` tasir ve standart RLS'e tabidir; onu `IS NULL OR ...` diye
 * gevsetmek HERKESIN tenant'siz satir yazabilmesi demekti (izolasyon zayiflardi).
 * Bu yuzden AYRI tablo — ve `tenant_id` kolonu hic yok.
 *
 * TENANT RLS YOK (MT §12.4.3 istisnasi): tenant'siz oldugu icin scope edilemez.
 * Diger Identity tablolariyla ayni SIKI erisim: yalnizca Identity modulu dokunur,
 * LISTELEME METODU yazilmaz. CHECK'ler ve grant'lar migration'dadir.
 * ============================================================================
 */
export const identityOutbox = platformSchema.table(
  'identity_outbox',
  {
    /** Event'in kendi kimligi = PK. Ayni event'in iki kez yazilmasini engeller. */
    id: uuid('id').primaryKey(),

    /** Nokta ile ayrilmis, gecmis zaman: `user.registered`. */
    eventType: text('event_type').notNull(),

    eventVersion: integer('event_version').notNull(),

    payload: jsonb('payload').notNull(),

    correlationId: text('correlation_id').notNull(),

    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    /** Publisher doldurur. `NULL` = henuz yayinlanmadi. */
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    // Kuyruk taramasi yalnizca BEKLEYENLERE bakar. Kismi kosul migration'da
    // birebir aynidir.
    index('identity_outbox_pending_idx')
      .on(table.occurredAt)
      .where(sql`published_at IS NULL`),
  ],
);
