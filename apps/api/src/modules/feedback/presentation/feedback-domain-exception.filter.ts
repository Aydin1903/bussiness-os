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
import { FeedbackDomainError } from '../domain/feedback.error';

/**
 * Geri bildirim domain hatalarini HTTP'ye cevirir (ADR-0045 §7).
 *
 * `SuppliersDomainExceptionFilter` / `AppointmentsDomainExceptionFilter` ile
 * ayni disiplin: karar tek yerde, controller'da dagitik `try/catch` YOK.
 *
 * ============================================================================
 * ⚠️ AI HATA TIPLERI ILK GUNDEN — MODUL MODUL YENIDEN TARTISILMAZ
 * ============================================================================
 * `@Catch(...)` listesi BASTAN dort tip tasiyor; ucu `shared/`in PAYLASILAN
 * hata tipleridir:
 *
 *     EmbeddingFailedError    -> 502 (`shared/embedding.port`)
 *     RateLimitExceededError  -> 429 + `Retry-After` (`shared/rate-limit.policy`)
 *     CompletionFailedError   -> 502 (`shared/llm.port`)
 *
 * Bu, CLAUDE.md'nin KALICI KURALIDIR ve Product Owner'in standardidir
 * (ADR-0035 §8'den beri; ADR-0037 §9, ADR-0039 §10.1, ADR-0040 §7, ADR-0041,
 * ADR-0043 §9 ve simdi ADR-0045 §7 — ONBIRINCI kez).
 *
 * Gerekce ASIMETRIK BEDELDIR:
 *
 *   SIMDI YAZ  -> bir satirlik OLU KOD. Gorunur, ucuz, zararsiz.
 *   SONRA EKLE -> ⚠️ unutulursa o yol ilk kez calistigi gun HAM 500 doner:
 *                 `ProblemDetailsFilter` govdeyi maskeler, kullanici
 *                 "beklenmeyen hata" gorur ve TEKRAR DENEMESI GEREKTIGINI
 *                 OGRENEMEZ. Hata SESSIZDIR.
 *
 * ============================================================================
 * ⚠️ ONCEKI IKI MODULDEN FARKI: IKI TIP GERCEKTEN TETIKLENEBILIR
 * ============================================================================
 * ADR-0041 (Teklif/Fatura) ve ADR-0043 (IK) icin ucu de OLU KODDU — o
 * modullerde AI yuzeyi yoktu. Burada:
 *
 *     EmbeddingFailedError   -> ⚠️ TETIKLENEBILIR (yorumlu kayit + `reindex`)
 *     RateLimitExceededError -> ⚠️ TETIKLENEBILIR (yorumlu yazma + `reindex`)
 *     CompletionFailedError  -> HAYIR: modul `LLMPort` KULLANMAZ ve
 *                               `feedback.module.ts` `LLM_PORT` SAGLAMAZ.
 *
 * ⚠️ Ucuncusu yine de yazili — ve bir "memnuniyet ozeti" (ADR-0032'nin musteri
 * ozeti karsiligi) eklendigi gun yapilacak is SIFIRDIR: filtre zaten hazir.
 *
 * ============================================================================
 * ⚠️ `StorageFailedError` YOKTUR — VE BU CELISKI DEGIL (ADR-0039 §10.2)
 * ============================================================================
 * Kural tek cumleyle: **AI hata tipleri her modulde bastan yazilir; ALAN BAZLI
 * hata tipleri (depolama gibi) yalnizca o alani KULLANAN modulde yazilir.**
 *
 * Bu modul `StoragePort`u bugun kullanmiyor VE KULLANMAYACAK: bir geri
 * bildirime dosya eklemek diye bir kavram yoktur. "Er ya da gec AI'a dokunur"
 * varsayimi depolama icin GECERLI DEGILDIR, yani satir olu kod degil
 * YANILTICI olurdu.
 */
