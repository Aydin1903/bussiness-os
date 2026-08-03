import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type DomainEvent } from '../../../shared/domain-event';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { UserId } from '../../../shared/user-id.value-object';
import { Email } from '../domain/email.value-object';
import { EmailVerificationCode } from '../domain/email-verification-code.entity';
import { EmailVerificationCodeId } from '../domain/email-verification-code-id.value-object';
import { InvalidEmailError, TooManyVerificationRequestsError } from '../domain/identity.error';
import { User } from '../domain/user.entity';
import { UserRegistered } from '../domain/user-registered.event';
import { VerificationCodeHash } from '../domain/verification-code-hash.value-object';
import { type VerificationCodeRequest } from '../domain/verification-code-request.entity';
import {
  RESEND_MAX_PER_ACCOUNT_HOURLY,
  RESEND_MAX_PER_IP_HOURLY,
} from '../domain/verification-resend-policy';
import { type EmailVerificationCodeRepository } from './email-verification-code.repository.port';
import {
  ResendVerificationUseCase,
  type ResendVerificationDependencies,
} from './resend-verification.use-case';
import { type UserRepository } from './user.repository.port';
import { type VerificationCodeGenerator } from './verification-code-generator.port';
import { type VerificationCodeHasher } from './verification-code-hasher.port';
import { type VerificationCodeRequestRepository } from './verification-code-request.repository.port';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

const NOW = new Date('2026-07-22T10:00:00.000Z');
const TTL_MS = 15 * 60_000;
const NEW_CODE = '654321';
const OLD_CODE = '123456';
const EMAIL = Email.create('user@example.com');
const USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');
const CODE_ID = EmailVerificationCodeId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000c1');
const IP = '203.0.113.10';

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

class FakeCodeRepository implements EmailVerificationCodeRepository {
  readonly saved: EmailVerificationCode[] = [];
  active: EmailVerificationCode | null = null;

  save(code: EmailVerificationCode): Promise<void> {
    this.saved.push(code);
    return Promise.resolve();
  }

  findActiveByUserId(): Promise<EmailVerificationCode | null> {
    const value = this.active !== null && !this.active.isConsumed ? this.active : null;
    return Promise.resolve(value);
  }

  incrementAttemptCount(): Promise<number | null> {
    return Promise.resolve(null);
  }
}

class FakeRequestRepository implements VerificationCodeRequestRepository {
  readonly saved: VerificationCodeRequest[] = [];
  lastRequestedAt: Date | null = null;
  accountCount = 0;
  ipCount = 0;

  save(request: VerificationCodeRequest): Promise<void> {
    this.saved.push(request);
    return Promise.resolve();
  }

  findLastRequestedAt(): Promise<Date | null> {
    return Promise.resolve(this.lastRequestedAt);
  }

  countByEmail(): Promise<number> {
    return Promise.resolve(this.accountCount);
  }

  countByIp(): Promise<number> {
    return Promise.resolve(this.ipCount);
  }
}

class FakeCodeGenerator implements VerificationCodeGenerator {
  generate(): string {
    return NEW_CODE;
  }
}

class FakeCodeHasher implements VerificationCodeHasher {
  hash(code: string): VerificationCodeHash {
    return digestOf(code);
  }

  verify(code: string, hash: VerificationCodeHash): boolean {
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

  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    this.opened += 1;
    return fn();
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
  readonly requestRepository: FakeRequestRepository;
  readonly eventPublisher: FakeEventPublisher;
  readonly useCase: ResendVerificationUseCase;
}

function pendingUser(): User {
  return User.register({ id: USER_ID, email: EMAIL, createdAt: NOW });
}

function activeCode(): EmailVerificationCode {
  return EmailVerificationCode.issue({
    id: CODE_ID,
    userId: USER_ID,
    codeHash: digestOf(OLD_CODE),
    expiresAt: new Date(NOW.getTime() + TTL_MS),
  });
}

function createHarness(): Harness {
  const userRepository = new FakeUserRepository();
  const codeRepository = new FakeCodeRepository();
  const requestRepository = new FakeRequestRepository();
  const eventPublisher = new FakeEventPublisher();

  const deps: ResendVerificationDependencies = {
    userRepository,
    verificationCodeRepository: codeRepository,
    requestRepository,
    verificationCodeGenerator: new FakeCodeGenerator(),
    verificationCodeHasher: new FakeCodeHasher(),
    eventPublisher,
    transactionManager: new FakeTransactionManager(),
    idGenerator: new SequentialIdGenerator(),
    clock: new FixedClock(),
  };

  userRepository.user = pendingUser();
  codeRepository.active = activeCode();

  return {
    userRepository,
    codeRepository,
    requestRepository,
    eventPublisher,
    useCase: new ResendVerificationUseCase(deps),
  };
}

function command(overrides: Partial<{ email: string; ipAddress: string }> = {}) {
  return {
    email: EMAIL.value,
    ipAddress: IP,
    correlationId: 'corr-1',
    ...overrides,
  };
}

describe('ResendVerificationUseCase — mutlu yol', () => {
  it('yeni kod uretir ve kaydeder', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    const issued = harness.codeRepository.saved.at(-1);
    expect(issued?.codeHash.value).toBe(digestOf(NEW_CODE).value);
    expect(issued?.expiresAt).toEqual(new Date(NOW.getTime() + TTL_MS));
  });

  it('ONCEKI kodu gecersizlestirir', async () => {
    const harness = createHarness();
    const previous = harness.codeRepository.active;

    await harness.useCase.execute(command());

    // ADR-0019: ayni anda gecerli kod BIR tanedir.
    expect(previous?.isConsumed).toBe(true);
    expect(harness.codeRepository.saved[0]?.id.value).toBe(CODE_ID.value);
  });

  it('teslimat icin UserRegistered event i yayinlar', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    const event = harness.eventPublisher.published[0];
    expect(event?.eventType).toBe(UserRegistered.TYPE);
    expect(event?.payload).toMatchObject({ email: EMAIL.value, verificationCode: NEW_CODE });
  });

