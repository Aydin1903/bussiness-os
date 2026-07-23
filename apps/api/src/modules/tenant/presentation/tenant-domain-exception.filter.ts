import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { UnauthenticatedError } from '../../../shared/current-user.port';
import type { DisclosableProblem } from '../../../infrastructure/http/problem-details.filter';
import { TenantDomainError } from '../domain/tenant.error';

/**
 * Domain hatalarini HTTP durum kodlarina cevirir.
 *
 * ARCHITECTURE 4: domain katmani HTTP bilmez — `TenantDomainError` durum kodu
 * TASIMAZ. Ceviri presentation'in isidir ve TEK BIR YERDE yapilir; her
 * controller'da `try/catch` yazmak, bir gun birinin unutmasi demektir.
 *
 * Bu filtre modul kapsamlidir: `infrastructure/http/problem-details.filter.ts`
 * global ve tenant modulunu BILMEZ — bilseydi altyapi bir is moduluene
 * bagimli hale gelirdi (ARCHITECTURE 6.1).
 *
 * Ceviri sonrasi `HttpException` yukari birakilir; RFC 7807 bicimlendirmesini
 * global filtre yapar. Iki yerde bicimlendirme yapmak, iki farkli hata govdesi
 * uretirdi.
 */

/** Domain hata kodu -> HTTP durumu. Burada olmayan her kod 500'dur. */
const STATUS_BY_CODE: Readonly<Record<string, HttpStatus>> = {
  TENANT_SLUG_ALREADY_TAKEN: HttpStatus.CONFLICT,
  TENANT_SLUG_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  TENANT_SLUG_RESERVED: HttpStatus.UNPROCESSABLE_ENTITY,
  TENANT_NAME_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  TENANT_ID_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  USER_ID_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  TENANT_STATUS_TRANSITION_INVALID: HttpStatus.CONFLICT,
  MEMBERSHIP_STATUS_TRANSITION_INVALID: HttpStatus.CONFLICT,
  MEMBERSHIP_OWNER_PROTECTED: HttpStatus.CONFLICT,

  // Kimlik kanitlanmis ama onkosul (dogrulanmis e-posta) karsilanmamis -> 403.
  TENANT_PROVISIONING_NOT_ALLOWED: HttpStatus.FORBIDDEN,

  // Istek kimliksiz: "kimligini dogrula".
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
};

/**
 * Govdesi acikca yazilmis, ic detay icermeyen 5xx.
 *
 * `DisclosableProblem` isareti tasidigi icin global filtrenin 5xx maskesinden
 * muaftir — istemci "ozellik henuz devrede degil" bilgisini GORMELIDIR, aksi
 * halde genel bir sunucu hatasi sanip tekrar dener.
 */
class ServiceUnavailableProblem extends HttpException implements DisclosableProblem {
  readonly disclosable = true as const;

  constructor(detail: string) {
    super(detail, HttpStatus.SERVICE_UNAVAILABLE);
  }
}

@Catch(TenantDomainError, UnauthenticatedError)
export class TenantDomainExceptionFilter implements ExceptionFilter {
  // `_host` kullanilmiyor: bu filtre yaniti KENDISI yazmaz, cevrilmis hatayi
  // global filtreye birakir. Imza ExceptionFilter sozlesmesi geregi durur.
  catch(exception: TenantDomainError | UnauthenticatedError, _host: ArgumentsHost): never {
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    if (status === HttpStatus.SERVICE_UNAVAILABLE) {
      throw new ServiceUnavailableProblem(exception.message);
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Eslenmemis bir domain hatasi, EKSIK ESLEME demektir. Mesaji istemciye
      // vermeyiz (ic detay tasiyabilir); global filtre traceId ile loglar.
      throw new HttpException('Internal server error', status);
    }

    throw new HttpException(exception.message, status);
  }
}
