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
**Faz 5 sürüyor** — on iki iş modülü (ROADMAP §3.5).
**1. modül CRM ✅ bitti** ve **prod'da canlı** (ADR-0031 + ADR-0032; kapanış
denetimi 2026-08-09). Aynı işte Context Engine platforma yükseldi.
**2. modül Projeler ✅ bitti** (ADR-0033; altı slice, kapanış denetimi
2026-08-10). Cross-modül referans deseni ilk kez çalıştı ve `POST /ask` artık
**dört kaynağı** birleştiriyor.
**3. modül Finans ✅ bitti** (ADR-0034; yedi slice, HAFİF kapanış denetimi
2026-08-12). `POST /ask` izin filtresi ilk kez **gerçekten sınandı** ve
CLAUDE.md'nin CEO örneği **dört modülle tam karşılandı**.
**4. modül Randevu/Rezervasyon ✅ TAMAMEN KAPANDI** (ADR-0035; altı slice, HAFİF
kapanış denetimi 2026-08-13, **prod doğrulaması 2026-08-14** — `82c8ad3`,
health 200, migration 27'de sabit). Anlatısal içerik ilk kez **parçalanmadan**
embed edildi (chunk tablosu yok) ve `POST /ask`in **top-K havuzu ilk kez doldu**
— dokuz katkıcı, sekiz yuva. Denetimin bulduğu `DisclosableProblem` kusuru ve
`platform/context` alt-borcu **kapandı**. Dördü de aşağıda.

**Frontend (`apps/web`) çalışıyor** — auth ekranları (register · verify-email ·
login+routing · create-tenant · select-tenant · forgot/reset-password · logout ·
change-password) · **Panel** (`/app`) · **arşiv** (`/app/knowledge`) ·
**onboarding** (`/app/onboarding`) · **dört modülün ekranları** (`/app/crm` ·
`/app/projects` · `/app/finance` · `/app/appointments`). Riskli runtime akışları
(bootstrap, tenant değiştirme, tüm auth zinciri) gerçek tarayıcıda doğrulandı.
Vitest + RTL **349 test**; **kalan borç: Playwright e2e yok.**
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

### Tasarım: "ODA" (2026-08-17, ADR-0038) — **Atölye'nin yerini aldı**

**Her modül kendi ışığı ve derinliği olan bir ODAdır.** Modülün imza rengi artık
bir düğme dolgusu değil, **ekranın tamamını yıkayan tuval rengi**. Her oda tek
bir dikey kaydırmada iki bölge: üstte **duvar** (kahraman rakam + uydular +
asistanın cümlesi — "ne oluyor"), altta **tezgah** (yoğun liste — "ne
yapacağım"). Gezinme, odaların dizildiği bir **koridor**.

Teşhis ölçülmüştü, göz kararı değildi: yazı boyutlarının **%89'u 9–13,5 px**
bandında, **13 ekranın 13'ü** 720 px tek sütun, renk ekranın **~%2'si**.
Ayrıca krem + serif + terracotta + yuvarlak kart, 2026'da yapay zekâ üretimi
arayüzün **en tanınan imzasıydı** — Product Owner'ın "AI yapmış gibi
hissedilmesin" talebi Atölye'nin evrimiyle karşılanamazdı.

⚠️ **Nötr eksen sıcaktan SOĞUĞA çekildi** (`#f5efe7`/`#1e1811` →
`#f6f6f7`/`#16181b`). Marka gerekçesinden daha ağır basanı: zemin on iki modül
renginden biriyle yıkanıyor ve sıcak bir taban o hue'ların yarısıyla çakışırdı.
**Nötr taban oda sisteminin işlevsel bir koşuludur.**

⚠️ **`ModuleHeader` / `ModuleBody` EMEKLİ.** Yerlerini `RoomTop` + `Wall` +
`Desk`/`DeskBody` aldı ve hepsi odanın **tek ızgarasını** paylaşır. Ekran başına
elle `max-w` yazılmaz — orantı hatası tam olarak iki ayrı ızgaradan doğmuştu.

⚠️ **Duvar ORTAKTIR, tezgah değişir.** Bir modülün birden çok rotası varsa
bunlar ayrı odalar değil, aynı odanın çalışma yüzeyleridir. İstisna: rotanın
sorusu gerçekten farklıysa duvarı da farklıdır (Finans/Kategoriler). Detay
sayfalarının duvarı **yoktur** — özetlenecek bir durum değil, tek bir kayıt var.

⚠️ **Panel ikiye ayrıldı**: `/app` brifing (oku + not al), `/app/chat` sohbet
(temiz sayfa). Günlük özet ile sohbet aynı ekranda yarışıyordu.

⚠️ **Tema anahtarı artık VAR** (üç durum: sistem/açık/koyu, `bo_theme`).

**Marka — iki ayrı varlık, yan yana KULLANILMAZ:** K işareti yalnızca yer
olmayan yüzeyler (favicon · mobil ikon · dar koridor); yazılı logo yer olan her
yer (giriş · geniş koridor). Favicon ve mobil ikon **bu işte eklendi** — daha
önce hiç yoktu.

Üç ses üç aile korundu: Inter (ürün), Newsreader (AI), JetBrains Mono (sistem).
SSOT: `docs/architecture/FRONTEND_ARCHITECTURE.md` (v2.0).

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
guard; kalan: tenant-configurable roller, ABAC, izin cache) · **Faz 5'in kalan
sekiz modülü** (ROADMAP §3.5; 1. CRM ✅, 2. Projeler ✅, 3. Finans ✅,
4. Randevu/Rezervasyon ✅ — sıradaki 5. Belge/Sözleşme Yönetimi, ⚠️ **object
   storage kararını tetikler**) · **koyu tema UI anahtarı** (bugün yalnızca OS
tercihi) · **`company:read`'siz kullanıcı senaryosu** (dört rolün dördü de bu
izni taşıyor — kapı var, tetikçi yok; ⚠️ Finans'ın **dar** kataloğu izin
filtresini `cashflow:read` üzerinden gerçekten tetikledi ama `company:read`
satırı değişmedi) · **finans denetim izi** (`platform/audit` ARCHITECTURE §6.2'de
yazılı ama **kod olarak yok**; bir tutarın kim tarafından değiştirildiği
sorulamaz — tetikleyici 8. modül)
· Storage/Cache/Search adapter'ları · **MT §8.2 adım 3** (host ipucu ↔ claim
çapraz kontrolü — subdomain altyapısı kurulunca) · **retention: ONÜÇ tablo**
(ROADMAP §8.5; Randevu Slice 3 onikiden onüçe çıkardı, vektör taşıyan tablo
sayısı BEŞE çıktı — ⚠️ beşincisi listedeki ilk **kendisi ebeveyn olan** vektör
tablosudur, chunk tablosu yoktur) · **`POST /ask` top-K havuzu DOLU** (dokuz
katkıcı, sekiz yuva; ⚠️ iki yapısal kaynağın sistematik elenmesi **ADR-0036 ile
kapandı** — `ceil(K/3)` yuvalık **yapısal taban kısıtı**; gerçek **rerank** hâlâ
**açılmadı** ve kalibrasyon verisi beklemede) · **not detay ucu**
(ADR-0029 bilinen sınır) · **streaming**
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
| 9 | Kapanış denetimi | ✅ |