  it('aktif kod yoksa da yeni kod uretir', async () => {
    const harness = createHarness();
    harness.codeRepository.active = null;

    await harness.useCase.execute(command());

    expect(harness.codeRepository.saved).toHaveLength(1);
    expect(harness.eventPublisher.published).toHaveLength(1);
  });
});

describe('ResendVerificationUseCase — defter her zaman yazilir', () => {
  it('istegi deftere yazar', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.requestRepository.saved).toHaveLength(1);
    expect(harness.requestRepository.saved[0]?.ipAddress.value).toBe(IP);
  });

  it('BILINMEYEN e-posta icin de deftere yazar', async () => {
    const harness = createHarness();
    harness.userRepository.user = null;

    await harness.useCase.execute(command({ email: 'yok@example.com' }));

    // Kritik: yazilmasaydi saldirgan bilinmeyen adreslerle sinirsiz istek yapar
    // ve IP siniri numaralandirmaya karsi islevsiz kalirdi.
    expect(harness.requestRepository.saved).toHaveLength(1);
    expect(harness.eventPublisher.published).toHaveLength(0);
  });

  it('sinir asildiginda da deftere yazar', async () => {
    const harness = createHarness();
    harness.requestRepository.ipCount = RESEND_MAX_PER_IP_HOURLY;

    await expect(harness.useCase.execute(command())).rejects.toThrow(
      TooManyVerificationRequestsError,
    );

    // Sinir asan istekler sayilmazsa sinir kendi kendini gevsetirdi.
    expect(harness.requestRepository.saved).toHaveLength(1);
  });
});

describe('ResendVerificationUseCase — hesap sinirlari SESSIZ', () => {
  it('bekleme suresi dolmadan kod URETMEZ ama hata da FIRLATMAZ', async () => {
    const harness = createHarness();
    harness.requestRepository.lastRequestedAt = new Date(NOW.getTime() - 30_000);

    await expect(harness.useCase.execute(command())).resolves.toBeUndefined();

    expect(harness.codeRepository.saved).toHaveLength(0);
    expect(harness.eventPublisher.published).toHaveLength(0);
  });

  it('saatlik hesap siniri dolduysa sessizce atlar', async () => {
    const harness = createHarness();
    harness.requestRepository.accountCount = RESEND_MAX_PER_ACCOUNT_HOURLY;

    await expect(harness.useCase.execute(command())).resolves.toBeUndefined();

    expect(harness.eventPublisher.published).toHaveLength(0);
  });

  it('sessiz atlamada ONCEKI kod gecerli KALIR', async () => {
    const harness = createHarness();
    const previous = harness.codeRepository.active;
    harness.requestRepository.lastRequestedAt = new Date(NOW.getTime() - 1_000);

    await harness.useCase.execute(command());

    // Aksi halde "cok sik istedim" diyen kullanici elindeki gecerli kodu da
    // kaybederdi.
    expect(previous?.isConsumed).toBe(false);
  });
});

describe('ResendVerificationUseCase — IP siniri', () => {
  it('kaynak siniri asildiginda 429 hatasini firlatir', async () => {
    const harness = createHarness();
    harness.requestRepository.ipCount = RESEND_MAX_PER_IP_HOURLY;

    await expect(harness.useCase.execute(command())).rejects.toThrow(
      TooManyVerificationRequestsError,
    );

    expect(harness.eventPublisher.published).toHaveLength(0);
  });
});

describe('ResendVerificationUseCase — hesap durumu (P2)', () => {
  it('bilinmeyen e-postada sessizce vazgecer', async () => {
    const harness = createHarness();
    harness.userRepository.user = null;

    await expect(
      harness.useCase.execute(command({ email: 'yok@example.com' })),
    ).resolves.toBeUndefined();

    expect(harness.codeRepository.saved).toHaveLength(0);
  });

  it('ZATEN dogrulanmis hesaba yeni kod uretmez', async () => {
    const harness = createHarness();
    const user = pendingUser();
    user.verifyEmail();
    harness.userRepository.user = user;

    await harness.useCase.execute(command());

    expect(harness.eventPublisher.published).toHaveLength(0);
  });

  it('KAPATILMIS hesaba yeni kod uretmez', async () => {
    const harness = createHarness();
    const user = pendingUser();
    user.deactivate();
    harness.userRepository.user = user;

    await expect(harness.useCase.execute(command())).resolves.toBeUndefined();

    expect(harness.eventPublisher.published).toHaveLength(0);
  });
});

describe('ResendVerificationUseCase — girdi bicimi', () => {
  it('gecersiz e-posta bicimini reddeder', async () => {
    const harness = createHarness();

    await expect(harness.useCase.execute(command({ email: 'gecersiz' }))).rejects.toThrow(
      InvalidEmailError,
    );

    expect(harness.requestRepository.saved).toHaveLength(0);
  });

  it('gecersiz IP bicimini reddeder', async () => {
    const harness = createHarness();

    await expect(harness.useCase.execute(command({ ipAddress: 'ip-degil' }))).rejects.toThrow();
  });
});
