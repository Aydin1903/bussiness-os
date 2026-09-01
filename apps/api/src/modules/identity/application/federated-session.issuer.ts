import { type Clock } from '../../../shared/clock.port';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type User } from '../domain/user.entity';
import { UserLoggedIn } from '../domain/user-logged-in.event';
import { type RefreshTokenGenerator } from './refresh-token-generator.port';
import { type RefreshTokenHasher } from './refresh-token-hasher.port';
import { type RefreshTokenRepository } from './refresh-token.repository.port';
import { issueSessionTokens, persistSessionTokens } from './session-tokens';
import { type TokenFamilyRepository } from './token-family.repository.port';
import { type TokenSigner } from './token-signer.port';

export interface IssuedSession {
  /** KIMLIK token'i — `tenant` claim'i YOK (ADR-0020). */
  readonly identityToken: string;
  /** Ham 256-bit refresh token; veritabaninda yalnizca SHA-256'si durur. */
  readonly refreshToken: string;
}

export interface FederatedSessionIssuerDependencies {
  readonly tokenFamilyRepository: TokenFamilyRepository;
  readonly refreshTokenRepository: RefreshTokenRepository;
  readonly refreshTokenGenerator: RefreshTokenGenerator;
  readonly refreshTokenHasher: RefreshTokenHasher;
  readonly tokenSigner: TokenSigner;
  readonly eventPublisher: DomainEventPublisher;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

/**
 * Sosyal giris sonrasi oturum acar (ADR-0053 §4.3, adim 6).
 *
 * ============================================================================
 * ⚠️ OTURUM SEMANTIGI PAROLA GIRISIYLE BIREBIR AYNIDIR
 * ============================================================================
 * Ayni token ailesi, ayni refresh rotasyonu (ADR-0021), ayni omur, ayni
 * `UserLoggedIn` olayi. ⚠️ AYRI BIR OLAY (`UserLoggedInViaProvider`) ACILMADI:
 * acilsaydi olayin HER TUKETICISI catallanirdi ve "giris" kavrami ikiye
 * bolunurdu. Hangi saglayiciyla girildigi `federated_identities.last_login_at`
 * uzerinden okunur.
 *
 * ============================================================================
 * ✅ KOPYA BORCU KAPANDI (PO talimati) — ORTAK ARITMETIK PAYLASILIYOR
 * ============================================================================
 * ADR-0053 bu dosyayi yazarken `LoginUseCase#issueSession`in adimlarini
 * KOPYALAMISTI ve borc acikca kaydedilmisti: _"iki kopya AYRISIRSA hata SESSIZ
 * olur — ornegin refresh omru birinde degisip digerinde degismezse,
 * kullanicinin oturumu NASIL GIRDIGINE gore farkli surer ve kimse fark
 * etmez."_
 *
 * Bugun token ciftini KURMA ve YAZMA adimlari `session-tokens.ts`te
 * PAYLASILIYOR. ⚠️ Paylasilan sey bilerek DAR: transaction sahipligi, olay
 * yayini ve TOKEN IMZALAMA ANI iki akista FARKLIDIR ve ayri kaldi —
 * `LoginUseCase` token'i COMMIT SONRASI imzalar, bu sinif ise cagiranin
 * transaction'i icinde. Ortak dosyanin yorumu bu ayrimi tek tek yaziyor.
 * ============================================================================
 */
export class FederatedSessionIssuer {
  constructor(private readonly deps: FederatedSessionIssuerDependencies) {}

  /**
   * ⚠️ CAGIRAN BIR TRANSACTION ICINDE OLMALIDIR: aile, token ve olay birlikte
   * ya yazilir ya hic yazilmaz. Bu sinif kendi transaction'ini ACMAZ —
   * baglama/kullanici acma adimlariyla AYNI transaction'da olmasi gerekir.
   */
  async issue(input: {
    readonly user: User;
    readonly now: Date;
    readonly correlationId: string;
  }): Promise<IssuedSession> {
    const { user, now, correlationId } = input;

    // ⚠️ Parola girisiyle PAYLASILAN aritmetik (`session-tokens.ts`).
    const tokens = issueSessionTokens(this.deps, { userId: user.id, now });

    await persistSessionTokens(this.deps, tokens);
    await this.deps.eventPublisher.publish(
      UserLoggedIn.create({
        eventId: this.deps.idGenerator.nextId(),
        userId: user.id,
        sessionId: tokens.family.id,
        occurredAt: now,
        correlationId,
      }),
    );

    const identityToken = await this.deps.tokenSigner.signIdentityToken({
      userId: user.id.value,
      sessionId: tokens.family.id.value,
    });

    return { identityToken, refreshToken: tokens.rawRefreshToken };
  }
}
