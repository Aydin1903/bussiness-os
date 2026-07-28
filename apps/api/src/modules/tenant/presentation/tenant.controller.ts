import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseFilters } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CURRENT_USER_PROVIDER, type CurrentUserProvider } from '../../../shared/current-user.port';
import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { getCorrelationId } from '../../../infrastructure/logging/request-context';
import { ProvisionTenantUseCase } from '../application/provision-tenant.use-case';
import type { Tenant } from '../domain/tenant.entity';
import { TenantSlug } from '../domain/tenant-slug.value-object';
import { UserId } from '../../../shared/user-id.value-object';
import { provisionTenantSchema, type ProvisionTenantBody } from './provision-tenant.dto';
import { TenantDomainExceptionFilter } from './tenant-domain-exception.filter';

/** Yanit govdesi. Domain nesnesi ASLA serilestirilmez (13.3 / 10 adim 11). */
interface ProvisionTenantResponse {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: string;
}

@ApiTags('Tenant')
@Controller({ path: 'tenants', version: '1' })
@UseFilters(TenantDomainExceptionFilter)
export class TenantController {
  constructor(
    private readonly provisionTenant: ProvisionTenantUseCase,
    @Inject(CURRENT_USER_PROVIDER) private readonly currentUser: CurrentUserProvider,
  ) {}

  /**
   * Yeni tenant acar.
   *
   * `201 Created` doner: V1'de provisioning SENKRONDUR — tenant AYNI istekte
   * `active` (kullanima hazir) acilir (ADR-0016 V1 notu; use case yorumu). Bu,
   * yapilacak gercek asenkron kurulum isi olmadigi icin dururtir; is eklendiginde
   * `202 Accepted` + asenkron handler'a geri donulur.
   *
   * Kimlik DOGRULANMIS token'dan gelir (auth middleware -> istek baglami);
   * istek govdesinden ALINMAZ. ADR-0016 onkosulu (dogrulanmis e-posta)
   * Identity'nin public interface'i uzerinden kontrol edilir:
   *   - token yok      -> 401
   *   - e-posta dogrulanmamis -> 403
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Yeni tenant acar',
    description:
      'Tenant `active` (kullanima hazir) olusturulur — V1 senkron provisioning. ' +
      'Sahip, DOGRULANMIS kullanicidir — istek govdesinden alinmaz. ' +
      'E-postasi dogrulanmamis kullanici tenant acamaz (ADR-0016).',
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Tenant olusturuldu (active).' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Slug zaten kullanimda.' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Govde gecerli degil.' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Kimlik dogrulanmadi.' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'E-posta dogrulanmamis — tenant acilamaz (ADR-0016).',
  })
  async provision(
    @Body(new ZodValidationPipe(provisionTenantSchema)) body: ProvisionTenantBody,
  ): Promise<ProvisionTenantResponse> {
    // Kimlik ISTEK GOVDESINDEN DEGIL, dogrulanmis oturumdan gelir.
    // Token yoksa burada 401 uretilir ve istek oteye GECMEZ.
    const ownerUserId = UserId.create(this.currentUser.requireUserId());

    const tenant = await this.provisionTenant.execute({
      ownerUserId,
      name: body.name,
      slug: TenantSlug.create(body.slug),
      // correlationId HTTP sinirindan gelir ve event'e kadar tasinir; boylece
      // bir istegin urettigi asenkron isler geriye izlenebilir.
      correlationId: getCorrelationId() ?? 'unknown',
    });

    return toResponse(tenant);
  }
}

/**
 * Domain nesnesi degil, acik bir DTO doner.
 *
 * Entity'yi serilestirmek ic alanlari ve GELECEKTE eklenecek her yeni alani
 * sessizce disari acar (MULTI_TENANT_ARCHITECTURE 10, adim 11).
 */
function toResponse(tenant: Tenant): ProvisionTenantResponse {
  return {
    id: tenant.id.value,
    slug: tenant.slug.value,
    name: tenant.name,
    status: tenant.status,
  };
}
