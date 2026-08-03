import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { EmailDeliveryError, type EmailMessage, type EmailPort } from '../../../shared/email.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  type IdentityOutboxRecord,
  type IdentityOutboxRepository,
  type OutboxDeliveryFailure,
} from './identity-outbox.repository.port';
import { MAX_DELIVERY_ATTEMPTS, RETRY_BASE_DELAY_MS } from './outbox-retry.policy';
import {
  PublishIdentityEventsUseCase,
  type PublishIdentityEventsDependencies,
} from './publish-identity-events.use-case';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

const NOW = new Date('2026-07-22T10:00:00.000Z');
const BATCH_SIZE = 10;

function registeredRecord(
  id: string,
  email = 'user@example.com',
  attemptCount = 0,
): IdentityOutboxRecord {
  return {
    id,
    eventType: 'user.registered',
    eventVersion: 1,
    payload: { userId: 'u-1', email, verificationCode: '123456' },
    correlationId: 'corr-1',
    occurredAt: NOW,
    attemptCount,
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
    attemptCount: 0,
  };
}

class FakeOutboxRepository implements IdentityOutboxRepository {
  pending: IdentityOutboxRecord[] = [];
  readonly published: string[] = [];
  claimedLimits: number[] = [];
  claimedAt: Date | null = null;
  publishedAt: Date | null = null;
  failOnMark = false;
  readonly recordedFailures: OutboxDeliveryFailure[] = [];

  claimPending(limit: number, now: Date): Promise<IdentityOutboxRecord[]> {
    this.claimedLimits.push(limit);
    this.claimedAt = now;
    return Promise.resolve(this.pending.slice(0, limit));
  }

