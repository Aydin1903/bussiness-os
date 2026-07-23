import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type DomainEvent } from '../../../shared/domain-event';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type Credential } from '../domain/credential.entity';
import type { Email } from '../domain/email.value-object';
import { type EmailVerificationCode } from '../domain/email-verification-code.entity';
import { type EmailVerificationCodeId } from '../domain/email-verification-code-id.value-object';
import { InvalidEmailError, PasswordPolicyError } from '../domain/identity.error';
import { PasswordHash } from '../domain/password-hash.value-object';
import { type User } from '../domain/user.entity';
import { UserRegistered } from '../domain/user-registered.event';
import { VerificationCodeHash } from '../domain/verification-code-hash.value-object';
import { type CredentialRepository } from './credential.repository.port';
import { type EmailVerificationCodeRepository } from './email-verification-code.repository.port';
import { type PasswordHasher } from './password-hasher.port';
import { RegisterUserUseCase, type RegisterUserDependencies } from './register-user.use-case';
import { type UserRepository } from './user.repository.port';
import { type VerificationCodeGenerator } from './verification-code-generator.port';
import { type VerificationCodeHasher } from './verification-code-hasher.port';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

const NOW = new Date('2026-07-22T10:00:00.000Z');
const CODE = '123456';
const CORRELATION_ID = 'corr-1';

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

  findByUserId(): Promise<Credential | null> {
    return Promise.resolve(null);
  }

  save(credential: Credential): Promise<void> {
    this.saved.push(credential);
    return Promise.resolve();
  }
}

class FakeCodeRepository implements EmailVerificationCodeRepository {
  readonly saved: EmailVerificationCode[] = [];
  failOnSave = false;

  save(code: EmailVerificationCode): Promise<void> {
    if (this.failOnSave) {
      return Promise.reject(new Error('veritabani hatasi'));
    }
    this.saved.push(code);
    return Promise.resolve();
  }

  findActiveByUserId(): Promise<EmailVerificationCode | null> {
    return Promise.resolve(null);
  }

  incrementAttemptCount(_id: EmailVerificationCodeId): Promise<number | null> {
    return Promise.resolve(null);
  }
}

class FakePasswordHasher implements PasswordHasher {
  readonly hashed: string[] = [];

  hash(plainPassword: string): Promise<PasswordHash> {
    this.hashed.push(plainPassword);
    return Promise.resolve(PasswordHash.fromHash(phcFor(plainPassword)));
  }

  verify(plainPassword: string, hash: PasswordHash): Promise<boolean> {
    return Promise.resolve(hash.value === phcFor(plainPassword));
  }

  needsRehash(): boolean {
    return false;
  }
}

class FakeCodeGenerator implements VerificationCodeGenerator {
  generate(): string {
    return CODE;
  }
}

class FakeCodeHasher implements VerificationCodeHasher {
  hash(code: string): VerificationCodeHash {
    return VerificationCodeHash.fromDigest(code.padStart(64, '0'));
  }

  verify(code: string, hash: VerificationCodeHash): boolean {
    return hash.value === this.hash(code).value;
  }
}

class FakeEventPublisher implements DomainEventPublisher {
  readonly published: DomainEvent[] = [];

  publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
    return Promise.resolve();
  }
}

