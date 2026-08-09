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
**Faz 3 tamamlandı** — kimlik doğrulama; kayıt → doğrulama → giriş → tenant açma
zinciri uçtan uca kapalı. Devreden tek kalem **Authorization'ın kalanı**
(tenant-configurable roller · ABAC · izin cache) ve o bilinçli olarak
**backlog**tadır: üçü de bugün varsayımsal ihtiyaçtır (ROADMAP §1.1).
**Faz 4 tamamlandı** — Knowledge modülü + AI Context Engine; kapanış denetimi
2026-08-05'te yapıldı (aşağıda).
**Faz 5 başladı** — CRM modülü + Context Engine'in platforma yükselmesi
(ADR-0031 kabul edildi, 2026-08-05). Slice 0.5 yazıldı; kalanı sürüyor (aşağıda).

**Frontend (`apps/web`) çalışıyor** — auth ekranları (register · verify-email ·
login+routing · create-tenant · select-tenant · forgot/reset-password · logout ·
change-password) · **Panel** (`/app`) · **arşiv** (`/app/knowledge`) ·
**onboarding** (`/app/onboarding`). Riskli runtime akışları (bootstrap, tenant
değiştirme, tüm auth zinciri) gerçek tarayıcıda doğrulandı. Vitest + RTL
**143 test**; **kalan borç: Playwright e2e yok.**
SSOT: `docs/architecture/FRONTEND_ARCHITECTURE.md`.

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

### Faz 4 — Knowledge modülü + AI Context Engine (**kod var ve test edilmiş**)

Projenin **ilk gerçek iş modülü** ve `platform` dışında açılan **ilk şema**.
Kararlar: ADR-0029 (Knowledge + Context Engine v1) · ADR-0030 (konuşma hafızası,
günlük rapor, onboarding).

| Katman | Ne var |
|---|---|
| Domain | `Note` · `NoteChunk` · `Conversation` · `Message` · chunking · parola benzeri değil ama `RateLimitPolicy` (saatlik kova) · `FollowUpParser` |
| Application | `CreateNoteUseCase` · `AskKnowledgeUseCase` · `ListNotesUseCase` · `NotesExistUseCase` · `CountUnindexedUseCase` · `ReindexNotesUseCase` · `GenerateDailyReportUseCase` · `EmbeddingPort` + `LLMPort` (ADR-0029 §3: **iki ayrı port**) |
| Veritabanı | `knowledge` şeması — `notes` · `note_chunks` (pgvector `vector(1536)` + HNSW) · `conversations` · `messages` · `daily_report_runs` · `rate_limits`; hepsi **FORCE RLS** |
| Infrastructure | OpenAI embedding adapter · DeepSeek LLM adapter · Drizzle repository'leri · `DailyReportWorker` (claim → özetle → işaretle) · iki dar rol (`businessos_report_worker`) |
| Presentation | `POST /knowledge/notes` · `POST /knowledge/ask` · `POST /knowledge/reindex` · `GET /knowledge/notes` · `/notes/exists` · `/notes/unindexed` · `/daily-report` — **yedisi de RBAC korumalı** |
| Frontend | `/app` Panel (akış + yazma alanı + hafıza rayı) · `/app/knowledge` arşiv · `/app/onboarding` (7 soru) · onarım banner'ı |
| Testler | **1237 birim** (api) · **408 entegrasyon** · **143 birim** (web) |

**Faz 4 kapanış denetimi yapıldı (2026-08-05).** Yedi uç gerçek isteklerle
gezildi (200/401/403/429), RLS izolasyonu iki tenant'la doğrulandı, üç dar rolün
Constraint 2 sözleşmesi hem dev hem sıfırdan kurulumda 40/40 geçti, sıfırdan
kurulum ayrı container'da baştan sona çalıştı. Denetim üç belge sapması ve bir
sözleşme tutarsızlığı buldu; dördü de kapatıldı.

### Tasarım: "Atölye" (2026-08-05)

Frontend tasarım dili değişti — imza rengi **amberden terracottaya**, kabuk
zeminden ayrıldı ve içerik yüzen bir yüzey oldu. Üç ses üç aile: Inter (ürün),
Newsreader (AI), JetBrains Mono (sistem); üçü de `next/font` ile self-host.
SSOT: `docs/architecture/FRONTEND_ARCHITECTURE.md` (v1.5).

### Modül başına imza rengi (2026-08-08) — **bağlayıcı**

Her modül kendi imza rengini alır (on iki renk, FRONTEND §4.8'de ölçülmüş
palet; ilk uygulama CRM = **çivit mavisi**). Bu, geri döndürülebilir bir görsel
tercih değil, yazılacak on bir modülü de bağlayan bir kuraldır:

> **AI'ın sesi HER MODÜLDE terracotta kalır.** Modülün rengi yalnızca modülün
> kendi arayüzünü boyar (düğme, rozet, sidebar aktif göstergesi, kart vurgu
> çizgisi). AI'ın konuştuğu her yer — Panel'in serif metinleri, günlük özet,
> müşteri özeti — `--ai-accent` / `--ai-ink` kullanır ve **hiçbir modül bunları
> ezemez**.

