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
import { LoyaltyDomainError } from '../domain/loyalty.error';

/**
 * ⚠️ UC AI HATA TIPI DE BASTAN YAZILIR — CLAUDE.md'nin kalici standardi,
 * ONUCUNCU kez.
 *
 * ============================================================================
 * ⚠️ VE BU MODULDE UCU DE TETIKLENEMEZ — UCUNCU KEZ
 * ============================================================================
 * Teklif/Fatura (ADR-0041) ve IK (ADR-0043)'ten sonra tumuyle tetiklenemez
 * UCUNCU modul: embedding YOK, oran siniri YOK, `LLMPort` cagrisi YOK. Bu
 * modul `POST /ask` havuzuna SIFIR katkici verir (ADR-0051 §3).
 *
 * Kural yine de uygulaniyor ve gerekce ASIMETRIK BEDELDIR:
 *
 *   simdi yaz  -> bir satirlik OLU KOD. Gorunur, ucuz, zararsiz.
 *   sonra ekle -> unutulursa o yol ilk kez calistigi gun HAM 500 doner;
 *                 `ProblemDetailsFilter` govdeyi maskeler, kullanici
 *                 "beklenmeyen hata" gorur ve TEKRAR DENEMESI GEREKTIGINI
 *                 OGRENEMEZ. Hata SESSIZDIR.
 *
 * ⚠️ Kapsam AI HATA TIPLERIDIR, hepsi degil: `StorageFailedError` / `PdfPort`
 * hatalari YAZILMAZ — depolama ya da PDF yuzeyi olmayan bir module onlari
 * koymak olu kod degil YANILTICI olurdu (okuyan biri o yuzeyin VAR OLDUGUNU
 * sanardi).
 *
 * ⚠️ 429 ISARET TASIMAZ: maske yalnizca 5xx'e uygulanir, 4xx govdeleri zaten
 * gecer.
 */
const STATUS_BY_CODE: Readonly<Record<string, HttpStatus>> = {
  LOYALTY_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  LOYALTY_CONTACT_NOT_FOUND: HttpStatus.UNPROCESSABLE_ENTITY,
  // ⚠️ 409 — bu modulde VAR ve son iki modulden AYRILDIGIMIZ NOKTA (§1.2).
  LOYALTY_ACCOUNT_EXISTS: HttpStatus.CONFLICT,
  // ⚠️ 422, 409 DEGIL: yetersiz bakiye bir CAKISMA degil, istegin ISLENEMEZ
  // olmasidir — musteri o kadar puana sahip degildir ve tekrar denemek
  // (409'un ima ettigi sey) durumu degistirmez.
  LOYALTY_INSUFFICIENT_POINTS: HttpStatus.UNPROCESSABLE_ENTITY,
  LOYALTY_ENTRY_DATE_IN_FUTURE: HttpStatus.UNPROCESSABLE_ENTITY,
  LOYALTY_POINTS_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  LOYALTY_DIRECTION_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  LOYALTY_ENTRY_NOTE_TOO_LONG: HttpStatus.UNPROCESSABLE_ENTITY,
};

const EMBEDDING_FAILED_DETAIL =
  'Kayit alindi ancak arama icin indekslenemedi; lutfen tekrar deneyin.';
const COMPLETION_FAILED_DETAIL = 'AI saglayicisina ulasilamadi; lutfen tekrar deneyin.';

@Catch(LoyaltyDomainError, EmbeddingFailedError, RateLimitExceededError, CompletionFailedError)
export class LoyaltyDomainExceptionFilter implements ExceptionFilter {
  catch(
    exception:
      LoyaltyDomainError | EmbeddingFailedError | RateLimitExceededError | CompletionFailedError,
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
