import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mockResponse, stubFetch } from '../../../test/fetch-mock';
import { bootstrapSession } from './bootstrap';
import { clearLastTenant, setLastTenant } from './last-tenant';
import { clearSession, getCurrentTenantId, setSession } from './session-store';

const TENANT = '018fa000-0000-7000-8000-00000000000a';

describe('bootstrapSession — reload sonrası oturum kurma', () => {
  beforeEach(() => {
    clearSession();
    clearLastTenant();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('access token zaten varsa (oturum-içi) → hazır, HİÇ fetch yapmaz', async () => {
    setSession({ accessToken: 'acc', currentTenantId: 't' });
    const fetchMock = stubFetch(() => mockResponse(200, {}));

    expect(await bootstrapSession()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('token yok + refresh başarılı + bo_last_tenant → o tenant’a geçer', async () => {
    setLastTenant(TENANT);
    stubFetch((url) =>
      url.includes('/auth/refresh')
        ? mockResponse(200, { identityToken: 'id' })
        : mockResponse(200, { accessToken: 'acc' }),
    );

    expect(await bootstrapSession()).toBe(true);
    expect(getCurrentTenantId()).toBe(TENANT); // last-tenant geri kuruldu
  });

  it('token yok + refresh başarılı ama bo_last_tenant YOK → hazır (tenant seçilmemiş)', async () => {
    stubFetch(() => mockResponse(200, { identityToken: 'id' }));

    expect(await bootstrapSession()).toBe(true);
    expect(getCurrentTenantId()).toBeUndefined();
  });

  it('bo_last_tenant artık erişilemezse (switch 403) → yine hazır (sessizce geçer)', async () => {
    setLastTenant(TENANT);
    stubFetch((url) =>
      url.includes('/auth/refresh')
        ? mockResponse(200, { identityToken: 'id' })
        : mockResponse(403, { title: 'erisim yok' }),
    );

    expect(await bootstrapSession()).toBe(true); // login'e ATMAZ
    expect(getCurrentTenantId()).toBeUndefined();
  });

  it('refresh başarısızsa (geçerli cookie yok) → false (login’e gidilmeli)', async () => {
    stubFetch(() => mockResponse(401, { title: 'Token gecersiz.' }));

    expect(await bootstrapSession()).toBe(false);
  });
});
