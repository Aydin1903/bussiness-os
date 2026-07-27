import {
  loginResponseSchema,
  messageResponseSchema,
  type LoginRequest,
  type LoginResponse,
  type MessageResponse,
  type RegisterRequest,
  type ResendVerificationRequest,
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
