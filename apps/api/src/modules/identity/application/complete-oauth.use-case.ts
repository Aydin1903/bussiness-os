import { type Clock } from '../../../shared/clock.port';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import {
  type OAuthIdentity,
  type OAuthProviderKey,
  type OAuthProviderRegistry,
} from '../../../shared/oauth-provider.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { UserId } from '../../../shared/user-id.value-object';
import { Email } from '../domain/email.value-object';
import {
  EmailVerificationCode,
  VERIFICATION_CODE_TTL_MINUTES,
} from '../domain/email-verification-code.entity';
import { EmailVerificationCodeId } from '../domain/email-verification-code-id.value-object';
import { FederatedIdentity } from '../domain/federated-identity.entity';
import { FederatedIdentityId } from '../domain/federated-identity-id.value-object';
import { FederatedIdentityLinked } from '../domain/federated-identity-linked.event';
import {
  OAuthEmailUnavailableError,
  OAuthProviderNotConfiguredError,
  OAuthStateInvalidError,
} from '../domain/identity.error';
import { OAuthEmailVerificationRequested } from '../domain/oauth-email-verification-requested.event';
import { ProviderSubject } from '../domain/provider-subject.value-object';
import { User } from '../domain/user.entity';
import { type EmailVerificationCodeRepository } from './email-verification-code.repository.port';
import { type FederatedIdentityRepository } from './federated-identity.repository.port';
import { type FederatedSessionIssuer, type IssuedSession } from './federated-session.issuer';
import { type TokenSigner } from './token-signer.port';
import { type UserRepository } from './user.repository.port';
import { type VerificationCodeGenerator } from './verification-code-generator.port';
import { type VerificationCodeHasher } from './verification-code-hasher.port';

const MINUTE_MS = 60_000;

export interface CompleteOAuthCommand {
  readonly provider: string;
  /** Saglayicidan donen yetkilendirme kodu. */
  readonly code: string;
  /** Sorgudaki `state` — cerezdeki ile karsilastirilir (CSRF). */
  readonly state: string;
  /** Imzali state cerezinin degeri. Yoksa `null`. */
  readonly stateToken: string | null;
  readonly redirectUri: string;
  readonly correlationId: string;
}

/**
 * Uc daldan hangisinin kostugunu cagirana soyler (ADR-0053 §1.3).
 *
 * ⚠️ D1 ile D2 AYNI SONUCA duser (`signed-in`) ve bu bilinclidir: kullanici
 * acisindan ikisi de "girdim"dir. Ayirt etmek, cagiranin (controller) hicbir
 * isine yaramayacak bir ayrimi tasimasi demekti.
 */
export type CompleteOAuthResult =
  | {
      readonly outcome: 'signed-in';
      readonly session: IssuedSession;
      /** Girisin ardindan gidilecek site-ici yol (state token'indan). */
      readonly next: string | null;
    }
  | {
      /** ⚠️ D3 — kod gonderildi, HENUZ HICBIR BAGLANTI KURULMADI. */
      readonly outcome: 'verification-required';
      /** ⚠️ IMZALI bekleyen baglama token'i — `HttpOnly` cereze yazilir. */
      readonly pendingLinkToken: string;
      readonly next: string | null;
    };

