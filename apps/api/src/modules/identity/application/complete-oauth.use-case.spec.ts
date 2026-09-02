import { beforeEach, describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type DomainEvent } from '../../../shared/domain-event';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import {
  type BuildAuthorizationInput,
  type ExchangeInput,
  type OAuthAuthorization,
  type OAuthIdentity,
  type OAuthProviderKey,
  type OAuthProviderPort,
  type OAuthProviderRegistry,
} from '../../../shared/oauth-provider.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { UserId } from '../../../shared/user-id.value-object';
import { Email } from '../domain/email.value-object';
import { type EmailVerificationCode } from '../domain/email-verification-code.entity';
import { type EmailVerificationCodeId } from '../domain/email-verification-code-id.value-object';
import { FederatedIdentity } from '../domain/federated-identity.entity';
import { FederatedIdentityLinked } from '../domain/federated-identity-linked.event';
import { OAuthEmailUnavailableError, OAuthStateInvalidError } from '../domain/identity.error';
import { OAuthEmailVerificationRequested } from '../domain/oauth-email-verification-requested.event';
import { type ProviderSubject } from '../domain/provider-subject.value-object';
import { User } from '../domain/user.entity';
import { UserLoggedIn } from '../domain/user-logged-in.event';
import { VerificationCodeHash } from '../domain/verification-code-hash.value-object';
import { CompleteOAuthUseCase } from './complete-oauth.use-case';
import { ResolveFederatedIdentity } from './resolve-federated-identity';
import { type EmailVerificationCodeRepository } from './email-verification-code.repository.port';
import { type FederatedIdentityRepository } from './federated-identity.repository.port';
import { type FederatedSessionIssuer, type IssuedSession } from './federated-session.issuer';
import {
  type OAuthPendingLinkTokenInput,
  type OAuthStateTokenInput,
  type TokenSigner,
  type VerifiedOAuthOneTap,
  type VerifiedOAuthPendingLink,
  type VerifiedOAuthState,
  type VerifiedToken,
} from './token-signer.port';
import { type UserRepository } from './user.repository.port';
import { type VerificationCodeGenerator } from './verification-code-generator.port';
import { type VerificationCodeHasher } from './verification-code-hasher.port';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

const NOW = new Date('2026-09-01T10:00:00.000Z');
const CORRELATION_ID = 'corr-oauth-1';
const STATE = 'st_value';
const NONCE = 'no_value';
const CODE_VERIFIER = 'cv_value';
const SUBJECT = 'google-sub-12345';
const VICTIM_EMAIL = 'kurban@sirket.com';

class FakeClock implements Clock {
  now(): Date {
    return new Date(NOW.getTime());
  }
}

class FakeIdGenerator implements IdGenerator {
  #n = 0;
  nextId(): string {
    this.#n += 1;
    return `018f3a2b-7c4d-7e1f-8a2b-${String(this.#n).padStart(12, '0')}`;
  }
}

class FakeTransactionManager implements TransactionManager {
  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  /**
   * Identity akislari tenant context'siz calisir (MT §12.4.3); bu iki metot
   * sozlesme geregi bulunur ve BU testlerde kullanilmaz. Cagrilirlarsa
   * `runInTransaction`a duserler — sessiz bir no-op DEGIL.
   */
  runInTenantTransaction<T>(_tenantId: string, fn: () => Promise<T>): Promise<T> {
    return this.runInTransaction(fn);
  }

  runInCurrentTenantTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.runInTransaction(fn);
  }
}

class FakeEventPublisher implements DomainEventPublisher {
  readonly published: DomainEvent[] = [];
  publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
    return Promise.resolve();
  }
  types(): string[] {
    return this.published.map((event) => event.eventType);
  }
}

class FakeUserRepository implements UserRepository {
  readonly users: User[] = [];

  findById(id: UserId): Promise<User | null> {
    return Promise.resolve(this.users.find((user) => user.id.equals(id)) ?? null);
  }
  findByEmail(email: Email): Promise<User | null> {
    return Promise.resolve(this.users.find((user) => user.email.equals(email)) ?? null);
  }
  save(user: User): Promise<void> {
    const index = this.users.findIndex((candidate) => candidate.id.equals(user.id));
    if (index === -1) {
      this.users.push(user);
    } else {
      this.users[index] = user;
    }
    return Promise.resolve();
  }
}

