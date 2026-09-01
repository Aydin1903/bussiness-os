import { type Clock } from '../../../shared/clock.port';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { isOAuthProviderKey, type OAuthProviderKey } from '../../../shared/oauth-provider.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { Email } from '../domain/email.value-object';
import { type EmailVerificationCode } from '../domain/email-verification-code.entity';
import { FederatedIdentity } from '../domain/federated-identity.entity';
import { FederatedIdentityId } from '../domain/federated-identity-id.value-object';
import { FederatedIdentityLinked } from '../domain/federated-identity-linked.event';
import { ProviderSubject } from '../domain/provider-subject.value-object';
import { type User } from '../domain/user.entity';
import { type EmailVerificationCodeRepository } from './email-verification-code.repository.port';
import { type FederatedIdentityRepository } from './federated-identity.repository.port';
import { type FederatedSessionIssuer, type IssuedSession } from './federated-session.issuer';
import { type TokenSigner } from './token-signer.port';
import { type UserRepository } from './user.repository.port';
import { type VerificationCodeHasher } from './verification-code-hasher.port';

export interface VerifyOAuthEmailCommand {
  /** Imzali bekleyen baglama cerezinin degeri. Yoksa `null`. */
  readonly pendingLinkToken: string | null;
  readonly code: string;
  readonly correlationId: string;
}

/**
 * `invalid` TEK sonuctur: token yok/gecersiz, kullanici yok, kod yok, suresi
 * dolmus, hakki tukenmis, kod yanlis — HEPSI ayni degere duser.
 */
export type VerifyOAuthEmailOutcome = 'linked' | 'invalid';

export type VerifyOAuthEmailResult =
  { readonly outcome: 'linked'; readonly session: IssuedSession } | { readonly outcome: 'invalid' };

const INVALID: VerifyOAuthEmailResult = Object.freeze({ outcome: 'invalid' });

export interface VerifyOAuthEmailDependencies {
  readonly userRepository: UserRepository;
  readonly federatedIdentityRepository: FederatedIdentityRepository;
  readonly verificationCodeRepository: EmailVerificationCodeRepository;
  readonly verificationCodeHasher: VerificationCodeHasher;
  readonly sessionIssuer: FederatedSessionIssuer;
  readonly tokenSigner: TokenSigner;
  readonly eventPublisher: DomainEventPublisher;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

/**
 * D3'un IKINCI adimi: kodu dogrular ve ANCAK O ZAMAN baglar (ADR-0053 §1.3).
 *
 * ============================================================================
 * ⚠️ NEDEN SONUC DONDURUR, HATA FIRLATMAZ
 * ============================================================================
 * `VerifyEmailUseCase` ile BIREBIR ayni gerekce: deneme sayaci dogrulama ile
 * AYNI TRANSACTION'da atomik olarak artar. Red bir exception ile bildirilseydi
 * transaction geri alinir ve SAYACIN ARTISI DA SILINIRDI — 5 denemelik sinir
 * (ADR-0019) hicbir zaman dolmaz, 6 haneli kod sinirsiz denenebilirdi.
 *
 * ============================================================================
 * ⚠️ IKI DURUM, TEK KOD YOLU — VE FARK BURADA BELIRLENIR
 * ============================================================================
 * D3'e iki yoldan gelinmis olabilir ve hangisi oldugu ancak BURADA, sunucuda
 * belirlenir (cagirana ve kullaniciya hicbir noktada soylenmez):
 *
 *   - kullanici `pending`ti (yeni acilmisti) -> `verifyEmail()` onu `active`
 *     yapar; bu, klasik kayit akisinin tam olarak yaptigi seydir.
 *   - kullanici ZATEN `active`ti -> ⚠️ `verifyEmail()` CAGRILMAZ. Cagrilsaydi
 *     `pending -> active` gecis kurali ihlal edilir ve `assertTransition`
 *     patlardi; dahasi, zaten dogrulanmis bir e-postayi "yeniden dogrulamak"
 *     anlamsizdir.
 *
 * Iki durumda da sonuc AYNIDIR: baglanti kurulur ve oturum acilir.
 * ============================================================================
 */
export class VerifyOAuthEmailUseCase {
  constructor(private readonly deps: VerifyOAuthEmailDependencies) {}

