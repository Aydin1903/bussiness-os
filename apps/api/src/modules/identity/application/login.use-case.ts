import { type Clock } from '../../../shared/clock.port';
import { type Delay } from '../../../shared/delay.port';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  evaluateBruteForce,
  LAYER1_WINDOW_MINUTES,
  LAYER2_WINDOW_MINUTES,
  LAYER3_WINDOW_MINUTES,
} from '../domain/brute-force-policy';
import { type Credential } from '../domain/credential.entity';
import { Email } from '../domain/email.value-object';
import {
  EmailNotVerifiedError,
  InvalidCredentialsError,
  TooManyLoginAttemptsError,
} from '../domain/identity.error';
import { IpAddress } from '../domain/ip-address.value-object';
import { LoginAttempt } from '../domain/login-attempt.entity';
import { LoginAttemptId } from '../domain/login-attempt-id.value-object';
import { PasswordHash } from '../domain/password-hash.value-object';
import { REFRESH_TOKEN_TTL_DAYS, RefreshToken } from '../domain/refresh-token.entity';
import { RefreshTokenId } from '../domain/refresh-token-id.value-object';
import { TokenFamily } from '../domain/token-family.entity';
import { TokenFamilyId } from '../domain/token-family-id.value-object';
import { type User } from '../domain/user.entity';
import { UserLoggedIn } from '../domain/user-logged-in.event';
import { type CredentialRepository } from './credential.repository.port';
import { type LoginAttemptRepository } from './login-attempt.repository.port';
import { type PasswordHasher } from './password-hasher.port';
import { type RefreshTokenGenerator } from './refresh-token-generator.port';
import { type RefreshTokenHasher } from './refresh-token-hasher.port';
import { type RefreshTokenRepository } from './refresh-token.repository.port';
import { type TokenFamilyRepository } from './token-family.repository.port';
import { type TokenSigner } from './token-signer.port';
import { type UserRepository } from './user.repository.port';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Kullanici bulunamadiginda dogrulanan SAHTE hash (AUTH_ARCHITECTURE 9.1).
 *
 * Hash'leme atlanirsa yanit belirgin bicimde daha HIZLI doner ve saldirgan
 * hangi e-postalarin kayitli oldugunu ZAMANLAMAYLA ogrenir. Bu yuzden kullanici
 * yoksa da gercek bir Argon2id dogrulamasi calistirilir. Sir DEGILDIR — rastgele
 * bir parolanin ADR-0017 parametreleriyle uretilmis hash'idir.
 */
const DUMMY_PASSWORD_HASH = PasswordHash.fromHash(
  '$argon2id$v=19$m=19456,t=2,p=1$sJiK0SXgKrd8zyDIjrkTaw$Bmz9cOUUE0EhclwXBsudO4BeYJWQnrmLTaA7Jwu8aN0',
);

export interface LoginCommand {
  readonly email: string;
  readonly password: string;
  readonly ipAddress: string;
  readonly correlationId: string;
}

export interface LoginResult {
  /** KIMLIK token'i — `tenant` claim'i YOK (ADR-0020). Tenant secimi ayri adimdir. */
  readonly identityToken: string;
  /** Ham 256-bit refresh token; veritabaninda yalnizca SHA-256'si durur. */
  readonly refreshToken: string;
}

/** DEVELOPMENT_RULES 2.5: 3'ten fazla bagimlilik obje olarak alinir. */
export interface LoginDependencies {
  readonly userRepository: UserRepository;
  readonly credentialRepository: CredentialRepository;
  readonly loginAttemptRepository: LoginAttemptRepository;
  readonly tokenFamilyRepository: TokenFamilyRepository;
  readonly refreshTokenRepository: RefreshTokenRepository;
  readonly passwordHasher: PasswordHasher;
  readonly refreshTokenGenerator: RefreshTokenGenerator;
  readonly refreshTokenHasher: RefreshTokenHasher;
  readonly tokenSigner: TokenSigner;
  readonly eventPublisher: DomainEventPublisher;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  readonly delay: Delay;
}

interface LoginContext {
  readonly email: Email;
  readonly ipAddress: IpAddress;
  readonly now: Date;
  readonly correlationId: string;
}

