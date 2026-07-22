import { Credential } from '../domain/credential.entity';
import { PasswordHash } from '../domain/password-hash.value-object';
import { UserId } from '../../../shared/user-id.value-object';

/** `platform.credentials` satirinin ham bicimi. */
export interface CredentialRow {
  readonly userId: string;
  readonly passwordHash: string;
  readonly passwordChangedAt: Date;
}

export function toCredential(row: CredentialRow): Credential {
  return Credential.fromPersistence({
    userId: UserId.create(row.userId),
    passwordHash: PasswordHash.fromHash(row.passwordHash),
    passwordChangedAt: row.passwordChangedAt,
  });
}

export function toCredentialRow(credential: Credential): CredentialRow {
  return {
    userId: credential.userId.value,
    passwordHash: credential.passwordHash.value,
    passwordChangedAt: credential.passwordChangedAt,
  };
}
