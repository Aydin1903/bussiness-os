import { Controller, Get, HttpStatus, Query, UseFilters } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { RequirePermission } from '../../../platform/authz/authz.public';
import { type CashflowSummary, CashflowUseCases } from '../application/cashflow.use-cases';
import { CASHFLOW_READ } from '../finance.permissions';
import { FinanceDomainExceptionFilter } from './finance-domain-exception.filter';
import { summaryQuerySchema, type SummaryQuery } from './finance.dto';

/**
 * Nakit akisi ozeti (ADR-0034 §5).
 *
 * ============================================================================
 * TEK UC, TEK FIIL — bu bir RAPORLAMA MODULU DEGILDIR
 * ============================================================================
 * ADR "basit toplam, karmasik raporlama degil" dedi. Bu controller o sinirin
 * somut halidir: tek bir `GET`, iki tarih ve bir bayrak. Gruplandirma
 * secenekleri (aya gore, haftaya gore, projeye gore), grafik verisi, karsilastirma
 * donemi ve disa aktarma KAPSAM DISIDIR.
 *
 * ⚠️ Rota `finance/summary`; `finance/categories` ve `finance/transactions` ile
 * CAKISMAZ — ucu de SABIT onek tasiyor ve hicbiri `finance/:id` gibi bir
 * yakalayici tanimlamiyor.
 */
@ApiTags('finance')
@Controller({ path: 'finance/summary', version: '1' })
@UseFilters(FinanceDomainExceptionFilter)
export class CashflowController {
  constructor(private readonly useCases: CashflowUseCases) {}

  /**
   * ⚠️ IZIN `cashflow:read`, `transaction:read` DEGIL.
   *
   * "Ozeti gorur ama tek tek islemleri gormez" gercek bir taleptir ve ayrimin
   * tek somut sonucu budur: bu ucun kendi kapisi var (gerekce
   * `finance.permissions.ts`'te).
   */
  @Get()
  @RequirePermission(CASHFLOW_READ)
  @ApiOperation({
    summary: 'Nakit akisi ozeti — PARA BIRIMI BASINA ayri satir (toplanmaz)',
    description:
      'Farkli para birimleri BIRLESTIRILMEZ: her para birimi kendi income/expense/net satirini alir. ' +
      'Kur cevrimi kapsam disidir (ADR-0034 §5.1). Aralik verilmezse tum gecmis toplanir.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Ozet donduruldu.' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'cashflow:read yalnizca owner/admin.' })
  async summary(
    @Query(new ZodValidationPipe(summaryQuerySchema)) query: SummaryQuery,
  ): Promise<CashflowSummary> {
    // `?? null`: Zod'un `.optional()` ciktisi "anahtar var, degeri `undefined`"
    // demektir; use case "filtre yok"u `null` ile ifade eder.
    return this.useCases.summarize({
      from: query.from ?? null,
      to: query.to ?? null,
      includeCategories: query.includeCategories,
    });
  }
}
