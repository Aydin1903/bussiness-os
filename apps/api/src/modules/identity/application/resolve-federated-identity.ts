import { type Clock } from '../../../shared/clock.port';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type OAuthIdentity, type OAuthProviderKey } from '../../../shared/oauth-provider.port';
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
import { OAuthEmailUnavailableError, OAuthStateInvalidError } from '../domain/identity.error';
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

/**
 * Uc daldan hangisinin kostugunu cagirana soyler (ADR-0053 §1.3).
 *
 * ⚠️ D1 ile D2 AYNI SONUCA duser (`signed-in`) ve bu bilinclidir: kullanici
 * acisindan ikisi de "girdim"dir.
 */
export type ResolveFederatedIdentityResult =
  | {
      readonly outcome: 'signed-in';
      readonly session: IssuedSession;
      /** Girisin ardindan gidilecek site-ici yol (varsa). */
      readonly next: string | null;
    }
  | {
      /** ⚠️ D3 — kod gonderildi, HENUZ HICBIR BAGLANTI KURULMADI. */
      readonly outcome: 'verification-required';
      /** ⚠️ IMZALI bekleyen baglama token'i — `HttpOnly` cereze yazilir. */
      readonly pendingLinkToken: string;
      readonly next: string | null;
    };

export interface ResolveFederatedIdentityDependencies {
  readonly userRepository: UserRepository;
  readonly federatedIdentityRepository: FederatedIdentityRepository;
  readonly verificationCodeRepository: EmailVerificationCodeRepository;
  readonly verificationCodeGenerator: VerificationCodeGenerator;
  readonly verificationCodeHasher: VerificationCodeHasher;
  readonly sessionIssuer: FederatedSessionIssuer;
  readonly tokenSigner: TokenSigner;
  readonly eventPublisher: DomainEventPublisher;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

/**
 * ⚠️ **D1/D2/D3 KARARININ TEK SAHIBI** (ADR-0053 §1.3, EK-1.3).
 *
 * ============================================================================
 * ⚠️ NEDEN AYRI BIR ISBIRLIKCI — VE NEDEN KOPYA CIKARILMADI
 * ============================================================================
 * Bu mantik bugun IKI giristen besleniyor:
 *
 *   `CompleteOAuthUseCase`   — redirect akisi (`code` -> token exchange)
 *   `CompleteOneTapUseCase`  — One Tap akisi (ID token -> dogrulama)
 *
 * ⚠️ Ikinci giris eklenirken D1/D2/D3'un KOPYASI CIKARILMADI ve bu, EK-1.3'un
 * en baglayici maddesidir. Kopya cikarilsaydi hata SESSIZ olurdu: ornegin
 * nOAuth savunmasi (dogrulanmamis e-postanin D3'e dusmesi) bir yolda degisip
 * digerinde degismezse, kimse fark etmeden BIR GIRIS YOLU KORUMASIZ kalirdi.
 *
 * ⚠️ Bu, `FederatedSessionIssuer` kopyasinin `session-tokens.ts` ile
 * birlestirilmesiyle AYNI derstir — bu kez borç doğmadan, bastan uygulandi.
 *
 * ============================================================================
 * ⚠️ PAYLASILAN SEY DAR: yalnizca KARAR
 * ============================================================================
 * Transaction'i CAGIRAN acar; cerez yazma ve yonlendirme cagiranin isidir. Bu
 * sinif kendi transaction'ini ACMAZ — iki akisin da bu karari BASKA seylerle
 * birlikte atomik yapmasi gerekir.
 * ============================================================================
 */
export class ResolveFederatedIdentity {
  constructor(private readonly deps: ResolveFederatedIdentityDependencies) {}

  async resolve(
    identity: OAuthIdentity,
    correlationId: string,
    next: string | null,
  ): Promise<ResolveFederatedIdentityResult> {
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
  ): Promise<ResolveFederatedIdentityResult> {
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
  ): Promise<ResolveFederatedIdentityResult> {
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
  ): Promise<ResolveFederatedIdentityResult> {
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
  ): Promise<ResolveFederatedIdentityResult> {
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
