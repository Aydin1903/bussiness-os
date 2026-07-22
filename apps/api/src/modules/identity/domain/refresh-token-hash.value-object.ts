import { InvalidRefreshTokenHashError } from './identity.error';

/**
 * Bir refresh token'in SHA-256 digest'i (AUTH_ARCHITECTURE 11.1, ADR-0021).
 *
 * ============================================================================
 * HAM TOKEN BU TIPE GIRMEZ
 * ============================================================================
 * Refresh token 256 bit opak bir degerdir ve DUZ saklanmaz — yalnizca SHA-256
 * hash'i tutulur (ADR-0021). Hash'lemenin amaci: sizan bir veritabani token'lari
 * DOGRUDAN kullanilabilir kilmasin. Argon2 DEGIL SHA-256: token yuksek entropili
 * oldugu icin yavas KDF gereksizdir.
 *
 * VO yalnizca HESAPLANMIS digest'i sarmalar; 256-bit token'in uretimi ve
 * hash'lenmesi infrastructure'in isidir. 64 KUCUK-HARF HEX bicim kontrolu, ham
 * token'in yanlislikla hash sanilmasini onler.
 *
 * Digest sizinti savunmasi olarak log'a/serilestirmeye dusmemeli
 * (AUTH_ARCHITECTURE P1); `toString`/`toJSON` maske doner, gercek deger yalnizca
 * `value` uzerinden (repository lookup icin) alinir.
 * ============================================================================
 */

/** SHA-256 = 32 bayt = 64 kucuk-harf hex. */
const SHA256_HEX = /^[0-9a-f]{64}$/;

const REDACTED = '[REDACTED]';

export class RefreshTokenHash {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  /** ZATEN hesaplanmis bir SHA-256 digest'ini (hex) sarmalar. */
  static fromDigest(value: string): RefreshTokenHash {
    if (!SHA256_HEX.test(value)) {
      // Gecersiz DEGERI mesaja koymayiz — ham token olabilir (bkz. identity.error).
      throw new InvalidRefreshTokenHashError('64 karakterlik kucuk-harf hex bicimine uymuyor');
    }
    return new RefreshTokenHash(value);
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }
}