/** Her transaction bagimsizdir: yalnizca KENDI icinde olan hata geri alinir. */
class FakeTransactionManager implements TransactionManager {
  opened = 0;
  rolledBack = false;

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
      this.rolledBack = true;
      throw error;
    }
  }

  runInTenantTransaction<T>(_tenantId: string, fn: () => Promise<T>): Promise<T> {
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

interface Harness extends RegisterUserDependencies {
  readonly userRepository: FakeUserRepository;
  readonly credentialRepository: FakeCredentialRepository;
  readonly verificationCodeRepository: FakeCodeRepository;
  readonly passwordHasher: FakePasswordHasher;
  readonly eventPublisher: FakeEventPublisher;
  readonly transactionManager: FakeTransactionManager;
  readonly useCase: RegisterUserUseCase;
}

function createHarness(): Harness {
  const userRepository = new FakeUserRepository();
  const credentialRepository = new FakeCredentialRepository();
  const verificationCodeRepository = new FakeCodeRepository();
  const passwordHasher = new FakePasswordHasher();
  const eventPublisher = new FakeEventPublisher();
  const transactionManager = new FakeTransactionManager([
    userRepository.saved,
    credentialRepository.saved,
    verificationCodeRepository.saved,
    eventPublisher.published,
  ]);

  const deps: RegisterUserDependencies = {
    userRepository,
    credentialRepository,
    verificationCodeRepository,
    passwordHasher,
    verificationCodeGenerator: new FakeCodeGenerator(),
    verificationCodeHasher: new FakeCodeHasher(),
    eventPublisher,
    transactionManager,
    idGenerator: new SequentialIdGenerator(),
    clock: new FixedClock(),
  };

  return {
    ...deps,
    userRepository,
    credentialRepository,
    verificationCodeRepository,
    passwordHasher,
    eventPublisher,
    transactionManager,
    useCase: new RegisterUserUseCase(deps),
  };
}

function command(overrides: Partial<{ email: string; password: string }> = {}) {
  return {
    email: 'User@Example.com',
    password: 'parola123',
    correlationId: CORRELATION_ID,
    ...overrides,
  };
}

describe('RegisterUserUseCase — yeni kullanici', () => {
  it('kullanici, credential ve dogrulama kodunu tek transaction da yazar', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.userRepository.saved).toHaveLength(1);
    expect(harness.credentialRepository.saved).toHaveLength(1);
    expect(harness.verificationCodeRepository.saved).toHaveLength(1);
    expect(harness.transactionManager.opened).toBe(1);
  });

  it('e-postayi normalize ederek saklar', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command({ email: '  User@Example.COM ' }));

    expect(harness.userRepository.saved[0]?.email.value).toBe('user@example.com');
  });

  it('kullaniciyi pending ve dogrulanmamis baslatir', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.userRepository.saved[0]?.status).toBe('pending');
    expect(harness.userRepository.saved[0]?.emailVerified).toBe(false);
  });

  it('kodu HASH leyerek saklar; ham kod yalnizca event te bulunur', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    // Veritabanina giden deger HMAC digest'idir, ham kod DEGIL.
    expect(harness.verificationCodeRepository.saved[0]?.codeHash.value).toBe(
      CODE.padStart(64, '0'),
    );
    const event = harness.eventPublisher.published[0];
    expect(event?.payload).toMatchObject({ verificationCode: CODE });
  });

  it('kodun suresini 15 dakika sonrasina ayarlar', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.verificationCodeRepository.saved[0]?.expiresAt).toEqual(
      new Date(NOW.getTime() + 15 * 60_000),
    );
  });

  it('UserRegistered event ini tenant siz yayinlar', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    const event = harness.eventPublisher.published[0];
    expect(event?.eventType).toBe(UserRegistered.TYPE);
    expect(event?.tenantId).toBeNull();
    expect(event?.correlationId).toBe(CORRELATION_ID);
  });
});

describe('RegisterUserUseCase — var olan e-posta (hesap varlik oracle i olmamali)', () => {
  async function seedExisting(harness: Harness): Promise<void> {
    await harness.useCase.execute(command());
  }

  it('yeni kullanici OLUSTURMAZ ama hata da FIRLATMAZ', async () => {
    const harness = createHarness();
    await seedExisting(harness);

    // Ayni e-posta, farkli parola ile ikinci kayit.
    await expect(
      harness.useCase.execute(command({ password: 'baskaparola9' })),
    ).resolves.toBeUndefined();

    expect(harness.userRepository.saved).toHaveLength(1);
    expect(harness.credentialRepository.saved).toHaveLength(1);
    expect(harness.eventPublisher.published).toHaveLength(1);
  });

  it('parolayi YINE DE hash ler (zamanlama oracle i olmasin)', async () => {
    const harness = createHarness();
    await seedExisting(harness);

    await harness.useCase.execute(command({ password: 'baskaparola9' }));

    // Iki cagri, iki hash: kayitli e-posta belirgin sekilde daha HIZLI donmez.
    expect(harness.passwordHasher.hashed).toEqual(['parola123', 'baskaparola9']);
  });
});

describe('RegisterUserUseCase — dogrulama ve atomiklik', () => {
  it('parola politikasi ihlalinde transaction hic acmaz', async () => {
    const harness = createHarness();

    await expect(harness.useCase.execute(command({ password: 'kisa' }))).rejects.toThrow(
      PasswordPolicyError,
    );

    expect(harness.transactionManager.opened).toBe(0);
    expect(harness.passwordHasher.hashed).toHaveLength(0);
  });

  it('gecersiz e-posta bicimini reddeder', async () => {
    const harness = createHarness();

    await expect(harness.useCase.execute(command({ email: 'gecersiz' }))).rejects.toThrow(
      InvalidEmailError,
    );
  });

  it('kayit sirasinda hata olursa hicbiri kalmaz', async () => {
    const harness = createHarness();
    harness.verificationCodeRepository.failOnSave = true;

    await expect(harness.useCase.execute(command())).rejects.toThrow('veritabani hatasi');

    expect(harness.userRepository.saved).toHaveLength(0);
    expect(harness.credentialRepository.saved).toHaveLength(0);
    expect(harness.eventPublisher.published).toHaveLength(0);
    expect(harness.transactionManager.rolledBack).toBe(true);
  });
});
