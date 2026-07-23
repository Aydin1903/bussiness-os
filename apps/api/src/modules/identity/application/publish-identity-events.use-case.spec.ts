import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type EmailMessage, type EmailPort } from '../../../shared/email.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  type IdentityOutboxRecord,
  type IdentityOutboxRepository,
} from './identity-outbox.repository.port';
import {
  PublishIdentityEventsUseCase,
  type PublishIdentityEventsDependencies,
} from './publish-identity-events.use-case';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

const NOW = new Date('2026-07-22T10:00:00.000Z');
const BATCH_SIZE = 10;

function registeredRecord(id: string, email = 'user@example.com'): IdentityOutboxRecord {
  return {
    id,
    eventType: 'user.registered',
    eventVersion: 1,
    payload: { userId: 'u-1', email, verificationCode: '123456' },
    correlationId: 'corr-1',
    occurredAt: NOW,
  };
}

function record(id: string, eventType: string): IdentityOutboxRecord {
  return {
    id,
    eventType,
    eventVersion: 1,
    payload: { userId: 'u-1' },
    correlationId: 'corr-1',
    occurredAt: NOW,
  };
}

class FakeOutboxRepository implements IdentityOutboxRepository {
  pending: IdentityOutboxRecord[] = [];
  readonly published: string[] = [];
  claimedLimits: number[] = [];
  publishedAt: Date | null = null;
  failOnMark = false;

  claimPending(limit: number): Promise<IdentityOutboxRecord[]> {
    this.claimedLimits.push(limit);
    return Promise.resolve(this.pending.slice(0, limit));
  }

  markPublished(ids: readonly string[], publishedAt: Date): Promise<void> {
    if (this.failOnMark) {
      return Promise.reject(new Error('isaretleme hatasi'));
    }
    this.published.push(...ids);
    this.publishedAt = publishedAt;
    return Promise.resolve();
  }
}

class FakeEmailPort implements EmailPort {
  readonly sent: EmailMessage[] = [];
  failFor: string | null = null;

  send(message: EmailMessage): Promise<void> {
    if (this.failFor === message.to) {
      return Promise.reject(new Error('saglayici reddetti'));
    }
    this.sent.push(message);
    return Promise.resolve();
  }
}

class FakeTransactionManager implements TransactionManager {
  opened = 0;
  rolledBack = false;

  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    this.opened += 1;
    try {
      return await fn();
    } catch (error) {
      this.rolledBack = true;
      throw error;
    }
  }

  runInTenantTransaction<T>(_tenantId: string, fn: () => Promise<T>): Promise<T> {
    return this.runInTransaction(fn);
  }
}

class FixedClock implements Clock {
  now(): Date {
    return new Date(NOW.getTime());
  }
}

interface Harness {
  readonly outboxRepository: FakeOutboxRepository;
  readonly emailPort: FakeEmailPort;
  readonly transactionManager: FakeTransactionManager;
  readonly useCase: PublishIdentityEventsUseCase;
}

function createHarness(): Harness {
  const outboxRepository = new FakeOutboxRepository();
  const emailPort = new FakeEmailPort();
  const transactionManager = new FakeTransactionManager();

  const deps: PublishIdentityEventsDependencies = {
    outboxRepository,
    emailPort,
    transactionManager,
    clock: new FixedClock(),
    batchSize: BATCH_SIZE,
  };

  return {
    outboxRepository,
    emailPort,
    transactionManager,
    useCase: new PublishIdentityEventsUseCase(deps),
  };
}

describe('PublishIdentityEventsUseCase — teslimat', () => {
  it('UserRegistered icin dogrulama e-postasi gonderir', async () => {
    const harness = createHarness();
    harness.outboxRepository.pending = [registeredRecord('e-1')];

    const result = await harness.useCase.execute();

    expect(harness.emailPort.sent).toHaveLength(1);
    expect(harness.emailPort.sent[0]?.to).toBe('user@example.com');
    expect(harness.emailPort.sent[0]?.textBody).toContain('123456');
    expect(result).toMatchObject({ claimed: 1, delivered: 1, acknowledged: 1 });
  });

  it('teslim ettigini yayinlanmis olarak isaretler', async () => {
    const harness = createHarness();
    harness.outboxRepository.pending = [registeredRecord('e-1')];

    await harness.useCase.execute();

    expect(harness.outboxRepository.published).toEqual(['e-1']);
    expect(harness.outboxRepository.publishedAt).toEqual(NOW);
  });

  it('hepsini TEK transaction da isler', async () => {
    const harness = createHarness();
    harness.outboxRepository.pending = [registeredRecord('e-1'), registeredRecord('e-2')];

    await harness.useCase.execute();

    // Kilit gonderim boyunca tutulur; ayni satiri ikinci bir instance alamaz.
    expect(harness.transactionManager.opened).toBe(1);
  });

  it('batch boyutunu asmaz', async () => {
    const harness = createHarness();

    await harness.useCase.execute();

    expect(harness.outboxRepository.claimedLimits).toEqual([BATCH_SIZE]);
  });

  it('bekleyen kayit yoksa hicbir sey gondermez', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute();

    expect(result.claimed).toBe(0);
    expect(harness.emailPort.sent).toHaveLength(0);
    expect(harness.outboxRepository.published).toHaveLength(0);
  });
});

