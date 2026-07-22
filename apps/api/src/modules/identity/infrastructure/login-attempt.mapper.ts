import { Email } from '../domain/email.value-object';
import { IpAddress } from '../domain/ip-address.value-object';
import { LoginAttempt } from '../domain/login-attempt.entity';
import { LoginAttemptId } from '../domain/login-attempt-id.value-object';

/** `platform.login_attempts` satirinin ham bicimi. */
export interface LoginAttemptRow {
  readonly id: string;
  readonly emailNormalized: string;
  readonly ipAddress: string;
  readonly succeeded: boolean;
  readonly attemptedAt: Date;
}

export function toLoginAttempt(row: LoginAttemptRow): LoginAttempt {
  return LoginAttempt.fromPersistence({
    id: LoginAttemptId.create(row.id),
    email: Email.create(row.emailNormalized),
    ipAddress: IpAddress.create(row.ipAddress),
    succeeded: row.succeeded,
    attemptedAt: row.attemptedAt,
  });
}

export function toLoginAttemptRow(attempt: LoginAttempt): LoginAttemptRow {
  return {
    id: attempt.id.value,
    emailNormalized: attempt.email.value,
    ipAddress: attempt.ipAddress.value,
    succeeded: attempt.succeeded,
    attemptedAt: attempt.attemptedAt,
  };
}
