import { InvalidPasswordHashError } from './identity.error';

/**
 * Bir parolanin ZATEN HESAPLANMIS Argon2id hash'i (AUTH_ARCHITECTURE 6, ADR-0017).
 *
 * ============================================================================
 * HAM PAROLA BU TIPE ASLA GIRMEZ
 * ============================================================================
 * Bu VO yalnizca hash'i SARMALAR — hash'lemez, dogrulamaz. Hash uretimi ve
 * dogrulamasi Argon2id adapter'inin (infrastructure) isidir; ham parola domain
 * katmanina hic ulasmaz (AUTH_ARCHITECTURE 6, P1).
 *
 * Yaratma metodu bilincli olarak `fromHash` adini tasir, `create` degil:
 * "ham parolayi ver" izlenimi vermemek icin. Ve dogrulama, degerin PHC Argon2id
 * bicimine uymasini SART kosar — boylece ham bir parola yanlislikla verilse bile
 * (bicime uymaz) sinirda reddedilir, sessizce hash sanilmaz.
 * ============================================================================
 *
 * ============================================================================
 * LOG SIZINTISINA KARSI KORUMA
 * ============================================================================
 * Hash hicbir DTO'ya, event'e veya log'a girmez (AUTH_ARCHITECTURE 6.3, P1).
 * `toString` ve `toJSON` bu yuzden degeri DEGIL, maskelenmis bir isaret doner;
 * bir nesne kazara string'e cevrilir veya `JSON.stringify`'a girerse hash
 * disari sizmaz. Gercek deger yalnizca `value` uzerinden, persistence'in acik
 * talebiyle alinir.
 * ============================================================================
 */

/**
 * PHC string bicimi: `$argon2id$v=<n>$m=<n>,t=<n>,p=<n>$<salt>$<hash>`.
 *
 * Parametreler (m/t/p) SABITLENMEZ: AUTH_ARCHITECTURE 6.3 kademeli yeniden
 * hash'lemeyi tanimlar — parametreler zamanla artar ve eski hash'ler hala
 * gecerli kalmalidir. Bu yuzden kontrol yalnizca YAPIYI dogrular, degerleri
 * degil. Salt ve hash base64 (standart alfabe, RFC 9106 dolgusuz).
 */
const PHC_ARGON2ID = /^\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/;

const REDACTED = '[REDACTED]';

export class PasswordHash {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  /**
   * ZATEN hash'lenmis bir PHC Argon2id string'ini sarmalar.
   *
   * Ham parola ASLA buraya verilmez; bicim kontrolu bunu zorlar.
   */
  static fromHash(value: string): PasswordHash {
    if (!PHC_ARGON2ID.test(value)) {
      // Gecersiz DEGERI mesaja koymayiz — ham parola olabilir (bkz. identity.error).
      throw new InvalidPasswordHashError('PHC Argon2id bicimine uymuyor');
    }
    return new PasswordHash(value);
  }

  /** Maskelenir: hash log'a/serilestirmeye sizmaz (bkz. sinif yorumu). */
  toString(): string {
    return REDACTED;
  }

  /** `JSON.stringify` de degeri gormez. */
  toJSON(): string {
    return REDACTED;
  }
}
