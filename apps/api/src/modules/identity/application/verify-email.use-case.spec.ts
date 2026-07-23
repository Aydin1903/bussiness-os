import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type DomainEvent } from '../../../shared/domain-event';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { UserId } from '../../../shared/user-id.value-object';
import { Email } from '../domain/email.value-object';
import {
  EmailVerificationCode,
  MAX_VERIFICATION_ATTEMPTS,
} from '../domain/email-verification-code.entity';
import { EmailVerificationCodeId } from '../domain/email-verification-code-id.value-object';
import { InvalidEmailError } from '../domain/identity.error';
import { User } from '../domain/user.entity';
import { UserEmailVerified } from '../domain/user-email-verified.event';
import { VerificationCodeHash } from '../domain/verification-code-hash.value-object';
import { type EmailVerificationCodeRepository } from './email-verification-code.repository.port';
import { type UserRepository } from './user.repository.port';
import { type VerificationCodeHasher } from './verification-code-hasher.port';
import { VerifyEmailUseCase, type VerifyEmailDependencies } from './verify-email.use-case';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

const NOW = new Date('2026-07-22T10:00:00.000Z');
const TTL_MS = 15 * 60_000;
const CODE = '123456';
const WRONG_CODE = '999999';
const CORRELATION_ID = 'corr-1';
const EMAIL = Email.create('user@example.com');
const USER_ID_VALUE = '018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c';
const USER_ID = UserId.create(USER_ID_VALUE);
const CODE_ID = EmailVerificationCodeId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000c1');

/** Cagri SIRASINI kaydeder: sayacin HMAC'ten once arttigini kanitlamak icin. */
type CallLog = string[];

function digestOf(code: string): VerificationCodeHash {
  return VerificationCodeHash.fromDigest(code.padStart(64, '0'));
}

class FakeUserRepository implements UserRepository {
  readonly saved: User[] = [];
  user: User | null = null;

  findById(): Promise<User | null> {
    return Promise.resolve(this.user);
  }

  findByEmail(email: Email): Promise<User | null> {
    return Promise.resolve(this.user?.email.equals(email) === true ? this.user : null);
  }

  save(user: User): Promise<void> {
    this.saved.push(user);
    return Promise.resolve();
  }
}

/**
 * Sayaci ENTITY'DEN AYRI tutar — tipki veritabani gibi.
 *
 * `attemptCountInDatabase` otoritedir; boylece "hata dondu ama sayac arttir"
 * iddiasi entity uzerinden degil, kalici degeri temsil eden alan uzerinden
 * dogrulanabilir.
 */
class FakeCodeRepository implements EmailVerificationCodeRepository {
  readonly saved: EmailVerificationCode[] = [];
  code: EmailVerificationCode | null = null;
  attemptCountInDatabase = 0;
  rowMissing = false;

  constructor(private readonly calls: CallLog) {}

  save(code: EmailVerificationCode): Promise<void> {
    this.saved.push(code);
    return Promise.resolve();
  }

  findActiveByUserId(): Promise<EmailVerificationCode | null> {
    // Gercek repository yalnizca `consumed_at IS NULL` filtreler.
    const active = this.code !== null && !this.code.isConsumed ? this.code : null;
    return Promise.resolve(active);
  }

  incrementAttemptCount(): Promise<number | null> {
    this.calls.push('increment');
    if (this.rowMissing) {
      return Promise.resolve(null);
    }

    this.attemptCountInDatabase += 1;
    return Promise.resolve(this.attemptCountInDatabase);
  }
}

class FakeCodeHasher implements VerificationCodeHasher {
  constructor(private readonly calls: CallLog) {}

  hash(code: string): VerificationCodeHash {
    return digestOf(code);
  }

  verify(code: string, hash: VerificationCodeHash): boolean {
    this.calls.push('verify');
    return hash.value === digestOf(code).value;
  }
}

class FakeEventPublisher implements DomainEventPublisher {
  readonly published: DomainEvent[] = [];

  publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
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

class SequentialIdGenerator implements IdGenerator {
  #next = 1;

  nextId(): string {
    const suffix = String(this.#next).padStart(12, '0');
    this.#next += 1;
    return `018f3a2b-7c4d-7e1f-8a2b-${suffix}`;
  }
}

class FixedClock implements Clock {
  now(): Date {
    return new Date(NOW.getTime());
  }
}

interface Harness {
  readonly userRepository: FakeUserRepository;
  readonly codeRepository: FakeCodeRepository;
  readonly eventPublisher: FakeEventPublisher;
  readonly transactionManager: FakeTransactionManager;
  readonly calls: CallLog;
  readonly useCase: VerifyEmailUseCase;
}

function pendingUser(): User {
  return User.register({ id: USER_ID, email: EMAIL, createdAt: NOW });
}

function activeCode(): EmailVerificationCode {
  return EmailVerificationCode.issue({
    id: CODE_ID,
    userId: USER_ID,
    codeHash: digestOf(CODE),
    expiresAt: new Date(NOW.getTime() + TTL_MS),
  });
}

function codeFrom(overrides: {
  attemptCount?: number;
  expiresAt?: Date;
  consumedAt?: Date | null;
}): EmailVerificationCode {
  return EmailVerificationCode.fromPersistence({
    id: CODE_ID,
    userId: USER_ID,
    codeHash: digestOf(CODE),
    attemptCount: overrides.attemptCount ?? 0,
    expiresAt: overrides.expiresAt ?? new Date(NOW.getTime() + TTL_MS),
    consumedAt: overrides.consumedAt ?? null,
  });
}

function createHarness(): Harness {
  const calls: CallLog = [];
  const userRepository = new FakeUserRepository();
  const codeRepository = new FakeCodeRepository(calls);
  const eventPublisher = new FakeEventPublisher();
  const transactionManager = new FakeTransactionManager();

  const deps: VerifyEmailDependencies = {
    userRepository,
    verificationCodeRepository: codeRepository,
    verificationCodeHasher: new FakeCodeHasher(calls),
    eventPublisher,
    transactionManager,
    idGenerator: new SequentialIdGenerator(),
    clock: new FixedClock(),
  };

  userRepository.user = pendingUser();
  codeRepository.code = activeCode();

  return {
    userRepository,
    codeRepository,
    eventPublisher,
    transactionManager,
    calls,
    useCase: new VerifyEmailUseCase(deps),
  };
}

function command(overrides: Partial<{ email: string; code: string }> = {}) {
  return {
    email: EMAIL.value,
    code: CODE,
    correlationId: CORRELATION_ID,
    ...overrides,
  };
}

describe('VerifyEmailUseCase — basarili dogrulama', () => {
  it('kullaniciyi aktif ve dogrulanmis yapar', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute(command());

    expect(result.outcome).toBe('verified');
    expect(harness.userRepository.saved[0]?.status).toBe('active');
    expect(harness.userRepository.saved[0]?.emailVerified).toBe(true);
  });

  it('kodu tuketir — ikinci kez kullanilamaz', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.codeRepository.saved[0]?.isConsumed).toBe(true);
    expect(harness.codeRepository.saved[0]?.consumedAt).toEqual(NOW);
  });

  it('UserEmailVerified event ini tenant siz yayinlar', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    const event = harness.eventPublisher.published[0];
    expect(harness.eventPublisher.published).toHaveLength(1);
    expect(event?.eventType).toBe(UserEmailVerified.TYPE);
    expect(event?.tenantId).toBeNull();
    expect(event?.correlationId).toBe(CORRELATION_ID);
    expect(event?.payload).toEqual({ userId: USER_ID_VALUE });
  });

  it('hepsini TEK transaction da yazar', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.transactionManager.opened).toBe(1);
    expect(harness.transactionManager.rolledBack).toBe(false);
  });

  it('SON denemede (5.) dogru kod hala kabul edilir', async () => {
    const harness = createHarness();
    harness.codeRepository.code = codeFrom({ attemptCount: MAX_VERIFICATION_ATTEMPTS - 1 });
    harness.codeRepository.attemptCountInDatabase = MAX_VERIFICATION_ATTEMPTS - 1;

    const result = await harness.useCase.execute(command());

    // Sinir "5 yanlis deneme"dir; 5. deneme HARCANIR ama reddedilmez.
    expect(result.outcome).toBe('verified');
    expect(harness.codeRepository.attemptCountInDatabase).toBe(MAX_VERIFICATION_ATTEMPTS);
  });
});

