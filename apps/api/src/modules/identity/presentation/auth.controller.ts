import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { getCorrelationId } from '../../../infrastructure/logging/request-context';
import { LoginUseCase } from '../application/login.use-case';
import { RegisterUserUseCase } from '../application/register-user.use-case';
import { ResendVerificationUseCase } from '../application/resend-verification.use-case';
import { VerifyEmailUseCase } from '../application/verify-email.use-case';
import {
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  verifyEmailSchema,
  type LoginBody,
  type RegisterBody,
  type ResendVerificationBody,
  type VerifyEmailBody,
} from './auth.dto';
import { IdentityDomainExceptionFilter } from './identity-domain-exception.filter';

/** Kayit yaniti — HER ZAMAN aynidir (hesap varligi sizmasin, §8.1). */
interface RegisterResponse {
  readonly message: string;
}

interface LoginResponse {
  readonly identityToken: string;
  readonly refreshToken: string;
}

interface VerifyEmailResponse {
  readonly message: string;
}

/** Yanit metni sabittir: e-posta kayitli olsun olmasin AYNI cumle doner. */
const REGISTER_MESSAGE = 'Dogrulama kodu gonderildi.';

const VERIFY_EMAIL_MESSAGE = 'E-posta adresi dogrulandi.';

/**
 * TEK ret metni — hicbir red sebebi digerinden ayirt edilemez.
 *
 * Metin bilerek iki olasiligi birlikte anar: hangisinin gerceklestigini
 * soylemek, saldirgana hangi kodun HALA gecerli oldugunu ogretirdi (P2).
 */
const VERIFY_EMAIL_REJECTION = 'Dogrulama kodu gecersiz veya suresi dolmus. Yeni bir kod isteyin.';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
@UseFilters(IdentityDomainExceptionFilter)
export class AuthController {
  // NestJS controller'i bagimliliklarini constructor'dan alir; use case sayisi
  // uc noktalarla birlikte artar (DEVELOPMENT_RULES 2.5 siniri is nesneleri
  // icindir, DI icin degil).
  // eslint-disable-next-line max-params
  constructor(
    private readonly registerUser: RegisterUserUseCase,
    private readonly login: LoginUseCase,
    private readonly verifyEmail: VerifyEmailUseCase,
    private readonly resendVerification: ResendVerificationUseCase,
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
    // Kayit da bir kod istegidir ve resend defterine yazilir (ADR-0019 §7.4);
    // IP govdeden DEGIL baglantidan alinir.
    @Ip() ipAddress: string,
  ): Promise<RegisterResponse> {
    await this.registerUser.execute({
      email: body.email,
      password: body.password,
      ipAddress,
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

  /**
   * E-posta adresini 6 haneli kodla dogrular (§7.5).
   *
   * Basarili dogrulama kullaniciyi `active` yapar ve ADR-0016'nin tenant acma
   * onkosulunu KARSILAR — ama tenant ACMAZ; o ayri bir adimdir.
   *
   * ============================================================================
   * NEDEN `outcome` OKUNUP BURADA 400'E CEVRILIYOR
   * ============================================================================
   * Use case reddi exception ile bildirseydi transaction geri alinir ve deneme
   * sayacinin artisi silinirdi (ADR-0019 §7.3). Bu yuzden reddi bir DEGER
   * olarak dondurur; HTTP'ye cevirmek sunum katmaninin isidir ve ceviri
   * transaction kapandiktan SONRA olur.
   *
   * Tum red sebepleri TEK yanit uretir: 400 ve sabit metin.
   * ============================================================================
   */
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'E-posta adresini dogrular',
    description:
      'Kod yanlis, suresi dolmus, tukenmis veya hesap zaten dogrulanmis olsa da ' +
      'AYNI 400 yaniti doner — hangi durumun gerceklestigi sizdirilmaz.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'E-posta dogrulandi.' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Kod gecersiz veya kullanilamaz.' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Govde gecerli degil (kod 6 haneli olmali).',
  })
  async confirmEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailBody,
  ): Promise<VerifyEmailResponse> {
    const result = await this.verifyEmail.execute({
      email: body.email,
      code: body.code,
      correlationId: getCorrelationId() ?? 'unknown',
    });

    if (result.outcome !== 'verified') {
      throw new BadRequestException(VERIFY_EMAIL_REJECTION);
    }

    return { message: VERIFY_EMAIL_MESSAGE };
  }

  /**
   * Dogrulama kodunu yeniden gonderir (§7.4).
   *
   * ============================================================================
   * HESAP SINIRLARI SESSIZ, YALNIZCA IP SINIRI 429
   * ============================================================================
   * 60 saniyelik bekleme ve saatlik hesap siniri asildiginda kod URETILMEZ ama
   * yanit yine `202`'dir. Bunlara 429 donmek "bu hesap kayitli, sadece cok sik
   * istedin" demek olurdu — var olmayan bir e-posta hesap sinirina hicbir zaman
   * takilmaz, dolayisiyla 429 hesabin VARLIGINI dogrulardi (P2).
   *
   * IP siniri hesaptan bagimsizdir: hangi adres yazilirsa yazilsin ayni sonucu
   * verir ve 429 hicbir sey sizdirmaz.
   * ============================================================================
   */
  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Dogrulama kodunu yeniden gonderir',
    description:
      'Yanit, e-posta kayitli olsa da olmasa da AYNIDIR. Bekleme suresi ve saatlik ' +
      'hesap siniri asildiginda da 202 doner; yalnizca IP siniri 429 uretir. ' +
      'Yeni kod uretildiginde onceki kod GECERSIZLESIR.',
  })
  @ApiResponse({ status: HttpStatus.ACCEPTED, description: 'Istek alindi.' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Cok fazla istek (IP).' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Govde gecerli degil.' })
  async resendCode(
    @Body(new ZodValidationPipe(resendVerificationSchema)) body: ResendVerificationBody,
    @Ip() ipAddress: string,
  ): Promise<RegisterResponse> {
    await this.resendVerification.execute({
      email: body.email,
      ipAddress,
      correlationId: getCorrelationId() ?? 'unknown',
    });

    // Kayit ile AYNI metin: iki uc noktanin yanitlari da hesabin varligindan
    // bagimsiz ve birbirinden ayirt edilemez olmalidir.
    return { message: REGISTER_MESSAGE };
  }
}
