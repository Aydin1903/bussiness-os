import { type Clock } from '../../../shared/clock.port';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { InvalidTokenError } from '../domain/identity.error';
import { REFRESH_TOKEN_TTL_DAYS, RefreshToken } from '../domain/refresh-token.entity';
import { RefreshTokenId } from '../domain/refresh-token-id.value-object';
import { RefreshTokenReuseDetected } from '../domain/refresh-token-reuse-detected.event';
import { type TokenFamily } from '../domain/token-family.entity';
import { type User } from '../domain/user.entity';
import { type RefreshTokenHasher } from './refresh-token-hasher.port';
import { type RefreshTokenGenerator } from './refresh-token-generator.port';
import { type RefreshTokenRepository } from './refresh-token.repository.port';
import { type TokenFamilyRepository } from './token-family.repository.port';
import { type TokenSigner } from './token-signer.port';
import { type UserRepository } from './user.repository.port';

const DAY_MS = 24 * 60 * 60_000;

export interface RefreshSessionCommand {
  readonly refreshToken: string;
  readonly correlationId: string;
}

export interface RefreshSessionResult {
  /**
   * KIMLIK token'i (ADR-0020 asama 1).
   *
   * §11.2 diyagrami `accessToken` der; tenant-scoped access token ise tenant
   * SECIMI adimindan cikar ve o adim henuz yoktur (MT §7.4). Bugun hicbir oturum
   * tenant tasimadigi icin yenileme de tasiyamaz — bkz. sinif yorumundaki borc.
   */
  readonly identityToken: string;
  readonly refreshToken: string;
}

/** DEVELOPMENT_RULES 2.5: 3'ten fazla bagimlilik obje olarak alinir. */
export interface RefreshSessionDependencies {
  readonly userRepository: UserRepository;
  readonly tokenFamilyRepository: TokenFamilyRepository;
  readonly refreshTokenRepository: RefreshTokenRepository;
  readonly refreshTokenGenerator: RefreshTokenGenerator;
  readonly refreshTokenHasher: RefreshTokenHasher;
  readonly tokenSigner: TokenSigner;
  readonly eventPublisher: DomainEventPublisher;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

interface LoadedSession {
  readonly token: RefreshToken;
  readonly family: TokenFamily;
  readonly user: User;
}

/**
 * Refresh token'i rotasyona ugratir ve oturumu yeniler (AUTH §11, ADR-0021).
 *
 * ============================================================================
 * YENIDEN KULLANIM TESPITI — ve neden iptal AYRI TRANSACTION'DA commit edilir
 * ============================================================================
 * Zaten kullanilmis bir token yeniden sunulursa, IKI TARAF ayni zinciri
 * kullaniyor demektir (§11.3). Hangisinin mesru oldugunu bilemeyiz; bu yuzden
 * ailenin TAMAMI iptal edilir ve istek 401 alir.
 *
 * Iptal ile 401 ayni transaction'da olsaydi, firlatilan hata iptali GERI ALIR:
 * calinan token'in ailesi ayakta kalir ve ADR-0021'in tek gercek korumasi
 * sessizce calismaz. Bu yuzden iptal kendi transaction'inda COMMIT edilir, hata
 * ondan SONRA firlatilir. (`LoginUseCase` basarisiz denemeyi, resend defterini
 * ayni sebeple ayirir.)
 *
 * Alarm event'i de iptalle AYNI transaction'dadir: iptal olmadan alarm, alarm
 * olmadan iptal olmaz.
 * ============================================================================
 *
 * ============================================================================
 * ⚠️ TEKNIK BORC — §11.4'un UC kontrolunden yalnizca BIRI uygulaniyor
 * ============================================================================
 * ADR-0021 her yenilemede sunlarin dogrulanmasini ister:
 *   1. Kullanici hala `active` mi?          -> UYGULANDI
 *   2. Secili tenant'taki membership aktif mi? -> YOK
 *   3. Tenant hala `active` mi?             -> YOK
 *
 * 2 ve 3 bugun UYGULANAMAZ: tenant secimi (switch-tenant, MT §7.4) henuz
 * yazilmadi ve hicbir oturum tenant tasimiyor. Sahte bir kontrol koymak
 * ("tenant yoksa gec") yerine eksik BIRAKILDI ve borc olarak yazildi
 * (AUTH_ARCHITECTURE §11.5). switch-tenant slice'i bu use case'i degistirmek
 * zorundadir; o gun bu yorum silinir.
 * ============================================================================
 *
 * TUM redler AYNI hatayi (401) uretir: satir yok, suresi dolmus, aile iptal
 * edilmis, kullanici pasif — hicbiri istemciye ayirt ettirilmez.
 */
export class RefreshSessionUseCase {
  constructor(private readonly deps: RefreshSessionDependencies) {}

