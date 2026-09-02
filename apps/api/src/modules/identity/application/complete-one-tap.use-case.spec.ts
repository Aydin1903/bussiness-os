import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import {
  type OAuthIdentity,
  type OAuthIdTokenVerifier,
  type OAuthProviderKey,
  type OAuthProviderPort,
  type OAuthProviderRegistry,
} from '../../../shared/oauth-provider.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  OAuthProviderNotConfiguredError,
  OAuthStateInvalidError,
  TooManyOneTapAttemptsError,
} from '../domain/identity.error';
import { type IpAddress } from '../domain/ip-address.value-object';
import { ONE_TAP_MAX_ATTEMPTS_PER_WINDOW } from '../domain/one-tap-rate-limit.policy';
import { type CompleteOneTapCommand, CompleteOneTapUseCase } from './complete-one-tap.use-case';
import { type OneTapAttemptRepository } from './one-tap-attempt.repository.port';
import {
  type ResolveFederatedIdentity,
  type ResolveFederatedIdentityResult,
} from './resolve-federated-identity';
import { type TokenSigner, type VerifiedOAuthOneTap } from './token-signer.port';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

const NOW = new Date('2026-09-02T10:00:00.000Z');
const CORRELATION_ID = 'corr-one-tap-1';
const NONCE = 'sunucunun-urettigi-nonce';
const IP = '203.0.113.7';

const IDENTITY: OAuthIdentity = {
  provider: 'google',
  subject: 'google-sub-777',
  email: 'kisi@sirket.com',
  emailVerified: true,
  displayName: 'Bir Kisi',
  avatarUrl: null,
};

const SIGNED_IN: ResolveFederatedIdentityResult = {
  outcome: 'signed-in',
  session: {
    identityToken: 'kimlik-token',
    refreshToken: 'refresh-token',
  },
  next: null,
};

class FakeClock implements Clock {
  now(): Date {
    return new Date(NOW.getTime());
  }
}

class FakeIdGenerator implements IdGenerator {
  #next = 0;
  nextId(): string {
    this.#next += 1;
    return 'id-' + String(this.#next);
  }
}

class PassThroughTransactionManager implements TransactionManager {
  runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }

  runInTenantTransaction<T>(_tenantId: string, work: () => Promise<T>): Promise<T> {
    return work();
  }

  runInCurrentTenantTransaction<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

class FakeVerifier implements OAuthIdTokenVerifier {
  readonly key: OAuthProviderKey = 'google';
  /** Gorulen nonce KAYDEDILIR: cerezden gelenin ta kendisi olmalidir. */
  seenNonce: string | null = null;
  calls = 0;

  verifyIdToken(input: { idToken: string; nonce: string }): Promise<OAuthIdentity> {
    this.calls += 1;
    this.seenNonce = input.nonce;
    return Promise.resolve(IDENTITY);
  }
}

class FakeRegistry implements OAuthProviderRegistry {
  constructor(private readonly verifier: OAuthIdTokenVerifier | null) {}

  find(_key: string): OAuthProviderPort | null {
    return null;
  }

  findIdTokenVerifier(key: string): OAuthIdTokenVerifier | null {
    return key === 'google' ? this.verifier : null;
  }

  configuredKeys(): readonly OAuthProviderKey[] {
    return ['google'];
  }
}

class FakeAttemptRepository implements OneTapAttemptRepository {
  constructor(private readonly existing: number) {}
  readonly recorded: { id: string; ip: string; at: Date }[] = [];

  countByIpSince(_ipAddress: IpAddress, _since: Date): Promise<number> {
    return Promise.resolve(this.existing);
  }

  record(input: { id: string; ipAddress: IpAddress; attemptedAt: Date }): Promise<void> {
    this.recorded.push({ id: input.id, ip: input.ipAddress.value, at: input.attemptedAt });
    return Promise.resolve();
  }
}

class FakeResolver {
  calls = 0;
  lastIdentity: OAuthIdentity | null = null;
  lastNext: string | null = 'DOKUNULMADI';

  resolve(
    identity: OAuthIdentity,
    _correlationId: string,
    next: string | null,
  ): Promise<ResolveFederatedIdentityResult> {
    this.calls += 1;
    this.lastIdentity = identity;
    this.lastNext = next;
    return Promise.resolve(SIGNED_IN);
  }
}

class FakeTokenSigner {
  constructor(private readonly verified: VerifiedOAuthOneTap | Error) {}

