import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { getPrincipal } from '../../../infrastructure/auth/auth-context';
import { RequirePermission } from '../../../platform/authz/authz.public';
import { GetLatestDailyReportUseCase } from '../application/get-latest-daily-report.use-case';
import { REPORT_READ } from '../knowledge.permissions';
import { KnowledgeDomainExceptionFilter } from './knowledge-domain-exception.filter';

interface DailyReportResponse {
  /** Henuz uretilmis rapor yoksa `null` — HATA DEGIL, normal durum. */
  readonly report: {
    readonly reportDate: string;
    readonly summary: string;
    readonly generatedAt: string;
  } | null;
}

const DAILY_REPORT_DESCRIPTION =
  'Aktif tenant in EN SON uretilmis gunluk raporu (ADR-0030 §2.2). Teslimat ' +
  'YALNIZCA uygulama icidir; e-posta gonderilmez. Rapor yoksa `report: null` ' +
  've `200` doner — yeni bir tenant in raporunun olmamasi normal bir durumdur, ' +
  'hata degil. Uretilmemis (bekleyen ya da olu mektup) kayitlar rapor SAYILMAZ.';

const FORBIDDEN_DESCRIPTION =
  'Kimliksiz istek, tenant secilmemis token veya report:read yetkisi olmayan rol.';

/**
 * Gunluk rapor okuma ucu (ADR-0030 §2.2).
 *
 * ============================================================================
 * NEDEN `NoteController`'DA DEGIL
 * ============================================================================
 * Kaynak farkli: bu uc `notes` degil `daily_report_runs` okur ve farkli bir
 * permission (`report:read`) tasir. `NoteController`'a eklendiginde dorduncu
 * use case oluyordu ve constructor sinirini asiyordu — bu, sinifin iki isi
 * birden yaptiginin somut isaretiydi.
 *
 * Ayni `@Controller({ path: 'knowledge' })` altinda kalir: modul siniri
 * degismez, yalnizca sinif bolunur.
 * ============================================================================
 */
@ApiTags('knowledge')
@Controller({ path: 'knowledge', version: '1' })
@UseFilters(KnowledgeDomainExceptionFilter)
export class DailyReportController {
  constructor(private readonly latestDailyReport: GetLatestDailyReportUseCase) {}

  /**
   * ADR-0030 §2.2'nin "teslimat YALNIZCA uygulama ici" kararinin karsiligi:
   * ayri bir `notifications` tablosu yoktur, `daily_report_runs` satirinin
   * KENDISI kayittir ve dashboard onu buradan okur.
   *
   * Oran sinirina TABI DEGIL: AI cagrisi yapmaz, tek satir okur.
   */
  @Get('daily-report')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(REPORT_READ)
  @ApiOperation({ summary: 'En son gunluk rapor', description: DAILY_REPORT_DESCRIPTION })
  @ApiResponse({ status: HttpStatus.OK, description: 'Rapor veya `null` dondu.' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: FORBIDDEN_DESCRIPTION })
  async dailyReport(): Promise<DailyReportResponse> {
    requireTenantPrincipal();

    const { report } = await this.latestDailyReport.execute();
    if (report === null) {
      return { report: null };
    }

    return {
      report: {
        reportDate: report.reportDate,
        summary: report.summary,
        // Istemciye ISO 8601 string: `Date` serilestirmesini JSON'a birakmak,
        // bicimi somut sozlesme yerine tesadufe birakmak olurdu.
        generatedAt: report.generatedAt.toISOString(),
      },
    };
  }
}

/**
 * ⚠️ PRATIKTE ULASILMAZ — `PermissionGuard` handler'dan ONCE calisir ve hem
 * kimliksiz istegi hem tenant secilmemis token'i 403 ile keser. Buradaki
 * kontrol bir SAVUNMA KATMANIDIR (`NoteController`'daki ikiziyle ayni gerekce):
 * guard kaldirilir veya `@RequirePermission` unutulursa, tenant context'siz
 * devam etmek sessiz bir 500 uretirdi.
 */
function requireTenantPrincipal(): void {
  const principal = getPrincipal();

  if (principal?.tenantId == null) {
    throw new UnauthorizedException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
  }
}
