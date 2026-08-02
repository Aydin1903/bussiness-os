# Roadmap

Business OS — Faz Sıralaması ve Kapı Koşulları

> **Durum:** Faz 4 girişi — ✅ **Kabul edildi**
> **Sürüm:** 1.3
> **Son güncelleme:** 2026-08-02
> **Sahip:** Lead Software Engineer · **Onay:** Product Owner

---

## Bu dokümanın statüsü

Bu doküman **sıranın** ve **kapı koşullarının** Single Source of Truth'udur: hangi işin hangi işten önce geldiğini ve bir fazın hangi koşul sağlanmadan başlamayacağını tanımlar.

- **Teknik kararı bu doküman vermez.** Kararlar ADR'lerde, tasarımlar `docs/architecture/` altındaki SSOT dokümanlarında yaşar. Burada yalnızca "ne zaman karara bağlanacak" yazar.
- **Mevcut durumun kaydı burada değil** [`CLAUDE.md`](../CLAUDE.md)'dedir. Bu doküman ileriye bakar; "bugün ne var" sorusu oraya sorulur.
- Faz numaralandırması **CLAUDE.md ile devam eder, sıfırlanmaz.**

**Kardeş dokümanlar:** [`ARCHITECTURE.md`](../ARCHITECTURE.md) (sistem mimarisi ve teknoloji tablosu) · [`AUTH_ARCHITECTURE.md`](architecture/AUTH_ARCHITECTURE.md) · [`MULTI_TENANT_ARCHITECTURE.md`](architecture/MULTI_TENANT_ARCHITECTURE.md) · [`FRONTEND_ARCHITECTURE.md`](architecture/FRONTEND_ARCHITECTURE.md)

---

## İçindekiler

