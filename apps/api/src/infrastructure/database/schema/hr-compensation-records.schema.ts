import { date, index, numeric, timestamp, unique, uuid, char, text } from 'drizzle-orm/pg-core';

import { hrEmployees } from './hr-employees.schema';
import { hrSchema } from './hr-schema.schema';
import { tenants } from './tenants.schema';

/**
 * `hr.compensation_records` — EKLEME-YALNIZ ucret defteri (ADR-0043 §1.2).
 *
 * ============================================================================
 * ⚠️ DEGISTIRILEMEZLIK BURADA DENETIM IZININ TA KENDISIDIR (§6.2)
 * ============================================================================
 * Projede ucuncu ekleme-yalniz defter, ama gerekce UCUNCU KEZ FARKLI:
 *
 *   `inventory.movements`     -> bugunku miktar ONDAN TURETILIR
 *   `suppliers.interactions`  -> olmus bir gorusme "degismis" olmaz
 *   BU TABLO                  -> ⚠️ "maasi kim, ne zaman degistirdi" sorusunun
 *                                CEVABI, degisikligin KENDISI BIR SATIR oldugu
 *                                icin verilir
 *
 * Yani bu defter `platform.audit_log`a IHTIYAC DUYMADAN hesap verebilirdir —
 * ve ADR-0039'un dersinin dogrudan uygulanmasidir: bir seyi DEGISTIRILEMEZ
 * yapmak, "kim degistirdi"yi CEVAPLAMAKTAN ucuzdur ve daha gucludur.
 *
 * ⚠️ KORUMA UC KATMANLI ve ILK GUNDEN: entity'de `update` metodu yok ·
 * `compensation:delete` izni yok · veritabani yetkisi yok (`GRANT SELECT,
 * INSERT` — migration `0035`).
 *
 * ⚠️ GUNCEL UCRET TURETILIR, kolonda saklanmaz (§1.5) — projede ONUNCU kez
 * ayni karar. Sorgu `effective_from <= CURRENT_DATE` kisitini TASIMAK
 * ZORUNDADIR: gelecek tarihli bir zam mesrudur ve kisit unutulursa BUGUN
 * yururlukteymis gibi okunur (hata SESSIZ).
 */
export const hrCompensationRecords = hrSchema.table(
  'compensation_records',
  {
    id: uuid('id').primaryKey(),

    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /**
     * ⚠️ `ON DELETE RESTRICT` — `CASCADE` DEGIL (§1.4). `CASCADE` olsaydi bir
     * calisani silmek ucret gecmisini de goturur ve §6.2'nin denetim cevabi
     * SESSIZCE yok olurdu.
     */
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => hrEmployees.id, { onDelete: 'restrict' }),

    /** ⚠️ TS tarafinda ASLA `number` degil (ADR-0034 §2c, dorduncu kez). */
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),

    /** ⚠️ Yalnizca SEKIL dogrulanir; kod listesi DOGRULANMAZ. */
    currency: char('currency', { length: 3 }).notNull(),

    period: text('period').notNull().default('monthly'),

    /** ⚠️ GELECEK TARIHLI kayit MESRUDUR (§1.5). */
    effectiveFrom: date('effective_from').notNull(),

    /** ⚠️ Denetim izinin maas tarafini KAPATAN kolon (§6.2). */
    recordedByUserId: uuid('recorded_by_user_id').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    // ⚠️ Ayni gune iki kayit yazilamaz: "bugunku maas" sorusunun iki cevabi
    // olurdu ve kazanani kararli siralama belirlerdi (hata SESSIZ).
    unique('compensation_effective_unique').on(table.employeeId, table.effectiveFrom),
    index('compensation_employee_effective_idx').on(
      table.tenantId,
      table.employeeId,
      table.effectiveFrom,
    ),
  ],
);
