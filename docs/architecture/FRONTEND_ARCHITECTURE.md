# Frontend Architecture

Business OS — Frontend Mimarisi

> **Durum:** Faz 5 sürüyor — Panel + "Atölye" + modül başına imza rengi + "Asistanım" paneli + bağımlılıksız görselleştirme — ✅ **Kabul edildi**
> **Sürüm:** 1.7
> **Son güncelleme:** 2026-08-12
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

| ADR                                               | Karar                                                 | Durum           |
| ------------------------------------------------- | ----------------------------------------------------- | --------------- |
| [0020](../adr/0020-jwt-structure-and-signing.md)  | İki aşamalı token, EdDSA                              | ✅ Kabul edildi |
| [0021](../adr/0021-refresh-token-rotation.md)     | Refresh rotation + yeniden kullanım tespiti           | ✅ Kabul edildi |
| [0023](../adr/0023-session-termination.md)        | Oturum sonlandırma ve iptal                           | ✅ Kabul edildi |
| [0026](../adr/0026-frontend-token-storage.md)     | Frontend token saklama ve taşıma (hibrit cookie)      | ✅ Kabul edildi |
| [0027](../adr/0027-frontend-rendering-session.md) | Frontend rendering + session/API-client mimarisi      | ✅ Kabul edildi |
| [0028](../adr/0028-my-memberships-query.md)       | `GET /me/memberships` (tenant seçim akışının kaynağı) | ✅ Kabul edildi |

---

## 0. Durum: cookie taşıması artık kod; SSR auth hâlâ hedef

Bu dokümanın kararlarından biri artık **kodda gerçekleşmiştir**, biri hâlâ hedeftir:

| Karar                                                        | Durum                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **§2 — refresh token `HttpOnly` cookie taşıması** (ADR-0026) | ✅ **Backend uyguladı** (2026-07-26). `login`/`refresh` `Set-Cookie` yazar, `refresh`/`logout` cookie'den okur, `logout`/`logout-all` temizler. Bkz. [`refresh-cookie.ts`](../../apps/api/src/modules/identity/presentation/refresh-cookie.ts), `AUTH_ARCHITECTURE.md` §10.5 |
| **§3.1 — RSC ile server-side tenant-scoped veri çekme**      | ⏳ **Hedef.** Tenant-scoped access token'ı sunucuda üretmek ek altyapı ister; V1'de authenticated veri çekme istemci taraflıdır                                                                                                                                              |

Bu sıralama bilinçliydi: token saklama gibi güvenlik kritik bir karar, istemci kodu yazıldıktan sonra değiştirilirse çok daha pahalıdır. Karar önce verildi, backend ona göre kuruldu; frontend artık hazır bir cookie taşımasının üzerine oturacak.

Kalan "hedef" işaretleri (§3.1) açıkça belirtilir.

---

## 1. Bağlam ve kısıtlar

### 1.1 Onaylanmış stack

`CLAUDE.md`'de sabit: **Next.js (App Router)** · **Tailwind CSS v4** · TypeScript · paylaşılan `@business-os/contracts` (Zod şemaları). Tenant kimliği JWT claim'inden (yetki kaynağı), subdomain routing/branding içindir.

### 1.2 Bugünkü backend kontratı — access/identity gövde, refresh cookie

Frontend tasarımının çıpası budur. Access/identity token **JSON gövdesinde** döner; refresh token **`HttpOnly` cookie** ile taşınır (ADR-0026, artık kod):

