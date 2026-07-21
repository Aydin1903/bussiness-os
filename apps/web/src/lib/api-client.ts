import { healthResponseSchema, type HealthResponse } from '@business-os/contracts';

const DEFAULT_API_URL = 'http://localhost:3001/api/v1';

function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL;
}

/**
 * API'den saglik durumunu okur.
 *
 * Cevap, paylasilan Zod semasi ile DOGRULANIR. Web ve API ayni surumden
 * deploy edilmedigi anda tip guvenligi bir varsayima donusur; sema dogrulamasi
 * bu varsayimi calisma zamaninda kanitlar.
 *
 * @throws Ag hatasi veya sema uyusmazligi durumunda.
 */
export async function fetchHealth(): Promise<HealthResponse> {
  // Saglik durumu tanim geregi anliktir; onbellege alinmasi cevabi anlamsiz kilar.
  const response = await fetch(`${apiBaseUrl()}/health`, { cache: 'no-store' });

  const payload: unknown = await response.json();

  return healthResponseSchema.parse(payload);
}
