import { z } from 'zod';

/**
 * `GET /api/v1/memberships` sorgu parametreleri (DEVELOPMENT_RULES 7.1).
 *
 * Liste HER ZAMAN sayfalidir. Varsayilan `limit` makuldur ve ust sinir vardir:
 * sinirsiz `limit`, tek istekte tum tabloyu cekmenin (ve belleği doldurmanin)
 * kapisidir.
 *
 * Query string'ten gelen degerler DAIMA string'tir; `coerce` ile sayiya cevrilir
 * ve gecersiz deger (negatif, absurt buyuk) sinirda 422 uretir.
 */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const listMembershipsSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type ListMembershipsQueryDto = z.infer<typeof listMembershipsSchema>;