> ### Slice 9 kapanış denetimi — **yapıldı, 2026-08-09**
>
> **CRM kapandı ve prod'da canlı.** Denetimin en ağır çıktısı aşağıdaki
> "⚠️ Railway prod CANLI" bölümüdür: beş rol, 20/20 migration, altı CRM tablosu
> `RLS + FORCE`, fail-closed davranışının prod'da kanıtlanması, ve
> `NODE_ENV=production` + e-posta gönderiminin ayırt edici kanıtla
> doğrulanması. O bölüm denetimin kaydıdır ve **burada tekrarlanmaz**.
>
> Denetim listesinin iki maddesi **Projeler'in kapanış denetimine devrediyor**
> — çünkü ikisi de "modül başına imza rengi" kuralını sınıyor ve o kural ancak
> **ikinci** modülde gerçekten sınanmış olur:
>
> - **Her modül rotası kendi rengini gösteriyor mu** — `data-module`
>   unutulduğunda hata **sessizdir**: ekran çalışır, yalnızca terracotta kalır
>   ve ne lint ne tip denetimi yakalar. CRM (çivit mavisi) gezildi; Projeler
>   (zeytin) rotaları yazıldığında aynı tur açık **ve** koyu temada tekrarlanır.
> - **AI'ın sesi modül içinde terracotta kalıyor mu** — CRM'de tek örneği
>   müşteri özetiydi. Projeler'de v1'de modül içi AI yüzeyi **yok** (ADR-0033
>   §10); eklendiği gün bu madde tekrar bağlayıcı olur.

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

### Faz 5 / 2. modül — Projeler (**sürüyor**)

Karar: **ADR-0033** (kabul edildi, 2026-08-10). ROADMAP §3.5'in ikinci sırası:
_"İş · teslimat · zaman — yürütme hafızası"_.

**Bu modülün ADR'si CRM'inkinden bilinçli olarak KISA.** ADR-0031 bir modül
tanımlamanın yanında Faz 4'ün platform kodunu dışarı taşıyordu; o iş **bir kez**
yapıldı. Projeler port'ları `shared/`'dan, retrieval'i `platform/context`'ten,
RLS şablonunu MT §12.2'den ve izin modelini ADR-0025'ten **hazır** alır — yani
ADR'nin kısalması mimarinin işe yaradığının ölçüsüdür.

Gerçekten yeni **dört** karar:

1. **Cross-modül referans** (proje → CRM şirketi, opsiyonel). CRM'de bu soru
   **hiç doğmadı**: CRM hiçbir modülün verisine bakmıyordu. Projeler bunu
   isteyen **ilk modül** ve verilen cevap **kalan on modülü bağlıyor**.
   Cross-schema FK yasak (Kural 5), o yüzden üç parçalı desen: **FK yok** ·
   ad denormalize edilmez, `crm.public.ts`'ten okunur (kopyalansaydı yeniden
   adlandırmada bayatlardı) · okuma **`company:read` iznine bağlı** (yoksa
   Projeler, CRM adlarını sızdıran bir yan kapı olurdu — ADR-0031 §5.3'ün aynı
   dersi). Silinen şirketin id'si **sarkta kalır ve tolere edilir**; okuyan her
   yol buna dayanıklı yazılır. ⚠️ **Bağımlılık TEK YÖNLÜ: Projeler → CRM.**
   Tersi modül döngüsü kurar (Tenant ↔ Identity tuzağı; çözümü `forwardRef`
   değil üçüncü bir modüldü).
