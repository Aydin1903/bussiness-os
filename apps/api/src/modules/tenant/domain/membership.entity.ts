import { type MembershipId } from './membership-id.value-object';
import { MembershipRole } from './membership-role.value-object';
import {
  assertTransition,
  grantsAccess,
  type MembershipStatus,
} from './membership-status.value-object';
import {
  InconsistentMembershipStateError,
  InvalidJoinedAtError,
  OwnerMembershipProtectedError,
} from './membership.error';
import { type TenantId } from './tenant-id.value-object';
import { type UserId } from '../../../shared/user-id.value-object';

/**
 * Bir kullanicinin bir tenant ICINDEKI uyeligi (ADR-0014).
 *
 * `User` global ve tenant'tan bagimsizdir; rol ve erisim durumu YALNIZCA
 * burada yasar. Ayni kisi bir tenant'ta `owner`, digerinde `viewer` olabilir —
 * bu yuzden rolun `User` uzerinde tutulmasi yetki yukseltmeye donusurdu.
 *
 * ZAMAN DISARIDAN GELIR: entity `new Date()` cagirmaz (DEVELOPMENT_RULES 3.2).
 */

/** Membership'in tam durumu — constructor girdisi ve `fromPersistence()` sozlesmesi. */
export interface MembershipState {
  readonly id: MembershipId;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly role: MembershipRole;
  readonly status: MembershipStatus;
  /** Davet kabul edildiginde dolar; davet asamasinda `null`. */
  readonly joinedAt: Date | null;
}

export interface InviteMembershipInput {
  readonly id: MembershipId;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly role: MembershipRole;
}

export interface CreateOwnerMembershipInput {
  readonly id: MembershipId;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly joinedAt: Date;
}

export class Membership {
  readonly id: MembershipId;
  readonly tenantId: TenantId;
  readonly userId: UserId;

  #role: MembershipRole;
  #status: MembershipStatus;
  #joinedAt: Date | null;

  /** Dogrulama YAPMAZ; yalnizca dogrulanmis degerleri atar. Bkz. `Tenant`. */
  private constructor(state: MembershipState) {
    this.id = state.id;
    this.tenantId = state.tenantId;
    this.userId = state.userId;
    this.#role = state.role;
    this.#status = state.status;
    this.#joinedAt = state.joinedAt;
  }

  /**
   * Bir kullaniciyi tenant'a davet eder.
   *
   * `owner` rolu ile davet YAPILAMAZ: owner, provisioning sirasinda kurucu
   * olarak olusur (ADR-0016). Sonradan owner atamak bir SAHIPLIK DEVRIDIR ve
   * ayri, acik bir islem olmalidir — davet akisina sizdirilamaz.
   */
  static invite(input: InviteMembershipInput): Membership {
    if (input.role.isOwner) {
      throw new OwnerMembershipProtectedError('davet');
    }

    return new Membership({
      id: input.id,
      tenantId: input.tenantId,
      userId: input.userId,
      role: input.role,
      status: 'invited',
      joinedAt: null,
    });
  }

  /**
   * Tenant'i acan kisinin uyeligini olusturur.
   *
   * Davet asamasi YOKTUR: kurucu kendi tenant'ini kendisi actigi icin dogrudan
   * `active` baslar. ADR-0016 geregi bu kayit, tenant kaydiyla AYNI
   * transaction'da olusur — sahipsiz bir tenant asla var olamaz.
   */
  static createOwner(input: CreateOwnerMembershipInput): Membership {
    assertValidDate(input.joinedAt);

    return new Membership({
      id: input.id,
      tenantId: input.tenantId,
      userId: input.userId,
      role: MembershipRole.OWNER,
      status: 'active',
      joinedAt: copyDate(input.joinedAt),
    });
  }

  /**
   * Kalici kayittan uyeligi geri kurar.
   *
   * Gecmis gecisleri tekrar dogrulamaz ama durumun kendi icinde tutarli
   * olmasini zorlar — bozuk bir satir sessizce gecerli bir nesneye donusemez.
   */
  static fromPersistence(state: MembershipState): Membership {
    assertJoinedAtConsistency(state);

    return new Membership({
      ...state,
      joinedAt: state.joinedAt === null ? null : copyDate(state.joinedAt),
    });
  }

  get role(): MembershipRole {
    return this.#role;
  }

  get status(): MembershipStatus {
    return this.#status;
  }

  get joinedAt(): Date | null {
    return this.#joinedAt === null ? null : copyDate(this.#joinedAt);
  }

