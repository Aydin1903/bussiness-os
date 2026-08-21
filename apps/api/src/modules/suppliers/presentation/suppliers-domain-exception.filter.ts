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
import { SuppliersDomainError } from '../domain/suppliers.error';

/**
 * Tedarikci domain hatalarini HTTP'ye cevirir (ADR-0040 §7).
 *
 * `InventoryDomainExceptionFilter` / `AppointmentsDomainExceptionFilter` ile
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
 * Bu, CLAUDE.md'nin KALICI KURALIDIR ("DisclosableProblem — AI hata tipleri her
 * modulde bastan") ve Product Owner'in standardidir (ADR-0035 §8'den beri;
 * ADR-0037 §9, ADR-0039 §10.1 ve simdi ADR-0040 §7).
 *
 * Gerekce ASIMETRIK BEDELDIR:
 *
 *   SIMDI YAZ  -> bir satirlik OLU KOD. Gorunur, ucuz, zararsiz.
 *   SONRA EKLE -> ⚠️ unutulursa o yol ilk kez calistigi gun HAM 500 doner:
 *                 `ProblemDetailsFilter` govdeyi maskeler, kullanici
 *                 "beklenmeyen hata" gorur ve TEKRAR DENEMESI GEREKTIGINI
 *                 OGRENEMEZ. Hata SESSIZDIR.
 *
 * Bu kural bir varsayimdan degil, YASANMIS BIR KUSURDAN dogdu: ADR-0035'in
 * kapanis denetimi `DisclosableProblem` isaretinin BES MODULDE BIRDEN eksik
 * oldugunu buldu ve duzeltme tek bir iste bes module birden dokunmak zorunda
 * kaldi.
 *
 * ============================================================================
 * ⚠️ `CompletionFailedError` BU MODULDE BUGUN URETILEMEZ — VE YINE DE YAZILI
 * ============================================================================
 * Tedarikci `LLMPort` KULLANMAZ: modul ici AI yuzeyi v1'de yoktur ve
 * `suppliers.module.ts` `LLM_PORT` SAGLAMAZ. Bu satir bugun OLU KODDUR.
 *
 * Yine de yaziliyor — ve bir "tedarikci ozeti" (ADR-0032'nin musteri ozeti
 * karsiligi) eklendigi gun yapilacak is SIFIRDIR: filtre zaten hazir.
 *
 * ============================================================================
 * ⚠️ `StorageFailedError` YOKTUR — VE BU CELISKI DEGIL (ADR-0039 §10.2)
 * ============================================================================
 * Kural tek cumleyle: **AI hata tipleri her modulde bastan yazilir; ALAN BAZLI
 * hata tipleri (depolama gibi) yalnizca o alani KULLANAN modulde yazilir.**
 *
 * Bu modul `StoragePort`u bugun kullanmiyor VE KULLANMAYACAK: tedarikciyle
 * ilgili bir sozlesmenin yeri BELGE moduludur (ADR-0040 §9 — orasi zaten
 * `contactId`/`projectId` bagliyor). "Er ya da gec AI'a dokunur" varsayimi
 * depolama icin GECERLI DEGILDIR, yani satir olu kod degil YANILTICI olurdu:
 * okuyan biri bu modulun bir depolama yuzeyi oldugunu sanirdi.
 *
 * ============================================================================
 * ⚠️ BIR "KULLANIMDA" HATASI DA YOKTUR — ve sebebi FK YONUDUR
 * ============================================================================
 * ADR-0039'un `StockItemHasMovementsError`i orada GEREKLIYDI cunku
 * `movements.item_id` `ON DELETE RESTRICT` tasiyordu. Burada tedarikciye isaret
 * eden her sey `ON DELETE CASCADE` tasir (§1.3) ve BASKA HICBIR MODUL bir
 * tedarikciye isaret etmiyor (§4). Boyle bir hata yazmak, VAR OLMAYAN bir
 * iliskiyi IMA EDERDI.
 *
 * ⚠️ 8. modul (Teklif/Fatura) bir satin alma faturasini tedarikciye bagladigi
 * gun bu paragraf duser ve `CategoryInUseError` deseni burada da uygulanir.
 */
