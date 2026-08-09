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
import { TaskUseCases } from '../application/task.use-cases';
import { type TaskState } from '../domain/task.entity';
import { TASK_DELETE, TASK_READ, TASK_WRITE } from '../projects.permissions';
import { ProjectsDomainExceptionFilter } from './projects-domain-exception.filter';
import {
  createTaskSchema,
  idParamSchema,
  listTasksQuerySchema,
  updateTaskSchema,
  type CreateTaskBody,
  type ListTasksQuery,
  type UpdateTaskBody,
} from './projects.dto';

/**
 * Gorev uclari (ADR-0033 §9).
 *
 * ============================================================================
 * ⚠️ BU CONTROLLER `ProjectController`DAN ONCE KAYDEDILMEK ZORUNDA
 * ============================================================================
 * `ProjectController` `GET /projects/:id` tasiyor; bu controller ise
 * `GET /projects/tasks`. NestJS rotalari KAYIT SIRASINA gore eslestirir —
 * `ProjectController` once kaydedilseydi `/projects/tasks` istegi `:id`
 * rotasina duser ve `tasks` bir UUID olmadigi icin 422 donerdi.
 *
 * Yani sira bir uslup tercihi degil, DOGRULUK kosuludur ve `projects.module.ts`
 * bunu acikca yaziyor. Kirilganligi gorunur kilmak icin entegrasyon testinde
 * dogrudan bir iddia var: `GET /api/v1/projects/tasks` 200 doner, 422 degil.
 * `crm.module.ts`'in `CompanySummaryController` sirasi hakkindaki uyarisi ayni
 * sinifin daha zayif bir orneginydi; burada catisma GERCEK.
 * ============================================================================
 */
interface TaskListResponse {
  readonly items: readonly TaskState[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

@ApiTags('projects')
@Controller({ path: 'projects/tasks', version: '1' })
@UseFilters(ProjectsDomainExceptionFilter)
export class TaskController {
  constructor(private readonly useCases: TaskUseCases) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(TASK_WRITE)
  @ApiOperation({ summary: 'Gorev olusturur (projesiz olabilir)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Gorev olusturuldu.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Baglanacak proje bulunamadi.' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Atanan kisi bu tenant in aktif uyesi degil.',
  })
  async create(
    @Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskBody,
  ): Promise<TaskState> {
    const tenantId = requireTenantId();

    return this.useCases.create({
      tenantId,
      projectId: body.projectId ?? null,
      fields: {
        title: body.title,
        status: body.status,
        dueOn: body.dueOn ?? null,
        assigneeUserId: body.assigneeUserId ?? null,
      },
    });
  }

  @Get()
  @RequirePermission(TASK_READ)
  @ApiOperation({ summary: 'Gorevleri listeler (proje · atanan · gecikmis filtreleri)' })
  async list(
    @Query(new ZodValidationPipe(listTasksQuerySchema)) query: ListTasksQuery,
  ): Promise<TaskListResponse> {
    // `?? null` / `?? false`: Zod'un `.optional()` ciktisi "anahtar var, degeri
    // `undefined`" demektir; port "filtre yok"u `null`/`false` ile ifade eder.
    const page = await this.useCases.list({
      limit: query.limit,
      offset: query.offset,
      status: query.status ?? null,
      projectId: query.projectId ?? null,
      withoutProject: query.withoutProject ?? false,
      assigneeUserId: query.assigneeUserId ?? null,
      overdue: query.overdue ?? false,
    });

    return { ...page, limit: query.limit, offset: query.offset };
  }

  @Get(':id')
  @RequirePermission(TASK_READ)
  @ApiOperation({ summary: 'Tek gorevi doner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Gorev bulunamadi.' })
  async get(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<TaskState> {
    return this.useCases.get(params.id);
  }

  /** KISMI guncelleme; `projectId` GONDERILEMEZ (tasima ayri bir islemdir). */
  @Patch(':id')
  @RequirePermission(TASK_WRITE)
  @ApiOperation({ summary: 'Gorevi kismi gunceller' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Gorev bulunamadi.' })
  async update(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateTaskSchema)) body: UpdateTaskBody,
  ): Promise<TaskState> {
    return this.useCases.update({ tenantId: requireTenantId(), id: params.id, changes: body });
  }

  /**
   * `204`: silme bir govde dondurmez.
   *
   * ⚠️ Gorevler `interactions`tan FARKLI olarak SILINEBILIR: gorusme bir gunluk
   * kaydidir, gorev ise YASAYAN bir is kalemidir ve yanlis acilmis bir gorev
   * silinebilmelidir (ADR-0033 §7).
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(TASK_DELETE)
  @ApiOperation({ summary: 'Gorevi siler' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Silindi.' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'task:delete yalnizca owner/admin.' })
  async remove(@Param(new ZodValidationPipe(idParamSchema)) params: { id: string }): Promise<void> {
    await this.useCases.delete(params.id);
  }
}

/**
 * ⚠️ PRATIKTE ULASILMAZ — `PermissionGuard` handler'dan ONCE calisir ve hem
 * kimliksiz istegi hem tenant secilmemis token'i keser. Savunma katmani.
 */
function requireTenantId(): string {
  const principal = getPrincipal();

  if (principal?.tenantId == null) {
    throw new UnauthorizedException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
  }

  return principal.tenantId;
}