  /**
   * Bu uyelik veri erisimi veriyor mu?
   *
   * Tenant resolution'in 6. adiminda kullanilir
   * (MULTI_TENANT_ARCHITECTURE 8.2): `active` olmayan uyelik 403 uretir.
   */
  get grantsAccess(): boolean {
    return grantsAccess(this.#status);
  }

  // --- Durum gecisleri (MULTI_TENANT_ARCHITECTURE 7.2) --------------------

  /** invited -> active. Davet kabul edildi. */
  acceptInvitation(joinedAt: Date): void {
    assertValidDate(joinedAt);

    this.#transitionTo('active');
    this.#joinedAt = copyDate(joinedAt);
  }

  /** active -> suspended. Owner askiya alinamaz. */
  suspend(): void {
    this.#assertNotOwner('askiya alma');
    this.#transitionTo('suspended');
  }

  /** suspended -> active. */
  reactivate(): void {
    this.#transitionTo('active');
  }

  /**
   * Uyeligi sonlandirir. Kayit SILINMEZ — denetim izi korunur (7.2).
   *
   * Owner iptal edilemez: tenant sahipsiz kalirdi (ADR-0016).
   */
  revoke(): void {
    this.#assertNotOwner('iptal');
    this.#transitionTo('revoked');
  }

  /**
   * revoked -> invited. Yeniden davet.
   *
   * Dogrudan `active` YAPILMAZ: kullanici daveti tekrar kabul etmelidir.
   * Aksi halde yonetici, kullanicinin onayi olmadan ona erisim vermis olur.
   *
   * `joinedAt` temizlenir — kisi henuz yeniden katilmadi. Onceki katilma
   * tarihi entity'nin degil, denetim kaydinin sorumlulugundadir.
   */
  reinvite(): void {
    this.#transitionTo('invited');
    this.#joinedAt = null;
  }

  // --- Rol degisikligi ----------------------------------------------------

  /**
   * Rolu degistirir.
   *
   * Iki yon de kapalidir:
   * - Mevcut rol `owner` ise DUSURULEMEZ — tenant sahipsiz kalirdi.
   * - Hedef rol `owner` ise ATANAMAZ — bu bir sahiplik devridir, ayri ve acik
   *   bir islem olmalidir.
   *
   * DURUST SINIR: "son owner kaldirilamaz" kurali domain'de zorlanamaz, cunku
   * kac owner oldugunu bilmek repository erisimi gerektirir. Buradaki kural
   * daha KATI ama daha basittir: hicbir owner uyeligi dogrudan dusurulemez.
   * Sahiplik devri islemi geldiginde (Faz 3) bu kural gevsetilir.
   */
  changeRole(role: MembershipRole): void {
    if (this.#role.isOwner) {
      throw new OwnerMembershipProtectedError('rol degistirme');
    }
    if (role.isOwner) {
      throw new OwnerMembershipProtectedError('owner rolune yukseltme');
    }

    this.#role = role;
  }

  // --- Ic yardimcilar ----------------------------------------------------

  #transitionTo(next: MembershipStatus): void {
    assertTransition(this.#status, next);
    this.#status = next;
  }

  #assertNotOwner(operation: string): void {
    if (this.#role.isOwner) {
      throw new OwnerMembershipProtectedError(operation);
    }
  }
}

/**
 * Tutarlilik invariant'i — durum ile `joinedAt` uyumlu olmali:
 *
 * - `invited`   -> HENUZ katilmadi, `joinedAt` bos olmali.
 * - `active`    -> katildi, `joinedAt` dolu olmali.
 * - `suspended` -> once aktifti, `joinedAt` dolu olmali.
 * - `revoked`   -> IKISI DE gecerli: davet asamasinda iptal edilmis olabilir
 *                  (bos) veya aktifken iptal edilmis olabilir (dolu).
 *
 * Son satir bilincli bir belirsizliktir; zorlanmaya calisilirsa gercek
 * senaryolardan biri reddedilir.
 */
function assertJoinedAtConsistency(state: MembershipState): void {
  if (state.joinedAt !== null) {
    assertValidDate(state.joinedAt);
  }

  if (state.status === 'invited' && state.joinedAt !== null) {
    throw new InconsistentMembershipStateError(
      'davet asamasindaki uyelik katilma zamani tasiyamaz',
    );
  }

  if ((state.status === 'active' || state.status === 'suspended') && state.joinedAt === null) {
    throw new InconsistentMembershipStateError(
      `"${state.status}" durumundaki uyelik katilma zamani tasimali`,
    );
  }
}

function assertValidDate(value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new InvalidJoinedAtError('gecerli bir tarih degil');
  }
}

function copyDate(value: Date): Date {
  return new Date(value.getTime());
}
