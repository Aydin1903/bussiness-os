import { PasswordResetCode } from '../domain/password-reset-code.entity';
import { PasswordResetCodeId } from '../domain/password-reset-code-id.value-object';
import { VerificationCodeHash } from '../domain/verification-code-hash.value-object';
import { UserId } from '../../../shared/user-id.value-object';

/** `platform.password_reset_codes` satirinin ham bicimi. */
export interface PasswordResetCodeRow {
  readonly id: string;
  readonly userId: string;
  readonly codeHash: string;
  readonly attemptCount: number;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
}

export function toPasswordResetCode(row: PasswordResetCodeRow): PasswordResetCode {
  return PasswordResetCode.fromPersistence({
    id: PasswordResetCodeId.create(row.id),
    userId: UserId.create(row.userId),
    codeHash: VerificationCodeHash.fromDigest(row.codeHash),
    attemptCount: row.attemptCount,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
  });
}

export function toPasswordResetCodeRow(code: PasswordResetCode): PasswordResetCodeRow {
  return {
    id: code.id.value,
    userId: code.userId.value,
    codeHash: code.codeHash.value,
    attemptCount: code.attemptCount,
    expiresAt: code.expiresAt,
    consumedAt: code.consumedAt,
  };
}
