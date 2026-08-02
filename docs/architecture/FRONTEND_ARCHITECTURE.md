# Frontend Architecture

Business OS — Frontend Mimarisi

> **Durum:** Faz 3 — frontend giriş — ✅ **Kabul edildi**
> **Sürüm:** 1.3
> **Son güncelleme:** 2026-08-02
> **Sahip:** Lead Software Engineer · **Onay:** Product Owner

---

## Bu dokümanın statüsü

Bu doküman, Business OS **web istemcisinin (Next.js)** mimari tasarımı için Single Source of Truth'tur.

- Frontend ile ilgili bir soruda **önce buraya** bakılır.
- Kod ile bu doküman çelişirse, **doküman değil kod yanlıştır** — ya kod düzeltilir ya da doküman bilinçli bir kararla güncellenir.
- Bu dokümanı değiştiren her PR, karşılık gelen ADR'yi de günceller.

**Kardeş dokümanlar:**
- [`AUTH_ARCHITECTURE.md`](AUTH_ARCHITECTURE.md) — kimlik doğrulama, iki aşamalı token modeli, refresh rotation. Backend tarafı **orada** tanımlıdır ve **burada tekrarlanmaz**; bu doküman onun istemci karşılığıdır.
- [`MULTI_TENANT_ARCHITECTURE.md`](MULTI_TENANT_ARCHITECTURE.md) — tenant çözümleme, `switch-tenant` akışı (§7.4).

### Referans verilen ADR'ler

| ADR | Karar | Durum |
|---|---|---|
| [0020](../adr/0020-jwt-structure-and-signing.md) | İki aşamalı token, EdDSA | ✅ Kabul edildi |
| [0021](../adr/0021-refresh-token-rotation.md) | Refresh rotation + yeniden kullanım tespiti | ✅ Kabul edildi |
| [0023](../adr/0023-session-termination.md) | Oturum sonlandırma ve iptal | ✅ Kabul edildi |
| [0026](../adr/0026-frontend-token-storage.md) | Frontend token saklama ve taşıma (hibrit cookie) | ✅ Kabul edildi |
| [0027](../adr/0027-frontend-rendering-session.md) | Frontend rendering + session/API-client mimarisi | ✅ Kabul edildi |
| [0028](../adr/0028-my-memberships-query.md) | `GET /me/memberships` (tenant seçim akışının kaynağı) | ✅ Kabul edildi |

---

## 0. Durum: cookie taşıması artık kod; SSR auth hâlâ hedef

Bu dokümanın kararlarından biri artık **kodda gerçekleşmiştir**, biri hâlâ hedeftir:

| Karar | Durum |
|---|---|
| **§2 — refresh token `HttpOnly` cookie taşıması** (ADR-0026) | ✅ **Backend uyguladı** (2026-07-26). `login`/`refresh` `Set-Cookie` yazar, `refresh`/`logout` cookie'den okur, `logout`/`logout-all` temizler. Bkz. [`refresh-cookie.ts`](../../apps/api/src/modules/identity/presentation/refresh-cookie.ts), `AUTH_ARCHITECTURE.md` §10.5 |
| **§3.1 — RSC ile server-side tenant-scoped veri çekme** | ⏳ **Hedef.** Tenant-scoped access token'ı sunucuda üretmek ek altyapı ister; V1'de authenticated veri çekme istemci taraflıdır |

Bu sıralama bilinçliydi: token saklama gibi güvenlik kritik bir karar, istemci kodu yazıldıktan sonra değiştirilirse çok daha pahalıdır. Karar önce verildi, backend ona göre kuruldu; frontend artık hazır bir cookie taşımasının üzerine oturacak.

Kalan "hedef" işaretleri (§3.1) açıkça belirtilir.

---

## 1. Bağlam ve kısıtlar

### 1.1 Onaylanmış stack

