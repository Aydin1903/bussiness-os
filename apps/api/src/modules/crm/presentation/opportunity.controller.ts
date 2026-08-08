import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { getPrincipal } from '../../../infrastructure/auth/auth-context';
import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { RequirePermission } from '../../../platform/authz/authz.public';
import { type OpportunityListRow } from '../application/opportunity.repository.port';
import { OpportunityUseCases } from '../application/opportunity.use-cases';
import { type OpportunityState } from '../domain/opportunity.entity';
import { OPPORTUNITY_DELETE, OPPORTUNITY_READ, OPPORTUNITY_WRITE } from '../crm.permissions';
import {
  createOpportunitySchema,
  idParamSchema,
  listOpportunitiesQuerySchema,
  updateOpportunitySchema,
  type CreateOpportunityBody,
  type ListOpportunitiesQuery,
  type UpdateOpportunityBody,
} from './crm.dto';
import { CrmDomainExceptionFilter } from './crm-domain-exception.filter';

/**
 * Liste yaniti — sirket/kisi ikizleriyle ayni desen, TEK farkla: satirlar
 * `companyName` TASIR.
 *
 * Fark hattin (pipeline) gercek ihtiyacindan dogdu: orasi sirketler arasi bir
 * gorunumdur ve her kart hangi sirkete ait oldugunu SOYLEMEK zorundadir.
 * Alternatif — istemcinin tum sirketleri cekip id->ad haritasi kurmasi — hem
 * her ekrana fazladan bir cagri ekler hem de sayfa basina 100 sirket sinirinin
 * uzerinde satirin sirketini GOSTEREMEZDI.
 *
 * Tek kayit uclari (`GET :id`, `POST`, `PATCH`) DEGISMEDI: orada sirket zaten
 * baglamdan bellidir.
 */
interface OpportunityListResponse {
  readonly items: readonly OpportunityListRow[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

/**
 * Firsat uclari (ADR-0031 §2).
 *
 * ============================================================================
 * ASAMA GECISI SERBESTTIR — uc bir SIRA DAYATMAZ
 * ============================================================================
 * `PATCH` ile `lost` -> `in_discussion` gecerli bir istektir ve 200 doner.
 * Gerekce entity yorumunda: engellemek kullaniciyi asamayi hic
 * guncellememeye iter, veri bayatlar ve AI bayat veriyle cevap verir.
 *
 * `stage_changed_at` yalnizca GERCEK degisimde ilerler; ayni asamayi tekrar
 * gondermek "kac gundur bu asamada" sinyalini SIFIRLAMAZ.
 * ============================================================================
 */
@ApiTags('crm')
@Controller({ path: 'crm/opportunities', version: '1' })
@UseFilters(CrmDomainExceptionFilter)
export class OpportunityController {
  constructor(private readonly useCases: OpportunityUseCases) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(OPPORTUNITY_WRITE)
  @ApiOperation({ summary: 'Firsat olusturur' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Firsat olusturuldu.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Sirket veya kisi bulunamadi.' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Gecersiz govde (ornegin tutar var ama para birimi yok).',
  })
  async create(
    @Body(new ZodValidationPipe(createOpportunitySchema)) body: CreateOpportunityBody,
  ): Promise<OpportunityState> {
    const tenantId = requireTenantId();

    return this.useCases.create({
      tenantId,
      companyId: body.companyId,
      fields: {
        title: body.title,
        stage: body.stage,
        estimatedValue: body.estimatedValue ?? null,
        currency: body.currency ?? null,
        nextFollowUpOn: body.nextFollowUpOn ?? null,
        contactId: body.contactId ?? null,
      },
    });
  }

  /** `companyId` ve `stage` ile filtrelenebilir. */
  @Get()
  @RequirePermission(OPPORTUNITY_READ)
  @ApiOperation({ summary: 'Firsatlari listeler' })
  async list(
    @Query(new ZodValidationPipe(listOpportunitiesQuerySchema)) query: ListOpportunitiesQuery,
  ): Promise<OpportunityListResponse> {
    const page = await this.useCases.list({
      limit: query.limit,
      offset: query.offset,
      companyId: query.companyId ?? null,
      stage: query.stage ?? null,
      orderBy: query.order,
    });

    return { ...page, limit: query.limit, offset: query.offset };
  }

  @Get(':id')
  @RequirePermission(OPPORTUNITY_READ)
  @ApiOperation({ summary: 'Tek firsati doner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Firsat bulunamadi.' })
  async get(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<OpportunityState> {
    return this.useCases.get(params.id);
  }

  @Patch(':id')
  @RequirePermission(OPPORTUNITY_WRITE)
  @ApiOperation({ summary: 'Firsati kismi gunceller (asama gecisi serbesttir)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Firsat bulunamadi.' })
  async update(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateOpportunitySchema)) body: UpdateOpportunityBody,
  ): Promise<OpportunityState> {
    return this.useCases.update({ id: params.id, changes: body });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(OPPORTUNITY_DELETE)
  @ApiOperation({ summary: 'Firsati siler' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Silindi.' })
  async remove(@Param(new ZodValidationPipe(idParamSchema)) params: { id: string }): Promise<void> {
    await this.useCases.delete(params.id);
  }
}

/** Savunma katmani; guard zaten handler'dan once keser. */
function requireTenantId(): string {
  const principal = getPrincipal();

  if (principal?.tenantId == null) {
    throw new UnauthorizedException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
  }

  return principal.tenantId;
}
