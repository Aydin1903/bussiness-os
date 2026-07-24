import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type DomainEvent } from '../../../shared/domain-event';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { UserId } from '../../../shared/user-id.value-object';
import { Credential } from '../domain/credential.entity';
import { Email } from '../domain/email.value-object';
import { PasswordPolicyError } from '../domain/identity.error';
import {
  MAX_PASSWORD_RESET_ATTEMPTS,
  PasswordResetCode,
} from '../domain/password-reset-code.entity';
import { PasswordResetCodeId } from '../domain/password-reset-code-id.value-object';
import { PasswordHash } from '../domain/password-hash.value-object';
import { type TokenFamily } from '../domain/token-family.entity';
import { type TokenFamilyRevocationReason } from '../domain/token-family-revocation-reason.value-object';
import { User } from '../domain/user.entity';
import { UserPasswordChanged } from '../domain/user-password-changed.event';
import { VerificationCodeHash } from '../domain/verification-code-hash.value-object';
import { type CredentialRepository } from './credential.repository.port';
import { type PasswordHasher } from './password-hasher.port';
import { type PasswordResetCodeRepository } from './password-reset-code.repository.port';
import { ResetPasswordUseCase, type ResetPasswordDependencies } from './reset-password.use-case';
import { type TokenFamilyRepository } from './token-family.repository.port';
import { type UserRepository } from './user.repository.port';
import { type VerificationCodeHasher } from './verification-code-hasher.port';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

const NOW = new Date('2026-07-22T10:00:00.000Z');
const TTL_MS = 10 * 60_000;
const CODE = '123456';
const WRONG_CODE = '999999';
const NEW_PASSWORD = 'yeniparola9';
const EMAIL = Email.create('user@example.com');
const USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');
const CODE_ID = PasswordResetCodeId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000c1');

function phcFor(password: string): string {
  const encoded = Buffer.from(password, 'utf8').toString('base64').replace(/=+$/, '');
  return `$argon2id$v=19$m=19456,t=2,p=1$${encoded}$${encoded}`;
}

function digestOf(code: string): VerificationCodeHash {
  return VerificationCodeHash.fromDigest(code.padStart(64, '0'));
}

type CallLog = string[];

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

class FakeCredentialRepository implements CredentialRepository {
  readonly saved: Credential[] = [];
  credential: Credential | null = Credential.create({
    userId: USER_ID,
    passwordHash: PasswordHash.fromHash(phcFor('eskiparola1')),
    createdAt: NOW,
  });

  findByUserId(): Promise<Credential | null> {
    return Promise.resolve(this.credential);
  }
  save(credential: Credential): Promise<void> {
    this.saved.push(credential);
    return Promise.resolve();
  }
}

class FakeResetCodeRepository implements PasswordResetCodeRepository {
  readonly saved: PasswordResetCode[] = [];
  code: PasswordResetCode | null = null;
  attemptCountInDatabase = 0;
  rowMissing = false;

  constructor(private readonly calls: CallLog) {}

  save(code: PasswordResetCode): Promise<void> {
    this.saved.push(code);
    return Promise.resolve();
  }
  findActiveByUserId(): Promise<PasswordResetCode | null> {
    return Promise.resolve(this.code !== null && !this.code.isConsumed ? this.code : null);
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

class FakeTokenFamilyRepository implements TokenFamilyRepository {
  readonly bulkRevocations: { userId: string; reason: TokenFamilyRevocationReason }[] = [];

  findById(): Promise<TokenFamily | null> {
    return Promise.resolve(null);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  revokeAllActiveByUserId(
    userId: UserId,
    reason: TokenFamilyRevocationReason,
  ): Promise<number> {
    this.bulkRevocations.push({ userId: userId.value, reason });
    return Promise.resolve(2);
  }
}

class FakePasswordHasher implements PasswordHasher {
  readonly hashed: string[] = [];
  hash(plainPassword: string): Promise<PasswordHash> {
    this.hashed.push(plainPassword);
    return Promise.resolve(PasswordHash.fromHash(phcFor(plainPassword)));
  }
  verify(): Promise<boolean> {
    return Promise.resolve(false);
  }
  needsRehash(): boolean {
    return false;
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
  readonly credentialRepository: FakeCredentialRepository;
  readonly codeRepository: FakeResetCodeRepository;
  readonly tokenFamilyRepository: FakeTokenFamilyRepository;
  readonly eventPublisher: FakeEventPublisher;
  readonly passwordHasher: FakePasswordHasher;
  readonly calls: CallLog;
  readonly useCase: ResetPasswordUseCase;
}

function activeCode(): PasswordResetCode {
  return PasswordResetCode.issue({
    id: CODE_ID,
    userId: USER_ID,
    codeHash: digestOf(CODE),
    expiresAt: new Date(NOW.getTime() + TTL_MS),
  });
}

function createHarness(): Harness {
  const calls: CallLog = [];
  const userRepository = new FakeUserRepository();
  const credentialRepository = new FakeCredentialRepository();
  const codeRepository = new FakeResetCodeRepository(calls);
  const tokenFamilyRepository = new FakeTokenFamilyRepository();
  const eventPublisher = new FakeEventPublisher();
  const passwordHasher = new FakePasswordHasher();

  const deps: ResetPasswordDependencies = {
    userRepository,
    credentialRepository,
    passwordResetCodeRepository: codeRepository,
    tokenFamilyRepository,
    passwordHasher,
    verificationCodeHasher: new FakeCodeHasher(calls),
    eventPublisher,
    transactionManager: new FakeTransactionManager(),
    idGenerator: new SequentialIdGenerator(),
    clock: new FixedClock(),
  };

  codeRepository.code = activeCode();

  return {
    userRepository,
    credentialRepository,
    codeRepository,
    tokenFamilyRepository,
    eventPublisher,
    passwordHasher,
    calls,
    useCase: new ResetPasswordUseCase(deps),
  };
}

function command(overrides: Partial<{ email: string; code: string; password: string }> = {}) {
  return { email: EMAIL.value, code: CODE, password: NEW_PASSWORD, correlationId: 'c-1', ...overrides };
}

describe('ResetPasswordUseCase — basari', () => {
  it('parolayi degistirir ve sonuc "reset" doner', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute(command());

    expect(result.outcome).toBe('reset');
    expect(harness.credentialRepository.saved[0]?.passwordHash.value).toBe(phcFor(NEW_PASSWORD));
  });

  it('kodu tuketir', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.codeRepository.saved.at(-1)?.isConsumed).toBe(true);
  });

  it('TUM refresh ailelerini "password-changed" ile iptal eder', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.tokenFamilyRepository.bulkRevocations).toEqual([
      { userId: USER_ID.value, reason: 'password-changed' },
    ]);
  });

