import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DrizzleTransactionManager } from '../../src/infrastructure/database/drizzle-transaction-manager.adapter';
import { DrizzleCredentialRepository } from '../../src/modules/identity/infrastructure/drizzle-credential.repository';
import { DrizzleEmailVerificationCodeRepository } from '../../src/modules/identity/infrastructure/drizzle-email-verification-code.repository';
import { DrizzleLoginAttemptRepository } from '../../src/modules/identity/infrastructure/drizzle-login-attempt.repository';
import { DrizzleRefreshTokenRepository } from '../../src/modules/identity/infrastructure/drizzle-refresh-token.repository';
import { DrizzleTokenFamilyRepository } from '../../src/modules/identity/infrastructure/drizzle-token-family.repository';
import { DrizzleUserRepository } from '../../src/modules/identity/infrastructure/drizzle-user.repository';
import { Credential } from '../../src/modules/identity/domain/credential.entity';
import { Email } from '../../src/modules/identity/domain/email.value-object';
import { EmailVerificationCode } from '../../src/modules/identity/domain/email-verification-code.entity';
import { EmailVerificationCodeId } from '../../src/modules/identity/domain/email-verification-code-id.value-object';
import { IpAddress } from '../../src/modules/identity/domain/ip-address.value-object';
import { LoginAttempt } from '../../src/modules/identity/domain/login-attempt.entity';
import { LoginAttemptId } from '../../src/modules/identity/domain/login-attempt-id.value-object';
import { PasswordHash } from '../../src/modules/identity/domain/password-hash.value-object';
import { RefreshToken } from '../../src/modules/identity/domain/refresh-token.entity';
import { RefreshTokenHash } from '../../src/modules/identity/domain/refresh-token-hash.value-object';
import { RefreshTokenId } from '../../src/modules/identity/domain/refresh-token-id.value-object';
import { TokenFamily } from '../../src/modules/identity/domain/token-family.entity';
import { TokenFamilyId } from '../../src/modules/identity/domain/token-family-id.value-object';
import { User } from '../../src/modules/identity/domain/user.entity';
import { VerificationCodeHash } from '../../src/modules/identity/domain/verification-code-hash.value-object';
import { UserId } from '../../src/shared/user-id.value-object';
import {
  startTestDatabase,
  truncateIdentityTables,
  type TestDatabase,
} from './support/test-database';

const USER_ID = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';
const USER_ID_2 = '018f3a2b-7c4d-7e1f-9b3c-00000000000b';
const EMAIL = 'user@example.com';
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzYWx0$RdescudvJCsgt3ubuqfdP0mNSKwQnQBs1flkS5j3Vhg';
const DIGEST = '0123456789abcdef'.repeat(4);
const NOW = new Date('2026-07-22T10:00:00.000Z');
const EXPIRES = new Date('2026-07-22T10:15:00.000Z');

