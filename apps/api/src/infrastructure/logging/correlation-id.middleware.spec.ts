import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { CORRELATION_ID_HEADER, correlationIdMiddleware } from './correlation-id.middleware';
import { getCorrelationId } from './request-context';

interface Harness {
  readonly headers: Record<string, string>;
  readonly next: NextFunction;
  run: () => void;
  capturedId: () => string | undefined;
  observedInsideContext: () => string | undefined;
}

function createHarness(incoming?: string): Harness {
  const setHeaders: Record<string, string> = {};
  let insideContext: string | undefined;

  const request = {
    headers: incoming === undefined ? {} : { [CORRELATION_ID_HEADER]: incoming },
  };

  const response = {
    setHeader: (name: string, value: string): void => {
      setHeaders[name] = value;
    },
  };

  const next = vi.fn(() => {
    insideContext = getCorrelationId();
  });

  return {
    headers: setHeaders,
    next,
    run: () => {
      correlationIdMiddleware(request as unknown as Request, response as unknown as Response, next);
    },
    capturedId: () => setHeaders[CORRELATION_ID_HEADER],
    observedInsideContext: () => insideContext,
  };
}

describe('correlationIdMiddleware', () => {
  it('kimlik gelmediginde yeni bir kimlik uretir', () => {
    const harness = createHarness();

    harness.run();

    expect(harness.capturedId()).toBeDefined();
    expect(harness.next).toHaveBeenCalledOnce();
  });

  it('uretilen kimligi istek baglamina yazar', () => {
    const harness = createHarness();

    harness.run();

    expect(harness.observedInsideContext()).toBe(harness.capturedId());
  });

  it('gecerli bir istemci kimligini korur — dagitik izleme icin gereklidir', () => {
    const harness = createHarness('upstream-trace-0001');

    harness.run();

    expect(harness.capturedId()).toBe('upstream-trace-0001');
  });

  // Guvenlik davranisi: ham header degeri log'a yazilirsa saldirgan satir sonu
  // enjekte ederek sahte log kaydi uretebilir (log injection).
  describe('gecersiz istemci kimligini reddeder', () => {
    const rejected: readonly (readonly [string, string])[] = [
      ['satir sonu iceren', 'abc\ndef\ninjected-log-line'],
      ['cok kisa', 'abc'],
      ['bosluk iceren', 'trace id with spaces'],
      ['izin verilmeyen karakter iceren', 'trace<script>alert(1)</script>'],
      ['cok uzun', 'a'.repeat(200)],
    ];

    it.each(rejected)('%s degeri yerine yeni kimlik uretir', (_label, value) => {
      const harness = createHarness(value);

      harness.run();

      expect(harness.capturedId()).not.toBe(value);
      expect(harness.capturedId()).toBeDefined();
    });
  });
});
