/**
 * `bo_session_hint` — web origin'inde yaşayan, `HttpOnly OLMAYAN` oturum ipucu.
 *
 * Middleware'in `/app/*`'i koruyabilmesi için gereken tek işarettir (§3.2).
 * GÜVENLİK DEĞERİ YOKTUR: yalnızca "muhtemelen girişli" tahmini. Gerçek yetki
 * her zaman API'de verilir. Refresh cookie'si (HttpOnly, host-only, API origin'i)
 * middleware'de okunamadığı için bu ayrı ipuç çerezi vardır.
 *
 * Not: `HttpOnly` OLAMAZ — JS'in set/clear edebilmesi gerekir. Bu kasıtlıdır;
 * çerez hiçbir sır taşımaz (yalnızca `1`).
 */
const SESSION_HINT_COOKIE = 'bo_session_hint';

function isSecureContext(): boolean {
  return typeof window !== 'undefined' && window.location.protocol === 'https:';
}

/** Giriş başarılı olduğunda çağrılır (F2 login akışı). */
export function setSessionHint(): void {
  const secure = isSecureContext() ? '; Secure' : '';
  document.cookie = `${SESSION_HINT_COOKIE}=1; Path=/; SameSite=Lax${secure}`;
}

/** Çıkışta veya oturum kurtarılamadığında çağrılır. */
export function clearSessionHint(): void {
  const secure = isSecureContext() ? '; Secure' : '';
  document.cookie = `${SESSION_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}
