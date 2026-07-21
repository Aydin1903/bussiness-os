import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseFilters } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CURRENT_USER_PROVIDER, type CurrentUserProvider } from '../../../shared/current-user.port';
import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { getCorrelationId } from '../../../infrastructure/logging/request-context';
import { ProvisionTenantUseCase } from '../application/provision-tenant.use-case';
import type { Tenant } from '../domain/tenant.entity';
import { TenantSlug } from '../domain/tenant-slug.value-object';
import { UserId } from '../domain/user-id.value-object';
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
   * `202 Accepted` doner, `201` DEGIL: tenant `provisioning` durumunda olusur
   * ve HENUZ KULLANIMA HAZIR DEGILDIR. Kurulumun geri kalani
   * `TenantProvisioningRequested` event'ini tuketen asenkron handler'da olur
   * (ADR-0016). `201 Created` "kaynak hazir" anlamina gelir ve istemciyi
   * hemen kullanmaya yonlendirir.
   *
   * BUGUN HER ISTEK 503 DONER: kimlik saglayici ve provisioning onkosulu
   * Identity modulunu (Faz 3) bekliyor. Ikisi de acikca reddeder; sessizce
   * izin veren gecici bir implementasyon KONMADI.
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Yeni tenant acar',
    description:
      'Tenant `provisioning` durumunda olusturulur; kurulum asenkron tamamlanir. ' +
      'Sahip, DOGRULANMIS kullanicidir — istek govdesinden alinmaz. ' +
      'Identity modulu devreye girene kadar bu uc nokta 503 doner.',
  })
  @ApiResponse({ status: HttpStatus.ACCEPTED, description: 'Provisioning baslatildi.' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Slug zaten kullanimda.' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Govde gecerli degil.' })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'Provisioning henuz devrede degil (Identity modulu bekleniyor).',
  })
  async provision(
    @Body(new ZodValidationPipe(provisionTenantSchema)) body: ProvisionTenantBody,
  ): Promise<ProvisionTenantResponse> {
    // Kimlik ISTEK GOVDESINDEN DEGIL, dogrulanmis oturumdan gelir.
    // Bugun bu cagri hata firlatir ve istek buradan oteye GECMEZ.
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
