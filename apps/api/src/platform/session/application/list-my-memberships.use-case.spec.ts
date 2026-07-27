import { describe, expect, it } from 'vitest';

import {
  type ListUserMembershipsInput,
  type UserMembershipsPage,
  type UserMembershipsQuery,
} from '../../../modules/tenant/tenant.public';
import { ListMyMembershipsUseCase } from './list-my-memberships.use-case';

const USER_ID = '018f3a2b-7c4d-7e1f-9b3c-000000000001';

class FakeUserMembershipsQuery implements UserMembershipsQuery {
  readonly calls: ListUserMembershipsInput[] = [];
  page: UserMembershipsPage = { items: [], total: 0 };

  listForUser(input: ListUserMembershipsInput): Promise<UserMembershipsPage> {
    this.calls.push(input);
    return Promise.resolve(this.page);
  }
}

describe('ListMyMembershipsUseCase', () => {
  it('dogrulanmis userId ve sayfalamayi Tenant port una gecirir', async () => {
    const query = new FakeUserMembershipsQuery();
    const useCase = new ListMyMembershipsUseCase({ userMembershipsQuery: query });

    await useCase.execute({ userId: USER_ID, limit: 20, offset: 0 });

    expect(query.calls).toEqual([{ userId: USER_ID, limit: 20, offset: 0 }]);
  });

  it('port un dondurdugu sayfayi oldugu gibi doner', async () => {
    const query = new FakeUserMembershipsQuery();
    query.page = {
      items: [
        { tenantId: 't1', tenantName: 'Acme', tenantSlug: 'acme', role: 'owner', status: 'active' },
      ],
      total: 1,
    };
    const useCase = new ListMyMembershipsUseCase({ userMembershipsQuery: query });

    const result = await useCase.execute({ userId: USER_ID, limit: 20, offset: 0 });

    expect(result).toEqual(query.page);
  });
});
