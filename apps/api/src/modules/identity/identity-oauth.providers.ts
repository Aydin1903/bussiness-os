import { type Provider } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../../infrastructure/config/app.config';
import { GoogleOAuthAdapter } from '../../infrastructure/oauth/google-oauth.adapter';
import { DefaultOAuthProviderRegistry } from '../../infrastructure/oauth/oauth-provider.registry';
import { CLOCK, type Clock } from '../../shared/clock.port';
import { type DomainEventPublisher } from '../../shared/domain-event-publisher.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/id-generator.port';
import {
  OAUTH_PROVIDER_REGISTRY,
  type OAuthProviderPort,
  type OAuthProviderRegistry,
} from '../../shared/oauth-provider.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../shared/transaction-manager.port';
import { BeginOAuthUseCase } from './application/begin-oauth.use-case';
import { BeginOneTapUseCase } from './application/begin-one-tap.use-case';
import { CompleteOAuthUseCase } from './application/complete-oauth.use-case';
import { CompleteOneTapUseCase } from './application/complete-one-tap.use-case';
import {
  CREDENTIAL_REPOSITORY,
  type CredentialRepository,
} from './application/credential.repository.port';
import {
  EMAIL_VERIFICATION_CODE_REPOSITORY,
  type EmailVerificationCodeRepository,
} from './application/email-verification-code.repository.port';
import {
  FEDERATED_IDENTITY_REPOSITORY,
  type FederatedIdentityRepository,
} from './application/federated-identity.repository.port';
import {
  ListSignInMethodsUseCase,
  UnlinkFederatedIdentityUseCase,
} from './application/federated-identity.use-cases';
import { FederatedSessionIssuer } from './application/federated-session.issuer';
import { IDENTITY_EVENT_PUBLISHER } from './application/identity-event-publisher.port';
import {
  OAUTH_STATE_GENERATOR,
  type OAuthStateGenerator,
} from './application/oauth-state-generator.port';
import {
  ONE_TAP_ATTEMPT_REPOSITORY,
  type OneTapAttemptRepository,
} from './application/one-tap-attempt.repository.port';
import { ResolveFederatedIdentity } from './application/resolve-federated-identity';
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
import { VerifyOAuthEmailUseCase } from './application/verify-oauth-email.use-case';
import { CryptoOAuthStateGenerator } from './infrastructure/crypto-oauth-state-generator.adapter';
import { DrizzleOneTapAttemptRepository } from './infrastructure/drizzle-one-tap-attempt.repository';

/**
 * Sosyal giris (OAuth) baglantilari — ADR-0053.
 *
 * ⚠️ AYRI BIR DOSYA: `identity.module.ts` zaten modulun topolojisini ve
 * port -> adapter eslemelerini tasiyor; parola sifirlama ve parola degistirme
 * de ayni sebeple ayri dosyalarda. Bu isin GERI ALINABILIRLIGI de artiyor —
 * ADR-0053 reddedilseydi silinecek dosya kumesi net olurdu.
 */

/**
 * ⚠️ REGISTRY YAPILANDIRMADAN KURULUR VE EKSIK SAGLAYICI HIC GIRMEZ
 * (ADR-0053 §3.3). Bir `enabled: false` bayragi YOKTUR: yapilandirmanin
 * yoklugu kararin kendisidir.
 *
 * ⚠️ SIRA ONEMLIDIR — `configuredKeys()` arayuzun dugme sirasini besler ve
 * ADR-0053 §9.3 onu gerekcelendirir (yaygin kullanim: Google · Microsoft ·
 * LinkedIn · Facebook). Bugun yalnizca Google var; digerleri eklendiginde bu
 * dizinin SIRASINA eklenmelidirler.
 */
const oauthRegistryProvider: Provider = {
  provide: OAUTH_PROVIDER_REGISTRY,
  inject: [APP_CONFIG, CLOCK],
  useFactory: (config: AppConfig, clock: Clock): OAuthProviderRegistry => {
    const providers: OAuthProviderPort[] = [];

    if (config.oauth.google !== null) {
      providers.push(
        new GoogleOAuthAdapter({
          clientId: config.oauth.google.clientId,
          clientSecret: config.oauth.google.clientSecret,
          clock,
        }),
      );
    }

    return new DefaultOAuthProviderRegistry(providers);
  },
};

