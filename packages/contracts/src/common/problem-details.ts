import { z } from 'zod';

/**
 * RFC 7807 — Problem Details for HTTP APIs.
 *
 * Sistemdeki TEK hata gosterim bicimidir (DEVELOPMENT_RULES 7.2).
 * Ic detay tasimaz: stack trace, SQL veya dosya yolu bu nesneye giremez.
 */
export const problemDetailsSchema = z.object({
  /** Hata turunu tanimlayan stabil URI. Istemci bu alana gore dallanir. */
  type: z.string(),
  /** Insan tarafindan okunabilir kisa baslik. */
  title: z.string(),
  /** HTTP durum kodu. */
  status: z.number().int().min(100).max(599),
  /** Bu ozel oluşuma dair aciklama. */
  detail: z.string().optional(),
  /** Hatanin olustugu kaynak yolu. */
  instance: z.string().optional(),
  /** Log korelasyonu icin istek kimligi. Destek talebinde bu deger istenir. */
  traceId: z.string().optional(),
  /** Alan bazli dogrulama hatalari — yalnizca 422 yanitlarinda dolar. */
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

/** Hata tipi URI'lari icin ortak taban. */
export const PROBLEM_TYPE_BASE = 'https://api.businessos.com/errors' as const;
