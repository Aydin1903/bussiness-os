import type { UserId } from '../domain/user-id.value-object';

/**
 * Bir kullanicinin tenant acmaya UYGUN olup olmadigini soran port.
 *
 * ============================================================================
 * NEDEN "EMAIL VERIFICATION" DEGIL DE "POLICY"
 * ============================================================================
 *
 * ADR-0016 bugun tek bir onkosul tanimliyor: `User.emailVerified === true`.
 * Ama ayni ADR, bu onkosulun DEGISECEGINI de yaziyor:
 *
 *   "Kurumsal satis akisi devreye girdiginde tenant'i musteri degil operator
 *    acar. O durumda e-posta dogrulamasi yerine sozlesme onayi onkosul haline
 *    gelir."
 *   "SSO ile giris eklendiginde kimlik saglayici e-postayi zaten dogrulanmis
 *    olarak bildiriyorsa ayri bir dogrulama adimi gereksizlesir."
 *
 * Port'u `EmailVerificationChecker` diye adlandirmak, bugunku onkosulu
 * SOZLESMEYE gomerdi; onkosul degistigi gun use case'i de degistirmek
 * gerekirdi. Bu port onkosulun NE OLDUGUNU degil, KARSILANIP KARSILANMADIGINI
 * sorar.
 *
 * MODUL SINIRI: `emailVerified` bilgisi Identity modulune aittir ve tenant
 * modulu oraya BAKAMAZ (CLAUDE.md 6, ARCHITECTURE 6.1). Adapter, Identity'nin
 * public interface'i uzerinden sorar.
 * ============================================================================
 */
export interface TenantProvisioningPolicy {
  /**
   * Kullanici tenant acamiyorsa HATA FIRLATIR; acabiliyorsa sessizce doner.
   *
   * Neden `boolean` degil: "acamaz" cevabinin bir SEBEBI vardir ve bu sebep
   * kullaniciya gosterilecek mesaji belirler ("once e-postanizi dogrulayin"
   * ile "hesabiniz askiya alinmis" ayni sey degildir). `boolean` bu bilgiyi
   * yok eder ve cagiran tarafi genel bir mesaj vermeye zorlar.
   */
  assertCanProvision(userId: UserId): Promise<void>;
}
