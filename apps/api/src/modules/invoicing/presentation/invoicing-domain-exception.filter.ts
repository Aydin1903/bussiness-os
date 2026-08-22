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
import { PdfRenderFailedError } from '../../../shared/pdf.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import { InvoicingDomainError } from '../domain/invoicing.error';

/**
 * Teklif / Fatura domain hatalarini HTTP'ye cevirir (ADR-0041 §10).
 *
 * `SuppliersDomainExceptionFilter` / `InventoryDomainExceptionFilter` ile ayni
 * disiplin: karar tek yerde, controller'da dagitik `try/catch` YOK.
 *
 * ============================================================================
 * ⚠️ UC AI HATA TIPININ UCU DE BUGUN TETIKLENEMEZ — VE UCU DE YAZILI
 * ============================================================================
 * Bu modul `EmbeddingPort` KULLANMAZ, `LLMPort` KULLANMAZ ve ORAN SINIRI
 * DEKLARE ETMEZ (§5 — Faz 5'te vektor tasimayan ILK is modulu). Yani asagidaki
 * uc satir BUGUN OLU KODDUR:
 *
 *     EmbeddingFailedError    -> 502
 *     CompletionFailedError   -> 502
 *     RateLimitExceededError  -> 429
 *
 * ⚠️ BU, KURALIN ILK KEZ BU KADAR TAM SINANMASIDIR. CLAUDE.md'nin kalici
 * kurali acik ve MODUL MODUL YENIDEN TARTISILMAZ:
 *
 *     "`EmbeddingFailedError`, `RateLimitExceededError` ve
 *      `CompletionFailedError` HER modulun filtresinin `@Catch(...)` listesine
 *      BASTAN eklenir — o modul bugun kullaniyor olsun ya da olmasin."
 *
 * Gerekce ASIMETRIK BEDELDIR:
 *
 *   SIMDI YAZ  -> uc satirlik OLU KOD. Gorunur, ucuz, zararsiz.
 *   SONRA EKLE -> ⚠️ unutulursa, modul bir AI yuzeyi kazandigi gun HAM 500
 *                 doner: `ProblemDetailsFilter` govdeyi maskeler, kullanici
 *                 "beklenmeyen hata" gorur ve TEKRAR DENEMESI GEREKTIGINI
 *                 OGRENEMEZ. Hata SESSIZDIR.
 *
 * ⚠️ Bu modul AI yuzeyi kazanmaya EN YAKIN adaylardan biridir: bir "teklif
 * metnini yaz" ya da "belgeyi ozetle" ozelligi, kurucu kisitin (_"moduller
 * hafizadir"_) dogal sonucudur. O gun yapilacak is SIFIRDIR.
 *
 * ============================================================================
 * ⚠️ `PdfRenderFailedError` ISARETLIDIR — VE BU MODULE OZGU TEK ALAN HATASIDIR
 * ============================================================================
 * Gerekce ADR-0037'nin `StorageFailedError`iyla ayni satirdandir: kullanici
 * DOGRU bir istek yapti, hata SUNUCUDADIR ve TEKRAR DENEMEK anlamlidir.
 * Maskelenirse ekranda "Beklenmeyen bir hata" yazar ve kullanici belgesinin
 * KAYDEDILDIGINI (ama basilamadigini) ogrenemez.
 *
 * ============================================================================
 * ⚠️ `StorageFailedError` YOKTUR — VE BU CELISKI DEGIL (ADR-0039 §10.2)
 * ============================================================================
 * Kural tek cumleyle: **AI hata tipleri her modulde bastan yazilir; ALAN BAZLI
 * hata tipleri (depolama gibi) yalnizca o alani KULLANAN modulde yazilir.**
 *
 * Bu modul `StoragePort`u KULLANMIYOR ve bu bir tercih degil bir KARARDIR
 * (§6.3): uretilen PDF SAKLANMAZ, her istekte yeniden uretilir. Satiri koymak
 * olu kod degil YANILTICI olurdu — okuyan biri bu modulun bir depolama yuzeyi
 * oldugunu sanirdi.
 */
