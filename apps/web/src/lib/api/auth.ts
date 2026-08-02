import {
  loginResponseSchema,
  messageResponseSchema,
  type ChangePasswordRequest,
  type ForgotPasswordRequest,
  type LoginRequest,
  type LoginResponse,
  type MessageResponse,
  type RegisterRequest,
  type ResendVerificationRequest,
  type ResetPasswordRequest,
  type VerifyEmailRequest,
} from '@business-os/contracts';

import { apiFetch } from './client';

/**
 * Auth uçları için İNCE sarmalayıcılar — yalnızca API çağrısı + yanıt doğrulama.
 *
 * Yan etki YOK (hint set, store yazma, yönlendirme): bunlar çağıran sayfanın
 * işidir ki akış görünür kalsın. Yanıtlar paylaşılan contracts şemalarıyla
 * doğrulanır (health deseni).
 *
 * ============================================================================
 * HEPSİNDE `noRetry: true` — NEDEN
 * ============================================================================
 * Bu uçlar KİMLİKSİZDİR ve access token kullanmaz. `apiFetch`'in varsayılan
 * davranışı 401'de token yenileyip isteği tekrarlamaktır — ama buradaki bir 401
 * "token süresi doldu" değil, "kimlik bilgileri hatalı" (login) demektir.
 * Yenileme denemek hem anlamsızdır hem de gereksiz bir `/auth/refresh` çağrısı
 * üretir. Bu yüzden yenileme kapatılır; 401 doğrudan yüzeye çıkar.
 * ============================================================================
 */

/** Kayıt — 202, sabit mesaj (hesap varlığı sızmaz). */
export function registerUser(body: RegisterRequest): Promise<MessageResponse> {
  return apiFetch('/auth/register', messageResponseSchema, { body, noRetry: true });
}

/**
 * Giriş — 200 `{ identityToken }` + `Set-Cookie: refresh_token`. Refresh token
 * cookie'yi `credentials: 'include'` (client.ts) taşır; istemci onu hiç görmez.
 */
export function loginUser(body: LoginRequest): Promise<LoginResponse> {
  return apiFetch('/auth/login', loginResponseSchema, { body, noRetry: true });
}

/** E-posta doğrulama — 200, sabit mesaj. */
export function verifyEmail(body: VerifyEmailRequest): Promise<MessageResponse> {
  return apiFetch('/auth/verify-email', messageResponseSchema, { body, noRetry: true });
}

/** Doğrulama kodunu yeniden gönder — 202, sabit mesaj. */
export function resendVerification(body: ResendVerificationRequest): Promise<MessageResponse> {
  return apiFetch('/auth/resend-verification', messageResponseSchema, { body, noRetry: true });
}

/**
 * Parola sıfırlama kodu iste — 202, sabit mesaj. Yanıt hesabın varlığından
 * BAĞIMSIZ aynıdır (P2); istemci başarı/başarısızlık ayırt etmez.
 */
export function forgotPassword(body: ForgotPasswordRequest): Promise<MessageResponse> {
  return apiFetch('/auth/forgot-password', messageResponseSchema, { body, noRetry: true });
}

/** Parola sıfırla (kod + yeni parola) — 200, sabit mesaj. Red 400/422. */
export function resetPassword(body: ResetPasswordRequest): Promise<MessageResponse> {
  return apiFetch('/auth/reset-password', messageResponseSchema, { body, noRetry: true });
}

/**
 * Parola DEĞİŞTİR (giriş yapmış kullanıcı) — 200, sabit mesaj.
 *
 * ============================================================================
 * BU UÇTA `noRetry` YOK — yukarıdakilerin AKSİNE, ve bu bilinçli
 * ============================================================================
 * Diğerleri kimliksizdir; bu uç kimlik doğrulanmış bağlamda çalışır ve access
 * token'ı KULLANIR. Burada bir `401` gerçekten "token süresi doldu" demektir;
 * yenileyip tekrar denemek DOĞRU davranıştır (formu boşuna kaybettirmez).
 *
 * Bunun mümkün olmasının sebebi backend'in "mevcut parola yanlış" için `401`
 * DEĞİL `400` döndürmesidir. `401` dönseydi tek yazım hatası sessizce iki
 * isteğe ve iki başarısız denemeye dönüşürdü (kaba kuvvet bütçesi yarıya inerdi).
 * ============================================================================
 *
 * Başarıda BU oturum ayakta kalır; kullanıcının diğer tüm oturumları düşer.
 */
export function changePassword(body: ChangePasswordRequest): Promise<MessageResponse> {
  return apiFetch('/me/change-password', messageResponseSchema, { body });
}
