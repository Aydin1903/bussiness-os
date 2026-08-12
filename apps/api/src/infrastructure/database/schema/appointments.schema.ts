import { check, index, integer, text, timestamp, uuid, vector } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { appointmentsSchema } from './appointments-schema.schema';
import { tenants } from './tenants.schema';

/**
 * `appointments.appointments` — kaydedilmis bir bulusma (ADR-0035 §2).
 *
 * ============================================================================
 * ⚠️ BU MODULDE `*_chunks` TABLOSU YOKTUR — VEKTOR AYNI SATIRDA
 * ============================================================================
 * Dort onceki anlamsal kaynagin dordu de ayri bir parca tablosu tasiyordu;
 * randevu tasimaz (ADR-0035 §3). Chunking uzun ANLATISAL govdeler icindir ve
 * bir randevu notu tanimi geregi kisadir. Bunun dogrudan olculebilir kazanci
 * retention listesinde gorunur: bu modul ROADMAP §8.5'e IKI degil TEK satir
 * ekler ve silme kolu tektir (cascade gerekmez — vektor ayni satirdadir).
 *
 * ⚠️ `embedding` NULLABLE ve bu bir ARIZA DEGIL NORMALDIR: notsuz randevu cok
 * yaygindir. Ayni kolon "gomulememis" halini de tasir ve tek bir onarim yolu
 * (`POST /appointments/reindex`, Slice 3) ikisini birden kapatir.
 *
 * ⚠️ `crmContactId` uzerinde `.references()` YOKTUR ve bu bir eksik DEGILDIR:
 * hedef `crm.contacts`, yani baska bir sema; Mutlak Kural 5 cross-schema FK'yi
 * yasaklar. Kisi ADI da burada saklanmaz — her okumada `crm.public.ts`ten
 * cozulur (yazma yolu Slice 2).
 *
 * ⚠️ `scheduledAt` `timestamptz`tir, `date` DEGIL — onceki uc modulden bilincli
 * sapma (gerekce migration `0026`'da ve ADR-0035 §2c'de).
 */
export const appointments = appointmentsSchema.table(
  'appointments',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /** Cross-modul YUMUSAK referans — FK YOK, API Slice 2'ye kadar kabul etmez. */
    crmContactId: uuid('crm_contact_id'),

    /** ⚠️ API Slice 3'e kadar kabul etmez; chunk'lanmaz, tek vektore gomulur. */
    serviceNote: text('service_note'),

    /** 1536 = `text-embedding-3-small` cikti boyutu. Yazma yolu Slice 3. */
    embedding: vector('embedding', { dimensions: 1536 }),

    /** ⚠️ AN, takvim gunu DEGIL: 14:30'daki bir bulusma `date`e sigmaz. */
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),

    /** Bitis TURETILIR (`scheduledAt + durationMinutes`); `ends_at` kolonu YOK. */
    durationMinutes: integer('duration_minutes').notNull(),

    /**
     * `scheduled` | `completed` | `cancelled` | `no_show` — CHECK kisiti
     * migration `0026`'da.
     */
    status: text('status').notNull(),

    /** ⚠️ Yalnizca OLUSTURANI tutar; degisiklik denetim izi DEGILDIR. */
    createdByUserId: uuid('created_by_user_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('appointments_duration_positive', sql`${table.durationMinutes} > 0`),
    /** Modulun BIRINCIL okuma yolu: "su iki an arasindaki randevular". */
    index('appointments_tenant_scheduled_idx').on(table.tenantId, table.scheduledAt),
    index('appointments_tenant_contact_idx').on(table.tenantId, table.crmContactId),
    index('appointments_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
  ],
);