Gerekçe süs değil anlam: bir ekranda terracotta görüldüğünde tek bir şey
demelidir — *"burada asistan konuşuyor"*. Bu yüzden **CRM de terracottayı
bıraktı**; referans modülün onu koruması tam olarak bu ayrımı yok ederdi.

Mekanizma `[data-module]` alt ağaç override'ıdır ve kapsam **modülün kendi
`layout.tsx`'indedir**, kabukta değil (ADR-0025/0031 disiplini: platform
mekanizmayı sahiplenir, modül kimliğini deklare eder). Yeni modülün rengi iki
satırdır: `module-colors.css`'te bir palet bloğu + layout'ta bir attribute.

⚠️ `data-module` unutulursa hata **sessizdir** — ekran çalışır, terracotta
kalır; lint yakalamaz. Renk ayrıca hiçbir yerde **tek** bilgi taşıyıcısı
olmamalıdır (renk körlüğü). Modülün rengi iki biçimde yazılır (hex + `R G B`)
ve ikisi senkron kalmalıdır — `color-mix` derlenmiş çıktıda kötü bir geri düşüş
ürettiği için bilinçli olarak terk edildi (FRONTEND §4.8, üç bilinen sınır).

### Henüz yok

Authorization'ın kalanı (RBAC çekirdeği ÇALIŞIYOR — merkezî policy engine +
guard; kalan: tenant-configurable roller, ABAC, izin cache) · Faz 5 iş modülleri
· Storage/Cache/Search adapter'ları · **MT §8.2 adım 3** (host ipucu ↔ claim
çapraz kontrolü — subdomain altyapısı kurulunca) · **retention: ALTI tablo**
(ROADMAP §8.4) · **not detay ucu** (ADR-0029 bilinen sınır) · **streaming**
(ROADMAP §8.3) · **6. dar rol genelleştirmesi** (ADR-0030 §2.4 — geldiğinde
ertelenemez) · **boş/yükleniyor/hata durumlarının Atölye diline geçirilmesi** ·
**web'in tam mobil turu** (kırılma noktaları hazır; alt gezinme, 44px dokunma
hedefleri, klavye/`dvh` davranışı kaldı).

### Faz 5 — CRM + Context Engine'in platforma yükselmesi (**sürüyor**)

Karar: **ADR-0031** (kabul edildi, 2026-08-05). Faz 5'in ilk modülü CRM'dir.
ADR yalnızca bir modül tanımlamıyor — Faz 4'ün Knowledge içinde biriken
platform kodunu dışarı taşıyor. Üç ana karar:

1. **Port paylaşılır, veri paylaşılmaz.** `EmbeddingPort`/`LLMPort` → `shared/`,
   adapter'lar → `infrastructure/ai/`, chunking → `shared/`. CRM'in kendi
   `crm.interactions`/`interaction_chunks` tabloları olur. CRM görüşmelerini
   `knowledge.notes`'a yazmak Kural 6 açısından yasaldı ama cross-schema FK
   yasak olduğu için **silme cascade'i yazılamazdı** — silinen müşteri AI
   hafızasında yaşamaya devam ederdi.
2. **Tek `POST /api/v1/ask`**, modül başına `/ask` DEĞİL. Retrieval ucu
   `platform/context`'e taşınır; modüller `RetrievalContributor` ile katkı
   verir ve **çağıranın izinlerine göre elenir** (yoksa birleşik hafıza
   yetkilendirmeyi delen bir yan kapı olurdu; RLS bunu yakalamaz). CRM iki
   katkıcı kaydeder: anlamsal (görüşmeler) + **yapısal** (pipeline).
3. **Kaynak bazlı izinler** — `company`/`contact`/`opportunity`/`interaction` ×
   `read`/`write`/`delete`. `crm:read` bir *modül* iznidir ve ADR-0025'in
   `resource:action` modelini ilk kullanımda bozardı.

Üç migration: `platform.rate_limits` · `platform.conversations`/`messages` ·
`crm.*`. İki breaking change onaylandı: `POST /knowledge/ask` → `POST /ask`,
`knowledge:ask` → `context:ask`. ADR-0029'da dört, ADR-0030'da iki karar
**superseded** — metinler silinmedi, üzerlerine not eklendi.

| Slice | Ne | Durum |
|---|---|---|
| 0 | Doküman hizalaması | ✅ |
| 0.5 | **AI gözlemlenebilirliği** — her sağlayıcı çağrısı `event: "ai.call"` satırı bırakır | ✅ |
| 1 | Port'lar `shared/`'a, adapter'lar `infrastructure/ai/`'ya | ✅ |
| 2 | `platform.rate_limits` | ✅ |
| 3 | `platform/context` + `POST /ask` + konuşma tablolarının taşınması | ✅ |
| 4–7 | CRM: şema+şirket/kişi · fırsatlar+takipler · görüşmeler+embedding · iki katkıcı | ✅ |
| 8 + 9-B | Frontend CRM ekranları (5 rota, 33 bileşen) + düzen/odak çalışması | ✅ |
| — | **Modül başına imza rengi** — CRM referans modül (FRONTEND §4.8) | ✅ |
| Katman 2 | **Müşteri özeti** (ADR-0032) — istek-tetiklemeli önbellek, worker değil | ✅ |
| 9 | Kapanış denetimi | ⏳ |