| Uç                                  | İstemciye dönen                                                         | İstemciden gelen                                         |
| ----------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| `POST /auth/login`                  | gövdede `identityToken` (5 dk) + `Set-Cookie: refresh_token` (HttpOnly) | e-posta + parola                                         |
| `POST /auth/switch-tenant`          | gövdede `accessToken` (15 dk, `tenant` claim'li)                        | `Authorization: Bearer <identityToken>` + `tenantId`     |
| `POST /auth/refresh`                | gövdede **`identityToken`** + `Set-Cookie: refresh_token` (rotasyonlu)  | `Cookie: refresh_token` (gövde YOK)                      |
| `POST /auth/logout` · `/logout-all` | `Set-Cookie` ile cookie temizlenir                                      | `Cookie: refresh_token` (logout) / `Bearer` (logout-all) |
| Korunan uçlar                       | —                                                                       | `Authorization: Bearer <accessToken>`                    |

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

| Token              | Nerede                                        | Ömür                         | Neden orada                                                                   |
| ------------------ | --------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| **refresh token**  | **`httpOnly` + `Secure` + `SameSite` cookie** | 30 gün (kayan), 90 gün tavan | JavaScript **okuyamaz** → XSS onu sızdıramaz                                  |
| **access token**   | **JS memory** (React state / modül değişkeni) | 15 dk                        | kısa ömürlü, tek tenant scope; reload'da kaybolur, sessizce yeniden türetilir |
| **identity token** | **JS memory**                                 | 5 dk                         | yalnızca tenant seçimi için; kalıcı değer taşımaz                             |

**`localStorage` / `sessionStorage` HİÇBİR token için kullanılmaz.** Diske yazılan bir token, herhangi bir script tarafından okunabilir; bu modelin bütün savunması buna izin vermemektir.

### 2.2 Neden cookie yalnızca refresh token için

Bu modelin tehlikeli olan **tek** şeyi 30 gün ömürlü refresh token'dır: çalınırsa saldırgan yeniden kullanım tespit edilene kadar (ADR-0021) hesabı elinde tutar. Onu `httpOnly` cookie'ye koymak JS erişimini tamamen keser — bir XSS açığı bile elde edemez.

Access token memory'de kalır çünkü:

- **Bearer taşıması gerektirir:** korunan uçlar `Authorization: Bearer` bekler (ADR-0020 stateless doğrulama). Cookie'ye konsa CSRF yüzeyi her isteğe yayılırdı; memory + explicit header ise CSRF'e **bağışıktır** (ambient olarak gönderilmez).
- **Maruz kalma penceresi dardır:** XSS sayfa ömrü boyunca memory'deki access token'ı okuyabilir — ama yalnızca 15 dk ve tek tenant scope; refresh token'a **ulaşamaz**, yani kalıcı ele geçirme olmaz.

### 2.3 Cookie sertleştirme ve CSRF

Refresh cookie ambient gönderildiği için CSRF korunur:

| Önlem                              | Değer / neden                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `HttpOnly`                         | JS okuyamaz                                                                            |
| `Secure`                           | yalnızca HTTPS                                                                         |
| `SameSite=Strict` (en fazla `Lax`) | cross-site isteklerde cookie gönderilmez → CSRF'in temel taşıması kesilir              |
| `Path=/api/v1/auth`                | cookie yalnızca yenileme uçlarına gider; her isteğe değil                              |
| Double-submit CSRF token           | `SameSite` desteklemeyen eski tarayıcı ve gereksiz rotasyon tetiklemesine karşı ek kat |

**CSRF neden burada zaten zayıf:** cross-site tetiklenen bir `refresh` çağrısının döndürdüğü yeni token **gövdede** gelir ve saldırganın cross-origin JS'i onu **CORS nedeniyle okuyamaz**. En fazla gereksiz bir rotasyon olur (bu da double-submit token ile kapanır). Yani saldırgana okunabilir bir kazanç bırakılmaz.

### 2.4 Bedeli — dürüstçe

- **Backend kontratı değişti** (2026-07-26, artık kod). `login`/`refresh` `Set-Cookie` yazar; `refresh`/`logout` token'ı cookie'den okur; CORS `credentials: true` zaten vardı. Bu, temiz stateless modeli genişletti — `refresh`/`logout` artık gövde almaz.
- **httpOnly cookie web'e özgüdür.** Gelecekteki mobil/programatik istemci cookie kullanamaz. Backend bu yüzden muhtemelen **iki taşımayı** desteklemek zorunda kalır: web için cookie, diğerleri için gövde. Bu gerçek bir karmaşıklıktır ve ADR-0026'da açıkça kabul edilmiştir. (V1'de yalnızca cookie taşıması uygulandı; gövde taşıması mobil istemci geldiğinde eklenir.)
- **ADR-0020'nin stateless mikroservis hedefiyle çelişmez:** access token yine Bearer, yine durumsuz doğrulanır; yalnızca **refresh taşıması** cookie'ye taşındı.

---

## 3. Rendering stratejisi — Next.js App Router (ADR-0027)

### 3.1 Sayfa sınıflandırması

İki aşamalı token + memory'deki access token, saf RSC (React Server Component) veri çekmeyi sınırlar. Pragmatik bölüm:

| Sayfa sınıfı                                                                | Tip                                                               | Gerekçe                                                                                        |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Pazarlama / public                                                          | **Server Component** (statik)                                     | auth yok; SEO değerli; en hızlı                                                                |
| Auth akışı: `register` · `login` · `verify-email` · `forgot/reset-password` | **Client Component** (bir kısmı server sarmalayıcı `?param` okur) | form state, doğrudan API'ye POST; SSR faydası yok                                              |
| Tenant kapısı: `create-tenant` · `select-tenant`                            | **Client Component**                                              | tenant-öncesi, identity token ile; gerçek veri (`/me/memberships`) client'ta çekilir           |
| Uygulama kabuğu (`/app`)                                                    | **Server layout + Client `AppShell`** (§3.5)                      | access token memory'de; kabuk bootstrap + sidebar/header client'ta                             |
| RSC ile server-side tenant-scoped veri                                      | **V1'de HARİÇ** — ⏳ hedef (§0)                                   | refresh cookie **artık var**; kalan iş sunucuda seçili tenant'ı bilip access token türetmektir |

**Login sonrası yönlendirme (iki aşamalı model, ADR-0028):** login yalnızca identity token verir; ardından `/me/memberships` sorulup **0 üyelik → `/create-tenant`**, **1 → otomatik `switch-tenant` + `/app`**, **2+ → `/select-tenant`**. `create-tenant` başarıda (V1 senkron `active` tenant, ADR-0016) doğrudan `switch-tenant` + `/app`.

**Neden RSC-veri-çekme hâlâ ertelenir:** refresh cookie'si artık mevcut (§2, uygulandı) ve `cookies()` ile sunucuda okunabilir — ama tenant-scoped access token memory'de ve kısa ömürlüdür; sunucunun onu üretmesi ek olarak **seçili tenant'ı** bilmesini ve `switch-tenant`'ı sunucu tarafında çalıştırmasını gerektirir. Bu zincir kurulana kadar authenticated veri çekme **istemci taraflıdır**. Artık tek eksik cookie değil, sunucu-tarafı tenant seçimidir.

### 3.2 Auth-gate: `middleware.ts` bir güvenlik sınırı DEĞİLDİR

Next.js `middleware.ts`, kimliksiz kullanıcıyı `/app` altından login'e yönlendirmek için web origin'inde yaşayan, `HttpOnly` **olmayan** bir **oturum ipucu çerezine** (`bo_session_hint`) bakar.

> **Neden refresh cookie'sine bakılamaz.** Refresh cookie'si `HttpOnly` + **host-only** (Domain yok) + `Path=/api/v1/auth` ve **API origin'ine** aittir (ADR-0026, §2.3). Middleware **web origin'inde** çalışır ve başka bir origin'in host-only cookie'sini **asla göremez**. Bu yüzden auth-gate ayrı, web origin'inde yaşayan bir ipucu çerezine dayanır.

- **`bo_session_hint`** F2'de başarılı login sonrası **istemci tarafından** set edilir, logout'ta silinir. Güvenlik değeri **yoktur**: yalnızca "muhtemelen girişli" tahminidir.
- **Varlık ≠ geçerlilik.** Middleware token doğrulamaz; ipucunun varlığına bakıp yönlendirir. İpucu kurcalanabilir — bu önemsizdir, çünkü hiçbir yetki kararı ona dayanmaz.
- **Gerçek yetki daima sunucudadır** (API + RLS + permission guard). Middleware bir **UX routing** katmanıdır.
- Bu, backend'in kendi dersini yansıtır: _middleware sırası/varlığı bir güvenlik kararı değildir_ (`CLAUDE.md` "Kalıcı ders"). İstemci middleware'ini güvenlik sınırı sanmak, aynı hatanın frontend versiyonudur.

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

`/app/*` layout bir **Server Component**tır; kabuk chrome'u bir **Client Component** olan `AppShell`'tedir — daraltma ve mobil çekmece client state gerektirir. `AppShell` §3.4 bootstrap'ını çalıştırır ve **hazır olana kadar çocukları render etmez** (switcher'ın tokensız 401 almaması için).

**Kimlik SOLDA toplanır.** **CompanySwitcher** (`/me/memberships`'ten gerçek liste, tıkla → `selectTenant`) ve **UserMenu** artık sol menüdedir, başlık şeridinde değil. Gerekçe: çok şirketli bir üründe kullanıcının ilk sorduğu soru "hangi şirketteyim"; cevabı ilk görülen şey olmalı. Masaüstündeki başlık şeridi tümüyle **kaldırıldı** (daraltma düğmesi sol menünün kendi başlığına taşındı) — yüzen panelin ilk satırını harcıyordu; `md` altında yalnızca hamburger için ince bir şerit kalır.

**Sol menü saydamdır, kendi zemini YOKTUR** (§4). Ana içerik artık placeholder değil: `/app` **Panel**'dir — günün AI gözlemi, konuşma akışı, yazma alanı ve hafıza rayı; hepsi gerçek tenant-scoped veriyle.

---

## 4. Tasarım token sistemi — "Atölye": malzeme + derinlik

> **Sürüm 3 — "ATÖLYE" (2026-08-05).** Product Owner üç yön arasından bunu seçti.
> Tez: **premium = MALZEME + DERİNLİK.** Ekran düz bir yüzey değil, katmanlı bir
> masa — zemin sıcak kağıt, panel onun üstünde yüzer, kartlar panelin üstünde
> durur. Işık yukarıdan gelir ve gölgeler **SICAK**: nötr siyah gölge sıcak bir
> paletin üstünde "kirli gri" görünür ve malzeme hissini öldürür.
>
> İmza rengi **amberden TERRACOTTA'ya** geçti (`#B25628` / `#E8935A`).
> Mor/mavi "AI ürünü" klişesi ve sparkle ikonu **bilinçli olarak dışarıda**.
>
> ⚠️ **YÜZEY SIRASI TERSİNE DÖNDÜ.** Açık temada eskiden `surface`, `bg`'den
> KOYUYDU (sol menü zemine gömülüydü); artık `bg` < `surface` < `raised`, yani
> panel zeminden YÜKSELİR. Kodda tek bir sonucu var ve atlanırsa hata üretir:
> **hover durumları `--fill` kullanır**, `surface`/`raised` değil — açık temada
> ikisi de neredeyse beyazdır ve `hover:bg-surface` beyaz kartın üstünde
> GÖRÜNMEZ.

### 4.1 Teknik gerçek: Tailwind v4 CSS-first'tür

Token'lar `globals.css` içinde `@theme inline` ile tanımlanır. **SSOT = CSS
custom properties.** `tailwind.config.js` **yoktur**.

### 4.2 Dört yüzey katmanı

Derinlik gölgeyle değil KATMANLA kurulur:

| Token       | Light     | Dark      | Nerede                      |
| ----------- | --------- | --------- | --------------------------- |
| `--sunken`  | `#F6F3ED` | `#0B0A08` | sağ ray (çukur)             |
| `--bg`      | `#FCFBF8` | `#100E0B` | sayfa zemini                |
| `--surface` | `#F1EEE7` | `#181510` | sol menü, yazma alanı       |
| `--raised`  | `#FFFFFF` | `#211D17` | girdi kutusu (yükseltilmiş) |

### 4.3 Çizgi ve metin kademeleri

| Token             | Light     | Dark      | Kullanım                     |
| ----------------- | --------- | --------- | ---------------------------- |
| `--border`        | `#E6E0D5` | `#2D2820` | ayraç                        |
| `--border-strong` | `#D3CBBD` | `#443C30` | girdi kenarı                 |
| `--fg`            | `#191610` | `#F4F0E8` | ana metin                    |
| `--fg-2`          | `#554F46` | `#B3AA9C` | ikincil metin (`--fg-muted`) |
| `--fg-3`          | `#8D8578` | `#837A6D` | etiket, zaman damgası        |

> `--fg-muted` **korundu** ve `--fg-2`'ye eşitlendi: kodda 54 kullanımı vardı,
> silinseydi mevcut ekranların ikincil metni sessizce kaybolurdu.

### 4.4 ⚠️ Amber İKİ TONDUR

Bu bir tercih değil zorunluluk — tek ton iki işi birden yapamıyor:

| Token         | Light     | Dark      | Ne için                        |
| ------------- | --------- | --------- | ------------------------------ |
| `--accent`    | `#96620F` | `#EAA93C` | **DOLGU** (buton, aktif durum) |
| `--accent-fg` | `#FFFDF9` | `#17140E` | dolgunun üstündeki metin       |
| `--ink`       | `#855508` | `#F3C069` | accent renkli **METİN**        |

Dolgu tonu metin olarak sönük kalıyor; metin tonunun üstünde beyaz yazı
okunmuyordu. **Koyu modda dolgu parlak terracotta + KOYU metin taşır** (Apple'ın
sarı butonlarındaki mantık): o zeminde beyaz yazı okunmaz.

> **Kontrast ölçülerek seçildi, göze göre değil.** İlk terracotta `#B85C2B`'ydi
> ve üstündeki `--accent-fg` metni **4.40:1** veriyordu — WCAG AA sınırının
> (4.5) hemen altında. Bu renk her yerde DOLGU olduğu için hata tek bir
> bileşende değil SİSTEMDEYDİ. `#B25628` → 4.76:1. Metin rampasının dört
> kademesi de dört zeminin (bg/surface/raised/sunken) EN KÖTÜSÜNE göre seçildi;
> 15 metin öğesi × 2 tema tarayıcıda ölçüldü, en düşük oran 5.68.

Yardımcılar: `--tint` / `--tint-2` (çip dolguları), `--glow` (odak halkası),
`--fill` / `--fill-2` (nötr ikincil dolgular).

> ⚠️ **Bu tablodaki üç token artık MODÜLE GÖRE DEĞİŞİR** (2026-08-08, [§4.8](#48-modül-başına-imza-rengi)).
> `--accent` / `--ink` ve türevleri (`--tint`, `--tint-2`, `--glow`) bir modül
> kapsamının içinde o modülün rengini alır — CRM'de çivit mavisi. Yukarıdaki
> terracotta değerleri **kök** değerlerdir ve modül kapsamı dışında (Panel,
> auth ekranları, kabuk) aynen geçerlidir. Değişmeyen tek şey `--accent-fg`:
> on iki rengin hepsi için ölçüldü, tek değer yetiyor.
>
> Terracottanın kendisi `--ai-accent` / `--ai-ink` / `--ai-tint` adıyla ayrıca
> durur ve **hiçbir modül tarafından ezilmez**.

### 4.5 Tipografi — ÜÇ ses, üç aile

- **Ürün konuşur:** `--font-sans` — **Inter**. Nötr, okunur, iddiasız.
- **AI konuşur:** `--font-serif` — **Newsreader**. Sıcak, hümanist, optik boyutlu.
- **Sistem konuşur:** `--font-mono` — **JetBrains Mono**. Zaman, sayı, etiket.

Ayrım kasıtlıdır: **asistanın söylediği ile ürünün söylediği aynı sesle
konuşmamalı** — kullanıcı kime baktığını FONTTAN anlar.

**Optik boyut.** AI sesi `opsz` ekseni taşır: gövdede 16, günün gözleminde 42
(`.ai-voice` / `.ai-voice-lead`). Optik boyut olmadan büyük serif "şişman",
küçük serif "cılız" görünür. Ağırlık (350) Tailwind sınıfıyla değil bu CSS
sınıfında verilir: `font-[350]` yazılabiliyor gibi görünür ama Tailwind onu
font-FAMILY sanar ve kural **sessizce üretilmez**.

**Fontlar `next/font` ile SELF-HOST edilir.** Üçüncü tarafa istek gitmez
(gizlilik), ek DNS/TLS el sıkışması olmaz, `size-adjust` ile fallback ölçüsü
eşitlenip düzen kayması (CLS) sıfırlanır. ⚠️ `latin-ext` altkümesi **zorunlu**:
Türkçe'nin ş/ğ/ı/İ/ç/ö/ü karakterleri `latin`de YOKTUR ve kelimenin ortasında
font değişirdi.

Başlıklarda `-0.02em`; zaman/sayılarda `tabular-nums` (satır zıplamasın).

### 4.6 Hareket

Giriş animasyonu `--ease-rise` (`cubic-bezier(.22,1,.36,1)`) ile sahnelenir:
başlık → gözlem → kaynak → çipler, ~50 ms arayla. Amaç, kullanıcı ekrana
geldiğinde asistanın **o anda konuştuğunu** hissettirmek.

`prefers-reduced-motion: reduce` TÜM animasyonları kapatır — bu bir tercih
değil erişilebilirlik gereğidir.

### 4.7 Ayrıntılar

`::selection` terracotta tonunda · `:focus-visible` terracotta halka (fare
tıklamasında çıkmaz) · ince sıcak kaydırma çubuğu · üç kademeli sıcak gölge
(`--shadow-card` / `--shadow-float` / `--shadow-lift`, her biri iki katman:
yakın temas + geniş ortam) · zemine ılık ışık + **kağıt taneciği** (%3.5 açık,
%5.5 koyu — görünmez ama hissedilir; "malzeme" iddiasının temeli).

> Tasarım token'ları **geri döndürülebilir görsel dildir**, mimari kısıt
> değildir — bu yüzden ayrı ADR'si yoktur (Product Owner kararı). Değişirse
> yalnızca bu bölüm güncellenir.

### 4.8 Modül başına imza rengi

> **Product Owner kararı, 2026-08-08.** İlk uygulama CRM (referans modül).
> Kaynak: `apps/web/src/app/module-colors.css`.

Her modül kendi imza rengini alır. **Bu bölüm, §4'ün geri kalanının aksine
bağlayıcıdır**: yalnızca bugünün görünümünü değil, yazılacak on bir modülün
hepsini bağlayan bir kural tanımlar.

#### Kural: AI'ın sesi her modülde terracottadır

Modülün rengi **yalnızca modülün kendi arayüzünü** boyar — düğmeler, rozetler,
sidebar'ın aktif göstergesi, kartların vurgu çizgisi. **AI'ın konuştuğu hiçbir
yer bu renkten etkilenmez**: Panel'in serif metinleri, günlük özet, müşteri
özeti terracotta kalır ve `--ai-accent` / `--ai-ink` / `--ai-tint` token'larını
kullanır.

Ayrım anlam içindir, süs değil: bir ekranda terracotta görüldüğünde tek bir şey
demektir — _"burada asistan konuşuyor"_. Modülün rengi de terracotta olsaydı o
cümle kurulamazdı, çünkü aynı renk iki farklı şeyi söylerdi. Bu, §4.5'in
tipografi ayrımıyla aynı disiplinin renkteki karşılığıdır: **kullanıcı kime
baktığını fonttan anlar, artık renkten de anlar.**

Aynı sebeple **CRM de terracottayı bırakıp kendi rengini aldı**: referans modül
olarak terracottayı korumak, ilk uygulamada tam olarak bu çakışmayı üretirdi.

> **Kuralın ilk gerçek örneği müşteri özetidir** ([ADR-0032](../adr/0032-company-summary.md),
> 2026-08-09). Kural yazıldığında AI yalnızca Panel'de konuşuyordu ve Panel bir
> modül değil — yani "AI'ın sesi modülün içinde de terracotta kalır" cümlesinin
> somut bir örneği **yoktu**. `/app/crm/[id]` sayfasının en üstündeki serif
> blok o örnektir: sayfanın geri kalanı çivit mavisi, o blok terracotta.
> `components/crm/company-summary.tsx` `bg-ai-accent` / `text-ai-ink` kullanır
> ve `bg-accent` **kullanmaz** — bir test bunu doğruluyor.

#### Palet — on iki modül

Sıra [`ROADMAP.md` §3.5](../ROADMAP.md)'tir.

| #   | Modül            | Pigment       | Açık `--accent` / `--ink` | Koyu `--accent` / `--ink` |
| --- | ---------------- | ------------- | ------------------------- | ------------------------- |
| —   | **AI (sabit)**   | Terracotta    | `#b25628` · `#96481f`     | `#e8935a` · `#f2a874`     |
| 1   | Müşteriler (CRM) | Çivit mavisi  | `#3173af` · `#1d619c`     | `#6bacec` · `#7bbdfe`     |
| 2   | Projeler         | Zeytin        | `#717325` · `#60620c`     | `#a8ac5f` · `#b9bd70`     |
| 3   | Finans           | Yosun yeşili  | `#307d54` · `#1a6b43`     | `#6cb78b` · `#7dc89b`     |
| 4   | Randevu          | Petrol mavisi | `#057a89` · `#006a77`     | `#51b5c5` · `#64c6d7`     |
| 5   | Belge/Sözleşme   | Arduvaz       | `#557380` · `#45626e`     | `#8dacba` · `#9dbdcb`     |
| 6   | Stok/Envanter    | Hardal-bronz  | `#876b1c` · `#785c00`     | `#c2a45a` · `#d3b56b`     |
| 7   | Tedarikçi        | Lavanta-çivit | `#5c6cab` · `#4c5b98`     | `#92a5e8` · `#a3b6fa`     |
| 8   | Teklif/Fatura    | Deniz yeşili  | `#257c6c` · `#076b5b`     | `#64b6a4` · `#75c7b5`     |
| 9   | İK/Personel      | Mürdüm        | `#896096` · `#784f84`     | `#c498d2` · `#d6a9e4`     |
| 10  | Anket            | Çim yeşili    | `#56793e` · `#45672d`     | `#8cb274` · `#9dc385`     |
| 11  | Kampanya         | Menekşe       | `#7665a6` · `#655493`     | `#ae9de2` · `#bfaef4`     |
| 12  | Sadakat          | Gül kurusu    | `#9a5a84` · `#874972`     | `#d792be` · `#e9a3d0`     |

**Renkler göz kararıyla seçilmedi.** Her biri OKLCH'te sabit bir hue'ya
oturtuldu, sonra açıklık taranarak kontrast hedefini tutturan değer alındı.
Hedef "AA'yı geç" (4.5) **değil**, §4.4'te ölçülmüş terracottanın karakterini
tutturmaktı — ilk denemede eşiği geçen ilk değer alınıyordu ve koyu temada
sönük renkler çıkıyordu, terracottanın koyu temadaki 7.7'lik parlaklığı
kayboluyordu.

| Ölçüm                                     | Terracotta | 12 modülün aralığı |
| ----------------------------------------- | ---------- | ------------------ |
| Açık: `--accent-fg` dolgunun üstünde      | 4.76       | **4.82 – 4.88**    |
| Açık: `--ink` en kötü zeminde (`#fff`)    | 5.05       | **4.92 – 5.08**    |
| Koyu: `--accent-fg` dolgunun üstünde      | 7.71       | **7.68 – 7.74**    |
| Koyu: `--ink` en kötü zeminde (`#241d16`) | 8.42       | **8.36 – 8.44**    |
| Metin dışı (çubuk/nokta) — eşik 3.0       | 3.85       | **3.90 – 3.95**    |

Üç seçim kuralı: **(1) turuncu bandı yasak** — terracottanın çevresinde ±35°
koridor boş, çünkü AI'ın sesi ondan bir bakışta ayrılmalı; **(2) akraba modüller
komşu hue alır** — Tedarikçi CRM'in, Teklif/Fatura Finans'ın yanında, çünkü
ROADMAP §3.5 ikisini de o modülün uzantısı olarak tanımlıyor; **(3)
Belge/Sözleşme bilinçli olarak en sönük** — tek düşük doygunluklu renk, çünkü
sözleşme ekranı dikkat çekmek için değil okumak için var.

#### Mekanizma — üç katman

`[data-module='crm']` alt ağacında `--accent` ve türevleri ezilir. **Hiçbir
bileşen değişmez**: `bg-accent` aynı sınıftır, değeri modülündür.

Bu, §4.1'in `@theme inline` kararının doğrudan sonucudur ve derleyici çıktısıyla
doğrulandı — utility'ler ara değişkeni **atlar**:

```css
.bg-accent {
  background-color: var(--accent);
} /* var(--color-accent) DEĞİL */
```

`inline` olmasaydı çalışmazdı: `--color-accent: var(--accent)` kökte çözülür ve
alt ağaç kökün **hesaplanmış** değerini miras alırdı. Aynı sebeple `--tint` /
`--tint-2` / `--glow` da modül kapsamının içinde **yeniden türetilmek zorunda**
— kökte türetilseydi modül `--accent`'i ezse bile tint terracotta kalırdı.

Dosya üç katmandır: **(1)** modül başına değer (12 blok, iki tema yan yana);
**(2)** tema seçimi (**3** blok — modül başına yazılsaydı 36 olurdu ve §4.2'nin
"aynı paletin üç kopyası sapmaya açıktır" uyarısı on iki katına çıkardı);
**(3)** sisteme bağlanma, dönüşüm formülü tek yerde.

#### Kapsam modülün kendi `layout.tsx`'indedir

`data-module` kabuğa değil, modülün kendi layout'una konur
(`app/app/crm/layout.tsx`). Kabuğa koymak orada merkezî bir `pathname → modül`
haritası gerektirirdi; ADR-0025 (permission registry) ve ADR-0031
(`RetrievalContributor`) ile aynı disiplin: **platform mekanizmayı sahiplenir,
modül kimliğini deklare eder.** İkinci sonucu bilinçlidir — sidebar ve kabuk
kapsamın **dışında** kalır, yani "BO" rozeti ve şirket seçici terracotta kalır;
onlar marka, modül değil.

Sidebar satırları kapsamı **kendileri taşır** (`NavItem.module`), böylece
"yakında" satırları da kimliğini gösterebilir ve Panel — bir modül değil, AI'ın
kendi yüzeyi — kapsam taşımaz.

#### ⚠️ Üç bilinen sınır

1. **`data-module` unutulursa hata sessizdir.** Ekran çalışır, yalnızca
   terracotta kalır; ne tip denetimi ne lint yakalar. Karşı önlemler: Slice 9
   denetim listesindeki _"her modül rotası kendi rengini gösteriyor mu"_ maddesi
   ve `sidebar.spec.tsx`'teki kapsam testleri.

2. **Modül rengi iki biçimde yazılır ve ikisi senkron kalmalıdır** — hex
   (`--mc-light`) dolgu/metin için, `R G B` üçlüsü (`--mc-light-rgb`) tint
   türetmesi için. Yan yana durdukları için sapma gözle görülür, ama yeni modül
   eklenirken ikisi **birlikte** güncellenmelidir.

   > **Bu, `color-mix`'ten vazgeçilerek kabul edilen bedeldir — ve derlenmiş
   > çıktıya bakılarak alınmış bir karardır.** İlk yazım `color-mix(in srgb,
var(--mc) 8.5%, transparent)` kullanıyordu; matematiksel olarak aynı
   > sonucu verir ve tek bir kaynak yeterdi. Ama `.next/static/css`'teki
   > derlenmiş CSS'e bakınca Lightning CSS'in davranışı görüldü: girdiler
   > değişken olduğu için karışımı önceden hesaplayamıyor ve
   > `[data-module]{--tint:var(--mc)}` şeklinde bir **geri düşüş** üretip
   > gerçek değeri `@supports` bloğuna alıyor.
   >
   > Yani `color-mix` desteklemeyen bir tarayıcıda `--tint` %8.5'lik ince bir
   > yıkama değil **dolu renk** olurdu; `bg-tint` taşıyan çiplerin zemini
   > tamamen dolar ve üstündeki metin okunmaz hâle gelirdi. Bu, "tint kaybolur"
   > değil "tint YANLIŞ" demektir — sessiz bir bozulma değil, görünür bir hata.
   >
   > `rgb(var(--mc-rgb) / 8.5%)` aynı sonucu verir ve geri düşüş gerektirmez:
   > eğik çizgili alfa sözdizimi Chrome 65 · Safari 12.1 · Firefox 52 (2017–2019).
   > **Böylece kararın tek yeni tarayıcı bağımlılığı tamamen ortadan kalktı** —
   > projede yazılı bir tarayıcı destek matrisi olmadığı için bu, belgelenecek
   > bir bağımlılıktan iyidir.

3. **Renk tek başına bilgi taşımaz.** On iki rengin bir kısmı renk körlüğü
   altında yakınlaşır. Hiçbir yerde renk **tek** ayırt edici olmamalıdır — bugün
   de değildir (aktif satırın ayrıca kalın yazısı ve `aria-current`'ı, "yakında"
   satırının rozeti ve etiketi var). Yeni bir modül ya da bileşen eklenirken bu
   kural hatırlanmalıdır; renkle söylenen her şey ayrıca **yazıyla ya da biçimle**
   de söylenmelidir.

---

### 4.9 "Asistanım" paneli — modül içi AI özetinin standart biçimi

**Bu bölüm bağlayıcıdır.** §4.8 AI'ın modül içinde hangi **renkle** konuştuğunu
söyler; bu bölüm hangi **düzenle** konuştuğunu söyler. İkisi aynı ayrımın iki
yüzüdür ve birlikte okunur.

> **Kural:** Bir modülde bir **varlık** için (müşteri, proje, randevu, fatura…)
> AI özeti gösterilecekse, panel **varsayılan olarak daraltılmış** kurulur:
> tek satırlık **proaktif önizleme** + **genişletilebilir** gövde.

#### 4.9.1 Neden — iki iyi isteğin çarpışması

Bu desen bir tasarım tercihi olarak doğmadı, bir **çarpışmanın** çözümü olarak
doğdu. CRM'in müşteri özeti (ADR-0032) ilk hâlinde koşulsuz açıktı ve gerekçesi
sağlamdı, bugün de geçerlidir:

> Modüller AI'a bağlam sağlamak için vardır (CLAUDE.md'nin kurucu kısıtı).
> Müşteriyi aramadan önce okunacak şey telefon numarası değil, "nerede
> kaldık"tır. Özet küçük bir kutuya alınsaydı ürünün iddiası ile ekranın
> söylediği çelişirdi.

Çarpışan şey o gerekçe değil **bedeliydi**: blok kaydırılan içerikten önce
geliyor, tam genişlik kaplıyor ve `text-[26px]` ile yazılıyordu — yani AI'ı öne
çıkarma isteği, modülün kendi verisini (kimlik kartı, yetkililer, fırsatlar)
ilk ekranın dışına itiyordu. **Bir varlık sayfasında AI'ı öne çıkarmak, o
varlığı görünmez kılarak yapılamaz.**

Daraltmak tek başına çözüm değildir: sessiz bir daralmış panel AI'ı ikinci
sınıf bir yardımcıya indirir ve kullanıcı onu açmayı hiç öğrenmez. Bu yüzden
desenin **iki** yarısı vardır ve ikincisi pazarlık konusu değildir:

| Yarı                   | Ne yapar                                | Atlanırsa ne olur                          |
| ---------------------- | --------------------------------------- | ------------------------------------------ |
| Daraltılmış varsayılan | Varlığın kendi verisi ilk ekranda kalır | AI, modülün verisini ekranın dışına iter   |
| **Proaktif önizleme**  | Kullanıcı tıklamadan bir şey öğrenir    | Panel sessiz bir kutuya döner, hiç açılmaz |

#### 4.9.2 Önizleme neyi gösterir — ve neyi GÖSTEREMEZ

Önizleme **AI'ın gerçekten yazdığı ilk cümledir**, kırpma CSS'e bırakılır
(`min-w-0 truncate`).

⚠️ **Sayı gösterilmez** ("3 gözlemim var" gibi). Bu bilinçli bir yasaktır ve
sebebi mimaridir, üslup değil: özet sözleşmeleri **düz metin** taşır
(`summary: string | null`) ve özet prompt'ları madde işareti üretmeyi **açıkça
yasaklar** (CRM'de: _"görüşmeleri tek tek listeleme"_). Yani sayılabilir bir
"gözlem" birimi hiçbir yerde **yoktur**.

Sayıyı istemcide cümle sayarak türetmek denendi ve **reddedildi**: Türkçe'de
binlik ayracı noktadır ve para bu projede hiçbir noktada `number` olmaz,
sunucunun kanonik dizesi olarak yazılır (Finans'ın bilinen sınırı). `1.500.000 TL`
içeren bir özet üç sahte cümleye bölünür; kullanıcı "5 gözlem" okur, panelde 3
cümle görür ve hata **sessizdir** — hiçbir test yanlış bir sayıyı yakalamaz.

İlk cümlede aynı risk **zararsızdır**: yanlış bölünürse satır yalnızca kısa
görünür, yanlış **bilgi** vermez. Kural bu asimetriden doğar:

> **Önizlemede yanlış olabilecek tek şey, yanlış olduğunda BİLGİ taşımayan şey
> olmalıdır.**

Bir modül gerçek bir sayı göstermek isterse yolu bellidir ve kısa değildir:
sözleşmeye yapılandırılmış bir alan eklenir ve prompt onu üretmeye zorlanır.
İstemcide türetilmez.

#### 4.9.3 Zorunlu davranışlar

1. **Daraltılabilirlik özetin VARLIĞINA bağlıdır**, kullanıcı tercihine değil.
   Özet yoksa panel açık kalır ve mevcut boş-durum davetini gösterir — "özet
   çıkar" eylemini bir tıklamanın arkasına saklamak, hiç özeti olmayan varlıkta
   üretimi **keşfedilemez** kılardı.
2. **Tercih saklanmaz.** Her açılışta daraltılmış başlar. `localStorage` yeni
   bir anahtar, bir göç yolu ve "kapsam kullanıcı mı varlık mı" sorusunu
   getirirdi; önizleme proaktif olduğu için daraltılmış hâl bir kayıp değildir.
3. **Tek tıklama hedefi.** Etiket ile önizleme cümlesi **aynı** düğmenin
   içindedir. Ayrılsalardı görünür en büyük hedef (cümle) hiçbir şey yapmazdı.
4. **`aria-expanded` zorunludur, her iki hâlde.** Ok işareti yalnızca
   görseldir; durum ekran okuyucuya **öznitelikle** söylenir.

   ⚠️ **`aria-controls` yalnızca gövde DOM'dayken verilir.** Gövde koşullu
   çiziliyorsa (daraltılmışken hiç yok), öznitelik koşulsuz verilmemelidir:
   ARIA'da IDREF'in çözülmesi zorunludur ve sarkan bir referans, ekran
   okuyucuya "burada bir gövde var" deyip bulunamayacak bir yere göndermektir.
   Tarayıcı bunu **hata olarak bildirmez** — sessiz bir yanlışlıktır. CRM'de
   bu, gerçek tarayıcıda ölçülerek yakalandı ve düzeltildi; alternatif
   (gövdeyi her zaman çizip `hidden` ile saklamak) da geçerlidir, seçilen yol
   koşullu çizim + koşullu özniteliktir.

5. **Açık gövde KENDİ İÇİNDE kaydırır** — `max-h-[min(46vh,420px)]
overflow-y-auto overscroll-contain`. Özetin uzunluğu modelin elindedir:
   prompt'un "4-5 cümle" demesi bir **sınır değil ricadır**, model uzun yazarsa
   blok yine kaydı ekranın dışına iter. Tavan iki biçimde verilir: kısa ekranda
   oran, uzun ekranda sabit piksel.
6. **Bilgi daraltılmışken kaybolmaz.** Bayatlık (`stale`) gibi karar
   değiştiren sinyaller daraltılmış satırda da yazılır. Saklanırsa kullanıcı
   bayat bir özeti açmadan geçer ve güncel sanar. §4.8'in kuralı burada da
   geçerli: rozet **kelime** taşır, renk tek taşıyıcı değildir.
7. **AI'ın sesi terracottadır** — §4.8, istisnasız. Panel bir modül ağacının
   içindedir ama `--accent` **kullanmaz**: nokta `bg-ai-accent`, rozet
   `border-ai-tint`/`text-ai-ink`, metin `.ai-voice` / `.ai-voice-lead`.

#### 4.9.4 ⚠️ Yükseklik animasyonu YOKTUR — ve bu bir karardır

Animasyon edilen tek şey okun dönüşüdür (`260ms`/`ease-rise`, kartların kalkma
hareketiyle aynı reçete). Gövdenin açılışı **anlıktır**.

`auto` yüksekliğini animasyona sokmak ya JS ölçümü ya `grid-template-rows:
0fr → 1fr` gerektirir. İkincisi yeni bir **tarayıcı taban çizgisi** demektir ve
§4.8 `color-mix`'i tam bu sebeple terk etti: _"projede yazılı bir tarayıcı
destek matrisi olmadığı için bu, belgelenecek bir bağımlılıktan iyidir."_ Aynı
gerekçe burada da geçerlidir. Bir gün destek matrisi yazılırsa karar yeniden
açılabilir.

`prefers-reduced-motion` ayrıca ele alınmaz — `globals.css`'in global kuralı
okun dönüşünü de susturur.

#### 4.9.5 Bugünkü uygulama ve kapsamı

| Modül    | Varlık                                    | Durum                                            |
| -------- | ----------------------------------------- | ------------------------------------------------ |
| CRM      | Müşteri (`CompanySummaryPanel`, ADR-0032) | ✅ Deseni tanımlayan uygulama                    |
| Projeler | —                                         | Modül içi AI yüzeyi v1'de **yok** (ADR-0033 §10) |
| Finans   | —                                         | Modül içi AI yüzeyi v1'de **yok** (ADR-0034)     |

⚠️ **Bileşen henüz `module-kit`'e çıkarılmadı** ve bu bilinçlidir: bugün tek
uygulama vardır ve bir şeyin genel olup olmadığı **ikinci** kullanımda
öğrenilir (`module-kit`'in kendisi bu kuralla doğdu — bkz. `CardHeader`, üç
modülde sekiz kopyadan sonra çıkarıldı). Deseni ikinci kez uygulayan modül
`AssistantPanel`'i `components/module-kit/`'e taşımakla **yükümlüdür**;
üçüncüsünü beklemek üçüncü kopya demektir.

Randevu/Rezervasyon modülünün ADR'i bir varlık özeti öngörüyorsa bu bölüme
referans verir ve `module-kit` çıkarımını kendi slice listesine yazar.

---

### 4.10 Veri görselleştirme — grafik kütüphanesi REDDEDİLDİ (Product Owner kararı, 2026-08-12)

**Bu bölüm bir kararın gerekçesini saklar, bir yasak koymaz.** Bir sonraki
grafik ihtiyacında tartışma sıfırdan yapılmasın diye yazıldı.

> **Karar:** Bugünkü grafik ihtiyaçları **bağımlılıksız** karşılanır. İlk
> uygulama Finans'ın kategori kırılımıdır (`components/finance/category-bars.tsx`,
> `/app/finance/cashflow`).

#### 4.10.1 recharts değerlendirildi ve alınmadı — üç gerekçe

1. **Geçişli bağımlılıklar bu projenin şekline uymuyor.** recharts 3.x on bir
   bağımlılık taşır ve aralarında **`@reduxjs/toolkit`, `react-redux`,
   `immer`, `reselect`** vardır. Yani bir grafik kütüphanesi üzerinden projeye
   **Redux girer** — oysa bu proje bilinçli olarak state kütüphanesizdir (§3.3,
   session store elle yazılmıştır). Kurulum 7.3 MB / açılmış 21.5 MB.
2. **Para bu projede hiçbir noktada `number` olmaz.** Grafik kütüphaneleri
   sayısal domain ister ve biçimlendirmeyi kendi tooltip/axis katmanından
   geçirir; sunucunun kanonik dizesi (`"1500.50"`) orada kolayca kaybolur.
   Elle çubukta parse edilen sayı **yalnızca genişlik yüzdesi** için kullanılır
   ve ekrana hiç yazılmaz.
3. **İş bir `div` genişliğidir.** Çubuk zaten `bg-accent` + `width: %`;
   token'lar birebir Atölye, iki tema ve `[data-module]` alt ağacı bedava
   gelir. Stil kavgası yoktur.

⚠️ **Ölçülmedi.** recharts kurulup bundle etkisi tartılmadı — karar yukarıdaki
üç gerekçeye dayanıyor, ölçüme değil. Kütüphane bir gün gerçekten gerekirse ilk
adım o ölçüm olmalıdır, tahmin değil.

#### 4.10.2 Karar ne zaman yeniden açılır

Bağımlılıksız çizim, **tek tipte** ve **basit** grafikler için yeterlidir. Şu
üçünden biri gerçekleşirse bu bölüm yeniden değerlendirilir:

- **Çeşitlilik:** zaman serisi, çoklu eksen, zoom/brush, kesişen çizgiler.
- **Etkileşim:** tooltip, seçim, tıklanabilir dilim — elle yazıldığında
  erişilebilirliği de elle taşımak gerekir.
- **Tekrar:** aynı çizim mantığının üçüncü kopyası. (İki kopya `module-kit`'e
  çıkarma sinyalidir, kütüphane sinyali değil.)

#### 4.10.3 Kırılım çubuğunun bağlayıcı kuralları

1. **Gelir/gider ayrımını BAŞLIK taşır, renk değil** — §4.8'in renk körlüğü
   kuralı. Etiketler `DIRECTION_LABELS`ten gelir (veri İngilizce, arayüz Türkçe).
2. **`--danger` kullanılmaz.** Gider bir hata değil, dönem gerçeğidir
   (`NetAmount`'ın aynı kararı). Renk kuralı `DirectionPill`den devralınır:
   **gelir imza rengiyle (uyanık), gider sessiz** — çünkü dikkat çekmesi gereken
   şey paranın girdiği yerdir.
3. **Her grup KENDİ içinde normalize edilir.** Gelir ile gideri aynı ölçeğe
   koymak, ADR-0034 §5.1'in "toplanmıyor" ilkesinin görsel karşılığını bozardı:
   iki grup birbirinin payı değildir.
4. ⚠️ **Payda, grubun İLAN EDİLMİŞ toplamıdır** (`income`/`expense`), kategori
   toplamı değil. Kategori toplamına bölmek çubukları her zaman %100'e
   tamamlar, yani kırılım özetin tamamını açıklamasa bile grafik **kusursuz
   görünür**. İlan edilen toplama bölmek eksiği **gösterir**. ADR-0034 §3d
   "Kategorisiz" satırını tam olarak toplamın tutması için kırılımda tutuyor;
   bu payda o garantiyi görünür kılar. Geri düşüş yalnızca ilan edilen toplam
   kullanılamazsa (0 / sayı değil).
5. **Hiçbir satır elenmez** — "Kategorisiz" ve **sıfır tutarlı** olanlar dahil.
   Sıfır satırı çizilir ama çubuğu boş kalır; sıfır olmayan çok küçük bir pay
   `min-w-[2px]` ile sliver alır (görünmez çubuk "bozuk" diye okunur).
6. **Çubuk `aria-hidden`.** Etiket ve tutar gerçek metindir; çubuk bilginin
   ikinci kanalıdır ve ayrıca duyurulması aynı sayıyı iki kez söylemek olurdu.
7. **Sabit etiket kolonu** çubukları hizalar. Esnek bırakılsa her çubuk farklı
   x'te başlar ve uzunlukları gözle karşılaştırılamaz — grafiğin tek işi o.

#### 4.10.4 ⚠️ Kırılım OPT-IN'dir — ekran seçimi bir maliyet kararıdır

`GET /finance/summary`'nin `categories` alanı `nullable` ve **`null` = istenmedi**,
`[]` = istendi ama kayıt yok. Kırılım yalnızca `includeCategories=true` ile gelir
ve sunucuda **ek bir toplama sorgusu** koşar.

Bu yüzden grafik `/app/finance/cashflow`'a kondu, `/app/finance`'e **konmadı**:
işlem listesi kırılımı istemiyor ve istememesinin yazılı gerekçesi var
(_"orada ikinci bir sorgu bedeli boşuna olurdu"_). Bir grafiği "sadece görsel
cila" diye başka bir ekrana taşımak, o ekranın her yüklemesine sessizce bir
sorgu eklemek olabilir — yeni bir grafik yerleştirilirken **önce verinin o
ekrana zaten gelip gelmediği** kontrol edilir.

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

**Neden pazarlık edilemez:** iki sekme/istek aynı refresh token'ı iki kez sunarsa, ADR-0021'in **yeniden kullanım tespiti** devreye girer ve **tüm token ailesini iptal eder** — kullanıcı sebepsiz yere düşer. ADR-0021 §"yanlış pozitif" bunu açıkça uyarır ve telafiyi _istemci tarafı tekilleştirme_ olarak gösterir. Bu, sunucunun güvenlik davranışının istemciye yüklediği bir sorumluluktur.

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

| Sürüm | Tarih      | Değişiklik                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0   | 2026-07-24 | İlk sürüm. Karar 1–4 (token saklama, rendering, tasarım token'ları, API client). ADR-0026 ve ADR-0027 ile eş yazıldı. Backend kontrat değişikliği **öngörülür ama uygulanmaz** (§0).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 1.1   | 2026-07-26 | §2 cookie taşıması **backend'de uygulandı** (ADR-0026). §0 "hedef" → "artık kod" olarak güncellendi; §1.2 (kontrat), §2.4 (bedel), §3.1 (RSC gerekçesi), §6 senkronlandı. §3.1 RSC-veri-çekme hâlâ hedef.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 1.2   | 2026-07-27 | **F1 (Foundation) kodlandı** (`apps/web`). §3.2 auth-gate `bo_session_hint` mekanizmasıyla düzeltildi: refresh cookie'si (host-only, API origin'i) middleware'de okunamaz. Tasarım token'ları (§4), session store + provider (§3.3), single-flight API client (§5) ve layout iskeletleri uygulandı. Gerçek auth formları F2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 1.3   | 2026-08-02 | **F2 (auth ekranları) + Dashboard kodlandı ve canlı doğrulandı.** §3.1 login routing (0/1/2+ üyelik) + tenant kapısı sayfaları · §3.3 memory/reload notu · **§3.4 session bootstrap + `bo_last_tenant`** · **§3.5 dashboard app shell** · **§5.5 identity-token `bearer` + tenant değiştirme dayanıklılığı** · ADR-0028 referansa eklendi. Bilinen borç: web'de otomatik test yok.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 1.5   | 2026-08-08 | **Modül başına imza rengi** (Product Owner kararı; yeni [§4.8](#48-modül-başına-imza-rengi), ilk uygulama CRM). On iki modülün paleti OKLCH'te hue'ya oturtulup açıklık taranarak seçildi; hedef AA eşiği değil §4.4'te ölçülmüş terracottanın karakteriydi. **Kural bağlayıcıdır: AI'ın sesi her modülde terracotta kalır** (`--ai-accent`/`--ai-ink`/`--ai-tint`, hiçbir modül ezemez) — CRM dahil her modül kendi rengini alır, çünkü referans modülün terracottayı koruması tam da ayrımı yok edecek çakışmayı üretirdi. Mekanizma `[data-module]` alt ağaç override'ıdır ve §4.1'in `@theme inline` kararının doğrudan sonucudur (derleyici çıktısıyla doğrulandı: `bg-accent` → `var(--accent)`, ara değişken atlanır); kapsam modülün kendi `layout.tsx`'indedir, kabukta değil. **§4.4'e uyarı eklendi** — oradaki `--accent`/`--ink` artık kök değerleridir, modül içinde değişir. Üç bilinen sınır kayda geçti: `data-module` unutulursa hata sessizdir · **modül rengi iki biçimde yazılır** (hex + `R G B`) ve senkron kalmalıdır — bu, `color-mix`'ten vazgeçilerek kabul edilen bedeldir: derlenmiş CSS'e bakınca Lightning CSS'in `color-mix` için ürettiği geri düşüşün `--tint`'i ince bir yıkama yerine **dolu renk** yaptığı görüldü (çip zeminleri okunmaz olurdu), `rgb(… / %)` ise geri düşüş gerektirmiyor ve kararın tek tarayıcı bağımlılığı böylece ortadan kalktı · **renk tek başına bilgi taşımaz** (renk körlüğü). Not: `1.4` (Atölye) başlıkta kullanılmış ama bu tabloya hiç girmemişti — geçmiş yeniden yazılmadı, ROADMAP §8'in "doküman sürüm numarası denetimi" kalemine bir örnek daha.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 1.6   | 2026-08-12 | **"Asistanım" paneli** — yeni [§4.9](#49-asistanım-paneli--modül-içi-ai-özetinin-standart-biçimi): bir modülde bir **varlık** için AI özeti gösterilecekse **varsayılan daraltılmış + tek satırlık proaktif önizleme + genişletilebilir gövde** ile kurulur. Desen bir tercih olarak değil bir **çarpışmanın** çözümü olarak doğdu: CRM'in koşulsuz açık özeti (ADR-0032) modülün kendi verisini ilk ekranın dışına itiyordu, ama sessiz bir daraltma da AI'ı hiç açılmayan bir kutuya çevirirdi — bu yüzden desenin **iki** yarısı vardır ve önizleme pazarlık konusu değildir. **⚠️ Önizlemede SAYI gösterilmesi yasaklandı** ("3 gözlemim var"): özet sözleşmeleri düz metin taşır (`summary: string \| null`) ve özet prompt'ları madde işaretini **açıkça yasaklar**, yani sayılabilir bir "gözlem" birimi hiçbir yerde yoktur; istemcide cümle sayarak türetmek **denendi ve reddedildi** — Türkçe'de binlik ayracı noktadır ve para bu projede hiçbir noktada `number` olmaz, `1.500.000 TL` içeren bir özet üç sahte cümleye bölünür ve hata **sessizdir**. Önizleme AI'ın gerçek ilk cümlesidir: yanlış bölünürse yalnızca kısa görünür, yanlış **bilgi** vermez — kural bu asimetriden doğar. Yedi zorunlu davranış kayda geçti (daraltılabilirlik özetin **varlığına** bağlıdır, tercihe değil · tercih saklanmaz · tek tıklama hedefi · `aria-expanded`/`aria-controls` · gövde **kendi içinde** kaydırır, `max-h` iki biçimde verilir · **bayatlık daraltılmışken de yazılır**, yoksa kullanıcı bayat özeti güncel sanar · AI'ın sesi §4.8 gereği terracotta kalır). **⚠️ Yükseklik animasyonu YOKTUR** ve gerekçe §4.8'in `color-mix` kararından birebir devralındı: `grid-template-rows: 0fr→1fr` yeni bir tarayıcı taban çizgisi demekti, animasyon edilen tek şey okun dönüşüdür. Bileşen `module-kit`'e **henüz çıkarılmadı** (tek uygulama var, genellik ikinci kullanımda öğrenilir); deseni ikinci kez uygulayan modül çıkarmakla **yükümlüdür**. §4.9.5 üç modülün durumunu tabloya bağlar — Projeler ve Finans'ta modül içi AI yüzeyi v1'de **yok**.                                                            |
| 1.7   | 2026-08-12 | **Veri görselleştirme: grafik kütüphanesi REDDEDİLDİ** (Product Owner kararı; yeni [§4.10](#410-veri-görselleştirme--grafik-kütüphanesi-reddedildi-product-owner-kararı-2026-08-12)). İlk uygulama Finans kategori kırılımı (`category-bars.tsx`, `/app/finance/cashflow`). recharts değerlendirildi ve alınmadı — üç gerekçe: **on bir geçişli bağımlılık** (aralarında `@reduxjs/toolkit`, `react-redux`, `immer`, `reselect`, yani state kütüphanesiz bir projeye **Redux girmesi**; 7.3 MB kurulum / 21.5 MB açılmış) · **para hiçbir noktada `number` olmaz** ve kütüphane biçimlendirmeyi kendi tooltip/axis katmanından geçirir, sunucunun kanonik dizesi orada kaybolur · **iş bir `div` genişliğidir** ve token'lar/iki tema/`[data-module]` bedava gelir. ⚠️ **Bundle etkisi ÖLÇÜLMEDİ** — karar gerekçeye dayanıyor; kütüphane gerçekten gerekirse ilk adım ölçüm olmalıdır. §4.10.2 kararın yeniden açılma koşullarını sayıyor (çeşitlilik · etkileşim · **üçüncü** kopya; ikinci kopya `module-kit` sinyalidir). §4.10.3 yedi bağlayıcı kural: gelir/gider ayrımını **başlık** taşır renk değil · `--danger` yok, renk kuralı `DirectionPill`den devralınır (gelir uyanık, gider sessiz) · her grup **kendi içinde** normalize (ortak ölçek ADR-0034 §5.1'in "toplanmıyor" ilkesini bozardı) · ⚠️ **payda grubun İLAN EDİLMİŞ toplamıdır**, kategori toplamı değil — kategori toplamına bölmek eksik bir kırılımı **kusursuz gösterirdi**, ilan edilene bölmek eksiği **görünür** kılar ve ADR-0034 §3d'nin "Kategorisiz" garantisini ekranda kanıtlar · hiçbir satır elenmez (sıfır tutarlı dahil; sıfır boş çubuk, çok küçük pay `min-w-[2px]` sliver) · çubuk `aria-hidden`, sayı ve etiket gerçek metin · sabit etiket kolonu çubukları hizalar. **§4.10.4 kalıcı ders:** `categories` **opt-in**'dir (`null` = istenmedi) ve `includeCategories=true` sunucuda ek toplama sorgusu koşar — grafik bu yüzden `/app/finance`'e **konmadı**, işlem listesinin kırılımı istememesinin yazılı gerekçesi var. Bir grafiği "sadece görsel cila" diye taşımak, o ekranın her yüklemesine sessizce bir sorgu eklemek olabilir. |
