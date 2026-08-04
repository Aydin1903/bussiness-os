import { type RateLimitedAction } from '../domain/rate-limit.policy';
import { type TenantId } from '../domain/tenant-id.value-object';

export const RATE_LIMIT_REPOSITORY = Symbol('RATE_LIMIT_REPOSITORY');

export interface RegisterRequestInput {
  readonly tenantId: TenantId;
  readonly userId: string;
  readonly action: RateLimitedAction;
  /** Saate yuvarlanmis pencere basi — `currentWindowStart(now)`. */
  readonly windowStart: Date;
}

/**
 * Oran siniri sayaci (ADR-0029 §5).
 *
 * ============================================================================
 * ARTIRIR VE ARTMIS DEGERI DONER — TEK ISLEMDE
 * ============================================================================
 * "Once oku, karar ver, sonra yaz" AYRI bir port metodu olarak sunulmadi ve
 * bu kasitli: o desen es zamanli isteklerde YARISIR. Yuz paralel istek ayni
 * anda 29 okur ve HEPSI gecer — ki maliyet saldirisinin sekli tam olarak
 * budur.
 *
 * Bu yuzden imza tek yon sunar: artir, artmis degeri al. Sayim ve artirma
 * ayni satir kilidinin altindadir.
 * ============================================================================
 *
 * KARAR BURADA VERILMEZ. Repository SAYI dondurur; limitle karsilastirmayi
 * `evaluateRateLimit` yapar (`ConversationRepository.findOwnerUserId` ile ayni
 * disiplin: repository veri dondurur, YETKI/BUTCE karari vermez).
 */
export interface RateLimitRepository {
  /**
   * Sayaci bir artirir ve ARTMIS degeri doner.
   *
   * Ilk istekte satir yoktur; olusturulur ve `1` doner. Pencere degistiginde
   * `windowStart` farklidir, yani YENI bir satir olusur ve sayim sifirdan
   * baslar — ayri bir sifirlama isi YOKTUR.
   */
  registerRequest(input: RegisterRequestInput): Promise<number>;
}
