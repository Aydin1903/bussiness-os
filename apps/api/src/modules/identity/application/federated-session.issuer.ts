import { type Clock } from '../../../shared/clock.port';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { REFRESH_TOKEN_TTL_DAYS, RefreshToken } from '../domain/refresh-token.entity';
import { RefreshTokenId } from '../domain/refresh-token-id.value-object';
import { TokenFamily } from '../domain/token-family.entity';
import { TokenFamilyId } from '../domain/token-family-id.value-object';
import { type User } from '../domain/user.entity';
import { UserLoggedIn } from '../domain/user-logged-in.event';
import { type RefreshTokenGenerator } from './refresh-token-generator.port';
import { type RefreshTokenHasher } from './refresh-token-hasher.port';
import { type RefreshTokenRepository } from './refresh-token.repository.port';
import { type TokenFamilyRepository } from './token-family.repository.port';
import { type TokenSigner } from './token-signer.port';

const DAY_MS = 24 * 60 * 60 * 1000;

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
 * ⚠️ BILINEN BORC: `LoginUseCase#issueSession` ILE AYNI ISI YAPIYOR
 * ============================================================================
 * Iki yerde ayni oturum acma adimlari var ve bu DURUSTCE kaydediliyor.
 * Birlestirmek `LoginUseCase`i degistirmeyi gerektirir — CLAUDE.md Mutlak
 * Kural 2 (_"istenmedikce refactor yapma"_) bu iste ona dokunmayi yasakliyor
 * ve parola girisi projenin en cok test edilmis yolu.
 *
 * ⚠️ Ama bu bir "sonra bakariz" degil: iki kopya AYRISIRSA hata SESSIZ olur —
 * ornegin refresh omru birinde degisip digerinde degismezse, kullanicinin
 * oturumu NASIL GIRDIGINE gore farkli surer ve kimse fark etmez. Birlestirme
 * ayri bir is olarak, PO onayiyla yapilmalidir.
 *
 * Bu dosyanin TEK savunmasi, omru tek bir yerden (`REFRESH_TOKEN_TTL_DAYS`)
 * okumasidir — yani ayrisabilecek sey mantik, sabit DEGIL.
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

    const family = TokenFamily.start({
      id: TokenFamilyId.create(this.deps.idGenerator.nextId()),
      userId: user.id,
      createdAt: now,
    });

    const rawRefreshToken = this.deps.refreshTokenGenerator.generate();
    const refreshToken = RefreshToken.issue({
      id: RefreshTokenId.create(this.deps.idGenerator.nextId()),
      familyId: family.id,
      tokenHash: this.deps.refreshTokenHasher.hash(rawRefreshToken),
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * DAY_MS),
    });

    await this.deps.tokenFamilyRepository.save(family);
    await this.deps.refreshTokenRepository.save(refreshToken);
    await this.deps.eventPublisher.publish(
      UserLoggedIn.create({
        eventId: this.deps.idGenerator.nextId(),
        userId: user.id,
        sessionId: family.id,
        occurredAt: now,
        correlationId,
      }),
    );

    const identityToken = await this.deps.tokenSigner.signIdentityToken({
      userId: user.id.value,
      sessionId: family.id.value,
    });

    return { identityToken, refreshToken: rawRefreshToken };
  }
}
