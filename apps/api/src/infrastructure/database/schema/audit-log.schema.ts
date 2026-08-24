import { index, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { platformSchema } from './platform.schema';
import { tenants } from './tenants.schema';

/**
 * `platform.audit_log` — DEGISMEZ denetim kaydi (ADR-0043 §6, migration `0032`).
 *
 * ARCHITECTURE §6.2'nin platform zincirinin DORDUNCU halkasi
 * (Tenant -> Identity -> Authorization -> AUDIT) ve MT §12.4'te ZATEN yazili
 * olan satirin uygulamasi: _"`tenant_id` tasir -> standart RLS uygulanir;
 * `UPDATE`/`DELETE` yetkisi hicbir role verilmez."_
 *
 * ============================================================================
 * ⚠️ BURADA BIR "DEGER" KOLONU YOKTUR VE EKLENMEMELIDIR (ADR-0043 §6.5)
 * ============================================================================
 * `before` / `after` / `old_value` / `new_value` / `payload` — hicbiri yok.
 * Ilk tuketici IK moduludur ve orada degisen alanlardan biri MAAStir; eski
 * degeri buraya yazmak, maas verisini IKINCI BIR TABLOYA kopyalar ve
 * ADR-0043 §4.2'nin uc katmanli izolasyonunu tek hamlede deler.
 *
 * `shared/ai-usage-recorder.port.ts`in kurdugu disiplinin IKINCI uygulamasi:
 * _"ICERIK TASINMAZ — YALNIZCA OLCU."_
 *
 * ⚠️ Bu dosya yalnizca TIP GUVENLIGI saglar (bkz. `index.ts`). Degismezligin
 * gercek dayanaklari migration'dadir ve IKI KATMANLIDIR: (1) `businessos_app`
 * yalnizca `SELECT, INSERT` alir, (2) `BEFORE UPDATE OR DELETE` trigger'i
 * TABLO SAHIBINI de reddeder. Ikisinin de kaniti entegrasyon testindedir.
 */
export const auditLog = platformSchema.table(
  'audit_log',
  {
    /** UUIDv7 — ayni `occurredAt` icin kararli ikincil siralama anahtari. */
    id: uuid('id').primaryKey(),

    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /**
     * ⚠️ NULL = SISTEM/WORKER. Sahte bir kullanici UYDURULMAZ.
     *
     * FK YOKTUR (MT §12.4.3 ile ayni gerekce): denetim kaydi, kullanici silinse
     * bile ayakta kalmalidir.
     */
    actorUserId: uuid('actor_user_id'),

    /**
     * `Clock` port'undan gelir, `now()` DEGIL (DEVELOPMENT_RULES 3.2).
     *
     * ⚠️ Ayni islemde degisen alanlarin satirlari BIREBIR AYNI degeri tasir —
     * gruplama anahtari budur (`audit-rows.ts`). Ayri bir `operationId`
     * kolonu bu yuzden eklenmedi.
     */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),

    /**
     * `<modul>.<kaynak>` — ornek: `hr.employee`.
     *
     * ⚠️ Numaralandiran CHECK kisiti YOKTUR: platform, modullerin kaynak
     * sozlugunu bilmez (`platform.rate_limits.action` ile ayni karar).
     */
    resourceType: text('resource_type').notNull(),

    /** Ciplak uuid — cross-schema FK YASAK (Mutlak Kural 5). */
    resourceId: uuid('resource_id').notNull(),

    /**
     * `created` | `updated` | `deleted` — PLATFORM fiili, modul sozlugu degil.
     *
     * ⚠️ Bu kolon numaralandirilir ve bu, `resourceType` kararindan sapma
     * DEGILDIR: uc deger platformun kendi soz dagarcigidir.
     */
    action: text('action').notNull(),

    /**
     * Degisen alanin ADI — ⚠️ DEGERI DEGIL.
     *
     * `updated` icin NOT NULL, `created`/`deleted` icin NULL. Kisit
     * veritabanindadir (`audit_log_field_name_matches_action`), burada
     * TEMSIL EDILEMEZ.
     */
    fieldName: text('field_name'),
  },
  (table) => [
    index('audit_log_resource_idx').on(
      table.tenantId,
      table.resourceType,
      table.resourceId,
      table.occurredAt,
      table.id,
    ),
    index('audit_log_recent_idx').on(table.tenantId, table.occurredAt, table.id),
  ],
);
