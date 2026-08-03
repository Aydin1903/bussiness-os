import { EmailVerificationCode } from '../domain/email-verification-code.entity';
import { EmailVerificationCodeId } from '../domain/email-verification-code-id.value-object';
import { VerificationCodeHash } from '../domain/verification-code-hash.value-object';
import { UserId } from '../../../shared/user-id.value-object';

/** `platform.email_verification_codes` satirinin ham bicimi. */
export interface EmailVerificationCodeRow {
  readonly id: string;
  readonly userId: string;
  readonly codeHash: string;
  readonly attemptCount: number;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
}

export function toEmailVerificationCode(row: EmailVerificationCodeRow): EmailVerificationCode {
  return EmailVerificationCode.fromPersistence({
    id: EmailVerificationCodeId.create(row.id),
    userId: UserId.create(row.userId),
    codeHash: VerificationCodeHash.fromDigest(row.codeHash),
    attemptCount: row.attemptCount,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
  });
}

export function toEmailVerificationCodeRow(code: EmailVerificationCode): EmailVerificationCodeRow {
  return {
    id: code.id.value,
    userId: code.userId.value,
    codeHash: code.codeHash.value,
    attemptCount: code.attemptCount,
    expiresAt: code.expiresAt,
    consumedAt: code.consumedAt,
  };
}
