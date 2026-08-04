import { z } from 'zod';

/**
 * `GET /api/v1/knowledge/notes` sorgu parametreleri (DEVELOPMENT_RULES 7.1).
 *
 * `list-memberships.dto.ts` ile BIREBIR ayni desen ve ayni sayilar. Ikinci bir
 * sayfalama paradigmasi (cursor) eklemek, her yeni listede "hangisini
 * kullanacagiz" sorusunu dogururdu.
 *
 * ⚠️ `offset` sayfalamasinin bilinen bedeli: derin sayfalarda yavaslar ve
 * sayfalama SIRASINDA yeni not eklenirse kayma olur (bir not iki kez ya da hic
 * gorunebilir). Notlar listesinde yeniler BASA eklendigi ve kimse 50. sayfaya
 * gitmedigi icin kabul edildi; gercek bir sorun olursa cursor'a gecis yolu acik.
 *
 * Query string'ten gelen degerler DAIMA string'tir; `coerce` ile sayiya
 * cevrilir ve gecersiz deger sinirda 422 uretir.
 */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const listNotesSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type ListNotesQueryDto = z.infer<typeof listNotesSchema>;
