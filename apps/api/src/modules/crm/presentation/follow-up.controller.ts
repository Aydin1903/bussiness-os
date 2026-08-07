import { Controller, Get, Query, UseFilters } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { RequirePermission } from '../../../platform/authz/authz.public';
import { type FollowUpRow } from '../application/opportunity.repository.port';
import { OpportunityUseCases } from '../application/opportunity.use-cases';
import { OPPORTUNITY_READ } from '../crm.permissions';
import { listQuerySchema, type ListQuery } from './crm.dto';
import { CrmDomainExceptionFilter } from './crm-domain-exception.filter';

interface FollowUpListResponse {
  readonly items: readonly FollowUpRow[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

const DESCRIPTION =
  'Takip tarihi olan ve KAPANMAMIS firsatlari kronolojik listeler. GECIKMIS ' +
  'takipler DAHILDIR — en onemlileri onlardir; "gecikmis" isaretini istemci ' +
  'koyar. Kapanan firsat listeden kendiliginden duser.';

/**
 * Takipler gorunumu (ADR-0031 §3).
 *
 * ============================================================================
 * BU BIR TAKVIM MODULU DEGILDIR
 * ============================================================================
 * Gorunumun KENDI VERISI YOKTUR: ayri bir `follow_ups` tablosu kurulmadi.
 * Yalnizca `crm.opportunities` uzerinde TURETILMIS bir sorgudur.
 *
 * Turetilebilir bir bilgiyi kaliciya yazmak ikinci bir dogruluk kaynagi
 * yaratir ve iki kaynak zamanla birbirini yalanlar — projede uc kez verilmis
 * ayni karar (`daily_report_runs`ta `status` kolonunun reddi, yeniden
 * indeksleme is listesinin turetilmis olmasi, yetim not tespitinin `LEFT JOIN`
 * ile yapilmasi).
 *
 * Somut faydasi: firsat kapandiginda takip listeden KENDILIGINDEN duser. Ayri
 * tabloda bunu elle silmek gerekirdi ve biri unutuldugunda liste yalan
 * soylerdi.
 *
 * ============================================================================
 * AYRI CONTROLLER — yalnizca ROUTING gerekcesiyle
 * ============================================================================
 * `@Controller({ path: 'crm/opportunities' })` `/crm/follow-ups` yolunu
 * sunamaz. Kaynak ayni (`opportunity:read` izni), sinif ayri.
 * ============================================================================
 */
@ApiTags('crm')
@Controller({ path: 'crm/follow-ups', version: '1' })
@UseFilters(CrmDomainExceptionFilter)
export class FollowUpController {
  constructor(private readonly useCases: OpportunityUseCases) {}

  @Get()
  @RequirePermission(OPPORTUNITY_READ)
  @ApiOperation({ summary: 'Yaklasan ve gecikmis takipleri listeler', description: DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Kronolojik takip listesi.' })
  async list(
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ): Promise<FollowUpListResponse> {
    const page = await this.useCases.listFollowUps(query);
    return { ...page, limit: query.limit, offset: query.offset };
  }
}
