import { describe, expect, it } from 'vitest';

import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { MembershipId } from '../domain/membership-id.value-object';
import { MembershipRole } from '../domain/membership-role.value-object';
import { Membership } from '../domain/membership.entity';
import { TenantId } from '../domain/tenant-id.value-object';
import { TenantSlug } from '../domain/tenant-slug.value-object';
import { Tenant } from '../domain/tenant.entity';
import { UserId } from '../../../shared/user-id.value-object';
import { type MembershipRepository } from './membership.repository.port';
import { type TenantRef, type TenantRepository } from './tenant.repository.port';
import { ResolveTenantAccessQuery } from './resolve-tenant-access.query';

/**
 * Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3).
 * Fake'ler gercek davranisi taklit eder; "su cagrildi mi" iddiasi kurmaz.
 */

const TENANT_ID = '018f3a2b-7c4d-7e1f-8a2b-0000000000a1';
const OTHER_TENANT_ID = '018f3a2b-7c4d-7e1f-8a2b-0000000000b2';
const USER_ID = '018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c';
const NOW = new Date('2026-07-22T10:00:00.000Z');

class FakeTenantRepository implements TenantRepository {
  readonly byId = new Map<string, Tenant>();

  findById(id: TenantId): Promise<Tenant | null> {
    return Promise.resolve(this.byId.get(id.value) ?? null);
  }

  resolveBySlug(_slug: TenantSlug): Promise<TenantRef | null> {
    return Promise.resolve(null);
  }

  existsBySlug(_slug: TenantSlug): Promise<boolean> {
    return Promise.resolve(false);
  }

  save(_tenant: Tenant): Promise<void> {
    return Promise.resolve();
  }
}

class FakeMembershipRepository implements MembershipRepository {
  readonly byTenantAndUser = new Map<string, Membership>();

  findById(_id: MembershipId): Promise<Membership | null> {
    return Promise.resolve(null);
  }

  findByTenantAndUser(tenantId: TenantId, userId: UserId): Promise<Membership | null> {
    return Promise.resolve(this.byTenantAndUser.get(`${tenantId.value}:${userId.value}`) ?? null);
  }

  save(_membership: Membership): Promise<void> {
    return Promise.resolve();
  }
}

/** Context'li transaction'i taklit eder ve hangi tenant id ile acildigini kaydeder. */
class FakeTransactionManager implements TransactionManager {
  readonly tenantContexts: string[] = [];

  runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  runInTenantTransaction<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    this.tenantContexts.push(tenantId);
    return fn();
  }

  /**
   * Ambient context bu testlerde kullanilmaz; sozlesme geregi bulunur.
   * Fail-closed davranisi gercek adapter'in entegrasyon testinde dogrulanir.
   */
  runInCurrentTenantTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.runInTransaction(fn);
  }
}

interface Harness {
  readonly tenantRepository: FakeTenantRepository;
  readonly membershipRepository: FakeMembershipRepository;
  readonly transactionManager: FakeTransactionManager;
  readonly query: ResolveTenantAccessQuery;
}

function createHarness(): Harness {
  const tenantRepository = new FakeTenantRepository();
  const membershipRepository = new FakeMembershipRepository();
  const transactionManager = new FakeTransactionManager();

  return {
    tenantRepository,
    membershipRepository,
    transactionManager,
    query: new ResolveTenantAccessQuery({
      tenantRepository,
      membershipRepository,
      transactionManager,
    }),
  };
}

function activeTenant(id: string = TENANT_ID): Tenant {
  const tenant = Tenant.provision({
    id: TenantId.create(id),
    slug: TenantSlug.create('acme'),
    name: 'Acme Ltd.',
    ownerUserId: UserId.create(USER_ID),
    createdAt: NOW,
  });
  tenant.markProvisioned();
  return tenant;
}

function provisioningTenant(id: string = TENANT_ID): Tenant {
  return Tenant.provision({
    id: TenantId.create(id),
    slug: TenantSlug.create('acme'),
    name: 'Acme Ltd.',
    ownerUserId: UserId.create(USER_ID),
    createdAt: NOW,
  });
}

/** invited (henuz katilmamis) uyelik — grantsAccess = false. */
function invitedMembership(): Membership {
  return Membership.invite({
    id: MembershipId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000c3'),
    tenantId: TenantId.create(TENANT_ID),
    userId: UserId.create(USER_ID),
    role: MembershipRole.MEMBER,
  });
}

/** Aktif uyelik, verilen rolde. Owner disi roller davet + kabul ile aktif olur. */
function activeMembership(role: MembershipRole = MembershipRole.MEMBER): Membership {
  const membership = Membership.invite({
    id: MembershipId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000c3'),
    tenantId: TenantId.create(TENANT_ID),
    userId: UserId.create(USER_ID),
    role,
  });
  membership.acceptInvitation(NOW);
  return membership;
}

function seedMembership(harness: Harness, membership: Membership): void {
  harness.membershipRepository.byTenantAndUser.set(
    `${membership.tenantId.value}:${membership.userId.value}`,
    membership,
  );
}

