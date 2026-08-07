import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { type Response } from 'express';

import { EmbeddingFailedError } from '../../../shared/embedding.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import { CrmDomainError } from '../domain/crm.error';

/**
 * CRM domain hatalarini HTTP'ye cevirir.
 *
 * `KnowledgeDomainExceptionFilter` ile ayni disiplin: karar tek yerde,
 * controller'da dagitik `try/catch` YOK.
 *
 * ============================================================================
 * `RateLimitExceededError` ve `EmbeddingFailedError` LISTEYE ACIKCA EKLENDI
 * ============================================================================
 * Ikisi de `CrmDomainError`'dan TUREMEZ — biri platformun ortak oran siniri
 * mekanizmasina (`shared/rate-limit.policy`), digeri paylasilan embedding
 * portuna aittir. `@Catch(...)`e yazilmasaydilar filtre onlari GORMEZ, 429 ve
 * 502 yerine islenmemis 500 donerdi.
 *
 * Bu ders projede UCUNCU kez ogreniliyor (Slice 2 ve 3'te ayni sey oldu) ve
 * bu kez BIR TEST yakaladi: "gorusme payi asilinca 429" testi 500 gordu.
 * ============================================================================
 */
const STATUS_BY_CODE: Readonly<Record<string, HttpStatus>> = {
  COMPANY_NAME_BLANK: HttpStatus.UNPROCESSABLE_ENTITY,
  CONTACT_NAME_BLANK: HttpStatus.UNPROCESSABLE_ENTITY,
  CRM_TIMESTAMP_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  OPPORTUNITY_TITLE_BLANK: HttpStatus.UNPROCESSABLE_ENTITY,
  OPPORTUNITY_STAGE_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  OPPORTUNITY_CURRENCY_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  INTERACTION_BODY_BLANK: HttpStatus.UNPROCESSABLE_ENTITY,
  INTERACTION_EMBEDDING_DIMENSIONS_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,

  // "Yok" ile "baska tenant'in" AYIRT EDILMEZ — ikisi de 404 (P2).
  COMPANY_NOT_FOUND: HttpStatus.NOT_FOUND,
  CONTACT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CONTACT_COMPANY_NOT_FOUND: HttpStatus.NOT_FOUND,
  OPPORTUNITY_NOT_FOUND: HttpStatus.NOT_FOUND,
  OPPORTUNITY_COMPANY_NOT_FOUND: HttpStatus.NOT_FOUND,
  OPPORTUNITY_CONTACT_NOT_FOUND: HttpStatus.NOT_FOUND,
  INTERACTION_COMPANY_NOT_FOUND: HttpStatus.NOT_FOUND,
};

/**
 * Gorusme KAYDEDILDI ama indekslenemedi (ADR-0029 §4'un bilinen siniri).
 *
 * Genel bir hata donmek kullaniciyi metni yeniden yazmaya ve MUKERRER kayda
 * iterdi. Mesaj acikca durumu soyler ve onarim yolunu gosterir.
 */
const EMBEDDING_FAILED_DETAIL =
  'Gorusme kaydedildi ancak arama icin indekslenemedi; /crm/reindex ile onarilabilir.';

@Catch(CrmDomainError, RateLimitExceededError, EmbeddingFailedError)
export class CrmDomainExceptionFilter implements ExceptionFilter {
  catch(
    exception: CrmDomainError | RateLimitExceededError | EmbeddingFailedError,
    host: ArgumentsHost,
  ): void {
    if (exception instanceof EmbeddingFailedError) {
      throw new HttpException(EMBEDDING_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
    }

    if (exception instanceof RateLimitExceededError) {
      // `Retry-After` 429'un standart tamamlayicisidir. Govde degil BASLIK
      // oldugu icin RFC 7807 bicimlendirmesine dokunmaz.
      host
        .switchToHttp()
        .getResponse<Response>()
        .setHeader('Retry-After', String(exception.retryAfterSeconds));
      throw new HttpException(exception.message, HttpStatus.TOO_MANY_REQUESTS);
    }

    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Beklenmeyen bir domain hatasinin MESAJI disari sizmaz.
      throw new HttpException('Internal server error', status);
    }

    throw new HttpException(exception.message, status);
  }
}
