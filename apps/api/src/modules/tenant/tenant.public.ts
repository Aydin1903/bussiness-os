import type { MembershipRoleName } from './domain/membership-role.value-object';

/**
 * Tenant modulunun DISA ACIK TEK yuzeyi (ARCHITECTURE 6.1).
 *
 * ============================================================================
 * NEDEN VAR — VE NEDEN BU KADAR DAR
 * ============================================================================
 * Modul siniri kuralinin (ARCHITECTURE 6.1 kural 2) makine tarafindan zorlanan
 * karsiligi budur: baska bir modul Tenant'in `domain/`, `application/`,
 * `infrastructure/` veya `presentation/` klasorlerinden ICE import edemez —
 * yalnizca bu dosya disa aciktir. Identity modulu (Faz 3) Tenant'i BURADAN
 * tuketir; ilk import dogrudan `application/`e giderse lint reddeder.
 *
 * Bu dosya BUGUN tek bir islem acar: bir kullanicinin bir tenant'taki erisim
 * durumunu cozmek. Bunun tek mesru cagirani switch-tenant akisidir
 * (MULTI_TENANT_ARCHITECTURE 7.4): Identity `userId`'yi kanitlar, ama "bu
 * kullanici bu tenant'a girebilir mi ve hangi rolle" karari Tenant'a aittir.
 *
 * Uye LISTELEME ("hangi tenant'lara uyeyim") ARTIK VAR: `UserMembershipsQuery`
 * (ADR-0028). Tenant-secim endpoint'i (`GET /me/memberships`) yazildiginda
 * gelen karar buydu — sayfalama sozlesmesiyle (DEVELOPMENT_RULES 7.1) ve
 * kontrollu bir RLS asimiyla (SECURITY DEFINER `list_user_memberships`, cunku
 * `memberships` FORCE-RLS'i tenant context'siz okunamaz).
 *
 * ============================================================================
 * SINIR TIPLERI ILKELDIR, VALUE OBJECT DEGIL
 * ============================================================================
 * Metotlar `string` id alir/doner. `TenantId`/`UserId` value object'leri
 * `domain/` katmaninda yasar ve internal'dir; onlari sinirdan gecirmek Identity'yi
 * Tenant'in domain'ini import etmeye zorlar ve sinirin butun anlamini yok eder.
 * String -> VO cevrimi Tenant tarafindaki implementasyonun isidir.
 * ============================================================================
 */

/** DI token'i. Symbol kullanildi: string token'lar sessizce cakisabilir. */
export const TENANT_ACCESS_QUERY = Symbol('TENANT_ACCESS_QUERY');

/**
 * Rol, sinirda string birligi olarak gecer — `MembershipRole` value object'i
 * DEGIL. Tek dogruluk kaynagi domain'deki kume oldugu icin (owner · admin ·
 * member · viewer, MULTI_TENANT_ARCHITECTURE 7.5) tip oradan turetilir; rol
 * kumesi degistiginde bu sozlesme de kendiliginden guncellenir.
 */
export type TenantRole = MembershipRoleName;

/**
 * Erisimin REDDEDILME sebebi.
 *
 * Neden ayri tutuluyor: switch-tenant her uc sebep icin de ayni `403`'u
 * dondurse de, MULTI_TENANT_ARCHITECTURE 8.2 bazi 403'leri GUVENLIK OLAYI
 * olarak loglar. Sebebi cagiran tarafa vermek bu ayrimi mumkun kilar; bir
 * `boolean` bu bilgiyi geri donusu olmadan yok ederdi (ayni gerekce:
 * `TenantProvisioningPolicy`).
 */
export type TenantAccessDenialReason =
  /** (userId, tenantId) icin uyelik kaydi yok. */
  | 'no-membership'
  /** Uyelik var ama erisim vermiyor (invited / suspended / revoked). */
  | 'membership-inactive'
  /** Uyelik aktif ama tenant erisime kapali (provisioning / suspended / archived / failed). */
  | 'tenant-inactive';

/**
 * Erisim cozumunun sonucu — ayrik birlik (discriminated union).
 *
 * `granted` true ise rol GARANTILIDIR; false ise sebep garantilidir. Iki durum
 * ayni tipte olsaydi cagiran taraf, reddedilmis bir sonuctan rol okumaya
 * calisabilirdi.
 */
export type TenantAccessResult =
  | { readonly granted: true; readonly tenantId: string; readonly role: TenantRole }
  | { readonly granted: false; readonly reason: TenantAccessDenialReason };

/** `resolveMemberAccess` girdisi — iki ilkel string yer degistiremesin diye obje. */
export interface ResolveMemberAccessInput {
  readonly userId: string;
  readonly tenantId: string;
}

/**
 * Tenant'in Identity'ye actigi erisim sorgusu.
 *
 * DI token'i: `TENANT_ACCESS_QUERY`.
 */
export interface TenantAccessQuery {
  /**
   * Bir kullanicinin bir tenant'a erisip erisemeyecegini cozer.
   *
   * KARARI bu metot verir, cagiran taraf degil: "aktif uyelik + aktif tenant =
   * erisim" kurali (MULTI_TENANT_ARCHITECTURE 7.4/8.2) tenant yasam dongusune
   * aittir. Identity yalnizca sonucu token'a (granted -> tenant-scoped access
   * token) veya `403`'e (denied) cevirir.
   *
   * FAIL CLOSED: karar verilemeyen her durum reddile sonuclanir, izinle degil.
   */
  resolveMemberAccess(input: ResolveMemberAccessInput): Promise<TenantAccessResult>;
}

/** DI token'i. Symbol kullanildi: string token'lar sessizce cakisabilir. */
export const USER_MEMBERSHIPS_QUERY = Symbol('USER_MEMBERSHIPS_QUERY');

/**
 * Kullanicinin bir tenant'taki uyeliginin DIS goruntusu (ADR-0028).
 *
 * Sinir tipleri ilkeldir (yukaridaki gerekce): `TenantId`/`UserId` value
 * object'leri internaldir. `role` domain kumesinden turer (MT §7.5).
 */
export interface UserMembershipView {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly tenantSlug: string;
  readonly role: TenantRole;
  readonly status: string;
}

/** Sayfalama girdisi (DEVELOPMENT_RULES 7.1: sinirsiz liste yasak). */
export interface ListUserMembershipsInput {
  readonly userId: string;
  readonly limit: number;
  readonly offset: number;
}

export interface UserMembershipsPage {
  readonly items: readonly UserMembershipView[];
  readonly total: number;
}

/**
 * Tenant'in "hangi tenant'lara uyeyim" sorgusu (ADR-0028).
 *
 * DI token'i: `USER_MEMBERSHIPS_QUERY`.
 *
 * Yalnizca SWITCHABLE tenant'lari doner: aktif uyelik + aktif (operasyonel)
 * tenant. `userId` cagirandan (dogrulanmis identity token) gelir; kullanici
 * yalnizca KENDI uyeliklerini gorebilir. Tenant context GEREKTIRMEZ — okuma,
 * kontrollu bir SECURITY DEFINER fonksiyonu (`list_user_memberships`) uzerinden
 * yapilir (memberships FORCE-RLS'i context'siz okunamaz).
 */
export interface UserMembershipsQuery {
  listForUser(input: ListUserMembershipsInput): Promise<UserMembershipsPage>;
}
