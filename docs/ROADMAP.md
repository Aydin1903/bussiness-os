# Roadmap

Business OS — Faz Sıralaması ve Kapı Koşulları

> **Durum:** Faz 4 girişi — ✅ **Kabul edildi**
> **Sürüm:** 1.0
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

> ⚠️ **Faz 3 formal olarak kapatılmadı.** CLAUDE.md bugün "Faz 3 **sürüyor**" diyor ve "Henüz yok" listesinde iki kalem hâlâ Faz 3 kapsamındadır: **Authorization'ın kalanı** (tenant-configurable roller, ABAC, izin cache — çekirdek çalışıyor) ve **tenant outbox publisher süreci** (Identity outbox tüketicisi var, tenant tarafınınki yok).
>
> Bu iki kalem Faz 4'ü **bloke etmez**: RBAC çekirdeği + tenant context + RLS uçtan uca çalışan bir zincirdir ve ilk iş modülü bunun üzerine oturur. Ama "Faz 3 tamamlandı" demek için Product Owner'ın bunları ya kapatması ya da açıkça Faz 5'e devretmesi gerekir. **Karar bekliyor.**

---

## 2. Faz 4 — İlk Gerçek Modül + AI Context Engine

> **Durum:** ✅ **Karar verildi** — sıradaki faz.

### 2.1 Ne yapılacak

**Knowledge / Inbox modülü ile AI Context Engine BİRLİKTE inşa edilecek.**

İlk iş modülü olarak CRM, Finans veya İK **seçilmedi**. Seçim Knowledge/Inbox'tır.

### 2.2 Neden birlikte — bu fazın tek kritik gerekçesi

AI Context Engine, bir modülün üstüne **sonradan yapıştırılan bir özellik değildir**; ilk modülle **birlikte tasarlanan bir mimari temeldir**.

Bu, `CLAUDE.md`'nin kurucu kısıtının doğrudan sonucudur: *"Modüller ürün değildir, hafızadır."* Context Engine'i ikinci veya üçüncü modülde eklemeye kalkmak, ilk modülü "AI'a bağlam üretmeyen" bir modül olarak tasarlamak demektir — ve o modül sonradan geriye dönük olarak yeniden yazılır. Knowledge/Inbox bu yüzden seçildi: kurumsal hafızanın en doğrudan taşıyıcısıdır ve Context Engine'in ilk gerçek tüketicisidir.

### 2.3 Bu fazda **zorunlu olarak** karara bağlanacak açık teknik kararlar

Hiçbiri bugünden seçilmiyor. Üçü de modülün mimari tasarımı sırasında, kendi ADR'leriyle netleşecek.

| Karar | Bugünkü durum | Ne zaman |
|---|---|---|
| **Search / Vector store** | Ön öneri var (PostgreSQL FTS + pgvector — [ADR-0011](adr/0011-search-port-postgres-fts.md), ARCHITECTURE §9), **seçilmedi** | Context Engine tasarımıyla |
| **Queue** | Ön öneri var (BullMQ), **seçilmedi** | Asenkron indeksleme/embedding ihtiyacı netleşince |
| **Cache** | Ön öneri var (Redis — [ADR-0010](adr/0010-cache-port.md)), container ayakta ama **uygulama bağlanmıyor**, **seçilmedi** | İlk gerçek önbellek yükü çıkınca |

> Üçü de **port arkasındadır** ve öyle kalacaktır (ADR-0009/0010/0011 deseni). Sağlayıcı seçimi bir adapter kararıdır; iş mantığı hiçbirine bağlanmaz.

### 2.4 Zorunlu alt-adım: CI/CD + Hosting

**Bu faz prod'a çıkmadan kapanmaz.** Bugüne kadar hiç prod'a çıkılmadı.

| Kalem | Durum |
|---|---|
| CI (GitHub Actions) | ✅ Faz 1'de kuruldu — test + lint + typecheck |
| **CD** | ❌ Yok |
| **Hosting** | ❌ Karara bağlanmadı |

Gerekçe: prod'a hiç çıkmamış bir sistemin "çalışıyor" iddiası test edilmemiş bir iddiadır. Migration'ların gerçek bir veritabanında sırayla uygulanması, secret yönetimi, ortam ayrımı ve geri alma (rollback) yolu — hepsi ancak gerçek bir dağıtımda ortaya çıkar. Bu iş ne kadar ertelenirse, ilk dağıtımda karşılaşılacak sürpriz o kadar büyür.

### 2.5 Kapı koşulu (Faz 4'e giriş)

Yok — Faz 4 bugün başlayabilir. RBAC + tenant context + RLS zinciri uçtan uca çalışıyor ve modül→Authorization permission deklarasyonu deseni bir kez uygulandı (`member:read`).

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

Bu doküman yazılırken, mevcut dokümanlarda **bu yol haritasıyla çelişen** faz atamaları bulundu. Sessizce düzeltilmedi — Product Owner kararı gerektiriyor.

### 9.1 `ARCHITECTURE.md` §2 teknoloji tablosu

| Kalem | ARCHITECTURE.md diyor | Bu doküman diyor |
|---|---|---|
| Cache | Faz 3 | **Faz 4** (§2.3) |
| Queue / Jobs | Faz 3 | **Faz 4** (§2.3) |
| Object storage | Faz 3 | Faz 4 kapsamında değerlendirilmeli — **bu dokümanda hiç yok** |
| Search | Faz 4 | **Faz 4** ✅ uyumlu |
| Vector store | Faz 4 | **Faz 4** ✅ uyumlu |
| Hosting | Faz 7 | **Faz 4** (§2.4) |
| İş modülleri | Faz 5+ | **Faz 4** (ilk modül), Faz 5 (kalanlar) |

Ayrıca [ADR-0007](adr/0007-ai-provider-agnostic-port.md) "uygulama Faz 6+" der; bu doküman AI Context Engine'i **Faz 4**'e koyar.

> **Öneri:** `ARCHITECTURE.md` §2 tablosunun "Ne zaman sorulacak" sütunu ve ADR-0007'nin faz alanı bu dokümana göre güncellensin. Faz numaraları erken yazıldığında tahminden ibaretti; bugün gerçek sıra biliniyor. **Onay bekliyor** — bu doküman tek başına ARCHITECTURE.md'yi geçersiz kılmaz.

### 9.2 `AUTH_ARCHITECTURE.md` sürüm geçmişi

Header'daki sürüm etiketi `1.1 (2026-07-26)` ile değişiklik geçmişi tablosu arasında bir numara çakışması var: `1.1` tabloda zaten 2026-07-22'de (EmailPort) kullanılmış, ADR-0026 cookie değişikliği muhtemelen `1.6` olmalıydı ve tabloya hiç girmemiş. Geçmişi yeniden yazmamak için dokunulmadı; en son kayıt `1.6` olarak eklendi (§8 "doküman sürüm numarası denetimi").

---

## Değişiklik geçmişi

| Sürüm | Tarih | Değişiklik |
|---|---|---|
| 1.0 | 2026-08-02 | İlk sürüm. Faz 4–9 sırası ve kapı koşulları karara bağlandı: **Faz 4 = Knowledge/Inbox + AI Context Engine birlikte** (CRM/Finans/İK değil), Search/Vector + Queue + Cache bu fazda seçilecek, CI/CD + Hosting zorunlu alt-adım. Yatay kalemler ve [§9](#9-uzlaştırılacak-kayıtlar) uyumsuzluk kaydı eklendi. Faz 1–3 **tekrarlanmadı**, CLAUDE.md'ye referans verildi. |
