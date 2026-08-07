import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import {
  getPrincipal,
  type AuthenticatedPrincipal,
} from '../../../infrastructure/auth/auth-context';
import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { RequirePermission } from '../../../platform/authz/authz.public';
import { InteractionUseCases } from '../application/interaction.use-cases';
import { INTERACTION_CREATE, INTERACTION_READ } from '../crm.permissions';
import { type InteractionState } from '../domain/interaction.entity';
import {
  createInteractionSchema,
  listInteractionsQuerySchema,
  type CreateInteractionBody,
  type ListInteractionsQuery,
} from './crm.dto';
import { CrmDomainExceptionFilter } from './crm-domain-exception.filter';

interface CreateInteractionResponse {
  readonly interactionId: string;
  /** Uretilen parca sayisi — `0` ise gorusme ARANABILIR DEGILDIR. */
  readonly chunkCount: number;
}

interface InteractionListResponse {
  readonly items: readonly InteractionState[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

const CREATE_DESCRIPTION =
  'Gorusme kaydedilir (T1), ardindan transaction DISINDA parcalanip gomulur ve ' +
  'parcalar yazilir (T2). Her parca `[Sirket · Tarih]` baglam basligi tasir: bir ' +
  'gorusmenin kimligi FK kolonundadir, metinde degil.';

const REINDEX_DESCRIPTION =
  'Parcasiz gorusmeleri onarir. Is listesi TURETILMISTIR (parcanin yoklugu); ' +
  'ayri bir "onarilacaklar" tablosu yoktur. Oran siniri `create_interaction` ' +
  'kovasini PAYLASIR — ayri bir kova onarimi butcesiz bir yan kapiya cevirirdi.';

/**
 * Gorusme uclari (ADR-0031 §1, §4).
 *
 * ============================================================================
 * EKLEME-YALNIZ — `PATCH`/`DELETE` YOK
 * ============================================================================
 * Gorusme bir GUNLUK KAYDIDIR; duzeltilmez, yanlissa yenisi yazilir
 * (ADR-0031 kapsam disi). Izin katalogu da bunu yansitir: yalnizca
 * `interaction:read` ve `interaction:create`. Silme, sirket cascade'i
 * uzerinden gerceklesir.
 *
 * ⚠️ `POST /crm/reindex` ILK GUNDEN vardir. Knowledge'da bu SONRADAN geldi ve
 * "parcasiz not" aylarca yalnizca TESPIT EDILEBILIR kaldi; o ders burada
 * tekrarlanmiyor.
 * ============================================================================
 */
@ApiTags('crm')
@Controller({ path: 'crm', version: '1' })
@UseFilters(CrmDomainExceptionFilter)
export class InteractionController {
  constructor(private readonly useCases: InteractionUseCases) {}

  @Post('interactions')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(INTERACTION_CREATE)
  @ApiOperation({ summary: 'Gorusme kaydeder ve indeksler', description: CREATE_DESCRIPTION })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Gorusme kaydedildi ve indekslendi.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Sirket bulunamadi.' })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Saatlik gorusme payi tukendi.',
  })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    description: 'Gorusme KAYDEDILDI ancak indekslenemedi; onarim icin /crm/reindex.',
  })
  async create(
    @Body(new ZodValidationPipe(createInteractionSchema)) body: CreateInteractionBody,
  ): Promise<CreateInteractionResponse> {
    const principal = requireTenantPrincipal();

    const result = await this.useCases.create({
      tenantId: principal.tenantId,
      userId: principal.userId,
      companyId: body.companyId,
      contactId: body.contactId ?? null,
      opportunityId: body.opportunityId ?? null,
      occurredOn: body.occurredOn,
      body: body.body,
    });

    return { interactionId: result.interaction.id, chunkCount: result.chunkCount };
  }

  @Get('interactions')
  @RequirePermission(INTERACTION_READ)
  @ApiOperation({ summary: 'Gorusmeleri listeler' })
  async list(
    @Query(new ZodValidationPipe(listInteractionsQuerySchema)) query: ListInteractionsQuery,
  ): Promise<InteractionListResponse> {
    const page = await this.useCases.list({
      limit: query.limit,
      offset: query.offset,
      companyId: query.companyId ?? null,
      opportunityId: query.opportunityId ?? null,
    });

    return { ...page, limit: query.limit, offset: query.offset };
  }

  /** Parcasiz gorusme sayisi — onarim banner'inin besledigi uc. */
  @Get('interactions/unindexed')
  @RequirePermission(INTERACTION_READ)
  @ApiOperation({ summary: 'Aranabilir olmayan gorusme sayisi' })
  async unindexed(): Promise<{ count: number }> {
    return { count: await this.useCases.countUnindexed() };
  }

  @Post('reindex')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(INTERACTION_CREATE)
  @ApiOperation({ summary: 'Parcasiz gorusmeleri onarir', description: REINDEX_DESCRIPTION })
  @ApiResponse({ status: HttpStatus.OK, description: 'Onarim turu tamamlandi.' })
  async reindex(): Promise<{ repaired: number; failed: number }> {
    const principal = requireTenantPrincipal();
    return this.useCases.reindex({ tenantId: principal.tenantId, userId: principal.userId });
  }
}

/** Savunma katmani; guard zaten handler'dan once keser. */
function requireTenantPrincipal(): AuthenticatedPrincipal & { tenantId: string } {
  const principal = getPrincipal();

  if (principal?.tenantId == null) {
    throw new UnauthorizedException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
  }

  return { ...principal, tenantId: principal.tenantId };
}
