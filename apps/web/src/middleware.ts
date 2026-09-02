import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware — ⚠️ **İKİ AYRI İŞ**, tek dosyada.
 *
 * ============================================================================
 * ⚠️ BU DOSYA ÖNCE YALNIZCA AUTH-GATE'Tİ — VE BİR KEZ EZİLDİ
 * ============================================================================
 * ADR-0053 EK-2'nin CSP'si yazılırken bu dosya yanlışlıkla TAMAMEN yeniden
 * yazıldı ve `/app/*` auth-gate'i bir an için kayboldu. Kusur commit'ten önce
 * yakalandı ve not buraya kondu: ⚠️ **`matcher` genişletildiğinde auth-gate'in
 * KAPSAMI DA genişler.** İkisi aynı fonksiyondan geçtiği için, gate'in
 * yalnızca `/app/*`e uygulanması artık KOD İÇİNDE açıkça sınırlanmak
 * zorundadır (`isProtectedPath`). Bu sınır silinirse `/login` bile kendine
 * yönlendirir ve sonsuz döngü olur.
 *
 * ============================================================================
 * 1) AUTH-GATE — bir GÜVENLİK SINIRI DEĞİL, yalnızca UX yönlendirmesi (§3.2)
 * ============================================================================
 * NEDEN `bo_session_hint`, NEDEN REFRESH COOKIE DEĞİL:
 * Refresh cookie'si `HttpOnly` + host-only + `Path=/api/v1/auth` ve API
 * origin'ine aittir (ADR-0026). Middleware WEB origin'inde çalışır; başka bir
 * origin'in host-only cookie'sini ASLA göremez. Bu yüzden yönlendirme, web
 * origin'inde yaşayan `HttpOnly OLMAYAN` bir "oturum ipucu" çerezine bakar.
 *
 * Güvenlik değeri YOKTUR: varlığı "muhtemelen girişli" tahmininden ibarettir
 * ("varlık ≠ geçerlilik"). Gerçek yetki her zaman API'de verilir (RLS +
 * permission guard). Bu, backend'in kalıcı dersinin frontend karşılığıdır:
 * middleware bir güvenlik kararı vermez.
 *
 * ============================================================================
 * 2) CSP — ⚠️ GENİŞLETME DEĞİL, SIFIRDAN POLİTİKA (ADR-0053 EK-2)
 * ============================================================================
 * §10.5 _"CSP'de yalnızca accounts.google.com için script-src açılır"_ diyordu
 * ve ⚠️ o cümle YANLIŞ BİR ÖNCÜLE dayanıyordu: ölçüldü ve `app.kobiwise.com`
 * **hiçbir CSP göndermiyordu** (yalnızca Vercel'in HSTS'i).
 *
 * ⚠️ RİSKİN ŞEKLİ: BUILD YEŞİL, TARAYICI KIRIK. Yanlış bir CSP derlemede ve
 * testte görünmez; sayfa yalnızca gerçek tarayıcıda bozulur. Bu yüzden EK-2.4
 * bağlayıcı bir sıra yazdı: önce `Report-Only`, gerçek tarayıcıda SIFIR ihlal
 * görüldükten sonra zorlayıcı.
 *
 * ⚠️ `script-src` NONCE TABANLI, `'unsafe-inline'` YOK — XSS'e karşı asıl
 * değeri veren satır budur. `style-src`te `'unsafe-inline'` KABUL EDİLİR ve bu
 * DAR, yazılı bir istisnadır: enjekte edilen bir **script kod çalıştırır**,
 * enjekte edilen bir **stil en fazla görünümü bozar**. Bu istisna `script-src`e
 * ASLA taşınmaz.
 *
 * ⚠️ `'strict-dynamic'` KULLANILMAZ: host beyaz listesini destekleyen
 * tarayıcılarda YOK SAYAR ve `accounts.google.com` satırı yanıltıcı bir süs
 * hâline gelirdi.
 *
 * ⚠️ Nonce'un bedeli: sayfalar DİNAMİKLEŞİR. Auth ekranları zaten dinamiktir
 * (`searchParams` okurlar), yani bugünkü bedel sıfıra yakındır — ama Faz 9'un
 * landing page'i geldiğinde bu YENİDEN TARTILMALIDIR.
 * ============================================================================
 */

