import { describe, expect, it } from 'vitest';

import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { UserId } from '../../../shared/user-id.value-object';
import { Membership } from '../domain/membership.entity';
import { MembershipId } from '../domain/membership-id.value-object';
import { MembershipRole } from '../domain/membership-role.value-object';
import { TenantId } from '../domain/tenant-id.value-object';
import { ListMembershipsUseCase } from './list-memberships.use-case';
import {
  type MembershipPage,
  type MembershipPageResult,
  type MembershipRepository,
  type UserMembershipRowPage,
} from './membership.repository.port';

const TENANT_ID = TenantId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000a1');
const NOW = new Date('2026-07-22T10:00:00.000Z');

function membership(userSuffix: string, role: MembershipRole): Membership {
  return Membership.fromPersistence({
    id: MembershipId.create(`018f3a2b-7c4d-7e1f-8a2b-${userSuffix.padStart(12, '0')}`),
    tenantId: TENANT_ID,
    userId: UserId.create(`018f3a2b-7c4d-7e1f-9b3c-${userSuffix.padStart(12, '0')}`),
    role,
    status: 'active',
    joinedAt: NOW,
  });
}

class FakeMembershipRepository implements MembershipRepository {
  page: MembershipPageResult = { items: [], total: 0 };
  readonly receivedPages: MembershipPage[] = [];

  findById(): Promise<Membership | null> {
    return Promise.resolve(null);
  }

  findByTenantAndUser(): Promise<Membership | null> {
    return Promise.resolve(null);
  }

  listByTenant(page: MembershipPage): Promise<MembershipPageResult> {
    this.receivedPages.push(page);
    return Promise.resolve(this.page);
  }

  listUserMemberships(): Promise<UserMembershipRowPage> {
    return Promise.resolve({ items: [], total: 0 });
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

/** Ambient context'i olduğu gibi calistirir — RLS gercek adapter testinde. */
class FakeTransactionManager implements TransactionManager {
  currentCalls = 0;

  runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  runInTenantTransaction<T>(_tenantId: string, fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  runInCurrentTenantTransaction<T>(fn: () => Promise<T>): Promise<T> {
    this.currentCalls += 1;
    return fn();
  }
}

function createHarness(): {
  repository: FakeMembershipRepository;
  transactionManager: FakeTransactionManager;
  useCase: ListMembershipsUseCase;
} {
  const repository = new FakeMembershipRepository();
  const transactionManager = new FakeTransactionManager();

  return {
    repository,
    transactionManager,
    useCase: new ListMembershipsUseCase({ membershipRepository: repository, transactionManager }),
  };
}

describe('ListMembershipsUseCase', () => {
  it('uyelikleri DIS goruntuye cevirir (ic id sizmaz)', async () => {
    const harness = createHarness();
    harness.repository.page = {
      items: [membership('a1', MembershipRole.OWNER), membership('a2', MembershipRole.MEMBER)],
      total: 2,
    };

    const result = await harness.useCase.execute({ limit: 20, offset: 0 });

    expect(result.items).toEqual([
      { userId: '018f3a2b-7c4d-7e1f-9b3c-0000000000a1', role: 'owner', status: 'active', joinedAt: NOW },
      { userId: '018f3a2b-7c4d-7e1f-9b3c-0000000000a2', role: 'member', status: 'active', joinedAt: NOW },
    ]);
  });

  it('sayfalama meta sini gecirir', async () => {
    const harness = createHarness();
    harness.repository.page = { items: [], total: 42 };

    const result = await harness.useCase.execute({ limit: 10, offset: 30 });

    expect(result).toMatchObject({ total: 42, limit: 10, offset: 30 });
    expect(harness.repository.receivedPages[0]).toEqual({ limit: 10, offset: 30 });
  });

  it('TENANT CONTEXT li transaction icinde calisir (RLS)', async () => {
    const harness = createHarness();

    await harness.useCase.execute({ limit: 20, offset: 0 });

    // Acik tenantId ile degil, istegin context'i ile: RLS o tenant'a daraltir.
    expect(harness.transactionManager.currentCalls).toBe(1);
  });
});
