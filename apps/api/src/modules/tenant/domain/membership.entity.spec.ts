import { describe, expect, it } from 'vitest';

import { MembershipId } from './membership-id.value-object';
import { MembershipRole } from './membership-role.value-object';
import { type MembershipStatus } from './membership-status.value-object';
import { Membership, type MembershipState } from './membership.entity';
import {
  InconsistentMembershipStateError,
  InvalidJoinedAtError,
  InvalidMembershipStatusTransitionError,
  OwnerMembershipProtectedError,
} from './membership.error';
import { TenantId } from './tenant-id.value-object';
import { UserId } from '../../../shared/user-id.value-object';

const MEMBERSHIP_ID = MembershipId.create('018f3a2b-7c4d-7e1f-8a2b-000000000001');
const TENANT_ID = TenantId.create('018f3a2b-7c4d-7e1f-8a2b-3c4d5e6f7a8b');
const USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');
const JOINED_AT = new Date('2026-07-21T10:00:00.000Z');

function invite(role: MembershipRole = MembershipRole.MEMBER): Membership {
  return Membership.invite({
    id: MEMBERSHIP_ID,
    tenantId: TENANT_ID,
    userId: USER_ID,
    role,
  });
}

function createOwner(): Membership {
  return Membership.createOwner({
    id: MEMBERSHIP_ID,
    tenantId: TENANT_ID,
    userId: USER_ID,
    joinedAt: JOINED_AT,
  });
}

function persisted(overrides: Partial<MembershipState> = {}): MembershipState {
  return {
    id: MEMBERSHIP_ID,
    tenantId: TENANT_ID,
    userId: USER_ID,
    role: MembershipRole.MEMBER,
    status: 'active',
    joinedAt: JOINED_AT,
    ...overrides,
  };
}

/** Verilen duruma yalnizca izin verilen gecislerle ulasir. */
function memberInStatus(status: MembershipStatus): Membership {
  const membership = invite();
  if (status === 'invited') return membership;

  if (status === 'revoked') {
    membership.revoke();
    return membership;
  }

  membership.acceptInvitation(JOINED_AT);
  if (status === 'active') return membership;

  membership.suspend();
  return membership;
}

describe('Membership.invite', () => {
  it('davet edilen uyeligi invited durumunda yaratir', () => {
    expect(invite().status).toBe('invited');
  });

  it('davet asamasinda katilma zamani tasimaz', () => {
    expect(invite().joinedAt).toBeNull();
  });

  it('davet edilen uyelige erisim vermez', () => {
    expect(invite().grantsAccess).toBe(false);
  });

  it('verilen rolu korur', () => {
    expect(invite(MembershipRole.VIEWER).role).toBe(MembershipRole.VIEWER);
  });

  it('tenant ve kullanici kimligini korur', () => {
    const membership = invite();

    expect(membership.tenantId.equals(TENANT_ID)).toBe(true);
    expect(membership.userId.equals(USER_ID)).toBe(true);
  });

  it('owner rolu ile davet etmeyi reddeder', () => {
    // owner provisioning sirasinda kurucu olarak olusur (ADR-0016). Sonradan
    // owner atamak bir SAHIPLIK DEVRIDIR ve davet akisina sizdirilamaz.
    expect(() => invite(MembershipRole.OWNER)).toThrow(OwnerMembershipProtectedError);
  });
});

describe('Membership.createOwner', () => {
  it('kurucu uyeligi dogrudan aktif yaratir', () => {
    // Davet asamasi yok: kurucu kendi tenant'ini kendisi aciyor.
    expect(createOwner().status).toBe('active');
  });

  it('kurucu uyeligine owner rolu verir', () => {
    expect(createOwner().role).toBe(MembershipRole.OWNER);
  });

  it('kurucu uyeligine erisim verir', () => {
    expect(createOwner().grantsAccess).toBe(true);
  });

  it('katilma zamanini kaydeder', () => {
    expect(createOwner().joinedAt).toEqual(JOINED_AT);
  });

  it('gecersiz katilma zamanini reddeder', () => {
    expect(() =>
      Membership.createOwner({
        id: MEMBERSHIP_ID,
        tenantId: TENANT_ID,
        userId: USER_ID,
        joinedAt: new Date('gecersiz'),
      }),
    ).toThrow(InvalidJoinedAtError);
  });

  it('katilma zamanini kopyalar', () => {
    const mutable = new Date(JOINED_AT.getTime());
    const membership = Membership.createOwner({
      id: MEMBERSHIP_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      joinedAt: mutable,
    });

    mutable.setFullYear(2099);

    expect(membership.joinedAt?.getFullYear()).toBe(JOINED_AT.getFullYear());
  });
});

