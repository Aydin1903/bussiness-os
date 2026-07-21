import { InvalidMembershipRoleError } from './membership.error';

/**
 * Bir kullanicinin tenant ICINDEKI rolu (ADR-0014, MULTI_TENANT_ARCHITECTURE 7.5).
 *
 * ============================================================================
 * NEDEN VALUE OBJECT, NEDEN CIPLAK ENUM DEGIL
 * ============================================================================
 *
 * ARCHITECTURE 10.1'in nihai vizyonu tenant-scoped, VERI-TABANLI rollerdir:
 * her tenant kendi rollerini tanimlar ve roller ayri bir `roles` tablosunda
 * yasar. V1'de bu karmasikligi ustlenmiyoruz (ADR-0013 ile ayni "gereksiz
 * karmasikligi erteleme" ilkesi).
 *
 * Ama rolu BUGUNDEN value object olarak modellemek, ileride
 * `enum -> roles tablosu FK` gecisini business logic'e DOKUNMADAN yapilabilir
 * kilar: yalnizca persistence adapter'i degisir. Ciplak `string` kullansaydik,
 * o gun her karsilastirma ve her imza degismek zorunda kalirdi.
 *
 * Ayrica DEVELOPMENT_RULES 2.4'un dogrudan uygulanmasidir: rol bir kimliktir,
 * `string` degil.
 *
 * Katman karsiligi:
 *   Domain      -> MembershipRole (bu dosya)
 *   Persistence -> string/enum kolon
 *   Gelecek     -> roles tablosuna minimum kirilimla gecis
 * ============================================================================
 */
export const MEMBERSHIP_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;

export type MembershipRoleName = (typeof MEMBERSHIP_ROLES)[number];

/**
 * Sistem rolleri: urunle birlikte gelir, tenant tarafindan degistirilemez ve
 * silinemez (MULTI_TENANT_ARCHITECTURE 7.5).
 *
 * Bugun yalnizca `owner` sistem roludur. `roles` tablosuna gecildiginde bu
 * kume, tablodaki `is_system` bayraginin karsiligi olur.
 */
const SYSTEM_ROLES: ReadonlySet<MembershipRoleName> = new Set<MembershipRoleName>(['owner']);

export class MembershipRole {
  /**
   * Onceden yaratilmis ornekler. Ayni rol daima ayni nesneyi dondurur; bu,
   * referans karsilastirmasinin da dogru calismasini saglar.
   */
  static readonly OWNER = new MembershipRole('owner');
  static readonly ADMIN = new MembershipRole('admin');
  static readonly MEMBER = new MembershipRole('member');
  static readonly VIEWER = new MembershipRole('viewer');

  private constructor(readonly value: MembershipRoleName) {
    Object.freeze(this);
  }

  /**
   * Dis dunyadan gelen bir metni (veritabani kolonu, DTO) role cevirir.
   *
   * TypeScript tipleri runtime'da yoktur (ARCHITECTURE 4): `as MembershipRole`
   * ile zorlamak, veritabaninda beklenmeyen bir deger oldugunda hatayi gizler.
   */
  static create(value: string): MembershipRole {
    switch (value) {
      case 'owner':
        return MembershipRole.OWNER;
      case 'admin':
        return MembershipRole.ADMIN;
      case 'member':
        return MembershipRole.MEMBER;
      case 'viewer':
        return MembershipRole.VIEWER;
      default:
        throw new InvalidMembershipRoleError(value);
    }
  }

  /**
   * Tenant sahibi mi?
   *
   * Bu kontrol entity'deki koruma kurallarinin dayanagidir: owner rolundeki
   * uyelik dusurulemez, askiya alinamaz, iptal edilemez.
   */
  get isOwner(): boolean {
    return this.value === 'owner';
  }

  /** Urunle gelen, tenant tarafindan degistirilemeyen bir rol mu? */
  get isSystemRole(): boolean {
    return SYSTEM_ROLES.has(this.value);
  }

  equals(other: MembershipRole): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