const STATUS_BY_CODE: Readonly<Record<string, HttpStatus>> = {
  // ⚠️ Olcek disi puan 422: istek BICIMSEL olarak bozuktur.
  FEEDBACK_RATING_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  FEEDBACK_RECEIVED_AT_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,

  // ⚠️ SESSIZ KIRPMA YASAK (§1.4): sinir asilirsa istek REDDEDILIR.
  FEEDBACK_COMMENT_TOO_LONG: HttpStatus.UNPROCESSABLE_ENTITY,
  FEEDBACK_CHANNEL_TOO_LONG: HttpStatus.UNPROCESSABLE_ENTITY,
  FEEDBACK_EMBEDDING_DIMENSIONS_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,

  // "Yok" ile "baska tenant'in" AYIRT EDILMEZ — ikisi de 404 (P2).
  FEEDBACK_RESPONSE_NOT_FOUND: HttpStatus.NOT_FOUND,
  // ⚠️ Ucuncu bir anlam daha tasir: "`contact:read` TASIMIYORSUN". Ayirt
  // edilseydi, goremedigi bir kisinin VAR OLDUGU sizardi (§6.1).
  FEEDBACK_CONTACT_NOT_FOUND: HttpStatus.NOT_FOUND,
};

/**
 * Kayit KAYDEDILDI ama indekslenemedi (ADR-0029 §4'un bilinen siniri).
 *
 * ⚠️ Genel bir hata donmek kullaniciyi kaydi YENIDEN GIRMEYE ve MUKERRER kayda
 * iterdi — ve mukerrer bir geri bildirim ORTALAMAYI BOZAR (aynı musteri iki kez
 * sayilir). Mesaj acikca durumu soyler ve onarim yolunu gosterir.
 *
 * ⚠️ Bu metin `DisclosableHttpException` OLMASAYDI istemciye ULASMAZDI:
 * `ProblemDetailsFilter` her 5xx govdesini maskeler ve kullanici "Beklenmeyen
 * bir hata olustu." gorurdu — yani mesajin VAR OLMA SEBEBI calismazdi.
 */
const EMBEDDING_FAILED_DETAIL =
  'Geri bildirim kaydedildi ancak arama icin indekslenemedi; /feedback/reindex ile onarilabilir.';

/** Completion bu modulde bugun URETILEMEZ; mesaj yine de anlamli olmali. */
const COMPLETION_FAILED_DETAIL = 'AI saglayicisina ulasilamadi; lutfen tekrar deneyin.';

@Catch(FeedbackDomainError, EmbeddingFailedError, RateLimitExceededError, CompletionFailedError)
export class FeedbackDomainExceptionFilter implements ExceptionFilter {
  catch(
    exception:
      FeedbackDomainError | EmbeddingFailedError | RateLimitExceededError | CompletionFailedError,
    host: ArgumentsHost,
  ): void {
    // ⚠️ ASAGIDAKI IKI 502 `DisclosableHttpException`DIR, duz `HttpException`
    // DEGIL: govdeleri ELLE YAZILMISTIR, saglayicinin mesajini TASIMAZ ve
    // kullaniciya ne oldugunu + ne yapacagini soyler.
    //
    // ⚠️ Bu SECICI bir genisletmedir, GENEL BIR ACMA DEGIL: bu metotta
    // isaretlenmeyen tek 5xx yolu (eslenmemis domain kodu -> 500) MASKELI
    // KALIR ve kalmalidir. Bir test onu kilitler — o test olmasaydi, maskenin
    // tumuyle kalktigi bir regresyonda diger testler de yesil yanardi.
    if (exception instanceof EmbeddingFailedError) {
      throw new DisclosableHttpException(EMBEDDING_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
    }

    if (exception instanceof CompletionFailedError) {
      throw new DisclosableHttpException(COMPLETION_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
    }

    if (exception instanceof RateLimitExceededError) {
      // ⚠️ 429 ISARET TASIMAZ ve buna gerek YOKTUR: maske yalnizca 5xx'e
      // uygulanir, 4xx govdeleri zaten oldugu gibi gecer. Isaret koymak
      // "burada bir sey acildi" izlenimi verirdi — oysa hicbir sey degismezdi.
      host
        .switchToHttp()
        .getResponse<Response>()
        .setHeader('Retry-After', String(exception.retryAfterSeconds));
      throw new HttpException(exception.message, HttpStatus.TOO_MANY_REQUESTS);
    }

    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Beklenmeyen bir domain hatasinin MESAJI disari sizmaz. ISARETSIZ
      // BIRAKILMASI BILINCLIDIR: global filtre bunu maskelemeye devam eder.
      throw new HttpException('Internal server error', status);
    }

    throw new HttpException(exception.message, status);
  }
}
