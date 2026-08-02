import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import {
  getPrincipal,
  type AuthenticatedPrincipal,
} from '../../../infrastructure/auth/auth-context';
import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { getCorrelationId } from '../../../infrastructure/logging/request-context';
import { ChangePasswordUseCase } from '../application/change-password.use-case';
import { changePasswordSchema, type ChangePasswordBody } from './auth.dto';
import { IdentityDomainExceptionFilter } from './identity-domain-exception.filter';

interface ChangePasswordResponse {
  readonly message: string;
}

const CHANGE_PASSWORD_MESSAGE = 'Parola degistirildi.';

/**
 * TEK ret metni — hicbir red sebebi digerinden ayirt edilemez (P2).
 *
 * Mevcut parola yanlis · hesap aktif degil · katman 1 kilidi: ucu de bu metni
 * uretir. "Cok fazla denediniz" demek, saldirgana hangi denemenin sayildigini
 * ogretirdi.
 */
const CHANGE_PASSWORD_REJECTION = 'Mevcut parola dogrulanamadi.';

const DESCRIPTION =
  'Kimlik token i gerektirir. Basarida BU oturum ayakta kalir, kullanicinin DIGER tum ' +
  'oturumlari sunucuda duser. Mevcut parola yanlis, hesap pasif veya deneme siniri asilmis ' +
  'olsa da AYNI 400 doner — hangi durumun gerceklestigi sizdirilmaz. Basarisiz denemeler ' +
  'giris ile AYNI kaba kuvvet defterine yazilir.';

/**
 * `POST /api/v1/me/change-password` — giris yapmis kullanicinin parola degisimi.
 *
 * Uc nokta `/auth/...` DEGIL `/me/...`: `auth` altindakiler kimliksiz akislardir
 * (kayit, giris, kurtarma). Bu ise kimligi KANITLANMIS bir kullanicinin kendi
 * kaynagi uzerindeki islemidir ve `/me` ad alanina aittir (`/me/memberships` ile
 * ayni okuma).
 *
 * `AuthController`'dan AYRI bir controller: o dosya zaten dokuz uc nokta tasiyor
 * ve farkli bir yol onekine (`auth`) bagli. Ayni Nest controller'i iki farkli
 * `path` sunamaz.
 */
@ApiTags('Auth')
@Controller({ path: 'me', version: '1' })
@UseFilters(IdentityDomainExceptionFilter)
export class MePasswordController {
  constructor(private readonly changePassword: ChangePasswordUseCase) {}

  /**
   * ============================================================================
   * NEDEN RET `400`, `401` DEGIL — bu ucun en kritik sunum karari
   * ============================================================================
   * Burada `401` zaten "token yok / suresi doldu" anlamini tasiyor. Yanlis
   * paroladan da `401` donseydi istemcinin yenile-ve-tekrar-dene mekanizmasi
   * (web `apiFetch`) devreye girer, istek SESSIZCE ikinci kez gonderilir ve
   * kullanicinin TEK yazim hatasi IKI basarisiz deneme yakardi — 5 denemelik
   * katman 1 siniri (ADR-0022) yari yariya erirdi.
   *
   * Bu yuzden use case reddi bir DEGER olarak doner ve burada `400` + sabit
   * metne cevrilir (`ResetPasswordUseCase` deseni). `401` yalnizca kimliksiz
   * istege ayrilir.
   * ============================================================================
   *
   * Basarida istegi yapan oturum AYAKTA KALIR; kullanicinin diger tum oturumlari
   * duser. Bilgilendirme e-postasi outbox uzerinden asenkron gider.
   */
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Giris yapmis kullanicinin parolasini degistirir', description: DESCRIPTION })
  @ApiResponse({ status: HttpStatus.OK, description: 'Parola degistirildi.' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Mevcut parola dogrulanamadi.' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Kimlik dogrulanmadi.' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Govde veya parola politikasi gecersiz.' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Cok fazla deneme (IP).' })
  async change(
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordBody,
    // IP GOVDEDEN DEGIL baglantidan: kaba kuvvet sayacinin anahtaridir (ADR-0022).
    @Ip() ipAddress: string,
  ): Promise<ChangePasswordResponse> {
    const principal = requirePrincipal();

    const result = await this.changePassword.execute({
      userId: principal.userId,
      sessionId: principal.sessionId,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      ipAddress,
      correlationId: getCorrelationId() ?? 'unknown',
    });

    if (result.outcome !== 'changed') {
      throw new BadRequestException(CHANGE_PASSWORD_REJECTION);
    }

    return { message: CHANGE_PASSWORD_MESSAGE };
  }
}

/**
 * DOGRULANMIS kimligi dondurur; istek kimliksizse 401.
 *
 * `userId` ve `sessionId` yalnizca buradan gelir — govdeden bir kimlik kabul
 * etmek herkesin herkesin parolasini degistirebilmesi demekti. `sessionId`
 * olmadan "bu oturum haric" cumlesi kurulamazdi ve kullanici kendi cihazindan
 * da atilirdi.
 */
function requirePrincipal(): AuthenticatedPrincipal {
  const principal = getPrincipal();
  if (principal === undefined) {
    throw new UnauthorizedException('Bu islem icin kimlik dogrulamasi gerekiyor.');
  }
  return principal;
}