2. **`tasks.project_id` NULLABLE** — ADR-0031'in `interactions.company_id NOT
   NULL` kararından **bilinçli sapma**. Görüşme tanımı gereği bir şirketle
   yapılır; görev tanımı gereği bir projeye ait değildir. Zorunlu olsaydı
   kullanıcı sahte "Genel" projeleri açardı ve bu, yapısal katkıcının "durgun
   proje" sorgusunu bozardı — yani **modülün AI'a kazandırdığı bağlamı
   zehirlerdi**.
3. **Görev TEK kişiye atanır.** Çok atama "kim sorumlu" cevabını bir listeye
   çevirir. Sonradan `task_participants` eklemek mümkün, geri almak değil.
4. **Durgunluk TÜRETİLİR**, `last_activity_at` kolonu **YOK** — projede beşinci
   kez verilen aynı karar. Bir tazeleme yolu unutulunca hata **sessizdir**:
   canlı proje "durgun" görünür ve AI yanlış uyarır.

Üç migration: `0020` şema+projeler · `0021` görevler · `0022` ilerleme notları.

| Slice | Ne | Durum |
|---|---|---|
| 1 | `projects` şeması + proje yaşam döngüsü (`0020`) | ✅ |
| 2 | Görevler — projesiz dahil, tek atama (`0021`) | ✅ |
| 3 | İlerleme notları + embedding + `reindex` + oran sınırı (`0022`) | ✅ |
| 4 | İki katkıcı (`project-notes` · `project-status`) + `crm.public.ts` | ✅ |
| 5a | Frontend: liste + detay, `module-kit`, `data-module="projects"`, sidebar `SOON` → `LIVE` | ✅ |
| 5b | `/app/projects/tasks` ("Yapılacaklar": projesiz + gecikmiş) + sekme şeridi | ✅ |
| 6 | Kapanış denetimi + CRM skor politikasının hizalanması | ✅ |

> **Renk:** Projeler'in imza rengi **zeytin**'dir ve `module-colors.css`'te
> zaten ayrılmıştır. ⚠️ Anahtar **`projects`**, `projeler` DEĞİL — on iki
> modülün hepsi İngilizce anahtar taşır, Türkçe olan yalnızca **etikettir**.

> ### ✅ Modül başına imza rengi kuralı İKİNCİ MODÜLDE SINANDI (Slice 5a)
>
> CRM tek örnekti; mekanizmanın genelleşip genelleşmediği ancak burada
> görülebilirdi. Gerçek tarayıcıda, açık **ve** koyu temada ölçüldü:
>
> | Token | Açık | Koyu |
> |---|---|---|
> | Modül `--accent` / `--ink` | `#717325` / `#60620c` | `#a8ac5f` / `#b9bd70` |
> | **Kabuk** `--accent` | `#b25628` | `#e8935a` |
> | **`--ai-accent`** | `#b25628` | `#e8935a` |
>
> Yani `/app/projects` altındaki her şey zeytin, **kabuk (BO rozeti, şirket
> seçici) ve AI'ın sesi terracotta kaldı** — `data-module` modülün kendi
> layout'unda olduğu için, kabukta değil. Mekanizma iki satırla çalıştı
> (palet bloğu zaten vardı + layout'ta bir attribute); `app-shell.tsx`'e
> **dokunulmadı**. Kural artık sınanmıştır.
>
> ⚠️ **AI'ın sesi bu modülde GÖRÜNMÜYOR** ve bu doğrudur: Projeler'de v1'de
> modül içi AI yüzeyi yok (ADR-0033 §10). Sınav bu yüzden "terracotta doğru
> yerde mi" değil **"kabuk boyanmıyor mu"** olarak yapıldı. Bir "proje özeti"
> eklendiği gün madde yeniden bağlayıcı olur.
>
> ⚠️ **Koyu temanın UI anahtarı YOK.** `data-theme` hiçbir yerde yazılmıyor;
> koyu tema bugün yalnızca işletim sistemi tercihinden geliyor. Denetimde
> `:root[data-theme='dark']` yolu elle tetiklenerek doğrulandı. Bir tema
> anahtarı eklemek ayrı bir iştir.

> **Slice 5a notu — `components/module-kit/` çıkarıldı.** `chrome`,
> `record-card`, `marks`, `form-kit`, `field-errors`, `confirm-delete`: hiçbiri
> CRM'e özgü değildi, CRM klasöründe doğmuşlardı. İkinci modül bir şeyin genel
> olup olmadığını öğrendiğimiz yerdir; kopyalamak üçüncü modülde üçüncü kopya
> demekti. **Kabul ölçütü sertti ve tuttu:** CRM'in test paketi içerik olarak
> HİÇ değişmedi — `confirm-delete.spec.tsx` saf `rename` olarak taşındı
> (göreli import'u korundu), `chrome.spec.tsx` ve `signals.spec.tsx` ise
> yalnızca CRM'e özgü parçaları test ettiği için hiç dokunulmadı.

> **Slice 1 notu — `company_id` kolonu var ama API kabul etmiyor.** Kolon
> `0020`'de açıldı (ADR üç migration öngörüyor, dördüncü bir `ALTER`'a gerek
> yok) ama yazma yolu **Slice 4'e** bırakıldı: doğrulaması ve adın çözülmesi
> için gereken `crm.public.ts` orada yazılıyor. Doğrulanamayan bir işaretçiyi
> bugünden kabul etmek, **ilk günden sarkan satır üretmek** olurdu.

> **Slice 4 notu — cross-modül referans artık ÇALIŞIYOR.** `crm.public.ts`
> yazıldı (tek kalem: `CompanyDirectory.findNames`, toplu, `company:read`
> **arayüzün içinde** kapılı). Projeler, projede bir **iş modülünün başka bir
> iş modülünü import ettiği ilk yer** oldu — yön tek: CRM Projeler'i bilmez.
> Şirket adı kolonda saklanmıyor, her okumada çözülüyor; entegrasyon testi
> şirketi yeniden adlandırıp adın **anında** yansıdığını kanıtlıyor.
> `POST /ask` artık dört kaynağı birleştiriyor (`knowledge` ·
> `crm-interactions` · `project-notes` · `project-status`) — CLAUDE.md'nin CEO
> örneği üçte ikisi tamam.

> ### ✅ Yapısal katkıda skor politikası HİZALANDI (Slice 6, PO onayı)
>
> Slice 4'te bilinçli bir tutarsızlık bırakılmıştı: `CrmPipelineContributor`
> düz 0.95, `ProjectStatusContributor` riske göre 0.95/0.90/0.75 veriyordu.
> Sebebi aritmetikti — global top-K **8**'dir ve iki yapısal katkıcı sabit
> skorla sekiz yuvanın tamamını kaplayıp anlatısal içeriği dışarı atardı.
> Slice 6'da CRM aynı politikaya çekildi (takip gecikmiş → 0.95, aşamada
> `CRM_STALE_STAGE_DAYS` gündür → 0.90, sağlıklı → 0.75). Kota yine
> **eklenmedi** (ADR-0031 §5.1 reddetmişti); port zaten "0..1, yüksek = daha
> alakalı" dediği için skoru anlamlı kılmak **sözleşmeye uygundur**.
>
> **Denetimde canlı ölçüldü:** beş kaynak da doluyken tek bir soru dört
> kaynaktan beslendi (`crm-pipeline` 2 · `knowledge` 1 · `project-notes` 3 ·
> `project-status` 2). Üç fırsattan yalnızca **ikisi** girdi — sağlıklı olan
> 0.75 ile anlatısal içeriğe yenildi. Düz 0.95'te üçü de girer ve Knowledge
> notu dışarı düşerdi.
>
> ⚠️ Bu, **Mutlak Kural 1'e bilinçli bir istisnadır** (Projeler işinde CRM'e
> dokunmak): Product Owner tarafından denetimin parçası olarak açıkça
> onaylandı, sessiz bir yan iş değildir.
>
> ⚠️ `CRM_STALE_STAGE_DAYS` (21) ile web'deki `STALE_STAGE_DAYS` **ayrı
> tanımlardır ve senkron kalmalıdır**; ayrışırlarsa hata sessizdir — ekran
> "durgun" der, katkıcı 0.75 verir. `apps/web/src/lib/config/crm.ts`'in
> "sunucuda karşılıkları yoktur ve olmamalıdır" cümlesi bu değişiklikle
> yanlışlaştığı için düzeltildi.

