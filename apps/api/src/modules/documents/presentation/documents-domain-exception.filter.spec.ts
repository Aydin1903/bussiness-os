import { HttpException, HttpStatus, Logger, type ArgumentsHost } from '@nestjs/common';
import type { ProblemDetails } from '@business-os/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProblemDetailsFilter } from '../../../infrastructure/http/problem-details.filter';
import { EmbeddingFailedError } from '../../../shared/embedding.port';
import { CompletionFailedError } from '../../../shared/llm.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import { StorageFailedError } from '../../../shared/storage.port';
import {
  DocumentContactNotFoundError,
  DocumentNotFoundError,
  DocumentProjectNotFoundError,
  DocumentsDomainError,
  DocumentTooLargeError,
  DocumentTooManyChunksError,
  UnsupportedDocumentTypeError,
} from '../domain/documents.error';
import { DocumentsDomainExceptionFilter } from './documents-domain-exception.filter';

/**
 * `DocumentsDomainExceptionFilter` (ADR-0037 §9).
 *
 * ============================================================================
 * ⚠️ BU MODULDE FILTRE DORT PAYLASILAN TIP TASIYOR — BIRI YENI
 * ============================================================================
 * `StorageFailedError` bu modulle birlikte `shared/`a girdi ve ADR-0035 §8'in
 * genellenmis kurali dogrudan uygulandi: **bir modul yeni bir port kullanmaya
 * basladiginda, o portun hata tipi filtreye eklenmelidir.**
 *
 * Asil risk HTTP'de degil, `@Catch(...)` KAYDINDADIR: dordu de
 * `DocumentsDomainError`DAN TUREMEZ ve listeye yazilmazlarsa filtre onlari
 * GORMEZ — kullanici 429/502 yerine ISLENMEMIS 500 alir.
 */

function hostWithResponse(): { host: ArgumentsHost; setHeader: ReturnType<typeof vi.fn> } {
  const setHeader = vi.fn();
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ setHeader }) }),
  } as unknown as ArgumentsHost;

  return { host, setHeader };
}

function statusOf(thrown: unknown): number {
  if (!(thrown instanceof HttpException)) {
    throw new TypeError('Filtre bir HttpException firlatmaliydi.');
  }
  return thrown.getStatus();
}

function run(exception: Parameters<DocumentsDomainExceptionFilter['catch']>[0]) {
  const filter = new DocumentsDomainExceptionFilter();
  const { host, setHeader } = hostWithResponse();

  try {
    filter.catch(exception, host);
  } catch (thrown) {
    return { status: statusOf(thrown), thrown, setHeader };
  }

  throw new TypeError('Filtre firlatmadi.');
}

describe('DocumentsDomainExceptionFilter — PAYLASILAN port hatalari (ADR-0037 §9)', () => {
  it('⚠️ `@Catch(...)` DORT paylasilan tipi de KAYDEDIYOR', () => {
    // ⚠️ BU TESTIN ISI BIR KAYDIN VARLIGINI KORUMAKTIR. Bir tip listeden
    // dusurulurse davranis testleri de kirmizi yanar, ama bu satir SEBEBI
    // dogrudan gosterir: sorun eslemede degil, filtrenin o tipi HIC GORMEMESI.
    const registered: unknown = Reflect.getMetadata(
      '__filterCatchExceptions__',
      DocumentsDomainExceptionFilter,
    );

    expect(registered).toEqual(
      expect.arrayContaining([
        EmbeddingFailedError,
        StorageFailedError,
        RateLimitExceededError,
        CompletionFailedError,
      ]),
    );
  });

  it('⚠️ StorageFailedError -> 502, ISLENMEMIS 500 DEGIL', () => {
    const { status } = run(new StorageFailedError('baglanti reddedildi'));

    expect(status).toBe(HttpStatus.BAD_GATEWAY);
  });

  it('⚠️ EmbeddingFailedError -> 502 ve mesaj ONARIM yolunu gosterir', () => {
    const { status, thrown } = run(new EmbeddingFailedError('saglayici cokti'));

    expect(status).toBe(HttpStatus.BAD_GATEWAY);
    const detail: unknown = (thrown as HttpException).getResponse();
    expect(detail).toMatch(/reindex/);
  });

  it('⚠️ RateLimitExceededError -> 429 ve `Retry-After` BASLIGI', () => {
    const { status, setHeader } = run(new RateLimitExceededError(10, 1800));

    expect(status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '1800');
  });

  it('⚠️ CompletionFailedError -> 502 — bugun TETIKLENEMEZ ama YAKALANIR', () => {
    // Bu modul `LLMPort` KULLANMAZ (§8: modul ici AI yuzeyi yok) ve
    // `documents.module.ts` `LLM_PORT` saglamaz. Satir OLU KODDUR.
    //
    // ADR-0037 §9: bedeller simetrik degil — bir satirlik olu kod ile
    // islenmemis bir 500. Belirleyici ayrinti "belgeyi ozetle"nin §12'nin v2
    // listesinde durmasi: baglanti ONGORULMUS bir gelecektir ve CRM'de ayni
    // satir Katman 2'de bir kez YANLISLANDI.
    //
    // ⚠️ Bu test, o satirin ileride "kullanilmiyor" diye SILINMESINI bir KARAR
    // haline getirir — sessiz bir temizlik degil.
    const { status } = run(new CompletionFailedError('saglayici cokti'));

    expect(status).toBe(HttpStatus.BAD_GATEWAY);
  });
});

interface Rendered {
  readonly status: number;
  readonly body: ProblemDetails;
}

