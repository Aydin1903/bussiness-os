import type { ZodType } from 'zod';

import { getAccessToken } from '../session/session-store';
import { apiBaseUrl } from './config';
import { ApiError, toApiError } from './problem';
import { refreshSession } from './refresh';

/**
 * Auth-farkında fetch sarmalayıcı — tüm tenant-scoped API çağrılarının kapısı.
 *
 * Görevleri (§5):
 * - Memory'deki access token'ı `Authorization: Bearer` olarak ekler.
 * - `credentials: 'include'` — HttpOnly refresh cookie'sinin (yenileme uçlarında)
 *   gitmesi için (ADR-0026).
 * - 401 → single-flight iki adımlı yenileme, sonra orijinal isteği TEK KEZ tekrar.
 * - Başarı gövdesini paylaşılan Zod şemasıyla DOĞRULAR (mevcut `fetchHealth`
 *   disiplini): tip güvenliği çalışma zamanında kanıtlanır.
 * - Hatayı tek yerde `ApiError`'a (RFC 7807) çevirir.
 *
 * İki giriş: `apiFetch` (gövde bekleyen, şema zorunlu → `T`) ve `apiSend`
 * (gövdesiz uçlar, 204 → `void`). Şemayı zorunlu tutmak, "doğrulanmamış gövde"
 * yolunu tümden kapatır.
 */
export interface ApiFetchOptions {
  readonly method?: string;
  readonly body?: unknown;
  /** Ek başlıklar (content-type ve authorization sarmalayıcı tarafından yönetilir). */
  readonly headers?: Record<string, string>;
  /** 401 sonrası yeniden deneme yapılmasın (yenileme uçlarının kendisi için). */
  readonly noRetry?: boolean;
  /**
   * Authorization Bearer olarak kullanılacak token — VERİLİRSE memory'deki access
   * token yerine bu kullanılır. Tenant-öncesi (identity token) çağrılar içindir:
   * `/me/memberships`, `/tenants`, `/auth/switch-tenant` (§5, ADR-0028).
   */
  readonly bearer?: string;
  readonly signal?: AbortSignal;
}

/** Gövde bekleyen istek: yanıt `schema` ile doğrulanır ve `T` döner. */
export async function apiFetch<T>(
  path: string,
  schema: ZodType<T>,
  options: ApiFetchOptions = {},
): Promise<T> {
  const response = await requestWithRetry(path, options);
  if (!response.ok) {
    throw await toApiError(response);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(response.status, undefined, 'Yanıt gövdesi JSON olarak okunamadı.');
  }

  return schema.parse(payload);
}

/** Gövdesiz istek (ör. 204): gövde okunmaz. Hata yine `ApiError` fırlatır. */
export async function apiSend(path: string, options: ApiFetchOptions = {}): Promise<void> {
  const response = await requestWithRetry(path, options);
  if (!response.ok) {
    throw await toApiError(response);
  }
}

/**
 * İsteği gönderir; 401 gelirse single-flight yenileme yapıp TEK KEZ tekrar dener.
 * Yenileme başarısızsa `refreshSession` oturumu temizler ve fırlatır.
 */
async function requestWithRetry(path: string, options: ApiFetchOptions): Promise<Response> {
  const response = await send(path, options);
  if (response.status !== 401 || options.noRetry === true) {
    return response;
  }

  await refreshSession();
  return send(path, options);
}

async function send(path: string, options: ApiFetchOptions): Promise<Response> {
  const accessToken = getAccessToken();

  const headers: Record<string, string> = { ...options.headers };
  if (options.body !== undefined) {
    headers['content-type'] ??= 'application/json';
  }
  // Açık `bearer` (identity token) memory'deki access token'ı ezer.
  const authToken = options.bearer ?? accessToken;
  if (authToken !== undefined) {
    headers.authorization = `Bearer ${authToken}`;
  }

  return fetch(`${apiBaseUrl()}${path}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers,
    credentials: 'include',
    body: options.body === undefined ? null : JSON.stringify(options.body),
    signal: options.signal ?? null,
  });
}