/**
 * Kullaniciyi dogrular ve bir oturum acar (AUTH_ARCHITECTURE 9).
 *
 * ============================================================================
 * NEDEN TEK TRANSACTION DEGIL — en kritik tasarim karari
 * ============================================================================
 * BASARISIZ DENEME KAYDI COMMIT OLMAK ZORUNDADIR. Her sey tek transaction'da
 * olsaydi, giris reddedilip hata firlatildiginda transaction GERI ALINIR ve
 * deneme kaydi SILINIRDI — sayac hic artmaz, kaba kuvvet korumasi (ADR-0022)
 * tumuyle comerdi. Bu yuzden:
 *
 *   1. Sayimlar        -> okuma transaction'i
 *   2. Basarisiz kayit -> KENDI transaction'i (commit), SONRA hata firlatilir
 *   3. Basari          -> tek atomik transaction (rehash + aile + token +
 *                         deneme + event)
 *
 * Ayrica pahali Argon2 islemleri transaction'larin DISINDA calisir; hash boyunca
 * veritabani baglantisi tutulmaz.
 * ============================================================================
 *
 * Giris KIMLIK token'i uretir (§10.1) — `tenant` claim'i YOKTUR. Tenant-scoped
 * access token, membership dogrulamasindan gecen ayri bir adimdir (MT §7.4).
 */
export class LoginUseCase {
  constructor(private readonly deps: LoginDependencies) {}

  async execute(command: LoginCommand): Promise<LoginResult> {
    const context: LoginContext = {
      email: Email.create(command.email),
      ipAddress: IpAddress.create(command.ipAddress),
      now: this.deps.clock.now(),
      correlationId: command.correlationId,
    };

    await this.#assertNotThrottled(context);

    const { user, credential } = await this.#authenticate(context, command.password);

    // Parola DOGRU bilindi. Buradan sonraki redler kaba kuvvet sinyali DEGILDIR,
    // bu yuzden basarisiz deneme olarak kaydedilmez.
    if (!user.emailVerified) {
      throw new EmailNotVerifiedError(); // 403 — ayirt edilebilir olmasi guvenli
    }
    if (!user.isActive) {
      throw new InvalidCredentialsError(); // kilit/pasiflik SIZDIRILMAZ
    }

    return this.#issueSession({ context, user, credential, password: command.password });
  }

