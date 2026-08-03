import { type Provider } from '@nestjs/common';

import { CLOCK, type Clock } from '../../shared/clock.port';
import { DELAY, type Delay } from '../../shared/delay.port';
import { type DomainEventPublisher } from '../../shared/domain-event-publisher.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/id-generator.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../shared/transaction-manager.port';
import { ChangePasswordUseCase } from './application/change-password.use-case';
import {
  CREDENTIAL_REPOSITORY,
  type CredentialRepository,
} from './application/credential.repository.port';
import { IDENTITY_EVENT_PUBLISHER } from './application/identity-event-publisher.port';
import {
  LOGIN_ATTEMPT_REPOSITORY,
  type LoginAttemptRepository,
} from './application/login-attempt.repository.port';
import { PASSWORD_HASHER, type PasswordHasher } from './application/password-hasher.port';
import {
  TOKEN_FAMILY_REPOSITORY,
  type TokenFamilyRepository,
} from './application/token-family.repository.port';
import { USER_REPOSITORY, type UserRepository } from './application/user.repository.port';

/**
 * Parola DEGISTIRME use case saglayicisi (AUTH §7.6).
 *
 * Kendi dosyasinda, `identity-use-case.providers.ts`'e eklenmedi: o dosya zaten
 * 300 satir sinirindaydi ve sifirlama akisi da ayni gerekceyle ayrilmisti
 * (`identity-password-reset.providers.ts`). Degistirme SIFIRLAMA DEGILDIR —
 * kod/e-posta defteri kullanmaz, kaba kuvvet defterini GIRIS ile paylasir — bu
 * yuzden reset dosyasina da konmadi.
 */
export const identityChangePasswordProviders: Provider[] = [
  {
    provide: ChangePasswordUseCase,
    inject: [
      USER_REPOSITORY,
      CREDENTIAL_REPOSITORY,
      LOGIN_ATTEMPT_REPOSITORY,
      TOKEN_FAMILY_REPOSITORY,
      PASSWORD_HASHER,
      IDENTITY_EVENT_PUBLISHER,
      TRANSACTION_MANAGER,
      ID_GENERATOR,
      CLOCK,
      DELAY,
    ],
    // Imza NestJS'in `inject` sozlesmesinden gelir: dizi ile parametreler
    // BIREBIR eslesmek zorundadir. Use case'in KENDI imzasi tek parametrelidir
    // (DEVELOPMENT_RULES 2.5).
    // eslint-disable-next-line max-params
    useFactory: (
      userRepository: UserRepository,
      credentialRepository: CredentialRepository,
      loginAttemptRepository: LoginAttemptRepository,
      tokenFamilyRepository: TokenFamilyRepository,
      passwordHasher: PasswordHasher,
      eventPublisher: DomainEventPublisher,
      transactionManager: TransactionManager,
      idGenerator: IdGenerator,
      clock: Clock,
      delay: Delay,
    ): ChangePasswordUseCase =>
      new ChangePasswordUseCase({
        userRepository,
        credentialRepository,
        loginAttemptRepository,
        tokenFamilyRepository,
        passwordHasher,
        eventPublisher,
        transactionManager,
        idGenerator,
        clock,
        delay,
      }),
  },
];
