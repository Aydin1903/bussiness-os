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
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import { FinanceDomainError } from '../domain/finance.error';

/**
 * Finans domain hatalarini HTTP'ye cevirir.
 *
 * `CrmDomainExceptionFilter` / `ProjectsDomainExceptionFilter` ile ayni
 * disiplin: karar tek yerde, controller'da dagitik `try/catch` YOK.
 *
 * ============================================================================
 * ⚠️ `RateLimitExceededError` ve `EmbeddingFailedError` — SLICE 5'TE, ILK GUN
 * ============================================================================
 * Ikisi de `FinanceDomainError`dan TUREMEZ — biri platformun ortak oran siniri
 * mekanizmasina (`shared/rate-limit.policy`), digeri paylasilan embedding
 * portuna aittir. `@Catch(...)`e yazilmasalardi filtre onlari GORMEZ, 429 ve
 * 502 yerine ISLENMEMIS 500 donerdi.
 *
 * CRM'de bu ders DORT KEZ ogrenildi (Slice 2, Slice 3, Slice 6 ve Katman 2) ve
 * her seferinde bir testin kirmizi yanmasiyla bulundu. Projeler onu ONCEDEN
 * uyguladi; Finans da ayni sekilde — Slice 1-4 boyunca bu iki satir BILEREK
 * yoktu (modul o gunlerde hicbir port kullanmiyordu) ve modulun ilk AI
 * slice'inda, hicbir test kirmizi yanmadan eklendi.
 *
 * Genellenmis kural: BIR MODUL YENI BIR PORT KULLANMAYA BASLADIGINDA, O PORTUN
 * HATA TIPI BURAYA EKLENMELIDIR.
 *
 * `CompletionFailedError` BURADA YOK ve bu DOGRU: Finans `LLMPort`
 * KULLANMAZ (ADR-0034 §10 — modul ici AI yuzeyi v1'de yok). Var olmayan bir
 * bagimliligin hatasini yakalamak yuzeyi gereksizce genisletirdi.
 * ⚠️ Bir "donem ozeti" (ADR-0032'nin musteri ozetinin karsiligi) eklendigi gun
 * bu satir da eklenmelidir — CRM'in ayni satiri Katman 2'de YANLISLANDI.
 * ============================================================================
 */
const STATUS_BY_CODE: Readonly<Record<string, HttpStatus>> = {
  FINANCE_CATEGORY_NAME_BLANK: HttpStatus.UNPROCESSABLE_ENTITY,
  FINANCE_DIRECTION_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  FINANCE_TIMESTAMP_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,

  // Islem alan dogrulamalari (ADR-0034 §2).
  FINANCE_AMOUNT_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  FINANCE_CURRENCY_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  FINANCE_OCCURRED_ON_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,

  // Yorumlar (ADR-0034 §6.1).
  FINANCE_COMMENTARY_BODY_BLANK: HttpStatus.UNPROCESSABLE_ENTITY,
  FINANCE_COMMENTARY_EMBEDDING_DIMENSIONS_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,

  // 422, 404 DEGIL: kategori VAR — istekteki iki alan birbiriyle celisiyor
  // (gerekce `CategoryDirectionMismatchError`de).
  FINANCE_CATEGORY_DIRECTION_MISMATCH: HttpStatus.UNPROCESSABLE_ENTITY,
  FINANCE_CATEGORY_ARCHIVED: HttpStatus.UNPROCESSABLE_ENTITY,

  // "Yok" ile "baska tenant'in" AYIRT EDILMEZ — ikisi de 404 (P2).
  FINANCE_CATEGORY_NOT_FOUND: HttpStatus.NOT_FOUND,
  FINANCE_TRANSACTION_NOT_FOUND: HttpStatus.NOT_FOUND,
  // Govdedeki bir ALAN var olmayan bir KAYNAGA isaret ediyor
  // (`TaskProjectNotFoundError` ile ayni desen).
  FINANCE_TRANSACTION_CATEGORY_NOT_FOUND: HttpStatus.NOT_FOUND,
  // Cross-modul yumusak referanslar (ADR-0034 §4): "yok", "baska tenant'in" ve
  // "izin yok" AYIRT EDILMEZ — ucu de 404. `PROJECT_COMPANY_NOT_FOUND` ile
  // ayni desen.
  FINANCE_TRANSACTION_COMPANY_NOT_FOUND: HttpStatus.NOT_FOUND,
  FINANCE_TRANSACTION_PROJECT_NOT_FOUND: HttpStatus.NOT_FOUND,

  FINANCE_CATEGORY_DUPLICATE: HttpStatus.CONFLICT,
  FINANCE_CATEGORY_IN_USE: HttpStatus.CONFLICT,
};

/**
 * Yorum KAYDEDILDI ama indekslenemedi (ADR-0029 §4'un bilinen siniri).
 *
 * Genel bir hata donmek kullaniciyi metni yeniden yazmaya ve MUKERRER kayda
 * iterdi. Mesaj acikca durumu soyler ve onarim yolunu gosterir.
 *
 * ⚠️ BU METIN ISTEMCIYE VARSAYILAN OLARAK ULASMIYORDU (ADR-0035 kapanis
 * denetimi, 2026-08-13): `ProblemDetailsFilter` her 5xx govdesini maskeler.
 * Cozum `DisclosableHttpException`dir; bkz. asagidaki `catch`.
 */
const EMBEDDING_FAILED_DETAIL =
  'Finansal yorum kaydedildi ancak arama icin indekslenemedi; /finance/reindex ile onarilabilir.';

@Catch(FinanceDomainError, RateLimitExceededError, EmbeddingFailedError)
export class FinanceDomainExceptionFilter implements ExceptionFilter {
  catch(
    exception: FinanceDomainError | RateLimitExceededError | EmbeddingFailedError,
    host: ArgumentsHost,
  ): void {
    // ⚠️ BU 502 `DisclosableHttpException`DIR, duz `HttpException` DEGIL:
    // govdesi ELLE YAZILMISTIR ve saglayicinin mesajini TASIMAZ. Isaretsiz
    // birakilirsa global filtre onu "Beklenmeyen bir hata olustu."ya cevirir
    // ve mesajin var olma sebebi (mukerrer kaydi onlemek) calismaz.
    //
    // ⚠️ SECICI bir genisletme, genel bir acma DEGIL: isaretlenmeyen tek 5xx
    // yolu (eslenmemis domain kodu -> 500) MASKELI KALIR.
    if (exception instanceof EmbeddingFailedError) {
      throw new DisclosableHttpException(EMBEDDING_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
    }

    if (exception instanceof RateLimitExceededError) {
      // ⚠️ 429 ISARET TASIMAZ ve buna gerek YOKTUR: maske yalnizca 5xx'e
      // uygulanir, 4xx govdeleri zaten oldugu gibi gecer.
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
      // Beklenmeyen bir domain hatasinin MESAJI disari sizmaz. ISARETSIZ
      // BIRAKILMASI BILINCLIDIR: maskeleme burada DEVAM EDER.
      throw new HttpException('Internal server error', status);
    }

    throw new HttpException(exception.message, status);
  }
}
