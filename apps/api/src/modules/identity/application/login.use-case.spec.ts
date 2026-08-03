import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type Delay } from '../../../shared/delay.port';
import { type DomainEvent } from '../../../shared/domain-event';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { UserId } from '../../../shared/user-id.value-object';
import { Credential } from '../domain/credential.entity';
import { Email } from '../domain/email.value-object';
import {
  EmailNotVerifiedError,
  InvalidCredentialsError,
  TooManyLoginAttemptsError,
} from '../domain/identity.error';
import { type LoginAttempt } from '../domain/login-attempt.entity';
import { PasswordHash } from '../domain/password-hash.value-object';
import { type RefreshToken } from '../domain/refresh-token.entity';
import { RefreshTokenHash } from '../domain/refresh-token-hash.value-object';
import { type TokenFamily } from '../domain/token-family.entity';
import { type TokenFamilyId } from '../domain/token-family-id.value-object';
import { User } from '../domain/user.entity';
import { UserLoggedIn } from '../domain/user-logged-in.event';
import { type CredentialRepository } from './credential.repository.port';
import { LoginUseCase, type LoginDependencies } from './login.use-case';
import { type LoginAttemptRepository } from './login-attempt.repository.port';
import { type PasswordHasher } from './password-hasher.port';
import { type RefreshTokenGenerator } from './refresh-token-generator.port';
import { type RefreshTokenHasher } from './refresh-token-hasher.port';
import { type RefreshTokenRepository } from './refresh-token.repository.port';
import { type TokenFamilyRepository } from './token-family.repository.port';
import {
  type AccessTokenInput,
  type IdentityTokenInput,
  type TokenSigner,
  type VerifiedToken,
} from './token-signer.port';
import { type UserRepository } from './user.repository.port';

const NOW = new Date('2026-07-22T10:00:00.000Z');
const USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');
const EMAIL = Email.create('user@example.com');
const PASSWORD = 'parola123';
const IP = '203.0.113.7';
const RAW_REFRESH = 'raw-refresh-token';

function phcFor(password: string): string {
  const encoded = Buffer.from(password, 'utf8').toString('base64').replace(/=+$/, '');
  return `$argon2id$v=19$m=19456,t=2,p=1$${encoded}$${encoded}`;
}

class FakeUserRepository implements UserRepository {
  readonly saved: User[] = [];
  findById(): Promise<User | null> {
    return Promise.resolve(null);
  }
  findByEmail(email: Email): Promise<User | null> {
    return Promise.resolve(this.saved.find((u) => u.email.equals(email)) ?? null);
  }
  save(user: User): Promise<void> {
    this.saved.push(user);
    return Promise.resolve();
  }
}

