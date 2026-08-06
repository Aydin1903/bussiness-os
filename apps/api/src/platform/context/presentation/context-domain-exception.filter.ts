import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { type Response } from 'express';

import { EmbeddingFailedError } from '../../../shared/embedding.port';
import { CompletionFailedError } from '../../../shared/llm.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import { ContextDomainError } from '../domain/context.error';

/**
 * `POST /ask` akisindaki domain hatalarini HTTP'ye cevirir.
 *
 * `KnowledgeDomainExceptionFilter`in ikizidir ve AYNI disiplini tasir: karar
 * tek yerde verilir, controller'da dagitik `try/catch` yazilmaz. Ayri bir sinif
 * olmasinin sebebi hata KUMESININ farkli olmasidir — bu uc artik Knowledge'in
 * domain hatalarini (`NoteNotFound` vb.) URETMEZ.
 */
const EMBEDDING_FAILED_DETAIL = 'Soru islenemedi; lutfen tekrar deneyin.';

/**
 * `/ask` akisinda yan etki YOKTUR: konusma ve mesajlar yalnizca completion
 * BASARILI olduktan sonra yazilir. Dolayisiyla istek tumuyle sonucsuz kaldi
 * ve tekrar denenebilir.
 */
const COMPLETION_FAILED_DETAIL = 'Cevap uretilemedi; lutfen tekrar deneyin.';

const STATUS_BY_CODE: Readonly<Record<string, HttpStatus>> = {
  CONVERSATION_ACCESS_DENIED: HttpStatus.FORBIDDEN,
};

/**
 * `RateLimitExceededError` listede ACIKCA yer alir: `ContextDomainError`'dan
 * TUREMEZ (mekanizma platformun ortak kodudur, bu ucun degil). Yazilmasaydi
 * filtre onu gormez, 429 yerine islenmemis bir 500 doner ve `Retry-After`
 * basligi hic uretilmezdi.
 */
@Catch(ContextDomainError, EmbeddingFailedError, CompletionFailedError, RateLimitExceededError)
export class ContextDomainExceptionFilter implements ExceptionFilter {
  catch(
    exception:
      ContextDomainError | EmbeddingFailedError | CompletionFailedError | RateLimitExceededError,
    host: ArgumentsHost,
  ): void {
    if (exception instanceof CompletionFailedError) {
      throw new HttpException(COMPLETION_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
    }

    if (exception instanceof EmbeddingFailedError) {
      throw new HttpException(EMBEDDING_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
    }

    if (exception instanceof RateLimitExceededError) {
      // `Retry-After` 429'un standart tamamlayicisidir: istemciye NE ZAMAN
      // tekrar deneyebilecegini soyler. Govde degil BASLIK oldugu icin
      // RFC 7807 bicimlendirmesine dokunmaz.
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
