import { date, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { hrEmployees } from './hr-employees.schema';
import { hrSchema } from './hr-schema.schema';
import { tenants } from './tenants.schema';

/**
 * `hr.leave_requests` — izin takibi (ADR-0044 §2, §5).
 *
 * ============================================================================
 * ⚠️⚠️ BU TABLODA "SEBEP" ALANI YOKTUR — VE BU, SUS DEGIL, SINIRIN TASIYICISI
 * ============================================================================
 * Bir izin kaydinin en dogal alani "sebep"tir ve oraya ILK YAZILACAK SEY
 * "RAPORLU"DUR. ADR-0043 §3 saglik verisini KVKK m.6 ozel nitelikli veri
 * rejimi geregi KESIN OLARAK disarida tutmustu; serbest not alani da tam bu
 * yuzden hic acilmamisti.
 *
 * Bir "sebep" alani o sinirin ARKA KAPISIDIR: sinir yerinde gorunur, kullanici
 * onu ihlal eder ve hata SESSIZDIR.
 *
 * ⚠️ AYNI SEBEPLE `type` icinde `sick`/`raporlu` YOKTUR: bir izin turu olarak
 * "hastalik" secmek, o satiri serbest metin olmasa bile SAGLIK VERISI yapardi.
 *
 * ⚠️ `days` KOLONU DA YOK (§2.5): gun sayisi tarihlerden TURETILIR ve IS GUNU
 * hesabi YAPILMAZ — resmi tatiller ULKEYE OZEL MEVZUATTIR.
 *
 * ⚠️ BAKIYE DE KOLON DEGILDIR (§2.3) — projede ONBIRINCI kez ayni karar.
 */
export const hrLeaveRequests = hrSchema.table(
  'leave_requests',
  {
    id: uuid('id').primaryKey(),

    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /**
     * ⚠️ `CASCADE` — ucret defterinden (RESTRICT) BILINCLI SAPMA: ucret
     * gecmisi silinirse ADR-0043 §6.2'nin denetim cevabi kaybolur; bir izin
     * kaydinin silinen bir calisandan sonra yasamasi ise ANLAMSIZDIR.
     */
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => hrEmployees.id, { onDelete: 'cascade' }),

    /** `annual` | `unpaid` | `excuse` | `administrative` — ⚠️ `sick` YOK. */
    type: text('type').notNull(),

    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),

    status: text('status').notNull().default('pending'),

    requestedByUserId: uuid('requested_by_user_id').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),

    /**
     * ⚠️ SATIR ICI AKTOR DAMGASI — bir DENETIM IZI DEGILDIR (ADR-0041 §8.2'nin
     * ayni ayrimi). Burada yeterlidir: cevaplanacak soru tektir, "bu izni kim
     * onayladi". `platform.audit_log`a BAGLANMAZ.
     */
    decidedByUserId: uuid('decided_by_user_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (table) => [
    index('leave_employee_idx').on(table.tenantId, table.employeeId, table.startsOn),
    index('leave_status_range_idx').on(table.tenantId, table.status, table.startsOn, table.endsOn),
  ],
);