describe('ResolveTenantAccessQuery — erisim var', () => {
  it('aktif uyelik + aktif tenant icin erisim verir ve rolu doner', async () => {
    const harness = createHarness();
    seedMembership(harness, activeMembership(MembershipRole.ADMIN));
    harness.tenantRepository.byId.set(TENANT_ID, activeTenant());

    const result = await harness.query.resolveMemberAccess({
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    expect(result).toEqual({ granted: true, tenantId: TENANT_ID, role: 'admin' });
  });

  it('rolu uyelikten alir, tenant sahipliginden degil', async () => {
    // Owner tenant'i acan kisidir; ama erisen kullanici viewer olabilir.
    const harness = createHarness();
    seedMembership(harness, activeMembership(MembershipRole.VIEWER));
    harness.tenantRepository.byId.set(TENANT_ID, activeTenant());

    const result = await harness.query.resolveMemberAccess({
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    expect(result).toMatchObject({ granted: true, role: 'viewer' });
  });
});

describe('ResolveTenantAccessQuery — erisim reddi', () => {
  it('uyelik yoksa no-membership doner', async () => {
    const harness = createHarness();
    harness.tenantRepository.byId.set(TENANT_ID, activeTenant());

    const result = await harness.query.resolveMemberAccess({
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    expect(result).toEqual({ granted: false, reason: 'no-membership' });
  });

  it('uyelik erisim vermiyorsa membership-inactive doner', async () => {
    // invited uyelik henuz erisim vermez (grantsAccess = false).
    const harness = createHarness();
    seedMembership(harness, invitedMembership());
    harness.tenantRepository.byId.set(TENANT_ID, activeTenant());

    const result = await harness.query.resolveMemberAccess({
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    expect(result).toEqual({ granted: false, reason: 'membership-inactive' });
  });

  it('tenant aktif degilse tenant-inactive doner', async () => {
    // provisioning durumundaki tenant erisime kapali (isOperational = false).
    const harness = createHarness();
    seedMembership(harness, activeMembership());
    harness.tenantRepository.byId.set(TENANT_ID, provisioningTenant());

    const result = await harness.query.resolveMemberAccess({
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    expect(result).toEqual({ granted: false, reason: 'tenant-inactive' });
  });

  it('tenant kaydi yoksa tenant-inactive doner (fail closed)', async () => {
    // Aktif uyelik var ama tenant satiri yok: tutarsiz durum, erisim verilmez.
    const harness = createHarness();
    seedMembership(harness, activeMembership());

    const result = await harness.query.resolveMemberAccess({
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    expect(result).toEqual({ granted: false, reason: 'tenant-inactive' });
  });
});

describe('ResolveTenantAccessQuery — sinir davranisi', () => {
  it('istemciden gelen bozuk tenantId.yi no-membership olarak reddeder', async () => {
    // tenantId istemci talebidir: bicimsel bozuklук uniform 403 verir, olmayan
    // tenant'i var olandan ayirt ettirmez (fail closed).
    const harness = createHarness();

    const result = await harness.query.resolveMemberAccess({
      userId: USER_ID,
      tenantId: 'not-a-uuid',
    });

    expect(result).toEqual({ granted: false, reason: 'no-membership' });
  });

  it('bozuk tenantId icin transaction hic acmaz', async () => {
    const harness = createHarness();

    await harness.query.resolveMemberAccess({ userId: USER_ID, tenantId: 'not-a-uuid' });

    expect(harness.transactionManager.tenantContexts).toHaveLength(0);
  });

  it('bozuk userId.yi sunucu hatasi olarak yukari firlatir', async () => {
    // userId dogrulanmis token'dan gelir; bozuksa bir invariant ihlalidir,
    // sessizce reddedilmez.
    const harness = createHarness();

    await expect(
      harness.query.resolveMemberAccess({ userId: 'not-a-uuid', tenantId: TENANT_ID }),
    ).rejects.toThrow();
  });

  it('okumalari hedef tenant.in id.siyle kurulan context icinde yapar', async () => {
    // memberships standart RLS'e tabidir (12.4): context olmadan SELECT bos
    // doner. Transaction hedef tenantId ile acilmali (8.2).
    const harness = createHarness();
    seedMembership(harness, activeMembership());
    harness.tenantRepository.byId.set(TENANT_ID, activeTenant());

    await harness.query.resolveMemberAccess({ userId: USER_ID, tenantId: TENANT_ID });

    expect(harness.transactionManager.tenantContexts).toEqual([TENANT_ID]);
  });

  it('baska bir tenant.in uyeligini kendi context.inde gormez', async () => {
    // Uyelik OTHER_TENANT icin kayitli; TENANT_ID sorgusu onu bulmamali.
    const harness = createHarness();
    harness.membershipRepository.byTenantAndUser.set(
      `${OTHER_TENANT_ID}:${USER_ID}`,
      activeMembership(),
    );
    harness.tenantRepository.byId.set(TENANT_ID, activeTenant());

    const result = await harness.query.resolveMemberAccess({
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    expect(result).toEqual({ granted: false, reason: 'no-membership' });
  });
});
