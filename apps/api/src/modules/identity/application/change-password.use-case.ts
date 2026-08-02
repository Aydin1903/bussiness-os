import { type Clock } from '../../../shared/clock.port';
import { type Delay } from '../../../shared/delay.port';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { UserId } from '../../../shared/user-id.value-object';
import {
  evaluateBruteForce,
  LAYER1_WINDOW_MINUTES,
  LAYER2_WINDOW_MINUTES,
  LAYER3_WINDOW_MINUTES,
} from '../domain/brute-force-policy';
import { type Credential } from '../domain/credential.entity';
import { type Email } from '../domain/email.value-object';
import { TooManyLoginAttemptsError } from '../domain/identity.error';
import { IpAddress } from '../domain/ip-address.value-object';
import { LoginAttempt } from '../domain/login-attempt.entity';
import { LoginAttemptId } from '../domain/login-attempt-id.value-object';
import { type PasswordHash } from '../domain/password-hash.value-object';
import { assertPasswordPolicy } from '../domain/password-policy';
import { TokenFamilyId } from '../domain/token-family-id.value-object';
import { type User } from '../domain/user.entity';
import { UserPasswordChanged } from '../domain/user-password-changed.event';
import { type CredentialRepository } from './credential.repository.port';
import { type LoginAttemptRepository } from './login-attempt.repository.port';
import { type PasswordHasher } from './password-hasher.port';
import { type TokenFamilyRepository } from './token-family.repository.port';
import { type UserRepository } from './user.repository.port';

const MINUTE_MS = 60_000;

export interface ChangePasswordCommand {
  /** DOGRULANMIS token'dan gelir; govdeden ALINMAZ (DEVELOPMENT_RULES 4.5). */
  readonly userId: string;
  /** Istegi yapan oturumun (token ailesi) kimligi — `sid` claim'i. */
  readonly sessionId: string;
  readonly currentPassword: string;
  readonly newPassword: string;
  /** Baglantidan alinir: kaba kuvvet sayacinin anahtaridir (ADR-0022). */
  readonly ipAddress: string;
  readonly correlationId: string;
}

/** `invalid` TEK sonuctur: parola yanlis, hesap pasif veya katman 1 kilidi. */
export type ChangePasswordOutcome = 'changed' | 'invalid';

export interface ChangePasswordResult {
  readonly outcome: ChangePasswordOutcome;
  /** Dusen DIGER oturum sayisi — istegi yapan oturum haric. */
  readonly revokedSessionCount: number;
}

/** DEVELOPMENT_RULES 2.5: 3'ten fazla bagimlilik obje olarak alinir. */
export interface ChangePasswordDependencies {
  readonly userRepository: UserRepository;
  readonly credentialRepository: CredentialRepository;
  readonly loginAttemptRepository: LoginAttemptRepository;
  readonly tokenFamilyRepository: TokenFamilyRepository;
  readonly passwordHasher: PasswordHasher;
  readonly eventPublisher: DomainEventPublisher;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  readonly delay: Delay;
}

const INVALID: ChangePasswordResult = Object.freeze({
  outcome: 'invalid',
  revokedSessionCount: 0,
});

interface ChangeContext {
  readonly userId: UserId;
  readonly sessionId: TokenFamilyId;
  readonly ipAddress: IpAddress;
  readonly now: Date;
  readonly correlationId: string;
}

