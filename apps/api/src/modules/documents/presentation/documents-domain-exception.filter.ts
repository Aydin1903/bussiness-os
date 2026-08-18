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
import { StorageFailedError } from '../../../shared/storage.port';
import { DocumentsDomainError } from '../domain/documents.error';

/**
 * Belge domain hatalarini HTTP'ye cevirir (ADR-0037 §9).
 *
 * ============================================================================
 * DORT HATA TIPI, HEPSI ILK GUNDEN
 * ============================================================================
 * `@Catch(...)` listesi BES tip tasiyor. Dordu `DocumentsDomainError`DAN
 * TUREMEZ ve `shared/`in paylasilan tipleridir:
 *
 *     EmbeddingFailedError   -> 502  (`shared/embedding.port`)
 *     StorageFailedError     -> 502  (`shared/storage.port`)     ← BU MODULLE GELDI
 *     RateLimitExceededError -> 429 + `Retry-After`
 *     CompletionFailedError  -> 502  (`shared/llm.port`)
 *
 * ⚠️ `@Catch(...)`E AYRICA YAZILMASALARDI FILTRE ONLARI GORMEZDI ve kullanici
 * 429/502 yerine ISLENMEMIS 500 alirdi. Hata SESSIZDIR: sunucu "bir sey ters
 * gitti" der, neyin ters gittigini soylemez.
 *
 * ADR-0035 §8'in genellenmis kurali dogrudan uygulandi: **bir modul yeni bir
 * port kullanmaya basladiginda, o portun hata tipi filtreye eklenmelidir.** Bu
 * modul IKI yeni port kullaniyor (`StoragePort`, `TextExtractorPort`) —
 * birincisinin hata tipi burada; ikincisinin YOK ve olmamali (asagida).
 *
 * ============================================================================
 * ⚠️ `CompletionFailedError` BUGUN TETIKLENEMEZ — VE YINE DE YAZILI
 * ============================================================================
 * Bu modul `LLMPort` KULLANMAZ (§8: tek katkici, modul ici AI yuzeyi yok) ve
 * `documents.module.ts` `LLM_PORT` SAGLAMAZ. Satir bugun OLU KODDUR.
 *
 * Yazilmasinin sebebi ADR-0035 §8'in ASIMETRIK BEDEL argumanidir ve ADR-0037
 * §9 onu aynen devraldi: _"bedeller simetrik degil — bir satirlik olu kod ile
 * islenmemis bir 500. Simetrik olmayan bir riskte ucuz tarafta durulur."_
 *
 * Belirleyici ayrinti: "belgeyi ozetle" bir YASAK degil, §12'nin **v2
 * listesinde** duran bir kalemdir. Yani `LLMPort` baglantisi ONGORULMUS bir
 * gelecektir — ve CRM'de ayni satir Katman 2'de bir kez YANLISLANDI.
 *
 * ============================================================================
 * ⚠️ `TextExtractorPort`UN AYRI BIR HATA TIPI YOK — VE BU BILINCLI
 * ============================================================================
 * Ayristirici cokerse (bozuk ya da sifreli dosya) adapter'in firlattigi hata
 * BURAYA ESLENMEZ ve ISLENMEMIS 500 olur. Bu, yukaridaki kurala aykiri
 * gorunur; degildir:
 *
 *   - `StoragePort` ve `EmbeddingPort` `shared/`dadir ve hatalari PLATFORM
 *     sozlesmesinin parcasidir,
 *   - `TextExtractorPort` MODULUN KENDI portudur (ADR-0037 §6.2) ve
 *     cokmesi bir DIS SERVIS arizasi degil, DOSYANIN kendisiyle ilgili bir
 *     durumdur.
 *
 * ⚠️ Bu bir BILINEN SINIRDIR ve kayitlidir: bozuk bir PDF bugun 500 doner.
 * Dogru cevap 422'dir ("bu dosya okunamiyor") ve bunun icin bir
 * `DocumentExtractionFailedError` gerekir — ama o, cikarim hatalarini
 * "gecici saglayici arizasi" ile "kalici dosya sorunu" olarak AYIRT ETMEYI
 * gerektirir ve bugun elde o ayrimi yapacak veri YOKTUR. Tahmine dayali bir
 * siniflandirma, yanlis tarafta SESSIZ olurdu.
 */
