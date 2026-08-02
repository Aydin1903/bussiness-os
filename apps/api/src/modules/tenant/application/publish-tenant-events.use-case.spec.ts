import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { TenantProvisioningRequested } from '../domain/tenant-provisioning-requested.event';
import {
  PublishTenantEventsUseCase,
  type PublishTenantEventsDependencies,
} from './publish-tenant-events.use-case';
import {
  MAX_TENANT_DELIVERY_ATTEMPTS,
  TENANT_RETRY_BASE_DELAY_MS,
} from './tenant-outbox-retry.policy';
import type {
  TenantOutboxDeliveryFailure,
  TenantOutboxRecord,
  TenantOutboxRepository,
} from './tenant-outbox.repository.port';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

const NOW = new Date('2026-08-02T10:00:00.000Z');
const TENANT_ID = '018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b01';

function record(overrides: Partial<TenantOutboxRecord> = {}): TenantOutboxRecord {
  return {
    id: '018f3a2b-7c4d-7e1f-8a2b-000000000001',
    tenantId: TENANT_ID,
    eventType: TenantProvisioningRequested.TYPE,
    eventVersion: 1,
    payload: { tenantId: TENANT_ID, slug: 'acme' },
    correlationId: 'c-1',
    occurredAt: NOW,
    attemptCount: 0,
    ...overrides,
  };
}

class FakeOutboxRepository implements TenantOutboxRepository {
  pending: TenantOutboxRecord[] = [];
  publishedIds: string[] = [];
  recordedFailures: TenantOutboxDeliveryFailure[] = [];
  claimedWith: { limit: number; now: Date } | null = null;

  claimPending(limit: number, now: Date): Promise<TenantOutboxRecord[]> {
    this.claimedWith = { limit, now };
    return Promise.resolve(this.pending);
  }

  markPublished(ids: readonly string[]): Promise<void> {
    this.publishedIds.push(...ids);
    return Promise.resolve();
  }

  recordFailures(failures: readonly TenantOutboxDeliveryFailure[]): Promise<void> {
    this.recordedFailures.push(...failures);
    return Promise.resolve();
  }
}

/**
 * Teslimati FIRLATAN use case — basarisizlik yolunu calistirmak icin.
 *
 * Bugun hicbir event'in gercek yan etkisi yok, dolayisiyla uretimde `deliver`
 * asla firlatmaz. `protected` olmasinin sebebi tam olarak budur: sahte bir port
 * icat etmeden GERCEK basarisizlik yolu (`#registerFailure` -> politika ->
 * `recordFailures`) calistirilabilir. Faz 4'te gercek handler'lar geldiginde
 * ayni yol dogal olarak tetiklenecektir.
 */
class FailingPublishTenantEventsUseCase extends PublishTenantEventsUseCase {
  constructor(
    deps: PublishTenantEventsDependencies,
    private readonly reason: string,
  ) {
    super(deps);
  }

  protected override deliver(): Promise<'delivered' | 'no-op' | 'unhandled'> {
    return Promise.reject(new Error(this.reason));
  }
}

class FakeTransactionManager implements TransactionManager {
  opened = 0;
  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    this.opened += 1;
    return fn();
  }
  runInTenantTransaction<T>(_t: string, fn: () => Promise<T>): Promise<T> {
    return this.runInTransaction(fn);
  }
  runInCurrentTenantTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.runInTransaction(fn);
  }
}

class FixedClock implements Clock {
  now(): Date {
    return new Date(NOW.getTime());
  }
}

interface Harness {
  readonly repository: FakeOutboxRepository;
  readonly transactionManager: FakeTransactionManager;
  readonly useCase: PublishTenantEventsUseCase;
}

function createHarness(repository = new FakeOutboxRepository(), batchSize = 20): Harness {
  const transactionManager = new FakeTransactionManager();

  const deps: PublishTenantEventsDependencies = {
    outboxRepository: repository,
    transactionManager,
    clock: new FixedClock(),
    batchSize,
  };

  return { repository, transactionManager, useCase: new PublishTenantEventsUseCase(deps) };
}