/**
 * Giris yapmis kullanicinin parolasini degistirir (AUTH_ARCHITECTURE 7.6).
 *
 * ============================================================================
 * NEDEN TEK TRANSACTION DEGIL — LoginUseCase ile AYNI ders (5. tekrar)
 * ============================================================================
 * BASARISIZ DENEME KAYDI COMMIT OLMAK ZORUNDADIR. Her sey tek transaction'da
 * olsaydi, yanlis parola reddedildiginde transaction geri alinir ve deneme
 * kaydi SILINIRDI — sayac hic artmaz, kaba kuvvet korumasi (ADR-0022) comerdi.
 * Bu yuzden:
 *
 *   1. Hedef + sayimlar -> okuma transaction'lari
 *   2. Basarisiz kayit  -> KENDI transaction'i (commit), SONRA ret dondurulur
 *   3. Basari           -> tek atomik transaction (credential + iptal + event)
 *
 * Pahali Argon2 islemleri (verify, hash) transaction'larin DISINDA calisir.
 * ============================================================================
 *
 * ============================================================================
 * RET, EXCEPTION DEGIL DEGER — ve neden 401 DEGIL 400'e cevrilir
 * ============================================================================
 * Bu uc KIMLIK DOGRULANMIS baglamda calisir; orada `401` zaten "token yok /
 * suresi doldu" anlamini tasir. Yanlis parolaya da `401` donseydi istemcinin
 * yenile-ve-tekrar-dene mekanizmasi (web `apiFetch`) tetiklenir ve kullanicinin
 * TEK yazim hatasi IKI basarisiz deneme yakardi — 5 denemelik katman 1 siniri
 * yari yariya erirdi. Bu yuzden ret bir DEGER olarak doner ve controller onu
 * `400` + sabit metne cevirir (`ResetPasswordUseCase` ile ayni desen).
 *
 * TUM redler AYNI sonucu doner: parola yanlis · hesap aktif degil · katman 1
 * kilidi ayirt edilemez (P2, §14.3).
 * ============================================================================
 *
 * ============================================================================
 * BASARIDA ZORUNLU YAN ETKILER
 * ============================================================================
 * 1. Parola degisir (`changePassword` -> `passwordChangedAt` guncellenir),
 * 2. Kullanicinin ISTEGI YAPAN OTURUM DISINDAKI tum aileleri iptal edilir —
 *    sifirlamadan (ADR-0024) farki bilinclidir: parolayi BILEN ve kimligini
 *    kanitlayan kisiyi kendi cihazindan atmak icin sebep yoktur,
 * 3. `UserPasswordChanged` yayinlanir -> bilgilendirme e-postasi (mevcut
 *    outbox handler'i, ek is gerektirmez).
 * Hepsi TEK transaction'da: yarim degisiklik olamaz.
 * ============================================================================
 */
export class ChangePasswordUseCase {
  constructor(private readonly deps: ChangePasswordDependencies) {}

  async execute(command: ChangePasswordCommand): Promise<ChangePasswordResult> {
    // Politika transaction'a girmeden dogrulanir; ihlali 422'dir ve parolanin
    // DOGRU bilinip bilinmediginden bagimsizdir.
    assertPasswordPolicy(command.newPassword);

    const context: ChangeContext = {
      userId: UserId.create(command.userId),
      sessionId: TokenFamilyId.create(command.sessionId),
      ipAddress: IpAddress.create(command.ipAddress),
      now: this.deps.clock.now(),
      correlationId: command.correlationId,
    };

    const target = await this.#findTarget(context.userId);
    if (target === null) {
      // Token gecerliydi ama hesap yok/pasif. Kaba kuvvet sinyali DEGILDIR
      // (parola hic denenmedi) ve e-postayi bilmedigimiz icin deftere de
      // yazilamaz — sessizce ayni rette birlesir.
      return INVALID;
    }

    if (!(await this.#passesGate(target.user.email, context))) {
      return INVALID;
    }

    if (!(await this.#verifyCurrent(target, command.currentPassword, context))) {
      return INVALID;
    }

    return this.#complete(target, command.newPassword, context);
  }

  /** Kullanici + credential. Yalnizca AKTIF hesap parola degistirebilir. */
  async #findTarget(userId: UserId): Promise<Target | null> {
    return this.deps.transactionManager.runInTransaction(async () => {
      const user = await this.deps.userRepository.findById(userId);
      if (user?.isActive !== true) {
        return null;
      }

      const credential = await this.deps.credentialRepository.findByUserId(user.id);
      return credential === null ? null : { user, credential };
    });
  }

  /**
   * Uc katmanli kapi (ADR-0022) — giris ile AYNI defteri paylasir.
   *
   * Ayri bir sayac acmak, tahmin edilen AYNI sirra iki ayri butce vermek
   * olurdu. Sonucu kabul ediyoruz: burada tuketilen denemeler girise de sayilir.
   *
   * Katman 1 kilidi yanlis paroladan AYIRT EDILEMEZ (`false` -> ayni ret);
   * katman 3 ise hesaptan bagimsiz oldugu icin acikca 429 firlatir.
   */
  async #passesGate(email: Email, context: ChangeContext): Promise<boolean> {
    const decision = evaluateBruteForce(await this.#countFailures(email, context));

    if (decision.action === 'locked') {
      return false;
    }

    // Katman 2 kilit DEGIL gecikmedir.
    await this.deps.delay.wait(decision.throttleDelayMs);
    if (decision.action === 'rate-limited') {
      throw new TooManyLoginAttemptsError();
    }

    return true;
  }

  async #countFailures(email: Email, context: ChangeContext) {
    const { loginAttemptRepository: attempts } = this.deps;
    const { ipAddress, now } = context;

    return this.deps.transactionManager.runInTransaction(async () => ({
      emailIpFailures: await attempts.countFailuresByEmailAndIp(
        email,
        ipAddress,
        minutesBefore(now, LAYER1_WINDOW_MINUTES),
      ),
      emailFailures: await attempts.countFailuresByEmail(
        email,
        minutesBefore(now, LAYER2_WINDOW_MINUTES),
      ),
      ipFailures: await attempts.countFailuresByIp(
        ipAddress,
        minutesBefore(now, LAYER3_WINDOW_MINUTES),
      ),
    }));
  }

