import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type DomainEvent } from '../../../shared/domain-event';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { UserId } from '../../../shared/user-id.value-object';
import { Email } from '../domain/email.value-object';
import { InvalidTokenError } from '../domain/identity.error';
import { REFRESH_TOKEN_TTL_DAYS, RefreshToken } from '../domain/refresh-token.entity';
import { RefreshTokenHash } from '../domain/refresh-token-hash.value-object';
import { RefreshTokenId } from '../domain/refresh-token-id.value-object';
import { RefreshTokenReuseDetected } from '../domain/refresh-token-reuse-detected.event';
import { TOKEN_FAMILY_ABSOLUTE_TTL_DAYS, TokenFamily } from '../domain/token-family.entity';
import { TokenFamilyId } from '../domain/token-family-id.value-object';
import { User } from '../domain/user.entity';
import { type RefreshTokenGenerator } from './refresh-token-generator.port';
import { type RefreshTokenHasher } from './refresh-token-hasher.port';
import { type RefreshTokenRepository } from './refresh-token.repository.port';
import { RefreshSessionUseCase, type RefreshSessionDependencies } from './refresh-session.use-case';
import { type TokenFamilyRepository } from './token-family.repository.port';
import {
  type AccessTokenInput,
  type IdentityTokenInput,
  type TokenSigner,
  type VerifiedOAuthOneTap,
  type VerifiedOAuthPendingLink,
  type VerifiedOAuthState,
  type VerifiedToken,
} from './token-signer.port';
import { type UserRepository } from './user.repository.port';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

const NOW = new Date('2026-07-22T10:00:00.000Z');
const DAY_MS = 24 * 60 * 60_000;
const OLD_TOKEN = 'eski-refresh-token';
const NEW_TOKEN = 'yeni-refresh-token';
const USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');
const FAMILY_ID = TokenFamilyId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000f1');
const TOKEN_ID = RefreshTokenId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000d1');

function digestOf(token: string): RefreshTokenHash {
  return RefreshTokenHash.fromDigest(
    Buffer.from(token).toString('hex').padEnd(64, '0').slice(0, 64),
  );
}

function activeUser(): User {
  const user = User.register({
    id: USER_ID,
    email: Email.create('user@example.com'),
    createdAt: NOW,
  });
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

class FakeTokenFamilyRepository implements TokenFamilyRepository {
  readonly saved: TokenFamily[] = [];
  family: TokenFamily | null = null;
  revokedAllCount = 0;

  findById(): Promise<TokenFamily | null> {
    return Promise.resolve(this.family);
  }

  save(family: TokenFamily): Promise<void> {
    this.saved.push(family);
    return Promise.resolve();
  }

  revokeAllActiveByUserId(): Promise<number> {
    this.revokedAllCount += 1;
    return Promise.resolve(0);
  }
  /** Yenileme akisi "bu oturum haric" iptali yapmaz; sozlesme geregi bulunur. */
  revokeAllActiveByUserIdExcept(): Promise<number> {
    return Promise.resolve(0);
  }
}

class FakeRefreshTokenRepository implements RefreshTokenRepository {
  readonly saved: RefreshToken[] = [];
  token: RefreshToken | null = null;

  save(token: RefreshToken): Promise<void> {
    this.saved.push(token);
    return Promise.resolve();
  }

  findByTokenHash(tokenHash: RefreshTokenHash): Promise<RefreshToken | null> {
    const match = this.token !== null && this.token.tokenHash.value === tokenHash.value;
    return Promise.resolve(match ? this.token : null);
  }
}

class FakeRefreshTokenGenerator implements RefreshTokenGenerator {
  generate(): string {
    return NEW_TOKEN;
  }
}

class FakeRefreshTokenHasher implements RefreshTokenHasher {
  hash(token: string): RefreshTokenHash {
    return digestOf(token);
  }
}

class FakeTokenSigner implements TokenSigner {
  readonly signed: IdentityTokenInput[] = [];

  signIdentityToken(input: IdentityTokenInput): Promise<string> {
    this.signed.push(input);
    return Promise.resolve('imzali-kimlik-token');
  }

  signAccessToken(_input: AccessTokenInput): Promise<string> {
    return Promise.resolve('imzali-access-token');
  }

  verify(_token: string): Promise<VerifiedToken> {
    return Promise.reject(new Error('kullanilmiyor'));
  }
  // ==========================================================================
  // ⚠️ OAuth AKIS METOTLARI — ADR-0053 §4.2'nin (PO Kalem B3) YAN ETKISI
  // ==========================================================================
  // `TokenSigner` port'u ucuncu bir token turuyle genisledi ve bu sahtenin de
  // genislemesi GEREKTI. ⚠️ Metotlar bilincli olarak FIRLATIR, sessizce bir
  // deger DONDURMEZ: parola girisi bu yollari HIC kullanmamalidir ve bir gun
  // kullanirsa test GURULTUYLE kirilmalidir — sahte bir deger donseydi,
  // yanlislikla OAuth yoluna sapan bir degisiklik YESIL gecerdi.
  signOAuthState(): Promise<string> {
    throw new Error('parola girisi OAuth state token i imzalamaz');
  }
  verifyOAuthState(): Promise<VerifiedOAuthState> {
    throw new Error('parola girisi OAuth state token i dogrulamaz');
  }
  signOAuthPendingLink(): Promise<string> {
    throw new Error('parola girisi bekleyen baglama token i imzalamaz');
  }
  verifyOAuthPendingLink(): Promise<VerifiedOAuthPendingLink> {
    throw new Error('parola girisi bekleyen baglama token i dogrulamaz');
  }
  signOAuthOneTap(): Promise<string> {
    throw new Error('parola girisi one-tap token i imzalamaz');
  }
  verifyOAuthOneTap(): Promise<VerifiedOAuthOneTap> {
    throw new Error('parola girisi one-tap token i dogrulamaz');
  }
}

class FakeEventPublisher implements DomainEventPublisher {
  readonly published: DomainEvent[] = [];

  publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
    return Promise.resolve();
  }
}

