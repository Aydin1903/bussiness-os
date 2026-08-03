import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type Delay } from '../../../shared/delay.port';
import { type DomainEvent } from '../../../shared/domain-event';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { UserId } from '../../../shared/user-id.value-object';
import { LAYER1_MAX_FAILURES, LAYER3_MAX_FAILURES } from '../domain/brute-force-policy';
import { Credential } from '../domain/credential.entity';
import { Email } from '../domain/email.value-object';
import { PasswordPolicyError, TooManyLoginAttemptsError } from '../domain/identity.error';
import { type LoginAttempt } from '../domain/login-attempt.entity';
import { PasswordHash } from '../domain/password-hash.value-object';
import { type TokenFamily } from '../domain/token-family.entity';
import { type TokenFamilyId } from '../domain/token-family-id.value-object';
import { type TokenFamilyRevocationReason } from '../domain/token-family-revocation-reason.value-object';
import { User } from '../domain/user.entity';
import { UserPasswordChanged } from '../domain/user-password-changed.event';
import { ChangePasswordUseCase, type ChangePasswordDependencies } from './change-password.use-case';
import { type CredentialRepository } from './credential.repository.port';
import { type LoginAttemptRepository } from './login-attempt.repository.port';
import { type PasswordHasher } from './password-hasher.port';
import { type TokenFamilyRepository } from './token-family.repository.port';
import { type UserRepository } from './user.repository.port';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

const NOW = new Date('2026-08-02T10:00:00.000Z');
const CURRENT_PASSWORD = 'eskiparola1';
const NEW_PASSWORD = 'yeniparola9';
const WRONG_PASSWORD = 'yanlisparola1';
const IP = '203.0.113.10';
const EMAIL = Email.create('user@example.com');
const USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');
const SESSION_ID = '018f3a2b-7c4d-7e1f-8a2b-00000000ff01';
const OTHER_SESSION_ID = '018f3a2b-7c4d-7e1f-8a2b-00000000ff02';

