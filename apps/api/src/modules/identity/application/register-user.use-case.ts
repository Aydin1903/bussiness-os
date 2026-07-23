import { type Clock } from '../../../shared/clock.port';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { UserId } from '../../../shared/user-id.value-object';
import { Credential } from '../domain/credential.entity';
import { Email } from '../domain/email.value-object';
import {
  EmailVerificationCode,
  VERIFICATION_CODE_TTL_MINUTES,
} from '../domain/email-verification-code.entity';
import { EmailVerificationCodeId } from '../domain/email-verification-code-id.value-object';
import { type PasswordHash } from '../domain/password-hash.value-object';
import { assertPasswordPolicy } from '../domain/password-policy';
import { User } from '../domain/user.entity';
import { type VerificationCodeHash } from '../domain/verification-code-hash.value-object';
import { UserRegistered } from '../domain/user-registered.event';
import { type CredentialRepository } from './credential.repository.port';
import { type EmailVerificationCodeRepository } from './email-verification-code.repository.port';
import { type PasswordHasher } from './password-hasher.port';
import { type UserRepository } from './user.repository.port';
import { type VerificationCodeGenerator } from './verification-code-generator.port';
import { type VerificationCodeHasher } from './verification-code-hasher.port';

const MINUTE_MS = 60_000;

/**
 * Yeni bir kullanici kaydeder (AUTH_ARCHITECTURE 8).
 *
 * ============================================================================
 * YANIT HER ZAMAN AYNIDIR — hesap varlik oracle'i olmamali
 * ============================================================================
 * E-posta kayitli olsa da olmasa da bu use case AYNI seyi dondurur (`void`) ve
 * hicbir sey firlatmaz. Kayitliysa YENI KULLANICI OLUSTURULMAZ ama cagiran
 * taraf bunu ayirt EDEMEZ (P2). Aksi halde uc nokta "bu e-posta kayitli mi"
 * sorusunu yanitlayan bir oracle'a donerdi.
 *
 * ZAMANLAMA DA AYNI OLMALI: parola hash'leme (Argon2, ~100 ms) e-posta
 * kontrolunden ONCE ve HER ZAMAN yapilir. Yalnizca "yeni kullanici" dalinda
 * hash'lenseydi, kayitli e-posta belirgin sekilde daha HIZLI yanit doner ve
 * zamanlama bir oracle olurdu.
 *
 * Yan fayda: Argon2 transaction'in DISINDA calisir — pahali hash boyunca
 * veritabani baglantisi tutulmaz.
 * ============================================================================
 *
 * Kullanici + credential + kod + event TEK TRANSACTION'da yazilir (§8.1):
 * parolasiz kullanici veya kodsuz bekleyen hesap olusamaz.
 */
export interface RegisterUserCommand {
  readonly email: string;
  readonly password: string;
  /** HTTP sinirindan gelir; event ve loglar uzerinden uctan uca izleme saglar. */
  readonly correlationId: string;
}

/** DEVELOPMENT_RULES 2.5: 3'ten fazla bagimlilik obje olarak alinir. */
export interface RegisterUserDependencies {
  readonly userRepository: UserRepository;
  readonly credentialRepository: CredentialRepository;
  readonly verificationCodeRepository: EmailVerificationCodeRepository;
  readonly passwordHasher: PasswordHasher;
  readonly verificationCodeGenerator: VerificationCodeGenerator;
  readonly verificationCodeHasher: VerificationCodeHasher;
  readonly eventPublisher: DomainEventPublisher;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

export class RegisterUserUseCase {
  constructor(private readonly deps: RegisterUserDependencies) {}

  async execute(command: RegisterUserCommand): Promise<void> {
    // 1. Politika ve bicim, veritabanina dokunmadan once dogrulanir. Ihlal
    //    422 uretir ve hesap varligiyla ilgisizdir — sizinti yok.
    assertPasswordPolicy(command.password);
    const email = Email.create(command.email);

    // 2. Pahali/kripto isler transaction'in DISINDA ve HER ZAMAN (bkz. sinif yorumu).
    const passwordHash = await this.deps.passwordHasher.hash(command.password);
    const verificationCode = this.deps.verificationCodeGenerator.generate();
    const codeHash = this.deps.verificationCodeHasher.hash(verificationCode);

    const registration = this.#build({
      email,
      passwordHash,
      verificationCode,
      codeHash,
      correlationId: command.correlationId,
    });

    // 3. Identity akislari tenant context'siz calisir (12.4.3).
    await this.deps.transactionManager.runInTransaction(async () => {
      if ((await this.deps.userRepository.findByEmail(email)) !== null) {
        // Sessizce vazgec: yeni kullanici OLUSTURULMAZ, ama cagiran taraf
        // bunu ayirt edemez.
        return;
      }

      await this.deps.userRepository.save(registration.user);
      await this.deps.credentialRepository.save(registration.credential);
      await this.deps.verificationCodeRepository.save(registration.code);

      // Gonderim event uzerinden tetiklenir; use case EmailPort'u DOGRUDAN
      // cagirmaz (§7.7) — aksi halde transaction geri alinsa bile e-posta giderdi.
      await this.deps.eventPublisher.publish(registration.event);
    });
  }

  /** Kaydin tum nesnelerini kurar. Tamami saf — I/O yok. */
  #build(input: {
    readonly email: Email;
    readonly passwordHash: PasswordHash;
    readonly verificationCode: string;
    readonly codeHash: VerificationCodeHash;
    readonly correlationId: string;
  }): {
    user: User;
    credential: Credential;
    code: EmailVerificationCode;
    event: UserRegistered;
  } {
    const now = this.deps.clock.now();
    const userId = UserId.create(this.deps.idGenerator.nextId());

    return {
      user: User.register({ id: userId, email: input.email, createdAt: now }),
      credential: Credential.create({
        userId,
        passwordHash: input.passwordHash,
        createdAt: now,
      }),
      code: this.#issueCode(userId, input.codeHash, now),
      event: this.#registeredEvent({ ...input, userId, now }),
    };
  }

  #registeredEvent(input: {
    readonly userId: UserId;
    readonly email: Email;
    readonly verificationCode: string;
    readonly correlationId: string;
    readonly now: Date;
  }): UserRegistered {
    return UserRegistered.create({
      eventId: this.deps.idGenerator.nextId(),
      userId: input.userId,
      email: input.email,
      // Ham kod YALNIZCA teslimat icin event'te; veritabaninda HMAC durur.
      verificationCode: input.verificationCode,
      occurredAt: input.now,
      correlationId: input.correlationId,
    });
  }

  #issueCode(userId: UserId, codeHash: VerificationCodeHash, now: Date): EmailVerificationCode {
    return EmailVerificationCode.issue({
      id: EmailVerificationCodeId.create(this.deps.idGenerator.nextId()),
      userId,
      codeHash,
      expiresAt: new Date(now.getTime() + VERIFICATION_CODE_TTL_MINUTES * MINUTE_MS),
    });
  }
}
