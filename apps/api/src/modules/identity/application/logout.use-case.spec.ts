import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { UserId } from '../../../shared/user-id.value-object';
import { RefreshToken } from '../domain/refresh-token.entity';
import { RefreshTokenHash } from '../domain/refresh-token-hash.value-object';
import { RefreshTokenId } from '../domain/refresh-token-id.value-object';
import { TokenFamily } from '../domain/token-family.entity';
import { TokenFamilyId } from '../domain/token-family-id.value-object';
import { type TokenFamilyRevocationReason } from '../domain/token-family-revocation-reason.value-object';
import { LogoutUseCase, type LogoutDependencies } from './logout.use-case';
import { type RefreshTokenHasher } from './refresh-token-hasher.port';
import { type RefreshTokenRepository } from './refresh-token.repository.port';
import { type TokenFamilyRepository } from './token-family.repository.port';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

const NOW = new Date('2026-07-22T10:00:00.000Z');
const TOKEN = 'refresh-token';
const USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');
const FAMILY_ID = TokenFamilyId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000f1');
const TOKEN_ID = RefreshTokenId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000d1');

function digestOf(token: string): RefreshTokenHash {
  return RefreshTokenHash.fromDigest(
    Buffer.from(token).toString('hex').padEnd(64, '0').slice(0, 64),
  );
}

class FakeTokenFamilyRepository implements TokenFamilyRepository {
  readonly saved: TokenFamily[] = [];
  family: TokenFamily | null = null;
  bulkRevocations: { userId: string; reason: TokenFamilyRevocationReason; at: Date }[] = [];
  bulkResult = 3;

  findById(): Promise<TokenFamily | null> {
    return Promise.resolve(this.family);
  }

  save(family: TokenFamily): Promise<void> {
    this.saved.push(family);
    return Promise.resolve();
  }

  revokeAllActiveByUserId(
    userId: UserId,
    reason: TokenFamilyRevocationReason,
    revokedAt: Date,
  ): Promise<number> {
    this.bulkRevocations.push({ userId: userId.value, reason, at: revokedAt });
    return Promise.resolve(this.bulkResult);
  }

  /** Cikis akisi "bu oturum haric" iptali yapmaz; sozlesme geregi bulunur. */
  revokeAllActiveByUserIdExcept(): Promise<number> {
    return Promise.resolve(0);
  }
}

class FakeRefreshTokenRepository implements RefreshTokenRepository {
  token: RefreshToken | null = null;

  save(): Promise<void> {
    return Promise.resolve();
  }

  findByTokenHash(tokenHash: RefreshTokenHash): Promise<RefreshToken | null> {
    const match = this.token !== null && this.token.tokenHash.value === tokenHash.value;
    return Promise.resolve(match ? this.token : null);
  }
}

class FakeRefreshTokenHasher implements RefreshTokenHasher {
  hash(token: string): RefreshTokenHash {
    return digestOf(token);
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

class FixedClock implements Clock {
  now(): Date {
    return new Date(NOW.getTime());
  }
}

interface Harness {
  readonly familyRepository: FakeTokenFamilyRepository;
  readonly tokenRepository: FakeRefreshTokenRepository;
  readonly useCase: LogoutUseCase;
}

function createHarness(): Harness {
  const familyRepository = new FakeTokenFamilyRepository();
  const tokenRepository = new FakeRefreshTokenRepository();

  familyRepository.family = TokenFamily.start({ id: FAMILY_ID, userId: USER_ID, createdAt: NOW });
  tokenRepository.token = RefreshToken.issue({
    id: TOKEN_ID,
    familyId: FAMILY_ID,
    tokenHash: digestOf(TOKEN),
    expiresAt: new Date(NOW.getTime() + 60_000),
  });

  const deps: LogoutDependencies = {
    tokenFamilyRepository: familyRepository,
    refreshTokenRepository: tokenRepository,
    refreshTokenHasher: new FakeRefreshTokenHasher(),
    transactionManager: new FakeTransactionManager(),
    clock: new FixedClock(),
  };

  return { familyRepository, tokenRepository, useCase: new LogoutUseCase(deps) };
}

describe('LogoutUseCase — cikis', () => {
  it('sunulan token in AILESINI iptal eder', async () => {
    const harness = createHarness();

    await harness.useCase.execute({ refreshToken: TOKEN });

    expect(harness.familyRepository.saved).toHaveLength(1);
    expect(harness.familyRepository.saved[0]?.isRevoked).toBe(true);
    expect(harness.familyRepository.saved[0]?.revokedReason).toBe('logout');
  });

  it('BILINMEYEN token da hata FIRLATMAZ', async () => {
    const harness = createHarness();

    // 401 donmek "bu token gercekti" bilgisini verirdi (oracle).
    await expect(harness.useCase.execute({ refreshToken: 'baska' })).resolves.toBeUndefined();
    expect(harness.familyRepository.saved).toHaveLength(0);
  });

  it('ZATEN iptal edilmis aileyi yeniden iptal etmez (idempotent)', async () => {
    const harness = createHarness();
    harness.familyRepository.family?.revoke('token-reuse-detected', NOW);

    await expect(harness.useCase.execute({ refreshToken: TOKEN })).resolves.toBeUndefined();

    // ILK iptal nedeni bir denetim gercegidir; uzerine 'logout' yazilmaz.
    expect(harness.familyRepository.saved).toHaveLength(0);
    expect(harness.familyRepository.family?.revokedReason).toBe('token-reuse-detected');
  });

  it('SURESI DOLMUS token da oturumu kapatir', async () => {
    const harness = createHarness();
    harness.tokenRepository.token = RefreshToken.issue({
      id: TOKEN_ID,
      familyId: FAMILY_ID,
      tokenHash: digestOf(TOKEN),
      expiresAt: new Date(NOW.getTime() - 1),
    });

    await harness.useCase.execute({ refreshToken: TOKEN });

    // Cikis bir yenileme degildir; token'in kullanilabilir olmasi gerekmez.
    expect(harness.familyRepository.saved[0]?.isRevoked).toBe(true);
  });
});

describe('LogoutUseCase — tum oturumlar', () => {
  it('kullanicinin tum aktif ailelerini TEK komutla iptal eder', async () => {
    const harness = createHarness();

    const revoked = await harness.useCase.executeAll({ userId: USER_ID.value });

    expect(revoked).toBe(3);
    expect(harness.familyRepository.bulkRevocations).toEqual([
      { userId: USER_ID.value, reason: 'logout-all', at: NOW },
    ]);
  });

  it('tek tek iptal yolunu KULLANMAZ', async () => {
    const harness = createHarness();

    await harness.useCase.executeAll({ userId: USER_ID.value });

    // N okuma + N yazma, aralarinda yeni aile dogmasina acik pencere birakirdi.
    expect(harness.familyRepository.saved).toHaveLength(0);
  });

  it('gecersiz kullanici kimligini reddeder', async () => {
    const harness = createHarness();

    await expect(harness.useCase.executeAll({ userId: 'kimlik-degil' })).rejects.toThrow();
  });
});
