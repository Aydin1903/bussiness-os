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
import { ProjectsDomainError } from '../domain/projects.error';

/**
 * Projeler domain hatalarini HTTP'ye cevirir.
 *
 * `CrmDomainExceptionFilter` ile ayni disiplin: karar tek yerde, controller'da
 * dagitik `try/catch` YOK.
 *
 * ============================================================================
 * ⚠️ `RateLimitExceededError` ve `EmbeddingFailedError` BASTAN EKLENDI
 * ============================================================================
 * Ikisi de `ProjectsDomainError`'dan TUREMEZ — biri platformun ortak oran
 * siniri mekanizmasina (`shared/rate-limit.policy`), digeri paylasilan
 * embedding portuna aittir. `@Catch(...)`e yazilmasalardi filtre onlari GORMEZ,
 * 429 ve 502 yerine ISLENMEMIS 500 donerdi.
 *
 * CRM'de bu ders DORT KEZ ogrenildi (Slice 2, Slice 3, Slice 6 ve Katman 2) ve
 * her seferinde bir testin kirmizi yanmasiyla bulundu. Genellenmis kural:
 * BIR MODUL YENI BIR PORT KULLANMAYA BASLADIGINDA, O PORTUN HATA TIPI BURAYA
 * EKLENMELIDIR. Slice 3 bu modulun ilk AI slice'i; kural bu kez ONCEDEN
 * uygulandi.
 *
 * `CompletionFailedError` BURADA YOK ve bu DOGRU: Projeler `LLMPort`
 * KULLANMAZ (ADR-0033 §10 — modul ici AI yuzeyi v1'de yok). Var olmayan bir
 * bagimliligin hatasini yakalamak, yuzeyi gereksizce genisletirdi.
 * ⚠️ Bir "proje ozeti" (ADR-0032'nin musteri ozetinin karsiligi) eklendigi gun
 * bu satir da eklenmelidir.
 * ============================================================================
 */
const STATUS_BY_CODE: Readonly<Record<string, HttpStatus>> = {
  PROJECT_NAME_BLANK: HttpStatus.UNPROCESSABLE_ENTITY,
  PROJECT_STATUS_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  PROJECT_DUE_BEFORE_START: HttpStatus.UNPROCESSABLE_ENTITY,
  PROJECTS_TIMESTAMP_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  TASK_TITLE_BLANK: HttpStatus.UNPROCESSABLE_ENTITY,
  TASK_STATUS_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  PROGRESS_NOTE_BODY_BLANK: HttpStatus.UNPROCESSABLE_ENTITY,
  PROGRESS_NOTE_EMBEDDING_DIMENSIONS_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,

  // 422, 404 DEGIL: istekteki KAYNAK yok degil — govdedeki bir ALAN gecersiz.
  // Ayrimin gerekcesi `TaskAssigneeNotMemberError`de.
  TASK_ASSIGNEE_NOT_MEMBER: HttpStatus.UNPROCESSABLE_ENTITY,

  // "Yok" ile "baska tenant'in" AYIRT EDILMEZ — ikisi de 404 (P2).
  PROJECT_NOT_FOUND: HttpStatus.NOT_FOUND,
  PROJECT_COMPANY_NOT_FOUND: HttpStatus.NOT_FOUND,
  TASK_NOT_FOUND: HttpStatus.NOT_FOUND,
  TASK_PROJECT_NOT_FOUND: HttpStatus.NOT_FOUND,
  PROGRESS_NOTE_PROJECT_NOT_FOUND: HttpStatus.NOT_FOUND,
  PROGRESS_NOTE_TASK_NOT_FOUND: HttpStatus.NOT_FOUND,
};

/**
 * Not KAYDEDILDI ama indekslenemedi (ADR-0029 §4'un bilinen siniri).
 *
 * Genel bir hata donmek kullaniciyi metni yeniden yazmaya ve MUKERRER kayda
 * iterdi. Mesaj acikca durumu soyler ve onarim yolunu gosterir.
 *
 * ⚠️ BU METIN ISTEMCIYE VARSAYILAN OLARAK ULASMIYORDU (ADR-0035 kapanis
 * denetimi, 2026-08-13): `ProblemDetailsFilter` her 5xx govdesini maskeler.
 * Cozum `DisclosableHttpException`dir; bkz. asagidaki `catch`.
 */
const EMBEDDING_FAILED_DETAIL =
  'Ilerleme notu kaydedildi ancak arama icin indekslenemedi; /projects/reindex ile onarilabilir.';

@Catch(ProjectsDomainError, RateLimitExceededError, EmbeddingFailedError)
export class ProjectsDomainExceptionFilter implements ExceptionFilter {
  catch(
    exception: ProjectsDomainError | RateLimitExceededError | EmbeddingFailedError,
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
