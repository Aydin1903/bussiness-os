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
import { type CompanyListRow } from '../application/company.repository.port';
import { CompanyUseCases } from '../application/company.use-cases';
import { type CompanyState } from '../domain/company.entity';
import { COMPANY_DELETE, COMPANY_READ, COMPANY_WRITE } from '../crm.permissions';
import {
  createCompanySchema,
  idParamSchema,
  listQuerySchema,
  updateCompanySchema,
  type CreateCompanyBody,
  type ListQuery,
  type UpdateCompanyBody,
} from './crm.dto';
import { CrmDomainExceptionFilter } from './crm-domain-exception.filter';

/**
 * Sirket uclari (ADR-0031 §1).
 *
 * ============================================================================
 * PROJENIN ILK TAM YASAM DONGUSU
 * ============================================================================
 * Knowledge ekleme-yalniz bir gunluktu (olustur + oku). CRM ilk kez `PATCH` ve
 * `DELETE` getiriyor — projede bu fiiller BURADA basliyor.
 *
 * `DELETE` SERTTIR ve kisileri `ON DELETE CASCADE` ile birlikte goturur
 * (ADR-0031 §7). Soft delete secilmedi: cascade'i iptal eder ve silinen
 * musteri AI hafizasinda yasamaya devam ederdi — ki `crm` semasinin var olma
 * gerekcesi tam olarak bunu ONLEMEKTI.
 * ============================================================================
 */
/**
 * Liste yaniti — `GET /me/memberships` ile AYNI desen (ADR-0029 liste notu).
 *
 * Satirlar `lastInteractionOn` TASIR: "bu musteriyle en son ne zaman
 * gorustuk" sorusu musteri listesinin en sik sorulan sorusudur ve her kart
 * icin ayri bir istek atmak N+1 olurdu. Deger `crm.interactions`tan TURER,
 * `crm.companies`e kopyalanmaz.
 *
 * Tek kayit uclari (`GET :id`, `POST`, `PATCH`) DEGISMEDI.
 */
interface CompanyListResponse {
  readonly items: readonly CompanyListRow[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

@ApiTags('crm')
@Controller({ path: 'crm/companies', version: '1' })
@UseFilters(CrmDomainExceptionFilter)
export class CompanyController {
  constructor(private readonly useCases: CompanyUseCases) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(COMPANY_WRITE)
  @ApiOperation({ summary: 'Sirket olusturur' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Sirket olusturuldu.' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'company:write yetkisi yok.' })
  async create(
    @Body(new ZodValidationPipe(createCompanySchema)) body: CreateCompanyBody,
  ): Promise<CompanyState> {
    const tenantId = requireTenantId();

    return this.useCases.create({
      tenantId,
      fields: {
        name: body.name,
        industry: body.industry ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        website: body.website ?? null,
      },
    });
  }

  @Get()
  @RequirePermission(COMPANY_READ)
  @ApiOperation({ summary: 'Sirketleri listeler' })
  async list(
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ): Promise<CompanyListResponse> {
    const page = await this.useCases.list(query);
    return { ...page, limit: query.limit, offset: query.offset };
  }

  @Get(':id')
  @RequirePermission(COMPANY_READ)
  @ApiOperation({ summary: 'Tek sirketi doner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Sirket bulunamadi.' })
  async get(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<CompanyState> {
    return this.useCases.get(params.id);
  }

  /** KISMI guncelleme; gonderilmeyen alana DOKUNULMAZ (`PUT` degil). */
  @Patch(':id')
  @RequirePermission(COMPANY_WRITE)
  @ApiOperation({ summary: 'Sirketi kismi gunceller' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Sirket bulunamadi.' })
  async update(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateCompanySchema)) body: UpdateCompanyBody,
  ): Promise<CompanyState> {
    return this.useCases.update({ id: params.id, changes: body });
  }

  /** `204`: silme bir govde dondurmez. Kisiler CASCADE ile gider. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(COMPANY_DELETE)
  @ApiOperation({ summary: 'Sirketi ve kisilerini siler (CASCADE)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Silindi.' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'company:delete yalnizca owner/admin.',
  })
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
