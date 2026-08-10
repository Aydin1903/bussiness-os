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
import { ProgressNoteUseCases } from '../application/progress-note.use-cases';
import { type ProgressNoteState } from '../domain/progress-note.entity';
import { PROGRESS_NOTE_CREATE, PROGRESS_NOTE_READ } from '../projects.permissions';
import { ProjectsDomainExceptionFilter } from './projects-domain-exception.filter';
import {
  createProgressNoteSchema,
  listProgressNotesQuerySchema,
  type CreateProgressNoteBody,
  type ListProgressNotesQuery,
} from './projects.dto';

interface CreateProgressNoteResponse {
  readonly progressNoteId: string;
  /** Uretilen parca sayisi — `0` ise not ARANABILIR DEGILDIR. */
  readonly chunkCount: number;
}

interface ProgressNoteListResponse {
  readonly items: readonly ProgressNoteState[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

const CREATE_DESCRIPTION =
  'Not kaydedilir (T1), ardindan transaction DISINDA parcalanip gomulur ve ' +
  'parcalar yazilir (T2). Her parca `[Proje · Tarih]` baglam basligi tasir: bir ' +
  'ilerleme notunun kimligi FK kolonundadir, metinde degil.';

const REINDEX_DESCRIPTION =
  'Parcasiz notlari onarir. Is listesi TURETILMISTIR (parcanin yoklugu); ayri ' +
  'bir "onarilacaklar" tablosu yoktur. Oran siniri `create_progress_note` ' +
  'kovasini PAYLASIR — ayri bir kova onarimi butcesiz bir yan kapiya cevirirdi.';

/**
 * Ilerleme notu uclari (ADR-0033 §1, §6, §9).
 *
 * ============================================================================
 * EKLEME-YALNIZ — `PATCH`/`DELETE` YOK
 * ============================================================================
 * Not bir GUNLUK KAYDIDIR; duzeltilmez, yanlissa yenisi yazilir (ADR-0033
 * §11). Izin katalogu da bunu yansitir: yalnizca `progress_note:read` ve
 * `progress_note:create`. Silme, proje cascade'i uzerinden gerceklesir.
 *
 * ============================================================================
 * ⚠️ BU CONTROLLER DA `ProjectController`DAN ONCE KAYDEDILMEK ZORUNDA
 * ============================================================================
 * `GET /projects/notes` ile `GET /projects/:id` catisiyor — `TaskController`in
 * `GET /projects/tasks`i ile BIREBIR ayni tuzak. NestJS rotalari kayit
 * sirasina gore eslestirir; ters sirada `notes` bir UUID olmadigi icin 422
 * donerdi. `projects.module.ts` sirayi sabitliyor, entegrasyon testi kilitliyor.
 * ============================================================================
 */
@ApiTags('projects')
@Controller({ path: 'projects', version: '1' })
@UseFilters(ProjectsDomainExceptionFilter)
export class ProgressNoteController {
  constructor(private readonly useCases: ProgressNoteUseCases) {}

  @Post('notes')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(PROGRESS_NOTE_CREATE)
  @ApiOperation({ summary: 'Ilerleme notu kaydeder ve indeksler', description: CREATE_DESCRIPTION })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Not kaydedildi ve indekslendi.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Proje ya da gorev bulunamadi.' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Saatlik not payi tukendi.' })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    description: 'Not KAYDEDILDI ancak indekslenemedi; onarim icin /projects/reindex.',
  })
  async create(
    @Body(new ZodValidationPipe(createProgressNoteSchema)) body: CreateProgressNoteBody,
  ): Promise<CreateProgressNoteResponse> {
    const principal = requireTenantPrincipal();

    const result = await this.useCases.create({
      tenantId: principal.tenantId,
      userId: principal.userId,
      projectId: body.projectId,
      taskId: body.taskId ?? null,
      body: body.body,
    });

    return { progressNoteId: result.note.id, chunkCount: result.chunkCount };
  }

  @Get('notes')
  @RequirePermission(PROGRESS_NOTE_READ)
  @ApiOperation({ summary: 'Ilerleme notlarini listeler' })
  async list(
    @Query(new ZodValidationPipe(listProgressNotesQuerySchema)) query: ListProgressNotesQuery,
  ): Promise<ProgressNoteListResponse> {
    const page = await this.useCases.list({
      limit: query.limit,
      offset: query.offset,
      projectId: query.projectId ?? null,
      taskId: query.taskId ?? null,
    });

    return { ...page, limit: query.limit, offset: query.offset };
  }

  /** Parcasiz not sayisi — onarim banner'inin besledigi uc. */
  @Get('notes/unindexed')
  @RequirePermission(PROGRESS_NOTE_READ)
  @ApiOperation({ summary: 'Aranabilir olmayan not sayisi' })
  async unindexed(): Promise<{ count: number }> {
    return { count: await this.useCases.countUnindexed() };
  }

  @Post('reindex')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PROGRESS_NOTE_CREATE)
  @ApiOperation({ summary: 'Parcasiz notlari onarir', description: REINDEX_DESCRIPTION })
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