> ### Slice 9 kapanış denetimi — biriken kontrol listesi
>
> Faz 4'ün denetimi gibi **gerçek isteklerle ve gerçek tarayıcıda** yapılır.
> Buraya iş ilerledikçe madde eklenir; denetim günü listenin tamamı gezilir.
>
> - [ ] **Her modül rotası kendi rengini gösteriyor mu** — `data-module`
>   unutulduğunda hata **sessizdir**: ekran çalışır, yalnızca terracotta kalır
>   ve ne lint ne tip denetimi yakalar. Bugün tek modül rotası CRM'dir
>   (`/app/crm` ve dört alt rotası); her biri açık **ve** koyu temada gezilir.
> - [ ] **AI'ın sesi modül içinde terracotta kalıyor mu** — Panel'in noktaları
>   ve kaynak atfı, **ve müşteri özeti** (`/app/crm/[id]` en üstteki serif
>   blok): CRM çivit mavisiyken o blok terracotta kalmalı. Bu, §4.8 kuralının
>   tek gerçek örneğidir — yanlışsa kural yazılı ama uygulanmamış demektir.
> - [ ] Yedi CRM ucu gerçek isteklerle (200/401/403/429), iki tenant'la RLS
>   izolasyonu, dar rollerin sözleşmesi — Faz 4 denetiminin CRM karşılığı.

> **Slice 0.5 notu:** AI maliyet takibi ROADMAP §8.1'de "Faz 4'e kadar
> netleşmeli" diye işaretliydi ve Faz 4 o kalem kapanmadan kapandı. Faz 5 onu
> kötüleştiriyor (CRM ikinci embedding üreticisi, yapısal katkıcı her soruya
> sabit token ekliyor, fan-out tek `/ask`'i N kaynağa dokunduruyor) — bu yüzden
> ölçüm koda dokunmadan **önce** yazıldı. Kapsam dar: pano yok, alarm yok,
> bütçe limiti yok. Oran sınırı hâlâ istek **sayısını** bağlıyor, token
> harcamasını değil — o bilinen sınır artık **ölçülebilir**, hâlâ zorlanmıyor.

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

### ⚠️ Railway prod CANLI ve her push oraya gidiyor (2026-08-09)

Faz 5 kapanış denetiminde öğrenildi ve **oturum başında bilinmesi gerekir**:

- **Servis ayakta:** `bussiness-os-production.up.railway.app` · proje
  `attractive-tenderness` · PostgreSQL + volume.
- **GitHub otomatik dağıtımı AÇIK.** `feature/tenant-multi-tenancy-core`'a
  yapılan **her `git push` prod'a dağıtım tetikler** ve
  `railway.api.json`'un `preDeployCommand`'i `db:preflight && db:migrate`
  çalıştırır — yani **push migration uygular**. Denetim bunu ancak dağıtım
  gerçekleştikten sonra fark etti; "servis durduruldu" bilgisi güncel değildi.
  Product Owner kararı: **açık kalsın**, ama migration içeren bir push'tan
  önce açıkça haber verilir.
- **Prod veritabanı doğrulandı (yalnızca okuma):** beş rol mevcut,
  `businessos_owner` **NOSUPERUSER**, `businessos_app` bypassrls **değil**,
  20/20 migration uygulanmış, altı CRM tablosu `RLS + FORCE`, `vector` 0.8.6.
  **Fail-closed kanıtlandı:** tenant context'siz sorgu sessizce boş dönmüyor,
  `unrecognized configuration parameter "app.current_tenant_id"` ile
  **hata veriyor**. `FORCE RLS` tablo sahibini de bağlıyor.
- Prod'da iş verisi **yok** (1 kullanıcı, 1 tenant, 0 CRM kaydı).

> #### 🔴 `NODE_ENV` prod'da hâlâ `development` — ve tek başına çevrilemez
>
> Zincir `env.schema.ts`'te ve bilinçlidir:
> `NODE_ENV=production` → `EMAIL_PROVIDER=console` **yasak** (P1: konsol
> adapter'ı doğrulama kodlarını loglar) → `EMAIL_PROVIDER=resend` →
> `RESEND_API_KEY` **ve** `EMAIL_FROM` zorunlu.
>
> Railway'de üçü de tanımlı değil. `NODE_ENV=production` yazmak API'yi
> **açılışta düşürür**. Önce Resend kimlik bilgileri Railway'e girilmeli;
> bu bir **sır aktarımıdır ve Product Owner'ın kendi yapacağı iştir**.
>
> `SWAGGER_ENABLED` denetimde `false` yapıldı — `/api/docs` artık 404
> (öncesinde uç sözleşmesi internete açıktı).

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
