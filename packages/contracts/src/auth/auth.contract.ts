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

/** Parola sıfırlama TALEBİ — yalnızca e-posta (kimliksiz kurtarma akışı). */
export const forgotPasswordRequestSchema = z.object({ email }).strict();
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

/** Parola sıfırlama TAMAMLAMA — e-posta + 6 haneli kod + yeni parola. */
export const resetPasswordRequestSchema = z
  .object({ email, code: verificationCode, password })
  .strict();
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

/**
 * Parola DEĞİŞTİRME — mevcut parola + yeni parola (`POST /me/change-password`).
 *
 * `email`/`userId` YOK: kimlik doğrulanmış token'dan gelir. "Yeni parola tekrar"
 * da yok — o bir ARAYÜZ doğrulamasıdır (yazım hatası yakalar) ve sunucuya
 * gönderilmez.
 */
export const changePasswordRequestSchema = z
  .object({ currentPassword: password, newPassword: password })
  .strict();
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

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

/**
 * `POST /auth/switch-tenant` yanıtı — tenant-scoped access token (ADR-0020, 15 dk).
 * Kimlik token'ıyla + seçilen `tenantId` ile çağrılır; membership doğrulamasından
 * geçer (MT §7.4).
 */
export const switchTenantResponseSchema = z.object({ accessToken: z.string().min(1) });
export type SwitchTenantResponse = z.infer<typeof switchTenantResponseSchema>;

/**
 * `GET /auth/oauth/providers` yanıtı — YAPILANDIRILMIŞ sosyal giriş
 * sağlayıcıları, gösterim sırasıyla (ADR-0053 §3.3, §9.4).
 *
 * ============================================================================
 * ⚠️ İSTEMCİ BU LİSTEYİ SABİT KODLAMAZ
 * ============================================================================
 * Sağlayıcı yapılandırılmamışsa sunucunun registry'sinde HİÇ YOKTUR ve bu
 * listede de görünmez. Arayüz düğmeleri buradan çizer; aksi halde
 * yapılandırılmamış bir sağlayıcının düğmesi ekranda durur ve tıklanınca
 * **404** verir — ADR-0052 §6.1'in açıkça reddettiği şey (_"tıklandığında
 * hiçbir şey yapmayan düğme"_).
 *
 * ⚠️ Sıra ANLAMLIDIR ve sunucudan gelir (ADR-0053 §9.3: yaygın kullanım —
 * Google · Microsoft · LinkedIn · Facebook). İstemci yeniden SIRALAMAZ.
 *
 * ⚠️ Şema `enum` DEĞİL `string` kullanır ve bu bilinçlidir: sunucu bir gün
 * beşinci sağlayıcıyı (Apple) eklediğinde, istemci güncellenmeden önce bir
 * yanıt gelirse `enum` onu REDDEDER ve giriş ekranındaki TÜM düğmeler
 * kaybolurdu. Bilinmeyen bir anahtar sessizce atlanır (`SOCIAL_PROVIDERS`
 * sözlüğünde karşılığı yoksa çizilmez) — bozulma yerine daralma.
 */
export const oauthProvidersResponseSchema = z.object({
  providers: z.array(z.string().min(1)),
});
export type OAuthProvidersResponse = z.infer<typeof oauthProvidersResponseSchema>;
