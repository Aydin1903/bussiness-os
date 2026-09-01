import { z } from 'zod';

/**
 * Sosyal giris istek semalari (ADR-0053).
 *
 * ⚠️ `.strict()`: bilinmeyen alan REDDEDILIR. Bu, `auth.dto.ts` ile ayni
 * disiplindir ve burada ozel bir degeri var — istemcinin `provider` ya da
 * `subject` gibi bir alan gondermeye calismasi SESSIZCE YOK SAYILMAZ, 422
 * uretir. O iki deger YALNIZCA imzali bekleyen baglama cerezinden gelir;
 * govdeden kabul edilmeleri, kullanicinin kendi kimligini beyan etmesi olurdu.
 */
export const verifyOAuthEmailSchema = z
  .object({
    /**
     * 6 haneli kod. ⚠️ Bicim burada dogrulanir ama DOGRULUK dogrulanmaz:
     * yanlis bir kod da bu semadan gecer ve use case'in sayacini harcar —
     * gecmemesi, deneme sinirini istemci tarafina tasimak olurdu.
     */
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/u, 'Dogrulama kodu 6 haneli olmalidir.'),
  })
  .strict();

export type VerifyOAuthEmailBody = z.infer<typeof verifyOAuthEmailSchema>;
