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
import { getTenantContext } from '../../../infrastructure/tenant/tenant-context';
import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { RequirePermission } from '../../../platform/authz/authz.public';
import { ProjectUseCases } from '../application/project.use-cases';
import { type ProjectListRow } from '../application/project.repository.port';
import { type ProjectState } from '../domain/project.entity';
import { PROJECT_DELETE, PROJECT_READ, PROJECT_WRITE } from '../projects.permissions';
import { ProjectsDomainExceptionFilter } from './projects-domain-exception.filter';
import {
  createProjectSchema,
  idParamSchema,
  listProjectsQuerySchema,
  updateProjectSchema,
  type CreateProjectBody,
  type ListProjectsQuery,
  type UpdateProjectBody,
} from './projects.dto';

/**
 * Proje uclari (ADR-0033 §9).
 *
 * `CompanyController` ile birebir ayni sekil: `POST` / `GET` / `GET :id` /
 * `PATCH :id` / `DELETE :id`. Tekrar bilinclidir — bu modulun ADR'sinin kisa
 * olmasinin sebebi de budur (ADR-0033 § Baglam).
 */
interface ProjectListResponse {
  readonly items: readonly ProjectListRow[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

@ApiTags('projects')
@Controller({ path: 'projects', version: '1' })
@UseFilters(ProjectsDomainExceptionFilter)
export class ProjectController {
  constructor(private readonly useCases: ProjectUseCases) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(PROJECT_WRITE)
  @ApiOperation({ summary: 'Proje olusturur' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Proje olusturuldu.' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'project:write yetkisi yok.' })
  async create(
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectBody,
  ): Promise<ProjectState> {
    const principal = requireTenantPrincipal();

    return this.useCases.create({
      tenantId: principal.tenantId,
      role: principal.role,
      fields: {
        name: body.name,
        status: body.status,
        description: body.description ?? null,
        startedOn: body.startedOn ?? null,
        dueOn: body.dueOn ?? null,
        companyId: body.companyId ?? null,
      },
    });
  }

  @Get()
  @RequirePermission(PROJECT_READ)
  @ApiOperation({ summary: 'Projeleri listeler' })
  async list(
    @Query(new ZodValidationPipe(listProjectsQuerySchema)) query: ListProjectsQuery,
  ): Promise<ProjectListResponse> {
    // `?? null`: Zod'un `.optional()` ciktisi "anahtar var, degeri `undefined`"
    // demektir; port "filtre yok"u `null` ile ifade eder (gerekce port dosyasinda).
    const page = await this.useCases.list({
      limit: query.limit,
      offset: query.offset,
      status: query.status ?? null,
      role: requireTenantPrincipal().role,
    });

    return { ...page, limit: query.limit, offset: query.offset };
  }

  @Get(':id')
  @RequirePermission(PROJECT_READ)
  @ApiOperation({ summary: 'Tek projeyi doner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Proje bulunamadi.' })
  async get(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<ProjectState & { companyName: string | null }> {
    return this.useCases.get({ id: params.id, role: requireTenantPrincipal().role });
  }

  /** KISMI guncelleme; gonderilmeyen alana DOKUNULMAZ (`PUT` degil). */
  @Patch(':id')
  @RequirePermission(PROJECT_WRITE)
  @ApiOperation({ summary: 'Projeyi kismi gunceller' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Proje bulunamadi.' })
  async update(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateProjectSchema)) body: UpdateProjectBody,
  ): Promise<ProjectState> {
    return this.useCases.update({
      id: params.id,
      role: requireTenantPrincipal().role,
      changes: body,
    });
  }

  /**
   * `204`: silme bir govde dondurmez.
   *
   * ⚠️ Bugun tek satir siler; Slice 2'den sonra gorevleri, Slice 3'ten sonra
   * ilerleme notlarini ve embedding'lerini de CASCADE ile goturecek
   * (ADR-0033 §8). `project:delete`in ayri bir izin olmasinin sebebi budur.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PROJECT_DELETE)
  @ApiOperation({ summary: 'Projeyi siler' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Silindi.' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'project:delete yalnizca owner/admin.',
  })
  async remove(@Param(new ZodValidationPipe(idParamSchema)) params: { id: string }): Promise<void> {
    await this.useCases.delete(params.id);
  }
}

/**
 * ⚠️ PRATIKTE ULASILMAZ — `PermissionGuard` handler'dan ONCE calisir ve hem
 * kimliksiz istegi hem tenant secilmemis token'i keser. Savunma katmani.
 */
function requireTenantPrincipal(): { tenantId: string; role: string } {
  const principal = getPrincipal();
  // ⚠️ ROL principal'da DEGIL, TENANT CONTEXT'tedir: principal "kimsin"
  // sorusunu, tenant context "bu sirkette nesin" sorusunu cevaplar.
  // `AskController` da rolu tam olarak buradan okuyor.
  const role = getTenantContext()?.role;

  if (principal?.tenantId == null || role == null) {
    throw new UnauthorizedException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
  }

  return { tenantId: principal.tenantId, role };
}
