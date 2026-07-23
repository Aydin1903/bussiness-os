import { Module, RequestMethod, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { importPKCS8, importSPKI, type CryptoKey } from 'jose';

import { SystemClock } from '../../infrastructure/clock/system-clock.adapter';
import { APP_CONFIG, type AppConfig } from '../../infrastructure/config/app.config';
import { DrizzleTransactionManager } from '../../infrastructure/database/drizzle-transaction-manager.adapter';
import { TimeoutDelay } from '../../infrastructure/delay/timeout-delay.adapter';
import { EmailModule } from '../../infrastructure/email/email.module';
import { UuidV7IdGenerator } from '../../infrastructure/id/uuid-v7-id-generator.adapter';
import { CLOCK, type Clock } from '../../shared/clock.port';
import { DELAY, type Delay } from '../../shared/delay.port';
import { type DomainEventPublisher } from '../../shared/domain-event-publisher.port';
import { EMAIL_PORT, type EmailPort } from '../../shared/email.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/id-generator.port';
import { TRANSACTION_MANAGER, type TransactionManager } from '../../shared/transaction-manager.port';
import { CREDENTIAL_REPOSITORY, type CredentialRepository } from './application/credential.repository.port';
import {
  EMAIL_VERIFICATION_CODE_REPOSITORY,
  type EmailVerificationCodeRepository,
} from './application/email-verification-code.repository.port';
import { IDENTITY_EVENT_PUBLISHER } from './application/identity-event-publisher.port';
import {
  IDENTITY_OUTBOX_REPOSITORY,
  type IdentityOutboxRepository,
} from './application/identity-outbox.repository.port';
import { IdentityUserQueryService } from './application/identity-user.query';
import { LoginUseCase } from './application/login.use-case';
import {
  LOGIN_ATTEMPT_REPOSITORY,
  type LoginAttemptRepository,
} from './application/login-attempt.repository.port';
import { PASSWORD_HASHER, type PasswordHasher } from './application/password-hasher.port';
import { PublishIdentityEventsUseCase } from './application/publish-identity-events.use-case';
import {
  REFRESH_TOKEN_GENERATOR,
  type RefreshTokenGenerator,
} from './application/refresh-token-generator.port';
import { REFRESH_TOKEN_HASHER, type RefreshTokenHasher } from './application/refresh-token-hasher.port';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from './application/refresh-token.repository.port';
import { RegisterUserUseCase } from './application/register-user.use-case';
import { TOKEN_FAMILY_REPOSITORY, type TokenFamilyRepository } from './application/token-family.repository.port';
import { TOKEN_SIGNER, type TokenSigner } from './application/token-signer.port';
import { USER_REPOSITORY, type UserRepository } from './application/user.repository.port';
import {
  VERIFICATION_CODE_GENERATOR,
  type VerificationCodeGenerator,
} from './application/verification-code-generator.port';
import {
  VERIFICATION_CODE_HASHER,
  type VerificationCodeHasher,
} from './application/verification-code-hasher.port';
import { VerifyEmailUseCase } from './application/verify-email.use-case';
import { Argon2idPasswordHasher } from './infrastructure/argon2id-password-hasher.adapter';
import { CryptoRefreshTokenGenerator } from './infrastructure/crypto-refresh-token-generator.adapter';
import { CryptoVerificationCodeGenerator } from './infrastructure/crypto-verification-code-generator.adapter';
import { DrizzleCredentialRepository } from './infrastructure/drizzle-credential.repository';
import { DrizzleEmailVerificationCodeRepository } from './infrastructure/drizzle-email-verification-code.repository';
import { DrizzleIdentityOutboxRepository } from './infrastructure/drizzle-identity-outbox.repository';
import { DrizzleLoginAttemptRepository } from './infrastructure/drizzle-login-attempt.repository';
import { DrizzleRefreshTokenRepository } from './infrastructure/drizzle-refresh-token.repository';
import { DrizzleTokenFamilyRepository } from './infrastructure/drizzle-token-family.repository';
import { DrizzleUserRepository } from './infrastructure/drizzle-user.repository';
import { EddsaTokenSigner } from './infrastructure/eddsa-token-signer.adapter';
import { HmacVerificationCodeHasher } from './infrastructure/hmac-verification-code-hasher.adapter';
import { IdentityOutboxEventPublisher } from './infrastructure/identity-outbox-event-publisher.adapter';
import { IdentityOutboxRelay } from './infrastructure/identity-outbox-relay';
import { Sha256RefreshTokenHasher } from './infrastructure/sha256-refresh-token-hasher.adapter';
import { IDENTITY_USER_QUERY, type IdentityUserQuery } from './identity.public';
import { AuthContextMiddleware } from './presentation/auth-context.middleware';
import { AuthController } from './presentation/auth.controller';

/** base64(PEM) -> PEM. Anahtarlar `.env`'de tek satir tasinir (bkz. env.schema). */
function decodePem(base64: string): string {
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Identity modulu — platform cekirdeginin ikinci halkasi (ARCHITECTURE 6.2).
 *
 * ============================================================================
 * SIRLAR CONFIG'TEN GELIR, KODDA YOKTUR
 * ============================================================================
 * EdDSA ozel anahtari ve dogrulama kodu pepper'i `AppConfig` uzerinden okunur;
 * varsayilanlari YOKTUR ve eksikse surec baslamaz (ADR-0019, ADR-0020).
 * Anahtar ithali asenkron oldugu icin imzalayici `useFactory` ile ASYNC kurulur.
 *
 * `IDENTITY_EVENT_PUBLISHER` ayri bir token'dir: Identity event'leri tenant'siz
 * oldugu icin `platform.identity_outbox`'a yazilir, tenant outbox'ina DEGIL (Ç4).
 * ============================================================================
 */
@Module({
  // Teslimat yolu icin `EMAIL_PORT`. Somut saglayici EmailModule'un karari;
  // Identity yalnizca port'u tuketir.
  imports: [EmailModule],
  controllers: [AuthController],
  providers: [
    // --- Paylasilan cekirdek port'lari -------------------------------------
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },
    { provide: DELAY, useClass: TimeoutDelay },

    // --- Kalicilik ----------------------------------------------------------
    { provide: USER_REPOSITORY, useClass: DrizzleUserRepository },
    { provide: CREDENTIAL_REPOSITORY, useClass: DrizzleCredentialRepository },
    { provide: EMAIL_VERIFICATION_CODE_REPOSITORY, useClass: DrizzleEmailVerificationCodeRepository },
    { provide: TOKEN_FAMILY_REPOSITORY, useClass: DrizzleTokenFamilyRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: DrizzleRefreshTokenRepository },
    { provide: LOGIN_ATTEMPT_REPOSITORY, useClass: DrizzleLoginAttemptRepository },
    { provide: IDENTITY_EVENT_PUBLISHER, useClass: IdentityOutboxEventPublisher },
    { provide: IDENTITY_OUTBOX_REPOSITORY, useClass: DrizzleIdentityOutboxRepository },

    // --- Kripto -------------------------------------------------------------
    {
      // `useClass` DEGIL: sinifin constructor'i varsayilan degerli bir parametre
      // alir ve NestJS onu bir DI token'i sanip cozmeye calisir. Factory,
      // ADR-0017 taban parametrelerinin kullanildigini acikca gosterir.
      provide: PASSWORD_HASHER,
      useFactory: (): PasswordHasher => new Argon2idPasswordHasher(),
    },
    { provide: VERIFICATION_CODE_GENERATOR, useClass: CryptoVerificationCodeGenerator },
    { provide: REFRESH_TOKEN_GENERATOR, useClass: CryptoRefreshTokenGenerator },
    { provide: REFRESH_TOKEN_HASHER, useClass: Sha256RefreshTokenHasher },
    {
      // Pepper bir SIRDIR: guvenli varsayilani yoktur, config'ten gelir.
      provide: VERIFICATION_CODE_HASHER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): VerificationCodeHasher =>
        new HmacVerificationCodeHasher(config.auth.verificationCodePepper),
    },
    {
      // Ed25519 anahtarlarinin ithali ASENKRON'dur; factory de async olur.
      provide: TOKEN_SIGNER,
      inject: [APP_CONFIG, CLOCK],
      useFactory: async (config: AppConfig, clock: Clock): Promise<TokenSigner> => {
        const { jwt } = config.auth;
        const privateKey = await importPKCS8(decodePem(jwt.privateKeyBase64), 'EdDSA');
        const publicKey = await importSPKI(decodePem(jwt.publicKeyBase64), 'EdDSA');

        // Rotasyona hazir: dogrulayici kid -> acik anahtar haritasi tutar.
        // Bugun tek anahtar yapilandirilir; ikincisi eklenince eskisi de gecerli kalir.
        const verificationKeys = new Map<string, CryptoKey>([[jwt.signingKid, publicKey]]);

        return new EddsaTokenSigner(
          {
            issuer: jwt.issuer,
            audience: jwt.audience,
            signingKid: jwt.signingKid,
            signingKey: privateKey,
            verificationKeys,
          },
          clock,
        );
      },
    },

    // --- Disa acik sorgu (identity.public.ts) --------------------------------
    {
      // Tenant, ADR-0016 onkosulunu (emailVerified) BU token uzerinden dogrular.
      provide: IDENTITY_USER_QUERY,
      inject: [USER_REPOSITORY, TRANSACTION_MANAGER],
      useFactory: (
        userRepository: UserRepository,
        transactionManager: TransactionManager,
      ): IdentityUserQuery => new IdentityUserQueryService({ userRepository, transactionManager }),
    },

    // Auth middleware: token'i dogrular ve istek baglamina yazar.
    AuthContextMiddleware,

    // --- Use case'ler (saf TypeScript; NestJS'i bilmezler) -------------------
    {
      provide: RegisterUserUseCase,
      inject: [
        USER_REPOSITORY,
        CREDENTIAL_REPOSITORY,
        EMAIL_VERIFICATION_CODE_REPOSITORY,
        PASSWORD_HASHER,
        VERIFICATION_CODE_GENERATOR,
        VERIFICATION_CODE_HASHER,
        IDENTITY_EVENT_PUBLISHER,
        TRANSACTION_MANAGER,
        ID_GENERATOR,
        CLOCK,
      ],
      // NestJS useFactory imzasi `inject` dizisiyle BIREBIR eslesmek zorundadir;
      // use case'in KENDI imzasi zaten tek parametrelidir (DEVELOPMENT_RULES 2.5).
      // eslint-disable-next-line max-params
      useFactory: (
        userRepository: UserRepository,
        credentialRepository: CredentialRepository,
        verificationCodeRepository: EmailVerificationCodeRepository,
        passwordHasher: PasswordHasher,
        verificationCodeGenerator: VerificationCodeGenerator,
        verificationCodeHasher: VerificationCodeHasher,
        eventPublisher: DomainEventPublisher,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
      ): RegisterUserUseCase =>
        new RegisterUserUseCase({
          userRepository,
          credentialRepository,
          verificationCodeRepository,
          passwordHasher,
          verificationCodeGenerator,
          verificationCodeHasher,
          eventPublisher,
          transactionManager,
          idGenerator,
          clock,
        }),
    },
    {
      provide: LoginUseCase,
      inject: [
        USER_REPOSITORY,
        CREDENTIAL_REPOSITORY,
        LOGIN_ATTEMPT_REPOSITORY,
        TOKEN_FAMILY_REPOSITORY,
        REFRESH_TOKEN_REPOSITORY,
        PASSWORD_HASHER,
        REFRESH_TOKEN_GENERATOR,
        REFRESH_TOKEN_HASHER,
        TOKEN_SIGNER,
        IDENTITY_EVENT_PUBLISHER,
        TRANSACTION_MANAGER,
        ID_GENERATOR,
        CLOCK,
        DELAY,
      ],
      // Imza ve govde uzunlugu NestJS'in `inject` sozlesmesinden gelir: dizi ile
      // parametreler BIREBIR eslesmek zorundadir. Use case'in KENDI imzasi tek
      // parametrelidir (DEVELOPMENT_RULES 2.5).
      // eslint-disable-next-line max-params, max-lines-per-function
      useFactory: (
        userRepository: UserRepository,
        credentialRepository: CredentialRepository,
        loginAttemptRepository: LoginAttemptRepository,
        tokenFamilyRepository: TokenFamilyRepository,
        refreshTokenRepository: RefreshTokenRepository,
        passwordHasher: PasswordHasher,
        refreshTokenGenerator: RefreshTokenGenerator,
        refreshTokenHasher: RefreshTokenHasher,
        tokenSigner: TokenSigner,
        eventPublisher: DomainEventPublisher,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
        delay: Delay,
      ): LoginUseCase =>
        new LoginUseCase({
          userRepository,
          credentialRepository,
          loginAttemptRepository,
          tokenFamilyRepository,
          refreshTokenRepository,
          passwordHasher,
          refreshTokenGenerator,
          refreshTokenHasher,
          tokenSigner,
          eventPublisher,
          transactionManager,
          idGenerator,
          clock,
          delay,
        }),
    },
    {
      provide: VerifyEmailUseCase,
      inject: [
        USER_REPOSITORY,
        EMAIL_VERIFICATION_CODE_REPOSITORY,
        VERIFICATION_CODE_HASHER,
        IDENTITY_EVENT_PUBLISHER,
        TRANSACTION_MANAGER,
        ID_GENERATOR,
        CLOCK,
      ],
      // Imza NestJS'in `inject` sozlesmesinden gelir; use case'in KENDI imzasi
      // tek parametrelidir (DEVELOPMENT_RULES 2.5).
      // eslint-disable-next-line max-params
      useFactory: (
        userRepository: UserRepository,
        verificationCodeRepository: EmailVerificationCodeRepository,
        verificationCodeHasher: VerificationCodeHasher,
        eventPublisher: DomainEventPublisher,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
      ): VerifyEmailUseCase =>
        new VerifyEmailUseCase({
          userRepository,
          verificationCodeRepository,
          verificationCodeHasher,
          eventPublisher,
          transactionManager,
          idGenerator,
          clock,
        }),
    },
    {
      provide: PublishIdentityEventsUseCase,
      inject: [IDENTITY_OUTBOX_REPOSITORY, EMAIL_PORT, TRANSACTION_MANAGER, CLOCK, APP_CONFIG],
      // eslint-disable-next-line max-params
      useFactory: (
        outboxRepository: IdentityOutboxRepository,
        emailPort: EmailPort,
        transactionManager: TransactionManager,
        clock: Clock,
        config: AppConfig,
      ): PublishIdentityEventsUseCase =>
        new PublishIdentityEventsUseCase({
          outboxRepository,
          emailPort,
          transactionManager,
          clock,
          batchSize: config.outboxRelay.batchSize,
        }),
    },

    // --- Arka plan sureci ---------------------------------------------------
    {
      // Zamanlama config'ten gelir; relay'in kendisi yalnizca zamanlayicidir.
      provide: IdentityOutboxRelay,
      inject: [PublishIdentityEventsUseCase, APP_CONFIG],
      useFactory: (
        publishEvents: PublishIdentityEventsUseCase,
        config: AppConfig,
      ): IdentityOutboxRelay =>
        new IdentityOutboxRelay(publishEvents, {
          enabled: config.outboxRelay.enabled,
          intervalMs: config.outboxRelay.intervalMs,
        }),
    },
  ],
  // Yalnizca PUBLIC yuzey disa acilir: IDENTITY_USER_QUERY (identity.public.ts)
  // ve token dogrulamak isteyenler icin TOKEN_SIGNER. Repository'ler, adapter'lar
  // ve use case'ler modul ICINDE kalir.
  exports: [IDENTITY_USER_QUERY, TOKEN_SIGNER],
})
export class IdentityModule implements NestModule {
  /**
   * Auth middleware TUM rotalara uygulanir — Tenant uc noktalari da dogrulanmis
   * kimlige bu sayede ulasir.
   *
   * Kimliksiz istekler ENGELLENMEZ: middleware yalnizca VARSA token'i dogrular.
   * "Bu islem kimlik ister mi" karari `CurrentUserProvider`'a aittir; kayit ve
   * giris uc noktalari tanimi geregi kimliksizdir.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthContextMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
