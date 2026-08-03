import { z } from 'zod';

/**
 * `POST /api/v1/auth/register`, `/login` ve `/verify-email` istek govdeleri.
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

/**
 * Dogrulama kodu: TAM 6 hane (ADR-0019).
 *
 * Bicim burada eleniyor cunku bicimsiz bir girdi hesabin varligiyla ilgisizdir
 * ve deneme HARCAMAMALIDIR: `abc` gonderen bir istemci hata yapmistir, kod
 * tahmin etmiyordur. Kodun DOGRULUGU ise burada bilinemez — o, sayaci artiran
 * ve HMAC'i kiyaslayan use case'in isidir.
 */
const verificationCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Dogrulama kodu 6 haneli olmalidir');

export const registerSchema = z.object({ email, password }).strict();
export const loginSchema = z.object({ email, password }).strict();
export const verifyEmailSchema = z.object({ email, code: verificationCode }).strict();

/** Yeniden gonderme yalnizca ADRESI ister; kimlik kaniti gerektirmez. */
export const resendVerificationSchema = z.object({ email }).strict();

/**
 * `refresh` ve `logout` GOVDE ALMAZ (ADR-0026): refresh token artik `HttpOnly`
 * cookie ile tasinir ve controller onu cookie'den okur. Bu yuzden burada bir
 * `refreshSchema`/`logoutSchema` yoktur — gövde dogrulanacak veri icermez.
 */

/** Parola sifirlama TALEBI — yalnizca e-posta (kurtarma akisi, kimliksiz). */
export const forgotPasswordSchema = z.object({ email }).strict();

/**
 * Parola sifirlama TAMAMLAMA — e-posta + 6 haneli kod + yeni parola.
 *
 * Kod bicimi (6 hane) burada elenir; parola politikasi (ADR-0018) DEGIL — onun
 * tek dogruluk kaynagi `password-policy.ts`'tir, Zod yalnizca uzunlukla DoS'u
 * sinirda keser (register ile ayni disiplin).
 */
export const resetPasswordSchema = z.object({ email, code: verificationCode, password }).strict();

/**
 * Parola DEGISTIRME — mevcut parola + yeni parola (§7.6).
 *
 * ============================================================================
 * BURADA `email` VE `userId` YOK — bilincli
 * ============================================================================
 * Kimlik, auth middleware'inin DOGRULADIGI token'dan gelir. Govdeden bir
 * `userId` kabul etmek herkesin herkesin parolasini degistirebilmesi demekti
 * (`logout-all` ile ayni gerekce, DEVELOPMENT_RULES 4.5). `email` de gereksizdir:
 * hangi hesabin parolasinin degistigi token'dan bellidir.
 *
 * "Yeni parola tekrar" alani da YOKTUR: o bir ARAYUZ dogrulamasidir (yazim
 * hatasini yakalar) ve sunucunun bilebilecegi bir kural degildir. Sunucuya
 * gondermek, dogrulanmayan bir alan tasimak olurdu.
 *
 * Parola politikasi (ADR-0018) burada DEGIL `password-policy.ts`'te dogrulanir.
 * ============================================================================
 */
export const changePasswordSchema = z
  .object({ currentPassword: password, newPassword: password })
  .strict();

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type VerifyEmailBody = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationBody = z.infer<typeof resendVerificationSchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;
