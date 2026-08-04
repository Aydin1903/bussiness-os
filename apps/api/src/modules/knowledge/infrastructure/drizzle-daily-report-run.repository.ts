import { Injectable } from '@nestjs/common';
import { and, desc, gte, isNotNull, sql } from 'drizzle-orm';

import { dailyReportRuns, notes } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import type {
  ClaimedReportRun,
  DailyReportRunRepository,
  GeneratedReport,
  ReportNote,
} from '../application/daily-report-run.repository.port';
import type { TenantId } from '../domain/tenant-id.value-object';

/**
 * `knowledge.claim_daily_report_batch` fonksiyonunun dondurdugu ham satir.
 *
 * `type` (interface DEGIL): drizzle `db.execute<T>`, T'nin
 * `Record<string, unknown>` kisitini saglamasini bekler; object-literal `type`
 * implicit index signature tasir, `interface` TASIMAZ (`ClaimedRow` ile ayni
 * gerekce — bu yuzden `consistent-type-definitions` bilincli devre disi).
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type ClaimedReportRow = {
  readonly id: string;
  readonly tenant_id: string;
  readonly report_date: string;
  readonly attempt_count: number;
};

/**
 * `DailyReportRunRepository`'nin Drizzle implementasyonu — "tembel seed".
 *
 * ============================================================================
 * NEDEN `ON CONFLICT DO NOTHING`, NEDEN "ONCE OKU SONRA YAZ" DEGIL
 * ============================================================================
 * Ayni tenant'a ayni anda iki not eklenebilir. "Once var mi diye bak, yoksa
 * yaz" yaklasimi iki istek arasinda bir YARIS birakir ve ikisi de "yok" gorup
 * yazmaya calisir — biri unique kisitina takilip istegin TAMAMINI dusururdu.
 *
 * `ON CONFLICT (tenant_id, report_date) DO NOTHING` bu yarisi veritabanina
 * devreder: ikinci yazim sessizce atlanir, not kaydi etkilenmez. Idempotency
 * kisiti migration 0012'de tanimlidir.
 * ============================================================================
 */
@Injectable()
export class DrizzleDailyReportRunRepository implements DailyReportRunRepository {
  async ensureScheduled(input: {
    readonly id: string;
    readonly tenantId: TenantId;
    readonly reportDate: string;
  }): Promise<void> {
    const { db } = requireTransaction();

    await db
      .insert(dailyReportRuns)
      .values({
        id: input.id,
        tenantId: input.tenantId.value,
        reportDate: input.reportDate,
      })
      .onConflictDoNothing({
        target: [dailyReportRuns.tenantId, dailyReportRuns.reportDate],
      });
  }

  /**
   * ⚠️ DUZ SORGU DEGIL, SQL FONKSIYONU.
   *
   * `daily_report_runs` standart RLS sablonunu tasir ve politika
   * `tenant_id = current_setting('app.current_tenant_id')` der. Zamanlayici
   * tenant'lar ARASI okur ve tenant context'i YOKTUR — duz bir `SELECT` ya
   * hicbir satir dondurur ya da context yoklugundan hata verirdi.
   *
   * Asim `businessos_report_worker`'in sahip oldugu UC fonksiyon imzasinda
   * toplanmistir; genel bir "raporlari oku" yetkisi yoktur (ADR-0030 §2.4).
   */
  async claimPending(input: {
    readonly limit: number;
    readonly now: Date;
    readonly today: string;
  }): Promise<ClaimedReportRun[]> {
    const { db } = requireTransaction();

    // Kilit, cagiran transaction adina alinir ve T1 sonuna kadar tutulur.
    const result = await db.execute<ClaimedReportRow>(
      sql`SELECT * FROM knowledge.claim_daily_report_batch(${input.limit}, ${input.now}, ${input.today}::date)`,
    );

    return [...result.rows].map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      reportDate: row.report_date.slice(0, 10),
      attemptCount: row.attempt_count,
    }));
  }

  async markGenerated(input: {
    readonly id: string;
    readonly summary: string;
    readonly generatedAt: Date;
  }): Promise<void> {
    const { db } = requireTransaction();

    await db.execute(
      sql`SELECT knowledge.mark_daily_report_generated(${input.id}::uuid, ${input.summary}, ${input.generatedAt})`,
    );
  }

  async recordFailure(input: {
    readonly id: string;
    readonly attemptCount: number;
    readonly lastError: string;
    readonly nextAttemptAt: Date | null;
    readonly deadLetteredAt: Date | null;
  }): Promise<void> {
    const { db } = requireTransaction();

    await db.execute(
      sql`SELECT knowledge.record_daily_report_failure(
            ${input.id}::uuid,
            ${input.attemptCount},
            ${input.lastError},
            ${input.nextAttemptAt},
            ${input.deadLetteredAt}
          )`,
    );
  }

  /**
   * ⚠️ Digerlerinin AKSINE duz Drizzle sorgusu — ve bu tam olarak istenen.
   *
   * Bu metot TENANT CONTEXT'I altinda cagrilir; daraltmayi RLS yapar, elle
   * `WHERE tenant_id` YOKTUR. Dar role bir "notlari oku" fonksiyonu eklemek
   * onun sozlesmesini (yalnizca `daily_report_runs`) kirardi.
   */
  async listNotesSince(since: Date): Promise<ReportNote[]> {
    const { db } = requireTransaction();

    const rows = await db
      .select({ title: notes.title, body: notes.body })
      .from(notes)
      .where(gte(notes.createdAt, since))
      .orderBy(desc(notes.createdAt));

    return rows.map((row) => ({ title: row.title, body: row.body }));
  }

  /**
   * En son URETILMIS rapor. Tenant daraltmasi RLS'te; elle filtre YOK.
   *
   * `generated_at` NULL olanlar disarida: bekleyen bir satir rapor degildir.
   * Siralama `generated_at`'e gore — `report_date` degil: geriye donuk uretilen
   * bir rapor (backfill) en son gorulen olmamalidir.
   */
  async findLatestGenerated(): Promise<GeneratedReport | null> {
    const { db } = requireTransaction();

    const rows = await db
      .select({
        reportDate: dailyReportRuns.reportDate,
        summary: dailyReportRuns.summary,
        generatedAt: dailyReportRuns.generatedAt,
      })
      .from(dailyReportRuns)
      .where(and(isNotNull(dailyReportRuns.generatedAt), isNotNull(dailyReportRuns.summary)))
      .orderBy(desc(dailyReportRuns.generatedAt))
      .limit(1);

    const row = rows[0];
    if (row?.summary == null || row.generatedAt == null) {
      return null;
    }

    return {
      reportDate: row.reportDate.slice(0, 10),
      summary: row.summary,
      generatedAt: row.generatedAt,
    };
  }
}