class FakeCredentialRepository implements CredentialRepository {
  readonly saved: Credential[] = [];
  findByUserId(userId: UserId): Promise<Credential | null> {
    return Promise.resolve(this.saved.find((c) => c.userId.equals(userId)) ?? null);
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

  save(attempt: LoginAttempt): Promise<void> {
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

class FakeTokenFamilyRepository implements TokenFamilyRepository {
  readonly saved: TokenFamily[] = [];
  findById(_id: TokenFamilyId): Promise<TokenFamily | null> {
    return Promise.resolve(null);
  }
  save(family: TokenFamily): Promise<void> {
    this.saved.push(family);
    return Promise.resolve();
  }
  /** Giris akisi toplu iptal yapmaz; sozlesme geregi bulunur. */
  revokeAllActiveByUserId(): Promise<number> {
    return Promise.resolve(0);
  }
  revokeAllActiveByUserIdExcept(): Promise<number> {
    return Promise.resolve(0);
  }
}

class FakeRefreshTokenRepository implements RefreshTokenRepository {
  readonly saved: RefreshToken[] = [];
  save(token: RefreshToken): Promise<void> {
    this.saved.push(token);
    return Promise.resolve();
  }
  findByTokenHash(): Promise<RefreshToken | null> {
    return Promise.resolve(null);
  }
}

class FakePasswordHasher implements PasswordHasher {
  readonly hashed: string[] = [];
  readonly verified: string[] = [];
  needsRehashResult = false;

  hash(plainPassword: string): Promise<PasswordHash> {
    this.hashed.push(plainPassword);
    return Promise.resolve(PasswordHash.fromHash(phcFor(plainPassword)));
  }
  verify(plainPassword: string, hash: PasswordHash): Promise<boolean> {
    this.verified.push(hash.value);
    return Promise.resolve(hash.value === phcFor(plainPassword));
  }
  needsRehash(): boolean {
    return this.needsRehashResult;
  }
}

class FakeRefreshTokenGenerator implements RefreshTokenGenerator {
  generate(): string {
    return RAW_REFRESH;
  }
}

class FakeRefreshTokenHasher implements RefreshTokenHasher {
  hash(token: string): RefreshTokenHash {
    return RefreshTokenHash.fromDigest(
      Buffer.from(token, 'utf8').toString('hex').padEnd(64, '0').slice(0, 64),
    );
  }
}

class FakeTokenSigner implements TokenSigner {
  signIdentityToken(input: IdentityTokenInput): Promise<string> {
    return Promise.resolve(`identity:${input.userId}:${input.sessionId}`);
  }
  signAccessToken(input: AccessTokenInput): Promise<string> {
    return Promise.resolve(`access:${input.userId}`);
  }
  verify(): Promise<VerifiedToken> {
    return Promise.reject(new Error('bu testte kullanilmiyor'));
  }
}

class FakeEventPublisher implements DomainEventPublisher {
  readonly published: DomainEvent[] = [];
  publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
    return Promise.resolve();
  }
}

class FakeDelay implements Delay {
  readonly waited: number[] = [];
  wait(milliseconds: number): Promise<void> {
    this.waited.push(milliseconds);
    return Promise.resolve();
  }
}

/** Her transaction bagimsizdir — COMMIT olan geri alinmaz. */
class FakeTransactionManager implements TransactionManager {
  opened = 0;

  constructor(private readonly stores: { length: number }[]) {}

  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    this.opened += 1;
    const lengths = this.stores.map((store) => store.length);
    try {
      return await fn();
    } catch (error) {
      this.stores.forEach((store, index) => {
        store.length = lengths[index] ?? 0;
      });
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

interface Harness extends LoginDependencies {
  readonly userRepository: FakeUserRepository;
  readonly credentialRepository: FakeCredentialRepository;
  readonly loginAttemptRepository: FakeLoginAttemptRepository;
  readonly tokenFamilyRepository: FakeTokenFamilyRepository;
  readonly refreshTokenRepository: FakeRefreshTokenRepository;
  readonly passwordHasher: FakePasswordHasher;
  readonly eventPublisher: FakeEventPublisher;
  readonly delay: FakeDelay;
  readonly useCase: LoginUseCase;
}

function createHarness(): Harness {
  const userRepository = new FakeUserRepository();
  const credentialRepository = new FakeCredentialRepository();
  const loginAttemptRepository = new FakeLoginAttemptRepository();
  const tokenFamilyRepository = new FakeTokenFamilyRepository();
  const refreshTokenRepository = new FakeRefreshTokenRepository();
  const passwordHasher = new FakePasswordHasher();
  const eventPublisher = new FakeEventPublisher();
  const delay = new FakeDelay();

  const deps: LoginDependencies = {
    userRepository,
    credentialRepository,
    loginAttemptRepository,
    tokenFamilyRepository,
    refreshTokenRepository,
    passwordHasher,
    refreshTokenGenerator: new FakeRefreshTokenGenerator(),
    refreshTokenHasher: new FakeRefreshTokenHasher(),
    tokenSigner: new FakeTokenSigner(),
    eventPublisher,
    transactionManager: new FakeTransactionManager([
      loginAttemptRepository.saved,
      tokenFamilyRepository.saved,
      refreshTokenRepository.saved,
      eventPublisher.published,
    ]),
    idGenerator: new SequentialIdGenerator(),
    clock: new FixedClock(),
    delay,
  };

  return {
    ...deps,
    userRepository,
    credentialRepository,
    loginAttemptRepository,
    tokenFamilyRepository,
    refreshTokenRepository,
    passwordHasher,
    eventPublisher,
    delay,
    useCase: new LoginUseCase(deps),
  };
}

function seedUser(
  harness: Harness,
  options: { verified?: boolean; locked?: boolean; password?: string } = {},
): void {
  const { verified = true, locked = false, password = PASSWORD } = options;

  const user = User.register({ id: USER_ID, email: EMAIL, createdAt: NOW });
  if (verified) {
    user.verifyEmail(); // pending -> active + emailVerified
  }
  if (locked) {
    user.lock();
  }

  harness.userRepository.saved.push(user);
  harness.credentialRepository.saved.push(
    Credential.create({
      userId: USER_ID,
      passwordHash: PasswordHash.fromHash(phcFor(password)),
      createdAt: NOW,
    }),
  );
}

function command(overrides: Partial<{ password: string; ipAddress: string }> = {}) {
  return {
    email: 'user@example.com',
    password: PASSWORD,
    ipAddress: IP,
    correlationId: 'corr-1',
    ...overrides,
  };
}

describe('LoginUseCase — mutlu yol', () => {
  it('kimlik token i ve ham refresh token u doner', async () => {
    const harness = createHarness();
    seedUser(harness);

    const result = await harness.useCase.execute(command());

    // KIMLIK token'i: tenant claim'i yok (ADR-0020 asama 1).
    expect(result.identityToken).toContain('identity:');
    expect(result.refreshToken).toBe(RAW_REFRESH);
  });

  it('oturumu (aile + refresh token) kalici hale getirir', async () => {
    const harness = createHarness();
    seedUser(harness);

    await harness.useCase.execute(command());

    expect(harness.tokenFamilyRepository.saved).toHaveLength(1);
    expect(harness.refreshTokenRepository.saved).toHaveLength(1);
    // Token veritabaninda HASH'i ile durur, ham hali degil.
    expect(harness.refreshTokenRepository.saved[0]?.tokenHash.value).not.toContain(RAW_REFRESH);
  });

  it('basarili denemeyi kaydeder ve UserLoggedIn yayinlar', async () => {
    const harness = createHarness();
    seedUser(harness);

    await harness.useCase.execute(command());

    expect(harness.loginAttemptRepository.saved).toHaveLength(1);
    expect(harness.loginAttemptRepository.saved[0]?.succeeded).toBe(true);
    expect(harness.eventPublisher.published[0]?.eventType).toBe(UserLoggedIn.TYPE);
    expect(harness.eventPublisher.published[0]?.tenantId).toBeNull();
  });

  it('gerekiyorsa parolayi yeniden hash ler (kademeli yukseltme)', async () => {
    const harness = createHarness();
    seedUser(harness);
    harness.passwordHasher.needsRehashResult = true;

    await harness.useCase.execute(command());

    // Dogrulama + yeniden hash: credential tekrar kaydedildi.
    expect(harness.passwordHasher.hashed).toContain(PASSWORD);
    expect(harness.credentialRepository.saved).toHaveLength(2);
  });
});

describe('LoginUseCase — kaba kuvvet kapisi (ADR-0022)', () => {
  it('katman 1 esiginde GENEL hata verir ve deneme KAYDETMEZ', async () => {
    const harness = createHarness();
    seedUser(harness);
    harness.loginAttemptRepository.emailIpFailures = 5;

    await expect(harness.useCase.execute(command())).rejects.toThrow(InvalidCredentialsError);

    // Kilit, kimlik dogrulamaya hic ulasmaz.
    expect(harness.loginAttemptRepository.saved).toHaveLength(0);
  });

  it('kilit ile yanlis parola AYNI hatayi uretir (ayirt edilemezlik)', async () => {
    const locked = createHarness();
    seedUser(locked);
    locked.loginAttemptRepository.emailIpFailures = 5;

    const wrong = createHarness();
    seedUser(wrong);

    const lockedError = await locked.useCase.execute(command()).catch((e: unknown) => e);
    const wrongError = await wrong.useCase
      .execute(command({ password: 'yanlisparola1' }))
      .catch((e: unknown) => e);

    expect((lockedError as Error).message).toBe((wrongError as Error).message);
  });

  it('katman 2 esiginde ustel gecikme uygular ama girisi engellemez', async () => {
    const harness = createHarness();
    seedUser(harness);
    harness.loginAttemptRepository.emailFailures = 20;

    const result = await harness.useCase.execute(command());

    expect(harness.delay.waited).toEqual([1000]);
    expect(result.identityToken).toContain('identity:');
  });

  it('katman 3 esiginde 429 uretir', async () => {
    const harness = createHarness();
    seedUser(harness);
    harness.loginAttemptRepository.ipFailures = 50;

    await expect(harness.useCase.execute(command())).rejects.toThrow(TooManyLoginAttemptsError);
  });
});

describe('LoginUseCase — basarisiz kimlik dogrulama', () => {
  it('kullanici yoksa SAHTE hash dogrular (zamanlama esitleme)', async () => {
    const harness = createHarness();

    await expect(harness.useCase.execute(command())).rejects.toThrow(InvalidCredentialsError);

    // Kullanici olmamasina ragmen bir hash dogrulamasi CALISTI.
    expect(harness.passwordHasher.verified).toHaveLength(1);
  });

  it('kullanici yoksa basarisiz denemeyi kaydeder', async () => {
    const harness = createHarness();

    await expect(harness.useCase.execute(command())).rejects.toThrow(InvalidCredentialsError);

    expect(harness.loginAttemptRepository.saved).toHaveLength(1);
    expect(harness.loginAttemptRepository.saved[0]?.succeeded).toBe(false);
  });

  it('yanlis parolada basarisiz denemeyi kaydeder ve genel hata verir', async () => {
    const harness = createHarness();
    seedUser(harness);

    await expect(harness.useCase.execute(command({ password: 'yanlisparola1' }))).rejects.toThrow(
      InvalidCredentialsError,
    );

    expect(harness.loginAttemptRepository.saved).toHaveLength(1);
    expect(harness.loginAttemptRepository.saved[0]?.succeeded).toBe(false);
  });

  it('BASARISIZ DENEME, hata firlatilsa bile KALICIDIR', async () => {
    // Tasarimin en kritik noktasi: her sey tek transaction olsaydi, hata
    // firlatilinca kayit geri alinir ve kaba kuvvet sayaci HIC artmazdi.
    const harness = createHarness();
    seedUser(harness);

    await expect(harness.useCase.execute(command({ password: 'yanlisparola1' }))).rejects.toThrow();

    expect(harness.loginAttemptRepository.saved).toHaveLength(1);
    expect(harness.tokenFamilyRepository.saved).toHaveLength(0);
  });
});

describe('LoginUseCase — hesap durumu', () => {
  it('e-posta dogrulanmamissa AYIRT EDILEBILIR 403 verir', async () => {
    const harness = createHarness();
    seedUser(harness, { verified: false });

    await expect(harness.useCase.execute(command())).rejects.toThrow(EmailNotVerifiedError);
  });

  it('dogrulanmamis e-postada basarisiz deneme KAYDETMEZ (parola dogruydu)', async () => {
    const harness = createHarness();
    seedUser(harness, { verified: false });

    await expect(harness.useCase.execute(command())).rejects.toThrow(EmailNotVerifiedError);

    expect(harness.loginAttemptRepository.saved).toHaveLength(0);
  });

  it('hesap aktif degilse GENEL hata verir (kilit sizdirilmaz)', async () => {
    const harness = createHarness();
    seedUser(harness, { locked: true });

    await expect(harness.useCase.execute(command())).rejects.toThrow(InvalidCredentialsError);
  });
});
