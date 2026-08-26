import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { type Response } from 'express';

import { DisclosableHttpException } from '../../../infrastructure/http/problem-details.filter';
import { EmbeddingFailedError } from '../../../shared/embedding.port';
import { CompletionFailedError } from '../../../shared/llm.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import { MarketingDomainError } from '../domain/marketing.error';

/**
 * ⚠️ UC AI HATA TIPI DE BASTAN YAZILIR — CLAUDE.md'nin kalici standardi,
 * ONIKINCI kez.
 *
 * `CompletionFailedError` bu modulde TETIKLENEMEZ (`LLMPort` cagrisi yok) ve
 * yine de yazilir. Gerekce ASIMETRIK BEDELDIR: simdi yazmanin maliyeti bir
 * satirlik OLU KODDUR; sonra eklemeyi unutmanin maliyeti, o yol ilk kez
 * calistigi gun HAM 500 donmesi ve kullanicinin TEKRAR DENEMESI GEREKTIGINI
 * OGRENEMEMESIDIR.
 *
 * ⚠️ `EmbeddingFailedError` BURADA GERCEKTEN TETIKLENEBILIR ve mesaji iki
 * DURUMU birden anlatmak zorundadir: kayit hem OLUSTURMADA hem GUNCELLEMEDE
 * indekslenemeyebilir (§4.2.1 — guncellemede vektor `NULL`'a cekilir).
 *
 * ⚠️ 429 ISARET TASIMAZ: maske yalnizca 5xx'e uygulanir, 4xx govdeleri zaten
 * gecer. Isaret koymak hicbir seyi degistirmeyip "burada bir sey acildi"
 * izlenimi verirdi.
 *
 * ⚠️ `StorageFailedError` / `PdfPort` hatalari YAZILMAZ — kapsam AI hata
 * tipleridir, hepsi degil. Depolama yuzeyi olmayan bir module depolama hatasi
 * koymak olu kod degil YANILTICI olurdu.
 */
const STATUS_BY_CODE: Readonly<Record<string, HttpStatus>> = {
  CAMPAIGN_NAME_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  CAMPAIGN_NAME_TOO_LONG: HttpStatus.UNPROCESSABLE_ENTITY,
  CAMPAIGN_CHANNEL_TOO_LONG: HttpStatus.UNPROCESSABLE_ENTITY,
  CAMPAIGN_RESULT_NOTE_TOO_LONG: HttpStatus.UNPROCESSABLE_ENTITY,
  CAMPAIGN_STATUS_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  CAMPAIGN_DATE_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  CAMPAIGN_DATES_OUT_OF_ORDER: HttpStatus.UNPROCESSABLE_ENTITY,
  CAMPAIGN_EMBEDDING_DIMENSIONS_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  CAMPAIGN_NOT_FOUND: HttpStatus.NOT_FOUND,
  CAMPAIGN_COMPANY_NOT_FOUND: HttpStatus.NOT_FOUND,
};

const EMBEDDING_FAILED_DETAIL =
  'Kampanya kaydedildi ancak arama icin indekslenemedi; /campaigns/reindex ile onarilabilir.';
const COMPLETION_FAILED_DETAIL = 'AI saglayicisina ulasilamadi; lutfen tekrar deneyin.';

@Catch(MarketingDomainError, EmbeddingFailedError, RateLimitExceededError, CompletionFailedError)
export class MarketingDomainExceptionFilter implements ExceptionFilter {
  catch(
    exception:
      MarketingDomainError | EmbeddingFailedError | RateLimitExceededError | CompletionFailedError,
    host: ArgumentsHost,
  ): void {
    if (exception instanceof EmbeddingFailedError) {
      throw new DisclosableHttpException(EMBEDDING_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
    }

    if (exception instanceof CompletionFailedError) {
      throw new DisclosableHttpException(COMPLETION_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
    }

    if (exception instanceof RateLimitExceededError) {
      host
        .switchToHttp()
        .getResponse<Response>()
        .setHeader('Retry-After', String(exception.retryAfterSeconds));
      throw new HttpException(exception.message, HttpStatus.TOO_MANY_REQUESTS);
    }

    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    // ⚠️ ESLENMEMIS domain kodunun 500'u MASKELI KALIR — bu bir GENEL ACMA
    // degildir. Bir test bunu kilitler; olmasaydi, maskenin tumuyle kalktigi
    // bir regresyonda diger testler de yesil yanardi.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      throw new HttpException('Internal server error', status);
    }

    throw new HttpException(exception.message, status);
  }
}
