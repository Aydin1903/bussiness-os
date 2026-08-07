import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { CrmDomainError } from '../domain/crm.error';

/**
 * CRM domain hatalarini HTTP'ye cevirir.
 *
 * `KnowledgeDomainExceptionFilter` ile ayni disiplin: karar tek yerde,
 * controller'da dagitik `try/catch` YOK.
 */
const STATUS_BY_CODE: Readonly<Record<string, HttpStatus>> = {
  COMPANY_NAME_BLANK: HttpStatus.UNPROCESSABLE_ENTITY,
  CONTACT_NAME_BLANK: HttpStatus.UNPROCESSABLE_ENTITY,
  CRM_TIMESTAMP_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  OPPORTUNITY_TITLE_BLANK: HttpStatus.UNPROCESSABLE_ENTITY,
  OPPORTUNITY_STAGE_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  OPPORTUNITY_CURRENCY_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,

  // "Yok" ile "baska tenant'in" AYIRT EDILMEZ — ikisi de 404 (P2).
  COMPANY_NOT_FOUND: HttpStatus.NOT_FOUND,
  CONTACT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CONTACT_COMPANY_NOT_FOUND: HttpStatus.NOT_FOUND,
  OPPORTUNITY_NOT_FOUND: HttpStatus.NOT_FOUND,
  OPPORTUNITY_COMPANY_NOT_FOUND: HttpStatus.NOT_FOUND,
  OPPORTUNITY_CONTACT_NOT_FOUND: HttpStatus.NOT_FOUND,
};

@Catch(CrmDomainError)
export class CrmDomainExceptionFilter implements ExceptionFilter {
  catch(exception: CrmDomainError, _host: ArgumentsHost): void {
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Beklenmeyen bir domain hatasinin MESAJI disari sizmaz.
      throw new HttpException('Internal server error', status);
    }

    throw new HttpException(exception.message, status);
  }
}
