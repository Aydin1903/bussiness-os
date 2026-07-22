import { type VerificationCodeHash } from '../domain/verification-code-hash.value-object';

/**
 * Dogrulama kodunu hash'leme ve dogrulama port'u (AUTH_ARCHITECTURE 7.2, ADR-0019).
 *
 * ARCHITECTURE 4: port application katmanina aittir, implementasyon
 * infrastructure'a (HMAC-SHA256 + pepper). Use case algoritmayi bilmez.
 *
 * NEDEN PARoLADAN FARKLI ARAC: kod yuksek oranda kisitli, tek kullanimlik ve
 * dakikalar omurludur; hizli bir MAC + pepper yeterlidir. Argon2 burada yanlis
 * araç olurdu (her denemede 100+ ms). Parola ise yavas KDF ister — bkz.
 * `PasswordHasher`. Ikisi ayni sey degildir cunku tehdit modelleri farklidir.
 *
 * HAM KOD YALNIZCA BURADA: `code: string` gecici parametredir, saklanmaz.
 */
/** DI token'i. */
export const VERIFICATION_CODE_HASHER = Symbol('VERIFICATION_CODE_HASHER');

export interface VerificationCodeHasher {
  /** Ham kodu HMAC ile hash'ler; saklanacak digest'i dondurur. */
  hash(code: string): VerificationCodeHash;

  /**
   * Ham kodu saklanmis digest ile karsilastirir.
   *
   * SABIT ZAMANLI olmalidir (`crypto.timingSafeEqual`): string esitligi bir
   * zamanlama yan-kanali acar ve kisa arama uzayinda (10^6) bu, deneme sinirinin
   * korumasini zayiflatir.
   */
  verify(code: string, hash: VerificationCodeHash): boolean;
}