describe('PublishTenantEventsUseCase — bos kuyruk', () => {
  it('kayit yoksa hicbir sey yazmaz', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute();

    expect(result.claimed).toBe(0);
    expect(harness.repository.publishedIds).toHaveLength(0);
    expect(harness.repository.recordedFailures).toHaveLength(0);
  });

  it('yine de TEK transaction acar (kilit sinirinin sahibi use case tir)', async () => {
    const harness = createHarness();

    await harness.useCase.execute();

    expect(harness.transactionManager.opened).toBe(1);
  });
});

describe('PublishTenantEventsUseCase — teslimat gerektirmeyen event', () => {
  it('tenant.provisioning_requested i ISARETLER (yan etki uygulamadan)', async () => {
    const harness = createHarness();
    harness.repository.pending = [record()];

    const result = await harness.useCase.execute();

    // V1 provisioning senkron (ADR-0016): event bir denetim kaydidir.
    expect(result.delivered).toBe(0);
    expect(result.acknowledged).toBe(1);
    expect(harness.repository.publishedIds).toEqual([record().id]);
  });

  it('isaretlemeseydi kuyruk sonsuza kadar buyurdu — bu yuzden acknowledged sayilir', async () => {
    const harness = createHarness();
    harness.repository.pending = [record({ id: 'a' }), record({ id: 'b' })];

    const result = await harness.useCase.execute();

    expect(result.claimed).toBe(2);
    expect(harness.repository.publishedIds).toEqual(['a', 'b']);
  });

  it('batch boyutunu ve saati repository ye AYNEN gecirir', async () => {
    const harness = createHarness(new FakeOutboxRepository(), 7);
    harness.repository.pending = [];

    await harness.useCase.execute();

    expect(harness.repository.claimedWith).toEqual({ limit: 7, now: NOW });
  });
});

describe('PublishTenantEventsUseCase — handler i olmayan event', () => {
  it('bilinmeyen tipi ISARETLEMEZ ve gorunur birakir', async () => {
    const harness = createHarness();
    harness.repository.pending = [record({ eventType: 'crm.customer_created' })];

    const result = await harness.useCase.execute();

    // Eksik bir handler sessizce "islenmis" sayilmamali: Faz 4'te handler'i
    // unutulan event tipi burada gorunur.
    expect(result.unhandledEventTypes).toEqual(['crm.customer_created']);
    expect(result.acknowledged).toBe(0);
    expect(harness.repository.publishedIds).toHaveLength(0);
  });

  it('bilinmeyen tip BASARISIZLIK degildir — sayac artmaz, backoff yazilmaz', async () => {
    const harness = createHarness();
    harness.repository.pending = [record({ eventType: 'crm.customer_created' })];

    const result = await harness.useCase.execute();

    expect(result.failures).toHaveLength(0);
    expect(harness.repository.recordedFailures).toHaveLength(0);
  });

  it('bilinen ve bilinmeyen tipler ayni turda birlikte islenir', async () => {
    const harness = createHarness();
    harness.repository.pending = [
      record({ id: 'bilinen' }),
      record({ id: 'bilinmeyen', eventType: 'crm.customer_created' }),
    ];

    const result = await harness.useCase.execute();

    expect(harness.repository.publishedIds).toEqual(['bilinen']);
    expect(result.unhandledEventTypes).toEqual(['crm.customer_created']);
  });
});

