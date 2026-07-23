import { z } from 'zod';

/**
 * `POST /api/v1/auth/register` ve `/login` istek govdeleri.
 *
 * DEVELOPMENT_RULES 2.3: sisteme giren HER dis veri Zod ile dogrulanir.
 *
 * ============================================================================
 * BURADA NE YOK — ve neden
 * ============================================================================
 * - `ipAddress` YOK: istemci kendi IP'sini bildiremez. IP, kaba kuvvet
 *   korumasinin sayac ANAHTARIDIR (ADR-0022 katman 1/3); govdeden okunsaydi
 *   saldirgan her istekte farkli bir IP yazip limiti atlatirdi. Sunucu onu
 *   baglantidan alir.
 * - `userId` / rol / `emailVerified` YOK: hicbir kimlik/yetki alani istemciden
 *   gelmez (DEVELOPMENT_RULES 4.5).
 *
 * PAROLA BURADA UZUNLUK DISINDA DOGRULANMAZ. Politikanin (ADR-0018) tek
 * dogruluk kaynagi `password-policy.ts`'tir; Zod yalnizca absurt buyuklukteki
 * govdeyi sinirda eler (DoS). Iki yerde kural yazmak, ikisinin ayrismasi demektir.
 * ============================================================================
 */

/** Politikanin ust siniri 128; Zod biraz daha genis tutup ELEMEYI politikaya birakir. */
const MAX_PASSWORD_INPUT = 256;

const email = z.string().trim().min(1, 'E-posta bos olamaz').max(254, 'E-posta cok uzun');
const password = z.string().min(1, 'Parola bos olamaz').max(MAX_PASSWORD_INPUT, 'Parola cok uzun');

export const registerSchema = z.object({ email, password }).strict();
export const loginSchema = z.object({ email, password }).strict();

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
