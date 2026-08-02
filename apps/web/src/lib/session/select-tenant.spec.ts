import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mockResponse, stubFetch, urlsOf } from '../../../test/fetch-mock';
import { clearLastTenant, getLastTenant } from './last-tenant';
import { selectTenant } from './select-tenant';
import { clearSession, getAccessToken, getCurrentTenantId, setSession } from './session-store';

const TENANT = '018fa000-0000-7000-8000-00000000000a';

describe('selectTenant — dayanıklı tenant seçimi', () => {
  beforeEach(() => {
    clearSession();
    clearLastTenant();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mutlu yol: switch-tenant → access token + currentTenantId + bo_last_tenant', async () => {
    setSession({ identityToken: 'id-1' });
    stubFetch(() => mockResponse(200, { accessToken: 'acc-1' }));

    await selectTenant(TENANT);

    expect(getAccessToken()).toBe('acc-1');
    expect(getCurrentTenantId()).toBe(TENANT);
    expect(getLastTenant()).toBe(TENANT); // reload dayanıklılığı için persist
  });

  it('kimlik token’ı YOKSA (reload) önce refresh cookie ile tazeler', async () => {
    // identityToken YOK
    const fetchMock = stubFetch((url) =>
      url.includes('/auth/refresh')
        ? mockResponse(200, { identityToken: 'id-fresh' })
        : mockResponse(200, { accessToken: 'acc-2' }),
    );

    await selectTenant(TENANT);

    expect(urlsOf(fetchMock).some((u) => u.includes('/auth/refresh'))).toBe(true);
    expect(getAccessToken()).toBe('acc-2');
  });

  it('switch-tenant 401 (identity dolmuş) → tazele + TEK retry → başarı', async () => {
    setSession({ identityToken: 'id-expired' });
    let switchCalls = 0;
    const fetchMock = stubFetch((url) => {
      if (url.includes('/auth/refresh')) return mockResponse(200, { identityToken: 'id-fresh' });
      if (url.includes('/auth/switch-tenant')) {
        switchCalls += 1;
        return switchCalls === 1
          ? mockResponse(401, { title: 'Token gecersiz.' }) // ilk deneme: dolmuş
          : mockResponse(200, { accessToken: 'acc-retry' }); // retry: başarı
      }
      throw new Error('beklenmeyen url');
    });

    await selectTenant(TENANT);

    expect(switchCalls).toBe(2); // ilk 401 + retry
    expect(urlsOf(fetchMock).filter((u) => u.includes('/auth/refresh'))).toHaveLength(1);
    expect(getAccessToken()).toBe('acc-retry');
    expect(getCurrentTenantId()).toBe(TENANT);
  });

  it('403 (erişim reddi) fırlatır ve retry YAPMAZ', async () => {
    setSession({ identityToken: 'id-1' });
    const fetchMock = stubFetch(() => mockResponse(403, { title: 'Bu tenant a erisiminiz yok.' }));

    await expect(selectTenant(TENANT)).rejects.toMatchObject({ status: 403 });
    // 403 yeniden denenmez (yalnızca 401 retry edilir).
    expect(urlsOf(fetchMock).filter((u) => u.includes('/auth/refresh'))).toHaveLength(0);
  });
});
