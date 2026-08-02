import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mockResponse, stubFetch, urlsOf } from '../../../test/fetch-mock';
import { clearSession, getIdentityToken, setSession } from '../session/session-store';
import { refreshIdentityToken, refreshSession } from './refresh';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('refresh — single-flight ve identity tazeleme', () => {
  beforeEach(() => {
    clearSession();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('EŞ ZAMANLI refreshSession çağrıları TEK bir /auth/refresh yapar (ADR-0021 single-flight)', async () => {
    setSession({ currentTenantId: 't-1' });
    const fetchMock = stubFetch(async (url) => {
      await delay(10); // çağrıların çakışması için
      if (url.includes('/auth/refresh')) return mockResponse(200, { identityToken: 'id-1' });
      if (url.includes('/auth/switch-tenant')) return mockResponse(200, { accessToken: 'acc-1' });
      throw new Error('beklenmeyen url: ' + url);
    });

    // 3 eş zamanlı çağrı — hepsi TEK inFlight promise'i paylaşmalı.
    const results = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);

    const refreshCalls = urlsOf(fetchMock).filter((u) => u.includes('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1); // 3 değil, 1
    expect(results).toEqual(['acc-1', 'acc-1', 'acc-1']);
  });

  it('inFlight çözüldükten SONRA yeni çağrı yeni bir refresh yapar', async () => {
    setSession({ currentTenantId: 't-1' });
    const fetchMock = stubFetch((url) =>
      url.includes('/auth/refresh')
        ? mockResponse(200, { identityToken: 'id' })
        : mockResponse(200, { accessToken: 'acc' }),
    );

    await refreshSession();
    await refreshSession();

    const refreshCalls = urlsOf(fetchMock).filter((u) => u.includes('/auth/refresh'));
    expect(refreshCalls).toHaveLength(2); // her tamamlanan çağrı ayrı
  });

  it('tenant seçilmemişse refresh sonrası 409 fırlatır (access token üretilemez)', async () => {
    // currentTenantId YOK
    stubFetch(() => mockResponse(200, { identityToken: 'id' }));

    await expect(refreshSession()).rejects.toMatchObject({ status: 409 });
    // Ama kimlik token'ı yine de memory'ye yazılmış olmalı.
    expect(getIdentityToken()).toBe('id');
  });

  it('refreshIdentityToken yalnızca kimlik token’ını tazeler ve memory’ye yazar', async () => {
    stubFetch(() => mockResponse(200, { identityToken: 'id-new' }));

    const token = await refreshIdentityToken();

    expect(token).toBe('id-new');
    expect(getIdentityToken()).toBe('id-new');
  });

  it('refresh başarısızsa (401) session temizlenir ve fırlatır', async () => {
    setSession({ identityToken: 'stale', accessToken: 'stale' });
    stubFetch(() => mockResponse(401, { title: 'Token gecersiz.' }));

    await expect(refreshIdentityToken()).rejects.toBeTruthy();
    expect(getIdentityToken()).toBeUndefined(); // clearSession çağrıldı
  });
});