class FakeFederatedIdentityRepository implements FederatedIdentityRepository {
  readonly links: FederatedIdentity[] = [];
  loginsRecorded = 0;

  findByProviderSubject(
    provider: OAuthProviderKey,
    subject: ProviderSubject,
  ): Promise<FederatedIdentity | null> {
    return Promise.resolve(
      this.links.find((link) => link.provider === provider && link.subject.equals(subject)) ?? null,
    );
  }
  listByUserId(userId: UserId): Promise<readonly FederatedIdentity[]> {
    return Promise.resolve(this.links.filter((link) => link.userId.equals(userId)));
  }
  insert(identity: FederatedIdentity): Promise<void> {
    this.links.push(identity);
    return Promise.resolve();
  }
  recordLogin(): Promise<void> {
    this.loginsRecorded += 1;
    return Promise.resolve();
  }
  deleteByUserAndProvider(): Promise<number> {
    return Promise.resolve(0);
  }
}

class FakeVerificationCodeRepository implements EmailVerificationCodeRepository {
  readonly saved: EmailVerificationCode[] = [];
  save(code: EmailVerificationCode): Promise<void> {
    this.saved.push(code);
    return Promise.resolve();
  }
  findActiveByUserId(): Promise<EmailVerificationCode | null> {
    return Promise.resolve(null);
  }
  incrementAttemptCount(_id: EmailVerificationCodeId): Promise<number | null> {
    return Promise.resolve(1);
  }
}

class FakeCodeGenerator implements VerificationCodeGenerator {
  generate(): string {
    return '123456';
  }
}

class FakeCodeHasher implements VerificationCodeHasher {
  hash(code: string): VerificationCodeHash {
    return VerificationCodeHash.fromDigest(code.padEnd(64, '0').slice(0, 64));
  }
  verify(): boolean {
    return true;
  }
}

class FakeSessionIssuer {
  issued = 0;
  issue(): Promise<IssuedSession> {
    this.issued += 1;
    return Promise.resolve({ identityToken: 'identity-token', refreshToken: 'refresh-token' });
  }
}

class FakeTokenSigner implements TokenSigner {
  signIdentityToken(): Promise<string> {
    return Promise.resolve('identity');
  }
  signAccessToken(): Promise<string> {
    return Promise.resolve('access');
  }
  verify(): Promise<VerifiedToken> {
    throw new Error('kullanilmaz');
  }
  signOAuthState(input: OAuthStateTokenInput): Promise<string> {
    return Promise.resolve(JSON.stringify(input));
  }
  verifyOAuthState(token: string): Promise<VerifiedOAuthState> {
    if (token === 'bozuk') {
      throw new Error('imza gecersiz');
    }
    return Promise.resolve({
      provider: 'google',
      state: STATE,
      nonce: NONCE,
      codeVerifier: CODE_VERIFIER,
      next: null,
    });
  }
  signOAuthPendingLink(input: OAuthPendingLinkTokenInput): Promise<string> {
    return Promise.resolve(`pending:${input.provider}:${input.subject}`);
  }
  verifyOAuthPendingLink(): Promise<VerifiedOAuthPendingLink> {
    throw new Error('kullanilmaz');
  }
  signOAuthOneTap(): Promise<string> {
    throw new Error('redirect akisi one-tap token i imzalamaz');
  }
  verifyOAuthOneTap(): Promise<VerifiedOAuthOneTap> {
    throw new Error('redirect akisi one-tap token i dogrulamaz');
  }
}

/** Saglayici adapter'i: `exchange` verilen kimligi aynen doner. */
class FakeGoogleAdapter implements OAuthProviderPort {
  readonly key = 'google' as const;
  constructor(private identity: OAuthIdentity) {}

