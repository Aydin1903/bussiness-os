import type { RefreshTokenHash } from '../domain/refresh-token-hash.value-object';

/**
 * Refresh token'i SAKLAMA icin hash'leyen port (ADR-0021, AUTH_ARCHITECTURE 11.1).
 *
 * SHA-256, Argon2 DEGIL: 256 bit rastgele bir deger zaten kaba kuvvetle
 * bulunamaz; yavas KDF her yenilemeye 100+ ms eklerdi, hicbir sey kazandirmadan.
 * Hash'lemenin tek amaci veritabani sizintisinda token'larin dogrudan
 * kullanilamamasidir. Deterministiktir (salt yok) — lookup hash uzerinden yapilir.
 */
/** DI token'i. */
export const REFRESH_TOKEN_HASHER = Symbol('REFRESH_TOKEN_HASHER');

export interface RefreshTokenHasher {
  /** Ham token'in SHA-256 digest'ini dondurur (saklama ve lookup icin). */
  hash(token: string): RefreshTokenHash;
}