  async execute(command: RefreshSessionCommand): Promise<RefreshSessionResult> {
    const now = this.deps.clock.now();
    const tokenHash = this.deps.refreshTokenHasher.hash(command.refreshToken);

    const session = await this.#load(tokenHash);
    if (session === null) {
      throw new InvalidTokenError('refresh token bulunamadi');
    }

    if (session.token.isUsed) {
      // Once KORU, sonra reddet — sirasi tersine cevrilemez (bkz. sinif yorumu).
      await this.#handleReuse(session, now, command.correlationId);
      throw new InvalidTokenError('refresh token yeniden kullanildi');
    }

    this.#assertRenewable(session, now);

    return this.#rotate(session, now);
  }

  async #load(tokenHash: ReturnType<RefreshTokenHasher['hash']>): Promise<LoadedSession | null> {
    return this.deps.transactionManager.runInTransaction(async () => {
      const token = await this.deps.refreshTokenRepository.findByTokenHash(tokenHash);
      if (token === null) {
        return null;
      }

      const family = await this.deps.tokenFamilyRepository.findById(token.familyId);
      if (family === null) {
        return null;
      }

      const user = await this.deps.userRepository.findById(family.userId);
      return user === null ? null : { token, family, user };
    });
  }

  /** Aileyi iptal eder ve alarmi yayinlar — ikisi birlikte COMMIT olur. */
  async #handleReuse(session: LoadedSession, now: Date, correlationId: string): Promise<void> {
    const { family, user } = session;

    if (family.isRevoked) {
      // Aile zaten dusmus; tekrar iptal bir cagirma hatasidir. Alarm da
      // tekrarlanmaz: ilk tespit zaten yayinlandi.
      return;
    }

    await this.deps.transactionManager.runInTransaction(async () => {
      family.revoke('token-reuse-detected', now);
      await this.deps.tokenFamilyRepository.save(family);
      await this.deps.eventPublisher.publish(
        RefreshTokenReuseDetected.create({
          eventId: this.deps.idGenerator.nextId(),
          userId: user.id,
          familyId: family.id,
          occurredAt: now,
          correlationId,
        }),
      );
    });
  }

  /** Yenilemenin onkosullari. Hepsi AYNI hatayi uretir (§16). */
  #assertRenewable(session: LoadedSession, now: Date): void {
    if (session.token.isExpired(now)) {
      throw new InvalidTokenError('refresh token suresi dolmus');
    }
    if (session.family.isRevoked) {
      throw new InvalidTokenError('oturum sonlandirilmis');
    }
    // §11.4 kontrol 1. Kontrol 2 ve 3 icin bkz. sinif yorumundaki borc.
    if (!session.user.isActive) {
      throw new InvalidTokenError('kullanici aktif degil');
    }
  }

  /** Rotasyon: eski token tuketilir, AYNI ailede yenisi dogar — tek transaction. */
  async #rotate(session: LoadedSession, now: Date): Promise<RefreshSessionResult> {
    const rawRefreshToken = this.deps.refreshTokenGenerator.generate();

    const issued = RefreshToken.issue({
      id: RefreshTokenId.create(this.deps.idGenerator.nextId()),
      familyId: session.family.id,
      tokenHash: this.deps.refreshTokenHasher.hash(rawRefreshToken),
      // Mutlak omur ailenin degil TOKEN'in omrudur; her rotasyonda yeniden
      // baslar. Ailenin kendi mutlak siniri ayri bir karardir (bugun yok).
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * DAY_MS),
    });

    await this.deps.transactionManager.runInTransaction(async () => {
      session.token.markUsed(now);
      await this.deps.refreshTokenRepository.save(session.token);
      await this.deps.refreshTokenRepository.save(issued);
    });

    // Token, rotasyon COMMIT OLDUKTAN SONRA imzalanir: var olmayan bir oturuma
    // isaret eden token dagitilmaz (LoginUseCase ile ayni kural).
    const identityToken = await this.deps.tokenSigner.signIdentityToken({
      userId: session.user.id.value,
      sessionId: session.family.id.value,
    });

    return { identityToken, refreshToken: rawRefreshToken };
  }
}