  /**
   * Mevcut parolayi dogrular; yanlissa denemeyi KENDI transaction'inda kaydeder.
   *
   * Kayit, `false` donmesinden ONCE commit olur — sayacin artmasinin tek
   * garantisi budur (bkz. sinif yorumu).
   */
  async #verifyCurrent(
    target: Target,
    currentPassword: string,
    context: ChangeContext,
  ): Promise<boolean> {
    // Argon2 dogrulamasi transaction'in DISINDA: hash boyunca baglanti tutulmaz.
    const matches = await this.deps.passwordHasher.verify(
      currentPassword,
      target.credential.passwordHash,
    );
    if (matches) {
      return true;
    }

    await this.deps.transactionManager.runInTransaction(async () => {
      await this.deps.loginAttemptRepository.save(
        LoginAttempt.record({
          id: LoginAttemptId.create(this.deps.idGenerator.nextId()),
          email: target.user.email,
          ipAddress: context.ipAddress,
          succeeded: false,
          attemptedAt: context.now,
        }),
      );
    });

    return false;
  }

  /**
   * Basari yolu: parola + oturum iptali + event, hepsi birlikte.
   *
   * BASARILI deneme deftere YAZILMAZ: `login_attempts` bir "basarisiz parola
   * tahmini" sayacidir ve sayimlari yalnizca basarisizlari okur. Basarili
   * degisikligin denetim kaydi `passwordChangedAt` ve `UserPasswordChanged`'dir;
   * defteri giris OLMAYAN olaylarla doldurmak onu okunmaz kilardi.
   */
  async #complete(
    target: Target,
    newPassword: string,
    context: ChangeContext,
  ): Promise<ChangePasswordResult> {
    // Yeni hash pahali; transaction ACILMADAN once hesaplanir.
    const newHash = await this.deps.passwordHasher.hash(newPassword);

    const revokedSessionCount = await this.deps.transactionManager.runInTransaction(() =>
      this.#persist(target, newHash, context),
    );

    return { outcome: 'changed', revokedSessionCount };
  }

  async #persist(
    target: Target,
    newHash: PasswordHash,
    context: ChangeContext,
  ): Promise<number> {
    const { user, credential } = target;

    credential.changePassword(newHash, context.now);
    await this.deps.credentialRepository.save(credential);

    // Istegi yapan oturum HARIC tutulur; digerleri tek UPDATE ile duser.
    const revokedSessionCount = await this.deps.tokenFamilyRepository.revokeAllActiveByUserIdExcept(
      user.id,
      context.sessionId,
      'password-changed',
      context.now,
    );

    await this.deps.eventPublisher.publish(
      UserPasswordChanged.create({
        eventId: this.deps.idGenerator.nextId(),
        userId: user.id,
        email: user.email,
        occurredAt: context.now,
        correlationId: context.correlationId,
      }),
    );

    return revokedSessionCount;
  }
}

interface Target {
  readonly user: User;
  readonly credential: Credential;
}

function minutesBefore(now: Date, minutes: number): Date {
  return new Date(now.getTime() - minutes * MINUTE_MS);
}
