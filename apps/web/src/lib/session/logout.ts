import { apiSend } from '../api/client';
import { clearSessionHint } from './session-hint';
import { clearSession } from './session-store';

/**
 * Çıkış — sunucuda oturumu sonlandırır, istemcide tüm izleri temizler.
 *
 * - `POST /auth/logout`: refresh token `HttpOnly` cookie'den okunur
 *   (`credentials: 'include'`) ve AİLESİ iptal edilir; sunucu cookie'yi de
 *   temizler (ADR-0023/0026). Her zaman 204 — idempotent.
 * - İstemci: `bo_session_hint` çerezi ve memory session store temizlenir.
 *
 * `noRetry`: logout kimlik bilgisi tazelemeye çalışmaz; 401 olsa bile (olmaz)
 * yenileme anlamsızdır. Ağ hatası olsa bile istemci-tarafı temizlik YAPILIR —
 * kullanıcı her hâlükârda çıkmış sayılmalı.
 */
export async function logout(): Promise<void> {
  try {
    await apiSend('/auth/logout', { method: 'POST', noRetry: true });
  } finally {
    clearSessionHint();
    clearSession();
  }
}
