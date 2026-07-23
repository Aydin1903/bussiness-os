import { describe, expect, it } from 'vitest';

import {
  decideDeliveryRetry,
  MAX_DELIVERY_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  retryDelayFor,
} from './outbox-retry.policy';

const NOW = new Date('2026-07-22T10:00:00.000Z');

function failure(overrides: Partial<{ previousAttemptCount: number; permanent: boolean }> = {}) {
  return {
    previousAttemptCount: 0,
    permanent: false,
    now: NOW,
    ...overrides,
  };
}

describe('retryDelayFor — ustel buyume', () => {
  it('ilk basarisizliktan sonra taban gecikmeyi verir', () => {
    expect(retryDelayFor(1)).toBe(RETRY_BASE_DELAY_MS);
  });

  it('her adimda iki katina cikar', () => {
    expect(retryDelayFor(2)).toBe(RETRY_BASE_DELAY_MS * 2);
    expect(retryDelayFor(3)).toBe(RETRY_BASE_DELAY_MS * 4);
    expect(retryDelayFor(4)).toBe(RETRY_BASE_DELAY_MS * 8);
  });

  it('ust sinirda sabitlenir', () => {
    // Sinirsiz buyume, kaydi kuyrukta gorunur ama pratikte hic denenmez kilardi.
    expect(retryDelayFor(20)).toBe(RETRY_MAX_DELAY_MS);
  });

  it('toplam pencere kod omrunun (15 dk) ALTINDA kalir', () => {
    let total = 0;
    for (let attempt = 1; attempt < MAX_DELIVERY_ATTEMPTS; attempt += 1) {
      total += retryDelayFor(attempt);
    }

    // Pencere asilirsa teslim edilen kod ZATEN olu olur (ADR-0019).
    expect(total).toBeLessThan(15 * 60_000);
  });
});

describe('decideDeliveryRetry — yeniden deneme', () => {
  it('ilk basarisizlikta sayaci 1 yapar ve backoff verir', () => {
    const decision = decideDeliveryRetry(failure());

    expect(decision).toEqual({
      action: 'retry',
      attemptCount: 1,
      nextAttemptAt: new Date(NOW.getTime() + RETRY_BASE_DELAY_MS),
    });
  });

  it('sayaci onceki degerin UZERINE ekler', () => {
    const decision = decideDeliveryRetry(failure({ previousAttemptCount: 2 }));

    expect(decision.attemptCount).toBe(3);
  });

  it('sinirin BIR ALTINDA hala yeniden dener', () => {
    const decision = decideDeliveryRetry(
      failure({ previousAttemptCount: MAX_DELIVERY_ATTEMPTS - 2 }),
    );

    expect(decision.action).toBe('retry');
  });
});

describe('decideDeliveryRetry — dead-letter', () => {
  it('SINIRA ulasinca olu mektuba dusurur', () => {
    const decision = decideDeliveryRetry(
      failure({ previousAttemptCount: MAX_DELIVERY_ATTEMPTS - 1 }),
    );

    expect(decision).toEqual({ action: 'dead-letter', attemptCount: MAX_DELIVERY_ATTEMPTS });
  });

  it('siniri ASMIS kaydi da olu mektuba dusurur', () => {
    const decision = decideDeliveryRetry(
      failure({ previousAttemptCount: MAX_DELIVERY_ATTEMPTS + 3 }),
    );

    expect(decision.action).toBe('dead-letter');
  });

  it('KALICI hatayi ILK denemede olu mektuba dusurur', () => {
    const decision = decideDeliveryRetry(failure({ permanent: true }));

    // Gecersiz bir adresi 5 kez denemek kuyrugu bosuna mesgul ederdi.
    expect(decision).toEqual({ action: 'dead-letter', attemptCount: 1 });
  });
});

describe('decideDeliveryRetry — esik degerleri', () => {
  it('5 deneme · 30 sn taban · 5 dk tavan', () => {
    expect(MAX_DELIVERY_ATTEMPTS).toBe(5);
    expect(RETRY_BASE_DELAY_MS).toBe(30_000);
    expect(RETRY_MAX_DELAY_MS).toBe(5 * 60_000);
  });
});
