import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { DisclosableHttpException } from '../../../infrastructure/http/problem-details.filter';
import { UnauthenticatedError } from '../../../shared/current-user.port';
import { IdentityDomainError } from '../domain/identity.error';

/**
 * Identity domain hatalarini HTTP durum kodlarina cevirir.
 *
 * ARCHITECTURE 4: domain katmani HTTP bilmez. Ceviri TEK BIR YERDE yapilir;
 * her controller'da `try/catch` yazmak, bir gun birinin unutmasi demektir.
 * Ceviri sonrasi `HttpException` yukari birakilir; RFC 7807 bicimlendirmesini
 * global `ProblemDetailsFilter` yapar (Tenant filtresiyle ayni desen).
 *
 * ============================================================================
 * ESLEMENIN GUVENLIK MANTIGI (AUTH_ARCHITECTURE 16)
 * ============================================================================
 * - `INVALID_CREDENTIALS` -> 401. Kullanici yok / parola yanlis / hesap kilitli /
 *   hesap pasif — DORDU DE ayni koda duser ve ayni yaniti verir. Ayirt edilebilir
 *   olmalari hesabin varligini ve durumunu sizdirirdi (P2, §14.3).
 * - `EMAIL_NOT_VERIFIED` -> 403. Bu AYIRT EDILEBILIR ve bu GUVENLIDIR: buraya
 *   ulasmak icin parola dogru bilinmis olmalidir (§9.1).
 * - `TOO_MANY_LOGIN_ATTEMPTS` -> 429.
 * - Bicim/politika ihlalleri -> 422 (istemciye yardimci olmali).
 * ============================================================================
 */

/** Domain hata kodu -> HTTP durumu. Burada olmayan her kod 500'dur. */
const STATUS_BY_CODE: Readonly<Record<string, HttpStatus>> = {
  // Kimlik dogrulama sonuclari
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  TOKEN_INVALID: HttpStatus.UNAUTHORIZED,
  EMAIL_NOT_VERIFIED: HttpStatus.FORBIDDEN,
  TOO_MANY_LOGIN_ATTEMPTS: HttpStatus.TOO_MANY_REQUESTS,

  // Resend'in KAYNAK (IP) siniri. Hesap bazli sinirlarin karsiligi burada
  // YOKTUR ve olmamalidir: onlar sessizce atlanir, 202 doner (§7.4, P2).
  TOO_MANY_VERIFICATION_REQUESTS: HttpStatus.TOO_MANY_REQUESTS,

  // `logout-all` kimlik ister; token yoksa `CurrentUserProvider` bunu firlatir.
  // Tenant filtresiyle AYNI esleme — kural tek: kimlik yoksa 401.
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,

  // Girdi dogrulama
  PASSWORD_POLICY_VIOLATION: HttpStatus.UNPROCESSABLE_ENTITY,
  EMAIL_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  IP_ADDRESS_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,

  // ==========================================================================
  // SOSYAL GIRIS — OAuth (ADR-0053 §12)
  // ==========================================================================
  // ⚠️ AI HATA TIPLERI (`EmbeddingFailedError` vb.) BURAYA EKLENMEDI ve bu bir
  // atlama DEGILDIR: CLAUDE.md'nin kalici kuralinin kapsami "her modul er ya da
  // gec AI'a dokunur" gerekcesine dayanir ve Identity'nin AI YUZEYI YOKTUR.
  // Eklenmeleri YANILTICI olurdu — okuyan biri Identity'nin bir AI yuzeyi
  // oldugunu sanardi. Ayni kuralin `StorageFailedError` icin yazdigi ALAN BAZLI
  // ayrim.
  //
  // ⚠️ Ama kuralin SEKLI aynen uygulandi: `OAuthProviderFailedError` bugun
  // tetiklenebilir olsun olmasin filtreye BASTAN yazildi ve `DisclosableProblem`
  // isareti aldi (asagida) — asimetrik bedel ayni.

  // Yapilandirilmamis ya da bilinmeyen saglayici. 404: uc GERCEKTEN yoktur.
  OAUTH_PROVIDER_NOT_CONFIGURED: HttpStatus.NOT_FOUND,

  // State/PKCE cerezi yok, suresi dolmus, imzasi gecersiz ya da eslesmiyor.
  // ⚠️ DORT SEBEP DE bu tek koda duser (bkz. `OAuthStateInvalidError`).
  OAUTH_STATE_INVALID: HttpStatus.BAD_REQUEST,

  // Saglayici HIC e-posta vermedi. ⚠️ Bu bir D3 durumu DEGILDIR: D3 kendi
  // kodumuzu BIR ADRESE gondermeye dayanir; adres yoksa gonderilecek yer yok.
  OAUTH_EMAIL_UNAVAILABLE: HttpStatus.BAD_REQUEST,

  // Yaris durumu: iki es zamanli callback ayni anda baglamaya calisti.
  FEDERATED_IDENTITY_CONFLICT: HttpStatus.CONFLICT,

  FEDERATED_IDENTITY_NOT_FOUND: HttpStatus.NOT_FOUND,

  // ⚠️ Son giris yontemi kaldirilamaz. Burada P2 GECERLI DEGILDIR: kullanicinin
  // kimligi kanitlanmistir ve kendi yontemlerini bilmesi bir haktir.
  LAST_SIGN_IN_METHOD: HttpStatus.CONFLICT,

  PROVIDER_SUBJECT_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  FEDERATED_IDENTITY_ID_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,

  // Dogrulama kodu akisi — UCU DE ayni genel hataya duser (§7.3/§16):
  // "yanlis" ile "suresi dolmus" ayirt edilirse saldirgana geri bildirim olur.
  VERIFICATION_CODE_ALREADY_CONSUMED: HttpStatus.BAD_REQUEST,
  VERIFICATION_CODE_EXHAUSTED: HttpStatus.BAD_REQUEST,
};

@Catch(IdentityDomainError, UnauthenticatedError)
export class IdentityDomainExceptionFilter implements ExceptionFilter {
  // `_host` kullanilmiyor: bu filtre yaniti KENDISI yazmaz, cevrilmis hatayi
  // global filtreye birakir. Imza ExceptionFilter sozlesmesi geregi durur.
  catch(exception: IdentityDomainError | UnauthenticatedError, _host: ArgumentsHost): never {
    // ==========================================================================
    // ⚠️ SAGLAYICI ARIZASI — 502 VE GOVDESI ACIK (ADR-0053 §12)
    // ==========================================================================
    // `ProblemDetailsFilter` varsayilan olarak HER 5xx govdesini maskeler.
    // Maskelenirse kullanici "beklenmeyen hata" gorur ve TEKRAR DENEMESI
    // GEREKTIGINI OGRENEMEZ — oysa saglayici arizasi tam olarak yeniden
    // denenebilir bir durumdur.
    //
    // ⚠️ Bu bir GENEL ACMA DEGILDIR: isaret YALNIZCA bu koda konur ve govdesi
    // ELLE YAZILMIS, ic detay TASIMAYAN bir metindir. Eslenmemis bir domain
    // kodunun 500'u asagida MASKELI KALIR.
    if (exception.code === 'OAUTH_PROVIDER_FAILED') {
      throw new DisclosableHttpException(exception.message, HttpStatus.BAD_GATEWAY);
    }

    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Eslenmemis bir domain hatasi EKSIK ESLEME demektir. Mesaji istemciye
      // vermeyiz (ic detay tasiyabilir); global filtre traceId ile loglar.
      throw new HttpException('Internal server error', status);
    }

    throw new HttpException(exception.message, status);
  }
}
