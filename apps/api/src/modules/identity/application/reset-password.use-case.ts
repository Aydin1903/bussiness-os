import { type Clock } from '../../../shared/clock.port';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type Credential } from '../domain/credential.entity';
import { Email } from '../domain/email.value-object';
import {
  MAX_PASSWORD_RESET_ATTEMPTS,
  type PasswordResetCode,
} from '../domain/password-reset-code.entity';
import { assertPasswordPolicy } from '../domain/password-policy';
import { type User } from '../domain/user.entity';
import { UserPasswordChanged } from '../domain/user-password-changed.event';
import { type CredentialRepository } from './credential.repository.port';
import { type PasswordHasher } from './password-hasher.port';
import { type PasswordResetCodeRepository } from './password-reset-code.repository.port';
import { type TokenFamilyRepository } from './token-family.repository.port';
import { type UserRepository } from './user.repository.port';
import { type VerificationCodeHasher } from './verification-code-hasher.port';

export interface ResetPasswordCommand {
  readonly email: string;
  readonly code: string;
  readonly password: string;
  readonly correlationId: string;
}

/** `invalid` TEK sonuctur (P2): kullanici yok, kod yok/yanlis/dolmus/tukenmis. */
export type ResetPasswordOutcome = 'reset' | 'invalid';

export interface ResetPasswordResult {
  readonly outcome: ResetPasswordOutcome;
}

/** DEVELOPMENT_RULES 2.5: 3'ten fazla bagimlilik obje olarak alinir. */
export interface ResetPasswordDependencies {
  readonly userRepository: UserRepository;
  readonly credentialRepository: CredentialRepository;
  readonly passwordResetCodeRepository: PasswordResetCodeRepository;
  readonly tokenFamilyRepository: TokenFamilyRepository;
  readonly passwordHasher: PasswordHasher;
  readonly verificationCodeHasher: VerificationCodeHasher;
  readonly eventPublisher: DomainEventPublisher;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

const INVALID: ResetPasswordResult = Object.freeze({ outcome: 'invalid' });
const RESET: ResetPasswordResult = Object.freeze({ outcome: 'reset' });

interface ResetTarget {
  readonly user: User;
  readonly credential: Credential;
  readonly code: PasswordResetCode;
}

/**
 * Parola sifirlama kodunu kullanir ve parolayi degistirir (AUTH §7.6, ADR-0024).
 *
 * ============================================================================
 * SONUC DONDURUR, HATA FIRLATMAZ (VerifyEmail ile ayni ders)
 * ============================================================================
 * Deneme sayaci dogrulama ile AYNI transaction'da atomik artar. Red bir
 * exception ile bildirilseydi transaction geri alinir ve sayacin artisi
 * SILINIRDI — 3 denemelik sinir (ADR-0024) hicbir zaman dolmaz. Bu yuzden
 * beklenen redler `outcome: 'invalid'` doner; firlatilan tek hata GIRDI
 * BICIMIDIR (parola politikasi -> 422, `Email.create` -> 422).
 *
 * TUM redler AYNI sonucu doner (P2): kullanici yok, kod yok/yanlis/dolmus/
 * tukenmis ayirt edilmez.
 * ============================================================================
 *
 * ============================================================================
 * BASARIDA ZORUNLU YAN ETKILER (ADR-0024)
 * ============================================================================
 * 1. Parola degisir (`changePassword`),
 * 2. Kod tuketilir + kullanicinin DIGER aktif reset kodlari gecersizlesir,
 * 3. Kullanicinin TUM refresh aileleri iptal edilir (`password-changed`) —
 *    "hesabim ele gecirilmis olabilir" senaryosunun kurtarma yolu; eski
 *    oturumlarin ayakta kalmasi bunu anlamsiz kilardi,
 * 4. `UserPasswordChanged` yayinlanir -> bilgilendirme e-postasi.
 * Hepsi TEK transaction'da: yarim sifirlama olamaz.
 * ============================================================================
 */
export class ResetPasswordUseCase {
  constructor(private readonly deps: ResetPasswordDependencies) {}

  async execute(command: ResetPasswordCommand): Promise<ResetPasswordResult> {
    // Bicim/politika transaction'a girmeden dogrulanir; ihlali 422'dir ve
    // hesabin varligiyla ilgisizdir.
    assertPasswordPolicy(command.password);
    const email = Email.create(command.email);

    // Yeni hash pahali (Argon2); transaction'in DISINDA hesaplanir.
    const newHash = await this.deps.passwordHasher.hash(command.password);

    return this.deps.transactionManager.runInTransaction(() =>
      this.#reset(email, command, newHash),
    );
  }

  async #reset(
    email: Email,
    command: ResetPasswordCommand,
    newHash: Awaited<ReturnType<PasswordHasher['hash']>>,
  ): Promise<ResetPasswordResult> {
    const now = this.deps.clock.now();

    const target = await this.#findTarget(email, now);
    if (target === null) {
      return INVALID;
    }

    // Sayac HMAC KIYASINDAN ONCE artar: kiyas once yapilsaydi dogru kodu bulan
    // saldirgan hicbir deneme harcamamis olurdu.
    if (!(await this.#registerAttempt(target.code))) {
      return INVALID;
    }

    if (!this.deps.verificationCodeHasher.verify(command.code, target.code.codeHash)) {
      return INVALID;
    }

    await this.#complete({ target, newHash, now, correlationId: command.correlationId });
    return RESET;
  }

  /** Aktif kullanici + dogrulanabilir kod. Sifirlama yalnizca AKTIF hesaba. */
  async #findTarget(email: Email, now: Date): Promise<ResetTarget | null> {
    const user = await this.deps.userRepository.findByEmail(email);
    if (user?.isActive !== true) {
      return null;
    }

    const credential = await this.deps.credentialRepository.findByUserId(user.id);
    if (credential === null) {
      return null;
    }

    const code = await this.deps.passwordResetCodeRepository.findActiveByUserId(user.id);
    if (code?.isVerifiable(now) !== true) {
      return null;
    }

    return { user, credential, code };
  }

  /** Denemeyi ATOMIK isler; kod hala denenebilirse `true`. */
  async #registerAttempt(code: PasswordResetCode): Promise<boolean> {
    const attemptCount = await this.deps.passwordResetCodeRepository.incrementAttemptCount(code.id);

    if (attemptCount === null || attemptCount > MAX_PASSWORD_RESET_ATTEMPTS) {
      return false;
    }

    code.registerFailedAttempt();
    return true;
  }

  /** Basari yolu: parola + kod + oturum iptali + event, hepsi birlikte. */
  async #complete(input: {
    readonly target: ResetTarget;
    readonly newHash: Awaited<ReturnType<PasswordHasher['hash']>>;
    readonly now: Date;
    readonly correlationId: string;
  }): Promise<void> {
    const { target, newHash, now, correlationId } = input;
    const { user, credential, code } = target;

    credential.changePassword(newHash, now);
    code.consume(now);

    await this.deps.credentialRepository.save(credential);
    await this.deps.passwordResetCodeRepository.save(code);

    // Tum aktif oturumlar dusurulur (ADR-0023/0024). `revokeAllActiveByUserId`
    // tek UPDATE'tir; iptal nedeni denetim gercegidir.
    await this.deps.tokenFamilyRepository.revokeAllActiveByUserId(user.id, 'password-changed', now);

    await this.deps.eventPublisher.publish(
      UserPasswordChanged.create({
        eventId: this.deps.idGenerator.nextId(),
        userId: user.id,
        email: user.email,
        occurredAt: now,
        correlationId,
      }),
    );
  }
}