describe('VerifyEmailUseCase — yanlis kod ve sayac', () => {
  it('yanlis kodu reddeder ama sayac artisini KALICI kilar', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute(command({ code: WRONG_CODE }));

    expect(result.outcome).toBe('invalid');
    // Kritik: red bir exception ile bildirilseydi transaction geri alinir ve
    // sayac artisi silinirdi (ADR-0019 §7.3).
    expect(harness.codeRepository.attemptCountInDatabase).toBe(1);
    expect(harness.transactionManager.rolledBack).toBe(false);
  });

  it('sayaci HMAC kiyasindan ONCE artirir', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command({ code: WRONG_CODE }));

    // Kiyas once yapilsaydi dogru kodu bulan saldirgan deneme harcamazdi.
    expect(harness.calls).toEqual(['increment', 'verify']);
  });

  it('yanlis kodda kullaniciyi ve kodu DEGISTIRMEZ', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command({ code: WRONG_CODE }));

    expect(harness.userRepository.saved).toHaveLength(0);
    expect(harness.codeRepository.saved).toHaveLength(0);
    expect(harness.eventPublisher.published).toHaveLength(0);
  });

  it('sayac satiri kaybolduysa reddeder', async () => {
    const harness = createHarness();
    harness.codeRepository.rowMissing = true;

    const result = await harness.useCase.execute(command());

    expect(result.outcome).toBe('invalid');
    expect(harness.eventPublisher.published).toHaveLength(0);
  });

  it('es zamanli istekler sinirin uzerine cikardiysa reddeder', async () => {
    const harness = createHarness();
    // Entity okundugunda hak vardi; artis sirasinda sinir asilmis.
    harness.codeRepository.attemptCountInDatabase = MAX_VERIFICATION_ATTEMPTS;

    const result = await harness.useCase.execute(command());

    expect(result.outcome).toBe('invalid');
    expect(harness.eventPublisher.published).toHaveLength(0);
  });
});

describe('VerifyEmailUseCase — kod kullanilamaz durumdayken sayac HARCANMAZ', () => {
  it('suresi dolmus kodu reddeder', async () => {
    const harness = createHarness();
    harness.codeRepository.code = codeFrom({ expiresAt: new Date(NOW.getTime() - 1) });

    const result = await harness.useCase.execute(command());

    expect(result.outcome).toBe('invalid');
    // §7.5: "kod yok / suresi dolmus" dali sayaca DOKUNMADAN reddeder.
    expect(harness.calls).toEqual([]);
  });

  it('tuketilmis kodu reddeder', async () => {
    const harness = createHarness();
    harness.codeRepository.code = codeFrom({ consumedAt: NOW });

    const result = await harness.useCase.execute(command());

    expect(result.outcome).toBe('invalid');
    expect(harness.calls).toEqual([]);
  });

  it('hakki tukenmis kodu reddeder', async () => {
    const harness = createHarness();
    harness.codeRepository.code = codeFrom({ attemptCount: MAX_VERIFICATION_ATTEMPTS });

    const result = await harness.useCase.execute(command());

    expect(result.outcome).toBe('invalid');
    expect(harness.calls).toEqual([]);
  });

  it('aktif kod yoksa reddeder', async () => {
    const harness = createHarness();
    harness.codeRepository.code = null;

    const result = await harness.useCase.execute(command());

    expect(result.outcome).toBe('invalid');
  });
});

