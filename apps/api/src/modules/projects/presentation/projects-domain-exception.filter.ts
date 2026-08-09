import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { ProjectsDomainError } from '../domain/projects.error';

/**
 * Projeler domain hatalarini HTTP'ye cevirir.
 *
 * `CrmDomainExceptionFilter` ile ayni disiplin: karar tek yerde, controller'da
 * dagitik `try/catch` YOK.
 *
 * ============================================================================
 * ⚠️ BU LISTE MODUL YENI BIR PORT KULLANMAYA BASLADIGINDA BUYUR
 * ============================================================================
 * CRM'de ayni ders DORT KEZ ogrenildi: `RateLimitExceededError`,
 * `EmbeddingFailedError` ve `CompletionFailedError` `CrmDomainError`'dan
 * TUREMEZ — `@Catch(...)`e yazilmadiklari icin filtre onlari GORMEDI ve 429/502
 * yerine islenmemis 500 dondu.
 *
 * Kural artik genellenmis durumda: BIR MODUL YENI BIR PORT KULLANMAYA
 * BASLADIGINDA, O PORTUN HATA TIPI BURAYA EKLENMELIDIR. Bugun Projeler hicbir
 * paylasilan port kullanmiyor (AI yok, oran siniri yok) ve liste bu yuzden tek
 * kalem. Slice 3 embedding ve oran sinirini getirdiginde `RateLimitExceededError`
 * ve `EmbeddingFailedError` BURAYA EKLENECEK.
 * ============================================================================
 */
const STATUS_BY_CODE: Readonly<Record<string, HttpStatus>> = {
  PROJECT_NAME_BLANK: HttpStatus.UNPROCESSABLE_ENTITY,
  PROJECT_STATUS_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  PROJECT_DUE_BEFORE_START: HttpStatus.UNPROCESSABLE_ENTITY,
  PROJECTS_TIMESTAMP_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,

  // "Yok" ile "baska tenant'in" AYIRT EDILMEZ — ikisi de 404 (P2).
  PROJECT_NOT_FOUND: HttpStatus.NOT_FOUND,
};

@Catch(ProjectsDomainError)
export class ProjectsDomainExceptionFilter implements ExceptionFilter {
  catch(exception: ProjectsDomainError, _host: ArgumentsHost): void {
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Beklenmeyen bir domain hatasinin MESAJI disari sizmaz.
      throw new HttpException('Internal server error', status);
    }

    throw new HttpException(exception.message, status);
  }
}