/**
 * Her transaction BAGIMSIZDIR: yalnizca kendi icinde olan hata geri alinir.
 * Yeniden kullanim testinin can alici noktasi budur — iptal kendi
 * transaction'inda commit olur, 401 sonra firlatilir.
 */
class FakeTransactionManager implements TransactionManager {
  opened = 0;

  constructor(private readonly stores: { length: number }[] = []) {}

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

interface Harness {
  readonly userRepository: FakeUserRepository;
  readonly familyRepository: FakeTokenFamilyRepository;
  readonly tokenRepository: FakeRefreshTokenRepository;
  readonly eventPublisher: FakeEventPublisher;
  readonly tokenSigner: FakeTokenSigner;
  readonly useCase: RefreshSessionUseCase;
}

function usableToken(): RefreshToken {
  return RefreshToken.issue({
    id: TOKEN_ID,
    familyId: FAMILY_ID,
    tokenHash: digestOf(OLD_TOKEN),
    expiresAt: new Date(NOW.getTime() + REFRESH_TOKEN_TTL_DAYS * DAY_MS),
  });
}

function createHarness(): Harness {
  const userRepository = new FakeUserRepository();
  const familyRepository = new FakeTokenFamilyRepository();
  const tokenRepository = new FakeRefreshTokenRepository();
  const eventPublisher = new FakeEventPublisher();
  const tokenSigner = new FakeTokenSigner();

  familyRepository.family = TokenFamily.start({
    id: FAMILY_ID,
    userId: USER_ID,
    createdAt: NOW,
  });
  tokenRepository.token = usableToken();

  const deps: RefreshSessionDependencies = {
    userRepository,
    tokenFamilyRepository: familyRepository,
    refreshTokenRepository: tokenRepository,
    refreshTokenGenerator: new FakeRefreshTokenGenerator(),
    refreshTokenHasher: new FakeRefreshTokenHasher(),
    tokenSigner,
    eventPublisher,
    transactionManager: new FakeTransactionManager([
      familyRepository.saved,
      eventPublisher.published,
    ]),
    idGenerator: new SequentialIdGenerator(),
    clock: new FixedClock(),
  };

  return {
    userRepository,
    familyRepository,
    tokenRepository,
    eventPublisher,
    tokenSigner,
    useCase: new RefreshSessionUseCase(deps),
  };
}

function command(token = OLD_TOKEN) {
  return { refreshToken: token, correlationId: 'corr-1' };
}

describe('RefreshSessionUseCase — rotasyon', () => {
  it('yeni kimlik token i ve yeni refresh token dondurur', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute(command());

    expect(result.identityToken).toBe('imzali-kimlik-token');
    expect(result.refreshToken).toBe(NEW_TOKEN);
  });

  it('ESKI token i kullanilmis olarak isaretler', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    const old = harness.tokenRepository.saved.find((t) => t.id.value === TOKEN_ID.value);
    expect(old?.isUsed).toBe(true);
    expect(old?.usedAt).toEqual(NOW);
  });