describe('Membership durum gecisleri', () => {
  it('daveti kabul edince uyeligi aktiflestirir', () => {
    const membership = invite();
    membership.acceptInvitation(JOINED_AT);

    expect(membership.status).toBe('active');
    expect(membership.grantsAccess).toBe(true);
    expect(membership.joinedAt).toEqual(JOINED_AT);
  });

  it('aktif uyeligi askiya alir', () => {
    const membership = memberInStatus('active');
    membership.suspend();

    expect(membership.status).toBe('suspended');
    expect(membership.grantsAccess).toBe(false);
  });

  it('askidaki uyeligi yeniden aktiflestirir', () => {
    const membership = memberInStatus('suspended');
    membership.reactivate();

    expect(membership.status).toBe('active');
  });

  it('aktif uyeligi iptal eder', () => {
    const membership = memberInStatus('active');
    membership.revoke();

    expect(membership.status).toBe('revoked');
    expect(membership.grantsAccess).toBe(false);
  });

  it('davet asamasindaki uyeligi iptal eder', () => {
    const membership = memberInStatus('invited');
    membership.revoke();

    expect(membership.status).toBe('revoked');
  });

  it('iptal edilen uyelikte katilma zamanini korur', () => {
    // Kayit SILINMEZ, denetim izi korunur (7.2).
    const membership = memberInStatus('active');
    membership.revoke();

    expect(membership.joinedAt).toEqual(JOINED_AT);
  });

  it('iptal edilen uyeligi yeniden davete gecirir', () => {
    const membership = memberInStatus('revoked');
    membership.reinvite();

    expect(membership.status).toBe('invited');
  });

  it('yeniden davette katilma zamanini temizler', () => {
    // Kisi henuz yeniden katilmadi; invited durumu joinedAt tasiyamaz.
    const membership = memberInStatus('active');
    membership.revoke();
    membership.reinvite();

    expect(membership.joinedAt).toBeNull();
  });

  it('yeniden davet edilen uyeligi dogrudan aktiflestirmez', () => {
    // Kullanicinin onayi olmadan erisim verilmez.
    const membership = memberInStatus('revoked');
    membership.reinvite();

    expect(membership.grantsAccess).toBe(false);
  });

  it('davet asamasindaki uyeligi askiya almayi reddeder', () => {
    expect(() => {
      memberInStatus('invited').suspend();
    }).toThrow(InvalidMembershipStatusTransitionError);
  });

  it('aktif uyeligi tekrar aktiflestirmeyi reddeder', () => {
    expect(() => {
      memberInStatus('active').reactivate();
    }).toThrow(InvalidMembershipStatusTransitionError);
  });

  it('iptal edilmis uyeligi askiya almayi reddeder', () => {
    expect(() => {
      memberInStatus('revoked').suspend();
    }).toThrow(InvalidMembershipStatusTransitionError);
  });

  it('gecersiz katilma zamani ile daveti kabul etmeyi reddeder', () => {
    const membership = invite();

    expect(() => {
      membership.acceptInvitation(new Date('gecersiz'));
    }).toThrow(InvalidJoinedAtError);
    expect(membership.status).toBe('invited');
  });
});

