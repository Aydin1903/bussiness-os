/**
 * Istegi yapan kullanicinin kimligini saglar.
 *
 * ============================================================================
 * NEDEN PORT, NEDEN ISTEK GOVDESINDEN DEGIL
 * ============================================================================
 * DEVELOPMENT_RULES 4.5 tenant_id icin "asla istemciden gelen degerden alinmaz"
 * diyor; ayni mantik kullanici kimligi icin de gecerlidir. Bir istegin
 * govdesinden `ownerUserId` okumak, istemcinin kendisini istedigi kullanici
 * olarak tanitmasina izin verir.
 *
 * Kimligin tek mesru kaynagi DOGRULANMIS bir token'dir (ADR-0004, ADR-0015).
 * Identity modulu (Faz 3) gelene kadar bu port'un uretim implementasyonu
 * YOKTUR — ve olmamasi, istemciden kimlik kabul etmekten IYIDIR.
 *
 * Bugun tek implementasyon acikca hata firlatir. Boylece istemci kaynakli bir
 * kimlik degeri kod tabanina HIC girmez ve Identity baglandiginda degistirilecek
 * "gecici" bir guven noktasi kalmaz.
 * ============================================================================
 */

/** DI token'i. */
export const CURRENT_USER_PROVIDER = Symbol('CURRENT_USER_PROVIDER');

export interface CurrentUserProvider {
  /**
   * Dogrulanmis kullanici kimligini dondurur; yoksa HATA FIRLATIR.
   *
   * `null` DONMEZ: cagiran tarafi "kullanici yoksa ne yapayim" kararina
   * zorlamak, o karari her endpoint'te tekrar vermek demektir ve biri yanlis
   * verir. Kimlik yoksa istek zaten devam etmemelidir.
   */
  requireUserId(): string;
}

/**
 * Kimlik saglayici henuz mevcut degil.
 *
 * Bu bir KULLANICI hatasi degildir — istemci dogru davranmis olabilir; ozellik
 * henuz devrede degildir. Bu yuzden 503'e eslenir, 401/403'e degil: 401
 * "kimligini dogrula" der ve istemciyi olmayan bir giris akisina yollar.
 */
export class IdentityUnavailableError extends Error {
  readonly code = 'IDENTITY_UNAVAILABLE';

  constructor() {
    super(
      'Kimlik dogrulama henuz devrede degil (Identity modulu Faz 3). ' +
        'Kullanici kimligi gerektiren islemler kullanilamaz.',
    );
    this.name = 'IdentityUnavailableError';
  }
}
