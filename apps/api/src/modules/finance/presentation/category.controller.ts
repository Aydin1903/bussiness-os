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
import { CategoryUseCases } from '../application/category.use-cases';
import { type CategoryState } from '../domain/category.entity';
import {
  FINANCE_CATEGORY_DELETE,
  FINANCE_CATEGORY_READ,
  FINANCE_CATEGORY_WRITE,
} from '../finance.permissions';
import { FinanceDomainExceptionFilter } from './finance-domain-exception.filter';
import {
  createCategorySchema,
  idParamSchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
  type CreateCategoryBody,
  type ListCategoriesQuery,
  type UpdateCategoryBody,
} from './finance.dto';

/**
 * Kategori uclari (ADR-0034 §9).
 *
 * `CompanyController` / `ProjectController` ile birebir ayni sekil: `POST` /
 * `GET` / `GET :id` / `PATCH :id` / `DELETE :id`. Tekrar bilinclidir — bu
 * modulun ADR'sinin kisa olmasinin sebebi de budur.
 *
 * ⚠️ ROTA `finance/categories`, `finance` DEGIL. `FinanceModule`'e ileride
 * eklenecek `TransactionController` (`finance/transactions`) ve
 * `CommentaryController` ile CAKISMAZ cunku hicbiri `:id` gibi bir yakalayici
 * rota TASIMIYOR — `ProjectController`'in `GET :id` rotasinin dogurdugu sira
 * bagimliligi burada YOKTUR. Bir gun `finance/:id` seklinde bir rota eklenirse
 * o controller listenin SONUNA yazilmali (gerekce `projects.module.ts`'te).
 */
interface CategoryListResponse {
  readonly items: readonly CategoryState[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

@ApiTags('finance')
@Controller({ path: 'finance/categories', version: '1' })
@UseFilters(FinanceDomainExceptionFilter)
export class CategoryController {
  constructor(private readonly useCases: CategoryUseCases) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(FINANCE_CATEGORY_WRITE)
  @ApiOperation({ summary: 'Gelir/gider kategorisi olusturur' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Kategori olusturuldu.' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Ayni ad ve yonde bir kategori zaten var (arsivlenmis olabilir).',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'finance_category:write yalnizca owner/admin.',
  })
  async create(
    @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryBody,
  ): Promise<CategoryState> {
    return this.useCases.create({
      tenantId: requireTenantId(),
      fields: { name: body.name, direction: body.direction, isArchived: false },
    });
  }

  @Get()
  @RequirePermission(FINANCE_CATEGORY_READ)
  @ApiOperation({ summary: 'Kategorileri listeler' })
  async list(
    @Query(new ZodValidationPipe(listCategoriesQuerySchema)) query: ListCategoriesQuery,
  ): Promise<CategoryListResponse> {
    // `?? null`: Zod'un `.optional()` ciktisi "anahtar var, degeri `undefined`"
    // demektir; port "filtre yok"u `null` ile ifade eder (gerekce port
    // dosyasinda).
    const page = await this.useCases.list({
      limit: query.limit,
      offset: query.offset,
      direction: query.direction ?? null,
      includeArchived: query.includeArchived,
    });

    return { ...page, limit: query.limit, offset: query.offset };
  }

  @Get(':id')
  @RequirePermission(FINANCE_CATEGORY_READ)
  @ApiOperation({ summary: 'Tek kategoriyi doner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Kategori bulunamadi.' })
  async get(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<CategoryState> {
    return this.useCases.get(params.id);
  }

  /**
   * KISMI guncelleme; gonderilmeyen alana DOKUNULMAZ (`PUT` degil).
   *
   * ⚠️ `direction` KABUL EDILMEZ (gerekce `finance.dto.ts`'te). Govdede
   * gonderilirse `.strict()` onu 422 ile reddeder — sessizce YOK SAYILMAZ.
   */
  @Patch(':id')
  @RequirePermission(FINANCE_CATEGORY_WRITE)
  @ApiOperation({ summary: 'Kategoriyi kismi gunceller (ad / arsiv durumu)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Kategori bulunamadi.' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Ayni ad ve yonde kategori var.' })
  async update(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryBody,
  ): Promise<CategoryState> {
    return this.useCases.update({ id: params.id, changes: body });
  }

  /**
   * `204`: silme bir govde dondurmez.
   *
   * ⚠️ Slice 2'den itibaren KULLANIMDAKI bir kategori 409 alir; dogru eylem o
   * zaman arsivlemektir. Bugun boyle bir kayit olamaz cunku `finance.categories`
   * a isaret eden hicbir tablo henuz yok (ADR-0034 §3e).
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(FINANCE_CATEGORY_DELETE)
  @ApiOperation({ summary: 'Kategoriyi siler' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Silindi.' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Kullanimdaki kategori silinemez.' })
  async remove(@Param(new ZodValidationPipe(idParamSchema)) params: { id: string }): Promise<void> {
    await this.useCases.delete(params.id);
  }
}

/**
 * ⚠️ PRATIKTE ULASILMAZ — `PermissionGuard` handler'dan ONCE calisir ve hem
 * kimliksiz istegi hem tenant secilmemis token'i keser. Savunma katmani.
 *
 * ⚠️ `ProjectController`'in yardimcisindan FARKLI: orada ROL de okunuyor cunku
 * `CompanyDirectory` cagrisi onu ISTIYOR (cross-modul izin kapisi). Kategori
 * tumuyle modul icidir ve rolu bilmesi GEREKMEZ — izin kontrolunu guard zaten
 * yapti. Ihtiyac duyulmayan bir baglami okumak, onu bir bagimlilik gibi
 * gosterirdi.
 */
function requireTenantId(): string {
  const principal = getPrincipal();

  if (principal?.tenantId == null) {
    throw new UnauthorizedException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
  }

  return principal.tenantId;
}
