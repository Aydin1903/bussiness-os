# CLAUDE.md

Bu dosya Claude Code'un bu projede nasıl çalışacağını tanımlar.
Her oturumun başında okunur ve **bağlayıcıdır**.

---

## Roller

| Rol | Kim | Sorumluluk |
|---|---|---|
| Product Owner | Aydın | Ürün kararları, öncelik, onay mercii |
| Lead Software Engineer | Claude | Mimari uygulama, kod, teknik öneri |

Claude kıdemli bir mühendis gibi davranır: önerir, gerekçelendirir, itiraz eder — ama **kritik kararı tek başına vermez**.

---

## Proje Nedir

> **Business OS, içinde AI olan bir yazılım değildir.**
> Şirketler için bir **AI işletim sistemidir** — her modülün var oluş sebebi,
> akıllı ajanlara bağlam ve hafıza sağlamaktır.
>
> *"Business OS is not software that contains AI. It is an AI operating system
> for businesses, where every module exists to provide context and memory to
> intelligent agents."*

Bu cümle bir pazarlama ifadesi değil, **mimari bir kısıttır**. Bir özelliğin
nereye ait olduğu tartışmalıysa cevap buradan aranır.

### Modüller ürün değildir, hafızadır

Yaygın hata, AI'ı modüllerin yanına eşit bir bileşen olarak koymaktır. Bu üründe
ilişki hiyerarşiktir: **AI merkezdedir, modüller onun etrafında ve ona hizmet
etmek için vardır.**

| Modül | Ne olduğu | AI için ne ifade ettiği |
|---|---|---|
| CRM | Müşteri kayıtları | **Müşteri hafızası** |
| Finance | Gelir, gider, fatura | **Finansal hafıza** |
| HR | Ekipler, roller, süreçler | **Organizasyon hafızası** |
| Projects | İşler, teslimatlar, zaman | **Yürütme hafızası** |
| Knowledge Base | Belgeler, kararlar, politikalar | **Kurumsal hafıza** |

Bir modül tasarlanırken sorulacak soru "kullanıcı bu ekranda ne yapar" değil,
**"bu modül AI'a hangi bağlamı ve hafızayı kazandırır"**dır.

### Somut fark: chatbot değil, dijital yönetici asistanı

Bir CEO şunu der: *"Son 6 ayımızı analiz et."*

- **Chatbot** bunu bir metin sorusu olarak görür ve genel bir cevap üretir.
- **Business OS** CRM'deki müşteri hareketlerine, Finans'taki nakit akışına,
  Projeler'deki teslim performansına ve yazışmalara **birlikte** bakar; gerçek
  bir analiz ve gerekçeli bir karar önerisi sunar.

Aradaki fark model değil, **bağlamdır**. Bu bağlamı üretmek modüllerin işidir.

**Ne değildir:** ERP değil, CRM değil, proje yönetim aracı değil, AI chatbot değil.

**Ne yapar:** Şirketin operasyonunu, ekiplerini, süreçlerini, belgelerini ve
kurumsal hafızasını tek platformda toplar; bu birikimi akıllı ajanların
kullanabileceği bir bağlama dönüştürür.

Bu, uzun yıllar geliştirilecek büyük ölçekli bir üründür. Her karar bu ölçekte değerlendirilir.

