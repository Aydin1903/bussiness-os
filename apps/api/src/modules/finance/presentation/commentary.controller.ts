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
import { CommentaryUseCases } from '../application/commentary.use-cases';
import { type CommentaryState } from '../domain/commentary.entity';
import { COMMENTARY_CREATE, COMMENTARY_READ } from '../finance.permissions';
import { FinanceDomainExceptionFilter } from './finance-domain-exception.filter';
import {
  createCommentarySchema,
  listCommentariesQuerySchema,
  type CreateCommentaryBody,
  type ListCommentariesQuery,
} from './finance.dto';

interface CreateCommentaryResponse {
  readonly commentaryId: string;
  /** Uretilen parca sayisi — `0` ise yorum ARANABILIR DEGILDIR. */
  readonly chunkCount: number;
}

interface CommentaryListResponse {
  readonly items: readonly CommentaryState[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

const CREATE_DESCRIPTION =
  'Yorum kaydedilir (T1), ardindan transaction DISINDA parcalanip gomulur ve ' +
  'parcalar yazilir (T2). Her parca `[Finansal yorum · Tarih]` baglam basligi ' +
  'tasir. ⚠️ ISLEM ACIKLAMALARI GOMULMEZ (ADR-0034 §6.1): binlerce neredeyse ' +
  'ozdes kisa vektor, dort kaynagin paylastigi top-K havuzunu kirletirdi.';

const REINDEX_DESCRIPTION =
  'Parcasiz yorumlari onarir. Is listesi TURETILMISTIR (parcanin yoklugu); ayri ' +
  'bir "onarilacaklar" tablosu yoktur. Oran siniri `create_commentary` kovasini ' +
  'PAYLASIR. ⚠️ Bu modulde onarim YALNIZCA eksik parca icindir — baglam basligi ' +
  'denormalize bir ad tasimadigi icin bayatlayacak bir sey yoktur.';

/**
 * Finansal yorum uclari (ADR-0034 §6.1, §9).
 *
 * ============================================================================
 * EKLEME-YALNIZ — `PATCH`/`DELETE` YOK
 * ============================================================================
 * Yorum bir GUNLUK KAYDIDIR; duzeltilmez, yanlissa yenisi yazilir (ADR-0034
 * §11). Izin katalogu da bunu yansitir: yalnizca `commentary:read` ve
 * `commentary:create`.
 *
 * ⚠️ Bu, `finance.transactions`in DUZELTILEBILIR olmasiyla CELISMEZ: islem bir
 * VERI kaydidir (yanlis tutar duzeltilmelidir), yorum ise bir ANLATIDIR.
 *
 * ⚠️ Rota `finance` KOKUNDE (`finance/commentaries`, `finance/reindex`) ama
 * hicbir kardes controller `finance/:id` gibi bir yakalayici tanimlamiyor, yani
 * `ProjectController`in dogurdugu kayit sirasi bagimliligi burada YOK.
 */
@ApiTags('finance')
@Controller({ path: 'finance', version: '1' })
@UseFilters(FinanceDomainExceptionFilter)
export class CommentaryController {
  constructor(private readonly useCases: CommentaryUseCases) {}

  @Post('commentaries')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(COMMENTARY_CREATE)
  @ApiOperation({
    summary: 'Finansal yorum kaydeder ve indeksler',
    description: CREATE_DESCRIPTION,
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Yorum kaydedildi ve indekslendi.' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Saatlik yorum payi tukendi.' })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    description: 'Yorum KAYDEDILDI ancak indekslenemedi; onarim icin /finance/reindex.',
  })
  async create(
    @Body(new ZodValidationPipe(createCommentarySchema)) body: CreateCommentaryBody,
  ): Promise<CreateCommentaryResponse> {
    const principal = requireTenantPrincipal();

    const result = await this.useCases.create({
      tenantId: principal.tenantId,
      userId: principal.userId,
      occurredOn: body.occurredOn ?? null,
      body: body.body,
    });

    return { commentaryId: result.commentary.id, chunkCount: result.chunkCount };
  }

  @Get('commentaries')
  @RequirePermission(COMMENTARY_READ)
  @ApiOperation({ summary: 'Finansal yorumlari listeler (donem araligi)' })
  async list(
    @Query(new ZodValidationPipe(listCommentariesQuerySchema)) query: ListCommentariesQuery,
  ): Promise<CommentaryListResponse> {
    const page = await this.useCases.list({
      limit: query.limit,
      offset: query.offset,
      from: query.from ?? null,
      to: query.to ?? null,
    });

    return { ...page, limit: query.limit, offset: query.offset };
  }

  /** Parcasiz yorum sayisi — onarim banner'inin besledigi uc. */
  @Get('commentaries/unindexed')
  @RequirePermission(COMMENTARY_READ)
  @ApiOperation({ summary: 'Aranabilir olmayan yorum sayisi' })
  async unindexed(): Promise<{ count: number }> {
    return { count: await this.useCases.countUnindexed() };
  }

  @Post('reindex')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(COMMENTARY_CREATE)
  @ApiOperation({ summary: 'Parcasiz yorumlari onarir', description: REINDEX_DESCRIPTION })
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