  it('yeni token i AYNI ailede uretir', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    const issued = harness.tokenRepository.saved.find((t) => t.id.value !== TOKEN_ID.value);
    expect(issued?.familyId.value).toBe(FAMILY_ID.value);
    expect(issued?.tokenHash.value).toBe(digestOf(NEW_TOKEN).value);
  });

  it('token i oturum (aile) kimligiyle imzalar', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.tokenSigner.signed[0]).toEqual({
      userId: USER_ID.value,
      sessionId: FAMILY_ID.value,
    });
  });

  it('yenilemede alarm event i YAYINLAMAZ', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.eventPublisher.published).toHaveLength(0);
  });
});

describe('RefreshSessionUseCase — YENIDEN KULLANIM tespiti', () => {
  function reusedHarness(): Harness {
    const harness = createHarness();
    const used = usableToken();
    used.markUsed(new Date(NOW.getTime() - 60_000));
    harness.tokenRepository.token = used;
    return harness;
  }

  it('kullanilmis token yeniden sunulursa 401 uretir', async () => {
    const harness = reusedHarness();

    await expect(harness.useCase.execute(command())).rejects.toThrow(InvalidTokenError);
  });

  it('AILENIN TAMAMINI iptal eder ve iptal KALICI olur', async () => {
    const harness = reusedHarness();

    await expect(harness.useCase.execute(command())).rejects.toThrow(InvalidTokenError);

    // Kritik: iptal 401 ile ayni transaction'da olsaydi GERI ALINIR ve calinan
    // token'in ailesi ayakta kalirdi — ADR-0021'in tek gercek korumasi.
    expect(harness.familyRepository.saved).toHaveLength(1);
    expect(harness.familyRepository.saved[0]?.isRevoked).toBe(true);
    expect(harness.familyRepository.saved[0]?.revokedReason).toBe('token-reuse-detected');
  });

  it('alarm event ini yayinlar ve o da KALICI olur', async () => {
    const harness = reusedHarness();

    await expect(harness.useCase.execute(command())).rejects.toThrow(InvalidTokenError);

    const event = harness.eventPublisher.published[0];
    expect(event?.eventType).toBe(RefreshTokenReuseDetected.TYPE);
    expect(event?.payload).toEqual({ userId: USER_ID.value, familyId: FAMILY_ID.value });
  });

  it('yeni token URETMEZ', async () => {
    const harness = reusedHarness();

    await expect(harness.useCase.execute(command())).rejects.toThrow(InvalidTokenError);

    expect(harness.tokenRepository.saved).toHaveLength(0);
  });

  it('aile ZATEN iptalliyse alarmi tekrarlamaz', async () => {
    const harness = reusedHarness();
    harness.familyRepository.family?.revoke('token-reuse-detected', NOW);

    await expect(harness.useCase.execute(command())).rejects.toThrow(InvalidTokenError);

    // Ilk tespit zaten yayinlandi; her denemede yeni alarm uretmek gercek
    // sinyali gurultuye bogardi.
    expect(harness.eventPublisher.published).toHaveLength(0);
  });
});