const STATUS_BY_CODE: Readonly<Record<string, HttpStatus>> = {
  // "Yok" ile "baska tenant'in" AYIRT EDILMEZ — ikisi de 404 (P2).
  DOCUMENT_NOT_FOUND: HttpStatus.NOT_FOUND,

  // Cross-modul yumusak referanslar (ADR-0037 §4): "yok", "baska tenant'in" ve
  // "izin yok" AYIRT EDILMEZ — ucu de 404.
  DOCUMENT_CONTACT_NOT_FOUND: HttpStatus.NOT_FOUND,
  DOCUMENT_PROJECT_NOT_FOUND: HttpStatus.NOT_FOUND,

  // ⚠️ 415, 422 DEGIL: govde SEKIL olarak dogru, MEDYA TURU desteklenmiyor.
  // Istemciye "govdeni duzelt" degil "baska bir dosya sec" der.
  DOCUMENT_TYPE_UNSUPPORTED: HttpStatus.UNSUPPORTED_MEDIA_TYPE,

  // ⚠️ 413 — HTTP'nin bu durum icin ayri bir kodu var ve 422'den daha bilgilidir.
  DOCUMENT_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,

  // ⚠️ SESSIZ KIRPMA YASAK (ADR-0037 §6.1): sinir asilirsa istek REDDEDILIR ve
  // dosya R2'ye HIC yazilmaz.
  DOCUMENT_TOO_MANY_CHUNKS: HttpStatus.UNPROCESSABLE_ENTITY,

  DOCUMENT_EMBEDDING_DIMENSIONS_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  DOCUMENTS_TIMESTAMP_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
};

/**
 * Belge KAYDEDILDI ama icerigi indekslenemedi (ADR-0029 §4'un bilinen siniri).
 *
 * ⚠️ Genel bir hata donmek kullaniciyi dosyayi YENIDEN YUKLEMEYE ve MUKERRER
 * kayda iterdi — ve burada mukerrer kayit yalnizca kirli bir liste degil,
 * IKINCI BIR R2 NESNESI (yani ikinci bir fatura kalemi) demektir.
 *
 * ⚠️ ADR-0037 §5.3'un sirasi geregi bu noktada DOSYA ZATEN KAYDEDILMISTIR;
 * kullanicinin yapmasi gereken sey yeniden yuklemek DEGIL onarmaktir. Mesajin
 * ulasmasi bu yuzden bir regresyon degil bir GEREKSINIMDIR.
 */
const EMBEDDING_FAILED_DETAIL =
  'Belge yuklendi ancak icerigi arama icin indekslenemedi; /documents/reindex ile onarilabilir.';

/**
 * Nesne deposuna ulasilamadi.
 *
 * ⚠️ Mesaj DOSYANIN KAYDEDILMEDIGINI acikca soyler. `EmbeddingFailedError`in
 * tam TERSI durum ve karistirilmasi kullaniciyi yanlis eyleme iter: orada
 * "tekrar yukleme, onar" denir, burada "tekrar dene".
 *
 * ⚠️ Ayni mesaj, INDIRME yolunda nesnenin bulunamadigi durumu da kapsar (port
 * tek hata tipi kullanir, §9). Ikisi de sunucu tarafi bir tutarsizliktir ve
 * kullanicinin yapabilecegi sey aynidir.
 */
const STORAGE_FAILED_DETAIL =
  'Belge deposuna ulasilamadi; dosya kaydedilmedi. Lutfen tekrar deneyin.';

/** Completion bu modulde bugun URETILEMEZ; mesaj yine de anlamli olmali. */
const COMPLETION_FAILED_DETAIL = 'AI saglayicisina ulasilamadi; lutfen tekrar deneyin.';

@Catch(
  DocumentsDomainError,
  EmbeddingFailedError,
  StorageFailedError,
  RateLimitExceededError,
  CompletionFailedError,
)
export class DocumentsDomainExceptionFilter implements ExceptionFilter {
  catch(
    exception:
      | DocumentsDomainError
      | EmbeddingFailedError
      | StorageFailedError
      | RateLimitExceededError
      | CompletionFailedError,
    host: ArgumentsHost,
  ): void {
    // ⚠️ ASAGIDAKI UC 502 `DisclosableHttpException`DIR, duz `HttpException`
    // DEGIL: govdeleri ELLE YAZILMISTIR, saglayicinin mesajini TASIMAZ ve
    // kullaniciya ne oldugunu + ne yapacagini soyler. Isaretsiz birakilirlarsa
    // global filtre ucunu de "Beklenmeyen bir hata olustu."ya cevirir.
    //
    // ⚠️ Bu SECICI bir genisletmedir, genel bir acma DEGIL: bu metotta
    // isaretlenmeyen tek 5xx yolu (eslenmemis domain kodu -> 500) MASKELI
    // KALIR ve kalmalidir.
    if (exception instanceof EmbeddingFailedError) {
      throw new DisclosableHttpException(EMBEDDING_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
    }

    if (exception instanceof StorageFailedError) {
      throw new DisclosableHttpException(STORAGE_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
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
      // Beklenmeyen bir domain hatasinin MESAJI disari sizmaz. ISARETSIZ
      // BIRAKILMASI BILINCLIDIR: global filtre bunu maskelemeye devam eder.
      throw new HttpException('Internal server error', status);
    }

    throw new HttpException(exception.message, status);
  }
}
