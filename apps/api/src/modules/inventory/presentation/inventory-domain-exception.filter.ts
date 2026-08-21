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
import { InventoryDomainError } from '../domain/inventory.error';

/**
 * Stok domain hatalarini HTTP'ye cevirir.
 *
 * `AppointmentsDomainExceptionFilter` / `DocumentsDomainExceptionFilter` ile
 * ayni disiplin: karar tek yerde, controller'da dagitik `try/catch` YOK.
 *
 * ============================================================================
 * ⚠️ `@Catch(...)` LISTESI BES TIP TASIR — VE UCU BU MODULUN DEGIL
 * ============================================================================
 *     EmbeddingFailedError      -> 502  (`shared/embedding.port`)
 *     CompletionFailedError     -> 502  (`shared/llm.port`)
 *     RateLimitExceededError    -> 429 + `Retry-After` (`shared/rate-limit.policy`)
 *
 * ⚠️ `@Catch(...)`E AYRICA YAZILMASALARDI FILTRE ONLARI GORMEZDI ve kullanici
 * 429/502 yerine ISLENMEMIS 500 alirdi.
 *
 * ============================================================================
 * ⚠️ `CompletionFailedError` BU MODULDE BUGUN URETILEMEZ — VE YINE DE YAZILI
 * ============================================================================
 * Stok `LLMPort` KULLANMAZ: modul ici AI yuzeyi v1'de yoktur ve
 * `inventory.module.ts` `LLM_PORT` SAGLAMAZ. Yani bu satir BUGUN OLU KODDUR.
 *
 * Yine de yazilir cunku bu, PRODUCT OWNER'IN KALICI STANDARDIDIR (CLAUDE.md
 * "Kalici ders: DisclosableProblem — AI hata tipleri her modulde bastan";
 * ADR-0035 §8, ADR-0037 §9, ADR-0039 §10.1). Gerekce ASIMETRIK BEDELDIR:
 *
 *   simdi yaz  -> bir satirlik OLU KOD. Gorunur, ucuz, zararsiz.
 *   sonra ekle -> unutulursa ilk `complete` cagrisinda HAM 500: govde
 *                 maskelenir, kullanici "beklenmeyen hata" gorur ve TEKRAR
 *                 DENEMESI gerektigini ogrenemez. Hata SESSIZDIR.
 *
 * Bu kural bir varsayimdan degil YASANMIS BIR KUSURDAN dogdu: ADR-0035'in
 * kapanis denetimi isaretin BES MODULDE BIRDEN eksik oldugunu buldu ve duzeltme
 * tek isde bes module dokunmak zorunda kaldi. Karar MODUL MODUL YENIDEN
 * TARTISILMAZ.
 *
 * ============================================================================
 * ⚠️ `StorageFailedError` LISTEDE YOK — ve bu yukaridakiyle CELISMEZ
 * ============================================================================
 * Kural AI HATA TIPLERI icindir ve gerekcesi "her modul er ya da gec AI'a
 * dokunur"dur (bu proje AI merkezlidir — CLAUDE.md). Depolama FARKLI BIR
 * KATEGORIDIR: bu modul `StoragePort`u bugun kullanmiyor ve KULLANMAYACAK —
 * envanterin sakladigi hicbir sey dosya degil.
 *
 * Yani `StorageFailedError` burada olu kod DEGIL, YANILTICI olurdu: okuyan biri
 * modulun bir depolama yuzeyi oldugunu sanardi.
 *
 * Kural tek cumleyle: **AI hata tipleri her modulde bastan yazilir; alan bazli
 * hata tipleri yalnizca o alani kullanan modulde yazilir.**
 * ============================================================================
 */
