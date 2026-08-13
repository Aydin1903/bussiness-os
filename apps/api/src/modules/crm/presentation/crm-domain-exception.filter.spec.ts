import { type ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ProblemDetails } from '@business-os/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProblemDetailsFilter } from '../../../infrastructure/http/problem-details.filter';
import { EmbeddingFailedError } from '../../../shared/embedding.port';
import { CompletionFailedError } from '../../../shared/llm.port';
import { CrmDomainError } from '../domain/crm.error';
import { CrmDomainExceptionFilter } from './crm-domain-exception.filter';

/**
 * `CrmDomainExceptionFilter` — 5xx govdesinin ISTEMCIYE ULASMASI.
 *
 * Gerekce `knowledge-domain-exception.filter.spec.ts`teki ile aynidir: kusur
 * TEK BIR FILTREDE degil, IKI FILTRE ARASINDAYDI (ADR-0035 kapanis denetimi,
 * 2026-08-13). Bu yuzden test zinciri kosturur.
 *
 * ⚠️ CRM'de iki 502'nin FARKLI olmasi anlam tasir: embedding hatasinda BIR SEY
 * KAYDEDILMISTIR, ozet hatasinda hicbir sey kaybolmamistir. Maske altinda bu
 * ayrim kullaniciya hic gorunmuyordu — iki test bunu ayri ayri kilitler.
 */

interface Rendered {
  readonly status: number;
  readonly body: ProblemDetails;
}

/** Modul filtresinin firlattigini global filtreye verir ve govdeyi yakalar. */
function render(exception: Parameters<CrmDomainExceptionFilter['catch']>[0]): Rendered {
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
      getRequest: () => ({ originalUrl: '/api/v1/crm/interactions' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  let thrown: unknown;
  try {
    new CrmDomainExceptionFilter().catch(exception, host);
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
class UnmappedCrmError extends CrmDomainError {
  readonly code = 'CRM_UNMAPPED_FOR_TEST';

  constructor() {
    super('connect ECONNREFUSED postgres://app:SUPER_SECRET@db-prod-01:5432');
  }
}

describe('CrmDomainExceptionFilter — acilan 5xx govdeleri', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('⚠️ EmbeddingFailedError -> 502 ve onarim yolu (`/crm/reindex`) ULASIR', () => {
    const result = render(new EmbeddingFailedError('saglayici cokti'));

    expect(result.status).toBe(HttpStatus.BAD_GATEWAY);
    expect(result.body.detail).toContain('Gorusme kaydedildi');
    expect(result.body.detail).toContain('/crm/reindex');
  });

  it('⚠️ CompletionFailedError -> 502 ve "Mevcut ozet korundu" ULASIR', () => {
    // ADR-0032. Bu cumle olmadan kullanici ozetinin SILINDIGINI sanirdi.
    const result = render(new CompletionFailedError('saglayici cokti'));

    expect(result.status).toBe(HttpStatus.BAD_GATEWAY);
    expect(result.body.detail).toContain('Mevcut ozet korundu');
  });

  it('saglayicinin KENDI mesaji govdeye GECMEZ', () => {
    const result = render(new CompletionFailedError('DEEPSEEK_API_KEY=sk-SUPER_SECRET gecersiz'));

    expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
  });

  it('⚠️ eslenmemis domain hatasi HALA MASKELENIR — SECICI genisletme', () => {
    const result = render(new UnmappedCrmError());

    expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.body.detail).toBe('Beklenmeyen bir hata olustu.');
    expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
  });
});
