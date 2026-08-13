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
 *
 * ⚠️ DORDUNCU KEZ — `CompletionFailedError` (Katman 2, ADR-0032). CRM o gune
 * kadar `LLMPort` KULLANMIYORDU (`crm.module.ts` bunu "LLM_PORT YOK — CRM
 * completion cagirmaz" diye yaziyordu bile); musteri ozeti bu varsayimi
 * degistirdi. Liste kod incelemesinde guncellendi: saglayici cokmesi
 * islenmemis 500 yerine 502 doner. Bu satirin ogrettigi kural artik
 * genellenebilir: BIR MODUL YENI BIR PORT KULLANMAYA BASLADIGINDA, O PORTUN
 * HATA TIPI FILTREYE EKLENMELIDIR.
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

  // Istek GECERLI, ama ozetlenecek malzeme yok. 404 degil: sirket VAR.
  COMPANY_SUMMARY_NO_INTERACTIONS: HttpStatus.UNPROCESSABLE_ENTITY,

  // "Yok" ile "baska tenant'in" AYIRT EDILMEZ — ikisi de 404 (P2).
  COMPANY_NOT_FOUND: HttpStatus.NOT_FOUND,
  CONTACT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CONTACT_COMPANY_NOT_FOUND: HttpStatus.NOT_FOUND,
  OPPORTUNITY_NOT_FOUND: HttpStatus.NOT_FOUND,
  OPPORTUNITY_COMPANY_NOT_FOUND: HttpStatus.NOT_FOUND,
  OPPORTUNITY_CONTACT_NOT_FOUND: HttpStatus.NOT_FOUND,
  INTERACTION_COMPANY_NOT_FOUND: HttpStatus.NOT_FOUND,

  // Cakisma: kaynak MESGUL. Yeniden denenebilir bir durumdur, hata degil.
  COMPANY_SUMMARY_GENERATION_IN_PROGRESS: HttpStatus.CONFLICT,
};

/**
 * Gorusme KAYDEDILDI ama indekslenemedi (ADR-0029 §4'un bilinen siniri).
 *
 * Genel bir hata donmek kullaniciyi metni yeniden yazmaya ve MUKERRER kayda
 * iterdi. Mesaj acikca durumu soyler ve onarim yolunu gosterir.
 */
const EMBEDDING_FAILED_DETAIL =
  'Gorusme kaydedildi ancak arama icin indekslenemedi; /crm/reindex ile onarilabilir.';

/**
 * Ozet uretilemedi (ADR-0032).
 *
 * `EmbeddingFailedError`den FARKLI bir mesaj: orada bir sey KAYDEDILMISTIR ve
 * kullanici bunu bilmelidir. Burada kaydedilen bir sey yok — onceki ozet
 * (varsa) yerinde durur, claim birakilmistir, tekrar denemek guvenlidir.
 */
const COMPLETION_FAILED_DETAIL =
  'Ozet su anda uretilemedi; birazdan tekrar deneyin. Mevcut ozet korundu.';

/*
 * ⚠️ YUKARIDAKI IKI METIN DE ISTEMCIYE VARSAYILAN OLARAK ULASMIYORDU
 * (ADR-0035 kapanis denetimi, 2026-08-13): `ProblemDetailsFilter` her 5xx
 * govdesini maskeler, yani ikisinin de FARKLI olmasinin sebebi ("bir sey
 * kaydedildi" vs "hicbir sey kaybolmadi") kullaniciya hic gorunmuyordu.
 * Cozum `DisclosableHttpException`dir; bkz. asagidaki `catch`.
 */

@Catch(CrmDomainError, RateLimitExceededError, EmbeddingFailedError, CompletionFailedError)
export class CrmDomainExceptionFilter implements ExceptionFilter {
  catch(
    exception:
      CrmDomainError | RateLimitExceededError | EmbeddingFailedError | CompletionFailedError,
    host: ArgumentsHost,
  ): void {
    // ⚠️ ASAGIDAKI IKI 502 `DisclosableHttpException`DIR, duz `HttpException`
    // DEGIL: govdeleri ELLE YAZILMISTIR ve saglayicinin mesajini TASIMAZ.
    // Isaretsiz birakilirlarsa global filtre ikisini de "Beklenmeyen bir hata
    // olustu."ya cevirir.
    //
    // ⚠️ SECICI bir genisletme, genel bir acma DEGIL: isaretlenmeyen tek 5xx
    // yolu (eslenmemis domain kodu -> 500) MASKELI KALIR.
    if (exception instanceof EmbeddingFailedError) {
      throw new DisclosableHttpException(EMBEDDING_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
    }

    if (exception instanceof CompletionFailedError) {
      throw new DisclosableHttpException(COMPLETION_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
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
