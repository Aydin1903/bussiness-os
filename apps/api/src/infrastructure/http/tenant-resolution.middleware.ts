import type { NextFunction, Request, Response } from 'express';

/**
 * Host basligindan tenant IPUCUSU cikarir.
 *
 * ============================================================================
 * BU MIDDLEWARE TENANT CONTEXT KURMAZ VE HICBIR ERISIM ACMAZ
 * ============================================================================
 * MULTI_TENANT_ARCHITECTURE P1: tenant kimliginin tek mesru kaynagi
 * DOGRULANMIS JWT claim'idir. Host basligi istemci kontrolundedir — bir
 * saldirgan onu istedigi degere ayarlayabilir.
 *
 * Bu yuzden burada uretilen deger `tenantHint` adiyla durur ve YALNIZCA
 * routing/branding icindir. Ondan tenant context'i kurmak, dokumanin en cok
 * uyardigi hatadir ve tum izolasyon modelini gecersiz kilar.
 *
 * §8.2 cozum zincirinin ALTI adimindan yalnizca ILKI burada uygulanir:
 *
 *   1. Host -> hint                          <- BURADA (bu dosya)
 *   2. JWT dogrula, claim cikar              <- Identity, Faz 3
 *   3. hint <-> claim capraz kontrolu        <- Identity, Faz 3
 *   4. membership active mi                  <- Identity, Faz 3
 *   5. tenant.status active mi               <- Identity, Faz 3
 *   6. TenantContext kur                     <- Identity, Faz 3
 *
 * Ilk adim bugun yazildi cunku Host ayristirma mantigi (port ayirma, IDN,
 * apex/subdomain ayrimi) tek basina test edilebilir ve kimlik dogrulamayi
 * beklemesi gerekmez. Kalan adimlar JWT olmadan YAZILAMAZ — yazilsaydi
 * dogrulanmamis bir kimlige dayanan sahte bir guvenlik zinciri olurdu.
 * ============================================================================
 */

/** Uygulamanin kok alan adi. Alt alan adlari bunun uzerinden cozulur. */
const ROOT_DOMAIN = 'businessos.app';

/** Tenant'a ait OLMAYAN alt alan adlari (MULTI_TENANT_ARCHITECTURE 6.1). */
const NON_TENANT_LABELS: ReadonlySet<string> = new Set(['www', 'api', 'app', 'admin', 'auth']);

/**
 * Ipucular istek nesnesinin UZERINE yazilmaz, yaninda tutulur.
 *
 * WeakMap secildi ve Express'in global `Request` tipi GENISLETILMEDI: global
 * genisletme, ipucunu tum uygulamada "hazir bir tenant alani" gibi gosterir ve
 * birinin ona guvenmesini kolaylastirir. Burada deger yalnizca bu dosyayi
 * bilerek import edenlere gorunur.
 *
 * WeakMap oldugu icin istek nesnesi cop toplandiginda kayit da dusor; sizinti
 * olusmaz.
 *
 * ISIM BILINCLIDIR: `tenant` degil `tenantHint`. Bu bir kimlik degil, tahmindir.
 */
const tenantHints = new WeakMap<Request, string>();

/**
 * Istege eklenmis tenant ipucunu okur.
 *
 * DIKKAT: donen deger bir YETKI KAYNAGI DEGILDIR. Veri erisimi karari daima
 * dogrulanmis JWT claim'i ile verilir (ADR-0015).
 */
export function getTenantHint(request: Request): string | undefined {
  return tenantHints.get(request);
}

/**
 * Host'u normalize edip tenant slug ipucunu cikarir.
 *
 * Ipucu bulunamamasi HATA DEGILDIR: apex alan adindan veya API alan adindan
 * gelen istekler (mobil istemciler, sunucu-sunucu cagrilari) ipucu tasimaz ve
 * bu tamamen gecerlidir (§8.2 adim 3).
 */
export function extractTenantHint(hostHeader: string | undefined): string | undefined {
  if (hostHeader === undefined || hostHeader === '') {
    return undefined;
  }

  // Port atilir, kucuk harfe cevrilir. `Host` basligi "acme.businessos.app:3001"
  // bicimini alabilir ve buyuk/kucuk harf istemciye gore degisir.
  const host = hostHeader.trim().toLowerCase().split(':')[0];

  if (host === undefined) {
    return undefined;
  }

  if (!host.endsWith(`.${ROOT_DOMAIN}`)) {
    return undefined;
  }

  const label = host.slice(0, -(ROOT_DOMAIN.length + 1));

  // Yalnizca TEK seviye alt alan adi kabul edilir: "a.b.businessos.app" bir
  // tenant slug'i degildir ve sessizce "a.b" olarak yorumlanmamalidir.
  if (label === '' || label.includes('.') || NON_TENANT_LABELS.has(label)) {
    return undefined;
  }

  return label;
}

export function tenantResolutionMiddleware(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  const hint = extractTenantHint(request.headers.host);

  if (hint !== undefined) {
    tenantHints.set(request, hint);
  }

  // Ipucu bulunsa da bulunmasa da istek DEVAM EDER. Bu middleware hicbir
  // istegi reddetmez — reddetme yetkisi kimlik dogrulamaya aittir.
  next();
}
