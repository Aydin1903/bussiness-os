import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import {
  getPrincipal,
  type AuthenticatedPrincipal,
} from '../../../infrastructure/auth/auth-context';
import { getCorrelationId } from '../../../infrastructure/logging/request-context';
import {
  ListSignInMethodsUseCase,
  UnlinkFederatedIdentityUseCase,
  type SignInMethodsView,
} from '../application/federated-identity.use-cases';
import { IdentityDomainExceptionFilter } from './identity-domain-exception.filter';

/**
 * `GET/DELETE /api/v1/me/identities` — bagli sosyal hesaplar (ADR-0053 §7.2, §4.4).
 *
 * ============================================================================
 * ⚠️ `/me` ALTINDA, `/auth` ALTINDA DEGIL — VE SIFIR YENI IZIN
 * ============================================================================
 * `auth` oneki tanimi geregi KIMLIKSIZ akislara aittir (kayit, giris,
 * kurtarma). Bunlar ise kimligi KANITLANMIS bir kullanicinin KENDI kaynagi
 * uzerindeki islemleridir — `POST /me/change-password` ile ayni okuma.
 *
 * ⚠️ ADR-0025'in permission kataloguna TEK SATIR EKLENMEZ (PO Kalem B5).
 * Gerekce ADR-0025'in kendi modelidir: izinler `resource:action` biciminde ve
 * TENANT KAPSAMINDA tanimlidir. Bu uclar cagiranin GLOBAL KIMLIGI uzerinde
 * islem yapar — tenant'i yoktur, dolayisiyla kapsami da yoktur. Bir
 * `identity:read` uydurmak, olmayan bir kapsami var gibi gostermek olurdu.
 *
 * Koruma auth middleware'i + `requirePrincipal()`tir: baglamda kimlik yoksa
 * 401 firlatilir. ⚠️ `getPrincipal()` `undefined` DONER, firlatmaz — bu yuzden
 * kontrol ACIKCA yapilir (`MePasswordController` ile ayni desen). Kontrolsuz
 * bir `getPrincipal().userId`, kimliksiz bir istekte calisma aninda patlar ve
 * 401 yerine 500 uretirdi.
 * ============================================================================
 */
@ApiTags('Auth')
@Controller({ path: 'me/identities', version: '1' })
@UseFilters(IdentityDomainExceptionFilter)
export class MeIdentitiesController {
  constructor(
    private readonly listSignInMethods: ListSignInMethodsUseCase,
    private readonly unlinkIdentity: UnlinkFederatedIdentityUseCase,
  ) {}

  /**
   * Kullanicinin giris yontemleri.
   *
   * ⚠️ `hasPassword` ADR-0052 §6.3'un ucuncu kisitini kapatir: ekran artik
   * federe bir kullaniciya parola degistirme formu gostermek yerine bir
   * aciklama gosterebilir.
   *
   * ⚠️ E-POSTA DONMEZ — `email_at_link` bir teshis kolonudur ve API yuzeyine
   * cikarsa er ya da gec kimlik anahtari gibi kullanilir (ADR-0053 §2.1).
   */
  @Get()
  @ApiOperation({ summary: 'Bagli sosyal hesaplar ve parola durumu' })
  @ApiResponse({ status: 200, description: 'Giris yontemleri.' })
  @ApiResponse({ status: 401, description: 'Kimlik dogrulanmadi.' })
  list(): Promise<SignInMethodsView> {
    return this.listSignInMethods.execute({ userId: requirePrincipal().userId });
  }

  /**
   * Baglantiyi kaldirir.
   *
   * ⚠️ SON GIRIS YONTEMI KALDIRILAMAZ — **409**. Kaldirilabilseydi kullanici
   * kendi hesabini kilitlerdi ve geri donusu YOKTUR: parolasi olmadigi icin
   * sifirlama da calismaz (`ResetPasswordUseCase` `credential === null`da
   * sessizce `invalid` doner).
   *
   * ⚠️ Burada P2 GECERLI DEGILDIR: kullanicinin kimligi kanitlanmistir ve
   * kendi giris yontemlerini bilmesi bir sizinti degil bir HAKTIR. Bu yuzden
   * mesaj ACIKTIR ve olmalidir.
   *
   * ⚠️ Kaldirma OTURUMLARI DUSURMEZ (ADR-0053 §4.4): parola degistirmede
   * duser (ADR-0023) cunku orada SIRRIN KENDISI degisir; burada yalnizca bir
   * giris kapisi kapanir.
   */
  @Delete(':provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sosyal hesap baglantisini kaldirir' })
  @ApiResponse({ status: 204, description: 'Baglanti kaldirildi.' })
  @ApiResponse({ status: 401, description: 'Kimlik dogrulanmadi.' })
  @ApiResponse({ status: 404, description: 'Boyle bir baglanti yok.' })
  @ApiResponse({ status: 409, description: 'Bu, hesaptaki tek giris yontemi.' })
  async unlink(@Param('provider') provider: string): Promise<void> {
    await this.unlinkIdentity.execute({
      // ⚠️ DOGRULANMIS token'dan gelir; govdeden ya da sorgudan ALINMAZ
      // (DEVELOPMENT_RULES 4.5).
      userId: requirePrincipal().userId,
      provider,
      correlationId: getCorrelationId() ?? 'unknown',
    });
  }
}

/**
 * ⚠️ `getPrincipal()` `undefined` DONER, FIRLATMAZ.
 *
 * Auth middleware'i kimliksiz istekleri ANONIM olarak gecirir (kayit/giris
 * kimliksizdir); kimligin zorunlu oldugu yerde karari uc nokta verir.
 * `MePasswordController` ile birebir ayni yardimci — ⚠️ iki kopya bilinclidir:
 * ortak bir yere tasimak `MePasswordController`i degistirmeyi gerektirirdi
 * (Mutlak Kural 2) ve ikisi de dort satirdir.
 */
function requirePrincipal(): AuthenticatedPrincipal {
  const principal = getPrincipal();
  if (principal === undefined) {
    throw new UnauthorizedException('Bu islem icin kimlik dogrulamasi gerekiyor.');
  }
  return principal;
}
