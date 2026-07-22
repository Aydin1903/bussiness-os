import { InvalidEmailError } from './identity.error';

/**
 * Bir kullanicinin e-posta adresi (AUTH_ARCHITECTURE 5.1, 8.1).
 *
 * E-posta bu sistemde kullanicinin GLOBAL TEKIL kimligidir; iki farkli yazimin
 * ayni hesaba dusmesi tekillik kisitini atlatir. Bu yuzden VO iki isi birden
 * yapar: NORMALIZE eder (tek kanonik bicim) ve DOGRULAR (bicimsel gecerlilik).
 *
 * Normalizasyon (AUTH_ARCHITECTURE 8.1):
 *   trim -> NFKC -> lowercase
 *
 * - NFKC: ayni adres farkli Unicode normalizasyonlariyla yazildiginda (ornegin
 *   tam-genislik karakterler) ayni kanonik bicime iner.
 * - lowercase: `Ali@x.com` ile `ali@x.com` ayni hesaptir.
 *
 * NOKTA/ARTI NORMALIZASYONU YAPILMAZ (AUTH_ARCHITECTURE 8.1 notu): Gmail'in
 * `a.b@x` ≡ `ab@x` davranisi saglayiciya OZGUDUR; genellestirmek baska
 * saglayicilarda farkli kisileri ayni hesaba dusururdu. `a.b@x` ile `ab@x` bu
 * sistemde AYRI adreslerdir.
 */

/**
 * RFC 5321: bir e-posta adresi en fazla 254 oktettir. Kod noktasi degil oktet
 * siniridir ama pratikte ASCII adreslerde ikisi ayni; sinir bir DoS/absurt-girdi
 * korumasidir, kesin RFC uyumu degil.
 */
const MAX_LENGTH = 254;

/**
 * Bilincli olarak SADE bir bicim kontrolu: bosluk yok, tam bir `@`, ve alan
 * adinda en az bir nokta. Amac RFC 5322'yi tam dogrulamak DEGIL — o gramer
 * pratikte kimsenin girmedigi bicimleri kabul eder ve regex'i okunamaz kilar.
 * Gercek gecerlilik zaten e-posta DOGRULAMA koduyla (§7) kanitlanir; buradaki
 * kontrol yalnizca bariz cop girdiyi sinirda eler.
 */
const FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Email {
  private constructor(readonly value: string) {
    // Value object'ler immutable'dir (ARCHITECTURE 4).
    Object.freeze(this);
  }

  /**
   * Tek yaratma yolu. Once NORMALIZE eder, sonra normalize edilmis bicimi
   * dogrular — cunku saklanacak ve karsilastirilacak olan odur.
   */
  static create(value: string): Email {
    const normalized = value.trim().normalize('NFKC').toLowerCase();

    if (normalized.length === 0) {
      throw new InvalidEmailError('bos olamaz');
    }
    if (normalized.length > MAX_LENGTH) {
      throw new InvalidEmailError(`en fazla ${String(MAX_LENGTH)} karakter olabilir`);
    }
    if (!FORMAT.test(normalized)) {
      throw new InvalidEmailError('bicim gecerli degil');
    }

    return new Email(normalized);
  }

  /** Deger karsilastirmasi — iki nesne ayni kanonik adresi tasiyorsa esittir. */
  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