const SESSION_HINT_COOKIE = 'bo_session_hint';

/** ⚠️ GIS'in TEK hostu. Başka hiçbir yere genişletilmez. */
const GOOGLE_IDENTITY = 'https://accounts.google.com';
/** Kişiselleştirilmiş kutudaki avatar buradan gelir. */
const GOOGLE_AVATARS = 'https://lh3.googleusercontent.com';

/**
 * ⚠️ ZORLAYICIYA GEÇİŞ ANAHTARI (EK-2.4).
 *
 * `'report-only'` iken politika yalnızca RAPORLAR ve sayfayı hiçbir koşulda bozmaz.
 * Gerçek tarayıcıda yedi auth ekranı + `/app` gezilip konsolda **sıfır ihlal**
 * görüldükten SONRA `'enforce'` yapılır.
 *
 * ⚠️ Bir ortam değişkeni DEĞİL, kod sabiti: geçiş bir yapılandırma kazası
 * olarak değil, gözden geçirilen bilinçli bir commit olarak yaşanmalıdır.
 */
// ⚠️ `boolean` DEGIL ISIMLENDIRILMIS BIRLIK: bir `= true` literali derleyici
// tarafindan daraltilir ve asagidaki kosul "her zaman dogru" diye isaretlenir;
// `: boolean` eklemek ise `no-inferrable-types`e takilir. Iki kural arasindaki
// dogru cikis, degerin ADINI vermektir — okunurlugu da artirir: `'enforce'`
// yazan biri ne yaptigini bilir, `false` yazan bilmeyebilir.
type CspMode = 'report-only' | 'enforce';

/*
 * ⚠️ ZORLAYICI — 2026-09-02'de cevrildi ve KOSULU ONCE KARSILANDI.
 *
 * Gecis oncesi olcum (EK-2.4'un yazdigi sira): sekiz rotanin (yedi auth ekrani
 * + `/app`) sunulan HTML'inde nonce TASIMAYAN script etiketi sayisi **0**.
 * ⚠️ Olcum iki GERCEK KUSUR buldu ve ikisi de bu satirdan ONCE duzeltildi —
 * biri kok layout'un tema script'ine nonce yazmamasi, digeri bu dosyanin
 * nonce'u `authGate` dalina hic tasimamasiydi. Zorlayiciya once cevrilseydi
 * ikisi de `/app`te ve yedi ekranda SESSIZ bir tema parlamasi olarak cikardi.
 */
const CSP_MODE: CspMode = 'enforce';

/** `NEXT_PUBLIC_API_URL`in origin'i; yoksa lokal geliştirme adresi. */
function apiOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  try {
    return new URL(raw).origin;
  } catch {
    return 'http://localhost:3001';
  }
}

/**
 * ⚠️ `'unsafe-eval'` — YALNIZCA GELISTIRMEDE, VE BU BIR OLCUMDEN DOGDU.
 *
 * Zorlayiciya cevrildikten sonra gercek tarayicida sayfa ACILDI ama React
 * HIDRATE OLMADI: konsolda tek bir istisna vardi —
 * _"EvalError: Evaluating a string as JavaScript violates ... 'unsafe-eval' is
 * not an allowed source"_ — ve kaynagi Next'in **Fast Refresh** runtime'iydi
 * (`@next/react-refresh-utils`). Sonucu gorunur ama YANILTICIYDI: giris formu
 * cizilmisti, yalnizca istemci bileşenleri (sosyal giris dahil) HIC mount
 * edilmiyordu — yani "sayfa calisiyor" gibi gorunuyordu.
 *
 * ⚠️ Bu bir URETIM sorunu DEGILDIR: `eval` yalnizca dev sunucusunun sicak
 * yeniden yukleme mekanizmasindadir, `next build` ciktisinda YOKTUR. Bu yuzden
 * istisna ortama BAGLANIR — uretimde `'unsafe-eval'` ASLA yazilmaz ve bir
 * asagidaki kosul onu mekanik olarak garanti eder.
 *
 * ⚠️ Kosul `NODE_ENV`e bakar, bir ozel bayraga DEGIL: ozel bir bayrak yanlislikla
 * uretim ortamina konabilir ve hata SESSIZ olurdu (CSP zayiflar, hicbir sey
 * bozulmaz, kimse fark etmez). `NODE_ENV`i `next build` kendisi `production`
 * yapar — yani gevsetmeyi acmak icin BILINCLI bir yanlis yapilandirma gerekir.
 */