> **Kalıcı ders (Slice 1'de yakalandı):** yeni bir migration eklerken
> `database.integration.spec`'in **geri alma listesine de** eklenmeli.
> Migration `0019` (ADR-0032) o listeye hiç girmemişti ve test o günden beri
> kırmızıydı — `crm.company_summaries` ayakta kaldığı için `0016`'nın geri
> alması `cannot drop table crm.companies` ile patlıyordu. Testin kendi
> gerekçesi kendini kanıtladı: _"down dosyası yazılmış olabilir ama çalışmıyor
> olabilir"_ — eksik olan down dosyası değil, onu **çalıştıran satırdı**. Aynı
> commit'te `crm-schema.integration.spec`'in "beş tablo" iddiası da `0019`'dan
> beri güncellenmemişti. İkisi de kapatıldı.

### Faz 5 / 3. modül — Finans (**sürüyor**)

Karar: **ADR-0034** (kabul edildi, 2026-08-11). ROADMAP §3.5'in üçüncü sırası:
_"Gelir · gider · nakit akışı — finansal hafıza"_. Dördüncü şema.

**Bu ADR "üçüncü kez aynı şey" DEĞİL.** Port'lar, RLS şablonu, retrieval ucu ve
izin modeli hazır geliyor — ama beş gerçekten yeni karar var:

1. **Sayısal veri AI'a nasıl bağlam olur.** İşlem açıklamaları **embed
   EDİLMEZ**; ayrı bir "finansal yorum" günlüğü embed edilir. Gerekçe **ortak
   havuzdur**: "Ocak kirası / Şubat kirası" gibi binlerce neredeyse özdeş kısa
   vektör, K=8'lik top-K havuzunu kirletir ve diğer üç kaynağın en iyi
   parçalarını dışarı iter. Yani bu, Finans'ın değil **`POST /ask`'in
   kararıdır**.
2. **Cross-modül referans genelleştirmesi REDDEDİLDİ** — ADR-0033'ün açtığı
   soru kapandı. Gerekçe mimari, "erken" değil: ortak bir yardımcı izin kapısını
   ya çağırana ya `shared/`'a devrederdi. Genelleşen şey kod değil **sözleşme
   şeklidir** (`findNames(ids, role) → Map`).
3. **İlk DAR permission kataloğu** — `member` ve `viewer` finansı **hiç
   görmez**. Yan etkisi değerli: `POST /ask` izin filtresi bugüne kadar hiç
   gerçekten tetiklenmemişti ("kapı var, tetikçi yok"); Finans **ilk gerçek
   tetikçidir**.
4. **İlk TENANT-TANIMLI sözlük** (kategoriler) — bugüne kadarki tüm sözlükler
   kodda enum'du. Yön kategoride tutulur ve **bileşik FK** ile zorlanır: "gelir
   kaydına gider kategorisi" veritabanı seviyesinde imkânsızdır.
5. **Para: tek tablo + `direction`, İŞARETLİ TUTAR DEĞİL.** İşaret koymayı
   unutan tek bir yazma yolu gideri gelir gibi toplar ve hata **sessizdir**.
   Nakit akışı özeti türetilir ve **para birimi bazında** döner — farklı para
   birimleri **toplanmaz**.

Üç migration: `0023` şema+kategoriler · `0024` işlemler · `0025` yorumlar.

| Slice | Ne | Durum |
|---|---|---|
| 1 | `finance` şeması + kategoriler (`0023`) | ✅ |
| 2 | İşlemler — tutar/para birimi/tarih, bileşik FK (`0024`) | ✅ |
| 3 | Nakit akışı özeti (para birimi bazında) | ✅ |
| 4 | Cross-modül referans + `projects.public.ts` | ✅ |
| 5 | Yorumlar + embedding + `reindex` + oran sınırı (`0025`) | ✅ |
| 6 | İki katkıcı (`finance-commentaries` · `finance-cashflow`) | ✅ |
| 7 | Frontend (yeşil) + **HAFİF** kapanış denetimi | ✅ |

> **Renk:** Finans'ın imza rengi **yeşil**dir (`#307d54` / koyu `#6cb78b`) ve
> `module-colors.css`'te zaten ayrılmıştır. ⚠️ Anahtar **`finance`**, `finans`
> DEĞİL.
>
> ⚠️ **`sidebar.tsx`'in `SOON` dizisi Slice 7'de BOŞALDI** ve bölüm koşullu
> render'a alındı (`SOON.length === 0`). Bölüm koşulsuz kalsaydı ekranda içi boş
> bir "MODÜLLER" başlığı kalırdı ve hata **sessiz** olurdu: ekran çalışır, lint
> yakalamaz, hiçbir test kırmızı yanmaz. Bir test artık bunu kilitliyor.
> Dördüncü modül geldiğinde tek satır eklemek yeterli — bölüm kendiliğinden
> geri gelir.

> ### ✅ HAFİF kapanış denetimi — **yapıldı, 2026-08-12**
>
> Yeni süreç kuralının **ilk uygulaması**. Yapılanlar: `git status` temiz ·
> `pnpm verify` çıkış kodu **0** (api 1504 + web 297 birim, 35 dosya / 678
> entegrasyon) · prod'da dört ucun hızlı turu (**401**, olmayan yol **404** —
> ayırt edici) · üç dar rolün `finance` şemasına **kör** olduğu (`usage=false`,
> tablo grant sayısı **0**) · renk turu açık **ve** koyu temada · bilinen
> sınırlar listesi (aşağıda).
>
> **Bilinçli yapılmayanlar:** sıfırdan kurulum ❌ · fan-out ölçümü ❌ — yani
> **N=7 ÖLÇÜLMEDEN kaldı** ve bu kayıtlıdır (ADR-0033'ün N=5 ölçümü tek
> dayanak: fan-out payı toplam sürenin %2–3'ü, darboğaz `LLMPort.complete`).
>
> ⚠️ Denetimin en değerli çıktısı bir **kapının ilk kez sınanması** oldu:
> `POST /ask`in izin filtresi (ADR-0031 §5.3) CRM ve Projeler kapanışlarında
> "kapı var, tetikçi yok" diye iki kez kayda geçmişti. Finans'ın dar kataloğu
> tetikçiyi üretti — `member` rolü `context:ask` taşır ama `cashflow:read`
> taşımaz. Entegrasyon testi dördünü birden kanıtlıyor: owner aynı soruda
> `finance-cashflow`'u **görüyor**, member'ın isteği **200** (403 değil), iki
> Finans kaynağı cevaba **girmiyor**, ve `degradedSources`ta da **görünmüyor**
> (bozulan katkıcı görünür, **elenen** görünmez — aksi halde görülemeyen bir
> kaynağın varlığı sızardı).
>
> ⚠️ İkinci çıktı: **CLAUDE.md'nin CEO örneği ilk kez TAM karşılandı.** Bir
> entegrasyon testi tek bir `POST /ask` çağrısında dört modülün (Knowledge ·
> CRM · Projeler · Finans) içeriğini birleştiriyor, `degradedSources: []`.

> **Slice 1 notu — bugün tetiklenemeyen bir yol bilerek yazıldı.**
> `CategoryInUseError` + FK ihlali çevirisi `0024` gelmeden **tetiklenemez**
> (kategoriye işaret eden tablo yok). Yine de şimdi yazıldı: alternatifi Slice
> 2'de hatırlamaya güvenmekti ve unutulsaydı kullanımdaki bir kategoriyi silme
> denemesi **ham PostgreSQL hatası olarak 500** dönerdi. Birim testi çeviriyi
> bugünden kanıtlıyor.
>
> ⚠️ `categories_id_direction_unique` kısıtı **gereksiz görünür** (`id` zaten
> birincil anahtar) ama `0024`'ün bileşik FK'sinin **ön koşuludur**; silinirse
> migration _"there is no unique constraint matching given keys"_ ile patlar.
> Bir entegrasyon testi onun **varlığını** koruyor.

> ### Finans kapanırken bilinen sınırlar (ADR-0034)
>
> - **Değişiklik denetim izi YOK.** İşlemler güncellenebilir ve silinebilir
>   (yanlış tutar düzeltilebilmeli — engellemek kullanıcıyı telafi kayıtları
>   yazmaya iterdi), ama bir tutarın **kim tarafından ne zaman değiştirildiği
>   sorulamaz**. `createdByUserId` yalnızca oluşturanı tutar. `platform/audit`
>   ARCHITECTURE §6.2'de yazılı, **kod olarak yok**. ⚠️ Bu borç Finans'la
>   **gerçek** oldu; tetikleyici 8. modül (Teklif/Fatura).
> - **Kur çevrimi yok** — özet para birimi bazında ayrışır, tek konsolide rakam
>   yoktur ve `cashflowSummarySchema` bunu **tip seviyesinde** korur.
> - **Para birimi kod listesi doğrulanmaz**, yalnızca şekil (`^[A-Z]{3}$`) —
>   "XYZ" geçerli sayılır.
> - **Binlik ayracı yok**: sunucunun kanonik dizesi olduğu gibi yazılır;
>   biçimlendirmek `Number`a çevirmek demekti ve para bu projede hiçbir noktada
>   `number` olmuyor.
> - **İyimser eşzamanlılık yok** — son yazan kazanır (üç modülde de aynı sınır).
> - **Fan-out N=7 ÖLÇÜLMEDİ** (hafif denetim kuralı) · **skorlar kaynaklar arası
>   kalibre değil** ve anlamsal kaynak sayısı **dörde** çıktı.
> - **`finance.transactions` retention listesine GİRMEZ** ve sebebi terstir:
>   sınırsız büyür ama mali kayıt saklamak yasal yükümlülüktür (TTK) — cevabı
>   "sil" değil **"silinmez"**. ⚠️ Bu ayrım kaydedilmezse tablo, "büyüyor" diye
>   bakan birinin gözünde temizlenecekler listesine yanlışlıkla girer.

### Faz 5 / 4. modül — Randevu/Rezervasyon (**bitti**)

Karar: **ADR-0035** (kabul edildi, 2026-08-12). ROADMAP §3.5'in dördüncü sırası:
_"Takvim tabanlı kayıt"_. Beşinci şema.

Gerçekten yeni **üç** karar:

1. **CHUNK TABLOSU YOK — tek satıra tek embedding.** Önceki dört anlatısal
   modülün hepsi `<parent> + <parent>_chunks` ikilisi kurdu; Randevu **tek
   tablo**dur ve vektör satırın kendi kolonundadır. Gerekçe veri şeklidir:
   servis notunun üst sınırı `TARGET_CHUNK_CHARS`'a **eşitlenmiştir**, yani
   parçalayıcı her zaman tek parça üretirdi ve ikinci tablo yalnızca bir join
   maliyeti olurdu. ⚠️ Sınır **sunucuda zorlanır ve 422 döner** — sessiz kırpma
   yok. Kırpsaydı kullanıcı yazdığını kaybettiğini fark etmezdi.
2. **Bağlam başlığı sabit etikettir, serbest metin değil.** Embed edilen satır
   `[Randevu · YYYY-MM-DD · Ad] not` biçimindedir. ⚠️ Kişi adı **vektörün
   içindedir**, yani kişi yeniden adlandırılınca vektör **bayatlar**; telafi
   `POST /appointments/reindex`tir ve **ilk günden vardır**.
3. **Yeni takvim kütüphanesi YOK.** Haftalık ızgara `module-kit`te kendi
   bileşenimizdir (`week-grid`) ve FullCalendar/react-big-calendar, recharts'ın
   reddedildiği gerekçeyle reddedildi. ⚠️ Bileşen **"randevu" kelimesini
   bilmez** ve bunu bir birim testi kilitler — `module-kit` ilk kez **ilk
   günden genel** doğdu (CRM'de doğup Projeler'de dışarı çıkarma dersinin
   uygulanması).

Bir migration: `0026` şema+randevular. **Cross-modül referans dördüncü kez**
aynı sözleşmeyle (`ContactDirectory.findNames(ids, role)`, izin kapısı
arayüzün **içinde**); yeni kenar `Randevu → CRM`, grafik hâlâ DAG.

| Slice | Ne | Durum |
|---|---|---|
| 1 | `appointments` şeması + randevu yaşam döngüsü (`0026`) | ✅ |
| 2 | Cross-modül referans (`crm.public.ts` kişi dizini) | ✅ |
| 3 | Servis notu + tek satır embedding + `reindex` + oran sınırı | ✅ |
| 4 | İki katkıcı (yapısal + anlamsal) | ✅ |
| 5 | Frontend — haftalık takvim + liste, `week-grid` | ✅ |
| 6 | **HAFİF** kapanış denetimi | ✅ |

> **Renk:** Randevu'nun imza rengi **petrol**dür (`#057a89` / koyu `#51b5c5`).
> ⚠️ Anahtar **`appointments`** — `module-colors.css`'te palet `booking` adıyla
> ayrılmıştı ve Slice 5'te **yeniden adlandırıldı**; on iki modülün anahtarı
> rotasıyla aynı olmalıdır, aksi halde `data-module` sessizce tutmaz.
>
> ⚠️ `sidebar.tsx`'in `SOON` dizisi **boş kaldı**: Randevu doğrudan `LIVE`
> olarak eklendi. Bölümün koşullu render'ı (`SOON.length === 0`) hâlâ
> geçerlidir ve testi hâlâ kilitliyor.

> ### ✅ HAFİF kapanış denetimi — **yapıldı, 2026-08-13**
>
> `git status` temiz · `pnpm verify` çıkış kodu **0** · dört ucun rol turu
> (owner 201/200/200, kimliksiz **401**, viewer okur ama yazamaz **403**, member
> yazar ama silemez **403**) · doğrulama kapıları (süre=0, ofsetsiz zaman,
> 1251 karakterlik not → **422**, ve **hiçbir kayıt kırpılmadı**) · renk turu
> açık **ve** koyu temada · §6.1'in bayatlama telafisi canlı ölçüldü (kişi
> yeniden adlandırıldı → `reindex` → vektör md5 **değişti**).
>
> **Bilinçli yapılmayanlar:** sıfırdan kurulum ❌ · iki tenant'la tam RLS
> izolasyon turu ❌ (hafif denetim kuralı).
>
> ⚠️ **Denetimin en değerli çıktısı bir KAPASİTE SINIRININ ilk kez görülmesi
> oldu.** §6.3'ün zorunlu ölçümü: dokuz katkıcı da doluyken tek bir `POST /ask`
> **sekiz** kaynak döndürdü ve dağılım üç farklı soruda da **aynı** kaldı —
> `knowledge` 1 · `crm-interactions` 1 · `appointment-notes` 1 · `project-notes`
> 1 · `finance-commentaries` 1 · `crm-pipeline` 1 · `project-status` 2.
> **`appointment-schedule` ve `finance-cashflow` HİÇ giremedi** (`degradedSources`
> boş — yani bozulmadılar, **elendiler**). İzole tenant testi ikisinin de
> çalıştığını kanıtladı: yalnız randevu verisiyle `appointment-schedule` 2 satır
> veriyor. Sebep aritmetiktir — anlamsal katkıcının en iyi isabeti **1.0**
> skoruyla döner, yapısal skorlar **0.95/0.90/0.75**'te tavanlıdır ve top-K
> **8**'dir. Product Owner kararı: **rerank / kaynak kotası bugün AÇILMADI.**
>
> ⚠️ **Fan-out N=9 ÖLÇÜLDÜ** — N=5'ten beri iki kez atlanmıştı, üçüncü kez
> atlanmadı: ortalama toplam **3936 ms**, fan-out payı **82 ms (%3)**, en yüksek
> 99 ms. Darboğaz değişmedi (`LLMPort.complete`, 1680–4631 ms). ADR-0033'ün N=5
> ölçümüyle **aynı bantta**.
>
> ⚠️ **Denetim bir kusur buldu ve BEŞ MODÜLÜ birden ilgilendiriyor:** §8'in
> `EmbeddingFailedError → 502` çevirisi çalışıyor (geçersiz `OPENAI_API_KEY` ile
> uçtan uca sınandı; notlu randevu **502**, notsuz **201**, `reindex` **200** +
> `failed: 1`, kayıt **silinmedi**) — ama `ProblemDetailsFilter` varsayılan
> olarak her 5xx gövdesini maskeler, yani "kaydedildi ancak indekslenemedi,
> `reindex` ile onarılabilir" mesajı kullanıcıya **ulaşmıyor**. Filtrenin
> `DisclosableProblem` işareti tam bu iş için var ama bugün yalnızca Tenant
> kullanıyor; Knowledge · CRM · Projeler · Finans · Randevu **beşi de** aynı
> maskeli gövdeyi dönüyor. **Bu modülde tek başına düzeltilmedi** — dördü daha
> ilgilendirdiği için Mutlak Kural 1 gereği Product Owner kararı bekleniyor.
>
> ### ✅ KAPANDI (2026-08-13, PO talimatı — beş modül tek işte)
>
> `DisclosableProblem` artık beş modülün de filtresinde. Mekanizma değişmedi;
> tek yerde somutlaştı: `infrastructure/http`'te `DisclosableHttpException`
> (Tenant'ın `ServiceUnavailableProblem`'i kendi 503 anlamını sınıf adında
> taşıdığı için **olduğu gibi durdu**). İşaret alan **yalnızca** bilinçli
> yazılmış gövdeler: `EmbeddingFailedError` (beşinde de) ve
> `CompletionFailedError` (Knowledge · CRM · Randevu).
>
> ⚠️ **Bu bir genel açma değil.** Eşlenmemiş domain kodunun 500'ü **maskeli
> kaldı** ve her modülde bir test onu kilitliyor — o test olmasaydı, maskenin
> tümüyle kalktığı bir regresyonda diğer testler de yeşil yanardı.
> ⚠️ **429 işaret TAŞIMAZ**: maske yalnızca 5xx'e uygulanır, 4xx gövdeleri
> zaten geçer; işaret koymak hiçbir şeyi değiştirmeyip "burada bir şey açıldı"
> izlenimi verirdi.
> ⚠️ **`platform/context` KAPSAM DIŞI kaldı** — `POST /ask`in iki 502'si
> (`ContextDomainExceptionFilter`) hâlâ maskeli. Beş **iş modülü** istendi;
> platform ucu ayrı bir karardır ve **açık borçtur**.
>
> ### ✅ `platform/context` DE KAPANDI (2026-08-13, PO talimatı)
>
> Borç aynı gün, ayrı bir işte kapatıldı: `POST /ask`in `CompletionFailedError`
> ve `EmbeddingFailedError` 502'leri de işaretli. **Artık altı filtre** aynı
> deseni taşıyor (beş iş modülü + `platform/context`) ve `DisclosableProblem`'i
> kullanan yer sayısı yediye çıktı (Tenant'ın 503'ü dahil).
>
> ⚠️ Buranın ayrı bir değeri var: `/ask` **dokuz katkıcıya** dokunur ve bir
> sağlayıcı çökmesinde kullanıcının gördüğü **tek şey** o gövdedir — "tekrar
> deneyin" ile "beklenmeyen hata" arasındaki fark, kullanıcının tekrar deneyip
> denemeyeceğini belirler.

