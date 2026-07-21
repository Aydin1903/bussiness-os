import { z } from 'zod';

/**
 * Tek bir dis bagimliligin saglik durumu.
 *
 * `not_configured`: bagimlilik bilincli olarak bu fazda baglanmiyor.
 * Bu bir hata degildir; "kurulmadi" ile "coktu" ayrimini korumak icin vardir.
 */
export const dependencyStatusSchema = z.enum(['ok', 'down', 'not_configured']);
export type DependencyStatus = z.infer<typeof dependencyStatusSchema>;

export const dependencyHealthSchema = z.object({
  status: dependencyStatusSchema,
  /** Kontrolun surdugu sure. `not_configured` durumunda bulunmaz. */
  latencyMs: z.number().nonnegative().optional(),
  /** Insan icin kisa aciklama. Hata detayi veya baglanti dizesi ICERMEZ. */
  message: z.string().optional(),
});
export type DependencyHealth = z.infer<typeof dependencyHealthSchema>;

/**
 * Uygulamanin toplam durumu.
 *
 * `ok`       — tum kritik bagimliliklar saglikli
 * `degraded` — kritik olmayan bir bagimlilik sorunlu, servis calisiyor
 * `down`     — kritik bagimlilik (veritabani) erisilemez
 */
export const healthStatusSchema = z.enum(['ok', 'degraded', 'down']);
export type HealthStatus = z.infer<typeof healthStatusSchema>;

export const healthResponseSchema = z.object({
  status: healthStatusSchema,
  service: z.string(),
  version: z.string(),
  environment: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  /** ISO 8601, UTC. */
  timestamp: z.string(),
  dependencies: z.object({
    database: dependencyHealthSchema,
    redis: dependencyHealthSchema,
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
