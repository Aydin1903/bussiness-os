import { type ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ProblemDetails } from '@business-os/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProblemDetailsFilter } from '../../../infrastructure/http/problem-details.filter';
import { EmbeddingFailedError } from '../../../shared/embedding.port';
import { CompletionFailedError } from '../../../shared/llm.port';
import { KnowledgeDomainError } from '../domain/knowledge.error';
import { KnowledgeDomainExceptionFilter } from './knowledge-domain-exception.filter';

/**
 * `KnowledgeDomainExceptionFilter` — 5xx govdesinin ISTEMCIYE ULASMASI.
 *
 * ============================================================================
 * ⚠️ BU DOSYA NEDEN VAR — TEK BIR FILTRE TESTI YETMEZ
 * ============================================================================
 * Modul filtresi 502'yi ve anlamli mesaji URETIYORDU; kusur bir sonraki
 * adimdaydi — `ProblemDetailsFilter` her 5xx govdesini maskeledigi icin
 * kullanici "Beklenmeyen bir hata olustu." goruyordu (ADR-0035 kapanis
 * denetimi, 2026-08-13). Yani hata IKI FILTRE ARASINDAYDI ve tek bir filtreye
 * bakan hicbir test onu goremezdi.
 *
 * Bu yuzden buradaki testler ZINCIRI kosturur: modul filtresi -> global filtre
 * -> istemciye giden GOVDE. Ayrica ucuncu test maskenin HALA CALISTIGINI
 * kanitlar; o olmadan ilk ikisi, maskenin tumuyle kalktigi bir regresyonda da
 * yesil yanardi.
 */

interface Rendered {
  readonly status: number;
  readonly body: ProblemDetails;
}

/** Modul filtresinin firlattigini global filtreye verir ve govdeyi yakalar. */
function render(exception: Parameters<KnowledgeDomainExceptionFilter['catch']>[0]): Rendered {
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
      getRequest: () => ({ originalUrl: '/api/v1/knowledge/notes' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  let thrown: unknown;
  try {
    new KnowledgeDomainExceptionFilter().catch(exception, host);
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
class UnmappedKnowledgeError extends KnowledgeDomainError {
  readonly code = 'KNOWLEDGE_UNMAPPED_FOR_TEST';

  constructor() {
    super('connect ECONNREFUSED postgres://app:SUPER_SECRET@db-prod-01:5432');
  }
}

describe('KnowledgeDomainExceptionFilter — acilan 5xx govdeleri', () => {
  beforeEach(() => {
    // Beklenen hata loglari test ciktisini kirletmesin.
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('⚠️ EmbeddingFailedError -> 502 ve "kaydedildi ama indekslenemedi" ULASIR', () => {
    const result = render(new EmbeddingFailedError('saglayici cokti'));

    expect(result.status).toBe(HttpStatus.BAD_GATEWAY);
    expect(result.body.detail).toContain('Not kaydedildi');
    expect(result.body.detail).not.toBe('Beklenmeyen bir hata olustu.');
  });

  it('⚠️ CompletionFailedError -> 502 ve "cevap uretilemedi" ULASIR', () => {
    const result = render(new CompletionFailedError('saglayici cokti'));

    expect(result.status).toBe(HttpStatus.BAD_GATEWAY);
    expect(result.body.detail).toContain('tekrar deneyin');
  });

  it('saglayicinin KENDI mesaji govdeye GECMEZ', () => {
    // Isaret BIZIM yazdigimiz metni acar, saglayicininkini DEGIL.
    const result = render(new EmbeddingFailedError('OPENAI_API_KEY=sk-SUPER_SECRET gecersiz'));

    expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
  });

  it('⚠️ eslenmemis domain hatasi HALA MASKELENIR — SECICI genisletme', () => {
    const result = render(new UnmappedKnowledgeError());

    expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.body.detail).toBe('Beklenmeyen bir hata olustu.');
    expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
  });
});