`CLAUDE.md`'de sabit: **Next.js (App Router)** · **Tailwind CSS v4** · TypeScript · paylaşılan `@business-os/contracts` (Zod şemaları). Tenant kimliği JWT claim'inden (yetki kaynağı), subdomain routing/branding içindir.

### 1.2 Bugünkü backend kontratı — access/identity gövde, refresh cookie

Frontend tasarımının çıpası budur. Access/identity token **JSON gövdesinde** döner; refresh token **`HttpOnly` cookie** ile taşınır (ADR-0026, artık kod):

| Uç | İstemciye dönen | İstemciden gelen |
|---|---|---|
| `POST /auth/login` | gövdede `identityToken` (5 dk) + `Set-Cookie: refresh_token` (HttpOnly) | e-posta + parola |
| `POST /auth/switch-tenant` | gövdede `accessToken` (15 dk, `tenant` claim'li) | `Authorization: Bearer <identityToken>` + `tenantId` |
| `POST /auth/refresh` | gövdede **`identityToken`** + `Set-Cookie: refresh_token` (rotasyonlu) | `Cookie: refresh_token` (gövde YOK) |
| `POST /auth/logout` · `/logout-all` | `Set-Cookie` ile cookie temizlenir | `Cookie: refresh_token` (logout) / `Bearer` (logout-all) |
| Korunan uçlar | — | `Authorization: Bearer <accessToken>` |

### 1.3 İki aşamalı token modeli (ADR-0020) — istemci sonuçları

`AUTH_ARCHITECTURE.md`'de tam tanımlı model, istemciye iki **non-obvious** sorumluluk yükler:

1. **Tenant seçimi zorunlu bir ekrandır.** `login` yalnızca `identityToken` verir; bu token tenant verisine erişemez. Kullanıcı bir tenant seçmeden (`switch-tenant`) hiçbir iş verisi çekilemez. Tek tenant'ı olan kullanıcı için arayüz otomatik seçebilir, ama **çağrı yine yapılır** (sunucu membership doğrular).

2. **`refresh`, `accessToken` DÖNMEZ — `identityToken` döner.** Tenant-scoped access token'a ulaşmanın tek yolu `switch-tenant`'tır. Bu yüzden 401 sonrası yenileme **iki adımlıdır**:

   ```
   refresh()  // refresh token cookie'den otomatik → yeni identityToken + rotasyonlu cookie
   switch-tenant(currentTenantId, identityToken)  →  yeni accessToken
   ```

   Refresh token cookie'de olduğu için istemci onu **taşımaz**; ama seçili `currentTenantId`'yi bu yeniden türetme için **hatırlamak zorundadır**. Detay §5.2'de.

---

## 2. Token saklama ve taşıma (ADR-0026 — GÜVENLİK KRİTİK)

### 2.1 Karar: hibrit

| Token | Nerede | Ömür | Neden orada |
|---|---|---|---|
| **refresh token** | **`httpOnly` + `Secure` + `SameSite` cookie** | 30 gün (kayan), 90 gün tavan | JavaScript **okuyamaz** → XSS onu sızdıramaz |
| **access token** | **JS memory** (React state / modül değişkeni) | 15 dk | kısa ömürlü, tek tenant scope; reload'da kaybolur, sessizce yeniden türetilir |
| **identity token** | **JS memory** | 5 dk | yalnızca tenant seçimi için; kalıcı değer taşımaz |

**`localStorage` / `sessionStorage` HİÇBİR token için kullanılmaz.** Diske yazılan bir token, herhangi bir script tarafından okunabilir; bu modelin bütün savunması buna izin vermemektir.

### 2.2 Neden cookie yalnızca refresh token için

Bu modelin tehlikeli olan **tek** şeyi 30 gün ömürlü refresh token'dır: çalınırsa saldırgan yeniden kullanım tespit edilene kadar (ADR-0021) hesabı elinde tutar. Onu `httpOnly` cookie'ye koymak JS erişimini tamamen keser — bir XSS açığı bile elde edemez.

Access token memory'de kalır çünkü:
- **Bearer taşıması gerektirir:** korunan uçlar `Authorization: Bearer` bekler (ADR-0020 stateless doğrulama). Cookie'ye konsa CSRF yüzeyi her isteğe yayılırdı; memory + explicit header ise CSRF'e **bağışıktır** (ambient olarak gönderilmez).
- **Maruz kalma penceresi dardır:** XSS sayfa ömrü boyunca memory'deki access token'ı okuyabilir — ama yalnızca 15 dk ve tek tenant scope; refresh token'a **ulaşamaz**, yani kalıcı ele geçirme olmaz.

### 2.3 Cookie sertleştirme ve CSRF

Refresh cookie ambient gönderildiği için CSRF korunur:

| Önlem | Değer / neden |
|---|---|
| `HttpOnly` | JS okuyamaz |
| `Secure` | yalnızca HTTPS |
| `SameSite=Strict` (en fazla `Lax`) | cross-site isteklerde cookie gönderilmez → CSRF'in temel taşıması kesilir |
| `Path=/api/v1/auth` | cookie yalnızca yenileme uçlarına gider; her isteğe değil |
| Double-submit CSRF token | `SameSite` desteklemeyen eski tarayıcı ve gereksiz rotasyon tetiklemesine karşı ek kat |

**CSRF neden burada zaten zayıf:** cross-site tetiklenen bir `refresh` çağrısının döndürdüğü yeni token **gövdede** gelir ve saldırganın cross-origin JS'i onu **CORS nedeniyle okuyamaz**. En fazla gereksiz bir rotasyon olur (bu da double-submit token ile kapanır). Yani saldırgana okunabilir bir kazanç bırakılmaz.

### 2.4 Bedeli — dürüstçe

- **Backend kontratı değişti** (2026-07-26, artık kod). `login`/`refresh` `Set-Cookie` yazar; `refresh`/`logout` token'ı cookie'den okur; CORS `credentials: true` zaten vardı. Bu, temiz stateless modeli genişletti — `refresh`/`logout` artık gövde almaz.
- **httpOnly cookie web'e özgüdür.** Gelecekteki mobil/programatik istemci cookie kullanamaz. Backend bu yüzden muhtemelen **iki taşımayı** desteklemek zorunda kalır: web için cookie, diğerleri için gövde. Bu gerçek bir karmaşıklıktır ve ADR-0026'da açıkça kabul edilmiştir. (V1'de yalnızca cookie taşıması uygulandı; gövde taşıması mobil istemci geldiğinde eklenir.)
- **ADR-0020'nin stateless mikroservis hedefiyle çelişmez:** access token yine Bearer, yine durumsuz doğrulanır; yalnızca **refresh taşıması** cookie'ye taşındı.

---

## 3. Rendering stratejisi — Next.js App Router (ADR-0027)

### 3.1 Sayfa sınıflandırması

İki aşamalı token + memory'deki access token, saf RSC (React Server Component) veri çekmeyi sınırlar. Pragmatik bölüm:

| Sayfa sınıfı | Tip | Gerekçe |
|---|---|---|
| Pazarlama / public | **Server Component** (statik) | auth yok; SEO değerli; en hızlı |
| Auth akışı: `register` · `login` · `verify-email` · `forgot/reset-password` | **Client Component** (bir kısmı server sarmalayıcı `?param` okur) | form state, doğrudan API'ye POST; SSR faydası yok |
| Tenant kapısı: `create-tenant` · `select-tenant` | **Client Component** | tenant-öncesi, identity token ile; gerçek veri (`/me/memberships`) client'ta çekilir |
| Uygulama kabuğu (`/app`) | **Server layout + Client `AppShell`** (§3.5) | access token memory'de; kabuk bootstrap + sidebar/header client'ta |
| RSC ile server-side tenant-scoped veri | **V1'de HARİÇ** — ⏳ hedef (§0) | refresh cookie **artık var**; kalan iş sunucuda seçili tenant'ı bilip access token türetmektir |

**Login sonrası yönlendirme (iki aşamalı model, ADR-0028):** login yalnızca identity token verir; ardından `/me/memberships` sorulup **0 üyelik → `/create-tenant`**, **1 → otomatik `switch-tenant` + `/app`**, **2+ → `/select-tenant`**. `create-tenant` başarıda (V1 senkron `active` tenant, ADR-0016) doğrudan `switch-tenant` + `/app`.

**Neden RSC-veri-çekme hâlâ ertelenir:** refresh cookie'si artık mevcut (§2, uygulandı) ve `cookies()` ile sunucuda okunabilir — ama tenant-scoped access token memory'de ve kısa ömürlüdür; sunucunun onu üretmesi ek olarak **seçili tenant'ı** bilmesini ve `switch-tenant`'ı sunucu tarafında çalıştırmasını gerektirir. Bu zincir kurulana kadar authenticated veri çekme **istemci taraflıdır**. Artık tek eksik cookie değil, sunucu-tarafı tenant seçimidir.

### 3.2 Auth-gate: `middleware.ts` bir güvenlik sınırı DEĞİLDİR

Next.js `middleware.ts`, kimliksiz kullanıcıyı `/app` altından login'e yönlendirmek için web origin'inde yaşayan, `HttpOnly` **olmayan** bir **oturum ipucu çerezine** (`bo_session_hint`) bakar.

> **Neden refresh cookie'sine bakılamaz.** Refresh cookie'si `HttpOnly` + **host-only** (Domain yok) + `Path=/api/v1/auth` ve **API origin'ine** aittir (ADR-0026, §2.3). Middleware **web origin'inde** çalışır ve başka bir origin'in host-only cookie'sini **asla göremez**. Bu yüzden auth-gate ayrı, web origin'inde yaşayan bir ipucu çerezine dayanır.

- **`bo_session_hint`** F2'de başarılı login sonrası **istemci tarafından** set edilir, logout'ta silinir. Güvenlik değeri **yoktur**: yalnızca "muhtemelen girişli" tahminidir.
- **Varlık ≠ geçerlilik.** Middleware token doğrulamaz; ipucunun varlığına bakıp yönlendirir. İpucu kurcalanabilir — bu önemsizdir, çünkü hiçbir yetki kararı ona dayanmaz.
- **Gerçek yetki daima sunucudadır** (API + RLS + permission guard). Middleware bir **UX routing** katmanıdır.
- Bu, backend'in kendi dersini yansıtır: *middleware sırası/varlığı bir güvenlik kararı değildir* (`CLAUDE.md` "Kalıcı ders"). İstemci middleware'ini güvenlik sınırı sanmak, aynı hatanın frontend versiyonudur.

### 3.3 Session state

Tek bir client provider (React-dışı bir modül store'unu `useSyncExternalStore` ile saran) oturum durumunu tutar:

```
SessionState = {
  identityToken?:   string   // memory, 5 dk
  accessToken?:     string   // memory, 15 dk
  currentTenantId?: TenantId // seçili tenant — yeniden türetme için (§5.2)
}
```

Üçü de **yalnızca memory'dedir** ve **sayfa yenilemede kaybolur** (§2 kasıtlı). Refresh token **bu nesnede yoktur** — o tarayıcıda `httpOnly` cookie'dedir; JS ona hiçbir zaman dokunmaz. Reload sonrası bu durum §3.4'teki bootstrap ile yeniden kurulur.

### 3.4 Reload dayanıklılığı: session bootstrap + `bo_last_tenant`

**Sorun.** §3.3 state memory'de olduğundan, `/app`'e hard reload → identity/access token ve `currentTenantId` **sıfırlanır**. Ama `HttpOnly` refresh cookie ve `bo_session_hint` (§3.2) durur; middleware yine geçirir. Kabuk tokensız kalırsa, ilk `/me/memberships` çağrısı 401 alır.

**Çözüm — `AppShell` mount'ta bootstrap** (`bootstrapSession()`), switcher/çocuklar render **edilmeden önce**:
1. Access token zaten memory'deyse (oturum-içi navigasyon) → hazır (senkron başlangıç).
2. Değilse: `POST /auth/refresh` (refresh cookie'siyle) → yeni identity token.
3. **`bo_last_tenant`** çerezi varsa o tenant'a `switch-tenant` → access token + `currentTenantId` yeniden kurulur.
4. Kurulamazsa (geçerli refresh cookie yok) → `bo_session_hint` temizle + `/login`.

**`bo_last_tenant` — non-secret çerez** (`bo_session_hint` ile aynı desen): son seçilen tenant id'sini tutar. **Güvenlik değeri yoktur**: tenant id zaten access token claim'inde açıktır; kurcalayıp başka bir id yazmak hiçbir şey kazandırmaz — `switch-tenant` yine membership doğrulamasından geçer (403). `HttpOnly` değildir (JS yazar/siler); `selectTenant` başarıda yazar, logout siler. Son tenant artık erişilemezse bootstrap sessizce geçer, kullanıcı switcher'dan seçer.

### 3.5 Uygulama kabuğu (dashboard)

`/app/*` layout bir **Server Component**tır; kabuk chrome'u (sidebar + header + bootstrap) bir **Client Component** olan `AppShell`'tedir — sidebar daraltma ve mobil hamburger drawer client state gerektirir. `AppShell` §3.4 bootstrap'ını çalıştırır ve **hazır olana kadar çocukları render etmez** (switcher'ın tokensız 401 almaması için). Header'da **CompanySwitcher** (`/me/memberships`'ten gerçek liste, tıkla → `selectTenant`) ve **UserMenu** (V1'de yalnızca logout — token PII taşımaz, profil verisi ileride `/me` ucuyla). Ana içerik **AI-öncelikli** ama şimdilik **placeholder** (statik AI karşılama kartı + "yakında" modül kartları); gerçek AI ve tenant-scoped veri yok.

---

## 4. Tasarım token sistemi — Apple-vari minimal

### 4.1 Teknik gerçek: Tailwind v4 CSS-first'tür

Proje **Tailwind v4** kullanır (`@tailwindcss/postcss`; `tailwind.config.js` **yoktur**). v4'te tema **CSS-first**'tür: token'lar `globals.css` içinde `@theme` bloğuyla tanımlanır. **SSOT = CSS custom properties.** JS config dosyası oluşturulmaz.

### 4.2 Palet — beyaz / siyah / krem / açık gri

Apple disiplini: **renk değil kontrast**. Tek "vurgu" siyah/beyazdır.

| Token | Light | Dark | Kullanım |
|---|---|---|---|
| `--color-bg` | `#FFFFFF` | `#0A0A0A` | sayfa zemini |
| `--color-surface` | `#FAF9F6` (krem) | `#141414` | kart / panel |
| `--color-border` | `#ECEBE7` (açık gri) | `#262626` | ince ayraç |
| `--color-fg` | `#0A0A0A` | `#F5F5F5` | ana metin |
| `--color-fg-muted` | `#6B6B6B` | `#A3A3A3` | ikincil metin |
| `--color-accent` | `#0A0A0A` | `#F5F5F5` | tek vurgu (kontrast) |
| `--color-danger` | `#B3261E` | `#F2B8B5` | hata / yıkıcı eylem |

### 4.3 Tipografi

- **Font yığını:** `-apple-system, "SF Pro Text", "Inter", "Segoe UI", system-ui, sans-serif` — Apple platformlarında yerel SF fontları bedava gelir; diğerlerinde temiz geometrik alternatif.
- **Ölçek (1.25 oran):** `12 · 14 · 16 · 20 · 24 · 32 · 48` px.
- Başlıklarda sıkı negatif `letter-spacing` (`-0.02em`), gövdede nötr.

### 4.4 Spacing, radius, derinlik

- **Spacing (4px tabanlı):** `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`.
- **Radius:** yumuşak `8–12px`.
- **Derinlik:** gölge yerine ince `--color-border` + minimal `box-shadow` — "düz ama derinlikli".

### 4.5 Kodlama

Hepsi `globals.css` `@theme` bloğunda CSS değişkenidir. Light/dark: `prefers-color-scheme` **+** `:root[data-theme]` (kullanıcı toggle'ı `data-theme` yazar, sistem tercihini ezer). Mevcut `layout.tsx` zaten `dark:` sınıfları ve `color-scheme: light dark` kullanıyor — bu sistem onunla uyumludur.

> Tasarım token'ları **geri döndürülebilir görsel dildir**, mimari kısıt değildir — bu yüzden ayrı ADR'si yoktur (Product Owner kararı). Değişirse yalnızca bu bölüm güncellenir.

---

## 5. API client mimarisi (ADR-0027)

Mevcut `apps/web/src/lib/api-client.ts` deseni korunur (yanıtlar paylaşılan Zod şemaları ile doğrulanır) ve genişletilir.

### 5.1 Tek fetch sarmalayıcı

- Memory'deki access token'ı `Authorization: Bearer <accessToken>` olarak ekler.
- Yanıt gövdesini ilgili Zod şemasıyla doğrular (tip güvenliği çalışma zamanında kanıtlanır — mevcut `fetchHealth` disiplini).
- Hata gövdesini (RFC 7807 `application/problem+json`) tek yerde parse eder.

### 5.2 401 → iki adımlı yenileme → tek tekrar

```
istek → 401
  ↓
refresh()                       → yeni identityToken + rotasyonlu refreshToken (cookie)
  ↓
switch-tenant(currentTenantId)  → yeni accessToken (memory'ye yazılır)
  ↓
orijinal istek TEK KEZ tekrarlanır
  ↓ (yine 401 / refresh başarısız)
session temizlenir → login'e yönlendirme
```

İki adım zorunludur çünkü `refresh` bir access token vermez (§1.3). İstemci `currentTenantId`'yi bu yüzden saklar.

### 5.3 Single-flight yenileme — ADR-0021 tarafından ZORUNLU

Eşzamanlı 401'ler **tek bir yenileme promise'inde birleştirilir**; ikinci istek yeni token'ı bekler, ikinci bir `refresh` başlatmaz.

**Neden pazarlık edilemez:** iki sekme/istek aynı refresh token'ı iki kez sunarsa, ADR-0021'in **yeniden kullanım tespiti** devreye girer ve **tüm token ailesini iptal eder** — kullanıcı sebepsiz yere düşer. ADR-0021 §"yanlış pozitif" bunu açıkça uyarır ve telafiyi *istemci tarafı tekilleştirme* olarak gösterir. Bu, sunucunun güvenlik davranışının istemciye yüklediği bir sorumluluktur.

### 5.4 Hata yönetimi

- **401** → §5.2 akışı.
- **403** → yetki yok; kullanıcıya gösterilir, oturum düşürülmez.
- **422 / 400** → doğrulama/işlem hatası; RFC 7807 `detail` alanı forma bağlanır.
- **429** → hız sınırı; geri sayım gösterilir.
- **5xx / ağ** → tekrar denenebilir hata olarak sunulur.

### 5.5 Tenant-öncesi çağrılar (identity token) + tenant değiştirme dayanıklılığı

Standart `apiFetch` memory'deki **access token**'ı Bearer olarak taşır. Ama bazı uçlar tenant SEÇİLMEDEN, **identity token** ile çağrılır: `GET /me/memberships` (ADR-0028), `POST /tenants`, `POST /auth/switch-tenant`. Bunun için fetch sarmalayıcı bir **`bearer` seçeneği** alır — verilirse access token yerine o (identity token) kullanılır. Bu çağrılar `noRetry`'dır: buradaki 401 "token doldu" değil, akışa özgüdür.

**Tenant değiştirme dayanıklılığı (`selectTenant`).** Uzun oturumda kullanıcı şirket değiştirdiğinde iki gerçek durum ele alınır:
- **Identity token memory'de yok** (reload): refresh cookie'siyle tazelenir.
- **Identity token dolmuş** (5 dk): `switch-tenant` 401 → tazele + **tek retry**.

Bu ikisi olmadan switcher yalnızca "girişten hemen sonra" çalışırdı. Başarıda `bo_last_tenant` (§3.4) yazılır ve `router.refresh()` çağrılır — gerçek tenant-scoped veri geldiğinde otomatik refetch olur.

---

## 6. İlişki: AUTH ve MULTI_TENANT dokümanları

- Bu doküman AUTH modelinin **istemci karşılığıdır**; token üretimi, rotation kuralları, kilitleme orada tanımlıdır ve burada tekrarlanmaz.
- `switch-tenant` akışının sunucu tarafı `MULTI_TENANT_ARCHITECTURE.md` §7.4'tedir; buradaki §1.3/§5.2 onun istemci tetikleyicisidir.
- §2'nin gerektirdiği backend kontrat değişikliği **uygulandı** (2026-07-26); cookie taşıması `AUTH_ARCHITECTURE.md` §10.5'e eklendi ve bu dokümanın §0/§1.2/§2.4/§3.1'i buna göre güncellendi.
- Tenant seçim akışının sunucu tarafı `MULTI_TENANT_ARCHITECTURE.md` §12.4.4 + ADR-0028'dedir (`GET /me/memberships`); buradaki §3.1 (routing) / §5.5 onun istemci karşılığıdır.

> **Bilinen borç:** `apps/web`'de otomatik test **yoktur** (0 spec) — yalnızca typecheck + lint + build. Session bootstrap (§3.4), `selectTenant` retry (§5.5) ve single-flight (§5.3) gibi incelikli mantık test edilmemiştir; en yüksek öncelikli frontend teknik borcudur.

---

## Değişiklik geçmişi

| Sürüm | Tarih | Değişiklik |
|---|---|---|
| 1.0 | 2026-07-24 | İlk sürüm. Karar 1–4 (token saklama, rendering, tasarım token'ları, API client). ADR-0026 ve ADR-0027 ile eş yazıldı. Backend kontrat değişikliği **öngörülür ama uygulanmaz** (§0). |
| 1.1 | 2026-07-26 | §2 cookie taşıması **backend'de uygulandı** (ADR-0026). §0 "hedef" → "artık kod" olarak güncellendi; §1.2 (kontrat), §2.4 (bedel), §3.1 (RSC gerekçesi), §6 senkronlandı. §3.1 RSC-veri-çekme hâlâ hedef. |
| 1.2 | 2026-07-27 | **F1 (Foundation) kodlandı** (`apps/web`). §3.2 auth-gate `bo_session_hint` mekanizmasıyla düzeltildi: refresh cookie'si (host-only, API origin'i) middleware'de okunamaz. Tasarım token'ları (§4), session store + provider (§3.3), single-flight API client (§5) ve layout iskeletleri uygulandı. Gerçek auth formları F2. |
| 1.3 | 2026-08-02 | **F2 (auth ekranları) + Dashboard kodlandı ve canlı doğrulandı.** §3.1 login routing (0/1/2+ üyelik) + tenant kapısı sayfaları · §3.3 memory/reload notu · **§3.4 session bootstrap + `bo_last_tenant`** · **§3.5 dashboard app shell** · **§5.5 identity-token `bearer` + tenant değiştirme dayanıklılığı** · ADR-0028 referansa eklendi. Bilinen borç: web'de otomatik test yok. |