> ### ✅✅ RANDEVU/REZERVASYON TAMAMEN KAPANDI — prod'da doğrulandı (2026-08-14)
>
> ADR-0035 ve **tüm alt-borçları** kapandı; `platform/context`in
> `DisclosableProblem` borcu dahil. Kapanışı gating eden şey kodun yazılmış
> olması değil, **prod'da doğrulanmasıydı** — o doğrulama yapıldı.
>
> Push: `38eee67..82c8ad3` (iki commit — `75e6aac` beş iş modülü + `82c8ad3`
> `platform/context`; ikincisi birincisinin `DisclosableHttpException`'ı
> olmadan derlenmediği için ayrılamazdı). Deployment `82c8ad35bd...` ·
> **SUCCESS** · **RUNNING**, önceki instance REMOVED.
>
> | Kontrol | Push öncesi | Push sonrası |
> |---|---|---|
> | `/api/v1/health` | 200, db ok (4 ms) | **200**, db ok (1 ms), `production` |
> | `/api/docs` · `/api/docs/json` | 404 | **404** · **404** |
> | Uygulanmış migration | 27 | **27 — DEĞİŞMEDİ** |
> | Uptime | 15966 s | **2 s** (gerçekten yeniden başladı) |
>
> ⚠️ **Migration'ın değişmediği İKİ bağımsız kanıtla gösterildi**, tek bir
> sayıya güvenilmedi: (1) prod'daki `drizzle.__drizzle_migrations` sayımı 27'de
> kaldı, (2) iki commit `apps/api/drizzle/` altında **sıfır** dosyaya dokunuyor.
> Tek başına sayım, "sayıyı okuduğum an deploy henüz migration'a gelmemişti"
> ihtimalini eleyemezdi.
>
> ⚠️ **`/api/docs`in 404'ü tek başına ayırt edici DEĞİLDİR** — ölü bir uygulama
> da 404 döndürür. Bu yüzden ayrıca bakıldı: `/api/v1/ask`, `/api/v1/appointments`
> ve `/api/v1/knowledge/notes` üçü de **401** dönüyor, yani routing canlı ve
> Swagger gerçekten kapalı. (`POST /api/v1/memberships` 404 — o uç GET-only.)
>
> ⚠️ **Prod DB okuması artık `railway ssh --service Postgres` ile yapılıyor.**
> Public TCP proxy değişkeni yok ve `businessos_app` rolü `drizzle` şemasını
> **okuyamıyor** (_permission denied_ — rol ayrımının çalıştığının kanıtı).
> Migration sayımı bu yüzden Postgres container'ının kendi içinden alınır.

