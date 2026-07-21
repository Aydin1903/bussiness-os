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

Business logic `LLMPort` interface'ini kullanır. Sağlayıcılar adapter'dır:
OpenAI · Anthropic · Google Gemini · xAI · Azure OpenAI · OpenRouter · Ollama · LM Studio

**Test:** Yeni sağlayıcı eklemek *yalnızca* yeni bir adapter yazmayı gerektirmeli. Business logic'te tek satır değişmemeli.

---

## Komutlar

```bash
pnpm install            # bağımlılıklar
pnpm docker:up          # PostgreSQL + Redis
pnpm db:migrate         # migration çalıştır
pnpm db:rollback        # son migration'ı geri al (tek adım)
pnpm dev                # api :3001 · web :3000

pnpm lint               # ESLint (mimari kurallar dahil)
pnpm typecheck          # TypeScript
pnpm test               # birim testleri — Docker gerektirmez
pnpm test:integration   # entegrasyon testleri — Testcontainers, Docker şart
pnpm build              # build
pnpm format             # Prettier
```

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

### Faz 3 — tasarım tamamlandı, **kod yazımı başlamadı**

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

### Bilinçli olarak kapalı olanlar

`POST /api/v1/tenants` bugün **her isteğe 503 döner**. İki kapı Identity
modülünü bekliyor ve ikisi de **açıkça reddeder** — sessizce izin veren sahte
implementasyon konmadı:

- `CurrentUserProvider` → kimlik yalnızca doğrulanmış token'dan gelebilir
- `TenantProvisioningPolicy` → ADR-0016'nın `emailVerified` önkoşulu doğrulanamıyor

Bu ikisi Faz 3'te **değiştirilecek, genişletilmeyecek**.

### Henüz yok

Authentication **kodu** (tasarımı hazır) · Authorization (RBAC) · tam tenant
context (`userId`/`role` — §11.2) · çözüm zincirinin JWT gerektiren 5 adımı ·
outbox publisher süreci · `tenant.public.ts` · iş modülleri · AI katmanı ·
Storage/Cache/Search adapter'ları.

Sıradaki adım: **Faz 3 implementasyonu.** İlk iş `tenant.public.ts` — Identity,
Tenant modülünü tüketecek ve public arayüz önce tanımlanmazsa ilk import
doğrudan `application/`e gider (`ARCHITECTURE.md` §6.1).
