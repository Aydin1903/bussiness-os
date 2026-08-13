import { type ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ProblemDetails } from '@business-os/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProblemDetailsFilter } from '../../../infrastructure/http/problem-details.filter';
import { EmbeddingFailedError } from '../../../shared/embedding.port';
import { FinanceDomainError } from '../domain/finance.error';
import { FinanceDomainExceptionFilter } from './finance-domain-exception.filter';

/**
 * `FinanceDomainExceptionFilter` — 5xx govdesinin ISTEMCIYE ULASMASI.
 *
 * Gerekce `knowledge-domain-exception.filter.spec.ts`teki ile aynidir: kusur
 * TEK BIR FILTREDE degil, IKI FILTRE ARASINDAYDI (ADR-0035 kapanis denetimi,
 * 2026-08-13). Bu yuzden test zinciri kosturur.
 */

interface Rendered {
  readonly status: number;
  readonly body: ProblemDetails;
}

/** Modul filtresinin firlattigini global filtreye verir ve govdeyi yakalar. */
function render(exception: Parameters<FinanceDomainExceptionFilter['catch']>[0]): Rendered {
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
      getRequest: () => ({ originalUrl: '/api/v1/finance/commentaries' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  let thrown: unknown;
  try {
    new FinanceDomainExceptionFilter().catch(exception, host);
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
class UnmappedFinanceError extends FinanceDomainError {
  readonly code = 'FINANCE_UNMAPPED_FOR_TEST';

  constructor() {
    super('connect ECONNREFUSED postgres://app:SUPER_SECRET@db-prod-01:5432');
  }
}

describe('FinanceDomainExceptionFilter — acilan 5xx govdeleri', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('⚠️ EmbeddingFailedError -> 502 ve onarim yolu (`/finance/reindex`) ULASIR', () => {
    const result = render(new EmbeddingFailedError('saglayici cokti'));

    expect(result.status).toBe(HttpStatus.BAD_GATEWAY);
    expect(result.body.detail).toContain('Finansal yorum kaydedildi');
    expect(result.body.detail).toContain('/finance/reindex');
  });

  it('saglayicinin KENDI mesaji govdeye GECMEZ', () => {
    const result = render(new EmbeddingFailedError('OPENAI_API_KEY=sk-SUPER_SECRET gecersiz'));

    expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
  });

  it('⚠️ eslenmemis domain hatasi HALA MASKELENIR — SECICI genisletme', () => {
    const result = render(new UnmappedFinanceError());

    expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.body.detail).toBe('Beklenmeyen bir hata olustu.');
    expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
  });
});
