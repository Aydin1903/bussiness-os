import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Ip,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { APP_CONFIG, type AppConfig } from '../../../infrastructure/config/app.config';
import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { getCorrelationId } from '../../../infrastructure/logging/request-context';
import {
  OAUTH_PROVIDER_REGISTRY,
  type OAuthProviderRegistry,
} from '../../../shared/oauth-provider.port';
import { BeginOAuthUseCase } from '../application/begin-oauth.use-case';
import { BeginOneTapUseCase } from '../application/begin-one-tap.use-case';
import { CompleteOneTapUseCase } from '../application/complete-one-tap.use-case';
import { CompleteOAuthUseCase } from '../application/complete-oauth.use-case';
import { VerifyOAuthEmailUseCase } from '../application/verify-oauth-email.use-case';
import { InvalidCredentialsError } from '../domain/identity.error';
import { IdentityDomainExceptionFilter } from './identity-domain-exception.filter';
import {
  clearOAuthOneTapCookie,
  clearOAuthPendingLinkCookie,
  clearOAuthStateCookie,
  OAUTH_ONE_TAP_COOKIE_NAME,
  OAUTH_PENDING_LINK_COOKIE_NAME,
  OAUTH_STATE_COOKIE_NAME,
  readOAuthCookie,
  setOAuthOneTapCookie,
  setOAuthPendingLinkCookie,
  setOAuthStateCookie,
} from './oauth-cookies';
import {
  oneTapSchema,
  verifyOAuthEmailSchema,
  type OneTapBody,
  type VerifyOAuthEmailBody,
} from './oauth.dto';
import { setRefreshCookie } from './refresh-cookie';

/** ⚠️ Site-ici, sabit yollar. Kullanici girdisi bunlara KARISMAZ. */
const COMPLETE_PATH = '/oauth/complete';
const VERIFY_PATH = '/oauth/verify';

/**
 * Callback'in kullaniciya tasidigi TEK bilgi.
 *
 * ⚠️ Saglayicinin HAM hatasi buraya KONMAZ (ic detay tasiyabilir) ve hicbir
 * SIR tasinmaz. Kodlar kaba tanelidir ve arayuzun kullaniciya ne
 * soyleyecegine karar vermesi icin yeterlidir.
 */
type CallbackError = 'state' | 'provider' | 'cancelled' | 'email_required' | 'unavailable';

interface IdentityTokenResponse {
  readonly identityToken: string;
}

/**
 * One Tap yaniti — ⚠️ AYRIMLI (discriminated), cunku IKI MESRU SONUC vardir.
 *
 * ⚠️ D3 BIR HATA DEGILDIR ve bir exception ile bildirilmemelidir: kullanici
 * dogru bir sey yapti, yalnizca saglayicinin e-posta hukmu `false` geldi ve
 * kendi kodumuz gonderildi. 401 dondurmek "giris basarisiz" demek olurdu ve
 * istemci kullaniciyi kod ekranina yonlendiremezdi.
 *
 * ⚠️ 200 + ayrimli govde secildi, 202 DEGIL: 202 "kabul edildi, sonra
 * islenecek" demektir; burada islem BITTI, yalnizca sonuc iki turden biri.
 */
type OneTapResponse =
  | { readonly status: 'signed-in'; readonly identityToken: string }
  | { readonly status: 'verification-required' };

/**
 * Sosyal giris uclari (ADR-0053 §4.1).
 *
 * ============================================================================
 * ⚠️ NEDEN `/auth` ONEKININ ALTINDA — VE BU ZORUNLU
 * ============================================================================
 * Refresh cerezinin `Path`i `/api/v1/auth`tir (`refresh-cookie.ts`). Baska bir
 * onek secilseydi callback cerezi YAZAMAZDI ve hata SESSIZ olurdu: kullanici
 * giris yapmis gorunur, ILK YENILEMEDE duserdi.
 *
 * ============================================================================
 * ⚠️ SIFIR YENI IZIN (ADR-0053 §8, PO Kalem B5)
 * ============================================================================
 * Bu controller'in uclarinin HICBIRI ADR-0025'in permission katalogunu
 * buyutmez. Uclar KIMLIK ONCESIDIR — korumalari `state` + PKCE + `nonce` ve
 * (verify icin) imzali bekleyen baglama cerezi + 6 haneli koddur.
 *
 * Bir `identity:read` izni uydurmak, `platform`in RLS'siz tablolarina tenant
 * kapsami koymakla AYNI SINIFTA bir hata olurdu: OLMAYAN BIR KAPSAMI VAR GIBI
 * GOSTERMEK.
 * ============================================================================
 */
