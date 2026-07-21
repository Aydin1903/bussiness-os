import { describe, expect, it } from 'vitest';

import {
  TENANT_STATUSES,
  allowedTransitionsFrom,
  assertTransition,
  canTransition,
  parseTenantStatus,
  type TenantStatus,
} from './tenant-status.value-object';
import { InvalidTenantStatusError, InvalidTenantStatusTransitionError } from './tenant.error';

describe('parseTenantStatus', () => {
  it.each(TENANT_STATUSES)('tanimli durum "%s" degerini ayristirir', (status) => {
    expect(parseTenantStatus(status)).toBe(status);
  });

  it('tanimsiz durumu reddeder', () => {
    // Veritabanindan beklenmeyen bir deger geldiginde `as TenantStatus` ile
    // zorlamak hatayi gizler; acik ayristirma onu sinirda yakalar.
    expect(() => parseTenantStatus('deleted')).toThrow(InvalidTenantStatusError);
  });

  it('buyuk harfli yazimi reddeder', () => {
    expect(() => parseTenantStatus('ACTIVE')).toThrow(InvalidTenantStatusError);
  });
});

describe('tenant durum gecisleri', () => {
  /** MULTI_TENANT_ARCHITECTURE 6.2 state diagram'inin birebir karsiligi. */
  const ALLOWED: readonly (readonly [TenantStatus, TenantStatus])[] = [
    ['provisioning', 'active'],
    ['provisioning', 'failed'],
    ['active', 'suspended'],
    ['active', 'archived'],
    ['suspended', 'active'],
    ['suspended', 'archived'],
    ['archived', 'active'],
  ];

  it.each(ALLOWED)('%s durumundan %s durumuna gecise izin verir', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => { assertTransition(from, to); }).not.toThrow();
  });

  /**
   * Diyagramda olmayan TUM gecisler. Tek tek saymak yerine turetiyoruz:
   * boylece enum'a yeni bir durum eklendiginde bu test onu kendiliginden
   * kapsar ve yeni durumun gecisleri acikca tanimlanmaya zorlanir.
   */
  const FORBIDDEN = TENANT_STATUSES.flatMap((from) =>
    TENANT_STATUSES.filter(
      (to) => !ALLOWED.some(([allowedFrom, allowedTo]) => allowedFrom === from && allowedTo === to),
    ).map((to) => [from, to] as const),
  );

  it.each(FORBIDDEN)('%s durumundan %s durumuna gecisi reddeder', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => { assertTransition(from, to); }).toThrow(InvalidTenantStatusTransitionError);
  });

  it('provisioning durumundan dogrudan archived durumuna gecisi reddeder', () => {
    // Yarim kurulmus bir tenant arsivlenemez: once active veya failed olmali.
    // Aksi halde hicbir zaman tamamlanmamis bir tenant, tamamlanmis gibi
    // saklama surecine girer.
    expect(() => { assertTransition('provisioning', 'archived'); }).toThrow(
      InvalidTenantStatusTransitionError,
    );
  });

  it('failed durumunu terminal kabul eder', () => {
    // ADR-0016: basarisiz provisioning duzeltilmez, kayit silinir.
    expect(allowedTransitionsFrom('failed')).toHaveLength(0);
  });

  it('hicbir duruma kendi uzerine gecise izin vermez', () => {
    for (const status of TENANT_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it('gecersiz gecis hatasinda kaynak ve hedef durumu tasir', () => {
    try {
      assertTransition('provisioning', 'suspended');
      expect.unreachable('gecis reddedilmeliydi');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidTenantStatusTransitionError);
      expect((error as InvalidTenantStatusTransitionError).from).toBe('provisioning');
      expect((error as InvalidTenantStatusTransitionError).to).toBe('suspended');
    }
  });
});
