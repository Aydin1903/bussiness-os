import { InvalidVerificationCodeHashError } from './identity.error';

/**
 * Bir dogrulama kodunun HMAC-SHA256 digest'i (AUTH_ARCHITECTURE 7.1/7.2, ADR-0019).
 *
 * ============================================================================
 * HAM KOD BU TIPE GIRMEZ
 * ============================================================================
 * VO yalnizca HESAPLANMIS digest'i sarmalar. HMAC hesaplamasi (pepper ile) ve
 * karsilastirma HmacVerificationCodeHasher adapter'inin isidir; ham 6 haneli kod
 * domain'e ulasmaz. Digest, SHA-256 oldugu icin 64 KUCUK-HARF HEX karakteridir;
 * bu bicim kontrolu, ham kodun (`000000` gibi) yanlislikla hash sanilmasini
 * ONLER — 6 hane 64-hex desenine uymaz, sinirda reddedilir.
 *
 * KARSILASTIRMA METODU YOK. Iki hash'i `===` ile kiyaslamak SABIT ZAMANLI
 * degildir ve bir zamanlama yan-kanali acar. Dogrulama daima hasher'in
 * `verify`'i (crypto.timingSafeEqual) uzerinden yapilir.
 *
 * Digest, sizinti savunmasi olarak log'a/serilestirmeye dusmemeli
 * (AUTH_ARCHITECTURE P1); `toString`/`toJSON` maske doner, gercek deger yalnizca
 * `value` uzerinden alinir.
 * ============================================================================
 */

/** SHA-256 = 32 bayt = 64 kucuk-harf hex. */
const SHA256_HEX = /^[0-9a-f]{64}$/;

const REDACTED = '[REDACTED]';

export class VerificationCodeHash {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  /** ZATEN hesaplanmis bir HMAC-SHA256 digest'ini (hex) sarmalar. */
  static fromDigest(value: string): VerificationCodeHash {
    if (!SHA256_HEX.test(value)) {
      // Gecersiz DEGERI mesaja koymayiz — ham kod olabilir (bkz. identity.error).
      throw new InvalidVerificationCodeHashError('64 karakterlik kucuk-harf hex bicimine uymuyor');
    }
    return new VerificationCodeHash(value);
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }
}
