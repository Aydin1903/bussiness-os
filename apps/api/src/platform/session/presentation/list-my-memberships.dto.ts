import { z } from 'zod';

/**
 * `GET /api/v1/me/memberships` sorgu parametreleri (DEVELOPMENT_RULES 7.1).
 *
 * Liste HER ZAMAN sayfalidir — sinirsiz liste yasak. Bir kullanicinin uye oldugu
 * tenant sayisi pratikte kucuk olsa da kural istisnasizdir. Query string'ten
 * gelen degerler string'tir; `coerce` sayiya cevirir, gecersiz deger 422 uretir.
 */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const listMyMembershipsSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type ListMyMembershipsQueryDto = z.infer<typeof listMyMembershipsSchema>;
