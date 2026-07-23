import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type PublishIdentityEventsResult,
  type PublishIdentityEventsUseCase,
} from '../application/publish-identity-events.use-case';
import { IdentityOutboxRelay } from './identity-outbox-relay';

const INTERVAL_MS = 1_000;

const EMPTY: PublishIdentityEventsResult = {
  claimed: 0,
  delivered: 0,
  acknowledged: 0,
  failures: [],
  unhandledEventTypes: [],
};

/**
 * Use case yerine gecen FAKE. `PublishIdentityEventsUseCase` sinifinin yerine
 * gectigi icin tip olarak o beklenir; relay yalnizca `execute`'u cagirir.
 */
class FakePublishUseCase {
  runs = 0;
  failNext = false;
  /** Cozulmeyi testin kontrol ettigi tur — es zamanlilik testi icin. */
  pending: (() => void) | null = null;

  execute(): Promise<PublishIdentityEventsResult> {
    this.runs += 1;

    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('tur coktu'));
    }

    if (this.pending !== null) {
      return new Promise((resolve) => {
        this.pending = () => {
          resolve(EMPTY);
        };
      });
    }

    return Promise.resolve(EMPTY);
  }
}

function createRelay(options: { enabled: boolean }): {
  relay: IdentityOutboxRelay;
  useCase: FakePublishUseCase;
} {
  const useCase = new FakePublishUseCase();
  const relay = new IdentityOutboxRelay(useCase as unknown as PublishIdentityEventsUseCase, {
    enabled: options.enabled,
    intervalMs: INTERVAL_MS,
  });

  return { relay, useCase };
}

describe('IdentityOutboxRelay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('KAPALIYKEN zamanlayici kurmaz', async () => {
    const { relay, useCase } = createRelay({ enabled: false });

    relay.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);

    expect(useCase.runs).toBe(0);
  });

  it('acikken her aralikta bir tur calistirir', async () => {
    const { relay, useCase } = createRelay({ enabled: true });

    relay.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);

    expect(useCase.runs).toBe(3);
  });

  it('kapanista zamanlayiciyi temizler', async () => {
    const { relay, useCase } = createRelay({ enabled: true });

    relay.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    relay.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);

    // Temizlenmeseydi surec kapanirken turlar devam ederdi.
    expect(useCase.runs).toBe(1);
  });

  it('onceki tur bitmeden yenisini BASLATMAZ', async () => {
    const { relay, useCase } = createRelay({ enabled: true });
    useCase.pending = () => undefined;

    relay.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);

    // Yavas bir tur (buyuk batch/yavas saglayici) turlarin ust uste binmesine
    // ve ayni kayitlarin iki kez islenmeye calisilmasina yol acardi.
    expect(useCase.runs).toBe(1);
  });

  it('askidaki tur bitince yeniden calismaya devam eder', async () => {
    const { relay, useCase } = createRelay({ enabled: true });
    useCase.pending = () => undefined;

    relay.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    // `execute` askidaki turu kendi cozucusuyle degistirdi; onu tetikle.
    useCase.pending();
    useCase.pending = null;
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 2);

    expect(useCase.runs).toBeGreaterThan(1);
  });

  it('bir tur hata verse de surec DEVAM eder', async () => {
    const { relay, useCase } = createRelay({ enabled: true });
    useCase.failNext = true;

    relay.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 2);

    // Yakalanmayan hata arka plan surecini oldururdu; teslimat sessizce durur.
    expect(useCase.runs).toBe(2);
  });

  it('runOnce dogrudan cagrilabilir (test ve elle tetikleme icin)', async () => {
    const { relay, useCase } = createRelay({ enabled: true });

    await relay.runOnce();

    expect(useCase.runs).toBe(1);
  });
});
