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

    // --- Teslimat yeniden deneme (0006, AUTH §16.1) --------------------------

    /** Kac kez denendi. Dead-letter esigi buna bakar. */
    attemptCount: integer('attempt_count').notNull().default(0),

    /** Son hatanin metni — TESHIS icin. Sir tasimaz (P1). */
    lastError: text('last_error'),

    /** Backoff: bu andan once yeniden denenmez. `NULL` = hemen hazir. */
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),

    /** Kuyruktan cikarildi ama SILINMEDI. `NULL` = hala kuyrukta. */
    deadLetteredAt: timestamp('dead_lettered_at', { withTimezone: true }),
  },
  (table) => [
    // Kuyruk taramasi yalnizca BEKLEYEN ve OLU OLMAYAN kayitlara bakar.
    // Siralama `next_attempt_at`: kuyrugun basi "en eski" degil, "yeniden
    // denenmeye en erken hazir olan"dir. Kismi kosul migration'da birebir aynidir.
    index('identity_outbox_pending_idx')
      .on(table.nextAttemptAt, table.occurredAt)
      .where(sql`published_at IS NULL AND dead_lettered_at IS NULL`),

    index('identity_outbox_dead_letter_idx')
      .on(table.deadLetteredAt)
      .where(sql`dead_lettered_at IS NOT NULL`),
  ],
);