@ApiTags('Auth')
@Controller({ path: 'auth/oauth', version: '1' })
@UseFilters(IdentityDomainExceptionFilter)
export class OAuthController {
  // NestJS controller'i bagimliliklarini constructor'dan alir; uc sayisiyla
  // birlikte artar (DEVELOPMENT_RULES 2.5 siniri is nesneleri icindir, DI icin
  // degil) — `AuthController` ile ayni muafiyet.
  // eslint-disable-next-line max-params
  constructor(
    private readonly beginOAuth: BeginOAuthUseCase,
    private readonly completeOAuth: CompleteOAuthUseCase,
    private readonly verifyOAuthEmail: VerifyOAuthEmailUseCase,
    private readonly beginOneTap: BeginOneTapUseCase,
    private readonly completeOneTap: CompleteOneTapUseCase,
    @Inject(OAUTH_PROVIDER_REGISTRY) private readonly registry: OAuthProviderRegistry,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Arayuzun HANGI DUGMELERI cizecegini soyler.
   *
   * ⚠️ Kimliksizdir ve olmasi gerekir: giris ekrani henuz kimliksiz bir
   * kullanicidadir. Sizdirdigi tek sey "bu kurulumda Google acik mi"
   * bilgisidir ve o zaten giris ekranina bakarak gorulur.
   */
  @Get('providers')
  @ApiOperation({ summary: 'Yapilandirilmis sosyal giris saglayicilari' })
  @ApiResponse({ status: 200, description: 'Saglayici anahtarlari, gosterim sirasiyla.' })
  listProviders(): { readonly providers: readonly string[] } {
    return { providers: this.registry.configuredKeys() };
  }

  /**
   * Akisi baslatir: state cerezini yazar ve saglayiciya **302** doner.
   *
   * ⚠️ `next` yalnizca SITE ICI goreli bir yol olabilir; `//` ile baslayan bir
   * deger tarayicida PROTOKOLE GORELI bir MUTLAK adrestir ve acik yonlendirme
   * uretirdi. Kontrol `safeNext`tedir ve web tarafindaki `safeNext` ile AYNI
   * kurali uygular.
   */
  @Get(':provider/start')
  @ApiExcludeEndpoint()
  async start(
    @Param('provider') provider: string,
    @Query('next') next: string | undefined,
    @Res({ passthrough: false }) response: Response,
  ): Promise<void> {
    const result = await this.beginOAuth.execute({
      provider,
      redirectUri: this.#redirectUri(provider),
      next: safeNext(next),
    });

    setOAuthStateCookie(response, result.stateToken, this.config.isProduction);
    response.redirect(HttpStatus.FOUND, result.authorizationUrl);
  }

  /**
   * Saglayicinin geri dondugu yer — ⚠️ **BU BIR GIRISTIR** (ADR-0053 §5).
   *
   * ============================================================================
   * ⚠️ HICBIR TOKEN URL'E YAZILMAZ
   * ============================================================================
   * Kimlik token'i bugun YANIT GOVDESINDE tasinir (ADR-0026: memory'de
   * saklanir) ve bir YONLENDIRMENIN GOVDESI YOKTUR. Yaygin cozum token'i
   * fragment'e (`#token=…`) koymaktir ve REDDEDILDI: deger tarayici gecmisine,
   * olasi `Referer` basliklarina ve uzanti erisimine girer.
   *
   * Bunun yerine callback tam olarak `POST /auth/login` gibi davranir —
   * REFRESH CEREZINI yazar — ve web'e yonlendirir. Web acildiginda
   * `POST /auth/refresh` cagirir ve kimlik token'ini govdeden alir.
   *
   * ⚠️ Bu yol PROD'DA OLCULDU: `app.kobiwise.com` -> `api.kobiwise.com`
   * `SameSite=Strict` refresh cerezi gonderiliyor (CLAUDE.md, "WEB PROD'DA
   * CANLI"). Iki alt domain karari burada IKINCI KEZ odullendi: ayri sitelerde
   * kalinsaydi bu tasarim KURULAMAZDI.
   * ============================================================================
   */
  @Get(':provider/callback')
  @ApiExcludeEndpoint()
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: false }) response: Response,
  ): Promise<void> {
    const secure = this.config.isProduction;

    // State cerezi TEK KULLANIMLIKTIR: sonuc ne olursa olsun silinir. Birakmak,
    // ayni `code_verifier`in ikinci bir denemede yeniden kullanilmasina izin
    // verirdi.
    const stateToken = readOAuthCookie(request, OAUTH_STATE_COOKIE_NAME);
    clearOAuthStateCookie(response, secure);

    // Kullanici saglayici ekraninda "iptal" dedi. ⚠️ Bir HATA DEGILDIR:
    // 5xx uretmek, kullanicinin bilincli bir tercihini ariza gibi gosterirdi.
    if (providerError !== undefined) {
      this.#redirectToWeb(response, COMPLETE_PATH, { error: 'cancelled' });
      return;
    }

    if (code === undefined || state === undefined) {
      this.#redirectToWeb(response, COMPLETE_PATH, { error: 'state' });
      return;
    }

    let result;
    try {
      result = await this.completeOAuth.execute({
        provider,
        code,
        state,
        stateToken,
        redirectUri: this.#redirectUri(provider),
        correlationId: getCorrelationId() ?? 'unknown',
      });
    } catch (error) {
      // ⚠️ Callback bir TARAYICI NAVIGASYONUDUR: burada RFC 7807 govdesi
      // dondurmek kullaniciya ham JSON gosterirdi. Hata, arayuzun
      // yorumlayabilecegi kaba taneli bir koda cevrilir ve kullanici KENDI
      // ekranimizda karsilanir.
      this.#redirectToWeb(response, COMPLETE_PATH, { error: toCallbackError(error) });
      return;
    }

    if (result.outcome === 'signed-in') {
      setRefreshCookie(response, result.session.refreshToken, secure);
      this.#redirectToWeb(response, COMPLETE_PATH, { status: 'ok', next: result.next });
      return;
    }

    // D3 — kod gonderildi; HENUZ hicbir baglanti ve hicbir oturum yok.
    setOAuthPendingLinkCookie(response, result.pendingLinkToken, secure);
    this.#redirectToWeb(response, VERIFY_PATH, { next: result.next });
  }

  /**
   * One Tap akisini baslatir: `nonce` + `clientId` doner, cerezi yazar
   * (ADR-0053 EK-1.1).
   *
   * ⚠️ KIMLIKSIZDIR ve olmasi gerekir: giris ekrani henuz kimliksiz bir
   * kullanicidadir. Sizdirdigi tek sey "bu kurulumda One Tap acik mi"dir ve o
   * zaten ekrana bakarak gorulur.
   *
   * ⚠️ ORAN SINIRI YOKTUR (EK-1.4): uc yalnizca 32 bayt uretip bir cerez yazar.
   * Pahali ve DURUM DEGISTIREN adim `POST /one-tap`tir ve sinir oradadir.
   */
  @Get(':provider/one-tap/init')
  @ApiOperation({ summary: 'One Tap icin nonce ve istemci kimligi' })
  @ApiResponse({ status: 200, description: 'Nonce uretildi; cerez yazildi.' })
  @ApiResponse({ status: 404, description: 'Bu saglayicida One Tap yok.' })
  async initOneTap(
    @Param('provider') provider: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ readonly nonce: string; readonly clientId: string }> {
    const result = await this.beginOneTap.execute({ provider });

    setOAuthOneTapCookie(response, result.stateToken, this.config.isProduction);

    // ⚠️ `stateToken` GOVDEDE DONMEZ — yalnizca cerezde. Donseydi istemci JS'i
    // onu okuyabilir ve `nonce`un sunucu tarafindaki BAGLAYICILIGI kaybolurdu.
    return { nonce: result.nonce, clientId: result.clientId };
  }

  /**
   * One Tap `credential`ini isler — ⚠️ **IKINCI KIMLIK DOGRULAMA GIRISI**
   * (ADR-0053 EK-1).
   *
   * ⚠️ Callback'ten farkli olarak bu bir XHR'dir, navigasyon degil: yanit bir
   * yonlendirme degil GOVDE tasir ve kimlik token'i dogrudan donebilir.
   *
   * ⚠️ TUM REDLER AYNI 401'i uretir (kod gecersiz / `nonce` eslesmiyor / cerez
   * yok / hesap kilitli) — hangisinin gerceklestigi SIZDIRILMAZ. Tek istisna
   * oran siniridir: **429** ayirt edilebilir ve olmalidir, cunku kullaniciya
   * "sonra tekrar dene" demek gerekir.
   */
  @Post(':provider/one-tap')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'One Tap kimlik dogrulamasi' })
  @ApiResponse({ status: 200, description: 'Giris yapildi ya da kod dogrulamasi gerekiyor.' })
  @ApiResponse({ status: 401, description: 'Kimlik dogrulanamadi.' })
  @ApiResponse({ status: 429, description: 'Cok fazla deneme.' })
  async oneTap(
    @Param('provider') provider: string,
    @Body(new ZodValidationPipe(oneTapSchema)) body: OneTapBody,
    @Ip() ipAddress: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OneTapResponse> {
    const secure = this.config.isProduction;

    // ⚠️ CEREZ TEK KULLANIMLIKTIR ve SONUCTAN BAGIMSIZ silinir — `callback`in
    // `clearOAuthStateCookie`i kosulsuz cagirmasiyla birebir ayni desen.
    // Birakilsaydi ayni `nonce` ikinci bir credential ile yeniden kullanilirdi.
    const stateToken = readOAuthCookie(request, OAUTH_ONE_TAP_COOKIE_NAME);
    clearOAuthOneTapCookie(response, secure);

    const result = await this.completeOneTap.execute({
      provider,
      credential: body.credential,
      stateToken,
      ipAddress,
      correlationId: getCorrelationId() ?? 'unknown',
    });

    // ⚠️ D3 BURADA DA MUMKUNDUR: Google `email_verified: false` dondugunde akis
    // kendi kodumuza duser. Hukum GEVSEMEZ — kullanici GIS kutusuna tikladi
    // diye dogrulanmamis bir e-posta dogrulanmis sayilmaz.
    if (result.outcome === 'verification-required') {
      setOAuthPendingLinkCookie(response, result.pendingLinkToken, secure);
      return { status: 'verification-required' };
    }

    setRefreshCookie(response, result.session.refreshToken, secure);
    return { status: 'signed-in', identityToken: result.session.identityToken };
  }

  /**
   * D3'un ikinci adimi: 6 haneli kod (ADR-0053 §1.3).
   *
   * ⚠️ TUM REDLER AYNI 401'i uretir — "kod yanlis", "suresi dolmus", "cerez
   * yok" ve "hesap kilitli" AYIRT EDILEMEZ (`VerifyEmailUseCase`in ayni
   * disiplini).
   */
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sosyal giris icin e-posta dogrulama kodunu kullanir' })
  @ApiResponse({ status: 200, description: 'Baglandi; oturum acildi.' })
  @ApiResponse({ status: 401, description: 'Kod veya oturum gecersiz.' })
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyOAuthEmailSchema)) body: VerifyOAuthEmailBody,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<IdentityTokenResponse> {
    const secure = this.config.isProduction;
    const pendingLinkToken = readOAuthCookie(request, OAUTH_PENDING_LINK_COOKIE_NAME);

    const result = await this.verifyOAuthEmail.execute({
      pendingLinkToken,
      code: body.code,
      correlationId: getCorrelationId() ?? 'unknown',
    });

    if (result.outcome === 'invalid') {
      // ⚠️ Cerez SILINMEZ: kullanicinin kalan deneme hakki var ve cerezi
      // silmek onu akisin basina atardi. Deneme sinirini kodun kendi sayaci
      // korur (ADR-0019), cerez degil.
      // ⚠️ `InvalidCredentialsError` YENIDEN KULLANILIYOR ve bu bilincli:
      // filtre onu zaten 401'e cevirir ve metni GENELDIR. Yeni bir hata tipi
      // acmak, bu yolun digerlerinden AYIRT EDILEBILIR bir cevap uretmesi
      // riskini dogururdu.
      throw new InvalidCredentialsError();
    }

    clearOAuthPendingLinkCookie(response, secure);
    setRefreshCookie(response, result.session.refreshToken, secure);

    return { identityToken: result.session.identityToken };
  }

  /**
   * ⚠️ `redirect_uri` YAPILANDIRMADAN turetilir, ISTEKTEN DEGIL.
   *
   * Istekten (`Host` basligi ya da bir sorgu parametresi) turetilseydi
   * saldirgan kodu KENDI adresine yonlendirebilirdi — OAuth'un en klasik
   * acigi. Saglayicilar da bu degerin kayitli olanla BIREBIR eslesmesini
   * ister; tek kaynak olmasi ayrica o eslesmeyi garanti eder.
   */
  #redirectUri(provider: string): string {
    return `${this.config.oauth.apiPublicUrl}/api/v1/auth/oauth/${provider}/callback`;
  }

  /**
   * ⚠️ Hedef SABIT bir kok adrestir (`WEB_PUBLIC_URL`) ve yol SABIT bir
   * sabittir; kullanici girdisi yalnizca `next` sorgu parametresine girer ve
   * o da `safeNext`ten gecmistir. Acik yonlendirme icin bir yuzey yoktur.
   */
  #redirectToWeb(
    response: Response,
    path: string,
    params: {
      readonly status?: 'ok';
      readonly error?: CallbackError;
      readonly next?: string | null;
    },
  ): void {
    const url = new URL(path, this.config.oauth.webPublicUrl);

    if (params.status !== undefined) {
      url.searchParams.set('status', params.status);
    }
    if (params.error !== undefined) {
      url.searchParams.set('error', params.error);
    }
    if (params.next !== undefined && params.next !== null) {
      url.searchParams.set('next', params.next);
    }

    response.redirect(HttpStatus.FOUND, url.toString());
  }
}