  verifyOAuthOneTap(_token: string): Promise<VerifiedOAuthOneTap> {
    if (this.verified instanceof Error) {
      return Promise.reject(this.verified);
    }
    return Promise.resolve(this.verified);
  }
}

interface Harness {
  readonly useCase: CompleteOneTapUseCase;
  readonly verifier: FakeVerifier;
  readonly resolver: FakeResolver;
  readonly attempts: FakeAttemptRepository;
}

function build(options?: {
  readonly verified?: VerifiedOAuthOneTap | Error;
  readonly existingAttempts?: number;
  readonly verifierMissing?: boolean;
}): Harness {
  const verifier = new FakeVerifier();
  const resolver = new FakeResolver();
  const attempts = new FakeAttemptRepository(options?.existingAttempts ?? 0);
  const signer = new FakeTokenSigner(options?.verified ?? { provider: 'google', nonce: NONCE });

  const useCase = new CompleteOneTapUseCase({
    registry: new FakeRegistry(options?.verifierMissing === true ? null : verifier),
    resolver: resolver as unknown as ResolveFederatedIdentity,
    oneTapAttemptRepository: attempts,
    tokenSigner: signer as unknown as TokenSigner,
    transactionManager: new PassThroughTransactionManager(),
    idGenerator: new FakeIdGenerator(),
    clock: new FakeClock(),
  });

  return { useCase, verifier, resolver, attempts };
}

function command(overrides?: Partial<CompleteOneTapCommand>): CompleteOneTapCommand {
  return {
    provider: 'google',
    credential: 'gis-id-token',
    stateToken: 'imzali-cerez',
    ipAddress: IP,
    correlationId: CORRELATION_ID,
    ...overrides,
  };
}

describe('CompleteOneTapUseCase — mutlu yol', () => {
  it('cerezdeki nonce dogrulayiciya AYNEN gecer ve oturum acilir', async () => {
    const harness = build();

    const result = await harness.useCase.execute(command());

    expect(result).toEqual(SIGNED_IN);
    /*
     * 5/5 dogrulamasinin baglayicisi: dogrulayici, ISTEMCININ gonderdigi degil
     * SUNUCUNUN imzali cerezde sakladigi nonce'u gorur. Istemciden gelen bir
     * deger kullanilsaydi dogrulama KENDI KENDINI ONAYLARDI.
     */
    expect(harness.verifier.seenNonce).toBe(NONCE);
  });

  it('D1/D2/D3 KOPYALANMAZ — karar resolver uzerinden gecer (EK-1.3)', async () => {
    const harness = build();

    await harness.useCase.execute(command());

    expect(harness.resolver.calls).toBe(1);
    expect(harness.resolver.lastIdentity).toEqual(IDENTITY);
  });

  it('next One Tap yolunda HER ZAMAN null — bu bir XHR, navigasyon degil', async () => {
    const harness = build();

    await harness.useCase.execute(command());

    expect(harness.resolver.lastNext).toBeNull();
  });

  it('deneme, sonuctan BAGIMSIZ olarak deftere yazilir', async () => {
    const harness = build();

    await harness.useCase.execute(command());

    expect(harness.attempts.recorded).toHaveLength(1);
    expect(harness.attempts.recorded[0]?.ip).toBe(IP);
    expect(harness.attempts.recorded[0]?.at).toEqual(NOW);
  });
});

describe('CEREZ — uc ret sebebi de AYNI hataya duser', () => {
  it('cerez YOKSA reddeder', async () => {
    const harness = build();

    await expect(harness.useCase.execute(command({ stateToken: null }))).rejects.toBeInstanceOf(
      OAuthStateInvalidError,
    );
  });

  it('imza ya da sure gecersizse reddeder', async () => {
    const harness = build({ verified: new Error('imza tutmadi') });

    await expect(harness.useCase.execute(command())).rejects.toBeInstanceOf(OAuthStateInvalidError);
  });

  it('SESSIZ SINIF: BASKA bir saglayici icin alinmis cerez kabul EDILMEZ', async () => {
    /*
     * Cerez gecerli imzalidir ve suresi dolmamistir — yalnizca BASKA bir
     * saglayici icin uretilmistir. Kontrol olmasaydi token teknik olarak
     * "gecerli" gorunur ve akis yanlis saglayicinin dalinda ilerlerdi.
     */
    const harness = build({ verified: { provider: 'microsoft', nonce: NONCE } });

    await expect(harness.useCase.execute(command())).rejects.toBeInstanceOf(OAuthStateInvalidError);
  });

  it('cerez reddedilince dogrulayici HIC CAGRILMAZ', async () => {
    const harness = build({ verified: new Error('imza tutmadi') });

    await expect(harness.useCase.execute(command())).rejects.toBeInstanceOf(OAuthStateInvalidError);
    expect(harness.verifier.calls).toBe(0);
  });
});

describe('ORAN SINIRI — PAHALI ADIMDAN ONCE (EK-1.4)', () => {
  it('esige varildiysa domain hatasi firlatir', async () => {
    const harness = build({ existingAttempts: ONE_TAP_MAX_ATTEMPTS_PER_WINDOW });

    await expect(harness.useCase.execute(command())).rejects.toBeInstanceOf(
      TooManyOneTapAttemptsError,
    );
  });

  it('sinir asildiginda JWKS DOGRULAMASI HIC YAPILMAZ', async () => {
    /*
     * Testin degeri burada: sinir SONRA kontrol edilseydi de istek 429 donerdi
     * — yani DIS DAVRANIS AYNI olurdu ve hicbir uctan uca test farki gormezdi.
     * Farki yalnizca bu iddia gorur: sinir, korudugu maliyeti odemeden once
     * devreye giriyor mu?
     */
    const harness = build({ existingAttempts: ONE_TAP_MAX_ATTEMPTS_PER_WINDOW });

    await expect(harness.useCase.execute(command())).rejects.toBeInstanceOf(
      TooManyOneTapAttemptsError,
    );
    expect(harness.verifier.calls).toBe(0);
    expect(harness.resolver.calls).toBe(0);
  });

  it('son izinli denemede gecer', async () => {
    const harness = build({ existingAttempts: ONE_TAP_MAX_ATTEMPTS_PER_WINDOW - 1 });

    await expect(harness.useCase.execute(command())).resolves.toEqual(SIGNED_IN);
  });
});

describe('YETENEK — One Tap yalnizca Google icin vardir', () => {
  it('id token dogrulayicisi olmayan saglayici icin uc GERCEKTEN yoktur', async () => {
    const harness = build();

    await expect(harness.useCase.execute(command({ provider: 'linkedin' }))).rejects.toBeInstanceOf(
      OAuthProviderNotConfiguredError,
    );
  });
});
