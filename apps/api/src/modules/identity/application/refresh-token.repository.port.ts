import type { RefreshToken } from '../domain/refresh-token.entity';
import type { RefreshTokenHash } from '../domain/refresh-token-hash.value-object';

/** DI token'i. */
export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');

/**
 * `platform.refresh_tokens` kaliciligi icin application port'u (ADR-0021).
 *
 * Lookup HASH ile yapilir: istemci ham token'i sunar, use case onu hash'ler ve
 * `findByTokenHash` ile satiri bulur. Ham token hicbir yerde saklanmaz.
 */
export interface RefreshTokenRepository {
  save(token: RefreshToken): Promise<void>;

  /** Saklanmis SHA-256 digest ile token'i getirir; yoksa `null`. */
  findByTokenHash(tokenHash: RefreshTokenHash): Promise<RefreshToken | null>;
}
