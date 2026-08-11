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
import { type TransactionEnrichedRow } from '../application/transaction.repository.port';
import { TransactionUseCases } from '../application/transaction.use-cases';
import { type TransactionState } from '../domain/transaction.entity';
import { TRANSACTION_DELETE, TRANSACTION_READ, TRANSACTION_WRITE } from '../finance.permissions';
import { FinanceDomainExceptionFilter } from './finance-domain-exception.filter';
import {
  createTransactionSchema,
  idParamSchema,
  listTransactionsQuerySchema,
  updateTransactionSchema,
  type CreateTransactionBody,
  type ListTransactionsQuery,
  type UpdateTransactionBody,
} from './finance.dto';

/**
 * Islem uclari (ADR-0034 §9).
 *
 * `CategoryController` ile ayni sekil. ⚠️ Rota `finance/transactions`;
 * `finance/categories` ile CAKISMAZ cunku ikisi de sabit onek tasiyor ve
 * hicbiri `finance/:id` gibi bir YAKALAYICI rota tanimlamiyor —
 * `ProjectController`in `GET :id` rotasinin dogurdugu kayit sirasi bagimliligi
 * burada YOKTUR. Bir gun `finance/:id` eklenirse o controller listenin SONUNA
 * yazilmali (gerekce `projects.module.ts`'te).
 */
interface TransactionListResponse {
  readonly items: readonly TransactionEnrichedRow[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

@ApiTags('finance')
@Controller({ path: 'finance/transactions', version: '1' })
@UseFilters(FinanceDomainExceptionFilter)
export class TransactionController {
  constructor(private readonly useCases: TransactionUseCases) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(TRANSACTION_WRITE)
  @ApiOperation({ summary: 'Gelir/gider kaydi olusturur' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Islem kaydedildi.' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Tutar/para birimi/tarih gecersiz ya da kategori yonu uyusmuyor.',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'transaction:write yalnizca owner/admin.',
  })
  async create(
    @Body(new ZodValidationPipe(createTransactionSchema)) body: CreateTransactionBody,
  ): Promise<TransactionState> {
    const principal = requireTenantPrincipal();

    return this.useCases.create({
      tenantId: principal.tenantId,
      userId: principal.userId,
      // ROL cross-modul dizinlere gecirilir: izin kapisi ONLARIN icinde
      // (ADR-0034 §4). Controller hangi izne bakildigini BILMEZ.
      role: principal.role,
      fields: {
        direction: body.direction,
        // Tutar `string | number` gelir; kural ve normallestirme domain'de
        // (`money.ts`) TEK yerde yasar. Burada yalnizca dizeye cevriliyor.
        amount: String(body.amount),
        currency: body.currency,
        occurredOn: body.occurredOn,
        description: body.description ?? null,
        categoryId: body.categoryId ?? null,
        companyId: body.companyId ?? null,
        projectId: body.projectId ?? null,
      },
    });
  }

  @Get()
  @RequirePermission(TRANSACTION_READ)
  @ApiOperation({ summary: 'Islemleri listeler (tarih araligi + yon + kategori)' })
  async list(
    @Query(new ZodValidationPipe(listTransactionsQuerySchema)) query: ListTransactionsQuery,
  ): Promise<TransactionListResponse> {
    // `?? null`: Zod'un `.optional()` ciktisi "anahtar var, degeri `undefined`"
    // demektir; port "filtre yok"u `null` ile ifade eder.
    const page = await this.useCases.list({
      limit: query.limit,
      offset: query.offset,
      direction: query.direction ?? null,
      categoryId: query.categoryId ?? null,
      from: query.from ?? null,
      to: query.to ?? null,
      role: requireTenantPrincipal().role,
    });

    return { ...page, limit: query.limit, offset: query.offset };
  }

  @Get(':id')
  @RequirePermission(TRANSACTION_READ)
  @ApiOperation({ summary: 'Tek islemi doner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Islem bulunamadi.' })
  async get(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<TransactionEnrichedRow> {
    return this.useCases.get({ id: params.id, role: requireTenantPrincipal().role });
  }

  /**
   * KISMI guncelleme; gonderilmeyen alana DOKUNULMAZ (`PUT` degil).
   *
   * ⚠️ `direction` degistirilebilir (kategoriden farkli — gerekce
   * `finance.dto.ts`'te) ama degisince kategori eslesmesi YENIDEN dogrulanir.
   */
  @Patch(':id')
  @RequirePermission(TRANSACTION_WRITE)
  @ApiOperation({ summary: 'Islemi kismi gunceller' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Islem bulunamadi.' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Kategori yonu islemin yonuyle uyusmuyor.',
  })
  async update(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateTransactionSchema)) body: UpdateTransactionBody,
  ): Promise<TransactionState> {
    // `amount` AYRILIYOR, kosullu bir spread ile UZERINE YAZILMIYOR: govde tipi
    // `string | number` tasiyor ve kosullu spread'de TypeScript sonucun artik
    // yalnizca `string` oldugunu goremez. Ayirmak hem tip guvenli hem okunur.
    //
    // ⚠️ `undefined` = "dokunma" demektir; `String(undefined)` onu
    // `"undefined"` dizesine cevirip dogrulamayi patlatirdi.
    const { amount, ...rest } = body;

    return this.useCases.update({
      id: params.id,
      role: requireTenantPrincipal().role,
      changes: amount === undefined ? rest : { ...rest, amount: String(amount) },
    });
  }

  /**
   * `204`: silme bir govde dondurmez.
   *
   * ⚠️ Silme GERI ALINAMAZ ve DENETIM IZI YOKTUR (ADR-0034 §8): kaydin
   * silindigi bilgisi hicbir yerde kalmaz. `transaction:delete`in ayri bir
   * izin olmasinin sebebi budur.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(TRANSACTION_DELETE)
  @ApiOperation({ summary: 'Islemi siler' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Silindi.' })
  async remove(@Param(new ZodValidationPipe(idParamSchema)) params: { id: string }): Promise<void> {
    await this.useCases.delete(params.id);
  }
}

/**
 * ⚠️ PRATIKTE ULASILMAZ — `PermissionGuard` handler'dan ONCE calisir. Savunma
 * katmani.
 *
 * ⚠️ `CategoryController`in yardimcisindan FARKLI: burada KULLANICI KIMLIGI de
 * okunuyor cunku `created_by_user_id` yaziliyor (kaydi kim girdi). Kategoride
 * boyle bir alan yok ve olmayan bir baglami okumak onu bir bagimlilik gibi
 * gosterirdi.
 */
function requireTenantPrincipal(): { tenantId: string; userId: string; role: string } {
  const principal = getPrincipal();
  // ⚠️ ROL principal'da DEGIL, TENANT CONTEXT'tedir: principal "kimsin"
  // sorusunu, tenant context "bu sirkette nesin" sorusunu cevaplar
  // (`ProjectController`in ayni yardimcisi).
  const role = getTenantContext()?.role;

  // ⚠️ YALNIZCA `tenantId` kontrol ediliyor: `userId` principal tipinde ZATEN
  // zorunludur (bir principal varsa kimligi de vardir). Onu da kontrol etmek
  // lint tarafindan "types have no overlap" ile reddedilir — ve hakli:
  // olmayan bir durumu savunmak, okuyana o durumun MUMKUN oldugunu soyler.
  if (principal?.tenantId == null || role == null) {
    throw new UnauthorizedException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
  }

  return { tenantId: principal.tenantId, userId: principal.userId, role };
}
