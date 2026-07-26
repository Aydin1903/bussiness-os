import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Ip,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { APP_CONFIG, type AppConfig } from '../../../infrastructure/config/app.config';
import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { getCorrelationId } from '../../../infrastructure/logging/request-context';
import { CURRENT_USER_PROVIDER, type CurrentUserProvider } from '../../../shared/current-user.port';
import { LoginUseCase } from '../application/login.use-case';
import { LogoutUseCase } from '../application/logout.use-case';
import { RefreshSessionUseCase } from '../application/refresh-session.use-case';
import { RegisterUserUseCase } from '../application/register-user.use-case';
import { RequestPasswordResetUseCase } from '../application/request-password-reset.use-case';
import { ResendVerificationUseCase } from '../application/resend-verification.use-case';
import { ResetPasswordUseCase } from '../application/reset-password.use-case';
import { VerifyEmailUseCase } from '../application/verify-email.use-case';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type ForgotPasswordBody,
  type LoginBody,
  type RegisterBody,
  type ResendVerificationBody,
  type ResetPasswordBody,
  type VerifyEmailBody,
} from './auth.dto';
import { IdentityDomainExceptionFilter } from './identity-domain-exception.filter';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-cookie';

/** Kayit yaniti — HER ZAMAN aynidir (hesap varligi sizmasin, §8.1). */
interface RegisterResponse {
  readonly message: string;
}

/**
 * Giris ve yenileme yaniti — refresh token GOVDEDE DONMEZ (ADR-0026).
 *
 * Refresh token `HttpOnly` cookie ile tasinir; yanit gövdesi yalnizca memory'de
 * tutulacak kisa omurlu kimlik token'ini icerir (FRONTEND_ARCHITECTURE §2).
 */
interface IdentityTokenResponse {
  readonly identityToken: string;
}

interface VerifyEmailResponse {
  readonly message: string;
}

/** Yanit metni sabittir: e-posta kayitli olsun olmasin AYNI cumle doner. */
const REGISTER_MESSAGE = 'Dogrulama kodu gonderildi.';

const VERIFY_EMAIL_MESSAGE = 'E-posta adresi dogrulandi.';

/** Sifirlama TALEBI yaniti — hesap varligindan bagimsiz, DAIMA ayni (P2). */
const FORGOT_PASSWORD_MESSAGE = 'Parola sifirlama kodu gonderildi.';

const RESET_PASSWORD_MESSAGE = 'Parola sifirlandi.';

