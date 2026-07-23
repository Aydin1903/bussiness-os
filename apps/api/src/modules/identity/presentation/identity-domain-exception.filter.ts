import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

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

  // Girdi dogrulama
  PASSWORD_POLICY_VIOLATION: HttpStatus.UNPROCESSABLE_ENTITY,
  EMAIL_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  IP_ADDRESS_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,

  // Dogrulama kodu akisi — UCU DE ayni genel hataya duser (§7.3/§16):
  // "yanlis" ile "suresi dolmus" ayirt edilirse saldirgana geri bildirim olur.
  VERIFICATION_CODE_ALREADY_CONSUMED: HttpStatus.BAD_REQUEST,
  VERIFICATION_CODE_EXHAUSTED: HttpStatus.BAD_REQUEST,
};

@Catch(IdentityDomainError)
export class IdentityDomainExceptionFilter implements ExceptionFilter {
  // `_host` kullanilmiyor: bu filtre yaniti KENDISI yazmaz, cevrilmis hatayi
  // global filtreye birakir. Imza ExceptionFilter sozlesmesi geregi durur.
  catch(exception: IdentityDomainError, _host: ArgumentsHost): never {
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Eslenmemis bir domain hatasi EKSIK ESLEME demektir. Mesaji istemciye
      // vermeyiz (ic detay tasiyabilir); global filtre traceId ile loglar.
      throw new HttpException('Internal server error', status);
    }

    throw new HttpException(exception.message, status);
  }
}