> ### Randevu kapanırken bilinen sınırlar (ADR-0035)
>
> - **Kişi filtresi SUNUCUDA YOK** — liste ekranındaki ad araması **istemci
>   tarafındadır** ve yalnızca **görünen sayfaya** uygulanır. Doğru çözüm
>   `GET /appointments`e `contactId` filtresi eklemektir; bugün eklemek uç
>   listesini bir arayüz ihtiyacı yüzünden sessizce genişletmek olurdu.
> - **Çakışma kontrolü YOK** — iki randevu aynı saate yazılabilir; haftalık
>   ızgara bunu **görünür** kılar ama **engellemez**.
> - **Tenant bazlı saat dilimi YOK** — `timestamptz` UTC saklar, çevrimi istemci
>   yapar; çok bölgeli bir tenant'ta saatler yanlış okunur.
> - **Aylık görünüm yok** · **hatırlatma yok** (Queue kararı verilmeden
>   yapılamaz — ⚠️ kullanıcının **ilk soracağı** eksik).
> - **Sarkan `crm_contact_id` temizlenmez** — üçüncü sarkan işaretçi; CRM hâlâ
>   domain event yayınlamıyor, karar açıkça **ertelendi**.
> - **Değişiklik denetim izi YOK** — ADR-0034'ün borcu burada da geçerli,
>   tetikleyici değişmedi (8. modül).
> - **`embedding`de model/sürüm bilgisi yok** · **arama yalnızca anlamsal** ·
>   **iyimser eşzamanlılık yok** — dördü de beşinci kez aynı sınır.
> - ⚠️ **`DisclosableProblem`in prod'da DAVRANIŞSAL kanıtı yok** — kanıt
>   **test paketi üzerindendir**, canlı tetikleme değil. Prod'da doğrulanan şey
>   doğru commit'in ayakta olduğudur (`82c8ad3` · SUCCESS · health 200);
>   gövdenin gerçekten açıldığı 1623 birim + 757 entegrasyon testiyle
>   kilitlenir. Canlı kanıt için bir sağlayıcı çökmesi tetiklemek gerekirdi
>   (kapanış denetiminde **lokalde** geçersiz `OPENAI_API_KEY` ile yapılmıştı);
>   prod'da kasten bozmak, gerçek kullanıcı verisi olmayan bir ortamda bile
>   doğrulama uğruna canlıyı bozmak olurdu. ⚠️ Bu sınır **kaydedilmezse**,
>   ileride birisi "prod'da uçtan uca sınandı" sanabilir — sınanan **deploy**,
>   davranış değil.

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

