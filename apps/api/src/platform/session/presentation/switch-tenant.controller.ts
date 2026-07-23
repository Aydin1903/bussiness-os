import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { getPrincipal } from '../../../infrastructure/auth/auth-context';
import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { SwitchTenantUseCase } from '../application/switch-tenant.use-case';
import { switchTenantSchema, type SwitchTenantBody } from './switch-tenant.dto';

interface SwitchTenantResponse {
  readonly accessToken: string;
}

/**
 * Tenant secimi — kimlik oturumunu bir tenant'a scope eder (MT §7.4 asama 2).
 *
 * Uc nokta yolu `/auth/...` ama controller Identity'de DEGIL: switch-tenant iki
 * modulun orkestrasyonudur ve `platform/session`'da yasar (bkz. use case yorumu).
 * Ayni yol onekini birden fazla modulun beslemesi sorun degildir.
 */
@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class SwitchTenantController {
  constructor(private readonly switchTenant: SwitchTenantUseCase) {}

  /**
   * ============================================================================
   * KIMLIK BAGLAMDAN GELIR, GOVDEDEN DEGIL
   * ============================================================================
   * `userId` ve `sessionId`, auth middleware'inin DOGRULADIGI kimlik token'indan
   * gelen istek baglamindan okunur. Baglam yoksa istek kimliksizdir -> 401.
   * Govdeden yalnizca `tenantId` alinir.
   *
   * Erisim reddi -> 403 (uniform): uyelik yok / uyelik pasif / tenant pasif ayirt
   * ettirilmez. (Sebep sunucu tarafinda loglanabilir; guvenlik olayi ayrimi
   * MT §8.2 — ileride.)
   * ============================================================================
   */
  @Post('switch-tenant')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tenant secer ve tenant-scoped access token uretir',
    description:
      'Kimlik token i gerektirir. Kullanici hedef tenant a uye ve tenant aktif ise ' +
      '`tenant` claim i tasiyan access token (15 dk) doner; aksi halde 403.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Access token uretildi.' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Kimlik dogrulanmadi.' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Bu tenant a erisim yok.' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Govde gecerli degil.' })
  async select(
    @Body(new ZodValidationPipe(switchTenantSchema)) body: SwitchTenantBody,
  ): Promise<SwitchTenantResponse> {
    const principal = getPrincipal();
    if (principal === undefined) {
      throw new UnauthorizedException('Bu islem icin kimlik dogrulamasi gerekiyor.');
    }

    const result = await this.switchTenant.execute({
      userId: principal.userId,
      sessionId: principal.sessionId,
      tenantId: body.tenantId,
    });

    if (!result.granted) {
      // Uniform 403 — sebep (no-membership / membership-inactive / tenant-inactive)
      // istemciye SIZDIRILMAZ. Olmayan tenant ile erisimsiz tenant ayni yaniti verir.
      throw new ForbiddenException('Bu tenant a erisiminiz yok.');
    }

    return { accessToken: result.accessToken };
  }
}