const STATUS_BY_CODE: Readonly<Record<string, HttpStatus>> = {
  SUPPLIER_NAME_BLANK: HttpStatus.UNPROCESSABLE_ENTITY,
  SUPPLIER_CONTACT_NAME_BLANK: HttpStatus.UNPROCESSABLE_ENTITY,
  SUPPLIER_INTERACTION_BODY_BLANK: HttpStatus.UNPROCESSABLE_ENTITY,
  SUPPLIER_INTERACTION_OCCURRED_ON_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  SUPPLIERS_TIMESTAMP_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,

  // ⚠️ SESSIZ KIRPMA YASAK (§2.2): sinir asilirsa istek REDDEDILIR.
  SUPPLIER_INTERACTION_BODY_TOO_LONG: HttpStatus.UNPROCESSABLE_ENTITY,
  SUPPLIER_PAYMENT_TERMS_TOO_LONG: HttpStatus.UNPROCESSABLE_ENTITY,
  SUPPLIER_EMBEDDING_DIMENSIONS_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,

  // "Yok" ile "baska tenant'in" AYIRT EDILMEZ — ikisi de 404 (P2).
  SUPPLIER_NOT_FOUND: HttpStatus.NOT_FOUND,
  // ⚠️ Ucuncu bir anlam daha tasir: "BASKA BIR TEDARIKCININ kisisi". Ayirt
  // edilseydi, baska bir tedarikcide o id'nin VAR OLDUGU sizardi.
  SUPPLIER_CONTACT_NOT_FOUND: HttpStatus.NOT_FOUND,
  SUPPLIER_INTERACTION_NOT_FOUND: HttpStatus.NOT_FOUND,

  // ⚠️ 409, 422 DEGIL: istek BICIMSEL olarak gecerlidir, KAYNAGIN DURUMU
  // elverissizdir (`CategoryInUseError` / `DuplicateSkuError` ile ayni sinif).
  SUPPLIER_TAX_NUMBER_DUPLICATE: HttpStatus.CONFLICT,
};

/**
 * Gorusme KAYDEDILDI ama indekslenemedi (ADR-0029 §4'un bilinen siniri).
 *
 * ⚠️ Genel bir hata donmek kullaniciyi gorusmeyi YENIDEN GIRMEYE ve MUKERRER
 * kayda iterdi — ve bu modulde mukerrer kayit, EKLEME-YALNIZ bir gunlukte
 * SILINEMEYEN iki satir demektir (`update`/`delete` ucu YOK). Mesaj acikca
 * durumu soyler ve onarim yolunu gosterir.
 *
 * ⚠️ Bu metin `DisclosableHttpException` OLMASAYDI istemciye ULASMAZDI:
 * `ProblemDetailsFilter` her 5xx govdesini maskeler ve kullanici "Beklenmeyen
 * bir hata olustu." gorurdu — yani mesajin VAR OLMA SEBEBI calismazdi.
 */
const EMBEDDING_FAILED_DETAIL =
  'Gorusme kaydedildi ancak arama icin indekslenemedi; /suppliers/reindex ile onarilabilir.';

/** Completion bu modulde bugun URETILEMEZ; mesaj yine de anlamli olmali. */
const COMPLETION_FAILED_DETAIL = 'AI saglayicisina ulasilamadi; lutfen tekrar deneyin.';

@Catch(SuppliersDomainError, EmbeddingFailedError, RateLimitExceededError, CompletionFailedError)
export class SuppliersDomainExceptionFilter implements ExceptionFilter {
  catch(
    exception:
      SuppliersDomainError | EmbeddingFailedError | RateLimitExceededError | CompletionFailedError,
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
