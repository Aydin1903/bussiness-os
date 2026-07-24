import type { PasswordResetCode } from '../domain/password-reset-code.entity';
import type { PasswordResetCodeId } from '../domain/password-reset-code-id.value-object';
import type { UserId } from '../../../shared/user-id.value-object';

/** DI token'i. */
export const PASSWORD_RESET_CODE_REPOSITORY = Symbol('PASSWORD_RESET_CODE_REPOSITORY');

/**
 * `platform.password_reset_codes` kaliciligi (ADR-0024).
 *
 * `EmailVerificationCodeRepository` ile birebir ayni sozlesme — yalnizca kod tipi
 * farkli. Sona erme kontrolu BURADA yapilmaz (domain'in isi); repository yalnizca
 * `consumed_at IS NULL` filtreler.
 */
export interface PasswordResetCodeRepository {
  save(code: PasswordResetCode): Promise<void>;

  /** Kullanicinin tuketilmemis kodunu getirir (en yenisi); yoksa `null`. */
  findActiveByUserId(userId: UserId): Promise<PasswordResetCode | null>;

  /**
   * Deneme sayacini ATOMIK artirir ve yeni degeri dondurur; satir yoksa `null`.
   *
   * §7.3: tek bir `UPDATE ... attempt_count + 1 ... RETURNING` — entity okunup
   * geri YAZILMAZ, es zamanli istekler denemeleri atlatamaz.
   */
  incrementAttemptCount(id: PasswordResetCodeId): Promise<number | null>;
}
