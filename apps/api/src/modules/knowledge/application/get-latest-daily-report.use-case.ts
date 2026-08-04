import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type DailyReportRunRepository } from './daily-report-run.repository.port';

export interface LatestDailyReport {
  /** UTC gun (`YYYY-MM-DD`). */
  readonly reportDate: string;
  readonly summary: string;
  readonly generatedAt: Date;
}

export interface GetLatestDailyReportResult {
  /** Henuz uretilmis rapor yoksa `null` — bu bir HATA DEGIL, normal durum. */
  readonly report: LatestDailyReport | null;
}

export interface GetLatestDailyReportDependencies {
  readonly reportRepository: DailyReportRunRepository;
  readonly transactionManager: TransactionManager;
}

/**
 * Aktif tenant'in EN SON uretilmis gunluk raporunu doner (ADR-0030 §2.2).
 *
 * ============================================================================
 * TESLIMAT YALNIZCA UYGULAMA ICI
 * ============================================================================
 * ADR-0030 §2.2: teslimat dashboard kartidir, **e-posta YOK**, ve ayri bir
 * `notifications` tablosu KURULMAZ — `daily_report_runs` satirinin KENDISI
 * kayittir. Bu uc, o kararin somut karsiligidir.
 *
 * ============================================================================
 * RAPOR YOKSA `null` — 404 DEGIL
 * ============================================================================
 * Yeni acilmis bir tenant'in raporunun olmamasi NORMAL bir durumdur, bir hata
 * degil. `404` dondurmek istemciyi normal bir durumu hata yolunda islemeye
 * zorlardi (`notes/exists`'te boolean donmesiyle ayni gerekce).
 *
 * URETILMEMIS kayitlar da doner DEGIL: `generated_at` dolu olanlar arasindan en
 * yenisi secilir. Bekleyen ya da olu mektuba dusmus bir satiri "rapor" diye
 * gostermek, ozeti olmayan bos bir kart demekti.
 * ============================================================================
 */
export class GetLatestDailyReportUseCase {
  constructor(private readonly deps: GetLatestDailyReportDependencies) {}

  async execute(): Promise<GetLatestDailyReportResult> {
    const report = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.reportRepository.findLatestGenerated(),
    );

    return { report };
  }
}
