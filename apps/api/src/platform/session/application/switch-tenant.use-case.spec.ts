import { describe, expect, it } from 'vitest';

import {
  type IssueTenantAccessTokenInput,
  type TenantAccessTokenIssuer,
} from '../../../modules/identity/identity.public';
import {
  type ResolveMemberAccessInput,
  type TenantAccessQuery,
  type TenantAccessResult,
} from '../../../modules/tenant/tenant.public';
import { SwitchTenantUseCase, type SwitchTenantDependencies } from './switch-tenant.use-case';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

const USER_ID = '018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c';
const SESSION_ID = '018f3a2b-7c4d-7e1f-8a2b-0000000000f1';
const TENANT_ID = '018f3a2b-7c4d-7e1f-8a2b-0000000000a1';

class FakeTenantAccessQuery implements TenantAccessQuery {
  result: TenantAccessResult = { granted: true, tenantId: TENANT_ID, role: 'member' };
  readonly calls: ResolveMemberAccessInput[] = [];

  resolveMemberAccess(input: ResolveMemberAccessInput): Promise<TenantAccessResult> {
    this.calls.push(input);
    return Promise.resolve(this.result);
  }
}

class FakeAccessTokenIssuer implements TenantAccessTokenIssuer {
  readonly issued: IssueTenantAccessTokenInput[] = [];

  issue(input: IssueTenantAccessTokenInput): Promise<string> {
    this.issued.push(input);
    return Promise.resolve(`access-${input.tenantId}`);
  }
}

interface Harness {
  readonly accessQuery: FakeTenantAccessQuery;
  readonly issuer: FakeAccessTokenIssuer;
  readonly useCase: SwitchTenantUseCase;
}

function createHarness(): Harness {
  const accessQuery = new FakeTenantAccessQuery();
  const issuer = new FakeAccessTokenIssuer();

  const deps: SwitchTenantDependencies = {
    tenantAccessQuery: accessQuery,
    accessTokenIssuer: issuer,
  };

  return { accessQuery, issuer, useCase: new SwitchTenantUseCase(deps) };
}

function command(overrides: Partial<{ tenantId: string }> = {}) {
  return { userId: USER_ID, sessionId: SESSION_ID, tenantId: TENANT_ID, ...overrides };
}

describe('SwitchTenantUseCase — erisim verildi', () => {
  it('access token uretir', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute(command());

    expect(result).toEqual({ granted: true, accessToken: `access-${TENANT_ID}` });
  });

  it('token i DOGRULANMIS userId + sessionId + tenantId ile imzalatir', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    // sessionId TASINIR: secim yeni oturum acmaz, mevcut kimlik oturumunu scope eder.
    expect(harness.issuer.issued[0]).toEqual({
      userId: USER_ID,
      sessionId: SESSION_ID,
      tenantId: TENANT_ID,
    });
  });

  it('token i, Tenant in ONAYLADIGI tenantId ile imzalatir (istemcininki degil)', async () => {
    const harness = createHarness();
    // Tenant, cozdugu tenantId'yi kendi dondurur; use case istemci girdisini degil
    // ONU kullanir.
    harness.accessQuery.result = { granted: true, tenantId: 'onaylanan-tenant', role: 'admin' };

    await harness.useCase.execute(command({ tenantId: 'istenen-tenant' }));

    expect(harness.issuer.issued[0]?.tenantId).toBe('onaylanan-tenant');
  });

  it('erisim sorgusuna userId ve istenen tenantId yi gecirir', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.accessQuery.calls[0]).toEqual({ userId: USER_ID, tenantId: TENANT_ID });
  });
});

describe('SwitchTenantUseCase — erisim reddedildi (fail closed)', () => {
  it.each([['no-membership'], ['membership-inactive'], ['tenant-inactive']] as const)(
    '%s icin token URETMEZ ve sebebi tasir',
    async (reason) => {
      const harness = createHarness();
      harness.accessQuery.result = { granted: false, reason };

      const result = await harness.useCase.execute(command());

      expect(result).toEqual({ granted: false, reason });
      // FAIL CLOSED: reddedilen bir sonuctan token dogmaz.
      expect(harness.issuer.issued).toHaveLength(0);
    },
  );
});
