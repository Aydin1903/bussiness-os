import { NextResponse, type NextRequest } from 'next/server';

/**
 * Auth-gate — bir GÜVENLİK SINIRI DEĞİL, yalnızca UX yönlendirmesi (§3.2).
 *
 * ============================================================================
 * NEDEN `bo_session_hint`, NEDEN REFRESH COOKIE DEĞİL
 * ============================================================================
 * Refresh cookie'si `HttpOnly` + host-only + `Path=/api/v1/auth` ve API
 * origin'ine aittir (ADR-0026). Middleware WEB origin'inde çalışır; başka bir
 * origin'in host-only cookie'sini ASLA göremez. Bu yüzden yönlendirme, web
 * origin'inde yaşayan `HttpOnly OLMAYAN` bir "oturum ipucu" çerezine bakar.
 *
 * Bu çerez F2'de başarılı login sonrası İSTEMCİ tarafından set edilir, logout'ta
 * silinir. Güvenlik değeri YOKTUR: varlığı "muhtemelen girişli" tahmininden
 * ibarettir ("varlık ≠ geçerlilik"). Gerçek yetki her zaman API'de verilir
 * (RLS + permission guard). Bu, backend'in kalıcı dersinin frontend karşılığıdır:
 * middleware bir güvenlik kararı vermez.
 *
 * F1'de çerez henüz hiç set edilmediğinden `/app/*`'e her erişim `/login`'e döner
 * — beklenen davranış.
 * ============================================================================
 */
const SESSION_HINT_COOKIE = 'bo_session_hint';

export function middleware(request: NextRequest): NextResponse {
  const hasHint = request.cookies.has(SESSION_HINT_COOKIE);
  if (hasHint) {
    return NextResponse.next();
  }

  // İpucu yoksa: kimliksiz sayılır, login'e yönlendirilir. `next` sorgu
  // parametresi, F2'de girişten sonra kullanıcıyı geldiği yere döndürmek içindir.
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

/** Yalnızca korunan uygulama kabuğu (`/app/*`) bu geçitten geçer. */
export const config = {
  matcher: ['/app/:path*'],
};