/** Hash yerine geri cevrilebilir bir PHC dizesi: `verify` bunu kiyaslar. */
function phcFor(password: string): string {
  const encoded = Buffer.from(password, 'utf8').toString('base64').replace(/=+$/, '');
  return `$argon2id$v=19$m=19456,t=2,p=1$${encoded}$${encoded}`;
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
  findByEmail(): Promise<User | null> {
    return Promise.resolve(this.user);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeCredentialRepository implements CredentialRepository {
  readonly saved: Credential[] = [];
  credential: Credential | null = Credential.create({
    userId: USER_ID,
    passwordHash: PasswordHash.fromHash(phcFor(CURRENT_PASSWORD)),
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

class FakeLoginAttemptRepository implements LoginAttemptRepository {
  readonly saved: LoginAttempt[] = [];
  emailIpFailures = 0;
  emailFailures = 0;
  ipFailures = 0;

  constructor(private readonly calls: CallLog) {}

  save(attempt: LoginAttempt): Promise<void> {
    this.calls.push('record-attempt');
    this.saved.push(attempt);
    return Promise.resolve();
  }
  countFailuresByEmailAndIp(): Promise<number> {
    return Promise.resolve(this.emailIpFailures);
  }
  countFailuresByEmail(): Promise<number> {
    return Promise.resolve(this.emailFailures);
  }
  countFailuresByIp(): Promise<number> {
    return Promise.resolve(this.ipFailures);
  }
}

interface ExceptRevocation {
  readonly userId: string;
  readonly exceptFamilyId: string;
  readonly reason: TokenFamilyRevocationReason;
}

class FakeTokenFamilyRepository implements TokenFamilyRepository {
  readonly exceptRevocations: ExceptRevocation[] = [];

  findById(): Promise<TokenFamily | null> {
    return Promise.resolve(null);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  /**
   * TOPLU iptal (haric tutmayan) bu akista CAGRILMAMALIDIR — cagrilirsa
   * kullanici kendi cihazindan da atilmis olur. Sessizce 0 donmek bu hatayi
   * gorunmez kilardi.
   */
  revokeAllActiveByUserId(): Promise<number> {
    throw new Error('Degistirme akisi TUM oturumlari dusurmez.');
  }
  revokeAllActiveByUserIdExcept(
    userId: UserId,
    exceptFamilyId: TokenFamilyId,
    reason: TokenFamilyRevocationReason,
  ): Promise<number> {
    this.exceptRevocations.push({
      userId: userId.value,
      exceptFamilyId: exceptFamilyId.value,
      reason,
    });
    return Promise.resolve(3);
  }
}

class FakePasswordHasher implements PasswordHasher {
  readonly hashed: string[] = [];

  constructor(private readonly calls: CallLog) {}

  hash(plainPassword: string): Promise<PasswordHash> {
    this.calls.push('hash');
    this.hashed.push(plainPassword);
    return Promise.resolve(PasswordHash.fromHash(phcFor(plainPassword)));
  }
  verify(plainPassword: string, hash: PasswordHash): Promise<boolean> {
    this.calls.push('verify');
    return Promise.resolve(hash.value === phcFor(plainPassword));
  }
  needsRehash(): boolean {
    return false;
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

class RecordingDelay implements Delay {
  readonly waited: number[] = [];
  wait(ms: number): Promise<void> {
    this.waited.push(ms);
    return Promise.resolve();
  }
}

interface Harness {
  readonly userRepository: FakeUserRepository;
  readonly credentialRepository: FakeCredentialRepository;
  readonly loginAttemptRepository: FakeLoginAttemptRepository;
  readonly tokenFamilyRepository: FakeTokenFamilyRepository;
  readonly eventPublisher: FakeEventPublisher;
  readonly passwordHasher: FakePasswordHasher;
  readonly delay: RecordingDelay;
  readonly calls: CallLog;
  readonly useCase: ChangePasswordUseCase;
}

function createHarness(): Harness {
  const calls: CallLog = [];
  const userRepository = new FakeUserRepository();
  const credentialRepository = new FakeCredentialRepository();
  const loginAttemptRepository = new FakeLoginAttemptRepository(calls);
  const tokenFamilyRepository = new FakeTokenFamilyRepository();
  const eventPublisher = new FakeEventPublisher();
  const passwordHasher = new FakePasswordHasher(calls);
  const delay = new RecordingDelay();

  const deps: ChangePasswordDependencies = {
    userRepository,
    credentialRepository,
    loginAttemptRepository,
    tokenFamilyRepository,
    passwordHasher,
    eventPublisher,
    transactionManager: new FakeTransactionManager(),
    idGenerator: new SequentialIdGenerator(),
    clock: new FixedClock(),
    delay,
  };

  return {
    userRepository,
    credentialRepository,
    loginAttemptRepository,
    tokenFamilyRepository,
    eventPublisher,
    passwordHasher,
    delay,
    calls,
    useCase: new ChangePasswordUseCase(deps),
  };
}

function command(
  overrides: Partial<{ currentPassword: string; newPassword: string; sessionId: string }> = {},
) {
  return {
    userId: USER_ID.value,
    sessionId: SESSION_ID,
    currentPassword: CURRENT_PASSWORD,
    newPassword: NEW_PASSWORD,
    ipAddress: IP,
    correlationId: 'c-1',
    ...overrides,
  };
}

describe('ChangePasswordUseCase — basari', () => {
  it('parolayi degistirir ve sonuc "changed" doner', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute(command());

    expect(result.outcome).toBe('changed');
    expect(harness.credentialRepository.saved[0]?.passwordHash.value).toBe(phcFor(NEW_PASSWORD));
  });

  it('passwordChangedAt i gunceller (rehash DEGIL gercek degisiklik)', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.credentialRepository.saved[0]?.passwordChangedAt).toEqual(NOW);
  });

  it('MEVCUT oturum HARIC digerlerini "password-changed" ile iptal eder', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute(command());

    expect(harness.tokenFamilyRepository.exceptRevocations).toEqual([
      { userId: USER_ID.value, exceptFamilyId: SESSION_ID, reason: 'password-changed' },
    ]);
    expect(result.revokedSessionCount).toBe(3);
  });

  it('haric tutulan aile, komutta gelen sessionId dir (sabit degil)', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command({ sessionId: OTHER_SESSION_ID }));

    expect(harness.tokenFamilyRepository.exceptRevocations[0]?.exceptFamilyId).toBe(
      OTHER_SESSION_ID,
    );
  });

  it('UserPasswordChanged event ini (bilgilendirme) yayinlar', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    const event = harness.eventPublisher.published[0];
    expect(event?.eventType).toBe(UserPasswordChanged.TYPE);
    expect(event?.payload).toEqual({ userId: USER_ID.value, email: EMAIL.value });
  });

  it('BASARILI degisikligi kaba kuvvet defterine YAZMAZ', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.loginAttemptRepository.saved).toHaveLength(0);
  });

  it('yeni hash i mevcut parola DOGRULANDIKTAN sonra hesaplar', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    // Once verify, sonra hash: yanlis parolada pahali hash hic hesaplanmaz.
    expect(harness.calls).toEqual(['verify', 'hash']);
  });
});

