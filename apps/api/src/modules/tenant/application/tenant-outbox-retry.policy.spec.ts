import { describe, expect, it } from 'vitest';

import {
  decideTenantDeliveryRetry,
  MAX_TENANT_DELIVERY_ATTEMPTS,
  TENANT_RETRY_BASE_DELAY_MS,
  TENANT_RETRY_MAX_DELAY_MS,
  tenantRetryDelayFor,
} from './tenant-outbox-retry.policy';

const NOW = new Date('2026-08-02T10:00:00.000Z');

describe('tenantRetryDelayFor — ustel buyume', () => {
  it('ilk basarisizliktan sonra taban gecikmeyi verir', () => {
    expect(tenantRetryDelayFor(1)).toBe(TENANT_RETRY_BASE_DELAY_MS);
  });

  it('her adimda iki katina cikar', () => {
    expect(tenantRetryDelayFor(2)).toBe(TENANT_RETRY_BASE_DELAY_MS * 2);
    expect(tenantRetryDelayFor(3)).toBe(TENANT_RETRY_BASE_DELAY_MS * 4);
  });

  it('UST SINIRDA sabitlenir — sinirsiz buyume kaydi pratikte hic denenmez kilar', () => {
    expect(tenantRetryDelayFor(50)).toBe(TENANT_RETRY_MAX_DELAY_MS);
  });

  it('sifir/negatif sayacta taban gecikmeye duser (bozuk deger patlatmaz)', () => {
    expect(tenantRetryDelayFor(0)).toBe(TENANT_RETRY_BASE_DELAY_MS);
    expect(tenantRetryDelayFor(-3)).toBe(TENANT_RETRY_BASE_DELAY_MS);
  });
});

describe('decideTenantDeliveryRetry — yeniden deneme', () => {
  it('sayaci BIR artirir', () => {
    const decision = decideTenantDeliveryRetry({
      previousAttemptCount: 0,
      permanent: false,
      now: NOW,
    });

    expect(decision.attemptCount).toBe(1);
  });

  it('yeniden deneme anini simdiye gecikme ekleyerek verir', () => {
    const decision = decideTenantDeliveryRetry({
      previousAttemptCount: 0,
      permanent: false,
      now: NOW,
    });

    expect(decision.action).toBe('retry');
    if (decision.action === 'retry') {
      expect(decision.nextAttemptAt).toEqual(new Date(NOW.getTime() + TENANT_RETRY_BASE_DELAY_MS));
    }
  });
});

describe('decideTenantDeliveryRetry — olu mektup', () => {
  it('sinira ULASAN kayit olu mektuba duser', () => {
    const decision = decideTenantDeliveryRetry({
      previousAttemptCount: MAX_TENANT_DELIVERY_ATTEMPTS - 1,
      permanent: false,
      now: NOW,
    });

    expect(decision.action).toBe('dead-letter');
    expect(decision.attemptCount).toBe(MAX_TENANT_DELIVERY_ATTEMPTS);
  });

  it('sinirin BIR ALTI hala yeniden denenir (sinir kapsayicidir)', () => {
    const decision = decideTenantDeliveryRetry({
      previousAttemptCount: MAX_TENANT_DELIVERY_ATTEMPTS - 2,
      permanent: false,
      now: NOW,
    });

    expect(decision.action).toBe('retry');
  });

  it('KALICI hata TEK denemede olu mektuba duser', () => {
    // Kalici bir hatayi 5 kez denemek kuyrugu bosuna mesgul eder ve
    // ARKASINDAKI gecerli event'leri geciktirir.
    const decision = decideTenantDeliveryRetry({
      previousAttemptCount: 0,
      permanent: true,
      now: NOW,
    });

    expect(decision.action).toBe('dead-letter');
    expect(decision.attemptCount).toBe(1);
  });
});
