import type { EmailVerificationCode } from '../domain/email-verification-code.entity';
import type { EmailVerificationCodeId } from '../domain/email-verification-code-id.value-object';
import type { UserId } from '../../../shared/user-id.value-object';

/** DI token'i. */
export const EMAIL_VERIFICATION_CODE_REPOSITORY = Symbol('EMAIL_VERIFICATION_CODE_REPOSITORY');

/**
 * `platform.email_verification_codes` kaliciligi icin application port'u (ADR-0019).
 */
export interface EmailVerificationCodeRepository {
  save(code: EmailVerificationCode): Promise<void>;

  /**
   * Kullanicinin tuketilmemis kodunu getirir (en yenisi); yoksa `null`.
   *
   * Suresi dolup dolmadigi BURADA kontrol edilmez — o bir zaman kararidir ve
   * domain'e (`code.isExpired(now)`) aittir. Repository yalnizca `consumed_at IS
   * NULL` filtreler.
   */
  findActiveByUserId(userId: UserId): Promise<EmailVerificationCode | null>;

  /**
   * Deneme sayacini ATOMIK artirir ve yeni degeri dondurur; satir yoksa `null`.
   *
   * §7.3: sayac "oku -> karsilastir -> yaz" ile artirilirsa es zamanli istekler
   * denemeleri atlatir. Bu yuzden artis, tek bir `UPDATE ... SET attempt_count =
   * attempt_count + 1 ... RETURNING` ile yapilir — entity'yi okuyup geri YAZMAZ.
   */
  incrementAttemptCount(id: EmailVerificationCodeId): Promise<number | null>;
}
