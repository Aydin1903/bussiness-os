/**
 * `bo_last_tenant` — son seçilen tenant'ın id'si (SIR DEĞİL).
 *
 * Sayfa yenilemede memory (ve `currentTenantId`) sıfırlanır (§2). Bu çerez,
 * reload sonrası kullanıcıyı en son şirketine sorunsuz geri döndürmek içindir.
 * Güvenlik değeri YOKTUR: tenant id zaten access token claim'inde açıktır; bir
 * kullanıcının kurcalayıp başka bir tenant id yazması hiçbir şey kazandırmaz —
 * `switch-tenant` yine membership doğrulamasından geçer (403 verir). `bo_session_hint`
 * ile aynı desen: HttpOnly değil (JS yazar/siler), yalnızca UX ipucu.
 */
const LAST_TENANT_COOKIE = 'bo_last_tenant';

function isSecureContext(): boolean {
  return typeof window !== 'undefined' && window.location.protocol === 'https:';
}

/** 30 gün: refresh ailesinin kayan penceresiyle uyumlu (ADR-0021). */
const MAX_AGE_SECONDS = String(30 * 24 * 60 * 60);

export function setLastTenant(tenantId: string): void {
  const secure = isSecureContext() ? '; Secure' : '';
  document.cookie = `${LAST_TENANT_COOKIE}=${encodeURIComponent(tenantId)}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

export function getLastTenant(): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${LAST_TENANT_COOKIE}=`));
  if (match === undefined) {
    return undefined;
  }
  const value = decodeURIComponent(match.slice(LAST_TENANT_COOKIE.length + 1));
  return value.length > 0 ? value : undefined;
}

export function clearLastTenant(): void {
  const secure = isSecureContext() ? '; Secure' : '';
  document.cookie = `${LAST_TENANT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}
