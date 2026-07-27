/**
 * API taban adresi — tek kaynak.
 *
 * `NEXT_PUBLIC_` öneki değişkeni TARAYICIYA taşır (fetch istemci tarafında da
 * çalışır). Buraya asla secret yazılmaz (`.env.example`).
 */
const DEFAULT_API_URL = 'http://localhost:3001/api/v1';

export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL;
}