const STATUS_BY_CODE: Readonly<Record<string, HttpStatus>> = {
  SALES_DOCUMENT_CUSTOMER_NAME_BLANK: HttpStatus.UNPROCESSABLE_ENTITY,
  SALES_DOCUMENT_LINE_DESCRIPTION_BLANK: HttpStatus.UNPROCESSABLE_ENTITY,
  SALES_DOCUMENT_LINE_QUANTITY_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  SALES_DOCUMENT_UNIT_PRICE_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  SALES_DOCUMENT_TAX_RATE_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  SALES_DOCUMENT_CURRENCY_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  SALES_DOCUMENT_DATE_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  SALES_DOCUMENT_DATE_BEFORE_ISSUE: HttpStatus.UNPROCESSABLE_ENTITY,
  INVOICING_TIMESTAMP_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,

  // ⚠️ SESSIZ KIRPMA YASAK: sinir asilirsa istek REDDEDILIR.
  SALES_DOCUMENT_NOTES_TOO_LONG: HttpStatus.UNPROCESSABLE_ENTITY,
  SALES_DOCUMENT_TOO_MANY_LINES: HttpStatus.UNPROCESSABLE_ENTITY,

  // "Yok", "baska tenant'in" ve "YANLIS TURDE" AYIRT EDILMEZ (P2). Ucuncusu bu
  // modulde gercek bir sizinti kapisidir: `invoice:read` TASIMAYAN biri
  // `/quotes/<fatura-id>` ile bir faturanin varligini yoklayabilirdi.
  SALES_DOCUMENT_NOT_FOUND: HttpStatus.NOT_FOUND,

  // ⚠️ 409, 422 DEGIL: istek BICIMSEL olarak gecerlidir, KAYNAGIN DURUMU
  // elverissizdir (`CategoryInUseError` / `DuplicateSkuError` ile ayni sinif).
  SALES_DOCUMENT_NOT_EDITABLE: HttpStatus.CONFLICT,
  SALES_DOCUMENT_INVALID_TRANSITION: HttpStatus.CONFLICT,
  QUOTE_NOT_ACCEPTED: HttpStatus.CONFLICT,
  SALES_DOCUMENT_EMPTY: HttpStatus.CONFLICT,
};

/**
 * ⚠️ Bu metin `DisclosableHttpException` OLMASAYDI istemciye ULASMAZDI:
 * `ProblemDetailsFilter` her 5xx govdesini maskeler ve kullanici "Beklenmeyen
 * bir hata olustu." gorurdu — yani mesajin VAR OLMA SEBEBI calismazdi.
 */
const PDF_FAILED_DETAIL =
  'Belge kaydedildi ancak PDF uretilemedi; lutfen tekrar deneyin. Verileriniz kaybolmadi.';

/** Bu modulde bugun URETILEMEZ; mesaj yine de anlamli olmali. */
const AI_FAILED_DETAIL = 'AI saglayicisina ulasilamadi; lutfen tekrar deneyin.';

@Catch(
  InvoicingDomainError,
  PdfRenderFailedError,
  EmbeddingFailedError,
  RateLimitExceededError,
  CompletionFailedError,
)
export class InvoicingDomainExceptionFilter implements ExceptionFilter {
  catch(
    exception:
      | InvoicingDomainError
      | PdfRenderFailedError
      | EmbeddingFailedError
      | RateLimitExceededError
      | CompletionFailedError,
    host: ArgumentsHost,
  ): void {
    // ⚠️ ASAGIDAKI 502'LER `DisclosableHttpException`DIR, duz `HttpException`
    // DEGIL: govdeleri ELLE YAZILMISTIR, saglayicinin/kutuphanenin mesajini
    // TASIMAZ ve kullaniciya ne oldugunu + ne yapacagini soyler.
    //
    // ⚠️ Bu SECICI bir genisletmedir, GENEL BIR ACMA DEGIL: bu metotta
    // isaretlenmeyen tek 5xx yolu (eslenmemis domain kodu -> 500) MASKELI
    // KALIR ve kalmalidir. Bir test onu kilitler — o test olmasaydi, maskenin
    // tumuyle kalktigi bir regresyonda diger testler de yesil yanardi.
    if (exception instanceof PdfRenderFailedError) {
      throw new DisclosableHttpException(PDF_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
    }

    if (exception instanceof EmbeddingFailedError || exception instanceof CompletionFailedError) {
      throw new DisclosableHttpException(AI_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
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
