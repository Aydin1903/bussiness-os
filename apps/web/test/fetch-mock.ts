import { type Mock, vi } from 'vitest';

/**
 * Web birim testleri için tiplenmiş `fetch` mock yardımcıları.
 *
 * Kodun dokunduğu yüzey minimaldir: `ok` · `status` · `json()`. Gerçek
 * `Response` kurmak yerine bu üçünü taşıyan sahte nesne kullanılır.
 *
 * `stubFetch` mock'u TAM imza ile (`url`, `init`) tipler; böylece `mock.calls[i]`
 * `[url, init?]` olarak bilinir ve `urlsOf` / `authHeaderOf` yardımcıları
 * `String(...)` kaçışına veya tuple hatasına düşmeden argümanları okuyabilir.
 */
export interface MockRes {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

export function mockResponse(status: number, body: unknown): MockRes {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

type FetchImpl = (url: string, init?: RequestInit) => MockRes | Promise<MockRes>;

type FetchMock = Mock<FetchImpl>;

/** Global `fetch`'i tiplenmiş bir mock ile değiştirir ve mock'u döndürür. */
export function stubFetch(impl: FetchImpl): FetchMock {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Verilen isteğin (varsayılan: ilk) `Authorization` başlığı. */
export function authHeaderOf(fn: FetchMock, index = 0): string | undefined {
  const headers = fn.mock.calls[index]?.[1]?.headers as Record<string, string> | undefined;
  return headers?.authorization;
}

/** Çağrılan tüm URL'ler — `.some` / `.filter` ile beklenti kurmak için. */
export function urlsOf(fn: FetchMock): string[] {
  return fn.mock.calls.map((call) => call[0]);
}
