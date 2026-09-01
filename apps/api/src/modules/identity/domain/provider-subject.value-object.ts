import { InvalidProviderSubjectError } from './identity.error';

/** `0040`in `federated_identities_subject_length` kisitiyla BIREBIR ayni. */
const MAX_SUBJECT_LENGTH = 255;

/**
 * Saglayicinin `sub` degeri — ⚠️ KIMLIGIN TEK CAPASI (ADR-0053 §1).
 *
 * ============================================================================
 * ⚠️ NEDEN AYRI BIR VALUE OBJECT — "sadece bir string" DEGIL
 * ============================================================================
 * Ciplak bir `string` olsaydi, bir `sub` ile bir e-posta ya da bir `userId`
 * derleyici tarafindan AYIRT EDILEMEZDI. Bu tipin tum degeri, yanlislikla
 * e-postanin gecirildigi bir cagrinin DERLENMEMESIDIR — ADR-0053'un tamami tam
 * olarak o karisikligin (nOAuth) uzerine kuruludur.
 *
 * ⚠️ BICIM DOGRULANMAZ, YALNIZCA ANLAMSIZ DEGERLER ELENIR. Her saglayicinin
 * `sub` bicimi farklidir ve degisebilir: Google sayisal bir dize, Microsoft
 * base64url, LinkedIn kisa bir belirtec verir. Bir bicim kurali yazmak,
 * saglayicinin bir gun bicimini genislettiginde GIRISI KIRARDI ve hata
 * saglayicinin degil BIZIM tarafimizda gorunurdu.
 *
 * Elenen sey yalnizca hicbir saglayicida mesru olmayan degerlerdir: bos dize
 * ve devasa uzunluk — bunu bilmek saglayici semantigi gerektirmez
 * (`platform.audit_log`in `resource_type` kolonuyla ayni ayrim).
 * ============================================================================
 */
export class ProviderSubject {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static create(value: string): ProviderSubject {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      throw new InvalidProviderSubjectError('bos olamaz');
    }
    if (trimmed.length > MAX_SUBJECT_LENGTH) {
      throw new InvalidProviderSubjectError(
        `en fazla ${String(MAX_SUBJECT_LENGTH)} karakter olabilir`,
      );
    }

    return new ProviderSubject(trimmed);
  }

  equals(other: ProviderSubject): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