describe('RefreshSessionUseCase — redler AYIRT EDILEMEZ (hepsi 401)', () => {
  it('bilinmeyen token i reddeder', async () => {
    const harness = createHarness();

    await expect(harness.useCase.execute(command('baska-token'))).rejects.toThrow(
      InvalidTokenError,
    );
  });

  it('suresi dolmus token i reddeder', async () => {
    const harness = createHarness();
    harness.tokenRepository.token = RefreshToken.issue({
      id: TOKEN_ID,
      familyId: FAMILY_ID,
      tokenHash: digestOf(OLD_TOKEN),
      expiresAt: new Date(NOW.getTime() - 1),
    });

    await expect(harness.useCase.execute(command())).rejects.toThrow(InvalidTokenError);
  });

  it('IPTAL EDILMIS ailenin token ini reddeder (cikis sonrasi)', async () => {
    const harness = createHarness();
    harness.familyRepository.family?.revoke('logout', NOW);

    await expect(harness.useCase.execute(command())).rejects.toThrow(InvalidTokenError);
    expect(harness.tokenRepository.saved).toHaveLength(0);
  });

  it('kullanici AKTIF degilse reddeder (§11.4 kontrol 1)', async () => {
    const harness = createHarness();
    const user = activeUser();
    user.lock();
    harness.userRepository.user = user;

    // Yetkinin hala gecerli oldugunun kontrol noktasi: kilitli kullanici
    // refresh ile sonsuza kadar yeni token almaya devam edememeli.
    await expect(harness.useCase.execute(command())).rejects.toThrow(InvalidTokenError);
  });

  it('kullanici bulunamazsa reddeder', async () => {
    const harness = createHarness();
    harness.userRepository.user = null;

    await expect(harness.useCase.execute(command())).rejects.toThrow(InvalidTokenError);
  });
});

describe('RefreshSessionUseCase — mutlak oturum omru (90 gun)', () => {
  /** Aileyi `days` gun once acilmis gibi kurar; token hala kullanilabilir. */
  function agedHarness(days: number): Harness {
    const harness = createHarness();
    const createdAt = new Date(NOW.getTime() - days * DAY_MS);

    harness.familyRepository.family = TokenFamily.fromPersistence({
      id: FAMILY_ID,
      userId: USER_ID,
      revokedReason: null,
      createdAt,
      revokedAt: null,
    });

    return harness;
  }

  it('tavanin ALTINDA yenilemeye izin verir', async () => {
    const harness = agedHarness(TOKEN_FAMILY_ABSOLUTE_TTL_DAYS - 1);

    const result = await harness.useCase.execute(command());

    expect(result.refreshToken).toBe(NEW_TOKEN);
  });

  it('tavan dolduysa gecerli token la bile 401 uretir', async () => {
    const harness = agedHarness(TOKEN_FAMILY_ABSOLUTE_TTL_DAYS);

    // Token'in kendisi kullanilabilir; reddin sebebi AILENIN yasidir.
    await expect(harness.useCase.execute(command())).rejects.toThrow(InvalidTokenError);
  });

  it('tavan dolduysa yeni token URETMEZ', async () => {
    const harness = agedHarness(TOKEN_FAMILY_ABSOLUTE_TTL_DAYS + 5);

    await expect(harness.useCase.execute(command())).rejects.toThrow(InvalidTokenError);

    expect(harness.tokenRepository.saved).toHaveLength(0);
  });

  it('tavan dolsa da aileyi IPTAL ETMEZ', async () => {
    const harness = agedHarness(TOKEN_FAMILY_ABSOLUTE_TTL_DAYS + 5);

    await expect(harness.useCase.execute(command())).rejects.toThrow(InvalidTokenError);

    // Sona erme bir zaman gercegidir; iptal kaydi yazmak denetimi kirletirdi.
    expect(harness.familyRepository.saved).toHaveLength(0);
  });

  it('omru dolmus ailede YENIDEN KULLANIM hala alarm uretir', async () => {
    const harness = agedHarness(TOKEN_FAMILY_ABSOLUTE_TTL_DAYS + 5);
    const used = usableToken();
    used.markUsed(new Date(NOW.getTime() - 60_000));
    harness.tokenRepository.token = used;

    await expect(harness.useCase.execute(command())).rejects.toThrow(InvalidTokenError);

    // "Zaten bitmisti" diye sessiz kalmak sinyal kaybidir: calinmis bir zincirin
    // kullanildigini gosteren tek isaret budur.
    expect(harness.eventPublisher.published).toHaveLength(1);
    expect(harness.familyRepository.saved[0]?.revokedReason).toBe('token-reuse-detected');
  });
});