/**
 * Domain hatasini callback'in kaba taneli koduna cevirir.
 *
 * ⚠️ BILINMEYEN HATA `unavailable`a duser — hata metni ASLA kullaniciya
 * tasinmaz. Global filtre onu `traceId` ile loglar.
 */
function toCallbackError(error: unknown): CallbackError {
  const code = readErrorCode(error);

  if (code === 'OAUTH_STATE_INVALID') {
    return 'state';
  }
  if (code === 'OAUTH_PROVIDER_NOT_CONFIGURED') {
    return 'provider';
  }
  if (code === 'OAUTH_EMAIL_UNAVAILABLE') {
    return 'email_required';
  }
  return 'unavailable';
}

function readErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }
  const code: unknown = error.code;
  return typeof code === 'string' ? code : null;
}

/**
 * Acik yonlendirmeyi onler: yalnizca SITE ICI goreli yollar kabul edilir.
 *
 * ⚠️ `//` kontrolu SART: `//evil.example` protokole goreli bir MUTLAK adrestir
 * ve `startsWith('/')` testini gecer. Web tarafindaki `safeNext` ile ayni
 * kural — ⚠️ ikisi AYRI tanimlardir ve senkron kalmalidir.
 */
function safeNext(next: string | undefined): string | null {
  if (next !== undefined && next.startsWith('/') && !next.startsWith('//')) {
    return next;
  }
  return null;
}
