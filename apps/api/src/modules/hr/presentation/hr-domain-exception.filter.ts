import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

import { DisclosableHttpException } from '../../../infrastructure/http/problem-details.filter';
import { CompletionFailedError } from '../../../shared/llm.port';
import { EmbeddingFailedError } from '../../../shared/embedding.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import { HrDomainError } from '../domain/hr.error';

/**
 * IK domain hatalarini RFC 7807 cevaplarina cevirir.
 *
 * ============================================================================
 * ⚠️ UC AI HATA TIPI DE BASTAN KAYITLI — VE UCU DE BUGUN TETIKLENEMEZ
 * ============================================================================
 * CLAUDE.md'nin KALICI STANDARDI (Product Owner; ADR-0035 §8'de dogdu,
 * ADR-0037 §9, ADR-0039 §10.1 ve ADR-0041 §10'da tekrar uygulandi):
 *
 *     "`EmbeddingFailedError`, `RateLimitExceededError` ve
 *      `CompletionFailedError` HER modulun filtresinin `@Catch(...)` listesine
 *      BASTAN eklenir — o modul bugun kullaniyor olsun ya da olmasin."
 *
 * ⚠️ Bu modulde UCU DE TETIKLENEMEZ: embedding yok, oran siniri yok, LLM
 * cagrisi yok (ADR-0043 §5 — modul `POST /ask` havuzuna HIC baglanmaz).
 * ADR-0041'den sonra IKINCI kez tumuyle tetiklenemez bir modulde uygulaniyor.
 *
 * Gerekce ASIMETRIK BEDELDIR:
 *
 *   SIMDI YAZ  -> uc satirlik OLU KOD. Gorunur, ucuz, zararsiz.
 *   SONRA EKLE -> ⚠️ unutulursa, modul bir AI yuzeyi kazandigi gun HAM 500
 *                 doner: `ProblemDetailsFilter` govdeyi maskeler, kullanici
 *                 "beklenmeyen hata" gorur ve TEKRAR DENEMESI GEREKTIGINI
 *                 OGRENEMEZ. Hata SESSIZDIR.
 *
 * ⚠️ BU MODUL BIR AI YUZEYI KAZANMAYA UZAK AMA IMKANSIZ DEGIL: IK v2'nin
 * performans notu ya da izin/tatil gunlugu ANLATISAL icerik getirir ve o gun
 * §5'in katkici sorusu YENIDEN sorulur. ⚠️ O gun ONCE §4.2'nin uc katmani
 * yeniden okunmalidir — maas izolasyonunun ucuncu katmani tam olarak
 * "katkici yoklugu"dur.
 *
 * ⚠️ `StorageFailedError` ve PDF hatalari YAZILMAZ: kuralin kapsami AI HATA
 * TIPLERIDIR, hepsi degil. Dosya saklamayan bir module depolama hatasi koymak
 * olu kod degil YANILTICI olurdu.
 */
const STATUS_BY_CODE: Readonly<Record<string, HttpStatus>> = {
  EMPLOYEE_NOT_FOUND: HttpStatus.NOT_FOUND,

  EMPLOYEE_NAME_BLANK: HttpStatus.UNPROCESSABLE_ENTITY,
  HR_FIELD_TOO_LONG: HttpStatus.UNPROCESSABLE_ENTITY,
  EMPLOYMENT_STATUS_INCONSISTENT: HttpStatus.UNPROCESSABLE_ENTITY,
  EMPLOYMENT_DATES_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  HR_DATE_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  COMPENSATION_AMOUNT_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  COMPENSATION_CURRENCY_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,

  // ⚠️ 422: istek BICIMSEL olarak da yanlistir — verilen id bu tenant'in
  // uyesi degil. Kullanici baska bir kullanici secmelidir.
  EMPLOYEE_USER_NOT_MEMBER: HttpStatus.UNPROCESSABLE_ENTITY,

  // ⚠️ 409, 422 DEGIL: istek bicimsel olarak GECERLIDIR, KAYNAGIN DURUMU
  // elverissizdir (`CategoryInUseError` / `DuplicateSkuError` ile ayni sinif).
  EMPLOYEE_USER_ALREADY_LINKED: HttpStatus.CONFLICT,
  EMPLOYEE_HAS_COMPENSATION: HttpStatus.CONFLICT,

  // ⚠️ `COMPENSATION_DATE_DUPLICATE` KALDIRILDI (ADR-0044 §1): ayni yururluk
  // tarihine ikinci kayit artik bir HATA degil, bir DUZELTMEDIR. Satir burada
  // birakilsaydi haritaya bakan biri ucun hala 409 dondugunu sanardi.

  // --- IK v2 (ADR-0044) ---
  LEAVE_REQUEST_NOT_FOUND: HttpStatus.NOT_FOUND,
  LEAVE_DATES_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  ANNUAL_LEAVE_DAYS_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  EMPLOYEE_MANAGER_SELF: HttpStatus.UNPROCESSABLE_ENTITY,

  // ⚠️ 409, 422 DEGIL: istek bicimsel olarak GECERLIDIR, KAYNAGIN DURUMU
  // elverissizdir — karara baglanmis bir izin yeniden karara baglanamaz.
  LEAVE_ALREADY_DECIDED: HttpStatus.CONFLICT,
};

/** Bu modulde bugun URETILEMEZ; mesaj yine de anlamli olmali. */
const EMBEDDING_FAILED_DETAIL =
  'Kayit alindi ancak arama icin indekslenemedi; lutfen tekrar deneyin.';
const COMPLETION_FAILED_DETAIL = 'AI saglayicisina ulasilamadi; lutfen tekrar deneyin.';

@Catch(HrDomainError, EmbeddingFailedError, RateLimitExceededError, CompletionFailedError)
export class HrDomainExceptionFilter implements ExceptionFilter {
  catch(
    exception:
      HrDomainError | EmbeddingFailedError | RateLimitExceededError | CompletionFailedError,
    host: ArgumentsHost,
  ): void {
    // ⚠️ Asagidaki iki 502 `DisclosableHttpException`dir: govdeleri ELLE
    // yazilmistir, saglayicinin mesajini TASIMAZ ve kullaniciya ne oldugunu +
    // ne yapacagini soyler.
    //
    // ⚠️ Bu SECICI bir genisletmedir, GENEL BIR ACMA DEGIL: isaretlenmeyen tek
    // 5xx yolu (eslenmemis domain kodu -> 500) MASKELI KALIR ve kalmalidir.
    // Bir test onu kilitler — o test olmasaydi, maskenin tumuyle kalktigi bir
    // regresyonda diger testler de yesil yanardi.
    if (exception instanceof EmbeddingFailedError) {
      throw new DisclosableHttpException(EMBEDDING_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
    }

    if (exception instanceof CompletionFailedError) {
      throw new DisclosableHttpException(COMPLETION_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
    }

    if (exception instanceof RateLimitExceededError) {
      // ⚠️ 429 ISARET TASIMAZ: maske yalnizca 5xx'e uygulanir, 4xx govdeleri
      // zaten oldugu gibi gecer. Isaret koymak hicbir seyi degistirmeyip
      // "burada bir sey acildi" izlenimi verirdi.
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
