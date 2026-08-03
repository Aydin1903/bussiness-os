import { Injectable } from '@nestjs/common';

import { dailyReportRuns } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import type { DailyReportRunRepository } from '../application/daily-report-run.repository.port';
import type { TenantId } from '../domain/tenant-id.value-object';

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
}