describe('ChangePasswordUseCase — yanlis mevcut parola', () => {
  it('reddeder ve denemeyi deftere YAZAR (sayac artisi kalici)', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute(command({ currentPassword: WRONG_PASSWORD }));

    expect(result.outcome).toBe('invalid');
    expect(harness.loginAttemptRepository.saved).toHaveLength(1);
    expect(harness.loginAttemptRepository.saved[0]?.succeeded).toBe(false);
  });

  it('denemeyi kullanicinin e-postasi + istegin IP si ile kaydeder', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command({ currentPassword: WRONG_PASSWORD }));

    const attempt = harness.loginAttemptRepository.saved[0];
    expect(attempt?.email.value).toBe(EMAIL.value);
    expect(attempt?.ipAddress.value).toBe(IP);
  });

  it('parola DEGISMEZ, oturumlar DUSMEZ, event YAYINLANMAZ', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command({ currentPassword: WRONG_PASSWORD }));

    expect(harness.credentialRepository.saved).toHaveLength(0);
    expect(harness.tokenFamilyRepository.exceptRevocations).toHaveLength(0);
    expect(harness.eventPublisher.published).toHaveLength(0);
  });

  it('yanlis parolada YENI hash hic hesaplanmaz', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command({ currentPassword: WRONG_PASSWORD }));

    expect(harness.passwordHasher.hashed).toHaveLength(0);
    expect(harness.calls).toEqual(['verify', 'record-attempt']);
  });
});

describe('ChangePasswordUseCase — zayif yeni parola', () => {
  it('politika ihlalinde firlatir ve HICBIR yan etki uretmez', async () => {
    const harness = createHarness();

    await expect(harness.useCase.execute(command({ newPassword: 'kisa' }))).rejects.toThrow(
      PasswordPolicyError,
    );

    expect(harness.credentialRepository.saved).toHaveLength(0);
    expect(harness.loginAttemptRepository.saved).toHaveLength(0);
  });

  it('politika, mevcut parola DOGRULANMADAN once elenir (Argon2 harcanmaz)', async () => {
    const harness = createHarness();

    await expect(
      harness.useCase.execute(command({ newPassword: 'rakamsizparola' })),
    ).rejects.toThrow(PasswordPolicyError);

    expect(harness.calls).toEqual([]);
  });
});

describe('ChangePasswordUseCase — kaba kuvvet kapisi (ADR-0022)', () => {
  it('katman 1 kilidi yanlis paroladan AYIRT EDILEMEZ (ayni "invalid")', async () => {
    const harness = createHarness();
    harness.loginAttemptRepository.emailIpFailures = LAYER1_MAX_FAILURES;

    const result = await harness.useCase.execute(command());

    expect(result.outcome).toBe('invalid');
    // Kilitliyken parola HIC dogrulanmaz: dogru parola bile gecmez.
    expect(harness.calls).toEqual([]);
  });

  it('katman 3 (IP) siniri asilinca 429 firlatir — hesaptan bagimsiz', async () => {
    const harness = createHarness();
    harness.loginAttemptRepository.ipFailures = LAYER3_MAX_FAILURES;

    await expect(harness.useCase.execute(command())).rejects.toThrow(TooManyLoginAttemptsError);
  });

  it('katman 2 esigi asilinca kilit degil GECIKME uygular ve devam eder', async () => {
    const harness = createHarness();
    harness.loginAttemptRepository.emailFailures = 20;

    const result = await harness.useCase.execute(command());

    expect(harness.delay.waited).toEqual([1000]);
    expect(result.outcome).toBe('changed');
  });
});

describe('ChangePasswordUseCase — redler AYIRT EDILEMEZ (P2)', () => {
  it('kullanici bulunamazsa -> invalid', async () => {
    const harness = createHarness();
    harness.userRepository.user = null;

    expect((await harness.useCase.execute(command())).outcome).toBe('invalid');
  });

  it('AKTIF OLMAYAN kullanici -> invalid (token gecerli olsa da)', async () => {
    const harness = createHarness();
    const user = activeUser();
    user.lock();
    harness.userRepository.user = user;

    expect((await harness.useCase.execute(command())).outcome).toBe('invalid');
  });

  it('credential yoksa (parolasiz/federe hesap) -> invalid', async () => {
    const harness = createHarness();
    harness.credentialRepository.credential = null;

    expect((await harness.useCase.execute(command())).outcome).toBe('invalid');
  });
});
