import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { authHeaderOf, mockResponse, stubFetch, urlsOf } from '../../../test/fetch-mock';
import { clearSession, setSession } from '../session/session-store';
import { apiFetch, apiSend } from './client';
import { ApiError } from './problem';

const okSchema = z.object({ ok: z.boolean() });

describe('apiFetch / apiSend', () => {
  beforeEach(() => {
    clearSession();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('memory’deki access token’ı Bearer olarak ekler ve yanıtı Zod ile doğrular', async () => {
    setSession({ accessToken: 'acc-1' });
    const fetchMock = stubFetch(() => mockResponse(200, { ok: true }));

    const result = await apiFetch('/foo', okSchema);

    expect(result).toEqual({ ok: true });
    expect(authHeaderOf(fetchMock)).toBe('Bearer acc-1');
  });

  it('bearer seçeneği access token’ı EZER (identity token çağrıları)', async () => {
    setSession({ accessToken: 'acc-1' });
    const fetchMock = stubFetch(() => mockResponse(200, { ok: true }));

    await apiFetch('/me/memberships', okSchema, { bearer: 'identity-token' });

    expect(authHeaderOf(fetchMock)).toBe('Bearer identity-token');
  });

  it('401 → refresh + switch → orijinal istek TEK KEZ tekrar → başarı', async () => {
    setSession({ accessToken: 'acc-old', currentTenantId: 't-1' });
    let fooCalls = 0;
    stubFetch((url) => {
      if (url.includes('/auth/refresh')) return mockResponse(200, { identityToken: 'id' });
      if (url.includes('/auth/switch-tenant')) return mockResponse(200, { accessToken: 'acc-new' });
      // /foo: ilk çağrı 401, retry 200
      fooCalls += 1;
      return fooCalls === 1 ? mockResponse(401, { title: 'x' }) : mockResponse(200, { ok: true });
    });

    const result = await apiFetch('/foo', okSchema);

    expect(result).toEqual({ ok: true });
    expect(fooCalls).toBe(2); // ilk 401 + tek retry
  });

  it('noRetry:true → 401’de yenileme YAPMAZ, ApiError fırlatır', async () => {
    const fetchMock = stubFetch(() => mockResponse(401, { title: 'Kimlik gecersiz.' }));

    await expect(apiFetch('/auth/login', okSchema, { noRetry: true })).rejects.toBeInstanceOf(
      ApiError,
    );
    // refresh denenmedi.
    expect(urlsOf(fetchMock).some((u) => u.includes('/auth/refresh'))).toBe(false);
  });

  it('Zod uyuşmazlığında fırlatır (yanıt şemaya uymuyor)', async () => {
    stubFetch(() => mockResponse(200, { wrong: 1 }));

    await expect(apiFetch('/foo', okSchema, { noRetry: true })).rejects.toBeTruthy();
  });

  it('hata yanıtı RFC 7807 ApiError’a çevrilir (status + problem)', async () => {
    stubFetch(() =>
      mockResponse(422, { type: 'x', title: 'Doğrulama başarısız', status: 422, detail: 'kötü' }),
    );

    await expect(apiFetch('/foo', okSchema, { noRetry: true })).rejects.toMatchObject({
      status: 422,
      problem: { detail: 'kötü' },
    });
  });

  it('apiSend başarıda void, hatada ApiError döner', async () => {
    stubFetch(() => mockResponse(204, {}));

    await expect(apiSend('/auth/logout', { noRetry: true })).resolves.toBeUndefined();
  });
});