  recordFailures(failures: readonly OutboxDeliveryFailure[]): Promise<void> {
    this.recordedFailures.push(...failures);
    return Promise.resolve();
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
  /** `true` ise hata KALICI olarak isaretlenir (gecersiz adres gibi). */
  permanentFailure = false;

  send(message: EmailMessage): Promise<void> {
    if (this.failFor === message.to) {
      return Promise.reject(
        this.permanentFailure
          ? new EmailDeliveryError('gecersiz alici', { permanent: true })
          : new EmailDeliveryError('saglayici reddetti', { permanent: false }),
      );
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

  /**
   * Ambient context bu testlerde kullanilmaz; sozlesme geregi bulunur.
   * Fail-closed davranisi gercek adapter'in entegrasyon testinde dogrulanir.
   */
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

  it('password_reset.requested icin sifirlama e-postasi gonderir', async () => {
    const harness = createHarness();
    harness.outboxRepository.pending = [
      {
        id: 'e-1',
        eventType: 'password_reset.requested',
        eventVersion: 1,
        payload: { userId: 'u-1', email: 'user@example.com', resetCode: '654321' },
        correlationId: 'c-1',
        occurredAt: NOW,
        attemptCount: 0,
      },
    ];

    const result = await harness.useCase.execute();

    expect(harness.emailPort.sent[0]?.to).toBe('user@example.com');
    expect(harness.emailPort.sent[0]?.textBody).toContain('654321');
    expect(result).toMatchObject({ delivered: 1, acknowledged: 1 });
  });

  it('user.password_changed icin BILGILENDIRME e-postasi gonderir (kod yok)', async () => {
    const harness = createHarness();
    harness.outboxRepository.pending = [
      {
        id: 'e-1',
        eventType: 'user.password_changed',
        eventVersion: 1,
        payload: { userId: 'u-1', email: 'user@example.com' },
        correlationId: 'c-1',
        occurredAt: NOW,
        attemptCount: 0,
      },
    ];

    const result = await harness.useCase.execute();

    expect(harness.emailPort.sent[0]?.to).toBe('user@example.com');
    expect(harness.emailPort.sent[0]?.textBody).not.toMatch(/\d{6}/);
    expect(result).toMatchObject({ delivered: 1 });
  });

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
      {
        id: 'e-1',
        eventType: 'user.registered',
        reason: 'saglayici reddetti',
        attemptCount: 1,
        deadLettered: false,
      },
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
        attemptCount: 0,
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

describe('PublishIdentityEventsUseCase — yeniden deneme ve backoff', () => {
  it('basarisizlikta sayaci artirir ve son hatayi YAZAR', async () => {
    const harness = createHarness();
    harness.emailPort.failFor = 'bozuk@example.com';
    harness.outboxRepository.pending = [registeredRecord('e-1', 'bozuk@example.com')];

    await harness.useCase.execute();

    // Yazilmasaydi sayac hic artmaz, backoff hic uygulanmaz ve kayit her turda
    // yeniden denenirdi — mekanizmanin tamami islevsiz kalirdi.
    expect(harness.outboxRepository.recordedFailures).toEqual([
      {
        id: 'e-1',
        attemptCount: 1,
        lastError: 'saglayici reddetti',
        nextAttemptAt: new Date(NOW.getTime() + RETRY_BASE_DELAY_MS),
        deadLetteredAt: null,
      },
    ]);
  });

  it('sonraki deneme anini USTEL olarak uzatir', async () => {
    const harness = createHarness();
    harness.emailPort.failFor = 'bozuk@example.com';
    // Kayit daha once 2 kez denenmis.
    harness.outboxRepository.pending = [registeredRecord('e-1', 'bozuk@example.com', 2)];

    await harness.useCase.execute();

    const failure = harness.outboxRepository.recordedFailures[0];
    expect(failure?.attemptCount).toBe(3);
    expect(failure?.nextAttemptAt).toEqual(new Date(NOW.getTime() + RETRY_BASE_DELAY_MS * 4));
  });

  it('basarisiz kaydi YAYINLANMIS olarak isaretlemez', async () => {
    const harness = createHarness();
    harness.emailPort.failFor = 'bozuk@example.com';
    harness.outboxRepository.pending = [registeredRecord('e-1', 'bozuk@example.com')];

    await harness.useCase.execute();

    expect(harness.outboxRepository.published).toHaveLength(0);
  });

  it('claim sirasinda SAATI gecirir (backoff suzgeci icin)', async () => {
    const harness = createHarness();

    await harness.useCase.execute();

    // Repository "zamani gelmemis" kayitlari bu degere gore eler.
    expect(harness.outboxRepository.claimedAt).toEqual(NOW);
  });
});

describe('PublishIdentityEventsUseCase — dead-letter', () => {
  it('SINIRA ulasan kaydi olu mektuba dusurur', async () => {
    const harness = createHarness();
    harness.emailPort.failFor = 'bozuk@example.com';
    harness.outboxRepository.pending = [
      registeredRecord('e-1', 'bozuk@example.com', MAX_DELIVERY_ATTEMPTS - 1),
    ];

    const result = await harness.useCase.execute();

    const failure = harness.outboxRepository.recordedFailures[0];
    expect(failure?.deadLetteredAt).toEqual(NOW);
    // Olu kayit yeniden denenmez: backoff ani YAZILMAZ.
    expect(failure?.nextAttemptAt).toBeNull();
    expect(result.deadLettered).toBe(1);
  });

  it('KALICI hatayi ILK denemede olu mektuba dusurur', async () => {
    const harness = createHarness();
    harness.emailPort.failFor = 'gecersiz@example.com';
    harness.emailPort.permanentFailure = true;
    harness.outboxRepository.pending = [registeredRecord('e-1', 'gecersiz@example.com')];

    const result = await harness.useCase.execute();

    // Gecersiz bir adresi 5 kez denemek kuyrugu bosuna mesgul eder ve
    // ARKASINDAKI gecerli e-postalari geciktirirdi.
    expect(harness.outboxRepository.recordedFailures[0]).toMatchObject({
      attemptCount: 1,
      deadLetteredAt: NOW,
      nextAttemptAt: null,
    });
    expect(result.deadLettered).toBe(1);
  });

  it('olu mektuba dusen kaydi ALARM icin sonucta bildirir', async () => {
    const harness = createHarness();
    harness.emailPort.failFor = 'gecersiz@example.com';
    harness.emailPort.permanentFailure = true;
    harness.outboxRepository.pending = [registeredRecord('e-1', 'gecersiz@example.com')];

    const result = await harness.useCase.execute();

    expect(result.failures[0]).toMatchObject({ id: 'e-1', deadLettered: true, attemptCount: 1 });
  });

  it('GECICI hata sinirin altindayken olu mektuba DUSMEZ', async () => {
    const harness = createHarness();
    harness.emailPort.failFor = 'bozuk@example.com';
    harness.outboxRepository.pending = [registeredRecord('e-1', 'bozuk@example.com')];

    const result = await harness.useCase.execute();

    expect(harness.outboxRepository.recordedFailures[0]?.deadLetteredAt).toBeNull();
    expect(result.deadLettered).toBe(0);
  });

  it('bozuk payload GECICI sayilir — gecerli bir e-posta kaybedilmez', async () => {
    const harness = createHarness();
    harness.outboxRepository.pending = [
      {
        id: 'e-1',
        eventType: 'user.registered',
        eventVersion: 1,
        payload: { userId: 'u-1' },
        correlationId: 'corr-1',
        occurredAt: NOW,
        attemptCount: 0,
      },
    ];

    await harness.useCase.execute();

    // Bilinmeyen hata kalici SAYILMAZ: gecici sanip denemek birkac tur israf
    // eder, kalici sanip atmak gecerli bir e-postayi kaybederdi.
    expect(harness.outboxRepository.recordedFailures[0]?.deadLetteredAt).toBeNull();
  });
});
