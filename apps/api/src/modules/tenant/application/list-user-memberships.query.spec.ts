import { describe, expect, it } from 'vitest';

import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { ListUserMembershipsQuery } from './list-user-memberships.query';
import {
  type MembershipRepository,
  type UserMembershipRow,
  type UserMembershipRowPage,
} from './membership.repository.port';

const USER_ID = '018f3a2b-7c4d-7e1f-9b3c-000000000001';

function row(overrides: Partial<UserMembershipRow> = {}): UserMembershipRow {
  return {
    tenantId: '018f3a2b-7c4d-7e1f-8a2b-0000000000a1',
    tenantName: 'Acme',
    tenantSlug: 'acme',
    role: 'admin',
    status: 'active',
    ...overrides,
  };
}

class FakeMembershipRepository implements MembershipRepository {
  page: UserMembershipRowPage = { items: [], total: 0 };
  readonly calls: { userId: string; limit: number; offset: number }[] = [];

  findById(): Promise<null> {
    return Promise.resolve(null);
  }
  findByTenantAndUser(): Promise<null> {
    return Promise.resolve(null);
  }
  listByTenant(): Promise<{ items: never[]; total: number }> {
    return Promise.resolve({ items: [], total: 0 });
  }
  listUserMemberships(
    userId: { value: string },
    limit: number,
    offset: number,
  ): Promise<UserMembershipRowPage> {
    this.calls.push({ userId: userId.value, limit, offset });
    return Promise.resolve(this.page);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
}

/** Duz `runInTransaction`'i oldugu gibi calistirir. */
class FakeTransactionManager implements TransactionManager {
  plainCalls = 0;

  runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    this.plainCalls += 1;
    return fn();
  }
  runInTenantTransaction<T>(_tenantId: string, fn: () => Promise<T>): Promise<T> {
    return fn();
  }
  runInCurrentTenantTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

function setup() {
  const repository = new FakeMembershipRepository();
  const transactionManager = new FakeTransactionManager();
  const query = new ListUserMembershipsQuery({
    membershipRepository: repository,
    transactionManager,
  });
  return { query, repository, transactionManager };
}

describe('ListUserMembershipsQuery', () => {
  it('userId, limit ve offset i repository ye gecirir', async () => {
    const { query, repository } = setup();

    await query.listForUser({ userId: USER_ID, limit: 20, offset: 40 });

    expect(repository.calls).toEqual([{ userId: USER_ID, limit: 20, offset: 40 }]);
  });

  it('DUZ transaction icinde calisir — tenant context KURMAZ', async () => {
    const { query, transactionManager } = setup();

    await query.listForUser({ userId: USER_ID, limit: 20, offset: 0 });

    // runInTenantTransaction DEGIL: fonksiyon RLS'i kendi asar (ADR-0028).
    expect(transactionManager.plainCalls).toBe(1);
  });

  it('ham satirlari dis goruntuye cevirir', async () => {
    const { query, repository } = setup();
    repository.page = {
      items: [row({ role: 'owner' }), row({ tenantId: 't2', tenantSlug: 'beta', role: 'member' })],
      total: 2,
    };

    const result = await query.listForUser({ userId: USER_ID, limit: 20, offset: 0 });

    expect(result.total).toBe(2);
    expect(result.items[0]).toMatchObject({ role: 'owner', tenantName: 'Acme' });
    expect(result.items[1]).toMatchObject({ role: 'member', tenantSlug: 'beta' });
  });

  it('gecersiz bir rol degeri gelirse FAIL-CLOSED reddeder (VO dogrulamasi)', async () => {
    const { query, repository } = setup();
    repository.page = { items: [row({ role: 'superadmin' })], total: 1 };

    await expect(query.listForUser({ userId: USER_ID, limit: 20, offset: 0 })).rejects.toThrow();
  });

  it('gecersiz userId bir SUNUCU hatasidir — yutulmaz, firlar', async () => {
    const { query } = setup();

    await expect(
      query.listForUser({ userId: 'not-a-uuid', limit: 20, offset: 0 }),
    ).rejects.toThrow();
  });
});
