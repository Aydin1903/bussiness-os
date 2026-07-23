import { type Provider } from '@nestjs/common';

import { CLOCK, type Clock } from '../../shared/clock.port';
import { DELAY, type Delay } from '../../shared/delay.port';
import { type DomainEventPublisher } from '../../shared/domain-event-publisher.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/id-generator.port';
import { TRANSACTION_MANAGER, type TransactionManager } from '../../shared/transaction-manager.port';
import {
  CREDENTIAL_REPOSITORY,
  type CredentialRepository,
} from './application/credential.repository.port';
import {
  EMAIL_VERIFICATION_CODE_REPOSITORY,
  type EmailVerificationCodeRepository,
} from './application/email-verification-code.repository.port';
import { IDENTITY_EVENT_PUBLISHER } from './application/identity-event-publisher.port';
import { LoginUseCase } from './application/login.use-case';
import { LogoutUseCase } from './application/logout.use-case';
import {
  LOGIN_ATTEMPT_REPOSITORY,
  type LoginAttemptRepository,
} from './application/login-attempt.repository.port';
import { PASSWORD_HASHER, type PasswordHasher } from './application/password-hasher.port';
import {
  REFRESH_TOKEN_GENERATOR,
  type RefreshTokenGenerator,
} from './application/refresh-token-generator.port';
import {
  REFRESH_TOKEN_HASHER,
  type RefreshTokenHasher,
} from './application/refresh-token-hasher.port';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from './application/refresh-token.repository.port';
import { RefreshSessionUseCase } from './application/refresh-session.use-case';
import { RegisterUserUseCase } from './application/register-user.use-case';
import { ResendVerificationUseCase } from './application/resend-verification.use-case';
import {
  TOKEN_FAMILY_REPOSITORY,
  type TokenFamilyRepository,
} from './application/token-family.repository.port';
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
import {
  VERIFICATION_CODE_REQUEST_REPOSITORY,
  type VerificationCodeRequestRepository,
} from './application/verification-code-request.repository.port';
import { VerifyEmailUseCase } from './application/verify-email.use-case';

/**
 * Use case ve arka plan sureci saglayicilari.
 *
 * `identity.module.ts`'ten AYRILDI cunku modul dosyasi 300 satir sinirini
 * asmisti. Ayrim keyfi degil: burada USE CASE'lerin bagimliliklari kurulur,
 * modul dosyasinda ise port -> adapter eslemeleri ve modulun topolojisi durur.
 *
 * Use case'ler saf TypeScript'tir ve NestJS'i BILMEZLER; factory'lerin uzun
 * imzalari da bundan gelir — `inject` dizisiyle birebir eslesmek zorundadirlar.
 */
export const identityUseCaseProviders: Provider[] = [
    {
      provide: RegisterUserUseCase,
      inject: [
        USER_REPOSITORY,
        CREDENTIAL_REPOSITORY,
        EMAIL_VERIFICATION_CODE_REPOSITORY,
        VERIFICATION_CODE_REQUEST_REPOSITORY,
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
        requestRepository: VerificationCodeRequestRepository,
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
          requestRepository,
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
      provide: ResendVerificationUseCase,
      inject: [
        USER_REPOSITORY,
        EMAIL_VERIFICATION_CODE_REPOSITORY,
        VERIFICATION_CODE_REQUEST_REPOSITORY,
        VERIFICATION_CODE_GENERATOR,
        VERIFICATION_CODE_HASHER,
        IDENTITY_EVENT_PUBLISHER,
        TRANSACTION_MANAGER,
        ID_GENERATOR,
        CLOCK,
      ],
      // eslint-disable-next-line max-params
      useFactory: (
        userRepository: UserRepository,
        verificationCodeRepository: EmailVerificationCodeRepository,
        requestRepository: VerificationCodeRequestRepository,
        verificationCodeGenerator: VerificationCodeGenerator,
        verificationCodeHasher: VerificationCodeHasher,
        eventPublisher: DomainEventPublisher,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
      ): ResendVerificationUseCase =>
        new ResendVerificationUseCase({
          userRepository,
          verificationCodeRepository,
          requestRepository,
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
    provide: RefreshSessionUseCase,
    inject: [
      USER_REPOSITORY,
      TOKEN_FAMILY_REPOSITORY,
      REFRESH_TOKEN_REPOSITORY,
      REFRESH_TOKEN_GENERATOR,
      REFRESH_TOKEN_HASHER,
      TOKEN_SIGNER,
      IDENTITY_EVENT_PUBLISHER,
      TRANSACTION_MANAGER,
      ID_GENERATOR,
      CLOCK,
    ],
    // eslint-disable-next-line max-params
    useFactory: (
      userRepository: UserRepository,
      tokenFamilyRepository: TokenFamilyRepository,
      refreshTokenRepository: RefreshTokenRepository,
      refreshTokenGenerator: RefreshTokenGenerator,
      refreshTokenHasher: RefreshTokenHasher,
      tokenSigner: TokenSigner,
      eventPublisher: DomainEventPublisher,
      transactionManager: TransactionManager,
      idGenerator: IdGenerator,
      clock: Clock,
    ): RefreshSessionUseCase =>
      new RefreshSessionUseCase({
        userRepository,
        tokenFamilyRepository,
        refreshTokenRepository,
        refreshTokenGenerator,
        refreshTokenHasher,
        tokenSigner,
        eventPublisher,
        transactionManager,
        idGenerator,
        clock,
      }),
  },
  {
    provide: LogoutUseCase,
    inject: [
      TOKEN_FAMILY_REPOSITORY,
      REFRESH_TOKEN_REPOSITORY,
      REFRESH_TOKEN_HASHER,
      TRANSACTION_MANAGER,
      CLOCK,
    ],
    // eslint-disable-next-line max-params
    useFactory: (
      tokenFamilyRepository: TokenFamilyRepository,
      refreshTokenRepository: RefreshTokenRepository,
      refreshTokenHasher: RefreshTokenHasher,
      transactionManager: TransactionManager,
      clock: Clock,
    ): LogoutUseCase =>
      new LogoutUseCase({
        tokenFamilyRepository,
        refreshTokenRepository,
        refreshTokenHasher,
        transactionManager,
        clock,
      }),
  },
];
