import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import { type AiCallRecord } from '../../shared/ai-usage-recorder.port';
import { runWithTenantContext } from '../tenant/tenant-context';
import { LoggingAiUsageRecorder } from './logging-ai-usage-recorder';

function fakeLogger() {
  const info = vi.fn();
  return { info } as unknown as PinoLogger & { info: ReturnType<typeof vi.fn> };
}

function call(overrides: Partial<AiCallRecord> = {}): AiCallRecord {
  return {
    operation: 'complete',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    caller: 'knowledge',
    outcome: 'ok',
    durationMs: 1200,
    usage: { prompt: 19, completion: 1, total: 20 },
    ...overrides,
  };
}

/** Pino'ya gecirilen ilk argumani (yapilandirilmis alanlar) dondurur. */
function loggedFields(logger: ReturnType<typeof fakeLogger>): Record<string, unknown> {
  const [fields] = logger.info.mock.calls[0] ?? [];
  return fields as Record<string, unknown>;
}

describe('LoggingAiUsageRecorder — sorgulanabilir satir', () => {
  it('sabit `ai.call` olay adiyla yazar', () => {
    const logger = fakeLogger();

    new LoggingAiUsageRecorder(logger).record(call());

    // Sorgulanabilirligin tamami buna dayanir: `event = "ai.call"` filtresi
    // TUM AI harcamasini verir.
    expect(loggedFields(logger).event).toBe('ai.call');
  });

  it('saglayici, model, cagiran modul ve token sayilarini tasir', () => {
    const logger = fakeLogger();

    new LoggingAiUsageRecorder(logger).record(call());

    expect(loggedFields(logger).ai).toMatchObject({
      operation: 'complete',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      caller: 'knowledge',
      outcome: 'ok',
      durationMs: 1200,
      promptTokens: 19,
      completionTokens: 1,
      totalTokens: 20,
    });
  });
});

describe('LoggingAiUsageRecorder — kim ve hangi tenant', () => {
  it('tenant context varsa tenantId/userId/correlationId ekler', () => {
    const logger = fakeLogger();

    runWithTenantContext(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        role: 'owner',
        correlationId: 'corr-1',
        source: 'http',
      },
      () => {
        new LoggingAiUsageRecorder(logger).record(call());
      },
    );

    expect(loggedFields(logger)).toMatchObject({
      tenantId: 'tenant-1',
      userId: 'user-1',
      correlationId: 'corr-1',
    });
  });

  it('context YOKSA `null` yazar — uydurmaz, patlamaz', () => {
    const logger = fakeLogger();

    new LoggingAiUsageRecorder(logger).record(call());

    // HTTP disi yollarda context kurulmamis olabilir; bu bir hata degildir.
    expect(loggedFields(logger)).toMatchObject({
      tenantId: null,
      userId: null,
      correlationId: null,
    });
  });
});

describe('LoggingAiUsageRecorder — kayit isi COKERTMEZ', () => {
  it('logger firlatirsa hata disari SIZMAZ', () => {
    const logger = fakeLogger();
    logger.info.mockImplementation(() => {
      throw new Error('log hedefi kapali');
    });

    // Log yazamamak yuzunden kullanicinin sorusu cevapsiz kalamaz.
    expect(() => {
      new LoggingAiUsageRecorder(logger).record(call());
    }).not.toThrow();
  });
});