describe('identity repository adapter (gercek PostgreSQL)', () => {
  let database: TestDatabase;
  let tx: DrizzleTransactionManager;
  let users: DrizzleUserRepository;
  let credentials: DrizzleCredentialRepository;
  let codes: DrizzleEmailVerificationCodeRepository;
  let families: DrizzleTokenFamilyRepository;
  let tokens: DrizzleRefreshTokenRepository;
  let attempts: DrizzleLoginAttemptRepository;

  beforeAll(async () => {
    database = await startTestDatabase();
    tx = new DrizzleTransactionManager(database.appPool);
    users = new DrizzleUserRepository();
    credentials = new DrizzleCredentialRepository();
    codes = new DrizzleEmailVerificationCodeRepository();
    families = new DrizzleTokenFamilyRepository();
    tokens = new DrizzleRefreshTokenRepository();
    attempts = new DrizzleLoginAttemptRepository();
  }, 180_000);

  afterAll(async () => {
    await database.stop();
  });

  let attemptSeq = 0;

  beforeEach(async () => {
    await truncateIdentityTables(database.ownerPool);
    attemptSeq = 0;
  });

  /** Identity akislari tenant context'i OLMADAN calisir (12.4.3). */
  function run<T>(fn: () => Promise<T>): Promise<T> {
    return tx.runInTransaction(fn);
  }

  function newUser(id = USER_ID, email = EMAIL): User {
    return User.register({ id: UserId.create(id), email: Email.create(email), createdAt: NOW });
  }

  async function seedUser(id = USER_ID, email = EMAIL): Promise<User> {
    const user = newUser(id, email);
    await run(() => users.save(user));
    return user;
  }

  // --- Tenant context OLMADAN erisim (12.4.3) ----------------------------

  it('kullaniciyi tenant context OLMADAN kaydeder ve e-posta ile okur', async () => {
    await seedUser();

    const loaded = await run(() => users.findByEmail(Email.create(EMAIL)));

    expect(loaded?.id.value).toBe(USER_ID);
    expect(loaded?.status).toBe('pending');
    expect(loaded?.emailVerified).toBe(false);
    expect(loaded?.createdAt).toEqual(NOW);
  });

  it('durum degisikligini (verifyEmail) kalici hale getirir', async () => {
    const user = await seedUser();
    user.verifyEmail();
    await run(() => users.save(user));

    const loaded = await run(() => users.findById(UserId.create(USER_ID)));

    expect(loaded?.status).toBe('active');
    expect(loaded?.emailVerified).toBe(true);
  });

  // --- Kisitlar ----------------------------------------------------------

  it('e-posta GLOBAL TEKILDIR', async () => {
    await seedUser(USER_ID, EMAIL);

    await expect(run(() => users.save(newUser(USER_ID_2, EMAIL)))).rejects.toThrow();
  });

  it('status ile email_verified tutarsizsa CHECK reddeder', async () => {
    // active bir kullanici email_verified = false olamaz (user.entity invariant'i).
    await expect(
      database.appPool.query(
        "INSERT INTO platform.users (id, email, email_verified, status) VALUES ($1, $2, false, 'active')",
        [USER_ID, EMAIL],
      ),
    ).rejects.toThrow();
  });

  // --- Credential (1:1) --------------------------------------------------

  it('credential i kaydeder ve user_id ile geri okur', async () => {
    await seedUser();
    const credential = Credential.create({
      userId: UserId.create(USER_ID),
      passwordHash: PasswordHash.fromHash(HASH),
      createdAt: NOW,
    });

    await run(() => credentials.save(credential));
    const loaded = await run(() => credentials.findByUserId(UserId.create(USER_ID)));

    expect(loaded?.passwordHash.value).toBe(HASH);
    expect(loaded?.passwordChangedAt).toEqual(NOW);
  });

  // --- EmailVerificationCode + atomik sayac ------------------------------

  it('aktif kodu bulur ve tuketimi kalici hale getirir', async () => {
    await seedUser();
    const code = issueCode();

    await run(() => codes.save(code));
    const active = await run(() => codes.findActiveByUserId(UserId.create(USER_ID)));
    expect(active?.id.value).toBe(code.id.value);

    active?.consume(NOW);
    if (active) await run(() => codes.save(active));

    const afterConsume = await run(() => codes.findActiveByUserId(UserId.create(USER_ID)));
    expect(afterConsume).toBeNull();
  });

  it('deneme sayacini ES ZAMANLI cagrilarda ATOMIK artirir (§7.3)', async () => {
    await seedUser();
    const code = issueCode();
    await run(() => codes.save(code));

    // 5 es zamanli artis, her biri KENDI transaction'inda. "Oku-yaz" olsaydi
    // bazilari ayni degeri yazip kaybolurdu; atomik UPDATE ile hepsi sayilir.
    await Promise.all(
      Array.from({ length: 5 }, () =>
        run(() => codes.incrementAttemptCount(EmailVerificationCodeId.create(code.id.value))),
      ),
    );

    const loaded = await run(() => codes.findActiveByUserId(UserId.create(USER_ID)));
    expect(loaded?.attemptCount).toBe(5);
  });

  it('attempt_count 5 i asamaz (CHECK)', async () => {
    await seedUser();
    await expect(
      database.appPool.query(
        'INSERT INTO platform.email_verification_codes ' +
          '(id, user_id, code_hash, attempt_count, expires_at) VALUES ($1, $2, $3, 6, $4)',
        ['018f3a2b-7c4d-7e1f-8a2b-0000000000e9', USER_ID, DIGEST, EXPIRES],
      ),
    ).rejects.toThrow();
  });

  // --- TokenFamily + RefreshToken ----------------------------------------

  it('token ailesini ve refresh token u kaydeder; rotation u kalici hale getirir', async () => {
    await seedUser();
    const family = TokenFamily.start({
      id: TokenFamilyId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000f1'),
      userId: UserId.create(USER_ID),
      createdAt: NOW,
    });
    await run(() => families.save(family));

    const token = RefreshToken.issue({
      id: RefreshTokenId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000a2'),
      familyId: family.id,
      tokenHash: RefreshTokenHash.fromDigest(DIGEST),
      expiresAt: EXPIRES,
    });
    await run(() => tokens.save(token));

    token.markUsed(NOW);
    await run(() => tokens.save(token));

    const loaded = await run(() => tokens.findByTokenHash(RefreshTokenHash.fromDigest(DIGEST)));
    expect(loaded?.isUsed).toBe(true);
    expect(loaded?.usedAt).toEqual(NOW);
  });

  it('aile iptalini (reuse) kalici hale getirir', async () => {
    await seedUser();
    const family = TokenFamily.start({
      id: TokenFamilyId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000f2'),
      userId: UserId.create(USER_ID),
      createdAt: NOW,
    });
    await run(() => families.save(family));

    family.revoke('token-reuse-detected', new Date('2026-07-22T11:00:00.000Z'));
    await run(() => families.save(family));

    const loaded = await run(() => families.findById(family.id));
    expect(loaded?.isRevoked).toBe(true);
    expect(loaded?.revokedReason).toBe('token-reuse-detected');
  });

  it('token ailesi iptal tutarsizligini CHECK reddeder', async () => {
    await seedUser();
    // revoked_reason dolu ama revoked_at bos — tutarsiz (domain bunu uretemez).
    await expect(
      database.appPool.query(
        'INSERT INTO platform.token_families (id, user_id, revoked_reason) VALUES ($1, $2, $3)',
        ['018f3a2b-7c4d-7e1f-8a2b-0000000000f3', USER_ID, 'logout'],
      ),
    ).rejects.toThrow();
  });

  it('token_hash TEKILDIR', async () => {
    await seedUser();
    const family = TokenFamily.start({
      id: TokenFamilyId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000f4'),
      userId: UserId.create(USER_ID),
      createdAt: NOW,
    });
    await run(() => families.save(family));

    const first = RefreshToken.issue({
      id: RefreshTokenId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000a3'),
      familyId: family.id,
      tokenHash: RefreshTokenHash.fromDigest(DIGEST),
      expiresAt: EXPIRES,
    });
    await run(() => tokens.save(first));

    const duplicate = RefreshToken.issue({
      id: RefreshTokenId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000a4'),
      familyId: family.id,
      tokenHash: RefreshTokenHash.fromDigest(DIGEST),
      expiresAt: EXPIRES,
    });
    await expect(run(() => tokens.save(duplicate))).rejects.toThrow();
  });

  // --- LoginAttempt + katmanli sayim -------------------------------------

  it('katmanli basarisiz deneme sayimlarini dogru hesaplar', async () => {
    const ipA = '203.0.113.7';
    const ipB = '203.0.113.8';
    // (EMAIL, ipA): 3 basarisiz + 1 basarili. (EMAIL, ipB): 1 basarisiz.
    await recordAttempts(EMAIL, ipA, [false, false, false, true]);
    await recordAttempts(EMAIL, ipB, [false]);

    const since = new Date('2026-07-22T09:00:00.000Z');
    const byEmailIp = await run(() =>
      attempts.countFailuresByEmailAndIp(Email.create(EMAIL), IpAddress.create(ipA), since),
    );
    const byEmail = await run(() => attempts.countFailuresByEmail(Email.create(EMAIL), since));
    const byIp = await run(() => attempts.countFailuresByIp(IpAddress.create(ipA), since));

    expect(byEmailIp).toBe(3); // basarili sayilmaz
    expect(byEmail).toBe(4); // ipA'dan 3 + ipB'den 1
    expect(byIp).toBe(3); // yalnizca ipA
  });

  it('pencere disindaki denemeleri saymaz', async () => {
    await recordAttempts(EMAIL, '203.0.113.7', [false, false]);

    // since, denemelerden SONRA -> pencere disinda.
    const since = new Date('2026-07-22T10:30:00.000Z');
    const count = await run(() => attempts.countFailuresByEmail(Email.create(EMAIL), since));

    expect(count).toBe(0);
  });

  // --- Migration geri alinabilirligi -------------------------------------

  it('0003 migration geri alinabilir (down sonra up)', async () => {
    await runSqlFile('0003_identity_tables.down.sql');
    expect(await tableExists('users')).toBe(false);
    expect(await tableExists('refresh_tokens')).toBe(false);

    await runSqlFile('0003_identity_tables.sql');
    expect(await tableExists('users')).toBe(true);

    // Geri gelen tablo islevsel: kayit yine yazilabiliyor.
    await seedUser();
    const loaded = await run(() => users.findById(UserId.create(USER_ID)));
    expect(loaded?.id.value).toBe(USER_ID);
  });

  // --- yardimcilar -------------------------------------------------------

  function issueCode(): EmailVerificationCode {
    return EmailVerificationCode.issue({
      id: EmailVerificationCodeId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000e1'),
      userId: UserId.create(USER_ID),
      codeHash: VerificationCodeHash.fromDigest(DIGEST),
      expiresAt: EXPIRES,
    });
  }

  async function recordAttempts(email: string, ip: string, results: boolean[]): Promise<void> {
    for (const succeeded of results) {
      attemptSeq += 1;
      const attempt = LoginAttempt.record({
        id: LoginAttemptId.create(
          `018f3a2b-7c4d-7e1f-8a2b-00000000${String(attemptSeq).padStart(4, '0')}`,
        ),
        email: Email.create(email),
        ipAddress: IpAddress.create(ip),
        succeeded,
        attemptedAt: NOW,
      });
      await run(() => attempts.save(attempt));
    }
  }

  async function runSqlFile(file: string): Promise<void> {
    const sql = readFileSync(join('drizzle', file), 'utf8').replaceAll('--> statement-breakpoint', '');
    await database.ownerPool.query(sql);
  }

  async function tableExists(name: string): Promise<boolean> {
    const result = await database.ownerPool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'platform' AND table_name = $1",
      [name],
    );
    return (result.rowCount ?? 0) > 0;
  }
});