  it('UserPasswordChanged event ini (bilgilendirme) yayinlar', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    const event = harness.eventPublisher.published[0];
    expect(event?.eventType).toBe(UserPasswordChanged.TYPE);
    expect(event?.payload).toEqual({ userId: USER_ID.value, email: EMAIL.value });
  });
});

describe('ResetPasswordUseCase — yanlis kod ve sayac', () => {
  it('yanlis kodu reddeder ama sayac artisi KALICI (transaction geri alinmaz)', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute(command({ code: WRONG_CODE }));

    expect(result.outcome).toBe('invalid');
    expect(harness.codeRepository.attemptCountInDatabase).toBe(1);
  });

  it('sayaci HMAC kiyasindan ONCE artirir', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command({ code: WRONG_CODE }));

    expect(harness.calls).toEqual(['increment', 'verify']);
  });

  it('yanlis kodda parola DEGISMEZ, oturum DUSMEZ', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command({ code: WRONG_CODE }));

    expect(harness.credentialRepository.saved).toHaveLength(0);
    expect(harness.tokenFamilyRepository.bulkRevocations).toHaveLength(0);
    expect(harness.eventPublisher.published).toHaveLength(0);
  });

  it('sinira gelmis (3. deneme) kod reddedilir — sayac dokunulmaz', async () => {
    const harness = createHarness();
    harness.codeRepository.code = PasswordResetCode.fromPersistence({
      id: CODE_ID,
      userId: USER_ID,
      codeHash: digestOf(CODE),
      attemptCount: MAX_PASSWORD_RESET_ATTEMPTS,
      expiresAt: new Date(NOW.getTime() + TTL_MS),
      consumedAt: null,
    });

    const result = await harness.useCase.execute(command());

    expect(result.outcome).toBe('invalid');
    expect(harness.calls).toEqual([]); // isVerifiable false -> increment cagrilmaz
  });
});

describe('ResetPasswordUseCase — redler AYIRT EDILEMEZ (P2)', () => {
  it('bilinmeyen e-posta -> invalid', async () => {
    const harness = createHarness();
    harness.userRepository.user = null;

    expect((await harness.useCase.execute(command({ email: 'yok@example.com' }))).outcome).toBe(
      'invalid',
    );
  });

  it('AKTIF OLMAYAN kullanici -> invalid', async () => {
    const harness = createHarness();
    const user = activeUser();
    user.lock();
    harness.userRepository.user = user;

    expect((await harness.useCase.execute(command())).outcome).toBe('invalid');
  });

  it('aktif kod yok -> invalid', async () => {
    const harness = createHarness();
    harness.codeRepository.code = null;

    expect((await harness.useCase.execute(command())).outcome).toBe('invalid');
  });

  it('suresi dolmus kod -> invalid', async () => {
    const harness = createHarness();
    harness.codeRepository.code = PasswordResetCode.fromPersistence({
      id: CODE_ID,
      userId: USER_ID,
      codeHash: digestOf(CODE),
      attemptCount: 0,
      expiresAt: new Date(NOW.getTime() - 1),
      consumedAt: null,
    });

    expect((await harness.useCase.execute(command())).outcome).toBe('invalid');
  });
});

describe('ResetPasswordUseCase — girdi bicimi', () => {
  it('parola politikasi ihlalinde 422 (transaction ACMAZ)', async () => {
    const harness = createHarness();

    await expect(harness.useCase.execute(command({ password: 'kisa' }))).rejects.toThrow(
      PasswordPolicyError,
    );
    expect(harness.codeRepository.saved).toHaveLength(0);
  });
});