export interface CompleteOAuthDependencies {
  readonly registry: OAuthProviderRegistry;
  readonly userRepository: UserRepository;
  readonly federatedIdentityRepository: FederatedIdentityRepository;
  readonly verificationCodeRepository: EmailVerificationCodeRepository;
  readonly verificationCodeGenerator: VerificationCodeGenerator;
  readonly verificationCodeHasher: VerificationCodeHasher;
  readonly sessionIssuer: FederatedSessionIssuer;
  readonly tokenSigner: TokenSigner;
  readonly eventPublisher: DomainEventPublisher;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

/**
 * OAuth callback'ini isler — ⚠️ **ADR-0053'UN KALBI**.
 *
 * ============================================================================
 * ⚠️ UC DAL, TEK KURAL: "AYNI E-POSTA" ASLA KENDI BASINA "AYNI INSAN" DEGILDIR
 * ============================================================================
 *   D1  `(provider, sub)` zaten bagli
 *       -> giris. ⚠️ E-POSTAYA HIC BAKILMAZ, degismis olsa bile. Baglanti bir
 *          kez kurulur; e-posta ondan sonra bir daha ASLA kimlik anahtari olmaz.
 *
 *   D2  bagli degil + adapter hukmu `emailVerified === true`
 *       -> eslesen `User` varsa BAGLANIR, yoksa yeni `User` acilir (`active`).
 *
 *   D3  bagli degil + hukum `false`
 *       -> ⚠️ KENDI 6 haneli kodumuz gonderilir. Kod dogrulanana kadar
 *          HICBIR BAGLAMA VE HICBIR GIRIS OLMAZ.
 *
 * ⚠️ D3 BIR GEVSETME DEGIL BIR GUCLENDIRMEDIR: bu sistemin guvenlik tavani
 * zaten "gelen kutusuna sahip olmak = hesaba sahip olmak"tir (ADR-0024 parola
 * sifirlamayi tam olarak buna dayandirir). D3, ucuncu bir tarafin
 * DOGRULANMAMIS iddiasini alip BIZIM birinci elden dogrulamamiza cevirir —
 * zayif bir kaniti mevcut tavanin TAM OLARAK SEVIYESINE cikarir, ustune degil.
 *
 * ⚠️ D3'te saldirgan KAYBEDER: nOAuth senaryosunda kod KURBANIN gelen
 * kutusuna gider.
 *
 * ============================================================================
 * ⚠️ D3 HESAP VARLIGINI SIZDIRMAZ
 * ============================================================================
 * Hesap var da olsa yok da olsa cagirana donen sonuc AYNIDIR
 * (`verification-required`) ve gonderilen e-posta metni de AYNIDIR. Baglama mi
 * yoksa yeni hesap acma mi oldugu KOD DOGRULANDIKTAN SONRA, sunucuda
 * belirlenir (`VerifyOAuthEmailUseCase`).
 *
 * ⚠️ Bu yuzden bu use case D3'te kullaniciyi ACAR ama BAGLAMAZ: acmak
 * `POST /auth/register`in zaten yaptigi seydir (ayni maruziyet), baglamak ise
 * kanitlanmamis bir iddiaya dayanmak olurdu.
 * ============================================================================
 */
export class CompleteOAuthUseCase {
  constructor(private readonly deps: CompleteOAuthDependencies) {}

  async execute(command: CompleteOAuthCommand): Promise<CompleteOAuthResult> {
    const state = await this.#verifyState(command);
    const provider = this.deps.registry.find(command.provider);

    if (provider === null) {
      throw new OAuthProviderNotConfiguredError();
    }

    // ⚠️ AG CAGRISI TRANSACTION'IN DISINDA: token exchange + JWKS saniyeler
    // surebilir; veritabani baglantisini o sure boyunca tutmak, es zamanli
    // girislerde havuzu dogrudan istek sayisiyla carpardi (`LoginUseCase`in
    // Argon2'yi transaction disinda calistirmasiyla ayni gerekce).
    const identity = await provider.exchange({
      code: command.code,
      codeVerifier: state.codeVerifier,
      nonce: state.nonce,
      redirectUri: command.redirectUri,
    });

    return this.deps.transactionManager.runInTransaction(() =>
      this.#resolve(identity, command.correlationId, state.next),
    );
  }

  /**
   * State cerezini dogrular ve sorgudaki `state` ile karsilastirir.
   *
   * ⚠️ DORT RET SEBEBI DE AYNI HATAYA DUSER (cerez yok / imza gecersiz / suresi
   * dolmus / eslesmiyor): hangisinin gerceklestigini soylemek, CSRF denemesi
   * yapan birine hangi parcasinin tuttugunu ogretirdi.
   *
   * ⚠️ `state.provider` ile YOL PARCASI da karsilastirilir: aksi halde bir
   * saglayici icin alinan state, baskasinin callback'inde kullanilabilirdi.
   */
  async #verifyState(command: CompleteOAuthCommand): Promise<{
    readonly nonce: string;
    readonly codeVerifier: string;
    readonly next: string | null;
  }> {
    if (command.stateToken === null) {
      throw new OAuthStateInvalidError();
    }

    let verified;
    try {
      verified = await this.deps.tokenSigner.verifyOAuthState(command.stateToken);
    } catch {
      throw new OAuthStateInvalidError();
    }

    if (verified.state !== command.state || verified.provider !== command.provider) {
      throw new OAuthStateInvalidError();
    }

    return { nonce: verified.nonce, codeVerifier: verified.codeVerifier, next: verified.next };
  }