const STATUS_BY_CODE: Readonly<Record<string, HttpStatus>> = {
  INVENTORY_QUANTITY_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  INVENTORY_MOVEMENT_DIRECTION_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  INVENTORY_OCCURRED_AT_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  INVENTORY_TIMESTAMP_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  // ⚠️ SESSIZ KIRPMA YASAK (ADR-0039 §5): sinir asilirsa istek REDDEDILIR.
  STOCK_ITEM_NOTE_TOO_LONG: HttpStatus.UNPROCESSABLE_ENTITY,
  // ⚠️ Kapanis denetiminde (2026-08-19) eklendi: bu kod ESLENMEDEN once negatif
  // esik HAM 500 donuyordu — veritabani kisiti calisiyor ama mesaj kullaniciya
  // ulasmiyordu.
  STOCK_ITEM_MIN_QUANTITY_NEGATIVE: HttpStatus.UNPROCESSABLE_ENTITY,
  STOCK_ITEM_EMBEDDING_DIMENSIONS_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,

  // "Yok" ile "baska tenant'in" AYIRT EDILMEZ — ikisi de 404 (P2).
  STOCK_ITEM_NOT_FOUND: HttpStatus.NOT_FOUND,

  // ⚠️ 409: istek BICIMSEL olarak gecerli, KAYNAGIN DURUMU elverissiz.
  // `STOCK_ITEM_HAS_MOVEMENTS` §3.3'un tasiyicisidir — defter degistirilemez,
  // dolayisiyla toptan silinemez de.
  STOCK_ITEM_HAS_MOVEMENTS: HttpStatus.CONFLICT,
  STOCK_ITEM_SKU_DUPLICATE: HttpStatus.CONFLICT,
  STOCK_ITEM_ARCHIVED: HttpStatus.CONFLICT,
};

/**
 * Kalem KAYDEDILDI ama notu indekslenemedi (ADR-0029 §4'un bilinen siniri).
 *
 * ⚠️ Genel bir hata donmek kullaniciyi kalemi YENIDEN ACMAYA ve MUKERRER kayda
 * iterdi — ve bu modulde mukerrer kayit, AYNI MALZEMENIN IKI SATIRDA yasamasi
 * yani STOGUN IKIYE BOLUNMESI demektir (§1.1'in SKU tekilligiyle onlemeye
 * calistigi seyin ta kendisi, bu kez SKU'suz kalemlerde).
 */
const EMBEDDING_FAILED_DETAIL =
  'Kalem kaydedildi ancak notu arama icin indekslenemedi; /inventory/reindex ile onarilabilir.';

/** Completion bu modulde bugun URETILEMEZ; mesaj yine de anlamli olmali. */
const COMPLETION_FAILED_DETAIL = 'AI saglayicisina ulasilamadi; lutfen tekrar deneyin.';

@Catch(InventoryDomainError, EmbeddingFailedError, RateLimitExceededError, CompletionFailedError)
export class InventoryDomainExceptionFilter implements ExceptionFilter {
  catch(
    exception:
      InventoryDomainError | EmbeddingFailedError | RateLimitExceededError | CompletionFailedError,
    host: ArgumentsHost,
  ): void {
    // ⚠️ ASAGIDAKI IKI 502 `DisclosableHttpException`DIR, duz `HttpException`
    // DEGIL: govdeleri ELLE YAZILMISTIR, saglayicinin mesajini TASIMAZ ve
    // kullaniciya ne oldugunu + ne yapacagini soyler. Isaretsiz birakilirlarsa
    // global filtre ikisini de "Beklenmeyen bir hata olustu."ya cevirir.
    if (exception instanceof EmbeddingFailedError) {
      throw new DisclosableHttpException(EMBEDDING_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
    }

    if (exception instanceof CompletionFailedError) {
      throw new DisclosableHttpException(COMPLETION_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
    }

    if (exception instanceof RateLimitExceededError) {
      // ⚠️ 429 ISARET TASIMAZ ve buna gerek YOKTUR: maske yalnizca 5xx'e
      // uygulanir, 4xx govdeleri zaten oldugu gibi gecer.
      host
        .switchToHttp()
        .getResponse<Response>()
        .setHeader('Retry-After', String(exception.retryAfterSeconds));
      throw new HttpException(exception.message, HttpStatus.TOO_MANY_REQUESTS);
    }

    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // ⚠️ Beklenmeyen bir domain hatasinin MESAJI disari sizmaz ve ISARETSIZ
      // BIRAKILMASI BILINCLIDIR: global filtre bunu maskelemeye devam eder. Bu,
      // yukaridaki iki 502'nin SECICI bir genisletme oldugunun — genel bir acma
      // OLMADIGININ — kanitidir ve bir test onu kilitler.
      throw new HttpException('Internal server error', status);
    }

    throw new HttpException(exception.message, status);
  }
}