describe('Membership owner korumalari', () => {
  it('owner uyeligini askiya almayi reddeder', () => {
    expect(() => {
      createOwner().suspend();
    }).toThrow(OwnerMembershipProtectedError);
  });

  it('owner uyeligini iptal etmeyi reddeder', () => {
    // Tenant sahipsiz kalirdi (ADR-0016).
    expect(() => {
      createOwner().revoke();
    }).toThrow(OwnerMembershipProtectedError);
  });

  it('owner rolunu dusurmeyi reddeder', () => {
    expect(() => {
      createOwner().changeRole(MembershipRole.ADMIN);
    }).toThrow(OwnerMembershipProtectedError);
  });

  it('bir uyeligi owner rolune yukseltmeyi reddeder', () => {
    // Sahiplik devri ayri ve acik bir islem olmalidir.
    expect(() => {
      memberInStatus('active').changeRole(MembershipRole.OWNER);
    }).toThrow(OwnerMembershipProtectedError);
  });

  it('owner disindaki rolleri degistirmeye izin verir', () => {
    const membership = memberInStatus('active');
    membership.changeRole(MembershipRole.ADMIN);

    expect(membership.role).toBe(MembershipRole.ADMIN);
  });

  it('reddedilen rol degisikliginde mevcut rolu korur', () => {
    const owner = createOwner();

    expect(() => {
      owner.changeRole(MembershipRole.VIEWER);
    }).toThrow(OwnerMembershipProtectedError);
    expect(owner.role).toBe(MembershipRole.OWNER);
  });
});

describe('Membership.fromPersistence', () => {
  it('kalici kayittaki durumu oldugu gibi geri getirir', () => {
    expect(Membership.fromPersistence(persisted({ status: 'suspended' })).status).toBe('suspended');
  });

  it('owner uyeligini geri getirir', () => {
    const membership = Membership.fromPersistence(persisted({ role: MembershipRole.OWNER }));

    expect(membership.role.isOwner).toBe(true);
  });

  it('geri getirilen owner uzerinde korumalar calismaya devam eder', () => {
    const owner = Membership.fromPersistence(persisted({ role: MembershipRole.OWNER }));

    expect(() => {
      owner.revoke();
    }).toThrow(OwnerMembershipProtectedError);
  });

  it('davet asamasindaki uyeligi katilma zamani olmadan geri getirir', () => {
    const membership = Membership.fromPersistence(
      persisted({ status: 'invited', joinedAt: null }),
    );

    expect(membership.joinedAt).toBeNull();
  });

  it('davet asamasinda katilma zamani tasiyan kaydi reddeder', () => {
    expect(() => Membership.fromPersistence(persisted({ status: 'invited' }))).toThrow(
      InconsistentMembershipStateError,
    );
  });

  it('katilma zamani olmayan aktif kaydi reddeder', () => {
    expect(() =>
      Membership.fromPersistence(persisted({ status: 'active', joinedAt: null })),
    ).toThrow(InconsistentMembershipStateError);
  });

  it('katilma zamani olmayan askidaki kaydi reddeder', () => {
    expect(() =>
      Membership.fromPersistence(persisted({ status: 'suspended', joinedAt: null })),
    ).toThrow(InconsistentMembershipStateError);
  });

  it('iptal edilmis kaydi katilma zamani olsa da olmasa da kabul eder', () => {
    // Bilincli belirsizlik: davet asamasinda iptal edilmis (bos) veya aktifken
    // iptal edilmis (dolu) olabilir. Zorlanirsa gercek senaryolardan biri
    // reddedilirdi.
    expect(Membership.fromPersistence(persisted({ status: 'revoked' })).status).toBe('revoked');
    expect(
      Membership.fromPersistence(persisted({ status: 'revoked', joinedAt: null })).status,
    ).toBe('revoked');
  });

  it('gecersiz katilma zamani tasiyan kaydi reddeder', () => {
    expect(() => Membership.fromPersistence(persisted({ joinedAt: new Date('x') }))).toThrow(
      InvalidJoinedAtError,
    );
  });

  it('kaydin katilma zamanini kopyalar', () => {
    const mutable = new Date(JOINED_AT.getTime());
    const membership = Membership.fromPersistence(persisted({ joinedAt: mutable }));

    mutable.setFullYear(2099);

    expect(membership.joinedAt?.getFullYear()).toBe(JOINED_AT.getFullYear());
  });
});

describe('Membership kapsulleme', () => {
  it('new ile yaratilmayi derleme zamaninda engeller', () => {
    type PublicConstructor = new (...args: never[]) => Membership;

    // @ts-expect-error — private constructor public bir construct imzasina atanamaz.
    const construct: PublicConstructor = Membership;

    expect(construct).toBe(Membership);
  });

  it('katilma zamaninin kopyasini dondurur', () => {
    const membership = createOwner();
    const joinedAt = membership.joinedAt;

    joinedAt?.setFullYear(2099);

    expect(membership.joinedAt?.getFullYear()).toBe(JOINED_AT.getFullYear());
  });
});
