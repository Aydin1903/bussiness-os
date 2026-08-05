import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { type Response } from 'express';

import { EmbeddingFailedError } from '../../../shared/embedding.port';
import { CompletionFailedError } from '../../../shared/llm.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import { KnowledgeDomainError } from '../domain/knowledge.error';

/**
 * Knowledge domain hatalarini HTTP durum kodlarina cevirir.
 *
 * ARCHITECTURE 4: domain katmani HTTP bilmez. Ceviri TEK BIR YERDE yapilir;
 * her controller'da `try/catch` yazmak, bir gun birinin unutmasi demektir.
 * Ceviri sonrasi `HttpException` yukari birakilir; RFC 7807 bicimlendirmesini
 * global `ProblemDetailsFilter` yapar (Tenant/Identity filtreleriyle ayni desen).
 */

/** Domain hata kodu -> HTTP durumu. Burada olmayan her kod 500'dur. */
const STATUS_BY_CODE: Readonly<Record<string, HttpStatus>> = {
  // Girdi dogrulama — istemciye yardimci olmali.
  NOTE_BODY_EMPTY: HttpStatus.UNPROCESSABLE_ENTITY,
  NOTE_TITLE_BLANK: HttpStatus.UNPROCESSABLE_ENTITY,
  NOTE_ID_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  NOTE_CHUNK_ID_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,

  // Kimlik KANITLANMIS ama konusma bu kullaniciya ait degil -> 403.
  // 404 DEGIL: "yok" ile "senin degil" ayirt edilirse, bir kullanici id
  // deneyerek baskasinin konusmasinin VARLIGINI ogrenebilirdi (P2).
  CONVERSATION_ACCESS_DENIED: HttpStatus.FORBIDDEN,

  // Kimlik dogru, yetki var, istek gecerli — YALNIZCA saatlik pay tukendi.
  // 403 DEGIL: 403 "senin bunu yapma hakkin yok" der, oysa hakki var, payi
  // yok. Ayrimi silmek istemciyi yanlis yone gonderirdi (kullanici yetki
  // isteyecekti, oysa beklemesi gerekiyor).
  RATE_LIMIT_EXCEEDED: HttpStatus.TOO_MANY_REQUESTS,

  // Bunlar CAGIRAN hatasi degil, SISTEM hatasidir: bozuk bir zaman damgasi,
  // negatif chunk sirasi veya yanlis boyutlu embedding istemcinin uretemeyecegi
  // degerlerdir. Eslenmezler -> 500 (asagidaki varsayilan) ve traceId ile
  // loglanirlar.
};

/**
 * Embedding hatasi neden 502.
 *
 * ADR-0029 §4: embedding SENKRONDUR ve hata yuzeye cikar. Bu bir ISTEMCI hatasi
 * DEGILDIR — istek gecerliydi, DIS SAGLAYICI cevap veremedi. `502 Bad Gateway`
 * bunu dogru anlatir ve istemciye "tekrar denenebilir" sinyali verir.
 *
 * ⚠️ NOT SILINMEZ: T1 zaten commit olmustur (bkz. `CreateNoteUseCase`). Sonuc,
 * chunk'i olmayan bir nottur — bilinen sinir (ADR-0029). Istemciye bunu
 * soylemek yerine genel bir hata dondurmek, kullanicinin notu yeniden
 * yazmasina ve MUKERRER kayda yol acardi; bu yuzden mesaj acikca "not
 * kaydedildi, indeksleme basarisiz" der.
 */
const EMBEDDING_FAILED_DETAIL =
  'Not kaydedildi ancak arama icin indekslenemedi; daha sonra tekrar deneyin.';

/**
 * `/ask` akisinda yan etki YOKTUR: konusma ve mesajlar yalnizca completion
 * BASARILI olduktan sonra yazilir. Dolayisiyla "kaydedildi ama..." demeye gerek
 * yok — istek tumuyle sonucsuz kaldi ve tekrar denenebilir.
 */
const COMPLETION_FAILED_DETAIL = 'Cevap uretilemedi; lutfen tekrar deneyin.';

/**
 * `RateLimitExceededError` LISTEYE ACIKCA EKLENDI (ADR-0031 Slice 2).
 *
 * Onceden `KnowledgeDomainError`'dan turedigi icin ilk girdi uzerinden
 * yakalaniyordu. Oran siniri mekanizmasi platforma tasinince hata da
 * `shared/rate-limit.policy.ts`'e gecti ve o hiyerarsiden CIKTI — yani
 * listeye yazilmasaydi filtre onu GORMEZ, 429 yerine islenmemis bir 500
 * doner ve `Retry-After` basligi hic uretilmezdi.
 */
@Catch(KnowledgeDomainError, EmbeddingFailedError, CompletionFailedError, RateLimitExceededError)
export class KnowledgeDomainExceptionFilter implements ExceptionFilter {
  // Filtre yaniti KENDISI yazmaz, cevrilmis hatayi global filtreye birakir.
  // TEK istisna `Retry-After` basligidir (asagida): govde degil BASLIK oldugu
  // icin RFC 7807 bicimlendirmesine dokunmaz.
  catch(
    exception:
      KnowledgeDomainError | EmbeddingFailedError | CompletionFailedError | RateLimitExceededError,
    host: ArgumentsHost,
  ): never {
    if (exception instanceof CompletionFailedError) {
      // ISTEMCI hatasi DEGIL: istek gecerliydi, DIS SAGLAYICI cevap veremedi.
      // `/ask` bir yan etki BIRAKMAZ (mesajlar yalnizca basaridan sonra
      // yazilir), bu yuzden mesaj `/notes`'unkinden farkli ve daha basittir.
      throw new HttpException(COMPLETION_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
    }

    if (exception instanceof EmbeddingFailedError) {
      // Saglayicinin mesaji ISTEMCIYE VERILMEZ (ic detay tasiyabilir); global
      // filtre traceId ile loglar.
      throw new HttpException(EMBEDDING_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
    }

    if (exception instanceof RateLimitExceededError) {
      // `Retry-After` 429'un standart tamamlayicisidir: istemciye NE ZAMAN
      // donecegini soyler. Olmadan, iyi niyetli bir istemci bile siki bir
      // dongude yeniden dener ve sinirlayiciyi gurultuye bogar.
      //
      // Saniye cinsinden gonderilir (RFC 9110 §10.2.3 iki bicime de izin
      // verir; saniye, saat farki/format hatasi riski tasimayan olandir).
      setRetryAfter(host, exception.retryAfterSeconds);
    }

    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Eslenmemis bir domain hatasi EKSIK ESLEME demektir. Mesaji istemciye
      // vermeyiz; global filtre traceId ile loglar.
      throw new HttpException('Internal server error', status);
    }

    throw new HttpException(exception.message, status);
  }
}

/**
 * `Retry-After` basligini yazar.
 *
 * Yanit nesnesi HTTP DISI baglamlarda (orn. bir mikroservis transport'u)
 * bulunmayabilir; boyle bir durumda baslik sessizce atlanir. Baslik bir
 * KOLAYLIKTIR — yoklugu 429'u gecersiz kilmaz, ama ugruna istek dusurulmez.
 */
function setRetryAfter(host: ArgumentsHost, seconds: number): void {
  if (host.getType() !== 'http') {
    return;
  }

  const response: Response = host.switchToHttp().getResponse();
  response.setHeader('Retry-After', String(seconds));
}
