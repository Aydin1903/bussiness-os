import { Body, Controller, HttpCode, HttpStatus, Ip, Post, UseFilters } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { getCorrelationId } from '../../../infrastructure/logging/request-context';
import { LoginUseCase } from '../application/login.use-case';
import { RegisterUserUseCase } from '../application/register-user.use-case';
import { loginSchema, registerSchema, type LoginBody, type RegisterBody } from './auth.dto';
import { IdentityDomainExceptionFilter } from './identity-domain-exception.filter';

/** Kayit yaniti — HER ZAMAN aynidir (hesap varligi sizmasin, §8.1). */
interface RegisterResponse {
  readonly message: string;
}

interface LoginResponse {
  readonly identityToken: string;
  readonly refreshToken: string;
}

/** Yanit metni sabittir: e-posta kayitli olsun olmasin AYNI cumle doner. */
const REGISTER_MESSAGE = 'Dogrulama kodu gonderildi.';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
@UseFilters(IdentityDomainExceptionFilter)
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUserUseCase,
    private readonly login: LoginUseCase,
  ) {}

  /**
   * Yeni kullanici kaydeder.
   *
   * `202 Accepted` doner, `201` DEGIL: hesap olusmus olabilir ama HENUZ
   * KULLANILAMAZ — e-posta dogrulanana kadar giris yapilamaz. Kod, outbox
   * uzerinden asenkron gonderilir (§8).
   *
   * YANIT HER ZAMAN AYNIDIR: e-posta zaten kayitliysa yeni kullanici
   * olusturulmaz ama istemci bunu AYIRT EDEMEZ (P2).
   */
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Yeni kullanici kaydeder',
    description:
      'Yanit, e-posta kayitli olsa da olmasa da AYNIDIR — hesap varligi sizdirilmaz. ' +
      'Dogrulama kodu asenkron gonderilir.',
  })
  @ApiResponse({ status: HttpStatus.ACCEPTED, description: 'Dogrulama kodu gonderildi.' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Govde veya parola politikasi gecerli degil.',
  })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterBody,
  ): Promise<RegisterResponse> {
    await this.registerUser.execute({
      email: body.email,
      password: body.password,
      correlationId: getCorrelationId() ?? 'unknown',
    });

    return { message: REGISTER_MESSAGE };
  }

  /**
   * Giris yapar ve KIMLIK token'i uretir.
   *
   * Donen token `tenant` claim'i TASIMAZ (ADR-0020 asama 1): tek isi "hangi
   * tenant'lara uyeyim" sorgusu ve tenant secimidir. Tenant-scoped access token,
   * membership dogrulamasindan gecen ayri bir adimdir (MT §7.4).
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Giris yapar',
    description:
      'KIMLIK token (tenant claim YOK, 5 dk) ve refresh token doner. ' +
      'Gecersiz kimlik, kilitli hesap ve pasif hesap AYNI 401 yanitini uretir.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Giris basarili.' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Kimlik bilgileri gecersiz.' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'E-posta dogrulanmamis.' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Cok fazla deneme.' })
  async signIn(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginBody,
    // IP GOVDEDEN DEGIL baglantidan alinir: kaba kuvvet sayacinin anahtaridir
    // ve istemcinin bildirmesine izin verilirse limit atlatilir (ADR-0022).
    @Ip() ipAddress: string,
  ): Promise<LoginResponse> {
    const result = await this.login.execute({
      email: body.email,
      password: body.password,
      ipAddress,
      correlationId: getCorrelationId() ?? 'unknown',
    });

    return { identityToken: result.identityToken, refreshToken: result.refreshToken };
  }
}
