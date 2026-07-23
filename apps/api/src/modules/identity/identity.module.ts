import { Module, RequestMethod, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { importPKCS8, importSPKI, type CryptoKey } from 'jose';

import { SystemClock } from '../../infrastructure/clock/system-clock.adapter';
import { APP_CONFIG, type AppConfig } from '../../infrastructure/config/app.config';
import { DrizzleTransactionManager } from '../../infrastructure/database/drizzle-transaction-manager.adapter';
import { TimeoutDelay } from '../../infrastructure/delay/timeout-delay.adapter';
import { EmailModule } from '../../infrastructure/email/email.module';
import { UuidV7IdGenerator } from '../../infrastructure/id/uuid-v7-id-generator.adapter';
import { ContextCurrentUserProvider } from '../../infrastructure/auth/context-current-user.adapter';
import { CLOCK, type Clock } from '../../shared/clock.port';
import { CURRENT_USER_PROVIDER } from '../../shared/current-user.port';
import { DELAY } from '../../shared/delay.port';
import { ID_GENERATOR } from '../../shared/id-generator.port';
import { TRANSACTION_MANAGER, type TransactionManager } from '../../shared/transaction-manager.port';
import { CREDENTIAL_REPOSITORY } from './application/credential.repository.port';
import { EMAIL_VERIFICATION_CODE_REPOSITORY } from './application/email-verification-code.repository.port';
import { IDENTITY_EVENT_PUBLISHER } from './application/identity-event-publisher.port';
import { IDENTITY_OUTBOX_REPOSITORY } from './application/identity-outbox.repository.port';
import { IdentityUserQueryService } from './application/identity-user.query';
import { LOGIN_ATTEMPT_REPOSITORY } from './application/login-attempt.repository.port';
import { PASSWORD_HASHER, type PasswordHasher } from './application/password-hasher.port';
import { REFRESH_TOKEN_GENERATOR } from './application/refresh-token-generator.port';
import { REFRESH_TOKEN_HASHER } from './application/refresh-token-hasher.port';
import { REFRESH_TOKEN_REPOSITORY } from './application/refresh-token.repository.port';
import { TOKEN_FAMILY_REPOSITORY } from './application/token-family.repository.port';
import { TOKEN_SIGNER, type TokenSigner } from './application/token-signer.port';
import { USER_REPOSITORY, type UserRepository } from './application/user.repository.port';
import { VERIFICATION_CODE_GENERATOR } from './application/verification-code-generator.port';
import {
  VERIFICATION_CODE_HASHER,
  type VerificationCodeHasher,
} from './application/verification-code-hasher.port';
import { VERIFICATION_CODE_REQUEST_REPOSITORY } from './application/verification-code-request.repository.port';
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
import { Sha256RefreshTokenHasher } from './infrastructure/sha256-refresh-token-hasher.adapter';
import { TokenSignerAccessTokenIssuer } from './infrastructure/token-signer-access-token-issuer';
import { DrizzleVerificationCodeRequestRepository } from './infrastructure/drizzle-verification-code-request.repository';
import { identityOutboxProviders } from './identity-outbox.providers';
import { identityUseCaseProviders } from './identity-use-case.providers';
import {
  IDENTITY_USER_QUERY,
  TENANT_ACCESS_TOKEN_ISSUER,
  type IdentityUserQuery,
  type TenantAccessTokenIssuer,
} from './identity.public';
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
    {
      provide: VERIFICATION_CODE_REQUEST_REPOSITORY,
      useClass: DrizzleVerificationCodeRequestRepository,
    },
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
    {
      // switch-tenant (platform/session) tenant-scoped access token'i BU dar
      // yetenek uzerinden bastirir — ham TOKEN_SIGNER'a dokunmadan.
      provide: TENANT_ACCESS_TOKEN_ISSUER,
      inject: [TOKEN_SIGNER],
      useFactory: (tokenSigner: TokenSigner): TenantAccessTokenIssuer =>
        new TokenSignerAccessTokenIssuer(tokenSigner),
    },

    // Auth middleware: token'i dogrular ve istek baglamina yazar.
    AuthContextMiddleware,

    // `logout-all` kimlik ister. Kaynak, middleware'in dogruladigi istek
    // baglamidir — Tenant modulu ile AYNI adapter, ayni kural.
    { provide: CURRENT_USER_PROVIDER, useClass: ContextCurrentUserProvider },

    // --- Use case'ler ve arka plan sureci -----------------------------------
    // Ayri dosyada: bu dosya port -> adapter eslemelerini ve modulun
    // topolojisini tutar, orasi use case'lerin bagimlilik kurulumunu.
    ...identityUseCaseProviders,

    // --- Outbox teslimat yolu ve zamanlayicisi ------------------------------
    ...identityOutboxProviders,
  ],
  // Yalnizca PUBLIC yuzey disa acilir: IDENTITY_USER_QUERY, TENANT_ACCESS_TOKEN_ISSUER
  // (identity.public.ts) ve token dogrulamak isteyenler icin TOKEN_SIGNER.
  // Repository'ler, adapter'lar ve use case'ler modul ICINDE kalir.
  exports: [IDENTITY_USER_QUERY, TENANT_ACCESS_TOKEN_ISSUER, TOKEN_SIGNER],
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