describe('PublishTenantEventsUseCase — teslimat basarisizligi', () => {
  function failingHarness(
    pending: TenantOutboxRecord[],
    reason = 'handler patladi',
  ): { repository: FakeOutboxRepository; useCase: PublishTenantEventsUseCase } {
    const repository = new FakeOutboxRepository();
    repository.pending = pending;

    const useCase = new FailingPublishTenantEventsUseCase(
      {
        outboxRepository: repository,
        transactionManager: new FakeTransactionManager(),
        clock: new FixedClock(),
        batchSize: 20,
      },
      reason,
    );

    return { repository, useCase };
  }

  it('kaydi ISARETLEMEZ ve basarisizlik olarak bildirir', async () => {
    const { repository, useCase } = failingHarness([record()]);

    const result = await useCase.execute();

    expect(repository.publishedIds).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.reason).toBe('handler patladi');
  });

  it('sayaci BIR artirir ve backoff ile yeniden deneme ani yazar', async () => {
    const { repository, useCase } = failingHarness([record({ attemptCount: 0 })]);

    await useCase.execute();

    const failure = repository.recordedFailures[0];
    expect(failure?.attemptCount).toBe(1);
    expect(failure?.nextAttemptAt).toEqual(new Date(NOW.getTime() + TENANT_RETRY_BASE_DELAY_MS));
    expect(failure?.deadLetteredAt).toBeNull();
  });

  it('sayac arttikca yeniden deneme ani USTEL olarak uzar', async () => {
    const { repository, useCase } = failingHarness([record({ attemptCount: 2 })]);

    await useCase.execute();

    // 3. deneme -> 30sn * 2^2 = 120 sn
    expect(repository.recordedFailures[0]?.nextAttemptAt).toEqual(
      new Date(NOW.getTime() + TENANT_RETRY_BASE_DELAY_MS * 4),
    );
  });

  it('DEAD-LETTER esigine ulasinca durum degisir: nextAttemptAt null, deadLetteredAt dolu', async () => {
    const { repository, useCase } = failingHarness([
      record({ attemptCount: MAX_TENANT_DELIVERY_ATTEMPTS - 1 }),
    ]);

    const result = await useCase.execute();

    const failure = repository.recordedFailures[0];
    expect(failure?.attemptCount).toBe(MAX_TENANT_DELIVERY_ATTEMPTS);
    // Kuyruktan CIKARILDI: bir daha denenmeyecek.
    expect(failure?.nextAttemptAt).toBeNull();
    expect(failure?.deadLetteredAt).toEqual(NOW);
    expect(result.deadLettered).toBe(1);
    expect(result.failures[0]?.deadLettered).toBe(true);
  });

  it('bir kaydin hatasi turun TAMAMINI goturmez — digerleri islenir', async () => {
    const { repository, useCase } = failingHarness([record({ id: 'a' }), record({ id: 'b' })]);

    const result = await useCase.execute();

    expect(result.claimed).toBe(2);
    expect(repository.recordedFailures.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('hata metnini teshis icin yazar', async () => {
    const { repository, useCase } = failingHarness([record()], 'baglanti zaman asimi');

    await useCase.execute();

    expect(repository.recordedFailures[0]?.lastError).toBe('baglanti zaman asimi');
  });
});

describe('PublishTenantEventsUseCase — tur seviyesinde hata', () => {
  it('claimPending firlatirsa hata yukari cikar (relay yakalar, tur atlanir)', async () => {
    const repository = new FakeOutboxRepository();
    repository.claimPending = (): Promise<TenantOutboxRecord[]> => {
      throw new Error('baglanti koptu');
    };
    const harness = createHarness(repository);

    await expect(harness.useCase.execute()).rejects.toThrow('baglanti koptu');
  });
});

describe('PublishTenantEventsUseCase — sonuc sozlesmesi', () => {
  it('deadLettered sayisi failures icinden turetilir', async () => {
    const harness = createHarness();
    harness.repository.pending = [record()];

    const result = await harness.useCase.execute();

    expect(result.deadLettered).toBe(0);
    expect(result.failures).toEqual([]);
  });

  it('politika sabitleri Identity ile AYNI baslangic degerlerini tasir', () => {
    // Ayrisma bilincli olarak MUMKUN kilindi (ayri dosya), ama bugun ayni
    // olmalari da bilincli: farklilastirmak icin somut gerekce yok.
    expect(MAX_TENANT_DELIVERY_ATTEMPTS).toBe(5);
    expect(TENANT_RETRY_BASE_DELAY_MS).toBe(30_000);
  });
});
