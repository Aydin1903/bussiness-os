import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type DomainEvent } from '../../../shared/domain-event';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { UserId } from '../../../shared/user-id.value-object';
import { Email } from '../domain/email.value-object';
import { InvalidEmailError, TooManyVerificationRequestsError } from '../domain/identity.error';
import { PasswordResetCode } from '../domain/password-reset-code.entity';
import { PasswordResetCodeId } from '../domain/password-reset-code-id.value-object';
import { PasswordResetRequested } from '../domain/password-reset-requested.event';
import { User } from '../domain/user.entity';
import { VerificationCodeHash } from '../domain/verification-code-hash.value-object';
import { type VerificationCodeRequest } from '../domain/verification-code-request.entity';
import { RESEND_MAX_PER_IP_HOURLY } from '../domain/verification-resend-policy';
import { type PasswordResetCodeRepository } from './password-reset-code.repository.port';
import {
  RequestPasswordResetUseCase,
  type RequestPasswordResetDependencies,
} from './request-password-reset.use-case';
import { type UserRepository } from './user.repository.port';
import { type VerificationCodeGenerator } from './verification-code-generator.port';
import { type VerificationCodeHasher } from './verification-code-hasher.port';
import { type VerificationCodeRequestRepository } from './verification-code-request.repository.port';

const NOW = new Date('2026-07-22T10:00:00.000Z');
const NEW_CODE = '654321';
const OLD_CODE = '123456';
const EMAIL = Email.create('user@example.com');
const USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');
const CODE_ID = PasswordResetCodeId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000c1');
const IP = '203.0.113.10';

function digestOf(code: string): VerificationCodeHash {
  return VerificationCodeHash.fromDigest(code.padStart(64, '0'));
}

function activeUser(): User {
  const user = User.register({ id: USER_ID, email: EMAIL, createdAt: NOW });
  user.verifyEmail();
  return user;
}

class FakeUserRepository implements UserRepository {
  user: User | null = activeUser();
  findById(): Promise<User | null> {
    return Promise.resolve(this.user);
  }
  findByEmail(email: Email): Promise<User | null> {
    return Promise.resolve(this.user?.email.equals(email) === true ? this.user : null);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeResetCodeRepository implements PasswordResetCodeRepository {
  readonly saved: PasswordResetCode[] = [];
  active: PasswordResetCode | null = null;
  save(code: PasswordResetCode): Promise<void> {
    this.saved.push(code);
    return Promise.resolve();
  }
  findActiveByUserId(): Promise<PasswordResetCode | null> {
    return Promise.resolve(this.active !== null && !this.active.isConsumed ? this.active : null);
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
  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
  runInTenantTransaction<T>(_t: string, fn: () => Promise<T>): Promise<T> {
    return this.runInTransaction(fn);
  }
  runInCurrentTenantTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.runInTransaction(fn);
  }
}

class SequentialIdGenerator implements IdGenerator {
  #n = 1;
  nextId(): string {
    const suffix = String(this.#n).padStart(12, '0');
    this.#n += 1;
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
  readonly codeRepository: FakeResetCodeRepository;
  readonly requestRepository: FakeRequestRepository;
  readonly eventPublisher: FakeEventPublisher;
  readonly useCase: RequestPasswordResetUseCase;
}

function createHarness(): Harness {
  const userRepository = new FakeUserRepository();
  const codeRepository = new FakeResetCodeRepository();
  const requestRepository = new FakeRequestRepository();
  const eventPublisher = new FakeEventPublisher();

  const deps: RequestPasswordResetDependencies = {
    userRepository,
    passwordResetCodeRepository: codeRepository,
    requestRepository,
    verificationCodeGenerator: new FakeCodeGenerator(),
    verificationCodeHasher: new FakeCodeHasher(),
    eventPublisher,
    transactionManager: new FakeTransactionManager(),
    idGenerator: new SequentialIdGenerator(),
    clock: new FixedClock(),
  };

  return {
    userRepository,
    codeRepository,
    requestRepository,
    eventPublisher,
    useCase: new RequestPasswordResetUseCase(deps),
  };
}

function command(overrides: Partial<{ email: string; ipAddress: string }> = {}) {
  return { email: EMAIL.value, ipAddress: IP, correlationId: 'c-1', ...overrides };
}

describe('RequestPasswordResetUseCase — mutlu yol', () => {
  it('yeni kod uretir ve PasswordResetRequested yayinlar', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.codeRepository.saved.at(-1)?.codeHash.value).toBe(digestOf(NEW_CODE).value);
    const event = harness.eventPublisher.published[0];
    expect(event?.eventType).toBe(PasswordResetRequested.TYPE);
    expect(event?.payload).toMatchObject({ email: EMAIL.value, resetCode: NEW_CODE });
  });

  it('ONCEKI reset kodunu gecersizlestirir', async () => {
    const harness = createHarness();
    const previous = PasswordResetCode.issue({
      id: CODE_ID,
      userId: USER_ID,
      codeHash: digestOf(OLD_CODE),
      expiresAt: new Date(NOW.getTime() + 600_000),
    });
    harness.codeRepository.active = previous;

    await harness.useCase.execute(command());

    expect(previous.isConsumed).toBe(true);
  });

  it('istegi deftere yazar (oran sinirinin sayaci)', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.requestRepository.saved).toHaveLength(1);
    expect(harness.requestRepository.saved[0]?.ipAddress.value).toBe(IP);
  });
});

