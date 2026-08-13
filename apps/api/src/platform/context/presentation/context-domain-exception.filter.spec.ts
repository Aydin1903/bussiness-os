import { type ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ProblemDetails } from '@business-os/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProblemDetailsFilter } from '../../../infrastructure/http/problem-details.filter';
import { EmbeddingFailedError } from '../../../shared/embedding.port';
import { CompletionFailedError } from '../../../shared/llm.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import { ContextDomainError } from '../domain/context.error';
import { ContextDomainExceptionFilter } from './context-domain-exception.filter';

/**
 * `ContextDomainExceptionFilter` — `POST /ask`in 5xx govdesi.
 *
 * ============================================================================
 * ⚠️ BU DOSYA NEDEN VAR — KUSUR IKI FILTRE ARASINDAYDI
 * ============================================================================
 * Filtre 502'yi ve anlamli mesaji URETIYORDU; kullanici onu GORMUYORDU, cunku
 * `ProblemDetailsFilter` varsayilan olarak her 5xx govdesini maskeler
 * (ADR-0035 kapanis denetimi, 2026-08-13). Tek bir filtreye bakan hicbir test
 * bunu goremezdi — bu yuzden testler ZINCIRI kosturur.
 *
 * Bes is modulu onceki iste kapatildi; `platform/context` KAPSAM DISI kalmis
 * ve acik borc olarak yazilmisti. Burasi projenin EN GORUNUR ucudur: `/ask`
 * dokuz katkiciya dokunur ve bir saglayici cokmesinde kullanicinin gordugu tek
 * sey bu govdedir. "Tekrar deneyin" ile "Beklenmeyen bir hata olustu."
 * arasindaki fark, kullanicinin tekrar deneyip denemeyecegini belirler.
 */

interface Rendered {
  readonly status: number;
  readonly body: ProblemDetails;
}

/** Uc filtresinin firlattigini global filtreye verir ve govdeyi yakalar. */
function render(exception: Parameters<ContextDomainExceptionFilter['catch']>[0]): Rendered {
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
      getRequest: () => ({ originalUrl: '/api/v1/ask' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  let thrown: unknown;
  try {
    new ContextDomainExceptionFilter().catch(exception, host);
  } catch (error) {
    thrown = error;
  }

  if (!(thrown instanceof HttpException)) {
    throw new TypeError('Uc filtresi bir HttpException firlatmaliydi.');
  }

  new ProblemDetailsFilter().catch(thrown, host);

  if (body === undefined) {
    throw new Error('Global filtre bir cevap uretmedi.');
  }

  return { status, body };
}

/** Eslenmemis bir domain kodu: govdesi SIZMAMALI. */
class UnmappedContextError extends ContextDomainError {
  readonly code = 'CONTEXT_UNMAPPED_FOR_TEST';

  constructor() {
    super('connect ECONNREFUSED postgres://app:SUPER_SECRET@db-prod-01:5432');
  }
}

describe('ContextDomainExceptionFilter — acilan 5xx govdeleri', () => {
  beforeEach(() => {
    // Beklenen hata loglari test ciktisini kirletmesin.
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('⚠️ CompletionFailedError -> 502 ve "Cevap uretilemedi" ULASIR', () => {
    const result = render(new CompletionFailedError('saglayici cokti'));

    expect(result.status).toBe(HttpStatus.BAD_GATEWAY);
    expect(result.body.detail).toBe('Cevap uretilemedi; lutfen tekrar deneyin.');
  });

  it('⚠️ EmbeddingFailedError -> 502 ve "Soru islenemedi" ULASIR', () => {
    const result = render(new EmbeddingFailedError('saglayici cokti'));

    expect(result.status).toBe(HttpStatus.BAD_GATEWAY);
    expect(result.body.detail).toBe('Soru islenemedi; lutfen tekrar deneyin.');
  });

  it('⚠️ govde artik genel maske metni DEGIL', () => {
    const result = render(new CompletionFailedError('saglayici cokti'));

    expect(result.body.detail).not.toBe('Beklenmeyen bir hata olustu.');
  });

  it('saglayicinin KENDI mesaji govdeye GECMEZ', () => {
    // Isaret BIZIM yazdigimiz metni acar, saglayicininkini DEGIL. `/ask` bir
    // saglayici cagrisidir; ham mesaj model adi, uc noktasi veya anahtar
    // parcasi tasiyabilir.
    const result = render(new CompletionFailedError('DEEPSEEK_API_KEY=sk-SUPER_SECRET gecersiz'));

    expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
  });

  it('429 govdesi zaten aciktir — ISARET GEREKTIRMEZ', () => {
    const result = render(new RateLimitExceededError(60, 1800));

    expect(result.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(result.body.detail).not.toBe('Beklenmeyen bir hata olustu.');
  });

  it('⚠️ eslenmemis domain hatasi HALA MASKELENIR — SECICI genisletme', () => {
    // Bu satir olmadan yukaridaki testler, maskenin tumuyle kalktigi bir
    // regresyonda da YESIL yanardi.
    const result = render(new UnmappedContextError());

    expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.body.detail).toBe('Beklenmeyen bir hata olustu.');
    expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
  });
});