const sessionIssuerProvider: Provider = {
  provide: FederatedSessionIssuer,
  inject: [
    TOKEN_FAMILY_REPOSITORY,
    REFRESH_TOKEN_REPOSITORY,
    REFRESH_TOKEN_GENERATOR,
    REFRESH_TOKEN_HASHER,
    TOKEN_SIGNER,
    IDENTITY_EVENT_PUBLISHER,
    ID_GENERATOR,
    CLOCK,
  ],
  // eslint-disable-next-line max-params
  useFactory: (
    tokenFamilyRepository: TokenFamilyRepository,
    refreshTokenRepository: RefreshTokenRepository,
    refreshTokenGenerator: RefreshTokenGenerator,
    refreshTokenHasher: RefreshTokenHasher,
    tokenSigner: TokenSigner,
    eventPublisher: DomainEventPublisher,
    idGenerator: IdGenerator,
    clock: Clock,
  ): FederatedSessionIssuer =>
    new FederatedSessionIssuer({
      tokenFamilyRepository,
      refreshTokenRepository,
      refreshTokenGenerator,
      refreshTokenHasher,
      tokenSigner,
      eventPublisher,
      idGenerator,
      clock,
    }),
};

const beginOAuthProvider: Provider = {
  provide: BeginOAuthUseCase,
  inject: [OAUTH_PROVIDER_REGISTRY, OAUTH_STATE_GENERATOR, TOKEN_SIGNER],
  useFactory: (
    registry: OAuthProviderRegistry,
    stateGenerator: OAuthStateGenerator,
    tokenSigner: TokenSigner,
  ): BeginOAuthUseCase => new BeginOAuthUseCase({ registry, stateGenerator, tokenSigner }),
};

/**
 * ⚠️ D1/D2/D3'un TEK SAHIBI (ADR-0053 EK-1.3) — iki giris de BUNU paylasir.
 * Kopya cikarilsaydi nOAuth savunmasi bir yolda degisip digerinde
 * degismeyebilirdi ve hata SESSIZ olurdu.
 */
const resolverProvider: Provider = {
  provide: ResolveFederatedIdentity,
  inject: [
    USER_REPOSITORY,
    FEDERATED_IDENTITY_REPOSITORY,
    EMAIL_VERIFICATION_CODE_REPOSITORY,
    VERIFICATION_CODE_GENERATOR,
    VERIFICATION_CODE_HASHER,
    FederatedSessionIssuer,
    TOKEN_SIGNER,
    IDENTITY_EVENT_PUBLISHER,
    ID_GENERATOR,
    CLOCK,
  ],
  // eslint-disable-next-line max-params
  useFactory: (
    userRepository: UserRepository,
    federatedIdentityRepository: FederatedIdentityRepository,
    verificationCodeRepository: EmailVerificationCodeRepository,
    verificationCodeGenerator: VerificationCodeGenerator,
    verificationCodeHasher: VerificationCodeHasher,
    sessionIssuer: FederatedSessionIssuer,
    tokenSigner: TokenSigner,
    eventPublisher: DomainEventPublisher,
    idGenerator: IdGenerator,
    clock: Clock,
  ): ResolveFederatedIdentity =>
    new ResolveFederatedIdentity({
      userRepository,
      federatedIdentityRepository,
      verificationCodeRepository,
      verificationCodeGenerator,
      verificationCodeHasher,
      sessionIssuer,
      tokenSigner,
      eventPublisher,
      idGenerator,
      clock,
    }),
};

const beginOneTapProvider: Provider = {
  provide: BeginOneTapUseCase,
  inject: [OAUTH_PROVIDER_REGISTRY, OAUTH_STATE_GENERATOR, TOKEN_SIGNER, APP_CONFIG],
  useFactory: (
    registry: OAuthProviderRegistry,
    stateGenerator: OAuthStateGenerator,
    tokenSigner: TokenSigner,
    config: AppConfig,
  ): BeginOneTapUseCase =>
    new BeginOneTapUseCase({
      registry,
      stateGenerator,
      tokenSigner,
      // ⚠️ Yalnizca YAPILANDIRILMIS saglayicilar. `clientId` sunucudan doner;
      // `NEXT_PUBLIC_*` reddedildi (EK-1.1: iki yerde tutulan deger ayrisir).
      clientIds: config.oauth.google === null ? {} : { google: config.oauth.google.clientId },
    }),
};

const completeOneTapProvider: Provider = {
  provide: CompleteOneTapUseCase,
  inject: [
    OAUTH_PROVIDER_REGISTRY,
    ResolveFederatedIdentity,
    ONE_TAP_ATTEMPT_REPOSITORY,
    TOKEN_SIGNER,
    TRANSACTION_MANAGER,
    ID_GENERATOR,
    CLOCK,
  ],
  // eslint-disable-next-line max-params
  useFactory: (
    registry: OAuthProviderRegistry,
    resolver: ResolveFederatedIdentity,
    oneTapAttemptRepository: OneTapAttemptRepository,
    tokenSigner: TokenSigner,
    transactionManager: TransactionManager,
    idGenerator: IdGenerator,
    clock: Clock,
  ): CompleteOneTapUseCase =>
    new CompleteOneTapUseCase({
      registry,
      resolver,
      oneTapAttemptRepository,
      tokenSigner,
      transactionManager,
      idGenerator,
      clock,
    }),
};