describe('RequestPasswordResetUseCase — P2 (hesap varligi sizmaz)', () => {
  it('bilinmeyen e-postada kod URETMEZ ama hata FIRLATMAZ + deftere yazar', async () => {
    const harness = createHarness();
    harness.userRepository.user = null;

    await expect(
      harness.useCase.execute(command({ email: 'yok@example.com' })),
    ).resolves.toBeUndefined();

    expect(harness.codeRepository.saved).toHaveLength(0);
    expect(harness.eventPublisher.published).toHaveLength(0);
    // Bilinmeyen adres de deftere yazilir; yoksa IP siniri atlatilirdi.
    expect(harness.requestRepository.saved).toHaveLength(1);
  });

  it('AKTIF OLMAYAN kullaniciya kod uretmez (pending/locked)', async () => {
    const harness = createHarness();
    // pending: henuz dogrulanmamis
    harness.userRepository.user = User.register({ id: USER_ID, email: EMAIL, createdAt: NOW });

    await harness.useCase.execute(command());

    expect(harness.eventPublisher.published).toHaveLength(0);
  });

  it('bekleme suresi dolmadan sessizce atlar (kod uretmez, hata yok)', async () => {
    const harness = createHarness();
    harness.requestRepository.lastRequestedAt = new Date(NOW.getTime() - 60_000); // 60 sn < 120

    await expect(harness.useCase.execute(command())).resolves.toBeUndefined();

    expect(harness.eventPublisher.published).toHaveLength(0);
  });
});

describe('RequestPasswordResetUseCase — IP siniri', () => {
  it('kaynak siniri asilinca 429 firlatir ama istek yine deftere yazilir', async () => {
    const harness = createHarness();
    harness.requestRepository.ipCount = RESEND_MAX_PER_IP_HOURLY;

    await expect(harness.useCase.execute(command())).rejects.toThrow(
      TooManyVerificationRequestsError,
    );
    expect(harness.requestRepository.saved).toHaveLength(1);
    expect(harness.eventPublisher.published).toHaveLength(0);
  });
});

describe('RequestPasswordResetUseCase — girdi bicimi', () => {
  it('gecersiz e-posta bicimini reddeder', async () => {
    const harness = createHarness();

    await expect(harness.useCase.execute(command({ email: 'gecersiz' }))).rejects.toThrow(
      InvalidEmailError,
    );
  });
});