  async execute(command: VerifyOAuthEmailCommand): Promise<VerifyOAuthEmailResult> {
    const pending = await this.#readPendingLink(command.pendingLinkToken);
    if (pending === null) {
      return INVALID;
    }

    return this.deps.transactionManager.runInTransaction(() => this.#verify(pending, command));
  }

  /**
   * ⚠️ Token dogrulanamazsa `invalid` doner, FIRLATMAZ — cerez suresi dolmus
   * olabilir ve bu, kullanicinin yapabilecegi bir hatadir, bir saldiri degil.
   * Sonucun digerlerinden ayirt EDILEMEMESI ise bilinclidir.
   */
  async #readPendingLink(token: string | null): Promise<{
    readonly provider: OAuthProviderKey;
    readonly subject: ProviderSubject;
    readonly email: Email;
  } | null> {
    if (token === null) {
      return null;
    }

    try {
      const verified = await this.deps.tokenSigner.verifyOAuthPendingLink(token);
      if (!isOAuthProviderKey(verified.provider)) {
        return null;
      }
      return {
        provider: verified.provider,
        subject: ProviderSubject.create(verified.subject),
        email: Email.create(verified.email),
      };
    } catch {
      return null;
    }
  }

  async #verify(
    pending: { provider: OAuthProviderKey; subject: ProviderSubject; email: Email },
    command: VerifyOAuthEmailCommand,
  ): Promise<VerifyOAuthEmailResult> {
    const now = this.deps.clock.now();

    const user = await this.deps.userRepository.findByEmail(pending.email);
    // ⚠️ `deactivated`/`locked` kullanici burada da elenir; sebep soylenmez.
    if (user === null || user.status === 'deactivated' || user.status === 'locked') {
      return INVALID;
    }

    const code = await this.deps.verificationCodeRepository.findActiveByUserId(user.id);
    if (code?.isVerifiable(now) !== true) {
      return INVALID;
    }

    // ⚠️ Sayac HMAC KIYASINDAN ONCE artar: kiyas once yapilsaydi, dogru kodu
    // bulan saldirgan hicbir deneme harcamamis olurdu (`VerifyEmailUseCase`in
    // ayni karari).
    if (!(await this.#registerAttempt(code))) {
      return INVALID;
    }

    if (!this.deps.verificationCodeHasher.verify(command.code, code.codeHash)) {
      return INVALID;
    }

    return this.#complete({ user, code, pending, now, correlationId: command.correlationId });
  }

  /** Denemeyi ATOMIK isler; kod hala denenebilirse `true`. */
  async #registerAttempt(code: EmailVerificationCode): Promise<boolean> {
    const attemptCount = await this.deps.verificationCodeRepository.incrementAttemptCount(code.id);

    if (attemptCount === null) {
      return false;
    }

    code.registerFailedAttempt();
    return true;
  }

  /** Basari yolu: kod + kullanici + baglanti + oturum + olay, hepsi birlikte. */
  async #complete(input: {
    readonly user: User;
    readonly code: EmailVerificationCode;
    readonly pending: { provider: OAuthProviderKey; subject: ProviderSubject; email: Email };
    readonly now: Date;
    readonly correlationId: string;
  }): Promise<VerifyOAuthEmailResult> {
    const { user, code, pending, now, correlationId } = input;

    code.consume(now);
    await this.deps.verificationCodeRepository.save(code);

    // ⚠️ Yalnizca `pending` kullanici aktiflestirilir — sinif yorumundaki blok.
    const createdNewUser = user.status === 'pending';
    if (createdNewUser) {
      user.verifyEmail();
      await this.deps.userRepository.save(user);
    }

    const link = FederatedIdentity.link({
      id: FederatedIdentityId.create(this.deps.idGenerator.nextId()),
      userId: user.id,
      provider: pending.provider,
      subject: pending.subject,
      emailAtLink: pending.email,
      linkedAt: now,
    });

    await this.deps.federatedIdentityRepository.insert(link);
    await this.deps.eventPublisher.publish(
      FederatedIdentityLinked.create({
        eventId: this.deps.idGenerator.nextId(),
        userId: user.id,
        provider: pending.provider,
        createdNewUser,
        occurredAt: now,
        correlationId,
      }),
    );

    const session = await this.deps.sessionIssuer.issue({ user, now, correlationId });
    return { outcome: 'linked', session };
  }
}