describe('PublishIdentityEventsUseCase — is gerektirmeyen event ler', () => {
  it.each([['user.logged_in'], ['user.email_verified']])(
    '%s icin e-posta GONDERMEZ ama isaretler',
    async (eventType) => {
      const harness = createHarness();
      harness.outboxRepository.pending = [record('e-1', eventType)];

      const result = await harness.useCase.execute();

      // Isaretlenmeseydi bekleyen index sonsuza kadar buyur ve ayni satirlar
      // her turda yeniden okunurdu.
      expect(harness.emailPort.sent).toHaveLength(0);
      expect(harness.outboxRepository.published).toEqual(['e-1']);
      expect(result).toMatchObject({ delivered: 0, acknowledged: 1 });
    },
  );

  it('BILINMEYEN event tipini isaretlemez ve gorunur birakir', async () => {
    const harness = createHarness();
    harness.outboxRepository.pending = [record('e-1', 'user.something_new')];

    const result = await harness.useCase.execute();

    // Eksik handler sessizce "islenmis" sayilirsa, eklendiginde o event'ler
    // coktan kaybolmus olur.
    expect(harness.outboxRepository.published).toHaveLength(0);
    expect(result.unhandledEventTypes).toEqual(['user.something_new']);
    expect(result.acknowledged).toBe(0);
  });
});

describe('PublishIdentityEventsUseCase — hata yalitimi', () => {
  it('bir kaydin hatasi digerlerinin teslimatini ENGELLEMEZ', async () => {
    const harness = createHarness();
    harness.emailPort.failFor = 'bozuk@example.com';
    harness.outboxRepository.pending = [
      registeredRecord('e-1', 'bozuk@example.com'),
      registeredRecord('e-2', 'saglam@example.com'),
    ];

    const result = await harness.useCase.execute();

    expect(harness.emailPort.sent.map((m) => m.to)).toEqual(['saglam@example.com']);
    expect(result.failures).toEqual([
      { id: 'e-1', eventType: 'user.registered', reason: 'saglayici reddetti' },
    ]);
  });

  it('basarisiz kaydi YAYINLANMAMIS birakir — sonraki turda yeniden denenir', async () => {
    const harness = createHarness();
    harness.emailPort.failFor = 'bozuk@example.com';
    harness.outboxRepository.pending = [
      registeredRecord('e-1', 'bozuk@example.com'),
      registeredRecord('e-2', 'saglam@example.com'),
    ];

    await harness.useCase.execute();

    expect(harness.outboxRepository.published).toEqual(['e-2']);
  });

  it('bozuk payload lu kaydi teslim etmez ve isaretlemez', async () => {
    const harness = createHarness();
    harness.outboxRepository.pending = [
      {
        id: 'e-1',
        eventType: 'user.registered',
        eventVersion: 1,
        payload: { userId: 'u-1' },
        correlationId: 'corr-1',
        occurredAt: NOW,
      },
    ];

    const result = await harness.useCase.execute();

    expect(harness.emailPort.sent).toHaveLength(0);
    expect(harness.outboxRepository.published).toHaveLength(0);
    expect(result.failures[0]?.id).toBe('e-1');
  });

  it('isaretleme coktugunde transaction geri alinir', async () => {
    const harness = createHarness();
    harness.outboxRepository.pending = [registeredRecord('e-1')];
    harness.outboxRepository.failOnMark = true;

    await expect(harness.useCase.execute()).rejects.toThrow('isaretleme hatasi');

    // E-posta gitti ama isaretleme geri alindi: kayit yeniden denenir ve ayni
    // e-posta bir kez daha gidebilir. ADR-0006 teslimatin at-least-once
    // oldugunu soyler; kaybolmasindansa tekrarlanmasi tercih edilir.
    expect(harness.emailPort.sent).toHaveLength(1);
    expect(harness.transactionManager.rolledBack).toBe(true);
  });
});
