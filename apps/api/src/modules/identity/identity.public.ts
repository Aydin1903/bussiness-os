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

// ============================================================================
// TENANT-SCOPED ACCESS TOKEN URETIMI — switch-tenant icin (MT §7.4)
// ============================================================================
// switch-tenant akisi `platform/session` modulunde yasar ve ne Identity'nin ne
// Tenant'in ICINDEDIR (ikisinin orkestrasyonudur, DAG kurar). O modul token
// imzalamayi dogrudan yapamaz: `TOKEN_SIGNER` Identity'nin `application`
// katmanindadir ve modul sinirini (ARCHITECTURE 6.1) gecemez.
//
// Bu yuzden Identity, DAR bir yetenek acar: "kanitlanmis bir oturum + verilmis
// bir tenant" icin access token bas. Ham `TOKEN_SIGNER` acilmaz — o, kimlik
// token'i imzalama ve dogrulama gibi Identity-ici yetenekleri de tasir; yalnizca
// tenant-scoped basim disari verilir.

/** DI token'i. */
export const TENANT_ACCESS_TOKEN_ISSUER = Symbol('TENANT_ACCESS_TOKEN_ISSUER');

/** Access token basimi girdisi — ilkel string'ler, iki id yer degistiremesin diye obje. */
export interface IssueTenantAccessTokenInput {
  /** DOGRULANMIS kimlik token'indan gelir (istek govdesinden DEGIL). */
  readonly userId: string;
  /** Kimlik oturumunun (token ailesi) kimligi — `sid`. Yeni oturum ACILMAZ. */
  readonly sessionId: string;
  /** Erisimi Tenant'ca ONAYLANMIS tenant. */
  readonly tenantId: string;
}

export interface TenantAccessTokenIssuer {
  /**
   * Tenant-scoped access token imzalar (`tenant` claim'li, 15 dk).
   *
   * ERISIM KARARINI VERMEZ — yalnizca imzalar. "Bu kullanici bu tenant'a
   * girebilir mi" karari Tenant'a aittir (`TENANT_ACCESS_QUERY`); bu yetenek
   * ancak o karar `granted` dondugunde cagrilmalidir.
   */
  issue(input: IssueTenantAccessTokenInput): Promise<string>;
}
