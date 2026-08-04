import { type Clock } from '../../../shared/clock.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { RateLimitExceededError } from '../domain/knowledge.error';
import {
  currentWindowStart,
  evaluateRateLimit,
  type RateLimitedAction,
} from '../domain/rate-limit.policy';
import { type TenantId } from '../domain/tenant-id.value-object';
import { type RateLimitRepository } from './rate-limit.repository.port';

/** T0'in ihtiyaci olan uc bagimlilik; iki use case de bunlari zaten tasir. */
export interface RateLimitDependencies {
  readonly rateLimitRepository: RateLimitRepository;
  readonly transactionManager: TransactionManager;
  readonly clock: Clock;
}

/**
 * T0 — pahali is BASLAMADAN once sayaci artirir, gerekirse reddeder.
 *
 * ============================================================================
 * KENDI TRANSACTION'INDA, HEMEN COMMIT
 * ============================================================================
 * Projede bes kez tekrarlanan ders: pahali cagrilar transaction DISINDA
 * kalir, ve bir istegi reddeden kayit KENDI transaction'inda commit edilir.
 * Sayac T1'e girseydi iki sey birden bozulurdu:
 *
 *   1. Embedding/completion cagrisi boyunca veritabani baglantisi TUTULURDU.
 *   2. Cagri hata verip transaction geri alindiginda SAYAC DA GERI ALINIRDI —
 *      yani hata ureten istekler bedava olurdu ve bir hata dongusu sinirsiz
 *      para harcayabilirdi.
 *
 * ============================================================================
 * BASARISIZ ISTEK DE KOTADAN DUSER — bilincli
 * ============================================================================
 * Sayac artirildiktan sonra embedding veya completion cokerse pay geri
 * VERILMEZ. Gerekce: cagri yapildiysa para zaten harcanmistir, ve "iade"
 * mantigi sayaci yeniden yarisa acardi (iade eden ile artiran arasinda ayni
 * es zamanlilik problemi).
 *
 * Kabul edilen bedel: uzun bir saglayici kesintisinde kullanici kotasi yanar.
 * Pencere bir saat oldugu icin kendiliginden iyilesir.
 * ============================================================================
 *
 * @throws {RateLimitExceededError} Pencere icindeki pay tukendiginde.
 */
export async function enforceRateLimit(
  deps: RateLimitDependencies,
  input: {
    readonly tenantId: TenantId;
    readonly userId: string;
    readonly action: RateLimitedAction;
    readonly limit: number;
  },
): Promise<void> {
  const now = deps.clock.now();
  const windowStart = currentWindowStart(now);

  const count = await deps.transactionManager.runInCurrentTenantTransaction(() =>
    deps.rateLimitRepository.registerRequest({
      tenantId: input.tenantId,
      userId: input.userId,
      action: input.action,
      windowStart,
    }),
  );

  const decision = evaluateRateLimit({ count, limit: input.limit, windowStart, now });

  if (decision.action === 'exceeded') {
    throw new RateLimitExceededError(input.limit, decision.retryAfterSeconds);
  }
}
