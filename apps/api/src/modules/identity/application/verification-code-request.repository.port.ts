import type { Email } from '../domain/email.value-object';
import type { IpAddress } from '../domain/ip-address.value-object';
import type { VerificationCodeRequest } from '../domain/verification-code-request.entity';

/** DI token'i. */
export const VERIFICATION_CODE_REQUEST_REPOSITORY = Symbol('VERIFICATION_CODE_REQUEST_REPOSITORY');

/**
 * `platform.verification_code_requests` kaliciligi (ADR-0019 §7.4).
 *
 * Resend sinirlarinin sayim sorgularini saglar. Sayimlar saf karar fonksiyonuna
 * (`evaluateResend`) girer; pencere (60 dk) `verification-resend-policy.ts`
 * sabitinden gelir ve `since`'i cagiran hesaplar — `LoginAttemptRepository` ile
 * ayni desen.
 *
 * LISTELEME METODU YOKTUR: defter yalnizca SAYILIR ve son zamani sorulur.
 * Satirlari donduren bir metot, kimin ne zaman kod istedigini disari acan bir
 * kapi olurdu.
 */
export interface VerificationCodeRequestRepository {
  /** Istegi kaydeder — sonucundan BAGIMSIZ olarak (bkz. entity yorumu). */
  save(request: VerificationCodeRequest): Promise<void>;

  /**
   * Bu e-posta icin en son istek zamani; hic yoksa `null`.
   *
   * 60 saniyelik bekleme bundan hesaplanir. Sayim degil ZAMAN dondurur: "kac
   * istek" degil, "sonuncusu ne zamandi" sorusudur.
   */
  findLastRequestedAt(email: Email): Promise<Date | null>;

  /** Hesap siniri: e-posta icin `since`'ten beri istek sayisi. */
  countByEmail(email: Email, since: Date): Promise<number>;

  /** Kaynak siniri: IP icin `since`'ten beri istek sayisi. */
  countByIp(ipAddress: IpAddress, since: Date): Promise<number>;
}