  async #resolve(
    identity: OAuthIdentity,
    correlationId: string,
    next: string | null,
  ): Promise<CompleteOAuthResult> {
    const now = this.deps.clock.now();
    const subject = ProviderSubject.create(identity.subject);

    // ---- D1 -----------------------------------------------------------------
    const existingLink = await this.deps.federatedIdentityRepository.findByProviderSubject(
      identity.provider,
      subject,
    );

    if (existingLink !== null) {
      return this.#signInExistingLink(existingLink, now, correlationId, next);
    }

    // ⚠️ E-POSTA HIC YOKSA DEVAM EDILEMEZ ve bu bir D3 DURUMU DEGILDIR:
    // D3 kendi kodumuzu BIR ADRESE gondermeye dayanir; adres yoksa
    // gonderilecek yer de yoktur. `platform.users.email` `NOT NULL`dur ve
    // kimligin BIZIM tarafimizdaki capasidir.
    if (identity.email === null) {
      throw new OAuthEmailUnavailableError();
    }
    const email = Email.create(identity.email);

    return identity.emailVerified
      ? this.#linkVerified(identity, subject, email, now, correlationId, next)
      : this.#requestOwnVerification(identity, email, now, correlationId, next);
  }

  /** D1 — baglanti var. Kimlik sorusu burada baslar ve BITER. */
  async #signInExistingLink(
    link: Awaited<ReturnType<FederatedIdentityRepository['findByProviderSubject']>> & object,
    now: Date,
    correlationId: string,
    next: string | null,
  ): Promise<CompleteOAuthResult> {
    const user = await this.deps.userRepository.findById(link.userId);

    // ⚠️ Kullanici pasif/kilitli ise giris YAPILMAZ ve sebep SOYLENMEZ —
    // `LoginUseCase`in `InvalidCredentialsError` davranisiyla ayni disiplin.
    // Burada kullaniciya donen sey callback'in genel hatasidir.
    if (!user?.isActive) {
      throw new OAuthStateInvalidError();
    }

    link.recordLogin(now);
    await this.deps.federatedIdentityRepository.recordLogin(link);

    const session = await this.deps.sessionIssuer.issue({ user, now, correlationId });
    return { outcome: 'signed-in', session, next };
  }

  /** D2 — hukum `true`. Mevcut hesaba baglanir ya da yeni hesap acilir. */
  async #linkVerified(
    identity: OAuthIdentity,
    subject: ProviderSubject,
    email: Email,
    now: Date,
    correlationId: string,
    next: string | null,
  ): Promise<CompleteOAuthResult> {
    const existingUser = await this.deps.userRepository.findByEmail(email);

    // ⚠️ Pasif/kilitli bir hesaba baglama YAPILMAZ: baglamak, kilidi bir yan
    // kapidan asmanin yolu olurdu.
    if (existingUser !== null && !existingUser.isActive) {
      throw new OAuthStateInvalidError();
    }

    const user = existingUser ?? this.#registerVerifiedUser(email, now);
    if (existingUser === null) {
      await this.deps.userRepository.save(user);
    }

    await this.#link({
      user,
      provider: identity.provider,
      subject,
      email,
      now,
      correlationId,
      createdNewUser: existingUser === null,
    });

    const session = await this.deps.sessionIssuer.issue({ user, now, correlationId });
    return { outcome: 'signed-in', session, next };
  }

  /**
   * ⚠️ `register()` + `verifyEmail()` AYNI TRANSACTION'DA.
   *
   * Kullanici hicbir zaman `pending` olarak commit OLMAZ: hukum karsilandi,
   * yani e-postanin sahipligi saglayici tarafindan dogrulandi. Iki adimin
   * arasinda bir commit olsaydi, saglayici cevabi dogru gelmis bir kullanici
   * bir sure "dogrulanmamis" gorunur ve `LoginUseCase` ona 403 dondururdu.
   */
  #registerVerifiedUser(email: Email, now: Date): User {
    const user = User.register({
      id: UserId.create(this.deps.idGenerator.nextId()),
      email,
      createdAt: now,
    });
    user.verifyEmail();
    return user;
  }

  /**
   * D3 — hukum `false`. ⚠️ BAGLAMA YAPILMAZ; yalnizca kod gonderilir.
   *
   * Kullanici yoksa `pending` olarak ACILIR ve bu, `POST /auth/register`in
   * zaten yaptigi seydir (ayni maruziyet). Varsa DOKUNULMAZ — mevcut hesabin
   * durumu bir saglayici iddiasiyla degistirilemez.
   */
  async #requestOwnVerification(
    identity: OAuthIdentity,
    email: Email,
    now: Date,
    correlationId: string,
    next: string | null,
  ): Promise<CompleteOAuthResult> {
    const existingUser = await this.deps.userRepository.findByEmail(email);

    // ⚠️ Pasif/kilitli hesapta kod GONDERILMEZ — ama cagirana donen sonuc yine
    // `verification-required`tir. Aksi halde hesabin DURUMU sizardi (P2):
    // saldirgan "kod istendi" ile "istenmedi" farkindan kilitli hesaplari
    // ayirt ederdi.
    if (existingUser !== null && !existingUser.isActive) {
      return this.#pendingLinkResult(identity, email, next);
    }

    const user =
      existingUser ??
      User.register({
        id: UserId.create(this.deps.idGenerator.nextId()),
        email,
        createdAt: now,
      });
    if (existingUser === null) {
      await this.deps.userRepository.save(user);
    }

    await this.#issueVerificationCode(user, identity.provider, email, now, correlationId);

    return this.#pendingLinkResult(identity, email, next);
  }

  async #issueVerificationCode(
    user: User,
    provider: OAuthProviderKey,
    email: Email,
    now: Date,
    correlationId: string,
  ): Promise<void> {
    const rawCode = this.deps.verificationCodeGenerator.generate();

    const code = EmailVerificationCode.issue({
      id: EmailVerificationCodeId.create(this.deps.idGenerator.nextId()),
      userId: user.id,
      codeHash: this.deps.verificationCodeHasher.hash(rawCode),
      expiresAt: new Date(now.getTime() + VERIFICATION_CODE_TTL_MINUTES * MINUTE_MS),
    });

    await this.deps.verificationCodeRepository.save(code);
    await this.deps.eventPublisher.publish(
      OAuthEmailVerificationRequested.create({
        eventId: this.deps.idGenerator.nextId(),
        userId: user.id,
        email,
        provider,
        verificationCode: rawCode,
        occurredAt: now,
        correlationId,
      }),
    );
  }

  async #pendingLinkResult(
    identity: OAuthIdentity,
    email: Email,
    next: string | null,
  ): Promise<CompleteOAuthResult> {
    const pendingLinkToken = await this.deps.tokenSigner.signOAuthPendingLink({
      provider: identity.provider,
      subject: identity.subject,
      email: email.value,
    });

    return { outcome: 'verification-required', pendingLinkToken, next };
  }

  async #link(input: {
    readonly user: User;
    readonly provider: OAuthProviderKey;
    readonly subject: ProviderSubject;
    readonly email: Email;
    readonly now: Date;
    readonly correlationId: string;
    readonly createdNewUser: boolean;
  }): Promise<void> {
    const link = FederatedIdentity.link({
      id: FederatedIdentityId.create(this.deps.idGenerator.nextId()),
      userId: input.user.id,
      provider: input.provider,
      subject: input.subject,
      emailAtLink: input.email,
      linkedAt: input.now,
    });

    await this.deps.federatedIdentityRepository.insert(link);
    await this.deps.eventPublisher.publish(
      FederatedIdentityLinked.create({
        eventId: this.deps.idGenerator.nextId(),
        userId: input.user.id,
        provider: input.provider,
        createdNewUser: input.createdNewUser,
        occurredAt: input.now,
        correlationId: input.correlationId,
      }),
    );
  }
}
