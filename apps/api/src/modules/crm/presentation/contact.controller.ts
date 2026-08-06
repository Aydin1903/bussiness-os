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
import { ContactUseCases } from '../application/contact.use-cases';
import { type ContactState } from '../domain/contact.entity';
import { CONTACT_DELETE, CONTACT_READ, CONTACT_WRITE } from '../crm.permissions';
import {
  createContactSchema,
  idParamSchema,
  listContactsQuerySchema,
  updateContactSchema,
  type CreateContactBody,
  type ListContactsQuery,
  type UpdateContactBody,
} from './crm.dto';
import { CrmDomainExceptionFilter } from './crm-domain-exception.filter';

/**
 * Kisi uclari (ADR-0031 §1).
 *
 * AYRI controller: kaynak farkli, permission farkli (`contact:*`). `Company`
 * ile birlestirmek, `NoteController`'in dorduncu use case'te bolunmesiyle ayni
 * sinyali gormezden gelmek olurdu.
 */
/** Liste yaniti — sirket ikiziyle ayni desen. */
interface ContactListResponse {
  readonly items: readonly ContactState[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

@ApiTags('crm')
@Controller({ path: 'crm/contacts', version: '1' })
@UseFilters(CrmDomainExceptionFilter)
export class ContactController {
  constructor(private readonly useCases: ContactUseCases) {}

  /**
   * Kisi olusturur.
   *
   * `companyId` govdededir ve varligi ONCE dogrulanir — FK ihlaline birakmak
   * istemciye 500 dondururdu (bkz. `ContactUseCases.create`).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(CONTACT_WRITE)
  @ApiOperation({ summary: 'Kisi olusturur' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Kisi olusturuldu.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Baglanacak sirket bulunamadi.' })
  async create(
    @Body(new ZodValidationPipe(createContactSchema)) body: CreateContactBody,
  ): Promise<ContactState> {
    const tenantId = requireTenantId();

    return this.useCases.create({
      tenantId,
      companyId: body.companyId,
      fields: {
        fullName: body.fullName,
        title: body.title ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
      },
    });
  }

  /** `companyId` verilirse yalnizca o sirketin kisileri doner. */
  @Get()
  @RequirePermission(CONTACT_READ)
  @ApiOperation({ summary: 'Kisileri listeler' })
  async list(
    @Query(new ZodValidationPipe(listContactsQuerySchema)) query: ListContactsQuery,
  ): Promise<ContactListResponse> {
    const page = await this.useCases.list({
      limit: query.limit,
      offset: query.offset,
      companyId: query.companyId ?? null,
    });

    return { ...page, limit: query.limit, offset: query.offset };
  }

  @Get(':id')
  @RequirePermission(CONTACT_READ)
  @ApiOperation({ summary: 'Tek kisiyi doner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Kisi bulunamadi.' })
  async get(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<ContactState> {
    return this.useCases.get(params.id);
  }

  @Patch(':id')
  @RequirePermission(CONTACT_WRITE)
  @ApiOperation({ summary: 'Kisiyi kismi gunceller' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Kisi bulunamadi.' })
  async update(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateContactSchema)) body: UpdateContactBody,
  ): Promise<ContactState> {
    return this.useCases.update({ id: params.id, changes: body });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(CONTACT_DELETE)
  @ApiOperation({ summary: 'Kisiyi siler' })
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
