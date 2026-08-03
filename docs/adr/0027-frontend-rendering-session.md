# 0027 — Frontend rendering ve session/API-client mimarisi

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-24
- **Karar veren:** Product Owner
- **Faz:** 3

## Baglam

ADR-0026 token saklamayi (refresh cookie, access memory) karara bagladi. Geriye
uc mimari soru kaldi ve bunlar tek bir tutarli hikayedir cunku hepsi ayni token
modelinden turer:

1. Next.js App Router'da hangi sayfalar Server, hangileri Client Component olacak
   ve auth durumu nasil kontrol edilecek?
2. API client token yenilemeyi nasil otomatiklestirir — ozellikle `refresh` bir
   access token DONMEDIGINE gore (ADR-0020: `refresh` → identityToken; access token
   yalnizca `switch-tenant`'tan cikar)?
3. Bu yenileme, ADR-0021'in yeniden kullanim tespitini yanlislikla tetiklemeden
   nasil yapilir?

## Karar

### 1. Rendering: pragmatik RSC/Client bolumu

| Sayfa sinifi                                                        | Tip                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------- |
| Pazarlama / public                                                  | Server Component (statik)                               |
| Auth akisi (`login`, `verify-email`, `forgot/reset`, tenant secimi) | Client Component                                        |
| Uygulama kabugu (authenticated)                                     | Client Component + memory session provider              |
| RSC ile server-side tenant-scoped veri                              | **V1'de HARIC** — ADR-0026 cookie'sine bagli sonraki is |

Authenticated veri cekme V1'de ISTEMCI TARAFLIDIR. Sunucunun tenant-scoped access
token uretmesi hem refresh cookie'sini (henuz yok) hem de secili tenant'i
bilmesini gerektirir; bu zincir kurulana kadar RSC-veri-cekme ertelenir.

### 2. Auth-gate `middleware.ts` bir guvenlik siniri DEGILDIR

Next middleware yalnizca refresh cookie'sinin VARLIGINA bakip kimliksiz
kullaniciyi yonlendirir. Varlik ≠ gecerlilik; gercek yetki daima sunucudadir
(API + RLS + permission guard). Middleware bir UX routing katmanidir.

### 3. API client: iki adimli yenileme + single-flight

**Iki adimli yenileme** (401 sonrasi):

```
refresh(refreshToken)          → yeni identityToken + rotasyonlu refreshToken
switch-tenant(currentTenantId) → yeni accessToken → memory
orijinal istek TEK KEZ tekrar
```

Iki adim zorunludur cunku `refresh` access token dondurmez. Istemci
`currentTenantId`'yi bunun icin saklar.

**Single-flight (tekillestirme):** es zamanli 401'ler TEK bir yenileme
promise'inde birlestirilir; ikinci istek yeni token'i bekler, ikinci bir
`refresh` baslatmaz.

## Gerekce

**Neden auth akisi Client Component.** Bu sayfalar form state tutar ve dogrudan
API'ye POST eder; SSR'nin sagladigi hicbir sey (SEO, ilk boya hizi) burada
degerli degildir. Server Component yapmak yalnizca gereksiz bir client/server
sinir gecisi ekler.

**Neden RSC-veri-cekme V1'de ertelenir.** Tenant-scoped access token memory'de ve
kisa omurludur. Sunucunun onu uretmesi ADR-0026 cookie'sini gerektirir; o karar
uygulanmadan RSC auth'i goremez. Yanlis olan, bugun olmayan bir yetenege V1'i
bagimli kilmaktir.

**Neden middleware guvenlik siniri degil.** Middleware token'i dogrulamaz; yalnizca
"muhtemelen girisli" tahmini yapar. Onu guvenlik siniri saymak, backend'in kalici
dersinin (`CLAUDE.md`: middleware sirasi/varligi guvenlik karari degildir) frontend
tekrari olurdu. Yetki sunucuda verilir, istemcide ipucu gosterilir.

**Neden iki adimli yenileme.** ADR-0020 access token'i yalnizca `switch-tenant`'tan
uretir; `refresh` bir identityToken verir. Tek adimli yenileme bu modelde MUMKUN
DEGILDIR — istemci secili tenant icin access token'i ikinci cagriyla yeniden
turetmek zorundadir.

**Neden single-flight PAZARLIK EDILEMEZ.** Iki istek ayni refresh token'i iki kez
sunarsa ADR-0021'in yeniden kullanim tespiti TUM AILEYI iptal eder ve kullanici
sebepsiz duser. ADR-0021 §"yanlis pozitif" bunu acikca uyarir ve telafiyi istemci
tarafi tekillestirme olarak gosterir. Bu, sunucunun guvenlik davranisinin istemciye
yukledigi bir zorunluluktur, bir optimizasyon degil.

## Sonuclari

**Olumlu**

- Rendering bolumu bugunku token modeliyle tutarli; hayali bir SSR-auth yetenegine
  bagimli degil.
- Iki adimli yenileme ADR-0020'nin iki asamali modeliyle birebir hizali.
- Single-flight, ADR-0021 yanlis pozitiflerini (sebepsiz cikis) kaynaginda onler.
- Auth-gate'in "UX ipucu, guvenlik degil" olarak konumlanmasi, yetkiyi tek yerde
  (sunucu) tutar.

**Olumsuz / bedeli**

- Authenticated veri cekme V1'de istemci tarafli → ilk yuklemede RSC'nin SEO/hiz
  avantaji bu sayfalarda yok. ADR-0026 uygulaninca genisletilebilir.
- Iki adimli yenileme, tek adimliya gore bir ekstra ag gidis-donusu ekler (401
  yolunda).
- Single-flight ve `currentTenantId` durumu, API client'i basit bir fetch
  sarmalayicidan biraz daha karmasik kilar; dogru yazilmasi kritiktir.

## Degerlendirilen alternatifler

| Alternatif                                            | Neden secilmedi                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Her seyi Server Component + RSC-veri-cekme            | Tenant-scoped access token'i sunucuda uretmek ADR-0026 cookie'sini gerektirir; henuz yok |
| Auth-gate'i middleware'de gercek dogrulamayla yapmak  | Token dogrulama sunucunun isi; middleware'de tekrar etmek yetkiyi iki yere boler         |
| Tek adimli yenileme (`refresh` → access token varsay) | ADR-0020 ile celisir; `refresh` access token dondurmez                                   |
| Single-flight olmadan her 401'de refresh              | ADR-0021 aile iptalini tetikler → kullanici sebepsiz duser                               |

## Bu karar ne zaman yeniden gozden gecirilir?

- ADR-0026 backend cookie degisikligi uygulandiginda: RSC-veri-cekme bolumu (§1)
  yeniden acilir ve genisletilir.
- SEO-kritik authenticated sayfa ihtiyaci dogarsa: o sayfa icin RSC-auth zinciri
  oncelikle kurulur.
- Es zamanli cok-tenant oturum (ADR-0020 N7) gundeme gelirse: `currentTenantId`
  tekil varsayimi ve yenileme akisi tekrar tartisilir.
