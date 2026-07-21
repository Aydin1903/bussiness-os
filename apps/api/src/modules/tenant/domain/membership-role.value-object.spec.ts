import { describe, expect, it } from 'vitest';

import { MEMBERSHIP_ROLES, MembershipRole } from './membership-role.value-object';
import { InvalidMembershipRoleError } from './membership.error';

describe('MembershipRole', () => {
  it.each(MEMBERSHIP_ROLES)('tanimli rol "%s" degerini ayristirir', (role) => {
    expect(MembershipRole.create(role).value).toBe(role);
  });

  it('tanimsiz rolu reddeder', () => {
    expect(() => MembershipRole.create('superadmin')).toThrow(InvalidMembershipRoleError);
  });

  it('buyuk harfli yazimi reddeder', () => {
    // Rol bir enum degeridir, kullanici girdisi degil — normalize edilmez.
    expect(() => MembershipRole.create('OWNER')).toThrow(InvalidMembershipRoleError);
  });

  it('bos metni reddeder', () => {
    expect(() => MembershipRole.create('')).toThrow(InvalidMembershipRoleError);
  });

  it('ayni rol icin daima ayni nesneyi dondurur', () => {
    // Onceden yaratilmis ornekler: referans karsilastirmasi da dogru calisir.
    expect(MembershipRole.create('admin')).toBe(MembershipRole.ADMIN);
  });

  it('owner rolunu sahip olarak tanir', () => {
    expect(MembershipRole.OWNER.isOwner).toBe(true);
  });

  it('owner disindaki rolleri sahip saymaz', () => {
    expect(MembershipRole.ADMIN.isOwner).toBe(false);
    expect(MembershipRole.MEMBER.isOwner).toBe(false);
    expect(MembershipRole.VIEWER.isOwner).toBe(false);
  });

  it('owner rolunu sistem rolu sayar', () => {
    // MULTI_TENANT_ARCHITECTURE 7.5: sistem rolu degistirilemez, silinemez.
    expect(MembershipRole.OWNER.isSystemRole).toBe(true);
  });

  it('admin rolunu sistem rolu saymaz', () => {
    // admin bir tenant rolodur: ileride roles tablosuna tasindiginda tenant
    // kendi admin tanimini ozellestirebilecek.
    expect(MembershipRole.ADMIN.isSystemRole).toBe(false);
  });

  it('ayni rolleri esit sayar', () => {
    expect(MembershipRole.create('viewer').equals(MembershipRole.VIEWER)).toBe(true);
  });

  it('farkli rolleri esit saymaz', () => {
    expect(MembershipRole.ADMIN.equals(MembershipRole.VIEWER)).toBe(false);
  });

  it('metne cevrildiginde ham degeri verir', () => {
    expect(String(MembershipRole.MEMBER)).toBe('member');
  });

  it('olusturulduktan sonra degistirilemez', () => {
    expect(() => {
      (MembershipRole.VIEWER as { value: string }).value = 'owner';
    }).toThrow(TypeError);
  });
});
