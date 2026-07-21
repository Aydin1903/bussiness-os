import { sql } from 'drizzle-orm';
import { index, integer, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { platformSchema } from './platform.schema';

/**
 * `platform.outbox` — transactional outbox (ADR-0006, ARCHITECTURE 7.1).
 *
 * Bir domain event, onu doguran veri degisikligiyle AYNI TRANSACTION'da
 * buraya yazilir. Ayri bir publisher sureci satirlari okuyup event bus'a
 * tasir ve `published_at`'i doldurur.
 *
 * Neden boyle: dogrudan kuyruga yazan bir tasarimda veritabani commit olur,
 * sonra surec coker ve event HIC yayinlanmaz. Sistem kalici olarak tutarsiz
 * kalir ve bu, dagitik sistemlerin en yaygin SESSIZ hatasidir.
 *
 * Zarf alanlari (MULTI_TENANT_ARCHITECTURE 15.1) KOLON, is verisi JSONB'dir:
 * publisher'in filtreleyip siralayabilmesi icin zarfin sorgulanabilir olmasi
 * gerekir.
 */
export const outbox = platformSchema.table(
  'outbox',
  {
    /**
     * Event'in kendi kimligi — ayni zamanda birincil anahtar.
     *
     * Ayni event'in iki kez yazilmasi bir HATADIR ve birincil anahtar bunu
     * engeller. Handler tarafindaki at-least-once idempotency'si ayri bir
     * konudur; bu kisit URETIM tarafini korur.
     */
    id: uuid('id').primaryKey(),

    /**
     * Event'i doguran tenant. NOT NULL.
     *
     * MULTI_TENANT_ARCHITECTURE 15.1, Identity event'lerinin (UserRegistered)
     * tenant'siz olabilecegini soyler — ama RLS politikasi
     * `tenant_id = current_setting(...)` ile NULL satir YAZILAMAZ ve politikayi
     * "IS NULL OR ..." diye gevsetmek herkesin tenant'siz satir yazabilmesi
     * demektir. Identity modulu geldiginde ayri bir karar verilecek; o zamana
     * kadar fail-closed baslamak, sonradan daraltmaktan kolaydir.
     */
    tenantId: uuid('tenant_id').notNull(),

    /** Nokta ile ayrilmis, gecmis zaman: `tenant.provisioning_requested`. */
    eventType: text('event_type').notNull(),

    /** Sema surumu. Event'ler immutable'dir; sema degisirse surum artar. */
    eventVersion: integer('event_version').notNull(),

    payload: jsonb('payload').notNull(),

    correlationId: text('correlation_id').notNull(),

    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    /** Publisher doldurur. `NULL` = henuz yayinlanmadi. */
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    // Kuyruk taramasi yalnizca BEKLEYENLERE bakar. Kismi index, yayinlanmis
    // satirlar biriktikce index'in buyumesini engeller — outbox zamanla en
    // buyuk tablolardan biri olur.
    //
    // Kosul migration'da BIREBIR ayni yazilidir; ayrisirlarsa `db:generate`
    // gereksiz bir migration onerir.
    index('outbox_pending_idx')
      .on(table.occurredAt)
      .where(sql`published_at IS NULL`),

    index('outbox_tenant_id_idx').on(table.tenantId),
  ],
);
