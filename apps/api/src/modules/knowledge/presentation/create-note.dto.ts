import { z } from 'zod';

/**
 * `POST /api/v1/knowledge/notes` istek govdesi.
 *
 * DEVELOPMENT_RULES 2.3: sisteme giren HER dis veri Zod ile dogrulanir.
 *
 * ============================================================================
 * BURADA NE YOK — ve neden
 * ============================================================================
 * - `tenantId` YOK: tenant kimligi DOGRULANMIS access token'dan gelir ve tenant
 *   context'i middleware kurar. Govdeden okumak, istemcinin baska bir tenant'a
 *   yazmasina izin vermek olurdu (DEVELOPMENT_RULES 4.5).
 * - `authorUserId` YOK: ayni gerekce; kimlik token'dan gelir.
 * - `embedding` / `chunks` YOK: turetilmis veridir, istemci uretmez.
 * ============================================================================
 *
 * Uzunluk sinirlari birer DoS onlemidir; icerik kurallari (bos govde) domain'de
 * (`Note.create`) yasar ve orada tek dogruluk kaynagi olarak durur.
 */

/** ~200 sayfalik metin. Bunun uzerini tek notta kabul etmek bellek riskidir. */
const MAX_BODY_LENGTH = 500_000;

export const createNoteSchema = z
  .object({
    /** Opsiyonel (ADR-0029). `null` gecerlidir, `''` domain'de reddedilir. */
    title: z.string().max(500, 'Baslik cok uzun').nullish(),
    body: z.string().min(1, 'Not govdesi bos olamaz').max(MAX_BODY_LENGTH, 'Not cok uzun'),
  })
  .strict();

export type CreateNoteBody = z.infer<typeof createNoteSchema>;