/** Modul filtresinin firlattigini global filtreye verir ve govdeyi yakalar. */
function render(exception: Parameters<DocumentsDomainExceptionFilter['catch']>[0]): Rendered {
  let status = 0;
  let body: ProblemDetails | undefined;

  const response = {
    setHeader: () => undefined,
    status: (code: number) => {
      status = code;
      return response;
    },
    type: () => response,
    json: (payload: ProblemDetails) => {
      body = payload;
      return response;
    },
  };

  const host = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: '/api/v1/documents' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  let thrown: unknown;
  try {
    new DocumentsDomainExceptionFilter().catch(exception, host);
  } catch (error) {
    thrown = error;
  }

  if (!(thrown instanceof HttpException)) {
    throw new TypeError('Modul filtresi bir HttpException firlatmaliydi.');
  }

  new ProblemDetailsFilter().catch(thrown, host);

  if (body === undefined) {
    throw new Error('Global filtre bir cevap uretmedi.');
  }

  return { status, body };
}

/** Eslenmemis bir domain kodu: govdesi SIZMAMALI. */
class UnmappedDocumentsError extends DocumentsDomainError {
  readonly code = 'DOCUMENTS_UNMAPPED_FOR_TEST';

  constructor() {
    super('connect ECONNREFUSED postgres://app:SUPER_SECRET@db-prod-01:5432');
  }
}

describe('DocumentsDomainExceptionFilter — acilan 5xx govdeleri', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('⚠️ "yuklendi ancak indekslenemedi, reindex ile onarilabilir" ULASIR', () => {
    // ⚠️ Bu mesajin ulasmasi bir REGRESYON DEGIL BIR GEREKSINIMDIR: ADR-0037
    // §5.3'un sirasi geregi bu noktada DOSYA ZATEN KAYDEDILMISTIR. Genel bir
    // hata, kullaniciyi yeniden yuklemeye ve IKINCI BIR R2 NESNESINE iterdi.
    const result = render(new EmbeddingFailedError('saglayici cokti'));

    expect(result.status).toBe(HttpStatus.BAD_GATEWAY);
    expect(result.body.detail).toContain('Belge yuklendi');
    expect(result.body.detail).toContain('/documents/reindex');
  });

  it('⚠️ StorageFailedError govdesi "dosya KAYDEDILMEDI" der — TERS durum', () => {
    // Iki 502'nin karistirilmasi kullaniciyi YANLIS eyleme iter: embedding
    // hatasinda "tekrar yukleme, onar", depo hatasinda "tekrar dene".
    const result = render(new StorageFailedError('baglanti reddedildi'));

    expect(result.status).toBe(HttpStatus.BAD_GATEWAY);
    expect(result.body.detail).toContain('kaydedilmedi');
    expect(result.body.detail).not.toContain('reindex');
  });

  it('saglayicinin KENDI mesaji govdeye GECMEZ', () => {
    const result = render(new StorageFailedError('AWS_SECRET_ACCESS_KEY=SUPER_SECRET gecersiz'));

    expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
  });

  it('⚠️ eslenmemis domain hatasi HALA MASKELENIR — SECICI genisletme', () => {
    // Bu satir olmadan yukaridaki testler, maskenin tumuyle kalktigi bir
    // regresyonda da YESIL yanardi.
    const result = render(new UnmappedDocumentsError());

    expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.body.detail).toBe('Beklenmeyen bir hata olustu.');
    expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
  });
});

describe('DocumentsDomainExceptionFilter — domain hatalari', () => {
  it('⚠️ desteklenmeyen tur -> 415, 422 DEGIL', () => {
    // Govde SEKIL olarak dogru, MEDYA TURU desteklenmiyor. 415, istemciye
    // "govdeni duzelt" degil "baska bir dosya sec" der.
    expect(run(new UnsupportedDocumentTypeError()).status).toBe(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
  });

  it('⚠️ cok buyuk dosya -> 413, 422 DEGIL', () => {
    expect(run(new DocumentTooLargeError(30_000_000, 20_971_520)).status).toBe(
      HttpStatus.PAYLOAD_TOO_LARGE,
    );
  });

  it('⚠️ parca sinirini asan belge -> 422 (SESSIZ KIRPMA YOK)', () => {
    const { status, thrown } = run(new DocumentTooManyChunksError(412, 300));

    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    // Mesaj GERCEK ve IZIN VERILEN degeri birlikte soyler: yalnizca "cok uzun"
    // demek, kullaniciyi ne kadar bolecegini tahmin etmeye birakirdi.
    const detail: unknown = (thrown as HttpException).getResponse();
    expect(detail).toMatch(/412/);
    expect(detail).toMatch(/300/);
  });

  it('bulunamayan belge -> 404', () => {
    expect(run(new DocumentNotFoundError()).status).toBe(HttpStatus.NOT_FOUND);
  });

  it('gorulemeyen kisi ve proje -> 404, AMA AYRI TIPLER', () => {
    // Iki referans BAGIMSIZDIR; tek bir "bulunamadi" tipi, ikisini birden
    // gonderen bir istekte HANGI alanin sorunlu oldugunu soylemezdi.
    expect(run(new DocumentContactNotFoundError()).status).toBe(HttpStatus.NOT_FOUND);
    expect(run(new DocumentProjectNotFoundError()).status).toBe(HttpStatus.NOT_FOUND);

    const contact = run(new DocumentContactNotFoundError()).thrown as HttpException;
    const project = run(new DocumentProjectNotFoundError()).thrown as HttpException;
    expect(contact.getResponse()).not.toBe(project.getResponse());
  });
});
