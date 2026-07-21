import { describe, expect, it } from 'vitest';

import {
  MEMBERSHIP_STATUSES,
  allowedTransitionsFrom,
  assertTransition,
  canTransition,
  grantsAccess,
  parseMembershipStatus,
  type MembershipStatus,
} from './membership-status.value-object';
import {
  InvalidMembershipStatusError,
  InvalidMembershipStatusTransitionError,
} from './membership.error';

describe('parseMembershipStatus', () => {
  it.each(MEMBERSHIP_STATUSES)('tanimli durum "%s" degerini ayristirir', (status) => {
    expect(parseMembershipStatus(status)).toBe(status);
  });

  it('tanimsiz durumu reddeder', () => {
    expect(() => parseMembershipStatus('deleted')).toThrow(InvalidMembershipStatusError);
  });
});

describe('grantsAccess', () => {
  it('yalnizca aktif uyelige erisim verir', () => {
    expect(grantsAccess('active')).toBe(true);
  });

  it.each(['invited', 'suspended', 'revoked'] as const)(
    '"%s" durumundaki uyelige erisim vermez',
    (status) => {
      // 7.2: bu uc durum erisim acisindan ESDEGERDIR — ucunde de erisim sifir.
      expect(grantsAccess(status)).toBe(false);
    },
  );
});

describe('uyelik durum gecisleri', () => {
  /** MULTI_TENANT_ARCHITECTURE 7.2 state diagram'inin karsiligi. */
  const ALLOWED: readonly (readonly [MembershipStatus, MembershipStatus])[] = [
    ['invited', 'active'],
    ['invited', 'revoked'],
    ['active', 'suspended'],
    ['active', 'revoked'],
    ['suspended', 'active'],
    ['suspended', 'revoked'],
    ['revoked', 'invited'],
  ];

  it.each(ALLOWED)('%s durumundan %s durumuna gecise izin verir', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  /** Diyagramda olmayan TUM gecisler — tek tek saymak yerine turetiliyor. */
  const FORBIDDEN = MEMBERSHIP_STATUSES.flatMap((from) =>
    MEMBERSHIP_STATUSES.filter(
      (to) => !ALLOWED.some(([allowedFrom, allowedTo]) => allowedFrom === from && allowedTo === to),
    ).map((to) => [from, to] as const),
  );

  it.each(FORBIDDEN)('%s durumundan %s durumuna gecisi reddeder', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => {
      assertTransition(from, to);
    }).toThrow(InvalidMembershipStatusTransitionError);
  });

  it('iptal edilmis uyeligi dogrudan aktiflestirmeyi reddeder', () => {
    // Karar: revoked -> invited. Yeniden davet edilen kisi daveti KABUL
    // etmelidir; dogrudan aktiflestirmek, kullanicinin onayi olmadan ona
    // erisim vermek olurdu (DEVELOPMENT_RULES 8: erisim acikca verilir).
    expect(canTransition('revoked', 'active')).toBe(false);
  });

  it('iptal edilmis uyeligi yeniden davete gecirmeye izin verir', () => {
    expect(allowedTransitionsFrom('revoked')).toEqual(['invited']);
  });

  it('hicbir duruma kendi uzerine gecise izin vermez', () => {
    for (const status of MEMBERSHIP_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });
});
