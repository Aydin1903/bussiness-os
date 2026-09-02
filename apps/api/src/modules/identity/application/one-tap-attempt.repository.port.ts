import { type IpAddress } from '../domain/ip-address.value-object';

/** DI token'i. */
export const ONE_TAP_ATTEMPT_REPOSITORY = Symbol('ONE_TAP_ATTEMPT_REPOSITORY');

/**
 * `platform.one_tap_attempts` kaliciligi (ADR-0053 EK-1.4).
 *
 * ============================================================================
 * ⚠️ E-POSTA BAZLI BIR METOT YOKTUR VE EKLENMEMELIDIR
 * ============================================================================
 * `countByEmail(...)` gibi bir metot, saldirganin kurbanin adresiyle art arda
 * basarisiz One Tap gonderip KURBANI KILITLEMESINE yol acardi — `login_attempts`
 * defterinin bu uc icin KULLANILAMAMASININ da sebebi tam olarak budur
 * (migration `0041` ayrintisiyla yaziyor).
 *
 * Sinir yalnizca KAYNAK (IP) tarafindadir.
 * ============================================================================
 */
export interface OneTapAttemptRepository {
  /** Verilen andan SONRAKI denemeleri sayar (kayan pencere). */
  countByIpSince(ipAddress: IpAddress, since: Date): Promise<number>;

  /** ⚠️ EKLEME-YALNIZ: guncelleme metodu yoktur, `0041` yetkisi de vermez. */
  record(input: { id: string; ipAddress: IpAddress; attemptedAt: Date }): Promise<void>;
}