1. [Tamamlanan fazlar](#1-tamamlanan-fazlar)
2. [Faz 4 — İlk Gerçek Modül + AI Context Engine](#2-faz-4--i̇lk-gerçek-modül--ai-context-engine)
3. [Faz 5 — Modül Genişlemesi](#3-faz-5--modül-genişlemesi)
4. [Faz 6 — Faturalama](#4-faz-6--faturalama)
5. [Faz 7 — Native Mobil](#5-faz-7--native-mobil)
6. [Faz 8 — OAuth](#6-faz-8--oauth)
7. [Faz 9 — Landing Page + Marka Kimliği](#7-faz-9--landing-page--marka-kimliği)
8. [Yatay / sürekli kalemler](#8-yatay--sürekli-kalemler)
9. [Uzlaştırılacak kayıtlar](#9-uzlaştırılacak-kayıtlar)

---

## 1. Tamamlanan fazlar

Ayrıntı [`CLAUDE.md` "Mevcut Durum"](../CLAUDE.md) bölümündedir ve **burada tekrarlanmaz**.

| Faz | Konu | Durum (CLAUDE.md'ye göre) |
|---|---|---|
| **Faz 1** | Temel iskelet — Turborepo, NestJS, Next.js, PostgreSQL, Drizzle, config, logging, RFC 7807, Swagger, Vitest + Testcontainers, GitHub Actions CI | ✅ Tamamlandı |
| **Faz 2** | Multi-tenancy çekirdeği — `Tenant`/`Membership`, RLS politikaları, outbox, `SET LOCAL` transaction manager, izolasyon testleri | ✅ Tamamlandı |
| **Faz 3** | Kimlik doğrulama — kayıt → doğrulama → giriş → tenant açma zinciri, refresh rotation, oturum sonlandırma, parola sıfırlama ve **değiştirme**, RBAC v1 (ADR-0025), frontend (`apps/web`) auth ekranları + dashboard | 🟡 **Sürüyor** — bkz. aşağıdaki not |

> ⚠️ **Faz 3 formal olarak kapatılmadı.** CLAUDE.md bugün "Faz 3 **sürüyor**" diyor. Açık kalan iki kalem **aynı türden değildir** ve ayrı ayrı ele alınır:

### 1.1 Faz 3'ten devreden açık kalemler

| Kalem | Durum | Nereye bağlandı |
|---|---|---|
| **Authorization'ın kalanı** — tenant-configurable roller · ABAC · izin cache | RBAC çekirdeği ÇALIŞIYOR (ADR-0025: merkezî policy engine + guard, deny-by-default) | ❄️ **Backlog — herhangi bir faza bağlanmadı.** Etiket: *"gerçek ihtiyaç doğunca"* |
| **Tenant outbox publisher / drain süreci** | ✅ **Yazıldı** (commit `b07966f`) — bkz. §1.2 | 🟢 **Kapatıldı** — Faz 4 önkoşulu karşılandı |

**Authorization'ın kalanı neden bir faza bağlanmadı:** üçü de bugün *varsayımsal* ihtiyaçlardır. Tenant-configurable roller, bir müşteri sabit rol setinin yetmediğini söyleyene kadar tahmindir; ABAC ("yalnızca kendi departmanının projelerini görebilir") gerçek bir kural talebi olmadan tasarlanamaz; izin cache ise **henüz ölçülmemiş** bir performans sorununun çözümüdür — bugün cache eklemek, olmayan bir darboğazı optimize etmektir. `resource:action` modeli üçünün de altına bozulmadan girecek şekilde tasarlandı (ARCHITECTURE §10.1), dolayısıyla erteleme bir borç değil, bilinçli bir bekleyiştir.

### 1.2 Tenant outbox publisher — ✅ kapatıldı (commit `b07966f`)

> **Durum: kapandı (2026-08-02).** Aşağıdaki tespit, işin yapılmasından **önceki** durumu anlatır ve kayıt olarak bırakılmıştır. Bugün son sütun dolu: tüketici, zamanlayıcı, repository ve teslimat hatası mekanizmasının tamamı yazıldı (migration `0009`+`0010`, `MULTI_TENANT_ARCHITECTURE.md` §12.4.2 / v2.0).

**Tespit edildiğinde: yazma yolu var, okuma yolu YOK.**

| | Identity (`platform.identity_outbox`) | Tenant (`platform.outbox`) — **tespit** | Tenant — **bugün** |
|---|---|---|---|
| Yazan | `IdentityOutboxEventPublisher` | `OutboxEventPublisher` ✅ | ✅ değişmedi |
| Tüketici use case | `PublishIdentityEventsUseCase` ✅ | ❌ yok | ✅ `PublishTenantEventsUseCase` |
| Zamanlayıcı / worker | `IdentityOutboxRelay` ✅ | ❌ yok | ✅ `TenantOutboxRelay` |
| Repository | `DrizzleIdentityOutboxRepository` ✅ | ❌ yok | ✅ `DrizzleTenantOutboxRepository` |
| Teslimat hatası mekanizması | `attempt_count` · `last_error` · backoff · dead-letter (`0006`) ✅ | ❌ kolonlar bile yok | ✅ migration `0009` |
| RLS aşımı (tenant'lar arası okuma) | gerekmiyor (tablo tenant'sız) | — | ✅ migration `0010` + dar rol |

Tespit anında kod tabanında `platform.outbox`'tan **okuyan tek satır yoktu**. Satırlar birikiyor, `published_at` sonsuza kadar `NULL` kalıyor ve kısmî index `outbox_pending_idx` sınırsız büyüyordu.

**O gün işlevsel bir hata üretmiyordu:** tabloya yazılan tek event `TenantProvisioningRequested`'dır ve V1 provisioning **senkrondur** (ADR-0016 — tenant anında `active` açılır). Yani bu event'in tüketici tarafında yapması gereken bir işi yoktu; kayıt amaçlı duruyordu. Bugün de öyle — tüketici onu "işlendi" olarak işaretlemekten başka bir şey yapmıyor.

**Faz 4'ün önkoşulu olmasının sebebi:** ilk iş modülü domain event üretir ve o event'lerin teslim edilmesi gerekir. Drain süreci olmadan yazılan bir modül, "event yayınlıyorum" sanan ama hiçbir şey yayınlamayan bir modüldür — ADR-0006'nın açıkça engellemek için var olduğu sessiz hata. Altyapı artık hazır; **gerçek tüketici mantığı Faz 4'te, her event tipi için ayrı ayrı yazılacak.**

> **Beklenmedik çıktı:** iş sırasında `MULTI_TENANT_ARCHITECTURE.md` §12.4.2'nin planı **uygulanamaz** çıktı (`FORCE RLS` altında `resolve_tenant` deseni çalışmıyor) ve "üçüncü rol eklenmeyecek" öngörüsü ikinci kez düştü. Eski metin silinmedi; üstüne superseded notu eklendi (MT v2.0). Ayrıntı orada.

---

## 2. Faz 4 — İlk Gerçek Modül + AI Context Engine

> **Durum:** ✅ **Karar verildi** — sıradaki faz.
> **Tasarım kararı:** [ADR-0029](adr/0029-knowledge-module-ai-context-engine.md) — Knowledge modülü + AI Context Engine v1 (veri modeli, chunking, `LLMPort` imzası, akış, rate limiting).

### 2.1 Ne yapılacak

**Knowledge / Inbox modülü ile AI Context Engine BİRLİKTE inşa edilecek.**

İlk iş modülü olarak CRM, Finans veya İK **seçilmedi**. Seçim Knowledge/Inbox'tır.

Kapsam **bilinçli dar** ([ADR-0029](adr/0029-knowledge-module-ai-context-engine.md)): manuel metin girişi + serbest soru-cevap. Dosya eki, email entegrasyonu, otomatik özet kartları, per-tenant sağlayıcı seçimi, hassas veri redaksiyonu — hepsi kapsam dışı ve ayrı ADR gerektirecek.

### 2.2 Neden birlikte — bu fazın tek kritik gerekçesi

AI Context Engine, bir modülün üstüne **sonradan yapıştırılan bir özellik değildir**; ilk modülle **birlikte tasarlanan bir mimari temeldir**.

Bu, `CLAUDE.md`'nin kurucu kısıtının doğrudan sonucudur: *"Modüller ürün değildir, hafızadır."* Context Engine'i ikinci veya üçüncü modülde eklemeye kalkmak, ilk modülü "AI'a bağlam üretmeyen" bir modül olarak tasarlamak demektir — ve o modül sonradan geriye dönük olarak yeniden yazılır. Knowledge/Inbox bu yüzden seçildi: kurumsal hafızanın en doğrudan taşıyıcısıdır ve Context Engine'in ilk gerçek tüketicisidir.

### 2.3 Bu fazda **zorunlu olarak** karara bağlanacak açık teknik kararlar

Dördü de bu fazın açık kalemleriydi. [ADR-0029](adr/0029-knowledge-module-ai-context-engine.md) **ikisini kapattı**, ikisi açık kalıyor.

| Karar | Durum | Ne zaman |
|---|---|---|
| **Vector store** | ✅ **Karara bağlandı** — pgvector, `vector(1536)` + **HNSW** index ([ADR-0029](adr/0029-knowledge-module-ai-context-engine.md) §1) | — |
| **Object storage** | ✅ **Bu fazda gerekmiyor** — ADR-0029 dosya ekini kapsam dışı bıraktı; koşul gerçekleşmedi, **Faz 5'e devreder** | Dosya eki gündeme gelince |
| **Queue** | 🟡 Ön öneri var (BullMQ), **seçilmedi**. ADR-0029 embedding'i bilinçle **senkron** yaptı; hacim artınca outbox'a taşınacak | Asenkron indeksleme/embedding ihtiyacı netleşince |
| **Cache** | 🟡 Ön öneri var (Redis — [ADR-0010](adr/0010-cache-port.md)), container ayakta ama **uygulama bağlanmıyor**, **seçilmedi** | İlk gerçek önbellek yükü çıkınca |

> **Search (full-text) ayrı bir sorudur ve ADR-0029 ona dokunmadı.** Modül bugün yalnızca **anlamsal** arama yapıyor (embedding + pgvector). PostgreSQL FTS ([ADR-0011](adr/0011-search-port-postgres-fts.md)) hâlâ ön öneridir ve klasik metin araması gerektiğinde gündeme gelir.
>
> Hepsi **port arkasındadır** ve öyle kalacaktır (ADR-0009/0010/0011 deseni). Sağlayıcı seçimi bir adapter kararıdır; iş mantığı hiçbirine bağlanmaz — ADR-0029'un `LLMPort` imzası bunun ilk somut sınavıdır.

### 2.4 Zorunlu alt-adım: CI/CD + Hosting

**Bu faz prod'a çıkmadan kapanmaz.** Bugüne kadar hiç prod'a çıkılmadı.

| Kalem | Durum |
|---|---|
| CI (GitHub Actions) | ✅ Faz 1'de kuruldu — test + lint + typecheck |
| **CD** | ❌ Yok |
| **Hosting** | ❌ Karara bağlanmadı |

Gerekçe: prod'a hiç çıkmamış bir sistemin "çalışıyor" iddiası test edilmemiş bir iddiadır. Migration'ların gerçek bir veritabanında sırayla uygulanması, secret yönetimi, ortam ayrımı ve geri alma (rollback) yolu — hepsi ancak gerçek bir dağıtımda ortaya çıkar. Bu iş ne kadar ertelenirse, ilk dağıtımda karşılaşılacak sürpriz o kadar büyür.

### 2.5 Kapı koşulu (Faz 4'e giriş)

🟢 **Karşılandı.** Tek koşul olan tenant outbox drain süreci yazıldı (commit `b07966f`, [§1.2](#12-tenant-outbox-publisher--✅-kapatıldı-commit-b07966f)).

Başka engel yok: RBAC + tenant context + RLS zinciri uçtan uca çalışıyor, modül→Authorization permission deklarasyonu deseni bir kez uygulandı (`member:read`), ve artık bir iş modülünün yayınlayacağı domain event'lerin teslim yolu da mevcut.

---

## 3. Faz 5 — Modül Genişlemesi

Kalan klasik modüller: **CRM · Finans · İK** (ve ARCHITECTURE §6'da sayılan diğerleri — Projects, Workflow, Reporting).

> **Kapı koşulu:** Faz 4'ün **AI Context Engine deseni en az bir modülde kanıtlanmış** olmalı.

Kanıtlanmamış bir deseni üç modüle birden uygulamak, üç modülü birden yeniden yazmak demektir. Faz 4'ün Knowledge/Inbox'ı bu desenin referans uygulamasıdır; Faz 5 onu **ikinci ve üçüncü kez** uygular — desen ancak tekrarlandığında desen olur.

---

## 4. Faz 6 — Faturalama

Abonelik, plan/kota, ödeme sağlayıcısı entegrasyonu.

> **Kapı koşulu:** **En az 1–2 gerçek modül** var olmalı.

Faturalanacak bir değer yokken faturalama inşa etmek, fiyatlandırılacak şeyi tahmin ederek modellemektir. Plan sınırlarının (kullanıcı sayısı, depolama, AI token bütçesi) neye göre çizileceği ancak gerçek modüller kullanımdayken bilinir.

> **Not:** KVKK/GDPR kontrol noktası bu fazdan **önce** gelir — bkz. [§8](#8-yatay--sürekli-kalemler).

---

## 5. Faz 7 — Native Mobil

[ADR-0026](adr/0026-frontend-token-storage.md)'nın **dual-transport** tasarımı bu fazda devreye girer: web `HttpOnly` cookie ile taşırken, native istemci aynı refresh akışını farklı bir taşıma ile kullanır.

Tasarım zaten yapıldı ve backend ona göre yazıldı; bu faz onu **kullanan** istemcidir. Yani mobil, mevcut auth mimarisinde bir değişiklik gerektirmez — gerektirseydi bu bir tasarım hatası olurdu.

---

## 6. Faz 8 — OAuth (Google / Microsoft)

**Bağımsız kalem — herhangi bir noktada öne alınabilir.**

Diğer fazlarla bağımlılığı yoktur; sıradaki yerine değil, bir talep veya fırsat çıktığında araya sıkıştırılır. `Credential`'ın `User`'dan ayrı tutulması ([AUTH §5.3](architecture/AUTH_ARCHITECTURE.md)) tam olarak bu senaryo için yapıldı: parolasız (federe) kullanıcı, mevcut modelde nullable bir alan açmadan temsil edilebilir.

---

## 7. Faz 9 — Landing Page + Marka Kimliği

> **Kapı koşulu:** **Domain ve marka netleşmeden başlamaz.**

E-posta şablonlarının HTML/marka hâline getirilmesi de buraya bağlıdır ([AUTH §7.7](architecture/AUTH_ARCHITECTURE.md)) — bugün bilinçli olarak düz metindir ve bu bir **içerik** borcudur, mimari borç değil. Referanslar: [`DESIGN_REFERENCES.md`](architecture/DESIGN_REFERENCES.md).

---

## 8. Yatay / sürekli kalemler

Bunlar bir faza ait değildir; ya süreklidir ya da belirtilen faza kadar netleşmesi gerekir.

| Kalem | Durum | Ne zaman |
|---|---|---|
| **Gözlemlenebilirlik** — merkezî log toplama, hata izleme, **AI çağrısı maliyet/token takibi** | ❌ Yok (bugün yalnızca Pino + correlation ID, lokal) | **Faz 4'e kadar netleşmeli** |
| **Yedekleme / felaket kurtarma** | ❌ Yok | **Hosting kararıyla birlikte** (Faz 4 §2.4) |
| **KVKK / GDPR uyumluluğu** | ❌ Ele alınmadı | **Faz 6 öncesi zorunlu kontrol noktası** |
| **Playwright e2e** | ❌ Yok — **bilinçli ertelendi** (Vitest + RTL kuruldu) | Belirsiz; bilinçli borç |
| **`login_attempts` + `verification_code_requests` retention** | ❌ Yok — **büyüyen borç** (change-password ile iki akış besliyor) | Faz 4 |
| **Mobil görsel test** — dashboard + change-password ekranı `<768px` | ❌ Yapılmadı | Faz 4 |
| **Doküman sürüm numarası denetimi** | 🟡 Bilinen tutarsızlık | Faz 4 |

### 8.1 Gözlemlenebilirlik neden Faz 4'e kadar

AI çağrısı **maliyet ve token takibi**, diğer iki kalemden farklı bir aciliyettedir: AI Context Engine devreye girdiği anda her istek ölçülebilir bir para harcamasına dönüşür. Ölçülmeyen bir maliyet, faturayı gördüğünüzde öğrenilen bir maliyettir. Bu yüzden Context Engine ile **aynı fazda** kurulmalıdır — sonrasında değil.

### 8.2 KVKK/GDPR neden Faz 6 öncesi

Gerçek müşteri ve ödeme verisi Faz 6'da girer. Veri saklama süreleri, silme hakkı ve işleme envanteri **veri girmeden önce** tasarlanırsa bir tasarım kararıdır; sonra tasarlanırsa bir göç projesidir. Faz 3'te açılan retention borcu ([§8](#8-yatay--sürekli-kalemler)) bu kontrol noktasının ilk girdisidir.

---

## 9. Uzlaştırılacak kayıtlar

Bu doküman yazılırken, mevcut dokümanlarda **bu yol haritasıyla çelişen** faz atamaları bulundu.

### 9.1 `ARCHITECTURE.md` §2 + ADR-0007 — ✅ **UZLAŞTIRILDI**

> **Durum: kapandı.** Hizalama commit `ba0fb41` ile yapıldı (2026-08-02).

| Kalem | ARCHITECTURE.md (önce) | Bugün — iki dokümanda da |
|---|---|---|
| Cache | Faz 3 | **Faz 4** (§2.3) |
| Queue / Jobs | Faz 3 | **Faz 4** (§2.3) |
| Object storage | Faz 3 | **Faz 4** (§2.3, koşullu) |
| Search | Faz 4 | **Faz 4** — zaten uyumluydu |
| Vector store | Faz 4 | **Faz 4** — zaten uyumluydu |
| Hosting | Faz 7 | **Faz 4** (§2.4) |
| İş modülleri | Faz 5+ | **Faz 4** (ilki), **Faz 5** (kalanlar) |
| AI / `LLMPort` ([ADR-0007](adr/0007-ai-provider-agnostic-port.md)) | uygulama Faz 6+ | **Faz 4** |

Hizalamada ayrıca iki satır **ayrıştırıldı**: `Observability` ve `CI/CD` tabloda tek başına "Faz 1" diyordu ve bu yanıltıcıydı — temel kuruldu (Pino + correlation ID, GitHub Actions CI) ama merkezî log toplama, AI maliyet takibi ve **CD** yok. Artık ikisi de "Faz 1 (temel) + Faz 4 (kalanı)" olarak okunuyor.

> **ADR-0007'de kararın kendisi değişmedi** — yalnızca ne zaman uygulanacağı değişti. `LLMPort` soyutlaması, kabul testi ve gerekçe aynen geçerlidir. Fazın öne alınması ADR'yi **daha bağlayıcı** kılar: sağlayıcı seçimi artık yakın bir karardır ve business logic'in ona bağımlı olmaması bugün teorik değil pratik bir kısıttır.

### 9.2 `AUTH_ARCHITECTURE.md` sürüm geçmişi — 🟡 açık

Header'daki sürüm etiketi `1.1 (2026-07-26)` ile değişiklik geçmişi tablosu arasında bir numara çakışması var: `1.1` tabloda zaten 2026-07-22'de (EmailPort) kullanılmış, ADR-0026 cookie değişikliği muhtemelen `1.6` olmalıydı ve tabloya hiç girmemiş. Geçmişi yeniden yazmamak için dokunulmadı; en son kayıt `1.6` olarak eklendi ([§8](#8-yatay--sürekli-kalemler) "doküman sürüm numarası denetimi").

---

## Değişiklik geçmişi

| Sürüm | Tarih | Değişiklik |
|---|---|---|
| 1.0 | 2026-08-02 | İlk sürüm. Faz 4–9 sırası ve kapı koşulları karara bağlandı: **Faz 4 = Knowledge/Inbox + AI Context Engine birlikte** (CRM/Finans/İK değil), Search/Vector + Queue + Cache bu fazda seçilecek, CI/CD + Hosting zorunlu alt-adım. Yatay kalemler ve [§9](#9-uzlaştırılacak-kayıtlar) uyumsuzluk kaydı eklendi. Faz 1–3 **tekrarlanmadı**, CLAUDE.md'ye referans verildi. |
| 1.1 | 2026-08-02 | **[§9.1](#91-architecturemd-2--adr-0007--uzlaştırıldı) uzlaştırıldı** (commit `ba0fb41`): ARCHITECTURE.md §2/§6.2 ve ADR-0007 bu dokümana hizalandı. **[§1.1](#11-faz-3ten-devreden-açık-kalemler)** eklendi — Faz 3'ten devreden iki kalem ayrıştırıldı: Authorization'ın kalanı (ABAC · configurable roller · izin cache) **hiçbir faza bağlanmadı**, *"gerçek ihtiyaç doğunca"* etiketiyle backlog'a alındı; **tenant outbox publisher Faz 4'ün önkoşulu** oldu. **[§1.2](#12-tenant-outbox-publisher--durum-tespiti-2026-08-02)** durum tespiti eklendi: yazma yolu var, **okuma yolu hiç yazılmadı** — bugün işlevsel hata üretmiyor (V1 provisioning senkron) ama iş modülleri event üretmeye başlayınca sessiz veri kaybı olur. **Object storage** §2.3'e dördüncü açık karar olarak eklendi (koşullu: Knowledge/Inbox dosya eki alacaksa zorunlu). |
| 1.2 | 2026-08-02 | **[§1.2](#12-tenant-outbox-publisher--✅-kapatıldı-commit-b07966f) kapatıldı** (commit `b07966f`): tenant outbox drain süreci yazıldı — tüketici + zamanlayıcı + repository + backoff/dead-letter (migration `0009`+`0010`). Faz 4'ün **tek kapı koşulu karşılandı** ([§2.5](#25-kapı-koşulu-faz-4e-giriş)). Yan çıktı: `MULTI_TENANT_ARCHITECTURE.md` §12.4.2'nin planı uygulanamaz çıktı ve iki öngörüsü düzeltildi (MT v2.0, superseded notu — metin silinmedi). |
| 1.3 | 2026-08-02 | **Faz 4 tasarim karari ADR'e baglandi:** [ADR-0029](adr/0029-knowledge-module-ai-context-engine.md) — Knowledge modulu + AI Context Engine v1. [§2](#2-faz-4--i̇lk-gerçek-modül--ai-context-engine) ve [§2.3](#23-bu-fazda-zorunlu-olarak-karara-bağlanacak-açık-teknik-kararlar) referans aldi. §2.3'teki dort acik karardan **ikisi kapandi** (Vector store → pgvector + HNSW; Object storage → dosya eki kapsam disi kaldigi icin bu fazda gerekmiyor, Faz 5'e devreder), Queue ve Cache acik kaliyor. Search (full-text) ADR-0029'un konusu degil — modul bugun yalnizca anlamsal arama yapiyor. |
