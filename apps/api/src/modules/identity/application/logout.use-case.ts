import { type Clock } from '../../../shared/clock.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { UserId } from '../../../shared/user-id.value-object';
import { type RefreshTokenHasher } from './refresh-token-hasher.port';
import { type RefreshTokenRepository } from './refresh-token.repository.port';
import { type TokenFamilyRepository } from './token-family.repository.port';

export interface LogoutCommand {
  readonly refreshToken: string;
}

export interface LogoutAllCommand {
  /** Dogrulanmis token'dan gelir; istek govdesinden ALINMAZ. */
  readonly userId: string;
}

/** DEVELOPMENT_RULES 2.5: 3'ten fazla bagimlilik obje olarak alinir. */
export interface LogoutDependencies {
  readonly tokenFamilyRepository: TokenFamilyRepository;
  readonly refreshTokenRepository: RefreshTokenRepository;
  readonly refreshTokenHasher: RefreshTokenHasher;
  readonly transactionManager: TransactionManager;
  readonly clock: Clock;
}

/**
 * Oturum sonlandirma (AUTH §12, ADR-0023).
 *
 * ============================================================================
 * CIKIS SUNUCUDA GERCEKLESIR
 * ============================================================================
 * ADR-0023: cikis bir DURUM DEGISIKLIGIDIR, arayuz olayi degil.
 * `localStorage.clear()` yalnizca o cihazi etkiler; token'in KOPYASINI almis
 * bir saldirgani hic etkilemez. Bu yuzden iptal veritabaninda yapilir ve
 * birimi AILEDIR — tek token iptali rotasyon nedeniyle zaten anlamsizdir.
 *
 * Access token 15 dakikaya kadar gecerli kalmaya devam eder; deny-list V1'de
 * BILINCLI olarak yoktur (ADR-0023).
 * ============================================================================
 *
 * ============================================================================
 * HER ZAMAN SESSIZCE BASARILI
 * ============================================================================
 * Bilinmeyen, suresi dolmus veya zaten iptal edilmis bir token da BASARI
 * uretir. Iki sebep:
 *   1. 401 donmek "bu token gercekti" bilgisini verir — bir oracle.
 *   2. Cikis IDEMPOTENT olmalidir: kullanici iki kez basar, istemci yeniden
 *      dener. Zaten dusmus bir oturumu kapatmak basarisizlik degildir.
 * ============================================================================
 */
export class LogoutUseCase {
  constructor(private readonly deps: LogoutDependencies) {}

  /** Sunulan token'in AILESINI iptal eder. */
  async execute(command: LogoutCommand): Promise<void> {
    const now = this.deps.clock.now();
    const tokenHash = this.deps.refreshTokenHasher.hash(command.refreshToken);

    await this.deps.transactionManager.runInTransaction(async () => {
      const token = await this.deps.refreshTokenRepository.findByTokenHash(tokenHash);
      if (token === null) {
        return;
      }

      const family = await this.deps.tokenFamilyRepository.findById(token.familyId);
      if (family === null || family.isRevoked) {
        // Zaten iptal: ILK iptal nedeni denetim gercegidir, uzerine yazilmaz.
        return;
      }

      family.revoke('logout', now);
      await this.deps.tokenFamilyRepository.save(family);
    });
  }

  /**
   * Kullanicinin TUM aktif ailelerini iptal eder; iptal edilen oturum sayisini
   * dondurur.
   *
   * Cihaz kaybinda kullanilir ve "cihaz yonetimi" arayuzu olmadan sunulabilen
   * minimum yetenektir (ADR-0023). Kimlik dogrulanmis token'dan gelir —
   * govdeden bir `userId` kabul etmek, herkesin herkesi cikartabilmesi demekti.
   */
  async executeAll(command: LogoutAllCommand): Promise<number> {
    const now = this.deps.clock.now();
    const userId = UserId.create(command.userId);

    return this.deps.transactionManager.runInTransaction(() =>
      this.deps.tokenFamilyRepository.revokeAllActiveByUserId(userId, 'logout-all', now),
    );
  }
}