const completeOAuthProvider: Provider = {
  provide: CompleteOAuthUseCase,
  inject: [OAUTH_PROVIDER_REGISTRY, ResolveFederatedIdentity, TOKEN_SIGNER, TRANSACTION_MANAGER],
  useFactory: (
    registry: OAuthProviderRegistry,
    resolver: ResolveFederatedIdentity,
    tokenSigner: TokenSigner,
    transactionManager: TransactionManager,
  ): CompleteOAuthUseCase =>
    new CompleteOAuthUseCase({ registry, resolver, tokenSigner, transactionManager }),
};

const verifyOAuthEmailProvider: Provider = {
  provide: VerifyOAuthEmailUseCase,
  inject: [
    USER_REPOSITORY,
    FEDERATED_IDENTITY_REPOSITORY,
    EMAIL_VERIFICATION_CODE_REPOSITORY,
    VERIFICATION_CODE_HASHER,
    FederatedSessionIssuer,
    TOKEN_SIGNER,
    IDENTITY_EVENT_PUBLISHER,
    TRANSACTION_MANAGER,
    ID_GENERATOR,
    CLOCK,
  ],
  // eslint-disable-next-line max-params
  useFactory: (
    userRepository: UserRepository,
    federatedIdentityRepository: FederatedIdentityRepository,
    verificationCodeRepository: EmailVerificationCodeRepository,
    verificationCodeHasher: VerificationCodeHasher,
    sessionIssuer: FederatedSessionIssuer,
    tokenSigner: TokenSigner,
    eventPublisher: DomainEventPublisher,
    transactionManager: TransactionManager,
    idGenerator: IdGenerator,
    clock: Clock,
  ): VerifyOAuthEmailUseCase =>
    new VerifyOAuthEmailUseCase({
      userRepository,
      federatedIdentityRepository,
      verificationCodeRepository,
      verificationCodeHasher,
      sessionIssuer,
      tokenSigner,
      eventPublisher,
      transactionManager,
      idGenerator,
      clock,
    }),
};

const listSignInMethodsProvider: Provider = {
  provide: ListSignInMethodsUseCase,
  inject: [CREDENTIAL_REPOSITORY, FEDERATED_IDENTITY_REPOSITORY, TRANSACTION_MANAGER],
  useFactory: (
    credentialRepository: CredentialRepository,
    federatedIdentityRepository: FederatedIdentityRepository,
    transactionManager: TransactionManager,
  ): ListSignInMethodsUseCase =>
    new ListSignInMethodsUseCase({
      credentialRepository,
      federatedIdentityRepository,
      transactionManager,
    }),
};

const unlinkFederatedIdentityProvider: Provider = {
  provide: UnlinkFederatedIdentityUseCase,
  inject: [
    CREDENTIAL_REPOSITORY,
    FEDERATED_IDENTITY_REPOSITORY,
    IDENTITY_EVENT_PUBLISHER,
    TRANSACTION_MANAGER,
    ID_GENERATOR,
    CLOCK,
  ],
  // eslint-disable-next-line max-params
  useFactory: (
    credentialRepository: CredentialRepository,
    federatedIdentityRepository: FederatedIdentityRepository,
    eventPublisher: DomainEventPublisher,
    transactionManager: TransactionManager,
    idGenerator: IdGenerator,
    clock: Clock,
  ): UnlinkFederatedIdentityUseCase =>
    new UnlinkFederatedIdentityUseCase({
      credentialRepository,
      federatedIdentityRepository,
      eventPublisher,
      transactionManager,
      idGenerator,
      clock,
    }),
};

export const identityOAuthProviders: readonly Provider[] = [
  { provide: OAUTH_STATE_GENERATOR, useClass: CryptoOAuthStateGenerator },
  { provide: ONE_TAP_ATTEMPT_REPOSITORY, useClass: DrizzleOneTapAttemptRepository },
  oauthRegistryProvider,
  resolverProvider,
  sessionIssuerProvider,
  beginOAuthProvider,
  completeOAuthProvider,
  beginOneTapProvider,
  completeOneTapProvider,
  verifyOAuthEmailProvider,
  listSignInMethodsProvider,
  unlinkFederatedIdentityProvider,
];