const DEV_ONLY_EVAL = process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'";

function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    // ⚠️ `'unsafe-inline'` YOK — nonce'suz satır içi script çalışmaz.
    `script-src 'self' 'nonce-${nonce}'${DEV_ONLY_EVAL} ${GOOGLE_IDENTITY}`,
    // ⚠️ Dar ve yazılı istisna (sınıf yorumu).
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${GOOGLE_AVATARS}`,
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin()} ${GOOGLE_IDENTITY}`,
    // ⚠️ GIS kutusu bir IFRAME'dir; yazılmazsa kutu SESSİZCE boş kalır.
    `frame-src ${GOOGLE_IDENTITY}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * ⚠️ AUTH-GATE'İN KAPSAMI KOD İÇİNDE SINIRLANIR.
 *
 * `matcher` artık CSP için TÜM sayfaları kapsıyor; gate'i `matcher`a bırakmak
 * `/login`i bile kendine yönlendirirdi (sonsuz döngü). Sınır burada, açıkça.
 */
function isProtectedPath(pathname: string): boolean {
  return pathname === '/app' || pathname.startsWith('/app/');
}

export function middleware(request: NextRequest): NextResponse {
  // ⚠️ İSTEK BAŞINA nonce. Sabit bir nonce, nonce olmamakla aynı şeydir.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  // Nonce, Next'in kendi satır içi script'lerine `x-nonce` İSTEK başlığından
  // ulaşır — bu yüzden başlık isteğe yazılır ve istek aşağı aktarılır.
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);

  /*
   * ⚠️ NONCE HER IKI DALA DA GECER — VE BU BIR KUSURDAN SONRA BOYLE.
   *
   * Ilk yazimda `authGate` dali duz `NextResponse.next()` donuyordu, yani
   * `x-nonce` ISTEGE hic yazilmiyordu ve `/app` altindaki her sayfada kok
   * layout'un okudugu deger `undefined` kaliyordu. Cevabin CSP basligi yine de
   * bir nonce tasidigi icin kusur BASLIKTAN GORULEMIYORDU; yalnizca sunulan
   * HTML'deki tema script'i nonce'suz kaliyordu.
   *
   * ⚠️ Zorlayici modda sonucu: `/app`te koyu tema her acilista bir kare BEYAZ
   * parlar — sayfa calisir, hicbir test kirmizi yanmaz. Olcum `/login`de 0,
   * `/app`te 1 nonce'suz etiket gosterince ortaya cikti.
   */
  const response = isProtectedPath(request.nextUrl.pathname)
    ? authGate(request, headers)
    : NextResponse.next({ request: { headers } });

  response.headers.set(
    CSP_MODE === 'report-only' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
    contentSecurityPolicy(nonce),
  );

  return response;
}

/**
 * `/app/*` için oturum ipucu kapısı — YÖNLENDİRME davranışı DEĞİŞMEDİ.
 *
 * ⚠️ `headers` parametresi yalnızca nonce'u aşağı taşımak içindir; kapının
 * kararına hiçbir etkisi yoktur.
 */
function authGate(request: NextRequest, headers: Headers): NextResponse {
  if (request.cookies.has(SESSION_HINT_COOKIE)) {
    return NextResponse.next({ request: { headers } });
  }

  // İpucu yoksa: kimliksiz sayılır, login'e yönlendirilir. `next` sorgu
  // parametresi, girişten sonra kullanıcıyı geldiği yere döndürmek içindir.
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

/**
 * ⚠️ KAPSAM GENİŞLEDİ: CSP tüm sayfalarda olmalı.
 *
 * Yalnızca bazı sayfalarda olsaydı, kapsam dışı bir sayfa SESSİZCE korumasız
 * kalırdı. Statik varlıklar dışarıda: onlar için başlık üretmek gereksiz iştir
 * ve önbelleklemeyi bozar.
 *
 * ⚠️ Auth-gate bu genişlemeden ETKİLENMEZ — kapsamı `isProtectedPath` ile kod
 * içinde sınırlıdır.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand/).*)'],
};