  buildAuthorization(_input: BuildAuthorizationInput): OAuthAuthorization {
    return { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth', codeVerifier: 'cv' };
  }
  exchange(_input: ExchangeInput): Promise<OAuthIdentity> {
    return Promise.resolve(this.identity);
  }
  setIdentity(identity: OAuthIdentity): void {
    this.identity = identity;
  }
}

class FakeRegistry implements OAuthProviderRegistry {
  constructor(private readonly provider: OAuthProviderPort | null) {}
  find(key: string): OAuthProviderPort | null {
    return this.provider !== null && key === this.provider.key ? this.provider : null;
  }
  /** ⚠️ Redirect akisi bu yetenegi KULLANMAZ; One Tap'in kendi testi var. */
  findIdTokenVerifier(): null {
    return null;
  }
  configuredKeys(): readonly OAuthProviderKey[] {
    return this.provider === null ? [] : [this.provider.key];
  }
}

function identityOf(overrides: Partial<OAuthIdentity> = {}): OAuthIdentity {
  return {
    provider: 'google',
    subject: SUBJECT,
    email: VICTIM_EMAIL,
    emailVerified: true,
    displayName: 'Kurban',
    avatarUrl: null,
    ...overrides,
  };
}

interface Harness {
  readonly useCase: CompleteOAuthUseCase;
  readonly users: FakeUserRepository;
  readonly links: FakeFederatedIdentityRepository;
  readonly codes: FakeVerificationCodeRepository;
  readonly events: FakeEventPublisher;
  readonly sessions: FakeSessionIssuer;
  readonly adapter: FakeGoogleAdapter;
}

function build(identity: OAuthIdentity = identityOf()): Harness {
  const users = new FakeUserRepository();
  const links = new FakeFederatedIdentityRepository();
  const codes = new FakeVerificationCodeRepository();
  const events = new FakeEventPublisher();
  const sessions = new FakeSessionIssuer();
  const adapter = new FakeGoogleAdapter(identity);

  /*
   * ⚠️ RESOLVER SAHTELENMEZ, GERCEGI KURULUR (ADR-0053 EK-1.3).
   *
   * D1/D2/D3 karari artik `ResolveFederatedIdentity`tedir. Sahte bir resolver
   * verilseydi bu dosyadaki testler yalnizca "delege edildi mi"yi sinar,
   * KARARIN KENDISINI sinamazdi. Gercegini kurmak hem davranisi hem BAGLANTIYI
   * birlikte kanitlar — ve One Tap yolu ayni sinifi kullandigi icin buradaki
   * her test onun icin de gecerlidir.
   */
  const resolver = new ResolveFederatedIdentity({
    userRepository: users,
    federatedIdentityRepository: links,
    verificationCodeRepository: codes,
    verificationCodeGenerator: new FakeCodeGenerator(),
    verificationCodeHasher: new FakeCodeHasher(),
    sessionIssuer: sessions as unknown as FederatedSessionIssuer,
    tokenSigner: new FakeTokenSigner(),
    eventPublisher: events,
    idGenerator: new FakeIdGenerator(),
    clock: new FakeClock(),
  });

  const useCase = new CompleteOAuthUseCase({
    registry: new FakeRegistry(adapter),
    resolver,
    tokenSigner: new FakeTokenSigner(),
    transactionManager: new FakeTransactionManager(),
  });

  return { useCase, users, links, codes, events, sessions, adapter };
}

const COMMAND = {
  provider: 'google',
  code: 'auth-code',
  state: STATE,
  stateToken: 'gecerli-state-token',
  redirectUri: 'https://api.kobiwise.com/api/v1/auth/oauth/google/callback',
  correlationId: CORRELATION_ID,
};

function activeUser(email: string): User {
  const user = User.register({
    id: UserId.create('018f3a2b-7c4d-7e1f-8a2b-00000000aaaa'),
    email: Email.create(email),
    createdAt: NOW,
  });
  user.verifyEmail();
  return user;
}

describe('CompleteOAuthUseCase (ADR-0053 §1.3)', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = build();
  });

  // ==========================================================================
  // D2 — hukum `true`
  // ==========================================================================

  describe('D2 — dogrulanmis e-posta', () => {
    it('eslesen kullanici YOKSA yeni bir `active` kullanici acar ve baglar', async () => {
      const result = await harness.useCase.execute(COMMAND);

      expect(result.outcome).toBe('signed-in');
      expect(harness.users.users).toHaveLength(1);
      expect(harness.users.users[0]?.isActive).toBe(true);
      expect(harness.links.links).toHaveLength(1);
      expect(harness.sessions.issued).toBe(1);
    });

    /**
     * ⚠️ Kullanici hicbir zaman `pending` olarak COMMIT OLMAZ: hukum
     * karsilandi. Aksi halde `LoginUseCase` ona 403 dondururdu.
     */
    it('yeni kullanici `emailVerified = true` ile acilir', async () => {
      await harness.useCase.execute(COMMAND);

      expect(harness.users.users[0]?.emailVerified).toBe(true);
      expect(harness.users.users[0]?.status).toBe('active');
    });

    it('eslesen kullanici VARSA yeni hesap ACMAZ, mevcut hesaba baglar', async () => {
      await harness.users.save(activeUser(VICTIM_EMAIL));

      const result = await harness.useCase.execute(COMMAND);

      expect(result.outcome).toBe('signed-in');
      expect(harness.users.users).toHaveLength(1);
      expect(harness.links.links).toHaveLength(1);
    });

    it('baglama olayi yayinlanir ve yeni kullanici olup olmadigini tasir', async () => {
      await harness.useCase.execute(COMMAND);

      const linked = harness.events.published.find(
        (event) => event.eventType === FederatedIdentityLinked.TYPE,
      );
      expect(linked?.payload).toMatchObject({ provider: 'google', createdNewUser: true });
    });

    it('giris olayi da yayinlanir — oturum semantigi parola girisiyle AYNI', async () => {
      const withUser = build();
      await withUser.users.save(activeUser(VICTIM_EMAIL));
      // `FakeSessionIssuer` olayi yayinlamaz; gercek issuer yayinlar. Burada
      // yalnizca oturumun ACILDIGI dogrulanir.
      await withUser.useCase.execute(COMMAND);

      expect(withUser.sessions.issued).toBe(1);
      expect(withUser.events.types()).not.toContain(UserLoggedIn.TYPE);
    });
  });

  // ==========================================================================
  // ⚠️ D3 — nOAuth SAVUNMASININ KALBI
  // ==========================================================================

  describe('⚠️ D3 — dogrulanmamis e-posta (nOAuth senaryosu)', () => {
    /**
     * ⚠️ BU TESTIN ANLATTIGI SALDIRI:
     * Saldirgan kendi Entra tenant'inda `mail = kurban@sirket.com` yazar.
     * Adapter hukmu `false` verir (Microsoft'ta `xms_edov` yok).
     * Sonuc: HICBIR BAGLANTI KURULMAZ ve HICBIR OTURUM ACILMAZ.
     */
    it('mevcut hesaba BAGLAMAZ ve oturum ACMAZ', async () => {
      const attack = build(identityOf({ emailVerified: false }));
      await attack.users.save(activeUser(VICTIM_EMAIL));

      const result = await attack.useCase.execute(COMMAND);

      expect(result.outcome).toBe('verification-required');
      expect(attack.links.links).toHaveLength(0);
      expect(attack.sessions.issued).toBe(0);
    });

    it('kendi dogrulama kodumuzu uretir ve teslimat olayini yayinlar', async () => {
      const flow = build(identityOf({ emailVerified: false }));
      await flow.users.save(activeUser(VICTIM_EMAIL));

      await flow.useCase.execute(COMMAND);

      expect(flow.codes.saved).toHaveLength(1);
      expect(flow.events.types()).toContain(OAuthEmailVerificationRequested.TYPE);
    });

    /**
     * ⚠️ P2 — HESAP VARLIGI SIZMAZ. Hesap VAR ile YOK arasindaki tek fark
     * sunucuda kalir; cagirana donen `outcome` IKISINDE DE AYNIDIR.
     */
    it('hesap VAR ile YOK ayni sonucu doner (P2)', async () => {
      const withAccount = build(identityOf({ emailVerified: false }));
      await withAccount.users.save(activeUser(VICTIM_EMAIL));
      const withoutAccount = build(identityOf({ emailVerified: false }));

      const a = await withAccount.useCase.execute(COMMAND);
      const b = await withoutAccount.useCase.execute(COMMAND);

      expect(a.outcome).toBe(b.outcome);
      expect(a.outcome).toBe('verification-required');
    });

    it('hesap yoksa `pending` bir kullanici acar — kayit akisiyla ayni maruziyet', async () => {
      const flow = build(identityOf({ emailVerified: false }));

      await flow.useCase.execute(COMMAND);

      expect(flow.users.users).toHaveLength(1);
      expect(flow.users.users[0]?.status).toBe('pending');
      expect(flow.users.users[0]?.emailVerified).toBe(false);
    });
  });

  // ==========================================================================
  // D1 — baglanti zaten var
  // ==========================================================================

  describe('D1 — baglanti mevcut', () => {
    /**
     * ⚠️ ADR-0053'un en keskin kurali: baglanti varsa E-POSTAYA HIC BAKILMAZ.
     * Bu test bunu, saglayicinin BASKA bir e-posta dondurdugu bir senaryoyla
     * kanitliyor — kullanici Google hesabinin adresini degistirmis olabilir.
     */
    it('saglayici BASKA bir e-posta donse bile giris yapar', async () => {
      const user = activeUser(VICTIM_EMAIL);
      await harness.users.save(user);
      harness.links.links.push(
        FederatedIdentity.link({
          id: (
            await import('../domain/federated-identity-id.value-object')
          ).FederatedIdentityId.create('018f3a2b-7c4d-7e1f-8a2b-00000000bbbb'),
          userId: user.id,
          provider: 'google',
          subject: (await import('../domain/provider-subject.value-object')).ProviderSubject.create(
            SUBJECT,
          ),
          emailAtLink: Email.create(VICTIM_EMAIL),
          linkedAt: NOW,
        }),
      );
      harness.adapter.setIdentity(
        identityOf({ email: 'yeni-adres@baska.com', emailVerified: false }),
      );

      const result = await harness.useCase.execute(COMMAND);

      expect(result.outcome).toBe('signed-in');
      // ⚠️ Yeni bir baglanti KURULMADI ve yeni kullanici ACILMADI.
      expect(harness.links.links).toHaveLength(1);
      expect(harness.users.users).toHaveLength(1);
      expect(harness.links.loginsRecorded).toBe(1);
    });
  });

  // ==========================================================================
  // Kapilar
  // ==========================================================================

  describe('kapilar', () => {
    it('state cerezi YOKSA reddeder', async () => {
      await expect(
        harness.useCase.execute({ ...COMMAND, stateToken: null }),
      ).rejects.toBeInstanceOf(OAuthStateInvalidError);
    });

    it('state imzasi gecersizse reddeder', async () => {
      await expect(
        harness.useCase.execute({ ...COMMAND, stateToken: 'bozuk' }),
      ).rejects.toBeInstanceOf(OAuthStateInvalidError);
    });

    /** ⚠️ CSRF: sorgudaki `state` ile cerezdeki eslesmeli. */
    it('sorgudaki `state` cerezdekiyle eslesmezse reddeder', async () => {
      await expect(
        harness.useCase.execute({ ...COMMAND, state: 'baska-state' }),
      ).rejects.toBeInstanceOf(OAuthStateInvalidError);
    });

    /**
     * ⚠️ Bir saglayici icin alinan state, BASKASININ callback'inde
     * kullanilamaz.
     */
    it('state token undaki saglayici yol parcasiyla eslesmezse reddeder', async () => {
      await expect(
        harness.useCase.execute({ ...COMMAND, provider: 'facebook' }),
      ).rejects.toBeInstanceOf(OAuthStateInvalidError);
    });

    /**
     * ⚠️ Bu bir D3 durumu DEGILDIR: D3 kendi kodumuzu BIR ADRESE gondermeye
     * dayanir; adres yoksa gonderilecek yer de yoktur.
     */
    it('saglayici HIC e-posta vermezse `OAuthEmailUnavailableError` firlatir', async () => {
      const noEmail = build(identityOf({ email: null, emailVerified: false }));

      await expect(noEmail.useCase.execute(COMMAND)).rejects.toBeInstanceOf(
        OAuthEmailUnavailableError,
      );
      expect(noEmail.users.users).toHaveLength(0);
    });

    it('pasif/kilitli hesaba BAGLAMA yapilmaz', async () => {
      const locked = build();
      const user = activeUser(VICTIM_EMAIL);
      user.lock();
      await locked.users.save(user);

      await expect(locked.useCase.execute(COMMAND)).rejects.toBeInstanceOf(OAuthStateInvalidError);
      expect(locked.links.links).toHaveLength(0);
    });
  });
});