  /**
   * Kimligi dogrular; basarisizsa denemeyi kaydedip GENEL hata firlatir.
   *
   * Kullanici yoksa da SAHTE hash dogrulanir (§9.1) — aksi halde yanit belirgin
   * bicimde hizlanir ve hangi e-postalarin kayitli oldugu zamanlamayla sizar.
   */
  async #authenticate(
    context: LoginContext,
    password: string,
  ): Promise<{ user: User; credential: Credential }> {
    const found = await this.#findUserWithCredential(context.email);
    const credential = found?.credential ?? null;

    if (found === null || credential === null) {
      await this.deps.passwordHasher.verify(password, DUMMY_PASSWORD_HASH);
      await this.#recordAttempt(context, false);
      throw new InvalidCredentialsError();
    }

    if (!(await this.deps.passwordHasher.verify(password, credential.passwordHash))) {
      await this.#recordAttempt(context, false);
      throw new InvalidCredentialsError();
    }

    return { user: found.user, credential };
  }

  /** Uc katmanli kapi (ADR-0022). Sayimlari okur, karari uygular. */
  async #assertNotThrottled(context: LoginContext): Promise<void> {
    const { loginAttemptRepository: attempts } = this.deps;
    const { email, ipAddress, now } = context;

    const counts = await this.deps.transactionManager.runInTransaction(async () => ({
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

    const decision = evaluateBruteForce(counts);

    // Katman 1 kilidi yanlis paroladan AYIRT EDILEMEZ (§14.3).
    if (decision.action === 'locked') {
      throw new InvalidCredentialsError();
    }
    // Katman 2 kilit DEGIL gecikmedir.
    await this.deps.delay.wait(decision.throttleDelayMs);
    if (decision.action === 'rate-limited') {
      throw new TooManyLoginAttemptsError();
    }
  }

  async #findUserWithCredential(
    email: Email,
  ): Promise<{ user: User; credential: Credential | null } | null> {
    return this.deps.transactionManager.runInTransaction(async () => {
      const user = await this.deps.userRepository.findByEmail(email);
      if (user === null) {
        return null;
      }
      return { user, credential: await this.deps.credentialRepository.findByUserId(user.id) };
    });
  }

  /**
   * Denemeyi KENDI transaction'inda kaydeder.
   *
   * Cagiran taraf hemen ardindan hata firlatsa bile bu kayit COMMIT olmustur —
   * sayacin artmasinin tek garantisi budur (bkz. sinif yorumu).
   */
  async #recordAttempt(context: LoginContext, succeeded: boolean): Promise<void> {
    await this.deps.transactionManager.runInTransaction(async () => {
      await this.deps.loginAttemptRepository.save(this.#buildAttempt(context, succeeded));
    });
  }

  #buildAttempt(context: LoginContext, succeeded: boolean): LoginAttempt {
    return LoginAttempt.record({
      id: LoginAttemptId.create(this.deps.idGenerator.nextId()),
      email: context.email,
      ipAddress: context.ipAddress,
      succeeded,
      attemptedAt: context.now,
    });
  }

  async #issueSession(input: {
    readonly context: LoginContext;
    readonly user: User;
    readonly credential: Credential;
    readonly password: string;
  }): Promise<LoginResult> {
    const { context, user, credential, password } = input;

    // Kademeli yeniden hash'leme (§6.3): duz parola SU AN elimizde. Pahali hash
    // transaction'in DISINDA hesaplanir.
    const rehashed = this.deps.passwordHasher.needsRehash(credential.passwordHash)
      ? await this.deps.passwordHasher.hash(password)
      : null;

    const family = TokenFamily.start({
      id: TokenFamilyId.create(this.deps.idGenerator.nextId()),
      userId: user.id,
      createdAt: context.now,
    });
    const rawRefreshToken = this.deps.refreshTokenGenerator.generate();
    const refreshToken = RefreshToken.issue({
      id: RefreshTokenId.create(this.deps.idGenerator.nextId()),
      familyId: family.id,
      tokenHash: this.deps.refreshTokenHasher.hash(rawRefreshToken),
      expiresAt: new Date(context.now.getTime() + REFRESH_TOKEN_TTL_DAYS * DAY_MS),
    });

    await this.#persistSession({ context, user, credential, rehashed, family, refreshToken });

    // Token, oturum COMMIT OLDUKTAN SONRA imzalanir: var olmayan bir oturuma
    // isaret eden token dagitilmaz.
    const identityToken = await this.deps.tokenSigner.signIdentityToken({
      userId: user.id.value,
      sessionId: family.id.value,
    });

    return { identityToken, refreshToken: rawRefreshToken };
  }

  /** Basari yolu: hepsi ya birlikte olur ya hic olmaz. */
  async #persistSession(input: {
    readonly context: LoginContext;
    readonly user: User;
    readonly credential: Credential;
    readonly rehashed: PasswordHash | null;
    readonly family: TokenFamily;
    readonly refreshToken: RefreshToken;
  }): Promise<void> {
    const { context, user, credential, rehashed, family, refreshToken } = input;

    await this.deps.transactionManager.runInTransaction(async () => {
      if (rehashed !== null) {
        // Parola DEGISMEDI, yalnizca kodlamasi yukseldi — passwordChangedAt sabit.
        credential.rehash(rehashed);
        await this.deps.credentialRepository.save(credential);
      }

      await this.deps.tokenFamilyRepository.save(family);
      await this.deps.refreshTokenRepository.save(refreshToken);
      await this.deps.loginAttemptRepository.save(this.#buildAttempt(context, true));
      await this.deps.eventPublisher.publish(this.#buildLoggedInEvent(context, user, family));
    });
  }

  #buildLoggedInEvent(context: LoginContext, user: User, family: TokenFamily): UserLoggedIn {
    return UserLoggedIn.create({
      eventId: this.deps.idGenerator.nextId(),
      userId: user.id,
      sessionId: family.id,
      occurredAt: context.now,
      correlationId: context.correlationId,
    });
  }
}

function minutesBefore(now: Date, minutes: number): Date {
  return new Date(now.getTime() - minutes * MINUTE_MS);
}
