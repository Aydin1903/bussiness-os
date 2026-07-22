import type { Credential } from '../domain/credential.entity';
import type { UserId } from '../../../shared/user-id.value-object';

/** DI token'i. */
export const CREDENTIAL_REPOSITORY = Symbol('CREDENTIAL_REPOSITORY');

/**
 * `platform.credentials` kaliciligi icin application port'u.
 *
 * `users` ile 1:1 (kimligi `userId`); bu yuzden `findById` degil `findByUserId`.
 * Parola hash'i hicbir DTO/event/log'a girmez (AUTH_ARCHITECTURE 6.3).
 */
export interface CredentialRepository {
  findByUserId(userId: UserId): Promise<Credential | null>;

  save(credential: Credential): Promise<void>;
}
