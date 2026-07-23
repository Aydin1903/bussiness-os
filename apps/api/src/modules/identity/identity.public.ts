/**
 * Identity modulunun DISA ACIK TEK yuzeyi (ARCHITECTURE 6.1).
 *
 * ============================================================================
 * NEDEN VAR — VE NEDEN BU KADAR DAR
 * ============================================================================
 * ADR-0016, tenant acmanin onkosulunu `User.emailVerified === true` olarak
 * tanimlar. Bu bilgi Identity'nindir ve Tenant modulu Identity'nin TABLOLARINA
 * DOKUNAMAZ (AUTH_ARCHITECTURE §17, ARCHITECTURE 6.1) — public interface
 * uzerinden alir. `tenant.public.ts` ile birebir ayni desen, ters yonde.
 *
 * YALNIZCA `emailVerified` acilir. E-posta, ad, durum, parola bilgisi veya
 * listeleme YOKTUR: Tenant'in ihtiyaci onkosulu dogrulamaktir, kullanici
 * verisine erismek degil. Genis bir kullanici DTO'su acmak, kimlik verisini
 * modul sinirinin disina sizdiran ilk adim olurdu.
 *
 * Sinir tipleri ILKELDIR (string): `UserId` value object'i Identity'nin ic
 * kimlik tipidir; sinirdan gecirmek tuketen modulu ic tiplere baglar.
 * ============================================================================
 */

/** DI token'i. Symbol kullanildi: string token'lar sessizce cakisabilir. */
export const IDENTITY_USER_QUERY = Symbol('IDENTITY_USER_QUERY');

/** Bir kullanicinin DAR goruntusu — yalnizca onkosul kontrolu icin. */
export interface IdentityUserSnapshot {
  readonly userId: string;
  /** ADR-0016 onkosulu. Kaynagi daima veritabanidir, token DEGIL (§10.3). */
  readonly emailVerified: boolean;
}

export interface IdentityUserQuery {
  /**
   * Kullanicinin dar goruntusunu dondurur; yoksa `null`.
   *
   * Bulunamamak bir HATA degildir — cagiran taraf bunu kendi domain kararina
   * cevirir (Tenant icin: onkosul karsilanmadi).
   *
   * LISTELEME METODU YOKTUR ve eklenmemelidir (§12.4.3 ile ayni disiplin).
   */
  findById(userId: string): Promise<IdentityUserSnapshot | null>;
}
