import type { ProblemDetails } from '@business-os/contracts';
import { HttpException, HttpStatus, Logger, type ArgumentsHost } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProblemDetailsFilter } from '../../../infrastructure/http/problem-details.filter';
import { EmbeddingFailedError } from '../../../shared/embedding.port';
import { CompletionFailedError } from '../../../shared/llm.port';
import { PdfRenderFailedError } from '../../../shared/pdf.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import { StorageFailedError } from '../../../shared/storage.port';
import {
  DocumentNotEditableError,
  EmptyDocumentError,
  InvalidDocumentDateError,
  InvalidStatusTransitionError,
  InvalidUnitPriceError,
  InvoicingDomainError,
  QuoteNotAcceptedError,
  SalesDocumentNotFoundError,
  TooManyLinesError,
} from '../domain/invoicing.error';
import { InvoicingDomainExceptionFilter } from './invoicing-domain-exception.filter';

/**
 * `InvoicingDomainExceptionFilter` (ADR-0041 §10).
 *
 * ============================================================================
 * ⚠️ BU DOSYA BU MODULDE HER ZAMANKINDEN ONEMLI
 * ============================================================================
 * Uc AI hata tipinin UCU DE bu modulde BUGUN URETILEMEZ: `EmbeddingPort` yok,
 * `LLMPort` yok, oran siniri yok (§5). Yani davranislarini GOSTEREBILECEK TEK
 * SEY bu dosyadir — bir entegrasyon testi onlari asla tetikleyemez.
 *
 * CLAUDE.md'nin kalici kurali ("AI hata tipleri her modulde bastan") ILK KEZ
 * bu kadar tam sinaniyor.
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

function run(exception: Parameters<InvoicingDomainExceptionFilter['catch']>[0]) {
  const filter = new InvoicingDomainExceptionFilter();
  const { host, setHeader } = hostWithResponse();

  try {
    filter.catch(exception, host);
  } catch (thrown) {
    return { status: statusOf(thrown), thrown, setHeader };
  }

  throw new TypeError('Filtre firlatmadi.');
}

describe('InvoicingDomainExceptionFilter — `@Catch(...)` KAYDI (ADR-0041 §10)', () => {
  it('⚠️ UC AI TIPINI DE KAYDEDIYOR — ucu de BUGUN TETIKLENEMEZ oldugu halde', () => {
    // ⚠️ BU TESTIN ISI BIR KAYDIN VARLIGINI KORUMAKTIR. Bedeller simetrik
    // degil: uc satirlik olu kod ile, modul bir AI yuzeyi kazandigi gun donecek
    // ISLENMEMIS BIR 500 — ve ikincisinde kullanici tekrar denemesi gerektigini
    // OGRENEMEZ.
    const registered: unknown = Reflect.getMetadata(
      '__filterCatchExceptions__',
      InvoicingDomainExceptionFilter,
    );

    expect(registered).toEqual(
      expect.arrayContaining([
        InvoicingDomainError,
        PdfRenderFailedError,
        EmbeddingFailedError,
        RateLimitExceededError,
        CompletionFailedError,
      ]),
    );
  });

  it('⚠️ `StorageFailedError` KAYITLI DEGIL — ve bu bir HAYIRDIR (§6.3)', () => {
    // Kural AI hata tipleri icindir. Bu modul `StoragePort`u KULLANMIYOR ve bu
    // bir tercih degil bir KARAR: uretilen PDF SAKLANMAZ. Satiri koymak olu kod
    // degil YANILTICI olurdu — okuyan biri bir depolama yuzeyi oldugunu sanirdi.
    const registered: unknown = Reflect.getMetadata(
      '__filterCatchExceptions__',
      InvoicingDomainExceptionFilter,
    );

    expect(registered).not.toEqual(expect.arrayContaining([StorageFailedError]));
  });

  it('⚠️ EmbeddingFailedError -> 502 — BUGUN URETILEMEZ ama YAKALANIR', () => {
    expect(run(new EmbeddingFailedError('saglayici cokti')).status).toBe(HttpStatus.BAD_GATEWAY);
  });

  it('⚠️ CompletionFailedError -> 502 — BUGUN URETILEMEZ ama YAKALANIR', () => {
    expect(run(new CompletionFailedError('saglayici cokti')).status).toBe(HttpStatus.BAD_GATEWAY);
  });

  it('⚠️ RateLimitExceededError -> 429 + `Retry-After` — BUGUN URETILEMEZ ama YAKALANIR', () => {
    const { status, setHeader } = run(new RateLimitExceededError(60, 1800));

    expect(status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '1800');
  });

  it('PdfRenderFailedError -> 502', () => {
    expect(run(new PdfRenderFailedError('font yuklenemedi')).status).toBe(HttpStatus.BAD_GATEWAY);
  });
});

interface Rendered {
  readonly status: number;
  readonly body: ProblemDetails;
}

/** Modul filtresinin firlattigini global filtreye verir ve govdeyi yakalar. */
function render(exception: Parameters<InvoicingDomainExceptionFilter['catch']>[0]): Rendered {
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
      getRequest: () => ({ originalUrl: '/api/v1/invoicing/quotes' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  let thrown: unknown;
  try {
    new InvoicingDomainExceptionFilter().catch(exception, host);
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
class UnmappedInvoicingError extends InvoicingDomainError {
  readonly code = 'INVOICING_UNMAPPED_FOR_TEST';

  constructor() {
    super('connect ECONNREFUSED postgres://app:SUPER_SECRET@db-prod-01:5432');
  }
}

describe('InvoicingDomainExceptionFilter — acilan 5xx govdeleri', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('⚠️ "belge kaydedildi ancak PDF uretilemedi" ULASIR', () => {
    // ⚠️ Maskelenirse kullanici belgesinin KAYDEDILDIGINI (ama basilamadigini)
    // ogrenemez ve muhtemelen belgeyi YENIDEN yazar.
    const result = render(new PdfRenderFailedError('font yuklenemedi'));

    expect(result.status).toBe(HttpStatus.BAD_GATEWAY);
    expect(result.body.detail).toContain('PDF uretilemedi');
    expect(result.body.detail).toContain('kaybolmadi');
  });

  it('kutuphanenin KENDI mesaji govdeye GECMEZ', () => {
    const result = render(new PdfRenderFailedError('/root/SUPER_SECRET/font.ttf bulunamadi'));

    expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
  });

  it('⚠️ eslenmemis domain hatasi HALA MASKELENIR — SECICI genisletme', () => {
    // Bu satir olmadan yukaridaki testler, maskenin TUMUYLE kalktigi bir
    // regresyonda da YESIL yanardi.
    const result = render(new UnmappedInvoicingError());

    expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.body.detail).toBe('Beklenmeyen bir hata olustu.');
    expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
  });
});

describe('InvoicingDomainExceptionFilter — domain hatalari', () => {
  it('⚠️ gonderilmis belgeyi degistirme -> 409 (§2)', () => {
    const { status, thrown } = run(new DocumentNotEditableError('sent'));

    expect(status).toBe(HttpStatus.CONFLICT);
    // ⚠️ Mesaj DOGRU YOLU soyler: yanlis bir belge duzeltilmez, yenisi yazilir.
    expect((thrown as HttpException).getResponse()).toMatch(/YENI bir belge/);
  });

  it('gecersiz durum gecisi -> 409', () => {
    expect(run(new InvalidStatusTransitionError('sent', 'draft')).status).toBe(HttpStatus.CONFLICT);
  });

  it('kabul edilmemis teklifi donusturme -> 409 (§3)', () => {
    expect(run(new QuoteNotAcceptedError('sent')).status).toBe(HttpStatus.CONFLICT);
  });

  it('kalemsiz belgeyi gonderme -> 409', () => {
    expect(run(new EmptyDocumentError()).status).toBe(HttpStatus.CONFLICT);
  });

  it('⚠️ bulunamayan belge -> 404 — "YANLIS TURDE" de ayni cevap (P2)', () => {
    // Ayirt edilseydi `invoice:read` TASIMAYAN biri `/quotes/<fatura-id>` ile
    // bir faturanin VAR OLDUGUNU yoklayabilirdi.
    expect(run(new SalesDocumentNotFoundError()).status).toBe(HttpStatus.NOT_FOUND);
  });

  it('⚠️ satir sinirini asma -> 422 (SESSIZ KIRPMA YOK)', () => {
    expect(run(new TooManyLinesError(500, 200)).status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('gecersiz birim fiyat -> 422', () => {
    expect(run(new InvalidUnitPriceError('10.005')).status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('⚠️ takvimde olmayan gun -> 422, HAM 500 DEGIL', () => {
    expect(run(new InvalidDocumentDateError('2026-02-31')).status).toBe(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  });
});
