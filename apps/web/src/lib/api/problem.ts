import { problemDetailsSchema, type ProblemDetails } from '@business-os/contracts';

/**
 * RFC 7807 hata gösterimi — istemci tarafı.
 *
 * Backend tüm hataları `application/problem+json` olarak döndürür
 * (DEVELOPMENT_RULES 7.2). İstemci bu tek biçimi tek yerde ayrıştırır ve bir
 * `ApiError`'a sarar; UI `problem.status` / `problem.type` üzerinden dallanır.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetails | undefined;

  constructor(status: number, problem: ProblemDetails | undefined, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
  }
}

/**
 * Hata gövdesini RFC 7807 şemasıyla ayrıştırır.
 *
 * Gövde şemaya uymuyorsa (ör. bir proxy'nin ürettiği düz metin 502) `undefined`
 * döner; çağıran yine de `status`'a sahiptir. Şema DOĞRULAMASI, "hata gövdesi
 * her zaman RFC 7807'dir" varsayımını çalışma zamanında kanıtlar.
 */
export async function parseProblem(response: Response): Promise<ProblemDetails | undefined> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return undefined;
  }

  const parsed = problemDetailsSchema.safeParse(payload);
  return parsed.success ? parsed.data : undefined;
}

/** Bir yanıttan `ApiError` üretir (başlık, varsa problem `title`'ından gelir). */
export async function toApiError(response: Response): Promise<ApiError> {
  const problem = await parseProblem(response);
  const message = problem?.title ?? `HTTP ${String(response.status)}`;
  return new ApiError(response.status, problem, message);
}
