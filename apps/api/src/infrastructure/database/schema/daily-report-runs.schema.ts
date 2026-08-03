import { check, date, index, integer, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { knowledgeSchema } from './knowledge.schema';
import { tenants } from './tenants.schema';

/**
 * `knowledge.daily_report_runs` — gunluk rapor kuyrugu VE sonucu (ADR-0030 §2).
 *
 * ============================================================================
 * KUYRUK POSTGRESQL'DIR — ayri bir broker YOK
 * ============================================================================
 * ADR-0030 §2.1: BullMQ/Redis kurulmadi. Tenant basina gunde BIR is icin ayri
 * bir kuyruk teknolojisi orantisizdi ve Cache/Redis kararini ISTEMEDEN vermis
 * olurduk. Mekanizma `platform.outbox` tuketicisinin aynisidir: `FOR UPDATE
 * SKIP LOCKED` + `attempt_count`/`last_error`/backoff/dead-letter.
 * ============================================================================
 *
 * ============================================================================
 * `status` KOLONU YOK — bilincli
 * ============================================================================
 * Durum iki zaman alanindan TURER: `generated_at` doluysa uretildi,
 * `dead_lettered_at` doluysa vazgecildi, ikisi de bossa bekliyor.
 * `platform.outbox` ile birebir. Ayri bir `status` kolonu ikinci bir dogruluk
 * kaynagi olur ve biri digerini yalanlayabilirdi.
 * ============================================================================
 *
 * SATIRLARI KIM YARATIR: use case, o gun ILK NOT eklendiginde upsert eder
 * ("tembel seed"). Zamanlayici tenant LISTESI ARAMAZ — `businessos_report_worker`
 * rolunun gercekten TEK tabloya yetkili kalabilmesi buna baglidir.
 */
export const dailyReportRuns = knowledgeSchema.table(
  'daily_report_runs',
  {
    id: uuid('id').primaryKey(),

    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /** Raporun AIT OLDUGU gun (UTC). Bir ana degil, bir gune aittir. */
    reportDate: date('report_date').notNull(),

    /** AI ozeti. Uretilene kadar `null`. */
    summary: text('summary'),

    /** Dolu ise rapor URETILDI. */
    generatedAt: timestamp('generated_at', { withTimezone: true }),

    // --- Teslimat yeniden deneme (migration 0009 deseni) --------------------
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    deadLetteredAt: timestamp('dead_lettered_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * IDEMPOTENCY ANAHTARI (ADR-0030 §2.1). "Tembel seed" upsert'i buna dayanir;
     * kacirilan tick / yeniden baslatma / cift instance kendiliginden cozulur.
     */
    unique('daily_report_runs_tenant_date_unique').on(table.tenantId, table.reportDate),

    // Kuyruk taramasi: yalnizca bekleyenler, olu kayitlar elenir.
    index('daily_report_runs_pending_idx')
      .on(table.nextAttemptAt, table.reportDate)
      .where(sql`generated_at IS NULL AND dead_lettered_at IS NULL`),

    index('daily_report_runs_dead_letter_idx')
      .on(table.deadLetteredAt)
      .where(sql`dead_lettered_at IS NOT NULL`),

    // Dashboard "en son rapor" sorar (ADR-0030 §2.2).
    index('daily_report_runs_tenant_date_idx').on(table.tenantId, table.reportDate.desc()),

    check('daily_report_runs_attempt_count_check', sql`attempt_count >= 0`),
    check(
      'daily_report_runs_terminal_state_check',
      sql`NOT (generated_at IS NOT NULL AND dead_lettered_at IS NOT NULL)`,
    ),
    // Bos ozetli "basarili" rapor sessiz bir hatadir.
    check(
      'daily_report_runs_summary_when_generated',
      sql`generated_at IS NULL OR (summary IS NOT NULL AND length(btrim(summary)) > 0)`,
    ),
  ],
);