/** Sifirlama TAMAMLAMA reddi — tek metin (P2: hangi sebep sizmaz). */
const RESET_PASSWORD_REJECTION = 'Sifirlama kodu gecersiz veya suresi dolmus. Yeni bir kod isteyin.';

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
    private readonly refreshSession: RefreshSessionUseCase,
    private readonly logout: LogoutUseCase,
    private readonly requestPasswordReset: RequestPasswordResetUseCase,
    private readonly resetPassword: ResetPasswordUseCase,
    @Inject(CURRENT_USER_PROVIDER) private readonly currentUser: CurrentUserProvider,
    // Cookie `secure` bayragi ortamdan turer: uretimde HTTPS zorunlu, dev/test'te
    // (HTTP) kapali — aksi halde tarayici cookie'yi hic saklamazdi (ADR-0026).
    @Inject(APP_CONFIG) private readonly config: AppConfig,
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
      'KIMLIK token (tenant claim YOK, 5 dk) gövdede doner; refresh token ' +
      '`HttpOnly` cookie ile yazilir (Set-Cookie, ADR-0026) — govdede DONMEZ. ' +
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
    @Res({ passthrough: true }) response: Response,
  ): Promise<IdentityTokenResponse> {
    const result = await this.login.execute({
      email: body.email,
      password: body.password,
      ipAddress,
      correlationId: getCorrelationId() ?? 'unknown',
    });

    // Refresh token JS'e hic gorunmez: gövde yerine HttpOnly cookie (ADR-0026).
    setRefreshCookie(response, result.refreshToken, this.config.isProduction);

    return { identityToken: result.identityToken };
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

  /**
   * Oturumu yeniler ve refresh token'i rotasyona ugratir (§11, ADR-0021).
   *
   * Donen `identityToken`, `accessToken` DEGILDIR: tenant-scoped token tenant
   * secimi adimindan cikar ve o adim henuz yok (MT §7.4, AUTH §11.5 borcu).
   *
   * ============================================================================
   * REFRESH TOKEN GOVDEDEN DEGIL COOKIE'DEN OKUNUR (ADR-0026)
   * ============================================================================
   * Token `HttpOnly` cookie'dedir; JS ona dokunamaz. Cookie yoksa istek kimlik
   * bilgisi tasimiyor demektir -> diger tum redlerle AYNI 401. Rotasyonla uretilen
   * yeni token yine cookie'ye yazilir; eski cookie ustune yazilir.
   *
   * Tum redler AYNI 401'i uretir: cookie yok, satir yok, suresi dolmus, aile iptal
   * edilmis, kullanici pasif — ve YENIDEN KULLANIM. Sonuncusunda ailenin tamami
   * iptal edilmis olur; istemci bunu yanittan ayirt edemez.
   * ============================================================================
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Oturumu yeniler (refresh token rotation)',
    description:
      'Refresh token `HttpOnly` cookie den okunur; gövde ALMAZ (ADR-0026). ' +
      'Her kullanimda token DEGISIR ve yeni cookie yazilir; eski token aninda ' +
      'gecersizlesir. Kullanilmis bir token yeniden sunulursa AILENIN TAMAMI iptal edilir.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Oturum yenilendi.' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token gecersiz veya yok.' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<IdentityTokenResponse> {
    const refreshToken = readRefreshCookie(request);
    if (refreshToken === undefined) {
      // Cookie yoksa istek kimliksizdir; sebep (yok/gecersiz) sizmasin diye
      // gecersiz token ile AYNI 401.
      throw new UnauthorizedException('Token gecersiz.');
    }

    const result = await this.refreshSession.execute({
      refreshToken,
      correlationId: getCorrelationId() ?? 'unknown',
    });

    setRefreshCookie(response, result.refreshToken, this.config.isProduction);

    return { identityToken: result.identityToken };
  }

  /**
   * Cikis: sunulan refresh token'in AILESINI iptal eder (ADR-0023).
   *
   * HER ZAMAN 204 doner — bilinmeyen, suresi dolmus veya zaten iptal edilmis
   * token dahil. 401 donmek "bu token gercekti" derdi; ayrica cikis idempotent
   * olmalidir.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cikis yapar (oturumu sunucuda sonlandirir)',
    description:
      'Refresh token `HttpOnly` cookie den okunur (ADR-0026). Token gecerli ' +
      'olmasa veya cookie hic yoksa da 204 doner (idempotent). Cookie her halukarda ' +
      'temizlenir. Cikis SUNUCUDA gerceklesir; istemci tarafi temizlik, calinmis ' +
      'bir kopyayi etkilemez.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Oturum sonlandirildi.' })
  async signOut(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const refreshToken = readRefreshCookie(request);

    // Cookie varsa ailesini iptal et; yoksa yalnizca cookie'yi temizle. Cikis
    // idempotenttir — bilinmeyen/eksik token da 204.
    if (refreshToken !== undefined) {
      await this.logout.execute({ refreshToken });
    }

    clearRefreshCookie(response, this.config.isProduction);
  }

  /**
   * Kullanicinin TUM oturumlarini sonlandirir (ADR-0023).
   *
   * Kimlik DOGRULANMIS token'dan gelir; govde ALMAZ. Govdeden `userId` kabul
   * etseydik herkes herkesi cikartabilirdi.
   */
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Tum oturumlari sonlandirir',
    description:
      'Cihaz kaybinda kullanilir. Kimlik token i gerektirir. Bu cihazin refresh ' +
      'cookie si de temizlenir (ADR-0026).',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Tum oturumlar sonlandirildi.' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Kimlik dogrulanmadi.' })
  async signOutAll(@Res({ passthrough: true }) response: Response): Promise<void> {
    // Kimlik DOGRULANMADIYSA once burada 401 firlatilir; cookie'ye dokunulmaz.
    const userId = this.currentUser.requireUserId();
    await this.logout.executeAll({ userId });

    // Tum aileler sunucuda dustu; bu cihazin cookie'sini de birak birak.
    clearRefreshCookie(response, this.config.isProduction);
  }

  /**
   * Parola sifirlama kodu ister (§7.6, ADR-0024). Kimliksiz kurtarma akisi.
   *
   * DAIMA `202` doner: e-posta kayitli olsun olmasin, hesap aktif olsun olmasin,
   * bekleme/hesap siniri asilmis olsun olmasin — yanit AYNIDIR (P2). Yalnizca IP
   * oran siniri `429` uretir (hesabin varligindan bagimsiz).
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Parola sifirlama kodu ister',
    description:
      'Yanit, e-posta kayitli olsa da olmasa da AYNIDIR (P2). Kod 10 dk gecerli, ' +
      '3 deneme hakki; yeniden istek 120 sn beklemeli. Kod asenkron gonderilir.',
  })
  @ApiResponse({ status: HttpStatus.ACCEPTED, description: 'Istek alindi.' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Cok fazla istek (IP).' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Govde gecerli degil.' })
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordBody,
    // IP GOVDEDEN DEGIL baglantidan: oran sinirinin sayac anahtaridir.
    @Ip() ipAddress: string,
  ): Promise<RegisterResponse> {
    await this.requestPasswordReset.execute({
      email: body.email,
      ipAddress,
      correlationId: getCorrelationId() ?? 'unknown',
    });

    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  /**
   * Parola sifirlama kodunu kullanir ve parolayi degistirir (§7.6, ADR-0024).
   *
   * Basarida kullanicinin TUM oturumlari dusher ve bilgilendirme e-postasi
   * gonderilir. Red (yanlis/dolmus/tukenmis kod, bilinmeyen hesap) TEK bicimde:
   * `400` + sabit metin (P2). Reddi use case sonuc olarak doner; controller
   * `400`'e cevirir — exception use case icinden gelseydi atomik sayac artisini
   * geri alirdi (VerifyEmail ile ayni gerekce).
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Parolayi sifirlar (kod + yeni parola)',
    description:
      'Basarida TUM oturumlar sonlandirilir. Kod yanlis/dolmus/tukenmis veya hesap ' +
      'yok/pasif olsa da AYNI 400 doner — hangi durumun gerceklestigi sizdirilmaz.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Parola sifirlandi.' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Kod gecersiz veya kullanilamaz.' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Govde veya parola politikasi gecersiz.' })
  async resetPasswordEndpoint(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordBody,
  ): Promise<RegisterResponse> {
    const result = await this.resetPassword.execute({
      email: body.email,
      code: body.code,
      password: body.password,
      correlationId: getCorrelationId() ?? 'unknown',
    });

    if (result.outcome !== 'reset') {
      throw new BadRequestException(RESET_PASSWORD_REJECTION);
    }

    return { message: RESET_PASSWORD_MESSAGE };
  }
}
