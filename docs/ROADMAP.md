# Roadmap

Business OS — Faz Sıralaması ve Kapı Koşulları

> **Durum:** ✅ **Faz 5 TAMAMEN KAPANDI** (2026-08-27) — on iki iş modülünün on ikisi de canlı ([§3.5](#35-modül-sıralaması--on-iki-modül-product-owner-kararı)). Sıradaki iş **Faz 9'un landing page'i**; ⚠️ Faz 6 (Faturalama) "başlanabilir" ama **sırası landing'in arkasındadır** ([§7](#7-faz-9--landing-page--marka-kimliği))
> **Sürüm:** 2.4
> **Son güncelleme:** 2026-08-31
> **Sahip:** Lead Software Engineer · **Onay:** Product Owner

> ⚠️ **Bu satır 2026-08-13'ten 2026-08-31'e kadar bayat kaldı** ve _"Faz 5 sürüyor — ilk dört modül bitti, sıradaki 5. modül Belge/Sözleşme"_ diyordu. Kayıt bırakılıyor çünkü bir belgenin BAŞLIĞI, en çok okunan ve en az güncellenen yeridir: sekiz modül bitip iki faz sırası değiştiği hâlde başlık hiç değişmemişti.

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
3. [Faz 5 — Modül Genişlemesi](#3-faz-5--modül-genişlemesi) · [3.6 2. modül: Projeler](#36-2-modül-projeler--yeni-olan-tek-şey-cross-modül-referans) · [3.7 3. modül: Finans](#37-3-modül-finans--desen-üçüncü-kez-ama-üç-yeni-soruyla)
4. [Faz 6 — Faturalama](#4-faz-6--faturalama)
5. [Faz 7 — Native Mobil](#5-faz-7--native-mobil)
6. [Faz 8 — OAuth](#6-faz-8--oauth)
7. [Faz 9 — Landing Page + Marka Kimliği](#7-faz-9--landing-page--marka-kimliği) — ⚠️ **kapı koşulu karşılandı; Faz 6'nın ÖNÜNE alındı** (2026-08-27)
8. [Yatay / sürekli kalemler](#8-yatay--sürekli-kalemler)
9. [Uzlaştırılacak kayıtlar](#9-uzlaştırılacak-kayıtlar)

---

## 1. Tamamlanan fazlar

Ayrıntı [`CLAUDE.md` "Mevcut Durum"](../CLAUDE.md) bölümündedir ve **burada tekrarlanmaz**.

| Faz       | Konu                                                                                                                                                                                                               | Durum (CLAUDE.md'ye göre)                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **Faz 1** | Temel iskelet — Turborepo, NestJS, Next.js, PostgreSQL, Drizzle, config, logging, RFC 7807, Swagger, Vitest + Testcontainers, GitHub Actions CI                                                                    | ✅ Tamamlandı                                                                       |
| **Faz 2** | Multi-tenancy çekirdeği — `Tenant`/`Membership`, RLS politikaları, outbox, `SET LOCAL` transaction manager, izolasyon testleri                                                                                     | ✅ Tamamlandı                                                                       |
| **Faz 3** | Kimlik doğrulama — kayıt → doğrulama → giriş → tenant açma zinciri, refresh rotation, oturum sonlandırma, parola sıfırlama ve **değiştirme**, RBAC v1 (ADR-0025), frontend (`apps/web`) auth ekranları + dashboard | 🟡 **Sürüyor** — bkz. aşağıdaki not                                                 |
| **Faz 4** | Knowledge modülü + AI Context Engine — ADR-0029/0030; kapanış denetimi 2026-08-05                                                                                                                                  | ✅ Tamamlandı — **bir istisnayla**, bkz. [§2.4](#24-zorunlu-alt-adım-cicd--hosting) |

> ⚠️ **Faz 3 formal olarak kapatılmadı.** CLAUDE.md bugün "Faz 3 **sürüyor**" diyor. Açık kalan iki kalem **aynı türden değildir** ve ayrı ayrı ele alınır:

### 1.1 Faz 3'ten devreden açık kalemler

| Kalem                                                                        | Durum                                                                               | Nereye bağlandı                                                                   |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Authorization'ın kalanı** — tenant-configurable roller · ABAC · izin cache | RBAC çekirdeği ÇALIŞIYOR (ADR-0025: merkezî policy engine + guard, deny-by-default) | ❄️ **Backlog — herhangi bir faza bağlanmadı.** Etiket: _"gerçek ihtiyaç doğunca"_ |
| **Tenant outbox publisher / drain süreci**                                   | ✅ **Yazıldı** (commit `b07966f`) — bkz. §1.2                                       | 🟢 **Kapatıldı** — Faz 4 önkoşulu karşılandı                                      |

**Authorization'ın kalanı neden bir faza bağlanmadı:** üçü de bugün _varsayımsal_ ihtiyaçlardır. Tenant-configurable roller, bir müşteri sabit rol setinin yetmediğini söyleyene kadar tahmindir; ABAC ("yalnızca kendi departmanının projelerini görebilir") gerçek bir kural talebi olmadan tasarlanamaz; izin cache ise **henüz ölçülmemiş** bir performans sorununun çözümüdür — bugün cache eklemek, olmayan bir darboğazı optimize etmektir. `resource:action` modeli üçünün de altına bozulmadan girecek şekilde tasarlandı (ARCHITECTURE §10.1), dolayısıyla erteleme bir borç değil, bilinçli bir bekleyiştir.

### 1.2 Tenant outbox publisher — ✅ kapatıldı (commit `b07966f`)

> **Durum: kapandı (2026-08-02).** Aşağıdaki tespit, işin yapılmasından **önceki** durumu anlatır ve kayıt olarak bırakılmıştır. Bugün son sütun dolu: tüketici, zamanlayıcı, repository ve teslimat hatası mekanizmasının tamamı yazıldı (migration `0009`+`0010`, `MULTI_TENANT_ARCHITECTURE.md` §12.4.2 / v2.0).

**Tespit edildiğinde: yazma yolu var, okuma yolu YOK.**

|                                    | Identity (`platform.identity_outbox`)                              | Tenant (`platform.outbox`) — **tespit** | Tenant — **bugün**                 |
| ---------------------------------- | ------------------------------------------------------------------ | --------------------------------------- | ---------------------------------- |
| Yazan                              | `IdentityOutboxEventPublisher`                                     | `OutboxEventPublisher` ✅               | ✅ değişmedi                       |
| Tüketici use case                  | `PublishIdentityEventsUseCase` ✅                                  | ❌ yok                                  | ✅ `PublishTenantEventsUseCase`    |
| Zamanlayıcı / worker               | `IdentityOutboxRelay` ✅                                           | ❌ yok                                  | ✅ `TenantOutboxRelay`             |
| Repository                         | `DrizzleIdentityOutboxRepository` ✅                               | ❌ yok                                  | ✅ `DrizzleTenantOutboxRepository` |
| Teslimat hatası mekanizması        | `attempt_count` · `last_error` · backoff · dead-letter (`0006`) ✅ | ❌ kolonlar bile yok                    | ✅ migration `0009`                |
| RLS aşımı (tenant'lar arası okuma) | gerekmiyor (tablo tenant'sız)                                      | —                                       | ✅ migration `0010` + dar rol      |

Tespit anında kod tabanında `platform.outbox`'tan **okuyan tek satır yoktu**. Satırlar birikiyor, `published_at` sonsuza kadar `NULL` kalıyor ve kısmî index `outbox_pending_idx` sınırsız büyüyordu.

**O gün işlevsel bir hata üretmiyordu:** tabloya yazılan tek event `TenantProvisioningRequested`'dır ve V1 provisioning **senkrondur** (ADR-0016 — tenant anında `active` açılır). Yani bu event'in tüketici tarafında yapması gereken bir işi yoktu; kayıt amaçlı duruyordu. Bugün de öyle — tüketici onu "işlendi" olarak işaretlemekten başka bir şey yapmıyor.

**Faz 4'ün önkoşulu olmasının sebebi:** ilk iş modülü domain event üretir ve o event'lerin teslim edilmesi gerekir. Drain süreci olmadan yazılan bir modül, "event yayınlıyorum" sanan ama hiçbir şey yayınlamayan bir modüldür — ADR-0006'nın açıkça engellemek için var olduğu sessiz hata. Altyapı artık hazır; **gerçek tüketici mantığı Faz 4'te, her event tipi için ayrı ayrı yazılacak.**

> **Beklenmedik çıktı:** iş sırasında `MULTI_TENANT_ARCHITECTURE.md` §12.4.2'nin planı **uygulanamaz** çıktı (`FORCE RLS` altında `resolve_tenant` deseni çalışmıyor) ve "üçüncü rol eklenmeyecek" öngörüsü ikinci kez düştü. Eski metin silinmedi; üstüne superseded notu eklendi (MT v2.0). Ayrıntı orada.

---

## 2. Faz 4 — İlk Gerçek Modül + AI Context Engine

> **Durum:** ✅ **Tamamlandı** (kapanış denetimi 2026-08-05) — [§2.4](#24-zorunlu-alt-adım-cicd--hosting)'ün prod koşulu **karşılanmadan**.
> **Tasarım kararları:**
> [ADR-0029](adr/0029-knowledge-module-ai-context-engine.md) — Knowledge modülü + AI Context Engine v1 (veri modeli, chunking, port'lar, akış, rate limiting) ·
> [ADR-0030](adr/0030-conversation-memory-daily-report-onboarding.md) — konuşma hafızası, günlük rapor (Queue kararı), onboarding.

### 2.1 Ne yapılacak

**Knowledge / Inbox modülü ile AI Context Engine BİRLİKTE inşa edilecek.**

İlk iş modülü olarak CRM, Finans veya İK **seçilmedi**. Seçim Knowledge/Inbox'tır.

Kapsam iki adımda belirlendi:

- **ADR-0029 (dar çekirdek):** manuel metin girişi + serbest soru-cevap.
- **ADR-0030 (genişleme, Product Owner kararı):** konuşma hafızası · günlük rapor (uygulama içi) · onboarding wizard'ı.

Hâlâ kapsam dışı: dosya eki · email entegrasyonu/bildirimi · per-tenant sağlayıcı seçimi · hassas veri redaksiyonu · tenant bazlı zaman dilimi · konuşma geçmişinin tamamını hatırlama · rapor ve onboarding özelleştirmesi. Hepsi ayrı ADR gerektirir.

### 2.2 Neden birlikte — bu fazın tek kritik gerekçesi

AI Context Engine, bir modülün üstüne **sonradan yapıştırılan bir özellik değildir**; ilk modülle **birlikte tasarlanan bir mimari temeldir**.

Bu, `CLAUDE.md`'nin kurucu kısıtının doğrudan sonucudur: _"Modüller ürün değildir, hafızadır."_ Context Engine'i ikinci veya üçüncü modülde eklemeye kalkmak, ilk modülü "AI'a bağlam üretmeyen" bir modül olarak tasarlamak demektir — ve o modül sonradan geriye dönük olarak yeniden yazılır. Knowledge/Inbox bu yüzden seçildi: kurumsal hafızanın en doğrudan taşıyıcısıdır ve Context Engine'in ilk gerçek tüketicisidir.

### 2.3 Bu fazda **zorunlu olarak** karara bağlanacak açık teknik kararlar

Dördü de bu fazın açık kalemleriydi. [ADR-0029](adr/0029-knowledge-module-ai-context-engine.md) ikisini, [ADR-0030](adr/0030-conversation-memory-daily-report-onboarding.md) bir tanesini daha kapattı — **yalnızca Cache açık**.

> **Queue kararının kapsamı dar okunmalı:** "broker kurulmuyor" demek "kuyruk yok" demek değil — **kuyruk PostgreSQL**. İşler çoğalınca, fan-out gerekince veya saniye altı gecikme istenince gerçek bir broker yeniden değerlendirilir ve o gün Cache/Redis kararıyla **birlikte** verilmelidir (ADR-0030 son bölüm).

| Karar              | Durum                                                                                                                                                                                                                      | Ne zaman                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **Vector store**   | ✅ **Karara bağlandı** — pgvector, `vector(1536)` + **HNSW** index ([ADR-0029](adr/0029-knowledge-module-ai-context-engine.md) §1)                                                                                         | —                                |
| **Object storage** | ✅ **Bu fazda gerekmiyor** — ADR-0029 dosya ekini kapsam dışı bıraktı; koşul gerçekleşmedi, **Faz 5'e devreder**                                                                                                           | Dosya eki gündeme gelince        |
| **Queue**          | ✅ **Karara bağlandı** — ayrı bir broker (BullMQ/Redis) **kurulmuyor**; zamanlanmış işler PostgreSQL tabanlı, `SKIP LOCKED` + backoff deseniyle ([ADR-0030](adr/0030-conversation-memory-daily-report-onboarding.md) §2.1) | —                                |
| **Cache**          | 🟡 Ön öneri var (Redis — [ADR-0010](adr/0010-cache-port.md)), container ayakta ama **uygulama bağlanmıyor**, **seçilmedi**                                                                                                 | İlk gerçek önbellek yükü çıkınca |

> **Search (full-text) ayrı bir sorudur ve ADR-0029 ona dokunmadı.** Modül bugün yalnızca **anlamsal** arama yapıyor (embedding + pgvector). PostgreSQL FTS ([ADR-0011](adr/0011-search-port-postgres-fts.md)) hâlâ ön öneridir ve klasik metin araması gerektiğinde gündeme gelir.
>
> Hepsi **port arkasındadır** ve öyle kalacaktır (ADR-0009/0010/0011 deseni). Sağlayıcı seçimi bir adapter kararıdır; iş mantığı hiçbirine bağlanmaz — ADR-0029'un `LLMPort` imzası bunun ilk somut sınavıdır.

### 2.4 Zorunlu alt-adım: CI/CD + Hosting

**Bu faz prod'a çıkmadan kapanmaz.** Bugüne kadar hiç prod'a çıkılmadı.

| Kalem               | Durum                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| CI (GitHub Actions) | ✅ Faz 1'de kuruldu — test + lint + typecheck                                                                                     |
| **CD**              | ✅ **VAR** — iki hedefe de **otomatik dağıtım**: her `git push` hem Railway'i (API) hem Vercel'i (web) tetikler                   |
| **Hosting**         | ✅ **KARARA BAĞLANDI** — API **Railway** (`api.kobiwise.com`) · web **Vercel** (`app.kobiwise.com`) · PostgreSQL Railway volume'ü |

⚠️ **Yukarıdaki üç satır 2026-08-31'de düzeltildi; ikisi 2026-08-09'dan beri bayattı.** Eski hâlleri (`CD ❌ Yok` · `Hosting ❌ Karara bağlanmadı`) bu satırın hemen altındaki uyarı bloğunda geçtiği gibi durur — koşulun gerçekten karşılandığı ancak neyin değiştiği görülerek okunabilir.

Gerekçe: prod'a hiç çıkmamış bir sistemin "çalışıyor" iddiası test edilmemiş bir iddiadır. Migration'ların gerçek bir veritabanında sırayla uygulanması, secret yönetimi, ortam ayrımı ve geri alma (rollback) yolu — hepsi ancak gerçek bir dağıtımda ortaya çıkar. Bu iş ne kadar ertelenirse, ilk dağıtımda karşılaşılacak sürpriz o kadar büyür.

> ### ⚠️ Bu koşul KARŞILANMADI ve Faz 4 yine de kapatıldı
>
> **Tespit Faz 5 Slice 0'da yapıldı (2026-08-05).** Yukarıdaki cümle _"Bu faz prod'a çıkmadan kapanmaz"_ diyor; Faz 4 kapanış denetiminden geçti ve Faz 5 başladı, ama **CD hâlâ yok ve hosting hâlâ karara bağlanmadı.**
>
> Kayıt bilerek duruyor ve metin **yumuşatılmadı**: bir kapı koşulunun sessizce aşılması, koşulun hiç yazılmamış olmasından kötüdür. Yukarıdaki gerekçe bugün de geçerlidir ve borç **büyüyor** — Faz 5 üç yeni migration getiriyor (`platform.rate_limits` · `platform.conversations`/`messages` · `crm.*`, [ADR-0031](adr/0031-crm-module.md)), yani "migration'ların gerçek bir veritabanında sırayla uygulanması" riski her slice ile artıyor.
>
> **Bu bir Product Owner kararıdır, mühendislik kararı değil:** ya koşul Faz 5 için yeniden bağlayıcı kılınır, ya da bilinçli olarak gevşetilip yeni bir faza taşınır. Üçüncü seçenek — yazılı durup uygulanmaması — ikisinden de kötüdür.

> ### ✅ KOŞUL ARTIK KARŞILANDI — ve iki kez, iki ayrı hedefte (2026-08-31)
>
> **Yukarıdaki uyarı bloğu silinmedi**: borcun ne kadar sürdüğü ancak orada
> durduğu için okunabilir. Bugün kapandığı da burada yazar.
>
> | Katman        | Nerede                                                  | Adres                                              |
> | ------------- | ------------------------------------------------------- | -------------------------------------------------- |
> | API (NestJS)  | **Railway** · proje `attractive-tenderness`             | **https://api.kobiwise.com**                       |
> | Web (Next.js) | **Vercel** · takım `KOBIWISE` · proje `kobiwise-web`    | **https://app.kobiwise.com**                       |
> | PostgreSQL    | Railway (volume) — beş rol, RLS + FORCE, `vector` 0.8.6 | — (public TCP proxy yok; `railway ssh` ile okunur) |
>
> ⚠️ **CD'nin "var" olması bir rahatlama değil, bir SORUMLULUKTUR:** dağıtım
> otomatiktir ve `railway.api.json`'un `preDeployCommand`'i
> `db:preflight && db:migrate` çalıştırır — yani **her push migration uygular.**
> Kural değişmedi (`CLAUDE.md`, "⚠️ Railway prod CANLI"): migration içeren bir
> push'tan önce Product Owner'a **açıkça haber verilir**.
>
> ⚠️ **Her push artık İKİ yere gider.** Vercel tarafında iki ayar bunu
> güvenli kılar ve ikisi de gerçek bir hatadan sonra yazıldı: production dalı
> `feature/tenant-multi-tenancy-core`'a **elle çekildi** (Vercel varsayılan
> olarak bayat `main`i almıştı) ve **Ignored Build Step** yalnızca üretim
> dalını derler (repodaki dokuz dependabot dalı aksi hâlde dokuz önizleme
> derlemesi üretirdi).
>
> ⚠️ **İki alt domain bir tercih değil bir ZORUNLULUKTU** ve bu, hosting
> kararının kendisini bağlar: refresh çerezi `SameSite=Strict` taşır
> (ADR-0026) ve `*.vercel.app` ile `*.up.railway.app` Public Suffix listesinde
> **ayrı sitelerdir** — çerez hiç gönderilmez, oturum yenileme **sessizce**
> bozulurdu. Sağlayıcı değiştirilecekse bu kısıt birlikte taşınır.
>
> Kapanışın kanıtı bir iddia değil bir **koşudur**: kayıt → doğrulama →
> giriş → tenant açma zinciri **web arayüzünden**, gerçek tarayıcıda, prod'da
> uçtan uca koştu ve sayfa yenilemesinden sonra oturum ayakta kaldı. Ayrıntı
> ve prod log'u [`CLAUDE.md`](../CLAUDE.md) "⚠️ WEB PROD'DA CANLI"
> bölümündedir.

### 2.5 Kapı koşulu (Faz 4'e giriş)

🟢 **Karşılandı.** Tek koşul olan tenant outbox drain süreci yazıldı (commit `b07966f`, [§1.2](#12-tenant-outbox-publisher--✅-kapatıldı-commit-b07966f)).

Başka engel yok: RBAC + tenant context + RLS zinciri uçtan uca çalışıyor, modül→Authorization permission deklarasyonu deseni bir kez uygulandı (`member:read`), ve artık bir iş modülünün yayınlayacağı domain event'lerin teslim yolu da mevcut.

---

## 3. Faz 5 — Modül Genişlemesi

> **Durum:** 🟢 **Başladı** (2026-08-05).
> **Tasarım kararı:** [ADR-0031](adr/0031-crm-module.md) — CRM modülü + Context Engine'in platforma yükselmesi.

Faz 5 **on iki iş modülü** kapsar. Sıra ve kapsam [§3.5](#35-modül-sıralaması--on-iki-modül-product-owner-kararı)'te. **İlk üç modül bitti** — CRM · Projeler ([§3.6](#36-2-modül-projeler--yeni-olan-tek-şey-cross-modül-referans)) · Finans ([§3.7](#37-3-modül-finans--desen-üçüncü-kez-ama-üç-yeni-soruyla)) — üçü de prod'da. Sıradaki **4. modül: Randevu/Rezervasyon**.

> **Kapı koşulu:** Faz 4'ün **AI Context Engine deseni en az bir modülde kanıtlanmış** olmalı. 🟢 **Karşılandı.**

Kanıtlanmamış bir deseni üç modüle birden uygulamak, üç modülü birden yeniden yazmak demektir. Faz 4'ün Knowledge/Inbox'ı bu desenin referans uygulamasıdır; Faz 5 onu **ikinci ve üçüncü kez** uygular — desen ancak tekrarlandığında desen olur.

### 3.1 İlk modül: CRM (Product Owner kararı)

Gerekçe: en çok AI bağlamı üretecek modül odur — verisi **anlatısaldır** (görüşme notları) ve Knowledge'ın `notes`/`note_chunks` desenine mimari olarak en uyumlu ilk adaydır.

### 3.2 Tekrarın ürettiği şey: soyutlama

Bu fazın asıl çıktısı ikinci bir modül değil, **tekrarın ortaya çıkardığı ortak zemindir.** ADR-0031 bu yüzden yalnızca CRM'i tanımlamıyor; Faz 4'ün Knowledge içinde biriken platform kodunu dışarı taşıyor:

| Ne                                     | Faz 4'te                             | Faz 5'te                                            |
| -------------------------------------- | ------------------------------------ | --------------------------------------------------- |
| `EmbeddingPort` · `LLMPort` · chunking | `modules/knowledge/` içinde          | **`shared/`** + adapter'lar `infrastructure/ai/`'da |
| Oran sınırı sayacı                     | `knowledge.rate_limits`              | **`platform.rate_limits`**                          |
| Retrieval ucu                          | `POST /knowledge/ask`                | **`POST /ask`** — `platform/context`                |
| Konuşma hafızası                       | `knowledge.conversations`/`messages` | **`platform.conversations`/`messages`**             |

Knowledge'ın bunları içinde taşıması bir karar değil, o günkü tek tüketicinin tesadüfüydü. `import/no-restricted-paths` bunu **makine tarafından** ortaya çıkardı: `modules/crm` klasörü açılır açılmaz Knowledge'ın katmanları CRM'e kapanır.

### 3.3 Fazın en önemli kararı: tek kurumsal hafıza

Modül başına `/ask` ucu **reddedildi**. CLAUDE.md'nin kurucu örneği ("son 6 ayımızı analiz et" → CRM + Finans + Projeler _birlikte_) cross-modül bir sorudur ve modül başına uçlarla **yapısal olarak** cevaplanamaz.

Çözüm modül sınırlarını korur: retrieval `platform/context`'e taşınır, modüller `RetrievalContributor` ile **kendi şemalarından** katkı verir, platform birleştirir. Hiçbir modül diğerinin şemasını okumaz (Mutlak Kural 5–6). ADR-0025'in permission registry deseniyle birebir aynı disiplin: **platform mekanizmayı sahiplenir, modül katkısını deklare eder, platform içeriği yorumlamaz.**

Katkıcılar **çağıranın izinlerine göre elenir** — bu bir ayrıntı değil, tasarımın güvenlik ekseni: filtre olmasaydı birleşik hafıza, kullanıcının göremediği bir kaydın içeriğini özet üzerinden sızdıran bir yan kapı olurdu. RLS bunu yakalamaz (tenant sınırını korur, tenant _içindeki_ izin sınırını değil).

### 3.4 Faz 5'in ilk kapı koşulu: ölçüm

**AI maliyet takibi, ilk CRM satırından önce yazıldı** (Slice 0.5 — [§8.1](#81-gözlemlenebilirlik-neden-faz-4e-kadar)). Faz 5 maliyeti üç ayrı yönden artırıyor: CRM ikinci bir embedding üreticisi, yapısal katkıcı her soruya sabit token ekliyor, ve fan-out tek bir `/ask`'i N kaynağa dokunduruyor. Ölçüm bunlardan **sonra** kurulsaydı, artışın nereden geldiği ayırt edilemezdi.

> ### ✅✅ FAZ 5 TAMAMEN KAPANDI — on iki modülün on ikisi de canlı (2026-08-27)
>
> **12. modül Sadakat Programı ile Faz 5 bitti.** Kapanış [ADR-0051](adr/0051-sadakat-programi-modulu.md)'in
> HAFİF kapanış denetiminde doğrulandı ve o denetim aynı zamanda **Faz 5'in
> genel kapanış denetimidir** — iki toplu ölçüm tek seferlik olarak koşuldu:
>
> | Doğrulama                                                   | Sonuç                                                                                                                                                                                    |
> | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | ⚠️ **13 iş şemasının tamamı** prod'da **RLS + FORCE**       | ✅ **13/13 TAMAM** (`knowledge` · `crm` · `projects` · `finance` · `appointments` · `documents` · `inventory` · `suppliers` · `invoicing` · `hr` · `feedback` · `marketing` · `loyalty`) |
> | ⚠️ **12 modülün kök rotası** prod'da gerçek istekle **401** | ✅ **12/12 401** — ve olmayan yollar **404**, yani cevap **ayırt edici**                                                                                                                 |
>
> ⚠️ **`platform` bu sayıma DAHİL DEĞİLDİR ve bu doğrudur:** on tablosu
> (`users`, `credentials`, `refresh_tokens`, `token_families`,
> `login_attempts`, doğrulama kodları, `identity_outbox`) **tenant kapsamlı
> değildir** — Faz 3'ün kimlik olaylarının hepsi `tenantId = null` taşır.
> Onlara tenant RLS koymak, olmayan bir kapsamı **var gibi göstermek** olurdu.
>
> ⚠️ **401 ile 404 arasındaki fark bu denetimin ta kendisidir:** 404 _"bu uç
> YOK"_ demektir (ölü routing), 401 _"uç VAR ve kimlik istiyor"_ demektir.
> ADR-0035'in kapanış denetiminde öğrenilen ders — _"`/api/docs`in 404'ü tek
> başına ayırt edici DEĞİLDİR"_ — burada tersine uygulandı: 401'lerin yanına
> **kasıtlı 404'ler** kondu.
>
> ⚠️ **Faz 6'nın kapı koşulu ([§4](#4-faz-6--faturalama)) böylece KARŞILANDI.**
> Koşul 2026-08-08'de _"1–2 modül"den on iki modülün TAMAMINA_ sıkılaştırılmıştı;
> bugün on ikisi de canlı. ⚠️ **Ama Faz 6 bir "başla" düğmesi değildir:**
> [§8.2](#82-kvkkgdpr-neden-faz-6-öncesi)'nin KVKK kontrol noktası ve
> [§8.5](#85-retention-borcu-yirmi-dört-tablo-tek-karar)'in **yirmi dört
> tablolu** retention borcu **hâlâ açıktır** ve ikisi de gerçek müşteri verisi
> girmeden önce karara bağlanmalıdır. ⚠️ İK'nın maaş yüzeyi ve Sadakat'in puan
> bakiyesi o kontrol noktasının **iki yeni girdisidir**.

### 3.5 Modül sıralaması — on iki modül (Product Owner kararı)

> **Karar tarihi:** 2026-08-08. Bu sıra Faz 5'in **kapsamını** tanımlar ve [§4](#4-faz-6--faturalama)'ün kapı koşulunu belirler.

| #      | Modül                              | Kapsam notu                                                                                                                                                                                                                                                                       | Durum    |
| ------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **1**  | **CRM**                            | Şirket · kişi · fırsat · takip · görüşme; iki `RetrievalContributor` ([ADR-0031](adr/0031-crm-module.md))                                                                                                                                                                         | ✅ Bitti |
| **2**  | **Projeler**                       | Proje · görev · ilerleme notu; iki `RetrievalContributor` ([ADR-0033](adr/0033-projects-module.md))                                                                                                                                                                               | ✅ Bitti |
| **3**  | **Finans**                         | Gelir · gider · nakit akışı — "finansal hafıza" ([ADR-0034](adr/0034-finance-module.md))                                                                                                                                                                                          | ✅ Bitti |
| **4**  | **Randevu / Rezervasyon**          | Takvim tabanlı kayıt; iki `RetrievalContributor` ([ADR-0035](adr/0035-randevu-rezervasyon-modulu.md))                                                                                                                                                                             | ✅ Bitti |
| **5**  | **Belge / Sözleşme Yönetimi**      | Object storage kararını tetikledi ve **kapattı**: Cloudflare R2 ([ADR-0037](adr/0037-belge-sozlesme-yonetimi.md))                                                                                                                                                                 | ✅ Bitti |
| **6**  | **Stok / Envanter**                | Kalem · **türetilmiş** miktar · değiştirilemez defter ([ADR-0039](adr/0039-stok-envanter-modulu.md))                                                                                                                                                                              | ✅ Bitti |
| **7**  | **Tedarikçi Yönetimi**             | Firma · kişi · **ekleme-yalnız** görüşme günlüğü; **TEK** `RetrievalContributor` ([ADR-0040](adr/0040-tedarikci-yonetimi-modulu.md))                                                                                                                                              | ✅ Bitti |
| **8**  | **Teklif / Fatura Oluşturma**      | Teklif + fatura taslağı, TEK tablo + `kind`; **TEK** `RetrievalContributor` (YAPISAL) ([ADR-0041](adr/0041-teklif-fatura-modulu.md))                                                                                                                                              | ✅ Bitti |
| **9**  | **İK / Personel**                  | Çalışan · **maaş (AI'dan izole)** · **izin**; ⚠️ **sağlık verisi YOK** · **SIFIR** `RetrievalContributor` ([ADR-0043](adr/0043-ik-personel-modulu.md) · [ADR-0044](adr/0044-ik-v2-izin-ve-zenginlestirilmis-calisan-kaydi.md))                                                    | ✅ Bitti |
| **10** | **Müşteri Geri Bildirimi / Anket** | Puan + opsiyonel yorum; **TEK** `RetrievalContributor` (ANLAMSAL) — ⚠️ yapısal aday **liyakatli ama ASKIDA** ([ADR-0045](adr/0045-musteri-geri-bildirim-modulu.md))                                                                                                               | ✅ Bitti |
| **11** | **Kampanya / Pazarlama Notları**   | Ad · kanal · tarih aralığı · durum · sonuç notu; **İKİ** `RetrievalContributor` (anlamsal `campaign-notes` + ⚠️ **yapısal `campaign-gap`**) — ⚠️ **T2 ATEŞLEDİ** ([ADR-0047](adr/0047-kampanya-pazarlama-modulu.md) · [ADR-0050](adr/0050-retrieval-taban-buyukluk-revizyonu.md)) | ✅ Bitti |
| **12** | **Sadakat Programı**               | Hesap (CRM kişisine **ZORUNLU** bağlı) · **değiştirilemez puan defteri** · **türetilen** bakiye; **SIFIR** `RetrievalContributor` — ⚠️ kademe v2'ye ertelendi ([ADR-0051](adr/0051-sadakat-programi-modulu.md))                                                                   | ✅ Bitti |

> ### ⚠️ 12. modülün kapsamı DARALTILDI — "kademe" v2'ye ertelendi (2026-08-26)
>
> **Bu satır 2026-08-26'da güncellendi.** Eski kapsam notu silinmedi, hangi
> yarısının düştüğü görülsün diye:
>
> > ~~"Puan · **kademe**"~~
>
> [ADR-0051](adr/0051-sadakat-programi-modulu.md) §10.1 yalnızca **puanı**
> kapsıyor. Gerekçe üç katmanlı ve üçü de aynı yere çıkıyor:
>
> 1. ⚠️ **Kademe bir KURAL MOTORUDUR, bir kolon değil.** Eşikler tenant'a göre
>    değişir (yani `finance.categories` deseninde **ikinci bir CRUD yüzeyi**),
>    değerlendirme **ne zaman** koşar (her okumada mı, gecede bir mi → Queue
>    kararı), ve **düşme** politikası ayrı bir karardır (bir kez Altın olan hep
>    Altın mı).
> 2. ⚠️ **AYRICALIKSIZ BİR KADEME BİR ETİKETTİR.** Kademenin var olma sebebi
>    müşteriye bir **fayda** vermektir (daha hızlı puan, özel ödül); ikisi de
>    kapsam dışı (otomatik kazandırma kuralı · ödül kataloğu). Bugün eklenirse
>    modül müşteriye _"Altın üyesiniz"_ der ve **hiçbir şey vermez**.
> 3. ⚠️ **Kademe TÜRETİLEBİLİR ve o yüzden ERTELENEBİLİR.** Bakiye/kazanım
>    üzerinden hesaplanır, yani ⚠️ **bugün kaydedilmeyen bir veri yoktur** —
>    defter tamdır. ADR-0033'ün kuralı: _"sonradan eklemek mümkün, geri almak
>    değil."_ Erteleme **hiçbir veri kaybettirmiyor** ve kararı **tersine
>    çevrilebilir** bırakıyor.
>
> ⚠️ **Bu bir aşama değil bir SIRA kararıdır** ve tetikleyicisi yazılıdır: önce
> ödül kataloğu + ayrıcalık, sonra kademe. ⚠️ Aynı gün **yapısal katkıcı
> kararı da yeniden sorulur** — bir ödül eşiği, bu modülün ilk **kullanıcı
> beyanlı eşiği** olur ve ADR-0051 §3.4'ün _"alarmın girdisi yok"_ bulgusu
> düşer.

**Sıra keyfî değil, üç bağımlılık taşıyor:**

- **8 → 3.** Teklif/Fatura, Finans'ın veri modeli üzerine oturur. Finans'tan önce yazılırsa kendi paralel gelir modelini kurar ve sonra göç eder.
- **7 → 1.** Tedarikçi Yönetimi bilinçli olarak **ucuz** konumlandırıldı: CRM'in şirket/kişi/etkileşim şekli neredeyse birebir tekrar eder. Bu sıradaki tek "maliyeti düşük olduğu için burada" kalemidir — CRM deseni oturmadan öne alınırsa ucuzluğu kaybolur.
- **5 → object storage.** Belge/Sözleşme, [§2.3](#23-bu-fazda-zorunlu-olarak-karara-bağlanacak-açık-teknik-kararlar)'te "dosya eki gündeme gelince" diye ertelenen **object storage kararını zorunlu kılar**. Karar 5. modülden önce verilmelidir; o modülün ilk satırı yazılırken vermek geç kalmaktır.

> ### ⚠️ 9. modülün kapsamı bir **sınırdır**, bir aşama değil
>
> **Bu not 2026-08-25'te GÜNCELLENDİ ve kapsam İKİYE AYRILDI.** Eski metin
> maaş ile sağlık verisini tek bir kalem gibi ele alıyordu; ikisi **aynı sınıf
> değildir** ve ADR-0043 bunu ayırdı. Eski cümle silinmedi, aşağıda hangi
> yarısının değiştiği görülsün diye:
>
> > ~~"İK/Personel **yalnızca** ekip listesi, rol ve iletişim bilgisi tutar.
> > **Maaş, bordro ve sağlık verisi kapsam dışıdır**."~~
>
> #### ⚠️ SAĞLIK VERİSİ — SINIR AYNEN DURUYOR
>
> Sebep teknik değil hukukidir: sağlık verisi KVKK m.6'da **özel nitelikli
> kişisel veri**dir. Dar istisna yalnızca **sağlık kuruluşlarına ve sır saklama
> yükümlülüğü altındaki hekimlere** tanınmıştır; genel bir İK modülü bu tanıma
> girmez. Yani gereken şey her çalışandan **açık rıza** + Kurul'un 2018/10
> sayılı kararının zorunlu ek tedbirleridir (şifreleme, ayrı erişim günlüğü,
> 2FA, ayrı politika). ⚠️ **Bu, "AI'dan izole etmekle" çözülmez** — kendi
> başına ayrı bir iştir ve **ayrı bir ADR** ister.
>
> ⚠️ Sınırın taşıyıcıları koda YAZILDI, niyete bırakılmadı: `hr.employees`te
> **serbest not alanı yoktur** ve izin türleri listesinde **`sick`/raporlu
> yoktur** — üç katmanda birden (şema CHECK'i · Zod `.strict()` · arayüz
> listesi). Bir sınır koyup yanına boş bir metin kutusu bırakmak, sınırı
> **kullanıcıya ihlal ettirmek** olurdu.
>
> #### ⚠️ MAAŞ — GİRDİ, AMA AI'DAN İZOLE (Product Owner kararı, 2026-08-24)
>
> Maaş **özel nitelikli veri değildir**; bir ekip listesi tutup "kim ne
> kazanıyor" sorusunu cevaplayamamak modülü işe yaramaz kılıyordu. Kapsama
> alındı ve **üç katmanla** izole edildi ([ADR-0043](adr/0043-ik-personel-modulu.md) §4.2):
> ayrı tablo (`hr.compensation_records`) · ayrı izin (`compensation:read`,
> yalnızca owner/admin) · **hiçbir `RetrievalContributor`a bağlı değil**.
>
> ⚠️ Somut sonucu: maaş `POST /ask`e **hiç görünmez**, embedding'e ve LLM'e
> **hiç gitmez**. İK, Faz 5'in **sıfır katkıcılı ilk modülüdür** ve bu bir
> eksik değil bir **güvenlik özelliğidir** — bir maaş rakamının modele gitmesi
> için önce şemanın, sonra API'nin, sonra iznin değişmesi gerekir.
>
> ⚠️ **Maaş yüzeyi [§8.2](#82-kvkkgdpr-neden-faz-6-öncesi)'deki KVKK kontrol
> noktasından GEÇMEDEN gerçek müşteri verisiyle kullanılmamalıdır.** Bu, ADR'de
> de yazılıdır ve Faz 6'nın kapı koşulunun girdisidir.

> **Knowledge bu listede yok** ve bu doğrudur: o Faz 4'ün modülüdür ([§2](#2-faz-4--i̇lk-gerçek-modül--ai-context-engine)) ve zaten yazıldı. Liste Faz 5'in kapsamını sayar, sistemdeki tüm modülleri değil.

### 3.6 2. modül: Projeler — yeni olan tek şey cross-modül referans

> **Tasarım kararı:** [ADR-0033](adr/0033-projects-module.md) — kabul edildi, 2026-08-10.

Bu modülün ADR'si CRM'inkinden **kısadır ve bu kasıtlıdır**: port'lar `shared/`'da, `RetrievalContributor` platformda, RLS şablonu ve kaynak bazlı izin modeli kanıtlanmış durumda. Projeler bunlardan **yalnızca tüketicidir** — [§3.2](#32-tekrarın-ürettiği-şey-soyutlama)'nin vaadinin ilk sınavı.

**Sıralama açısından burada kayda değer tek şey şudur:** Projeler, başka bir modülün kaydına işaret etmek isteyen **ilk modüldür** (proje → CRM şirketi, opsiyonel). CRM'de bu soru hiç doğmadı çünkü CRM hiçbir modülün verisine bakmıyordu. Cross-schema FK **yasak** olduğu için (Mutlak Kural 5) ADR-0033 §2 üç parçalı bir desen kurdu:

| Parça                                               | Neyi çözer                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| FK yok, çıplak `uuid` kolon                         | Mutlak Kural 5                                                                                          |
| Ad denormalize edilmez, public interface'ten okunur | Yeniden adlandırmada bayatlamayı — ikinci doğruluk kaynağı oluşmasını                                   |
| Okuma, hedef kaynağın iznine bağlı (`company:read`) | Yetkilendirmeyi delen yan kapıyı ([§3.3](#33-fazın-en-önemli-kararı-tek-kurumsal-hafıza)'ün aynı dersi) |

**Bu desen kalan on modülü bağlar** — Teklif/Fatura → Finans, Tedarikçi → Stok, Sadakat → CRM. Bir kez daha tekrarlandığında (3. modül, Finans) genelleştirme değerlendirilir; bugün genelleştirmek, tek örnekten desen çıkarmak olurdu.

⚠️ **Bağımlılık yönü TEK YÖNLÜDÜR: Projeler → CRM.** Tersi (CRM'in şirket detayında projeleri listelemesi) kapsam dışıdır çünkü bir modül döngüsü kurardı. Bu tuzak projede bir kez yaşandı (Tenant ↔ Identity) ve çözümü `forwardRef` değil **üçüncü bir modül** oldu (`platform/session`). Ters yön istenirse aynı çözüm uygulanır.

### 3.7 3. modül: Finans — desen üçüncü kez, ama üç yeni soruyla

> **Tasarım kararı:** [ADR-0034](adr/0034-finance-module.md) — kabul edildi, 2026-08-11.
> **Durum:** ✅ **Bitti** — yedi slice, HAFİF kapanış denetimi 2026-08-12.

**Sıralama açısından burada kayda değer üç şey var** ve üçü de bu dokümanın kendi kalemlerine dokunuyor:

1. **[§3.6](#36-2-modül-projeler--yeni-olan-tek-şey-cross-modül-referans)'nın "bir kez daha tekrarlandığında genelleştirme değerlendirilir" cümlesi KARŞILANDI ve cevap "hayır" oldu.** Finans cross-modül referansı **iki hedefe birden** istiyor (CRM şirketi + Projeler projesi), yani desen aynı modülde iki kez tekrarlanıyor. Genelleştirme (ortak bir `ExternalRef` yardımcısı) değerlendirildi ve **reddedildi** — gerekçe mimari, "erken" değil: ortak bir yardımcı, izin kapısını ya çağırana ya `shared/`'a devrederdi ve desenin **önlemek için var olduğu** sızıntıyı geri getirirdi (ADR-0034 §4.1). Genelleşen şey kod değil **sözleşme şeklidir**.

2. **Bağımlılık grafiği ilk kez DALLANIYOR:** `Projeler → CRM`, `Finans → CRM`, `Finans → Projeler`. Üç kenar, döngü yok — bir **DAG**. Kalan dokuz modülü bağlayan kural: ⚠️ **yeni bir kenar eklenmeden önce döngü kontrol edilir**; ters yön isteniyorsa çözüm `forwardRef` değil üçüncü bir modüldür.

3. **Finans, projedeki İLK DAR permission kataloğunu getiriyor:** `member` ve `viewer` finansı hiç görmez (ADR-0034 §7). Bunun sıralama açısından önemi şudur: [§3.3](#33-fazın-en-önemli-kararı-tek-kurumsal-hafıza)'ün izin filtresi bugüne kadar **hiç gerçekten tetiklenmedi** — dört rolün dördü de her kaynağı görüyordu. Finans o filtrenin **ilk gerçek tetikçisidir** ve mekanizma ilk kez gerçek bir rolle sınanabilir hale gelir.

**8 → 3 bağımlılığı** ([§3.5](#35-modül-sıralaması--on-iki-modül-product-owner-kararı)) bu modülle birlikte etkinleşir: Teklif/Fatura, Finans'ın veri modeli üzerine oturacak. ADR-0034 fatura oluşturmayı, tahakkuk (alacak/borç) muhasebesini, kur çevrimini ve vergi hesabını **açıkça kapsam dışı** bıraktı — bu bir aşama değil bir **sınırdır**, [§3.5](#35-modül-sıralaması--on-iki-modül-product-owner-kararı)'in 9. modülünde (İK) çizilen sınırla aynı disiplinde.

| Slice | Ne                                                                     | Migration                   | Durum |
| ----- | ---------------------------------------------------------------------- | --------------------------- | ----- |
| 1     | `finance` şeması + kategoriler (tenant-tanımlı sözlük, yön, arşivleme) | `0023_finance_schema`       | ✅    |
| 2     | İşlemler — tutar/para birimi/tarih, bileşik FK ile yön zorlaması       | `0024_finance_transactions` | ✅    |
| 3     | Nakit akışı özeti — **para birimi bazında**, toplanmaz                 | —                           | ✅    |
| 4     | Cross-modül referans + **`projects.public.ts`**                        | —                           | ✅    |
| 5     | Yorumlar + embedding + `reindex` + oran sınırı                         | `0025_finance_commentaries` | ✅    |
| 6     | İki katkıcı (`finance-commentaries` · `finance-cashflow`)              | —                           | ✅    |
| 7     | Frontend (yeşil) + **HAFİF** kapanış denetimi                          | —                           | ✅    |

> ⚠️ **Retention borcu [§8.5](#85-retention-borcu-onüç-tablo-tek-karar)'te Slice 5 ile ONİKİYE ÇIKTI** (`finance.commentaries` + `finance.commentary_chunks`) ve vektör taşıyan tablo sayısı **dörde** çıktı. Cümle Slice 7'de gelecek zamandan geçmiş zamana alındı; tablolar Slice 5'te gerçekten açıldı ve liste o gün değil **modül kapanırken** güncellendi.
>
> ⚠️ `finance.transactions` o listeye **girmeyecek** ve sebebi terstir: sınırsız büyür ama mali kayıt saklamak **yasal bir yükümlülüktür** (TTK). Yani [§8.2](#82-kvkkgdpr-neden-faz-6-öncesi)'nin KVKK kontrol noktasına bir girdidir, ama cevabı diğerlerinin tersidir: **silinmez**.

### 3.8 4. modül: Randevu / Rezervasyon — desen tutuyor, ama havuz doldu

> **Tasarım kararı:** [ADR-0035](adr/0035-randevu-rezervasyon-modulu.md) — kabul edildi, 2026-08-12.
> **Durum:** ✅ **Bitti** — altı slice, HAFİF kapanış denetimi 2026-08-13.

**Sıralama açısından kayda değen dört şey var:**

1. **Anlatısal içerik ilk kez PARÇALANMADAN embed edildi.** Önceki dört modülün hepsi `<parent> + <parent>_chunks` ikilisi kurdu; Randevu **tek tablo**dur ve vektör satırın kendi kolonundadır (ADR-0035 §3). Gerekçe veri şeklidir, tembellik değil: servis notu tanımı gereği kısadır ve üst sınırı `TARGET_CHUNK_CHARS`'a eşitlenmiştir — yani parçalayıcı her zaman **tek parça** üretirdi ve ikinci tablo yalnızca bir join maliyeti olurdu. ⚠️ Bunun retention tarafındaki sonucu [§8.5](#85-retention-borcu-onüç-tablo-tek-karar)'tedir: "chunk tabloları ebeveynleriyle birlikte gider" kuralının **istisnası değil, gereksizleştiği** ilk kalem.

2. **Cross-modül referans üçüncü kez tekrarlandı ve genelleştirme yine REDDEDİLDİ.** [§3.7](#37-3-modül-finans--desen-üçüncü-kez-ama-üç-yeni-soruyla)'nin gerekçesi aynen geçerlidir; Randevu tek hedefe (CRM kişisi) işaret eder ve `ContactDirectory.findNames(ids, role)` sözleşme şeklini **dördüncü kez** tekrarlar. Yeni kenar `Randevu → CRM`; grafik hâlâ bir DAG.

3. **`module-kit` ilk kez ilk günden GENEL doğdu.** `week-grid` haftalık ızgarayı çizer ve "randevu" kelimesini **bilmez** (ADR-0035 §7); genelliği bir birim testi kilitler — bileşenin kodunda modüle özgü hiçbir ad geçemez. Önceki kalemler CRM'de doğup Projeler'de dışarı çıkarılmıştı; bu, o dersin uygulanmasıdır. Takvim kütüphanesi (FullCalendar / react-big-calendar) **reddedildi** — recharts'ın reddedildiği gerekçeyle aynı.

4. ⚠️ **[§3.3](#33-fazın-en-önemli-kararı-tek-kurumsal-hafıza)'ün top-K havuzu İLK KEZ DOLDU ve bu, kalan sekiz modülü ilgilendirir.** Katkıcı sayısı dokuza çıktı (beş anlamsal + dört yapısal) ama global top-K hâlâ **8**'dir. Kapanış denetiminin ölçümü (2026-08-13, ADR-0035 §6.3): üç farklı soruda da dağılım **aynı** kaldı ve iki yapısal katkıcı (`appointment-schedule` · `finance-cashflow`) havuza **hiç giremedi**. İzole tenant testi ikisinin de **çalıştığını** kanıtladı — yani bu bir hata değil, **kapasite sınırıdır**: anlamsal katkıcıların en iyi isabeti 1.0 skoruyla dönerken yapısal skorlar 0.95/0.90/0.75'te tavanlıdır. Product Owner kararı: **rerank / kaynak kotası bugün açılmadı**, bulgu kayda geçti. 5. modül altıncı anlamsal kaynağı eklediğinde soru kendiliğinden yeniden sorulacaktır.

---

## 4. Faz 6 — Faturalama

Abonelik, plan/kota, ödeme sağlayıcısı entegrasyonu.

**Platform admin paneli** bu fazın parçasıdır (ayrı bir faz değil): tüm tenant'ları görebilme, kullanıcı sayıları, ödeme/faturalama durumu takibi, sistem sağlığı (dead-letter kayıtları, worker durumu). Gerçek ödeme yapan müşteriler geldiğinde zorunlu hale gelir — bugünden inşa etmek erken.

> **Kapı koşulu:** [§3.5](#35-modül-sıralaması--on-iki-modül-product-owner-kararı)'teki **on iki modülün TAMAMI** bitmiş olmalı.

> ### 🔴 Kapı koşulu sertleşti — "1–2 modül" ARTIK GEÇERLİ DEĞİL
>
> **Product Owner kararı, 2026-08-08.** Önceki koşul _"en az 1–2 gerçek modül var olmalı"_ idi ve bugün **karşılanmış sayılabilirdi** (Knowledge + CRM). Yeni koşul on iki modülün tamamıdır. Eski metin burada bırakıldı ki koşulun **gevşetildiği değil sıkılaştırıldığı** görülsün.
>
> **Gerekçe:** faturalama, ürünün ne sattığını bildiği gün yazılır. Bugün satılan şeyin adı yok — iki modül bir "AI işletim sistemi" değil, iki modüldür. Plan sınırlarının (kullanıcı sayısı, depolama, AI token bütçesi) neye göre çizileceği ancak **tam ürün** kullanımdayken bilinir. İki modülün üstüne kurulan bir fiyatlandırma, on ikinci modül geldiğinde yeniden yazılır ve o zaman **gerçek ödeme yapan müşteriler** üstündedir — yani en pahalı anda.

Faturalanacak bir değer yokken faturalama inşa etmek, fiyatlandırılacak şeyi tahmin ederek modellemektir.

> ⚠️ **Bu kararın bilinçli bedeli: gelir en sona itildi.** On iki modül uzun bir yoldur ve bu süre boyunca sistem para kazanmaz. Karar bunu bilerek verdi — ama iki kalem bu erteleme yüzünden **daha da kritik** hale geldi ve Faz 6'ya kadar bekleyemez: [§2.4](#24-zorunlu-alt-adım-cicd--hosting)'ün prod/hosting koşulu (on iki modülün tek bir dağıtım denemesi yapılmadan yazılması, ilk dağıtımdaki sürprizi on iki katına çıkarır) ve [§8.2](#82-kvkkgdpr-neden-faz-6-öncesi)'nin KVKK kontrol noktası (koşul "Faz 6 öncesi" diyordu; Faz 6 uzaklaştıkça bu cümle KVKK'yı da erteliyormuş gibi okunabilir — **okunmamalı**, kontrol noktası veri girmeden önce gerekir ve veri şimdi giriyor).

> ### ⚠️ SIRA NOTU — Landing Page + kayıt akışı BU FAZDAN ÖNCE gelir (2026-08-27)
>
> **Product Owner kararı.** Bu fazın kapı koşulu (_"on iki modülün TAMAMI"_)
> **karşılandı** ve karşılanmış olarak duruyor — ⚠️ **değişen şey koşul değil
> SIRADIR.**
>
> Gerekçe tek cümleyle: ⚠️ **gerçek kullanıcı olmadan Faturalama'nın anlamı
> yoktur.** Abonelik, plan/kota ve ödeme sağlayıcısı — üçü de faturalanacak bir
> kullanıcının var olmasını varsayar. Bugün prod'da **sıfır kullanıcı ve sıfır
> tenant** vardır ve dışarıdan biri **kaydolamaz**: kayıt akışına giden genel
> bir kapı yoktu.
>
> Ayrıntı ve kapsam [§7](#7-faz-9--landing-page--marka-kimliği)'dedir.

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

> ### ✅ KAPI KOŞULU KARŞILANDI — ve iş FAZ 6'NIN ÖNÜNE ALINDI (Product Owner kararı, 2026-08-27)
>
> **Eski metin silinmedi**, aşağıda duruyor: koşulun karşılandığı ve sıranın
> değiştiği görülsün.
>
> #### Kapı koşulu neydi, neden kapandı
>
> Koşul _"domain ve marka netleşmeden başlamaz"_ idi. **İkisi de netleşti:**
>
> | Koşul  | Durum                                                                                                                        |
> | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
> | Domain | ✅ **kobiwise.com** kayıtlı (Namecheap)                                                                                      |
> | Marka  | ✅ Logo tamamlandı — yazılı logo + K işareti, kullanım kuralıyla birlikte ([ADR-0038](adr/0038-oda-tasarim-sistemi.md) §7.1) |
>
> ⚠️ Marka tarafı aslında **Faz 5 içinde kapanmıştı**: ODA tasarım sistemi
> favicon ve mobil ikonu da o işte ekledi (daha önce hiç yoktu) ve
> `(auth)/layout.tsx` yazılı logoyu "Business OS" alt satırıyla birlikte
> kullanıyor. Bugün eklenen tek şey **domain**dir.
>
> #### ⚠️ SIRA DEĞİŞTİ: Landing Page + kayıt akışı, Faz 6'DAN ÖNCE
>
> **Gerekçe tek cümleyle: gerçek kullanıcı olmadan Faturalama'nın anlamı
> yoktur.** Faz 6 abonelik, plan/kota ve ödeme sağlayıcısıdır — üçü de
> **faturalanacak bir kullanıcının var olmasını** varsayar. Bugün prod'da
> **sıfır kullanıcı ve sıfır tenant** vardır ve dışarıdan biri kaydolamaz:
> kök rota bir landing page değildi ve kayıt akışına giden hiçbir genel kapı
> yoktu.
>
> ⚠️ **Bu, [§4](#4-faz-6--faturalama)'ün kapı koşulunu GEVŞETMEZ.** O koşul
> (_"on iki modülün TAMAMI"_) 2026-08-27'de **karşılandı** ve karşılanmış
> olarak duruyor. Değişen şey koşul değil **sıradır**: Faz 6 artık
> "başlanabilir" ama önüne bir iş girdi.
>
> ⚠️ **Bugün eksik olan Faz 9'un TAMAMI DEĞİLDİR** ve bu ayrım kapsamı belirler:
>
> | Parça                                                                                                                                   | Durum                                                                                                                                                                                                                                                              |
> | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
> | Auth ekranları (`register` · `verify-email` · `login` · `forgot`/`reset-password` · `create-tenant` · `select-tenant`)                  | ✅ **YAZILI ve API'ye bağlı** (~920 satır); login sonrası yönlendirme kuralı da uygulanmış ([FRONTEND](architecture/FRONTEND_ARCHITECTURE.md) §3.1)                                                                                                                |
> | Backend auth uçları (register · verify-email · resend · login · refresh · logout · forgot/reset-password · switch-tenant · tenant açma) | ✅ **HEPSİ CANLI** — eksik uç yok                                                                                                                                                                                                                                  |
> | ⚠️ Genel giriş noktası (`/`)                                                                                                            | ⚠️ **YOK** — 2026-08-27'de geçici olarak `/login`'e yönlendirildi (aşağıda)                                                                                                                                                                                        |
> | ⚠️ Pazarlama içeriği: ne yaptığı, fiyatlandırma, KVKK/gizlilik metni                                                                    | ⚠️ **YOK**                                                                                                                                                                                                                                                         |
> | ~~⚠️ **E-posta teslimatı**~~                                                                                                            | ✅ **ÇÖZÜLDÜ** (2026-08-31) — `noreply@mail.kobiwise.com`; zincir prod'da koştu, aşağıda                                                                                                                                                                           |
> | ~~⚠️ **Web'in PROD'A DAĞITILMASI**~~                                                                                                    | ✅ **YAPILDI** (2026-08-31) — `apps/web` **Vercel**'de, **https://app.kobiwise.com**; API **https://api.kobiwise.com** (Railway). ⚠️ İki alt domain zorunluydu: `SameSite=Strict` refresh çerezi `*.vercel.app` ↔ `*.up.railway.app` arasında **hiç gönderilmez**. |
>
> #### ⚠️ ASIL DARBOĞAZ LANDING DEĞİL, E-POSTA
>
> ~~`EMAIL_FROM` bugün Resend'in paylaşımlı test göndericisidir (`resend.dev`)
> … gerçek bir kullanıcı doğrulama kodunu ALAMAZ … Önkoşul: kobiwise.com'un
> Resend'de doğrulanması … zincirin prod'daki ilk gerçek sınavı bu iş
> olacaktır.~~
>
> ### ✅ ENGEL KALKTI — VE ZİNCİR PROD'DA KOŞTU (2026-08-31)
>
> `mail.kobiwise.com` Resend'de **doğrulandı**; `EMAIL_FROM` artık
> **`noreply@mail.kobiwise.com`**. ⚠️ **Kayıt → doğrulama → giriş → tenant açma
> zinciri prod'da İLK KEZ uçtan uca koştu** ve ⚠️ **doğrulama kodunun gerçek
> bir gelen kutusuna ULAŞTIĞI kanıtlandı** — bugüne kadar bu adım her seferinde
> `email_verified` elle `true` yapılarak atlanıyordu.
>
> Ölçülen zincir: `register` **202** → outbox **YAYINLANDI** (0 deneme) →
> **kod gelen kutusundan okundu** → `verify-email` **200** → `login` **200** →
> `/me/memberships` **0 üyelik** → `POST /tenants` **201 `active`** →
> `switch-tenant` **200** → `notes/exists` **`hasNotes: false`**.
>
> ~~⚠️ **AÇIK KALAN TEK ADIM:** `/app/onboarding` yönlendirmesi prod'da
> **gözlenemedi**, çünkü prod'da **WEB DAĞITIMI YOKTUR**. Bu, Landing Page
> işinin kapsamına doğrudan bir madde ekler: web'in prod'a dağıtılması. Kayıt
> akışı bugün API olarak çalışıyor ama **dışarıdan kimse ekranını göremiyor**.~~
>
> ### ✅ KAPANDI — WEB PROD'A DAĞITILDI VE ZİNCİR ARAYÜZDEN KOŞTU (2026-08-31)
>
> `apps/web` **Vercel**'e dağıtıldı: **https://app.kobiwise.com**. API aynı
> kayıtlı alanın altına taşındı: **https://api.kobiwise.com** (Railway).
>
> ⚠️ **İki alt domain bir tercih değil bir ZORUNLULUKTU.** Refresh çerezi
> `SameSite=Strict` taşır (ADR-0026) ve `*.vercel.app` ile `*.up.railway.app`
> Public Suffix listesinde **ayrı sitelerdir** — çerez hiç gönderilmez, oturum
> yenileme **sessizce** bozulurdu.
>
> ⚠️ **Zincir web arayüzünden uçtan uca koştu** (gerçek kullanıcı, gerçek
> tarayıcı): kayıt → doğrulama → giriş → tenant açma → **sayfa yenileme**.
> Yenilemeden sonra oturum **ayakta kaldı** ve prod log'u `POST /auth/refresh`
> → **200**, çerez **gönderilmiş** olarak gösteriyor. ⚠️ Bu, projede ilk kez
> **davranışsal** olarak kanıtlandı; daha önce yalnızca koddan çıkarımdı.
>
> ⚠️ **`/app/onboarding` yönlendirmesi de açıklandı ve bir boşluk DEĞİL:**
> kullanıcı sihirbazı gördü ve içinden geçti; `OnboardingGate` bundan sonra
> `localStorage` bayrağı yüzünden kapıyı bir daha çalmıyor — `completed.ts`in
> yazılı gerekçesi. Ayrıntı ve kanıt zinciri [`CLAUDE.md`](../CLAUDE.md)
> "⚠️ WEB PROD'DA CANLI" bölümündedir.
>
> ⚠️ **Kapanmayan:** landing page **hâlâ yok** — `/` bugün de 307 ile `/login`e
> gidiyor; pazarlama içeriği, fiyatlandırma ve KVKK/gizlilik metni yazılmadı.
> Bu fazın **asıl işi** odur ve sıradaki adımdır.
>
> ⚠️ Test hesabı ve tenant'ı temizlendi (tek transaction, `ON_ERROR_STOP`,
> sayımla teyit): prod yine **sıfır kullanıcı / sıfır tenant**.
>
> #### ⚠️ 2026-08-27'de yapılan GEÇİCİ düzeltme — bu bir landing page DEĞİLDİR
>
> Kök rota (`/`) Faz 1'den beri bir **altyapı sağlık kartı** çiziyordu: servis
> adı, sürüm, **ortam**, **uptime** ve **veritabanı gecikmesi**. ⚠️ Ve
> `middleware.ts`'in kapsamı **dışındaydı** (`matcher: ['/app/:path*']`), yani
> kimliksiz herkese açıktı — prod'da `SWAGGER_ENABLED=false` ile uç sözleşmesi
> kasten kapatılmışken.
>
> Rota `/login`'e yönlendirildi. ⚠️ **Sağlık kontrolü kaybolmadı:**
> `GET /api/v1/health` yerinde ve dağıtım doğrulamasının tek kaynağı zaten
> odur; kaldırılan şey ölçüm değil, o ölçümün **kimliksiz bir HTML sayfası
> olarak yayınlanmasıdır**.
>
> ⚠️ Yönlendirme **307 (geçici)**, `permanentRedirect` **değil**: 308'i
> tarayıcılar kalıcı olarak önbelleğe alır ve landing page yayına alındığı gün
> daha önce siteye girmiş her tarayıcı **hâlâ `/login`'e giderdi** — hata
> sessiz olurdu. Bir test bunu kilitliyor.

> ~~**Kapı koşulu:** **Domain ve marka netleşmeden başlamaz.**~~
> — ✅ karşılandı, 2026-08-27 (yukarıya bakınız).

E-posta şablonlarının HTML/marka hâline getirilmesi de buraya bağlıdır ([AUTH §7.7](architecture/AUTH_ARCHITECTURE.md)) — bugün bilinçli olarak düz metindir ve bu bir **içerik** borcudur, mimari borç değil. Referanslar: [`DESIGN_REFERENCES.md`](architecture/DESIGN_REFERENCES.md).

⚠️ **Bu kalem artık düz metin olmanın ötesinde bir şey daha bekliyor:** şablon
işi ancak alan adı Resend'de doğrulandıktan sonra gerçek bir adrese gönderilip
**görülebilir**. Yani sıra: domain doğrulaması → gerçek gönderim → şablon.

---

## 8. Yatay / sürekli kalemler

Bunlar bir faza ait değildir; ya süreklidir ya da belirtilen faza kadar netleşmesi gerekir.

| Kalem                                                                                                     | Durum                                                                                                 | Ne zaman                                     |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Gözlemlenebilirlik** — merkezî log toplama, hata izleme, **AI çağrısı maliyet/token takibi**            | 🟡 **AI maliyet takibi ✅ kapandı** (Faz 5 Slice 0.5); merkezî log toplama ve hata izleme ❌ hâlâ yok | AI kalemi kapandı — kalanı hosting kararıyla |
| **Yedekleme / felaket kurtarma**                                                                          | ❌ Yok                                                                                                | **Hosting kararıyla birlikte** (Faz 4 §2.4)  |
| **KVKK / GDPR uyumluluğu**                                                                                | ❌ Ele alınmadı                                                                                       | **Faz 6 öncesi zorunlu kontrol noktası**     |
| **Playwright e2e**                                                                                        | ❌ Yok — **bilinçli ertelendi** (Vitest + RTL kuruldu)                                                | Belirsiz; bilinçli borç                      |
| **Tablo retention politikası** — ayrıntı ve tam liste [§8.5](#85-retention-borcu-onüç-tablo-tek-karar)'te | ❌ Yok — **büyüyen borç**, artık **yirmi dört tablo**                                                 | Faz 4                                        |
| **Mobil görsel test** — dashboard + change-password ekranı `<768px`                                       | ❌ Yapılmadı                                                                                          | Faz 4                                        |
| **Doküman sürüm numarası denetimi**                                                                       | 🟡 Bilinen tutarsızlık                                                                                | Faz 4                                        |

### 8.1 Gözlemlenebilirlik neden Faz 4'e kadar

AI çağrısı **maliyet ve token takibi**, diğer iki kalemden farklı bir aciliyettedir: AI Context Engine devreye girdiği anda her istek ölçülebilir bir para harcamasına dönüşür. Ölçülmeyen bir maliyet, faturayı gördüğünüzde öğrenilen bir maliyettir. Bu yüzden Context Engine ile **aynı fazda** kurulmalıdır — sonrasında değil.

> ### ✅ AI maliyet takibi kapandı — Faz 5 Slice 0.5 (2026-08-05)
>
> **Bu kalem Faz 4'e yetişmedi ve bu kayda geçiyor.** Faz 4, gerekçesi hâlâ geçerliyken kapandı; borç Faz 5'in **ilk işi** olarak kapatıldı — CRM'in tek satırı yazılmadan önce.
>
> **Neden Faz 5'e ertelenemezdi:** Faz 5 maliyeti üç ayrı yönden artırıyor (CRM ikinci embedding üreticisi · yapısal katkıcı her soruya sabit token ekliyor · fan-out tek `/ask`'i N kaynağa dokunduruyor). Ölçüm bunlardan sonra kurulsaydı, artışın nereden geldiği ayırt edilemezdi.
>
> **Ne var:** her `LLMPort.complete()` ve `EmbeddingPort.embed()` çağrısı sabit `event: "ai.call"` adıyla yapılandırılmış bir satır bırakır — operasyon · sağlayıcı · model · çağıran modül · sonuç · süre · prompt/completion/total token · `tenantId` · `userId` · `correlationId`. Başarısız çağrılar da kaydedilir (retry döngüsü görünmez kalmasın). **Kullanıcı içeriği kayda girmez** — yalnızca sayılar.
>
> **Port imzaları değişmedi.** Token harcaması yalnızca sağlayıcının ham yanıtında görünür; `LLMPort` `Promise<string>` döner, yani dışarıdan saran bir decorator token sayısını göremezdi. Adapter, gördüğü usage'ı bir sink'e (`AiUsageRecorder`) bildirir — [ADR-0029](adr/0029-knowledge-module-ai-context-engine.md) §3'ün "bilerek minimal" port yüzeyi korunur.
>
> **Ne YOK — kapsam bilinçli dar:** gerçek zamanlı maliyet panosu · uyarı/alarm · **bütçe limiti**. Bunlar ayrı ve daha büyük bir iştir. Bugünkü tek iddia: _her çağrı geriye dönük incelenebilir bir satır bırakıyor._
>
> **Karıştırılmaması gereken sınır:** oran sınırı ([ADR-0029](adr/0029-knowledge-module-ai-context-engine.md) §5) istek **sayısını** bağlar, token harcamasını değil. O ADR'nin kendi kaydettiği bilinen sınır — _"mekanizma istek sayısını bağlar, TOKEN harcamasını değil"_ — artık **ölçülebilir**, ama hâlâ **zorlanmıyor**. Token bütçesi ayrı bir karardır.

**Kalan iki kalem hâlâ açık:** merkezî log toplama ve hata izleme. Bugün loglar yalnızca lokal ve yapılandırılmış; toplayıcı yok. `ai.call` satırlarının gerçek değeri onlar toplandığında ortaya çıkar — bu yüzden ikisi **hosting kararına** ([§2.4](#24-zorunlu-alt-adım-cicd--hosting)) bağlıdır.

### 8.2 KVKK/GDPR neden Faz 6 öncesi

Gerçek müşteri ve ödeme verisi Faz 6'da girer. Veri saklama süreleri, silme hakkı ve işleme envanteri **veri girmeden önce** tasarlanırsa bir tasarım kararıdır; sonra tasarlanırsa bir göç projesidir. Faz 3'te açılıp Faz 4'te büyüyen retention borcu ([§8.5](#85-retention-borcu-onüç-tablo-tek-karar)) bu kontrol noktasının ilk girdisidir.

### 8.3 Cevabın akarak yazılması (streaming) — ayrı slice + ADR

`LLMPort.complete()` bugün `Promise<string>` döner; [ADR-0029](adr/0029-knowledge-module-ai-context-engine.md) §3 bunu **bilerek minimal** tutmuş ve "streaming yok" demişti. Panel tasarımı (sürüm 2) geldiğinde bu borç görünür oldu.

**Sahte daktilo efekti REDDEDİLDİ** (Product Owner onayı, 2026-08-05): metin tamamen geldikten _sonra_ harf harf yazmak, gerçek beklemenin (ölçülen: 2–4 sn) üstüne sahte bir bekleme ekler. Streaming'in bütün değeri **ilk token'a kadar geçen süreyi** kısaltmaktır; sahtesi tam tersini yapar. Panel bunun yerine **gerçek bir düşünme durumu** gösteriyor.

Gerçek streaming şunları değiştirir ve bu yüzden **kendi slice'ı + ADR notu** gerektirir:

| Değişen                                             | Neden ciddi                                                                                                             |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `LLMPort` yüzeyi (`stream()` ya da `AsyncIterable`) | ADR-0029 §3 kararının değişmesi                                                                                         |
| `DeepSeekLlmAdapter`                                | `stream: true` + SSE ayrıştırma                                                                                         |
| `POST /knowledge/ask`                               | JSON → `text/event-stream`; **sözleşme değişikliği**, versiyonlama                                                      |
| **Hata modeli**                                     | Akış başladıktan sonra HTTP durumu değiştirilemez; `429`/`502`/RFC 7807 disiplini akış-içi olay tipine dönüşmek zorunda |
| `sourceNoteIds` · `conversationId` · `followUps`    | Ayrı olaylar olarak önce/sonra gönderilmeli                                                                             |

### 8.4 Fırsatlar ekranı: kapanmış anlaşmaları özet şeridine alma — 💡 fikir

**Uygulanmadı ve şu an planlı değil.** Slice 9-B düzen çalışması sırasında ortaya çıktı, Product Owner "şimdi uygulamıyoruz" dedi (2026-08-08); burada yalnızca fikir olarak duruyor ki ileride yeniden keşfedilmesin.

**Gözlem:** `/app/crm/pipeline` beş aşamayı da eşit sütun olarak çiziyor. Ama `won`/`lost` **hat değildir** — kapanmış bir anlaşma "yapılacak iş" değil, bir sonuçtur. Kod bu ayrımı zaten üç yerde yapıyor: `listFollowUps`, `listOpenPipeline` ve müşteri kartındaki `openOpportunityCount` sayacı kapanmışları dışlıyor. Ekran yapmıyor.

**Fikir:** Üç açık aşama tam genişlikte sütun olsun (1440px'de ~330px, bugünkü ~205px yerine), kapanmışlar üstte tek satırlık bir özet şeridine insin (_"bu çeyrek: 4 kazanıldı · 1 kaybedildi"_).

| Kazanç                                                                              | Bedel                                                                                  |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Kartlar rahatlar — yoğunluk sorunu yatayda çözülür, dikey sıkıştırmaya gerek kalmaz | Ekran artık "tüm fırsatlarım" değil "açık işlerim" olur                                |
| Ekranın anlamı keskinleşir: hat = yapılacak iş                                      | Kapanmış bir fırsata ulaşmak için ikinci bir yol gerekir (müşteri detayı ya da filtre) |
| Kapanmışları saymak zaten üç yerde reddedilmiş bir şey; ekran da hizalanır          | "Beş sütun da görünsün" isteğiyle çelişir — o istek bilinçli verildi                   |

⚠️ Bu bir **düzen** kararı değil **bilgi** kararıdır: ekrandan veri çıkarır. Bu yüzden CSS ayarı gibi ele alınamaz; ayrı bir onay ister.

### 8.5 Retention borcu: yirmi dört tablo, tek karar

Borç Faz 3'te iki tabloyla açıldı, Faz 4 planıyla dörde, Slice 5 ile beşe, Faz 4 kapanış denetiminde (2026-08-05) altıya, Faz 5/CRM kapanış denetiminde (2026-08-09) sekize, Projeler Slice 3 ile (2026-08-10) ona, Finans Slice 5 ile (2026-08-11) onikiye, Randevu Slice 3 ile (2026-08-13) onüçe, İK ile (2026-08-25) yirmi ikiye, ve **Müşteri Geri Bildirimi ile (2026-08-25) YİRMİ ÜÇE** çıktı.

> ### ⚠️ Sadakat Programı YİRMİ DÖRDE ÇIKARDI — ve kalem İKİNCİ KEZ "BUGÜNKÜ SAYIYI DEĞİŞTİREN" SINIFTAN (2026-08-27)
>
> [ADR-0051](adr/0051-sadakat-programi-modulu.md)'in `loyalty.point_entries`
> tablosu listeye **girdi**; `loyalty.accounts` **girmedi**.
>
> ⚠️ **İki tablonun ayrışması listenin kendi ölçütüdür** (_"borcu doğuran şey
> satırın ZAMANLA ÇOĞALMASIDIR"_): bir hesap müşteri başına **tek satırdır** ve
> müşteri sayısıyla artar, kullanımla değil — `crm.contacts` listede olmadığı
> gibi. Defter ise **her kasa işleminde** bir satır yazar.
>
> ⚠️ **VE BU KALEM, `inventory.movements`TEN SONRA İKİNCİSİDİR:**
> `loyalty.point_entries` silinirse **geçmiş değil BUGÜNKÜ BAKİYE** değişir —
> bakiye o defterden `SUM` ile türetilir ve `balance` diye bir kolon **yoktur**
> (ADR-0051 §4.1). Saklama süresi kararında bu iki kalem **aynı özel muameleyi**
> görür: eski satırları silmek, bugünkü sayıyı **sessizce yeniden yazar**.
>
> ⚠️ Bir ek keskinlik: bakiyenin negatife düşememesinin **veritabanı garantisi
> yoktur** (§4.4) — yani bir retention işi eski `earn` satırlarını silip yeni
> `spend` satırlarını bırakırsa, bakiye **negatife düşebilir** ve bunu
> engelleyecek hiçbir kısıt yoktur.
>
> ⚠️ **Vektör taşıyan tablo sayısı ONDA KALDI** — Faz 5'te bu sayıyı
> artırmayan **üçüncü** modül (Teklif/Fatura · İK · Sadakat). İki liste
> ayrışmaya devam ediyor: retention **24**, vektör **10**.

> ### ⚠️ Kampanya/Pazarlama borcu BÜYÜTMEDİ — liste YİRMİ ÜÇTE KALDI (2026-08-26)
>
> [ADR-0047](adr/0047-kampanya-pazarlama-modulu.md)'nin `marketing.campaigns`
> tablosu **ONUNCU vektör taşıyan tablodur** (`appointments.appointments`,
> `inventory.items`, `suppliers.interactions`, `feedback.responses` ile aynı
> sınıf: chunk tablosu YOK, vektör satırın kendi kolonunda) — ama
> ⚠️ **retention listesine GİRMEDİ.**
>
> Gerekçe listenin **kendi ölçütüdür**: _"borcu doğuran şey satırın ZAMANLA
> ÇOĞALMASIDIR."_ Bir tenant yılda birkaç kampanya girer; satırlar kullanımla
> değil **iş temposuyla** artar — `crm.companies` ve `crm.contacts` listede
> olmadığı gibi.
>
> ⚠️ Bu, ADR-0040'ın kapanış denetiminin **düzeltmek zorunda kaldığı** hatanın
> tersi yönde uygulanmasıdır: orada retention sayısı olduğundan büyük
> yazılmıştı ve denetim onu geri çekti; burada ölçüt **önce** uygulandı.
>
> ⚠️ **İki sayı artık kalıcı olarak ayrışıyor ve bu ayrım korunmalıdır:**
> retention listesi **23**, vektör taşıyan tablo **10**. Bir modülün vektör
> taşıması onu otomatik olarak retention borcuna sokmaz. Tek madde altında tutuluyorlar çünkü **çözüm tek bir karardır** (saklama süresi + temizlik mekanizması), ama büyüme sebepleri ve doğru sürelerin farklı olduğu unutulmamalı:

| Tablo                            | Neyi biriktiriyor                                                                                                        | Kaynak                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `login_attempts`                 | Her başarısız parola denemesi — giriş **ve** change-password akışları besliyor                                           | Faz 3                                                                                           |
| `verification_code_requests`     | Her doğrulama/sıfırlama kodu isteği                                                                                      | Faz 3                                                                                           |
| `daily_report_runs`              | Tenant başına günde bir satır, kalıcı olarak                                                                             | Faz 4 ([ADR-0030](adr/0030-conversation-memory-daily-report-onboarding.md) §2.1)                |
| `messages`                       | Her soru-cevap iki satır — **en hızlı büyüyen**                                                                          | Faz 4 ([ADR-0030](adr/0030-conversation-memory-daily-report-onboarding.md) §1.1)                |
| `knowledge.conversations`        | `conversationId`siz her soru yeni bir konuşma açar — `messages`'ın EBEVEYNİ                                              | Faz 4 (kapanış denetimi, 2026-08-05)                                                            |
| `knowledge.rate_limits`          | Kullanıcı + eylem başına saatte bir satır — **en yavaş büyüyen**                                                         | Faz 4 ([ADR-0029](adr/0029-knowledge-module-ai-context-engine.md) §5.1)                         |
| `crm.interactions`               | Her görüşme kaydı — CRM'in AI'a bağlam üreten tek yüzeyi                                                                 | **Faz 5** ([ADR-0031](adr/0031-crm-module.md) §1)                                               |
| `crm.interaction_chunks`         | Görüşme başına N parça + vektör — **satır başına en PAHALI** (`vector(1536)`)                                            | **Faz 5** ([ADR-0031](adr/0031-crm-module.md) §1)                                               |
| `projects.progress_notes`        | Her ilerleme notu — Projeler'in AI'a bağlam üreten tek yüzeyi                                                            | **Faz 5 / 2. modül** ([ADR-0033](adr/0033-projects-module.md) §1)                               |
| `projects.progress_note_chunks`  | Not başına N parça + vektör — `interaction_chunks` ile **aynı pahalı sınıf**                                             | **Faz 5 / 2. modül** ([ADR-0033](adr/0033-projects-module.md) §1)                               |
| `finance.commentaries`           | Her dönem yorumu — Finans'ın AI'a bağlam üreten tek yüzeyi                                                               | **Faz 5 / 3. modül** ([ADR-0034](adr/0034-finance-module.md) §1.1)                              |
| `finance.commentary_chunks`      | Yorum başına N parça + vektör — **dördüncü** vektör tablosu                                                              | **Faz 5 / 3. modül** ([ADR-0034](adr/0034-finance-module.md) §1.1)                              |
| `appointments.appointments`      | Her randevu + servis notu + vektör **aynı satırda** — chunk tablosu YOK                                                  | **Faz 5 / 4. modül** ([ADR-0035](adr/0035-randevu-rezervasyon-modulu.md) §3)                    |
| `documents.documents`            | Her belge + metadata — ⚠️ **R2'de bir NESNE de var**                                                                     | **Faz 5 / 5. modül** ([ADR-0037](adr/0037-belge-sozlesme-yonetimi.md) §1)                       |
| `documents.document_chunks`      | Belge başına N parça + vektör — **altıncı** vektör tablosu, satır başına en çok üreten                                   | **Faz 5 / 5. modül** ([ADR-0037](adr/0037-belge-sozlesme-yonetimi.md) §3)                       |
| `inventory.items`                | Kalem başına tek satır + vektör **aynı satırda** — **yedinci** vektör tablosu                                            | **Faz 5 / 6. modül** ([ADR-0039](adr/0039-stok-envanter-modulu.md) §1)                          |
| ⚠️ **`inventory.movements`**     | ⚠️ **Silmek GEÇMİŞİ değil BUGÜNKÜ MİKTARI değiştirir** — bkz. aşağıdaki uyarı                                            | **Faz 5 / 6. modül** ([ADR-0039](adr/0039-stok-envanter-modulu.md) §2)                          |
| `suppliers.interactions`         | Her görüşme + vektör **aynı satırda** — **sekizinci** vektör tablosu                                                     | **Faz 5 / 7. modül** ([ADR-0040](adr/0040-tedarikci-yonetimi-modulu.md) §1)                     |
| `invoicing.sales_documents`      | Her teklif/fatura başlığı — ⚠️ **vektör YOK**, listeye ilk kez bu şekilde giren kalem                                    | **Faz 5 / 8. modül** ([ADR-0041](adr/0041-teklif-fatura-modulu.md) §2)                          |
| `invoicing.sales_document_lines` | Belge başına N satır kalemi — belgesiyle birlikte gider (cascade)                                                        | **Faz 5 / 8. modül** ([ADR-0041](adr/0041-teklif-fatura-modulu.md) §2)                          |
| ⚠️ **`platform.audit_log`**      | ⚠️ **HER alan değişikliğine bir satır** — listedeki **en hızlı büyüyen** kalem                                           | **Faz 5 / 9. modül** ([ADR-0043](adr/0043-ik-personel-modulu.md) §8)                            |
| `hr.leave_requests`              | Her izin talebi — ⚠️ **KVKK: kişisel veri**, süresi hukuki bir karardır                                                  | **Faz 5 / 9. modül** ([ADR-0044](adr/0044-ik-v2-izin-ve-zenginlestirilmis-calisan-kaydi.md) §2) |
| ⚠️ **`feedback.responses`**      | Her geri bildirim + vektör **aynı satırda** — **dokuzuncu** vektör tablosu                                               | **Faz 5 / 10. modül** ([ADR-0045](adr/0045-musteri-geri-bildirim-modulu.md) §1)                 |
| ⚠️ **`loyalty.point_entries`**   | ⚠️ **Silmek GEÇMİŞİ değil BUGÜNKÜ BAKİYEYİ değiştirir** — `inventory.movements`ten sonra **ikincisi**; ⚠️ vektör **YOK** | **Faz 5 / 12. modül** ([ADR-0051](adr/0051-sadakat-programi-modulu.md) §1.3)                    |

İlk ikisi **güvenlik/denetim** verisidir: süreleri kısa olabilir ama silmek denetim izini zayıflatır. Sonraki ikisi **kullanıcı verisidir**: `messages` silmek konuşma geçmişini yok eder, `daily_report_runs` ise geçmiş raporlara erişimi. Yani "hepsine 90 gün" gibi tek bir sayı doğru cevap değil — karar tablo başına verilmeli ve [§8.2](#82-kvkkgdpr-neden-faz-6-öncesi)'deki KVKK kontrol noktasının girdisi olmalı.

> **`conversations` denetimde eklendi ve sırası önemlidir.** ADR-0030 "konuşma
> tabloları hızlı büyür" (çoğul) diyordu ama bu tablo yalnızca `messages`'ı
> listeliyordu. `messages` → `conversations` **`ON DELETE CASCADE`** taşır
> (migration `0011`), yani **doğru retention kolu `conversations`'dır**: eski
> konuşmaları silmek mesajlarını da götürür. Ters yön çalışmaz — sadece
> `messages` silen bir iş, sonsuza kadar biriken **yetim `conversations`**
> satırları bırakır. Denetim anında ölçüm: 4 konuşma / 12 mesaj.

> ### ⚠️ `feedback.responses` listeye GİRDİ — ama SİLME YOLU ZATEN VAR (2026-08-25)
>
> Tablo **zamanla çoğalır** (her geri bildirim bir satır) ve **vektör taşır**
> (`vector(1536)`, aynı satırda) — yani §8.5'in kendi ölçütünü iki koldan da
> karşılar.
>
> ⚠️ **Ama bu kalem diğerlerinden bir yönüyle AYRILIYOR ve bu ayrım işi
> KOLAYLAŞTIRIR:** silme yolu ZATEN AÇIKTIR
> ([ADR-0045](adr/0045-musteri-geri-bildirim-modulu.md) §2.2). Diğer yirmi iki
> kalemde retention işi önce _"silinebilir mi"_ sorusunu çözmek zorundadır;
> burada `DELETE` hem izin (`feedback:delete`), hem uç, hem de veritabanı
> yetkisi olarak mevcut — çünkü **KVKK silme talebi** onu zaten zorunlu kıldı.
>
> ⚠️ Retention bu tabloda yeni bir **mekanizma** değil, bir **politika** ister:
> _"kaç ay sonra"_. Ve o soru teknik değil **hukukidir** — satır kişisel veri
> içerebilir (`hr.leave_requests` ile aynı sınıf), yani
> [§8.2](#82-kvkkgdpr-neden-faz-6-öncesi)'nin KVKK kontrol noktasının girdisidir.
>
> ⚠️ **Silinen satır AI hafızasından da düşer** — vektör aynı satırda yaşar,
> ikinci bir temizlik yolu gerekmez. Belge modülünün R2 nesnesi gibi bir
> "veritabanı dışı artık" bu modülde YOKTUR.

> ### ⚠️ İK'nın İKİ tablosu listeye GİRMEDİ — ve gerekçeleri FARKLI (2026-08-25)
>
> **`hr.employees` girmez** çünkü zamanla çoğalmaz: çalışan başına **tek
> satır**, ve ayrılan çalışan **silinmez, işaretlenir**. `crm.companies` ile
> aynı sınıf — borcu doğuran şey satırın **zamanla çoğalmasıdır**.
>
> ⚠️ **`hr.compensation_records` ise ÇOĞALIR ama yine de girmez, ve sebebi
> TERSTİR** — tam olarak `finance.transactions`'ın durumu: bordro ve ücret
> kayıtlarını saklamak **yasal bir yükümlülüktür** (İş Kanunu ve TTK
> kapsamındaki saklama süreleri), yani cevabı "sil" değil **"silinmez"**tir.
> ⚠️ Üstüne bir de [ADR-0043](adr/0043-ik-personel-modulu.md) §6.2 vardır:
> bu defterin **değiştirilemezliği denetim izinin ta kendisidir** — geçmiş bir
> ücret satırını silmek, _"maaşı kim ne zaman değiştirdi"_ sorusunun cevabını
> yok eder. ⚠️ **Bu ayrım kaydedilmezse tablo, "büyüyor" diye bakan birinin
> gözünde temizlenecekler listesine yanlışlıkla girer.**
>
> ### ⚠️ `platform.audit_log` LİSTENİN EN HIZLI BÜYÜYEN KALEMİDİR
>
> `messages` "en hızlı büyüyen" diye işaretlenmişti; **audit_log onu geçme
> potansiyeli taşır**: bir kullanıcı isteği değil, **her alan değişikliği** bir
> satır yazar (üç alan değişen tek bir `PATCH` → üç satır). Bugün tek tüketicisi
> İK'dır ama tasarımı gereği **platform geneline yayılacaktır**.
>
> ⚠️ Retention kararı burada **en zor** olanıdır ve bir denge sorusudur:
> denetim izini kısaltmak, onu var etme sebebini zayıflatır. Cevap muhtemelen
> tek bir süre değil, **kaynak türü başına** bir süredir — [§8.2](#82-kvkkgdpr-neden-faz-6-öncesi)'nin
> KVKK kontrol noktasının girdisi.

> **`crm.company_summaries` bu listeye GİRMEZ** ([ADR-0032](adr/0032-company-summary.md)): şirket başına **tek satır** tutar ve şirket silinince cascade ile gider — sınırsız büyüyen bir tablo değildir. `daily_report_runs`'tan yapısal farkı budur (o tenant başına **günde** bir satır ekler ve kalıcıdır). Kayıt buraya, listeyi uzatmamak için değil, **neden uzatmadığı** görülsün diye düşüldü: bir AI çıktısını saklamak otomatik olarak retention borcu doğurmaz; borcu doğuran şey satırın ZAMANLA çoğalmasıdır.

> **Faz 5 bunu SEKİZE ÇIKARDI** ([ADR-0031](adr/0031-crm-module.md)) — cümle Faz 5 kapanış denetiminde (2026-08-09) gelecek zamandan geçmiş zamana alındı; iki satır o güne kadar tabloya **hiç girmemişti**. Yukarıdaki `conversations` dersi burada **ilk günden** uygulandı: `interaction_chunks → interactions` `ON DELETE CASCADE` taşıdığı için doğru retention kolu `interactions`'dır. Ayrıca iki tablo **taşındı** (`rate_limits` ve `conversations`/`messages` → `platform`); bu listeyi kısaltmaz ama çoğalmasını önler — modül başına değil, platformda **tek** kalem.
>
> ⚠️ `crm.interaction_chunks` bu listenin **satır başına en pahalı** kalemidir: her satır 1536 boyutlu bir vektör taşır (~6 KB). Diğer yedisi metin ve sayaçtır. Retention kararı verilirken "kaç satır" kadar "satır ne kadar yer kaplıyor" da sorulmalı.

> ### Projeler Slice 3 borcu ONA çıkardı (2026-08-10)
>
> [ADR-0033](adr/0033-projects-module.md) §1'in `progress_notes` /
> `progress_note_chunks` tabloları. `conversations` denetiminde öğrenilen ders
> burada da **ilk günden** uygulandı: `progress_note_chunks → progress_notes`
> `ON DELETE CASCADE` taşıdığı için **doğru retention kolu `progress_notes`**'tur;
> yalnızca parça silen bir iş yetim satırlar bırakırdı.
>
> ⚠️ **Vektör taşıyan tablo sayısı ikiye çıktı** ve bu, kararın şeklini
> değiştiriyor: liste artık "sekiz metin + iki vektör" değil, **yedi metin/sayaç
>
> - üç vektör** (`knowledge.note_chunks` zaten vardı ama bu listede hiç
>   sayılmamıştı — çünkü `notes` cascade'i onu zaten kapsıyor; aynı gerekçe
>   diğer iki chunk tablosu için de geçerli). Depolama tarafındaki asıl yük bu üç
>   tablodadır ve on ikinci modüle kadar her anlatısal modül bir tane daha
>   ekleyecek. Retention kararı, tablo tablo bir süre listesinden çok **"chunk
>   tabloları ebeveynleriyle birlikte gider"** kuralına dayanmalı.

> ### Finans Slice 5 borcu ONİKİYE çıkardı (2026-08-11)
>
> [ADR-0034](adr/0034-finance-module.md) §1.1'in `finance.commentaries` /
> `finance.commentary_chunks` tabloları. `conversations` denetiminde öğrenilen
> ders **dördüncü kez ilk günden** uygulandı: `commentary_chunks →
commentaries` `ON DELETE CASCADE` taşıdığı için **doğru retention kolu
> `commentaries`**'tir.
>
> ⚠️ **Vektör taşıyan tablo sayısı DÖRDE çıktı** (`knowledge.note_chunks` ·
> `crm.interaction_chunks` · `projects.progress_note_chunks` ·
> `finance.commentary_chunks`). Yukarıdaki "her anlatısal modül bir tane daha
> ekleyecek" öngörüsü **üçüncü kez doğrulandı**; depolama tarafındaki asıl yük
> artık tartışmasız bu dört tablodadır.
>
> ⚠️ **`finance.transactions` BU LİSTEYE GİRMEZ ve sebebi TERSTİR.** Sınırsız
> büyür — ama çözümü "eskiyi sil" **değildir**: mali kayıtların saklanması
> yasal bir yükümlülüktür (TTK). Yani [§8.2](#82-kvkkgdpr-neden-faz-6-öncesi)'nin
> KVKK kontrol noktasına bir girdidir ve cevabı diğer onikisinin tersidir:
> **silinmez**.
>
> Bu ayrım kaydedilmezse tablo, "büyüyor" diye bakan birinin gözünde
> temizlenecekler listesine yanlışlıkla girer. `crm.company_summaries`'in
> listeye girmeme gerekçesi (satır sayısı sabit) ile karıştırılmamalı: orada
> tablo büyümüyordu, burada büyüyor ama **silinemiyor**.

> ### ⚠️ Stok borcu ONYEDİYE çıkardı (2026-08-21) — ve YİNE YENİ BİR SINIF ekledi
>
> [ADR-0039](adr/0039-stok-envanter-modulu.md)'un `inventory.items` /
> `inventory.movements` tabloları. Vektör taşıyan tablo sayısı **altıdan
> YEDİYE** çıktı (`items.embedding` satır içinde — `appointments.appointments`
> ile aynı sınıf, chunk tablosu yok).
>
> ⚠️ **AMA `inventory.movements` BU LİSTEDEKİ DİĞERLERİNDEN YAPISAL OLARAK
> FARKLIDIR ve bu fark kaydedilmezse gerçek bir veri kaybı üretir:**
>
> | Liste kalemi                    | Eski satırları silmek ne kaybettirir                  |
> | ------------------------------- | ----------------------------------------------------- |
> | `messages`, `login_attempts`, … | **Geçmişi** — bugünkü hiçbir sayı değişmez            |
> | `documents.documents`           | Geçmişi **+ R2'de bir nesne** (Belge'nin yeni sınıfı) |
> | ⚠️ **`inventory.movements`**    | ⚠️ **BUGÜNKÜ MİKTARI** — türetme kaynağını götürürdü  |
>
> Stok miktarı bir kolonda saklanmaz; `movements`tan **her okumada türetilir**
> (ADR-0039 §2). Yani defteri kırpmak, "eski kayıtları temizlemek" değil
> **bugünkü stoğu değiştirmektir**.
>
> **Bağlayıcı kural:** `inventory.movements` **kırpılamaz**, önce kırpılan
> dönemin bakiyesini taşıyan bir **açılış hareketi** (`is_correction = true`)
> yazılmadıkça. "Hepsine N gün" kuralı burada **sessizce yanlış stok** üretir.
>
> ⚠️ `finance.transactions` listeye _"silinmez"_ diye girmişti (TTK). Buradaki
> gerekçe **hukuki değil aritmetiktir** ve ikisi karıştırılmamalıdır.

> ### ⚠️ Belge Slice 2 borcu ONBEŞE çıkardı (2026-08-19) — ve YENİ BİR SINIF ekledi
>
> [ADR-0037](adr/0037-belge-sozlesme-yonetimi.md)'nin `documents.documents` /
> `documents.document_chunks` tabloları. `conversations` dersi **altıncı kez
> ilk günden** uygulandı: `document_chunks → documents` `ON DELETE CASCADE`
> taşıdığı için **doğru retention kolu `documents.documents`**'tır.
>
> ⚠️ **Vektör taşıyan tablo sayısı ALTIYA çıktı** ve bu modül diğerlerinden
> **daha hızlı** büyütecek: önceki beş modülde bir kayıt bir ya da birkaç parça
> üretiyordu; burada tek bir sözleşme **300 parçaya** kadar çıkabilir.
>
> ⚠️ **BU KALEM RETENTION SORUSUNA YENİ BİR BOYUT EKLİYOR: veritabanı dışında
> bir NESNE de var.** Retention işi yazıldığında satırı silmek YETMEZ — R2'deki
> nesne de silinmelidir. Yalnızca satır silen bir iş, faturaya dönüşen bir
> yetim nesne yığını bırakır. Silme yolunun kendisi bunu zaten doğru yapıyor
> (ADR-0037 §5.3, denetimde kanıtlandı); retention işi aynı sırayı izlemek
> zorundadır.
>
> ⚠️ Ayrıca `finance.transactions`'ın **ters gerekçesi** burada **kısmen**
> geçerlidir: bir kira sözleşmesi ya da vergi belgesi yasal olarak saklanmak
> zorunda olabilir. Ayrım **tablo başına değil belge başına**dır ve v1 bunu
> ayırt **etmez** — [§8.2](#82-kvkkgdpr-neden-faz-6-öncesi)'nin KVKK kontrol
> noktasına bir girdidir.

> ### Randevu Slice 3 borcu ONÜÇE çıkardı (2026-08-13)
>
> [ADR-0035](adr/0035-randevu-rezervasyon-modulu.md) §3'ün
> `appointments.appointments` tablosu. **Eklenen tablo sayısı ikinin değil BİRİN
> altında kaldı** ve bunun sebebi listeyi kısaltma çabası değil, veri şeklidir:
> servis notunun üst sınırı `TARGET_CHUNK_CHARS`'a eşitlendiği için parçalayıcı
> her zaman tek parça üretirdi; ayrı bir chunk tablosu yalnızca bir join maliyeti
> olurdu. Vektör satırın kendi kolonundadır.
>
> ⚠️ **Vektör taşıyan tablo sayısı BEŞE çıktı** ve şekli önceki dördünden
> **farklıdır**: bu, listedeki ilk **kendisi ebeveyn olan** vektör tablosudur.
> "Chunk tabloları ebeveynleriyle birlikte gider" kuralı burada ihlal edilmiyor
> — **gereksizleşiyor**: retention kolu tablonun kendisidir ve bir randevuyu
> silmek vektörünü de siler. ⚠️ Ama kayda geçmesi gereken ters yön şudur:
> önceki dört modülde "kaç satır" ile "kaç vektör" **ayrı** sayılardı ve chunk
> tablosunu silmek anlatısal içeriği korurdu; burada **ayrılamazlar** — randevu
> kaydının kendisi silinmeden vektörü tek başına temizlenemez. Depolamayı
> düşürmek istendiğinde tek seçenek `embedding = NULL`'dır ve o da `reindex`
> ile geri gelir.
>
> ⚠️ **`finance.transactions`'ın tersi bir durum DEĞİLDİR**: randevu kaydı mali
> kayıt değildir, yasal saklama yükümlülüğü taşımaz — yani cevabı gerçekten
> "bir süre sonra sil"dir. Yalnızca sürenin ne olacağı, kaydın **hem operasyonel
> geçmiş hem de AI bağlamı** olmasıyla belirlenir: eski randevuları silmek
> "bu müşteri en son ne zaman geldi" sorusunu cevaplanamaz kılar.

`rate_limits` beşincisi ama **en kolayı**: içinde denetim değeri de kullanıcı verisi de yok, ve içinde bulunulan pencereden eski her satır tanımı gereği ölüdür. Geçmiş pencereleri silmek hiçbir şey kaybettirmez — tabloya sayaç satırı deseninin (istek logu yerine) seçilmiş olması bu borcu en küçük halinde tutuyor.

---

## 9. Uzlaştırılacak kayıtlar

Bu doküman yazılırken, mevcut dokümanlarda **bu yol haritasıyla çelişen** faz atamaları bulundu.

> ### Tedarikçi Slice 1 borcu ONSEKİZE çıkardı (2026-08-22)
>
> [ADR-0040](adr/0040-tedarikci-yonetimi-modulu.md) §1'in
> `suppliers.interactions` tablosu — **sekizinci** vektör taşıyan tablo
> (`appointments.appointments` ve `inventory.items` ile aynı sınıf: chunk
> tablosu YOK, vektör satırın kendi kolonunda).
>
> ⚠️ **ÜÇ TABLO AÇILDI AMA LİSTEYE YALNIZCA BİRİ GİRDİ** — ve bu, listenin
> kendi ölçütünün ilk kez açıkça uygulanmasıdır. `suppliers.suppliers` ve
> `suppliers.contacts` **girmez**, tıpkı `crm.companies` ve `crm.contacts`ın
> girmediği gibi: ikisi de işletmenin tedarikçi sayısıyla sınırlıdır, **zamanla
> çoğalmaz** ve vektör taşımaz. Bu listenin kuralı yukarıda yazılı — _"borcu
> doğuran şey satırın ZAMANLA ÇOĞALMASIDIR"_.
>
> ⚠️ Kayıt bu yüzden düşüldü: ADR ilk yazıldığında "onyediden **yirmiye**"
> diyordu ve üç tabloyu birden sayıyordu. **Kapanış denetimi bunu yakaladı ve
> düzeltti.** Bir kod kusuru değildi — borcu **olduğundan büyük gösteren** bir
> belge hatasıydı, ve retention kararı verilirken bu liste tek dayanaktır.
>
> ⚠️ `inventory.movements`in uyarısı burada **geçerli değildir**: bu tablonun
> eski satırlarını silmek **geçmişi** kaybettirir, **bugünkü hiçbir sayıyı**
> değiştirmez. İki şekil karıştırılmamalıdır — biri aritmetik bir kayıp, diğeri
> anlatısal.

> ### ⚠️ Teklif/Fatura borcu ONSEKİZDEN YİRMİYE çıkardı (2026-08-23)
>
> [ADR-0041](adr/0041-teklif-fatura-modulu.md) §1'in `invoicing.sales_documents`
> / `invoicing.sales_document_lines` tabloları. `conversations` dersi **yedinci
> kez ilk günden** uygulandı: `sales_document_lines → sales_documents`
> `ON DELETE CASCADE` taşıdığı için **doğru retention kolu ebeveyndir**.
>
> ⚠️ **VEKTÖR TAŞIYAN TABLO SAYISI SEKİZDE KALDI** ve bu, Faz 5'te **bir ilktir**:
> sekiz modülün sekizi de bu sayıyı artırmıştı. Sebep ADR-0034 §6.1'dir — bir
> teklif kalemi yüzlerce neredeyse özdeş kısa vektör üretir ve K=8'lik havuzu
> kirletir. 2.0'da yazılan _"her anlatısal modül bir tane daha ekleyecek"_
> öngörüsü ilk kez **kırıldı** ve kırılma sebebi şudur: **bu modül anlatısal
> değildir.**
>
> ⚠️ **`invoicing.number_sequences` LİSTEYE GİRMEZ** — ve bu, listenin kendi
> ölçütünün ADR-0040'tan sonra **ikinci kez** açıkça uygulanmasıdır: tenant + tür
> başına **iki satır**, ebediyen. Yıl numaranın içinde **yoktur** (belgenin tarihi
> `issued_on`dadır), yani sayaç **yıla göre de çoğalmaz**. Bu bir ayrıntı değil
> bir **tasarım kararının sonucudur**: numara formatına yıl konsaydı liste her yıl
> iki satır büyürdü.
>
> ⚠️ **`sales_documents` İÇİN DOĞRU CEVAP "SİL" OLMAYABİLİR** ve gerekçe
> `finance.transactions`ınkiyle **kısmen** aynıdır: teklifler budanabilir, ama
> **kesilmiş faturalar ticari kayıttır**. Ayrım **tablo başına değil BELGE TÜRÜ
> başına**dır ve v1 bunu **ayırt etmez** — [§8.2](#82-kvkkgdpr-neden-faz-6-öncesi)'nin
> KVKK kontrol noktasına bir girdi. Belge modülünün _"tablo başına değil belge
> başına"_ ayrımının **ikinci** örneği.
>
> ⚠️ `inventory.movements`in uyarısı burada **geçerli değildir**: bu tabloların
> eski satırlarını silmek **geçmişi** kaybettirir, **bugünkü hiçbir sayıyı**
> değiştirmez — toplamlar kalemlerden türetilir ve kalemler belgeyle **birlikte**
> gider.

### 9.1 `ARCHITECTURE.md` §2 + ADR-0007 — ✅ **UZLAŞTIRILDI**

> **Durum: kapandı.** Hizalama commit `ba0fb41` ile yapıldı (2026-08-02).

| Kalem                                                              | ARCHITECTURE.md (önce) | Bugün — iki dokümanda da               |
| ------------------------------------------------------------------ | ---------------------- | -------------------------------------- |
| Cache                                                              | Faz 3                  | **Faz 4** (§2.3)                       |
| Queue / Jobs                                                       | Faz 3                  | **Faz 4** (§2.3)                       |
| Object storage                                                     | Faz 3                  | **Faz 4** (§2.3, koşullu)              |
| Search                                                             | Faz 4                  | **Faz 4** — zaten uyumluydu            |
| Vector store                                                       | Faz 4                  | **Faz 4** — zaten uyumluydu            |
| Hosting                                                            | Faz 7                  | **Faz 4** (§2.4)                       |
| İş modülleri                                                       | Faz 5+                 | **Faz 4** (ilki), **Faz 5** (kalanlar) |
| AI / `LLMPort` ([ADR-0007](adr/0007-ai-provider-agnostic-port.md)) | uygulama Faz 6+        | **Faz 4**                              |

Hizalamada ayrıca iki satır **ayrıştırıldı**: `Observability` ve `CI/CD` tabloda tek başına "Faz 1" diyordu ve bu yanıltıcıydı — temel kuruldu (Pino + correlation ID, GitHub Actions CI) ama merkezî log toplama, AI maliyet takibi ve **CD** yok. Artık ikisi de "Faz 1 (temel) + Faz 4 (kalanı)" olarak okunuyor.

> **ADR-0007'de kararın kendisi değişmedi** — yalnızca ne zaman uygulanacağı değişti. `LLMPort` soyutlaması, kabul testi ve gerekçe aynen geçerlidir. Fazın öne alınması ADR'yi **daha bağlayıcı** kılar: sağlayıcı seçimi artık yakın bir karardır ve business logic'in ona bağımlı olmaması bugün teorik değil pratik bir kısıttır.

### 9.2 `AUTH_ARCHITECTURE.md` sürüm geçmişi — 🟡 açık

Header'daki sürüm etiketi `1.1 (2026-07-26)` ile değişiklik geçmişi tablosu arasında bir numara çakışması var: `1.1` tabloda zaten 2026-07-22'de (EmailPort) kullanılmış, ADR-0026 cookie değişikliği muhtemelen `1.6` olmalıydı ve tabloya hiç girmemiş. Geçmişi yeniden yazmamak için dokunulmadı; en son kayıt `1.6` olarak eklendi ([§8](#8-yatay--sürekli-kalemler) "doküman sürüm numarası denetimi").

### 9.3 `ARCHITECTURE.md` §6.2 modül haritası — 🟡 açık

[§3.5](#35-modül-sıralaması--on-iki-modül-product-owner-kararı)'in on iki modüllük listesi, `ARCHITECTURE.md` §6.2'nin iş modülü satırıyla **çelişiyor**. Orada bugün şu yazıyor:

> CRM · Projects · Documents · Knowledge Base (kurumsal hafıza) · Workflow · Reporting

Fark iki yönlü: §3.5 sekiz modül **ekliyor** (Finans, Randevu, Stok, Tedarikçi, Teklif/Fatura, İK, Anket, Kampanya, Sadakat), buna karşılık **Workflow ve Reporting** listede **yok**.

**Bilerek dokunulmadı.** Bu doküman sıranın SSOT'udur; §6.2 ise bir mimari haritadır ve onu güncellemek Product Owner'ın bir sorusuna cevap ister: _Workflow ve Reporting düştü mü, yoksa Faz 5 sonrasına mı ertelendi?_ İkisi farklı kararlardır — biri kapsam daraltmasıdır, diğeri sıralama. Cevap gelene kadar §6.2 **eski hâliyle yanlış** durmaktadır ve bu kayıt onun görünmesi içindir.

---

## Değişiklik geçmişi

| Sürüm | Tarih      | Değişiklik                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0   | 2026-08-02 | İlk sürüm. Faz 4–9 sırası ve kapı koşulları karara bağlandı: **Faz 4 = Knowledge/Inbox + AI Context Engine birlikte** (CRM/Finans/İK değil), Search/Vector + Queue + Cache bu fazda seçilecek, CI/CD + Hosting zorunlu alt-adım. Yatay kalemler ve [§9](#9-uzlaştırılacak-kayıtlar) uyumsuzluk kaydı eklendi. Faz 1–3 **tekrarlanmadı**, CLAUDE.md'ye referans verildi.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 1.1   | 2026-08-02 | **[§9.1](#91-architecturemd-2--adr-0007--uzlaştırıldı) uzlaştırıldı** (commit `ba0fb41`): ARCHITECTURE.md §2/§6.2 ve ADR-0007 bu dokümana hizalandı. **[§1.1](#11-faz-3ten-devreden-açık-kalemler)** eklendi — Faz 3'ten devreden iki kalem ayrıştırıldı: Authorization'ın kalanı (ABAC · configurable roller · izin cache) **hiçbir faza bağlanmadı**, _"gerçek ihtiyaç doğunca"_ etiketiyle backlog'a alındı; **tenant outbox publisher Faz 4'ün önkoşulu** oldu. **[§1.2](#12-tenant-outbox-publisher--durum-tespiti-2026-08-02)** durum tespiti eklendi: yazma yolu var, **okuma yolu hiç yazılmadı** — bugün işlevsel hata üretmiyor (V1 provisioning senkron) ama iş modülleri event üretmeye başlayınca sessiz veri kaybı olur. **Object storage** §2.3'e dördüncü açık karar olarak eklendi (koşullu: Knowledge/Inbox dosya eki alacaksa zorunlu).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 1.2   | 2026-08-02 | **[§1.2](#12-tenant-outbox-publisher--✅-kapatıldı-commit-b07966f) kapatıldı** (commit `b07966f`): tenant outbox drain süreci yazıldı — tüketici + zamanlayıcı + repository + backoff/dead-letter (migration `0009`+`0010`). Faz 4'ün **tek kapı koşulu karşılandı** ([§2.5](#25-kapı-koşulu-faz-4e-giriş)). Yan çıktı: `MULTI_TENANT_ARCHITECTURE.md` §12.4.2'nin planı uygulanamaz çıktı ve iki öngörüsü düzeltildi (MT v2.0, superseded notu — metin silinmedi).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 1.3   | 2026-08-02 | **Faz 4 tasarim karari ADR'e baglandi:** [ADR-0029](adr/0029-knowledge-module-ai-context-engine.md) — Knowledge modulu + AI Context Engine v1. [§2](#2-faz-4--i̇lk-gerçek-modül--ai-context-engine) ve [§2.3](#23-bu-fazda-zorunlu-olarak-karara-bağlanacak-açık-teknik-kararlar) referans aldi. §2.3'teki dort acik karardan **ikisi kapandi** (Vector store → pgvector + HNSW; Object storage → dosya eki kapsam disi kaldigi icin bu fazda gerekmiyor, Faz 5'e devreder), Queue ve Cache acik kaliyor. Search (full-text) ADR-0029'un konusu degil — modul bugun yalnizca anlamsal arama yapiyor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 1.4   | 2026-08-02 | **Faz 4 kapsamı genişletildi** ([ADR-0030](adr/0030-conversation-memory-daily-report-onboarding.md)): konuşma hafızası, günlük rapor, onboarding. §2.3'teki **Queue kalemi kapandı** — ayrı broker (BullMQ/Redis) kurulmuyor, zamanlanmış işler PostgreSQL tabanlı (`SKIP LOCKED` + backoff, kanıtlanmış outbox deseni). Açık kalan tek teknik karar: **Cache**. Queue kararının dar okunması gerektiği not edildi: "broker yok" ≠ "kuyruk yok"; kuyruk PostgreSQL.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 1.6   | 2026-08-05 | **Faz 5 başladı** ([ADR-0031](adr/0031-crm-module.md)): [§3](#3-faz-5--modül-genişlemesi) ADR'ye bağlandı ve genişletildi — ilk modül CRM, tekrarın ürettiği soyutlama (port'lar `shared/`'a, oran sınırı ve konuşma tabloları `platform`'a), ve fazın en önemli kararı **tek kurumsal hafıza** (`POST /ask` + `RetrievalContributor`, izin bazlı eleme). **[§8.1](#81-gözlemlenebilirlik-neden-faz-4e-kadar)'in AI maliyet takibi kalemi KAPANDI** (Slice 0.5) — Faz 4'e yetişmemişti, Faz 5'in ilk işi olarak kapatıldı; merkezî log toplama ve hata izleme açık kaldı. **[§2.4](#24-zorunlu-alt-adım-cicd--hosting)'ün prod koşulunun karşılanmadığı kayda geçirildi** — Faz 4 o koşul sağlanmadan kapatıldı, metin yumuşatılmadı, karar Product Owner'a bırakıldı. Faz 4 [§1](#1-tamamlanan-fazlar) tablosuna ✅ olarak eklendi; §8.4 retention borcunun Faz 5'te sekize çıkacağı not edildi.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 1.7   | 2026-08-08 | **[§8.4](#84-fırsatlar-ekranı-kapanmış-anlaşmaları-özet-şeridine-alma--💡-fikir) eklendi — fikir kaydı, uygulanmadı.** Slice 9-B düzen çalışmasında ortaya çıktı: `/app/crm/pipeline` beş aşamayı da eşit sütun çiziyor ama `won`/`lost` hat değildir ve kod bu ayrımı zaten üç yerde yapıyor (`listFollowUps`, `listOpenPipeline`, `openOpportunityCount`). Kapanmışları özet şeridine alıp üç açık aşamayı genişletmek kart yoğunluğu sorununu yatayda çözerdi. Product Owner **şimdi uygulanmayacağına** karar verdi (beş sütunun da görünmesi bilinçli bir istekti); fikir yeniden keşfedilmesin diye kayda geçti. Retention borcu §8.4 → **§8.5**'e kaydı; yaşayan çapraz referans güncellendi, tarihsel kayıtlara dokunulmadı.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 1.8   | 2026-08-08 | **Faz 5'in kapsamı sayıldı, Faz 6'nın kapısı sertleşti** (Product Owner kararı). Yeni [§3.5](#35-modül-sıralaması--on-iki-modül-product-owner-kararı): Faz 5 **on iki modül** — CRM · Projeler · Finans · Randevu/Rezervasyon · Belge/Sözleşme · Stok/Envanter · Tedarikçi · Teklif/Fatura · İK(temel) · Anket · Kampanya · Sadakat. Üç bağımlılık kayda geçti (Teklif/Fatura → Finans · Tedarikçi → CRM deseni · Belge/Sözleşme → **object storage kararını tetikler**, §2.3'ün ertelenmiş kalemi artık bir tarihe bağlı). **İK'nın kapsamı bir sınır olarak yazıldı:** maaş ve sağlık verisi kapsam dışı — sağlık verisi KVKK'da özel niteliklidir, genişletme ayrı ADR ister. **[§4](#4-faz-6--faturalama)'ün kapı koşulu "1–2 modül"den on iki modülün TAMAMINA çıkarıldı** — eski koşul bugün karşılanmış sayılabilirdi, metin silinmedi ki koşulun sıkılaştığı görülsün; kararın bedeli (gelirin en sona itilmesi) ve bunun §2.4 hosting ile §8.2 KVKK üzerindeki baskısı açıkça yazıldı. **[§9.3](#93-architecturemd-62-modül-haritası--açık) açıldı:** `ARCHITECTURE.md` §6.2 bu listeyle çelişiyor (Workflow ve Reporting yok) — düştü mü ertelendi mi sorusu Product Owner'a bırakıldı, §6.2'ye dokunulmadı.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2.0   | 2026-08-10 | **[§8.5](#85-retention-borcu-oniki-tablo-tek-karar) sekizden ONA çıktı** (Projeler Slice 3, [ADR-0033](adr/0033-projects-module.md) §1): `projects.progress_notes` + `projects.progress_note_chunks`. `conversations` dersi burada da **ilk günden** uygulandı — doğru retention kolu `progress_notes`'tur, çünkü parçalar cascade ile gider. Kayda geçen asıl gözlem sayı değil **şekil** değişikliği: vektör taşıyan tablo sayısı ikiye (listede sayılmayan `knowledge.note_chunks` ile üçe) çıktı ve on ikinci modüle kadar her anlatısal modül bir tane daha ekleyecek — yani karar tablo tablo bir süre listesinden çok "chunk tabloları ebeveynleriyle birlikte gider" kuralına dayanmalı. §8 tablosundaki dört tablo sayan satır §8.5'e referansla değiştirildi (liste iki yerde ayrı ayrı sayılıyordu ve biri güncel kalmıyordu).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 1.9   | 2026-08-10 | **2. modül başladı** ([ADR-0033](adr/0033-projects-module.md) kabul edildi): [§3.5](#35-modül-sıralaması--on-iki-modül-product-owner-kararı) tablosunda CRM ✅, Projeler 🟢 oldu; yeni [§3.6](#36-2-modül-projeler--yeni-olan-tek-şey-cross-modül-referans) eklendi. Sıralama açısından kayda değen tek yenilik: Projeler, **başka bir modülün kaydına işaret etmek isteyen ilk modül** (proje → CRM şirketi). Cross-schema FK yasak olduğu için üç parçalı bir desen kuruldu (FK yok · ad public interface'ten okunur · okuma hedefin iznine bağlı) ve **bu desen kalan on modülü bağlar**. Bağımlılık yönünün tek yönlü olduğu (Projeler → CRM) ve tersinin modül döngüsü kuracağı kayda geçti — Tenant ↔ Identity tuzağının aynısı, çözümü aynı: üçüncü bir modül. ROADMAP §3.5'in "zaman" kelimesi **son tarih/takvim** olarak okundu; **zaman takibi (timesheet) kapsam dışıdır** (Product Owner onayı, 2026-08-10).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2.1   | 2026-08-11 | **3. modül başladı** ([ADR-0034](adr/0034-finance-module.md) kabul edildi, Slice 1 bitti): [§3.5](#35-modül-sıralaması--on-iki-modül-product-owner-kararı) tablosunda Projeler ✅ (kapanış denetimi 2026-08-10'da yapılmıştı, satır **bayat kalmıştı**), Finans 🟡 oldu; yeni [§3.7](#37-3-modül-finans--desen-üçüncü-kez-ama-üç-yeni-soruyla) eklendi. Sıralama açısından üç yenilik: (1) [§3.6](#36-2-modül-projeler--yeni-olan-tek-şey-cross-modül-referans)'nın "bir kez daha tekrarlanınca genelleştirme değerlendirilir" cümlesi **karşılandı ve cevap HAYIR oldu** — gerekçe mimari, "erken" değil: ortak bir yardımcı izin kapısını sahibinden alırdı; (2) modül bağımlılık grafiği ilk kez **dallandı** (Projeler→CRM, Finans→CRM, Finans→Projeler = DAG) ve yeni kenar eklemeden önce döngü kontrolü kural oldu; (3) projedeki **ilk dar permission kataloğu** — `member`/`viewer` finansı görmez, yani [§3.3](#33-fazın-en-önemli-kararı-tek-kurumsal-hafıza)'ün izin filtresi ilk kez gerçek bir tetikçi buldu. Retention listesi ([§8.5](#85-retention-borcu-oniki-tablo-tek-karar)) **bilerek dokunulmadı**: Finans'ın iki tablosu Slice 5'te geliyor ve olmayan tabloyu listelemek, listeyi bir plana çevirirdi.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2.2   | 2026-08-12 | **3. modül BİTTİ** — [§3.5](#35-modül-sıralaması--on-iki-modül-product-owner-kararı)'te Finans 🟡 → ✅, [§3.7](#37-3-modül-finans--desen-üçüncü-kez-ama-üç-yeni-soruyla)'nin yedi slice'ı da ✅. Faz 5'in ilk üç modülü kapandı; sıradaki 4. modül Randevu/Rezervasyon. **[§8.5](#85-retention-borcu-oniki-tablo-tek-karar) ONDAN ONİKİYE çıktı** (`finance.commentaries` + `finance.commentary_chunks`) ve **vektör taşıyan tablo sayısı DÖRDE** çıktı — 2.0'da yazılan "her anlatısal modül bir tane daha ekleyecek" öngörüsü üçüncü kez doğrulandı. ⚠️ `finance.transactions` listeye **bilerek girmedi** ve gerekçesi ters yönde: sınırsız büyür ama mali kayıt saklamak yasal bir yükümlülüktür (TTK), yani cevabı "sil" değil **"silinmez"**tir — [§8.2](#82-kvkkgdpr-neden-faz-6-öncesi)'nin KVKK kontrol noktasına bu şekilde girdi. Modülün kapanışında kayda değen üç şey: (1) `POST /ask` izin filtresi **ilk kez gerçekten sınandı** (`member` → 200 alır ama Finans içeriğini görmez), (2) CLAUDE.md'nin CEO örneği **dört modülle tam karşılandı**, (3) `SOON` dizisi boşaldı ve sidebar'ın "Modüller" bölümü koşullu render'a alındı.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2.3   | 2026-08-13 | **4. modül BİTTİ** — [§3.5](#35-modül-sıralaması--on-iki-modül-product-owner-kararı)'te Randevu/Rezervasyon ⏳ → ✅, yeni [§3.8](#38-4-modül-randevu--rezervasyon--desen-tutuyor-ama-havuz-doldu) eklendi ([ADR-0035](adr/0035-randevu-rezervasyon-modulu.md), altı slice, HAFİF kapanış denetimi). **[§8.5](#85-retention-borcu-onüç-tablo-tek-karar) ONİKİDEN ONÜÇE çıktı** ve başlığı/çapraz referansları buna göre değişti (tarihsel kayıtlardaki eski çapraz referanslara v1.7'nin kuralı gereği dokunulmadı). Sayıdan çok **şekil** değişti: eklenen tek tablo, listedeki ilk **kendisi ebeveyn olan** vektör tablosudur (vektör satırın kolonunda, chunk tablosu yok) — yani vektör taşıyan tablo sayısı **beşe** çıkarken "chunk tabloları ebeveynleriyle birlikte gider" kuralı ihlal edilmedi, **gereksizleşti**. ⚠️ Kapanışın en değerli çıktısı bir **kapasite sınırının ilk kez görülmesi** oldu: katkıcı sayısı dokuza çıktı, global top-K hâlâ **8** ve iki yapısal katkıcı (`appointment-schedule` · `finance-cashflow`) üç farklı soruda da havuza **hiç giremedi** — izole tenant testi ikisinin de çalıştığını kanıtladı, yani hata değil sınır. Product Owner kararı: rerank/kota **bugün açılmadı**, bulgu kayda geçti. Ayrıca fan-out gecikmesi **N=9'da ölçüldü** (iki kez atlanmıştı): pay toplam sürenin **%3'ü**, darboğaz hâlâ `LLMPort.complete`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2.4   | 2026-08-25 | **9. modül BİTTİ** — [§3.5](#35-modül-sıralaması--on-iki-modül-product-owner-kararı)'te İK/Personel ⏳ → ✅ ([ADR-0043](adr/0043-ik-personel-modulu.md) + [ADR-0044](adr/0044-ik-v2-izin-ve-zenginlestirilmis-calisan-kaydi.md)). ⚠️ **9. modülün kapsam notu bir sınırdan İKİ sınıra ayrıldı** ve eski cümle üstü çizili olarak bırakıldı: **sağlık verisi sınırı AYNEN duruyor** (KVKK m.6 — dar istisna yalnızca sağlık kuruluşlarına/hekimlere; genel bir İK modülü girmez, gereken şey açık rıza + Kurul 2018/10'un ek tedbirleridir ve bu "AI'dan izole etmekle" çözülmez), **maaş ise Product Owner kararıyla GİRDİ ve üç katmanla AI'dan izole edildi** (ayrı tablo · ayrı izin · **sıfır** `RetrievalContributor`) — maaş yüzeyinin [§8.2](#82-kvkkgdpr-neden-faz-6-öncesi)'nin KVKK denetiminden geçmeden gerçek müşteri verisiyle kullanılmaması ADR'ye ve buraya yazıldı. ⚠️ **[§8.5](#85-retention-borcu-onüç-tablo-tek-karar) YİRMİDEN YİRMİ İKİYE çıktı** ve bu kez **şekil** de değişti: eklenen kalemlerden biri bir iş modülünün tablosu değil, `platform.audit_log` — **listenin en hızlı büyüyen kalemi** (bir kullanıcı isteği değil, HER ALAN DEĞİŞİKLİĞİ bir satır yazar) ve retention kararı burada bir denge sorusudur: denetim izini kısaltmak onu var etme sebebini zayıflatır. ⚠️ İK'nın **iki tablosu listeye bilerek GİRMEDİ ve gerekçeleri FARKLI**: `hr.employees` çoğalmaz (çalışan başına tek satır), `hr.compensation_records` ise **çoğalır ama silinemez** — `finance.transactions`'ın aynı durumu (yasal saklama) **artı** ADR-0043 §6.2 (defterin değiştirilemezliği denetim izinin ta kendisidir). ⚠️ **Vektör taşıyan tablo sayısı SEKİZDE KALDI** — İK, Faz 5'te bu sayıyı artırmayan **ikinci** modül ve `POST /ask` havuzuna **hiç dokunmayan ilki**. ⚠️ Modül 5–8 için bu tabloya satır **hiç yazılmamıştı** (§3.5 durumları güncellenmişti); geçmişe dönük yazılmadı, boşluk burada kayda geçti. |
| 1.5   | 2026-08-02 | **Retention borcu güncellendi** ([§8](#8-yatay--sürekli-kalemler), yeni [§8.4](#84-retention-borcu-beş-tablo-tek-karar)): iki tablo yerine **dört** — `login_attempts` · `verification_code_requests` · `daily_report_runs` · `messages`. Tek madde altında tutuldu (çözüm tek karar: süre + temizlik mekanizması) ama ilk ikisinin güvenlik/denetim, son ikisinin kullanıcı verisi olduğu ve dolayısıyla "hepsine tek süre" cevabının yanlış olacağı not edildi. §8.2'deki KVKK kontrol noktasına bağlandı.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
