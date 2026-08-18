import { bigint, check, index, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { documentsSchema } from './documents-schema.schema';
import { tenants } from './tenants.schema';

/**
 * `documents.documents` — saklanan bir dosyanin METADATA'si (ADR-0037 §1).
 *
 * ============================================================================
 * ⚠️ DOSYANIN KENDISI BU TABLODA DEGIL
 * ============================================================================
 * Icerik nesne deposundadir (Cloudflare R2 — ADR-0037 §5, ADR-0009'un
 * saglayici secimi). Bu satir yalnizca ona ISARET eder (`storage_key`).
 *
 * Projede ILK KEZ kalici durum PostgreSQL DISINA cikiyor ve kaybedilen sey
 * RLS'tir: nesne deposunda satir seviyesi guvenlik YOKTUR. Tenant izolasyonun
 * oradaki tek mekanik dayanagi ANAHTAR DUZENIDIR
 * (`tenants/<tenantId>/documents/<documentId>/<uuid>-<ad>`), ve bir okuma yolu
 * anahtari HER ZAMAN buradan alir — istemciden gelen bir anahtarla asla nesne
 * okunmaz.
 *
 * ⚠️ `storageKey` TENANT-SCOPED UNIQUE: iki satirin ayni nesneyi isaret etmesi,
 * birini silmenin digerini SESSIZCE bozmasi demekti (ADR-0037 §7 — her yeni
 * yukleme YENI bir anahtar uretir; kisit onu veritabani seviyesinde kilitler).
 *
 * ⚠️ `sizeBytes` `bigint`: sinir bugun 20 MB (bir URUN ayari) ama kolonun tipi
 * bir urun ayarina baglanmaz.
 *
 * ⚠️ `label` SERBEST METINDIR — enum de tenant sozlugu de YOK (ADR-0037 §2).
 * Sabit bir liste kullaniciyi sahte kategoriye iterdi ve sahte etiket baglam
 * basligina girip AI'a yanlis bilgi ogretirdi.
 *
 * ⚠️ `crmContactId` ve `projectId` uzerinde `.references()` YOKTUR ve bu bir
 * eksik DEGILDIR: hedefler baska semalar; Mutlak Kural 5 cross-schema FK'yi
 * yasaklar. Adlar burada saklanmaz — her okumada `crm.public.ts` /
 * `projects.public.ts` uzerinden cozulur. IKISI DE OPSIYONEL VE BAGIMSIZDIR:
 * bir belge ikisine birden, birine ya da HICBIRINE bagli olabilir.
 *
 * ⚠️ MIME allowlist CHECK'i migration `0027`dedir (`documents_mime_type_allowed`)
 * ve burada TEMSIL EDILMEZ — `index.ts`in "yalnizca tip guvenligi" uyarisinin
 * somut bir ornegi.
 */
export const documents = documentsSchema.table(
  'documents',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /** Kullaniciya GOSTERILEN ad; anahtarda temizlenmis hali durur. */
    originalFilename: text('original_filename').notNull(),

    /** R2'deki nesnenin anahtari. ⚠️ Tek izolasyon dayanagi (bkz. sinif yorumu). */
    storageKey: text('storage_key').notNull(),

    /** ⚠️ ICERIKTEN tespit edilir, istemcinin bildirdigi baslikdan DEGIL. */
    mimeType: text('mime_type').notNull(),

    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),

    /** Kullanicinin kendi yazdigi SERBEST etiket; `null` = etiketsiz. */
    label: text('label'),

    /** Cross-modul YUMUSAK referans — FK YOK, `project_id`den BAGIMSIZ. */
    crmContactId: uuid('crm_contact_id'),

    /** Cross-modul YUMUSAK referans — FK YOK, `crm_contact_id`den BAGIMSIZ. */
    projectId: uuid('project_id'),

    /** ⚠️ Yalnizca YUKLEYENI tutar; degisiklik denetim izi DEGILDIR. */
    createdByUserId: uuid('created_by_user_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('documents_storage_key_unique').on(table.tenantId, table.storageKey),
    check('documents_size_positive', sql`${table.sizeBytes} > 0`),
    /** Modulun BIRINCIL okuma yolu: "en son yuklenenler". */
    index('documents_tenant_created_idx').on(table.tenantId, table.createdAt),
    index('documents_tenant_contact_idx').on(table.tenantId, table.crmContactId),
    index('documents_tenant_project_idx').on(table.tenantId, table.projectId),
  ],
);
