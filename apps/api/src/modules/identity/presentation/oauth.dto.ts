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

/**
 * `POST /auth/oauth/:provider/one-tap` govdesi (ADR-0053 EK-1.2).
 *
 * ⚠️ TEK ALAN VARDIR ve bu bilinclidir: `nonce`, `provider` ve `sub` govdeden
 * KABUL EDILMEZ. `nonce` imzali cerezden, `provider` yol parcasindan, `sub` ise
 * DOGRULANMIS token'dan gelir. Govdeden alinsalardi kullanici kendi kimligini
 * BEYAN ETMIS olurdu (DEVELOPMENT_RULES 4.5).
 *
 * `.strict()` bu yuzden burada ozellikle degerlidir: fazladan alan gonderen bir
 * istek SESSIZCE yok sayilmaz, 422 alir.
 */
export const oneTapSchema = z
  .object({
    /**
     * GIS'in urettigi ID token. ⚠️ Uzunluk siniri bir DoS elemesidir, bicim
     * dogrulamasi DEGIL — imza/`aud`/`nonce` kontrolu adapter'in isidir.
     */
    credential: z.string().min(1, 'credential bos olamaz').max(4096, 'credential cok uzun'),
  })
  .strict();

export type OneTapBody = z.infer<typeof oneTapSchema>;