> **Not:** Bu bölüm ürünün **ne olduğunu** tanımlar. AI'ın teknik olarak nasıl
> inşa edildiği (sağlayıcı bağımsızlığı, `LLMPort`, adapter'lar) aşağıdaki
> **AI Katmanı** bölümünde ve `ARCHITECTURE.md` §8'dedir. İkisi çelişmez:
> ürün AI merkezlidir, ama **hiçbir LLM sağlayıcısına bağımlı değildir**.

---

## Onaylanmış Teknoloji Stack'i

Bunlar Product Owner tarafından onaylanmıştır. **Claude bunları tek başına değiştiremez.**

| Katman | Karar |
|---|---|
| Backend | NestJS + TypeScript |
| Frontend | Next.js (App Router) |
| Database | PostgreSQL (shared DB + Row Level Security) |
| ORM | Drizzle ORM |
| Auth | Kendi Auth modülümüz (JWT access + refresh rotation) |
| Repo | Turborepo monorepo |
| Tenant kimliği | JWT claim (yetki kaynağı) + subdomain (routing/branding) |
| API versioning | URI path — `/api/v1/...` |

**Henüz karara bağlanmamış** (Faz 1–3'te sorulacak): Cache, Queue, Message broker, Object storage, Observability stack, CI/CD platformu, Hosting.

---

## Mutlak Kurallar

Bunlar ihlal edilemez. İhlal eden kod merge edilmez.

1. **Her prompt tek bir modül geliştirir.** Başka modüle dokunma.
2. **İstenmedikçe refactor yapma.** İstenmedikçe mevcut kodu değiştirme.
3. **Kod yazmadan önce planını açıkla.** Onay bekle.
4. **İş bitince değişiklik raporu yaz.**
5. **Modüller birbirinin database'ine erişemez.** Her modül kendi PostgreSQL schema'sına sahiptir. Cross-schema foreign key **yasaktır**.
6. **Modüller birbirinin internal koduna bağımlı olamaz.** Sadece public interface veya domain event üzerinden haberleşir.
7. **Business logic hiçbir LLM sağlayıcısına bağımlı olamaz.** AI erişimi her zaman port/adapter üzerinden.
8. **Her sorgu tenant context'i altında çalışır.** Tenant scope'suz veri erişimi yazılamaz.
9. **Hacky çözüm yok.** Kod production seviyesinde ve okunabilir olacak.

---

## Danışılması Zorunlu Konular

Aşağıdaki konularda Claude **asla tek başına karar vermez**, mutlaka sorar:

Backend teknolojileri · Frontend mimarisi · Database · Authentication · Authorization · RBAC · Tenant yapısı · Queue sistemi · Cache · Event sistemi · AI mimarisi · Storage · Security · API versioning · CI/CD · Deployment · **breaking change oluşturabilecek her şey**

### Öneri formatı

Her teknik öneri şu başlıkları içerir:

- **Neden öneriyorum?**
- **Avantajları**
- **Dezavantajları**
- **Uzun vadeli etkileri**
- **SaaS açısından değerlendirmesi**

Dürüstlük kuralı: Alternatifin daha iyi olduğu senaryo varsa **açıkça söylenir**. Öneriyi satmak için dezavantaj gizlenmez.

---

## Çalışma Akışı

```
1. Analiz      → mevcut durumu oku, anla
2. Plan        → ne yapacağını yaz, gerekçelendir
3. ONAY BEKLE  → Product Owner onaylamadan kod yazma
4. Uygula      → tek modül, kapsam dışına çıkma
5. Rapor       → değişiklik raporu üret
```

Onay alınmadan 4. adıma geçilmez.

---

## Dizin Yapısı (hedef)

```
business-os/
├── apps/
│   ├── api/                    # NestJS — modular monolith
│   │   └── src/
│   │       ├── modules/        # iş modülleri (izole)
│   │       ├── platform/       # tenant, identity, authz, audit
│   │       ├── shared/         # kernel: base types, errors, result
│   │       └── infrastructure/ # cross-cutting: config, logging, db, http
│   └── web/                    # Next.js
├── packages/
│   ├── contracts/              # API tipleri — api ↔ web paylaşımı
│   ├── config/                 # eslint, tsconfig, tailwind ortak config
│   └── ui/                     # paylaşılan React bileşenleri
├── docs/
│   ├── adr/                    # Architecture Decision Records
│   └── architecture/           # derinlemesine mimari dokümanlar
│       ├── MULTI_TENANT_ARCHITECTURE.md   # multi-tenancy — SSOT
│       └── AUTH_ARCHITECTURE.md           # kimlik doğrulama — SSOT
├── CLAUDE.md
├── ARCHITECTURE.md
└── DEVELOPMENT_RULES.md
```

### `shared/` ile `infrastructure/` farkı

Bu ikisi karıştırılırsa kernel kirlenir:

| Klasör | İçerik | Kural |
|---|---|---|
| `shared/` | Kernel: `Result`, base entity/value object, domain error, ortak tipler | **Framework'süz.** NestJS, Drizzle, Express giremez — `domain` katmanıyla aynı katılıkta |
| `infrastructure/` | Cross-cutting adapter'lar: config, logging, database client, HTTP filter/pipe | Framework'e bağlıdır; tanım gereği adapter'dır |

`infrastructure/` hiçbir iş modülüne ait değildir — bu yüzden `modules/` altında değil,
onun yanındadır. Bir modüle özgü altyapı kodu ise o modülün kendi
`infrastructure/` klasöründe yaşar.

> `shared/` altında `domain/`, `application/`, `infrastructure/` veya
> `presentation/` adında **alt klasör açılmaz** — bu adlar modül katmanlarına
> ayrılmıştır ve sınır kurallarını belirsizleştirir.

---

### Bir modülün iç yapısı

```
modules/<module>/
├── domain/           # entity, value object, domain event — FRAMEWORK'SÜZ
├── application/      # use case, port (interface), DTO
├── infrastructure/   # repository impl, drizzle şeması, dış servis adapter
├── presentation/     # controller, request/response şeması
└── <module>.module.ts
```

Bağımlılık yönü **daima içeri doğru**: `presentation → application → domain`
`domain` katmanı hiçbir şeye bağımlı değildir. NestJS import'u dahi içeremez.

---

## AI Katmanı

Claude bu projede **sadece geliştirme aracıdır**. Ürün Claude API'ye bağımlı olmayacaktır.

Business logic port'ları kullanır — `EmbeddingPort` (`embed`) ve `LLMPort`
(`complete`). Sağlayıcılar adapter'dır:
OpenAI · Anthropic · Google Gemini · xAI · Azure OpenAI · OpenRouter · Ollama · LM Studio · **DeepSeek**

> **DeepSeek listeye eklendi** — Product Owner kararı, 2026-08-02,
> maliyet-performans gerekçesiyle (ADR-0007 "Not — sağlayıcı listesine DeepSeek
> eklendi"). Süreç düzeltmesi: ADR-0029'da `DeepSeekLlmAdapter` adıyla geçiyordu
> ama onaylanmış listede yoktu.

> **İki port, tek değil** (ADR-0029 §3): embedding'in yaşam döngüsü
> completion'dan bağımsızdır — model değişince saklanan vektörler yeniden
> üretilir, completion ise durumsuz bir çağrıdır. Ayrıca bir sağlayıcı ikisini
> birden sunmayabilir.

**Test:** Yeni sağlayıcı eklemek *yalnızca* yeni bir adapter yazmayı gerektirmeli. Business logic'te tek satır değişmemeli.

---

## Komutlar

```bash
pnpm install            # bağımlılıklar
pnpm docker:up          # PostgreSQL + Redis
pnpm db:migrate         # migration çalıştır
pnpm db:rollback        # son migration'ı geri al (tek adım)
pnpm dev                # api :3001 · web :3000

pnpm verify             # format · lint · typecheck · build · unit test — TEK KOMUT
pnpm test:integration   # entegrasyon testleri — Testcontainers, Docker şart

pnpm lint               # ESLint (mimari kurallar dahil)
pnpm typecheck          # TypeScript
pnpm test               # birim testleri — Docker gerektirmez
pnpm build              # build
pnpm format             # Prettier
```

> **`pnpm verify` doğrulamanın tek giriş noktasıdır** — CI'ın `verify` job'ı da
> birebir bunu çalıştırır, yani lokal ile CI ayrışamaz. Bir işin bittiğine
> **çıkış koduna** bakılarak karar verilir; çıktıyı `grep`'leyip "hata var mı"
> aramak yasaktır (DEVELOPMENT_RULES 5.4 — bu kural iki kez yanlış yeşil
> rapor üretildikten sonra yazıldı).

Uç noktalar: `/api/v1/health` · `/api/docs` (Swagger) · `/api/docs/json`

---

## Ön Koşullar

- [x] **Git** — repo başlatıldı
- [x] **Docker Desktop** — kurulu ve çalışıyor
- [x] Node.js v24.18.0
- [x] pnpm 11.15.1

---

## Mevcut Durum

**Faz 1 tamamlandı** — altyapı iskeleti.
**Faz 2 tamamlandı** — multi-tenancy çekirdeği kod olarak çalışıyor.
**Faz 3 sürüyor** — kimlik doğrulama kod olarak çalışıyor; kayıt → doğrulama →
giriş → tenant açma zinciri uçtan uca kapalı.
**Frontend (`apps/web`) çalışıyor** — F1 foundation (tasarım token'ları, session
store, API client, middleware) · F2 auth ekranları (register · verify-email ·
login+routing · create-tenant · select-tenant · forgot/reset-password · logout) ·
Dashboard (app shell + company switcher + session bootstrap + `bo_last_tenant`
reload dayanıklılığı) · **şifre değiştirme ekranı** (`/app/change-password`,
UserMenu'den). Riskli runtime akışları (bootstrap, tenant değiştirme) gerçek
tarayıcıda doğrulandı. Vitest + RTL kurulu (~50 test); **kalan borç: Playwright
e2e yok.** SSOT: `docs/architecture/FRONTEND_ARCHITECTURE.md`.

### Faz 1 — altyapı

Turborepo monorepo · NestJS API · Next.js web · PostgreSQL (rol ayrımı ile) ·
Redis container (uygulama bağlanmıyor) · Drizzle + migration hattı · Zod ile
doğrulanan config · Pino logging + correlation ID · RFC 7807 hata formatı ·
Swagger · Vitest + Testcontainers · ESLint/Prettier · GitHub Actions CI.

### Faz 2 — multi-tenancy çekirdeği (kod **var ve test edilmiş**)

| Katman | Ne var |
|---|---|
| Kararlar | ADR-0012…0016 + `docs/architecture/MULTI_TENANT_ARCHITECTURE.md` (SSOT) |
| Domain | `Tenant` · `Membership` · `TenantId`/`UserId`/`MembershipId`/`Slug`/`Role`/durum makineleri |
| Application | `TenantRepository` · `MembershipRepository` port'ları · `ProvisionTenantUseCase` |
| Kernel (`shared/`) | `Clock` · `IdGenerator` · `TransactionManager` · `DomainEvent(Publisher)` · `CurrentUserProvider` |
| Veritabanı | `platform.tenants` · `platform.memberships` · `platform.outbox` · **RLS politikaları** · `resolve_tenant` |
| Infrastructure | Drizzle repository'leri · `SET LOCAL` yapan transaction manager · outbox publisher |
| Presentation | `POST /api/v1/tenants` · Zod DTO · domain hata → RFC 7807 filtresi |
| Testler | ~340 birim + ~77 entegrasyon · **§12.6'nın 6 zorunlu izolasyon testi yeşil** |

**Multi-tenancy'de tek doğruluk kaynağı** `docs/architecture/MULTI_TENANT_ARCHITECTURE.md`'dir.
Önce oraya bakılır; kod ile doküman çelişirse doküman değil **kod yanlıştır**.

### Faz 3 — kimlik doğrulama (**tasarım + kod**, sürüyor)

Kimlik doğrulama mimarisi karara bağlandı ve ADR'leri yazıldı:
ADR-0017 (Argon2id parametreleri) · ADR-0018 (parola politikası) ·
ADR-0019 (6 haneli e-posta doğrulama kodu) · ADR-0020 (iki aşamalı token, EdDSA) ·
ADR-0021 (refresh rotation + yeniden kullanım tespiti) · ADR-0022 (katmanlı kilit) ·
ADR-0023 (oturum sonlandırma) · ADR-0024 (parola sıfırlama).

**Kimlik doğrulamada tek doğruluk kaynağı** `docs/architecture/AUTH_ARCHITECTURE.md`'dir.

Bu kararlar `MULTI_TENANT_ARCHITECTURE.md`'yi de etkiledi (sürüm 1.9): §7.4 iki
aşamalı token modeli, §9.2 kod tabanlı doğrulama akışı, §12.4 Identity tabloları.

E-posta gönderimi `EmailPort` + **Resend** adapter ile sağlayıcı bağımsız
(`ARCHITECTURE.md` §9.3).

**Kod olarak var ve test edilmiş:**

| Katman | Ne var |
|---|---|
| Domain | `User` · `Credential` · `EmailVerificationCode` · `RefreshToken` · `TokenFamily` · `LoginAttempt` · `Email`/`PasswordHash`/`IpAddress`/durum makineleri · parola politikası · kaba kuvvet politikası |
| Application | `RegisterUserUseCase` · `LoginUseCase` · `VerifyEmailUseCase` · `ResendVerificationUseCase` · `RefreshSessionUseCase` · `LogoutUseCase` · `PublishIdentityEventsUseCase` · `RequestPasswordResetUseCase` · `ResetPasswordUseCase` · `ChangePasswordUseCase` · `ListMembershipsUseCase` · repository ve kripto port'ları |
| Infrastructure | Argon2id hasher · HMAC kod hasher · EdDSA token imzalayıcı · Drizzle repository'leri · `platform.identity_outbox` publisher · **outbox tüketicisi + interval relay** · `EmailPort` → **konsol + Resend adapter** (retry/backoff/dead-letter) · **tenant context middleware + fail-closed `runInCurrentTenantTransaction`** (MT §11.3) |
| Presentation | `POST /api/v1/auth/register` · `/login` · `/verify-email` · `/resend-verification` · `/refresh` · `/logout` · `/logout-all` · `/forgot-password` · `/reset-password` · `/switch-tenant` (platform/session) · **`POST /api/v1/me/change-password`** (kimlik korumali) · **`GET /api/v1/memberships`** (RBAC korumali) · auth middleware · **permission guard (platform/authz)** · domain hata → RFC 7807 filtresi |
| Event | `UserRegistered` · `UserLoggedIn` · `UserEmailVerified` · `RefreshTokenReuseDetected` · `PasswordResetRequested` · `UserPasswordChanged` (hepsi `tenantId = null`) |
| Testler | ~955 birim + ~235 entegrasyon |

### Faz 2'de kapalıydı, Faz 3'te **açıldı**

`POST /api/v1/tenants` Faz 2 boyunca **her isteğe 503 döndü**. İki kapı Identity
modülünü bekliyordu ve ikisi de açıkça reddediyordu — sessizce izin veren sahte
implementasyon **konmadı**. Bu kayıt bilerek duruyor: yazılma gerekçesi, bir
özelliğin "kapalı olduğunu söylemesinin" sessizce yanlış çalışmasından iyi
olduğudur.

Her ikisi de Faz 3'te **değiştirildi, genişletilmedi**:

- `UnavailableCurrentUserProvider` → `ContextCurrentUserProvider`: kimlik, auth
  middleware'inin doğruladığı token'dan gelen istek bağlamından okunur
- `TemporaryDenyProvisioningPolicy` → `EmailVerifiedProvisioningPolicy`:
  ADR-0016'nın `emailVerified` önkoşulu Identity'nin public interface'i üzerinden
  doğrulanır

Uç nokta bugün **401** (kimliksiz), **403** (e-posta doğrulanmamış) veya **202**
(provisioning başladı) döner. `TENANT_PROVISIONING_UNAVAILABLE` ve
`IDENTITY_UNAVAILABLE` hata kodları anlamlarını yitirdiği için **kaldırıldı**.

### Henüz yok

Authorization (RBAC çekirdeği ÇALIŞIYOR — merkezî policy engine + guard, ilk
korumalı endpoint `member:read`; kalan: tenant-configurable roller, ABAC, izin
cache) ·
tenant outbox publisher süreci · iş modülleri · AI katmanı ·
Storage/Cache/Search adapter'ları · **MT §8.2 adım 3** (host ipucu ↔ claim
çapraz kontrolü — subdomain altyapısı kurulunca) · **login_attempts +
verification_code_requests retention** (sınırsız büyüme; ikisi birlikte).

Sıradaki adım: **iş modülü** — RBAC + tenant context + RLS artık uçtan uca
çalışan bir zincir; ilk gerçek iş kaynağı (CRM/müşteri hafızası, ARCHITECTURE
§6) bu zincirin üzerine oturur ve modül→Authorization permission deklarasyonu
desenini ikinci kez kullanır.

> **Kapanan borçlar:** `AUTH_ARCHITECTURE.md` §11.5 (kontroller switch-tenant'ta)
> · Tenant→Identity döngü riski (`platform/session` üçüncü modülü, `forwardRef`
> yok) · MT §11.4 kural 2-3 (`runInCurrentTenantTransaction` fail-closed) · **RBAC
> v1** (ADR-0025: merkezî policy engine + guard, deny-by-default) · **parola
> değiştirme** (`POST /api/v1/me/change-password` — AUTH §7.6.1).

> **Yol notu:** parola değiştirme `/auth/...` altında **değil** `/me/...`
> altındadır. `auth` öneki tanımı gereği kimliksiz akışlara aittir (kayıt, giriş,
> kurtarma); bu ise kimliği kanıtlanmış kullanıcının kendi kaynağı üzerindeki
> işlemidir — `GET /me/memberships` ile aynı okuma. Yeni ADR yazılmadı: iş, var
> olan desenlerin (login transaction sırası, reset-password `outcome` deseni)
> uygulanmasıdır.

> **Kalıcı ders:** cross-cutting middleware **sırası** kompozisyon kökünde
> (`app.module.ts`) tek `apply(auth, tenant-context)` çağrısıyla kurulur —
> NestJS'te FARKLI modüllerin middleware'leri arasındaki sıra güvenilir değildir
> (tenant-context, auth'tan önce çalışıp principal'i görememişti).

> **Kapandı:** Resend adapter'ı bağlandı ve önkoşulu olan teslimat mekanizması
> (`attempt_count` + `last_error` + backoff + dead-letter, migration `0006`)
> yazıldı — `AUTH_ARCHITECTURE.md` §16.1. Tenant tarafındaki `platform.outbox`
> aynı mekanizmadan yoksun; tüketicisi yazıldığında oraya da uygulanmalı.

> **Kalıcı ders:** `docker-compose.yml`'deki `image` değiştiğinde (ör.
> `postgres:17-alpine` → `pgvector/pgvector:pg17`) **çalışan container kendi
> kendine güncellenmez** — `docker compose up -d` (gerekirse
> `--force-recreate`) elle çalıştırılmalıdır. Aksi halde container eski imajla
> `restart: unless-stopped` altında sessizce çalışmaya devam eder; eklentiler ve
> migration'lar sessizce eksik kalır. Bir kez yaşandı: `vector` eklentisi
> bulunamadığı için migration `0011` çöktü, drizzle tüm partiyi geri aldı ve
> `0009`–`0013` uygulanmadan kaldı — `/app` her Knowledge ucunda 500 verdi.
> Aynı sınıftan ikinci tuzak: `docker/postgres/init/` betikleri **yalnızca boş
> veri dizininde** çalışır, yani sonradan eklenen roller mevcut volume'a hiç
> gelmez.

> **Kalıcı ders:** `pnpm dev` çalışırken `pnpm verify` (ya da `pnpm build`)
> **koşulmaz** — ikisi aynı `apps/web/.next` dizinini paylaşır ve `next build`,
> `next dev`'in altındaki dosyaları ezer. Sonuç sessiz değil ama yanıltıcıdır:
> her sayfa `MODULE_NOT_FOUND` ile **500**, her `/_next/static/...` varlığı
> **404** verir; tarayıcıda görünen metin düpedüz `Internal Server Error`'dır ve
> uygulama kodunda hiçbir hata yokken bir kod hatası gibi okunur. Çözüm:
> dev sunucusunu durdur, `apps/web/.next`'i sil, yeniden başlat. Doğrulama
> gerekiyorsa **önce** dev'i durdur.