describe('VerifyEmailUseCase — kullanici durumu kapisi', () => {
  it('bilinmeyen e-postayi reddeder ve hicbir sey degistirmez', async () => {
    const harness = createHarness();
    harness.userRepository.user = null;

    const result = await harness.useCase.execute(command({ email: 'yok@example.com' }));

    expect(result.outcome).toBe('invalid');
    expect(harness.calls).toEqual([]);
    expect(harness.userRepository.saved).toHaveLength(0);
  });

  it('ZATEN dogrulanmis kullaniciyi reddeder (idempotent basari DEGIL)', async () => {
    const harness = createHarness();
    const user = pendingUser();
    user.verifyEmail();
    harness.userRepository.user = user;

    const result = await harness.useCase.execute(command());

    // Idempotent 200 donseydi RASTGELE bir kodla da 200 alinir ve uc nokta
    // "bu e-posta dogrulanmis mi" oracle'ina donerdi (P2).
    expect(result.outcome).toBe('invalid');
    expect(harness.eventPublisher.published).toHaveLength(0);
  });

  it('KILITLI kullaniciyi reddeder — dogru kod bile kilidi ACMAZ', async () => {
    const harness = createHarness();
    const user = pendingUser();
    user.verifyEmail();
    user.lock();
    harness.userRepository.user = user;

    const result = await harness.useCase.execute(command());

    // `locked -> active` gecisi grafikte SERBEST; kapi olmasaydi dogrulama
    // sessizce kilit acardi.
    expect(result.outcome).toBe('invalid');
    expect(user.status).toBe('locked');
    expect(harness.userRepository.saved).toHaveLength(0);
  });

  it('KAPATILMIS kullaniciyi reddeder — hata FIRLATMAZ', async () => {
    const harness = createHarness();
    const user = pendingUser();
    user.deactivate();
    harness.userRepository.user = user;

    // Kapi olmasaydi `verifyEmail()` gecis hatasi firlatir ve 500 uretirdi.
    await expect(harness.useCase.execute(command())).resolves.toEqual({ outcome: 'invalid' });
  });
});

describe('VerifyEmailUseCase — tum redler AYIRT EDILEMEZ', () => {
  it('butun red sebepleri AYNI sonucu dondurur', async () => {
    const outcomes: string[] = [];

    const scenarios: (() => Harness)[] = [
      () => {
        const harness = createHarness();
        harness.userRepository.user = null;
        return harness;
      },
      () => {
        const harness = createHarness();
        harness.codeRepository.code = null;
        return harness;
      },
      () => {
        const harness = createHarness();
        harness.codeRepository.code = codeFrom({ expiresAt: new Date(NOW.getTime() - 1) });
        return harness;
      },
      () => {
        const harness = createHarness();
        harness.codeRepository.code = codeFrom({ attemptCount: MAX_VERIFICATION_ATTEMPTS });
        return harness;
      },
      createHarness,
    ];

    for (const [index, build] of scenarios.entries()) {
      const harness = build();
      // Son senaryo: gecerli kurulum ama YANLIS kod.
      const body = index === scenarios.length - 1 ? command({ code: WRONG_CODE }) : command();
      outcomes.push((await harness.useCase.execute(body)).outcome);
    }

    expect(outcomes).toEqual(['invalid', 'invalid', 'invalid', 'invalid', 'invalid']);
  });
});

describe('VerifyEmailUseCase — girdi bicimi', () => {
  it('gecersiz e-posta bicimini reddeder ve transaction HIC ACMAZ', async () => {
    const harness = createHarness();

    await expect(harness.useCase.execute(command({ email: 'gecersiz' }))).rejects.toThrow(
      InvalidEmailError,
    );

    // Bicim hatasi 422'dir ve hesabin varligiyla ilgisizdir — sizinti yok.
    expect(harness.transactionManager.opened).toBe(0);
  });
});
