import { z } from 'zod';

/**
 * Auth uçları — api ↔ web paylaşılan şemaları.
 *
 * ============================================================================
 * BU ŞEMALAR BACKEND `auth.dto.ts`'i YANSITIR (mirror)
 * ============================================================================
 * Backend kendi Zod şemalarıyla doğrular; buradakiler istemcinin istek gövdesini
 * şekillendirmesi ve YANITI çalışma zamanında doğrulaması içindir (health
 * deseni). Transport seviyesidir: parola POLİTİKASI (ADR-0018) sunucuda
 * OTORİTERDİR — istemci yalnızca "boş değil / absürt uzunlukta değil" eler.
 * İki tarafın ayrışmaması için alanlar backend ile birebir tutulur.
 * ============================================================================
 */

/** Politikanın üst sınırı 128; şema DoS için biraz daha geniş sınırda eler. */
const MAX_PASSWORD_INPUT = 256;

const email = z.string().trim().min(1, 'E-posta boş olamaz').max(254, 'E-posta çok uzun');
const password = z.string().min(1, 'Parola boş olamaz').max(MAX_PASSWORD_INPUT, 'Parola çok uzun');

/** Doğrulama kodu: TAM 6 hane (ADR-0019). */
const verificationCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Doğrulama kodu 6 haneli olmalıdır');

// --- İstek gövdeleri --------------------------------------------------------

export const registerRequestSchema = z.object({ email, password }).strict();
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({ email, password }).strict();
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const verifyEmailRequestSchema = z.object({ email, code: verificationCode }).strict();
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

export const resendVerificationRequestSchema = z.object({ email }).strict();
export type ResendVerificationRequest = z.infer<typeof resendVerificationRequestSchema>;

// --- Yanıt gövdeleri --------------------------------------------------------

/**
 * Kayıt / doğrulama / yeniden gönderme yanıtı — SABİT metin (hesap varlığı
 * sızmasın, AUTH §8.1 / P2). İstemci metne göre dallanmaz; yalnızca gösterir.
 */
export const messageResponseSchema = z.object({ message: z.string() });
export type MessageResponse = z.infer<typeof messageResponseSchema>;

/**
 * Giriş yanıtı — yalnızca kimlik token'ı (ADR-0020, 5 dk). Refresh token GÖVDEDE
 * DEĞİL, `HttpOnly` cookie'dedir (ADR-0026); istemci onu hiç görmez.
 */
export const loginResponseSchema = z.object({ identityToken: z.string().min(1) });
export type LoginResponse = z.infer<typeof loginResponseSchema>;