> #### ✅ Prod artık `NODE_ENV=production` (2026-08-09, denetimin son adımı)
>
> Bir süre `development`'taydı ve **tek başına çevrilemiyordu**; zincir
> `env.schema.ts`'te ve bilinçlidir:
> `NODE_ENV=production` → `EMAIL_PROVIDER=console` **yasak** (P1: konsol
> adapter'ı doğrulama kodlarını loglar) → `EMAIL_PROVIDER=resend` →
> `RESEND_API_KEY` **ve** `EMAIL_FROM` zorunlu.
>
> Üçü de Railway'e aktarıldı (Product Owner talimatı; değerler `apps/api/.env`
> içindeydi, stdin ile geçirildi). Sıra önemliydi: sırlar önce ve
> `--skip-deploys` ile, `NODE_ENV` **en son** — uygulama hiçbir an
> "production + console e-posta" hâlinde açılmasın diye.
>
> **E-posta gönderimi prod'da KANITLANDI**, ve kanıt ayırt edicidir:
> `delivered@resend.dev` → outbox `YAYINLANDI` (0 deneme);
> `@example.com` → **ölü mektup**, `Resend gonderimi reddetti (HTTP 422):
> Invalid to field`. İkincisi olmasaydı "gönderiliyor" iddiası bir no-op'tan
> ayırt edilemezdi.
>
> `SWAGGER_ENABLED=false` — `/api/docs` artık 404 (öncesinde uç sözleşmesi
> internete açıktı).
>
> ⚠️ `EMAIL_FROM` Resend'in **paylaşımlı test göndericisidir** (`resend.dev`).
> Bu modda Resend yalnızca hesap sahibinin adresine ve `*.resend.dev` test
> adreslerine gönderir; gerçek kullanıcıya e-posta gitmesi için **kendi alan
> adının Resend'de doğrulanması** gerekir. Faz 6'nın (gerçek müşteri) önkoşulu.
>
> ⚠️ Prod'da iki denetim artığı kullanıcı kaldı (`delivered@resend.dev`,
> `ayirt-edici-test@example.com`) — temizlenmesi Product Owner onayına bağlı.

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
