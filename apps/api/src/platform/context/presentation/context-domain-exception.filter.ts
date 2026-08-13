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

/*
 * ⚠️ IKI METIN DE ISTEMCIYE VARSAYILAN OLARAK ULASMIYORDU (ADR-0035 kapanis
 * denetimi, 2026-08-13): `ProblemDetailsFilter` her 5xx govdesini maskeler,
 * yani "tekrar deneyin" bilgisi "Beklenmeyen bir hata olustu."ya donuyordu ve
 * kullanici tekrar denenebilir bir durumu KALICI bir ariza saniyordu.
 *
 * Bes IS MODULU bir onceki iste kapatildi; `platform/context` o iste KAPSAM
 * DISI birakilmisti (platform ucu ayri bir karardir) ve acik borc olarak
 * yazilmisti. Bu commit o borcu kapatir — desen AYNI, yalnizca uygulandigi
 * yer farkli.
 */

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
    // ⚠️ ASAGIDAKI IKI 502 `DisclosableHttpException`DIR, duz `HttpException`
    // DEGIL: govdeleri ELLE YAZILMISTIR ve saglayicinin mesajini TASIMAZ.
    // Isaretsiz birakilirlarsa global filtre ikisini de "Beklenmeyen bir hata
    // olustu."ya cevirir.
    //
    // ⚠️ SECICI bir genisletme, genel bir acma DEGIL: isaretlenmeyen tek 5xx
    // yolu (eslenmemis domain kodu -> 500) MASKELI KALIR — orada govde bizim
    // yazdigimiz bir metin degil, beklenmeyen bir hatanin kendi mesajidir.
    //
    // ⚠️ FAN-OUT BU ISARETI DAHA DA ONEMLI KILAR: `/ask` DOKUZ katkiciya
    // dokunur ve bir saglayici cokmesinde kullanicinin gordugu TEK sey bu
    // govdedir. "Tekrar deneyin" ile "beklenmeyen hata" arasindaki fark,
    // kullanicinin tekrar deneyip denemeyecegini belirler.
    if (exception instanceof CompletionFailedError) {
      throw new DisclosableHttpException(COMPLETION_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
    }

    if (exception instanceof EmbeddingFailedError) {
      throw new DisclosableHttpException(EMBEDDING_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
    }

    if (exception instanceof RateLimitExceededError) {
      // ⚠️ 429 ISARET TASIMAZ ve buna gerek YOKTUR: maske yalnizca 5xx'e
      // uygulanir, 4xx govdeleri zaten oldugu gibi gecer.
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
      // Beklenmeyen bir domain hatasinin MESAJI disari sizmaz. ISARETSIZ
      // BIRAKILMASI BILINCLIDIR: maskeleme burada DEVAM EDER.
      throw new HttpException('Internal server error', status);
    }

    throw new HttpException(exception.message, status);
  }
}
