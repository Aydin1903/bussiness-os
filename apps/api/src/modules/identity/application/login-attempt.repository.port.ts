import type { Email } from '../domain/email.value-object';
import type { IpAddress } from '../domain/ip-address.value-object';
import type { LoginAttempt } from '../domain/login-attempt.entity';

/** DI token'i. */
export const LOGIN_ATTEMPT_REPOSITORY = Symbol('LOGIN_ATTEMPT_REPOSITORY');

/**
 * `platform.login_attempts` kaliciligi icin application port'u (ADR-0022).
 *
 * Uc katmanli kaba kuvvet korumasinin sayim sorgularini saglar. Sayimlar saf
 * karar fonksiyonuna (`evaluateBruteForce`) girer; pencereler (15 dk / 60 dk)
 * `brute-force-policy.ts` sabitlerinden gelir ve `since`'i cagiran hesaplar.
 *
 * Sayimlar yalnizca BASARISIZ denemeleri sayar (`succeeded = false`).
 */
export interface LoginAttemptRepository {
  /** Denemeyi (basarili veya basarisiz) kaydeder. */
  save(attempt: LoginAttempt): Promise<void>;

  /** Katman 1: `(e-posta, IP)` cifti icin `since`'ten beri basarisiz deneme sayisi. */
  countFailuresByEmailAndIp(email: Email, ipAddress: IpAddress, since: Date): Promise<number>;

  /** Katman 2: e-posta icin `since`'ten beri basarisiz deneme sayisi. */
  countFailuresByEmail(email: Email, since: Date): Promise<number>;

  /** Katman 3: IP icin `since`'ten beri basarisiz deneme sayisi. */
  countFailuresByIp(ipAddress: IpAddress, since: Date): Promise<number>;
}
