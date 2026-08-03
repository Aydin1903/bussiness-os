import { type Provider } from '@nestjs/common';

import { CLOCK, type Clock } from '../../shared/clock.port';
import { type DomainEventPublisher } from '../../shared/domain-event-publisher.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/id-generator.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../shared/transaction-manager.port';
import {
  CREDENTIAL_REPOSITORY,
  type CredentialRepository,
} from './application/credential.repository.port';
import { IDENTITY_EVENT_PUBLISHER } from './application/identity-event-publisher.port';
import { PASSWORD_HASHER, type PasswordHasher } from './application/password-hasher.port';
import {
  PASSWORD_RESET_CODE_REPOSITORY,
  type PasswordResetCodeRepository,
} from './application/password-reset-code.repository.port';
import { RequestPasswordResetUseCase } from './application/request-password-reset.use-case';
import { ResetPasswordUseCase } from './application/reset-password.use-case';
import {
  TOKEN_FAMILY_REPOSITORY,
  type TokenFamilyRepository,
} from './application/token-family.repository.port';
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

/**
 * Parola sifirlama use case saglayicilari (ADR-0024).
 *
 * `identity-use-case.providers.ts`'ten AYRILDI: iki reset use case eklenince o
 * dosya 300 satir sinirini asti. Sifirlama akisi (forgot + reset) kendi kapali
 * kumesidir; rate-limit defterini dogrulama akisiyla paylasir ama kendi kod ve
 * olaylarini tasir.
 */
export const identityPasswordResetProviders: Provider[] = [
  {
    provide: RequestPasswordResetUseCase,
    inject: [
      USER_REPOSITORY,
      PASSWORD_RESET_CODE_REPOSITORY,
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
      passwordResetCodeRepository: PasswordResetCodeRepository,
      requestRepository: VerificationCodeRequestRepository,
      verificationCodeGenerator: VerificationCodeGenerator,
      verificationCodeHasher: VerificationCodeHasher,
      eventPublisher: DomainEventPublisher,
      transactionManager: TransactionManager,
      idGenerator: IdGenerator,
      clock: Clock,
    ): RequestPasswordResetUseCase =>
      new RequestPasswordResetUseCase({
        userRepository,
        passwordResetCodeRepository,
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
    provide: ResetPasswordUseCase,
    inject: [
      USER_REPOSITORY,
      CREDENTIAL_REPOSITORY,
      PASSWORD_RESET_CODE_REPOSITORY,
      TOKEN_FAMILY_REPOSITORY,
      PASSWORD_HASHER,
      VERIFICATION_CODE_HASHER,
      IDENTITY_EVENT_PUBLISHER,
      TRANSACTION_MANAGER,
      ID_GENERATOR,
      CLOCK,
    ],
    // eslint-disable-next-line max-params
    useFactory: (
      userRepository: UserRepository,
      credentialRepository: CredentialRepository,
      passwordResetCodeRepository: PasswordResetCodeRepository,
      tokenFamilyRepository: TokenFamilyRepository,
      passwordHasher: PasswordHasher,
      verificationCodeHasher: VerificationCodeHasher,
      eventPublisher: DomainEventPublisher,
      transactionManager: TransactionManager,
      idGenerator: IdGenerator,
      clock: Clock,
    ): ResetPasswordUseCase =>
      new ResetPasswordUseCase({
        userRepository,
        credentialRepository,
        passwordResetCodeRepository,
        tokenFamilyRepository,
        passwordHasher,
        verificationCodeHasher,
        eventPublisher,
        transactionManager,
        idGenerator,
        clock,
      }),
  },
];
