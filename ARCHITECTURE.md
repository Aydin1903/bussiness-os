# ARCHITECTURE.md

Business OS — Sistem Mimarisi

> **Durum:** Faz 0 (taslak). Onaylanmış kararlar işaretlenmiştir.
> Bu doküman yaşayan bir belgedir; her mimari karar buraya işlenir.

---

## 1. Mimari İlkeler

| İlke | Anlamı |
|---|---|
| Clean Architecture | Bağımlılıklar daima içeri doğru akar |
| Domain Driven Design | İş modeli kodun merkezindedir, teknoloji detay |
| SOLID | Özellikle Dependency Inversion — dış dünya interface arkasında |
| Modular Monolith | Tek deploy, sert modül sınırları |
| Event Driven | Modüller arası iletişim asenkron domain event ile |
| Secure by Design | Güvenlik sonradan eklenen katman değil, varsayılan |
| Scalability First | Dikey ölçek yeterli değilse yatay ölçeğe geçiş yeniden yazma gerektirmez |
| Maintainability First | 5 yıl sonra okunabilir olmayan kod bugün de yanlıştır |

### Yön veren tek cümle

> **Bugünün basitliğini, yarının ayrılabilirliğinden feragat etmeden koru.**

Modular monolith olarak başlıyoruz çünkü mikroservis erken aşamada gereksiz operasyonel yük. Ama her modül, *bugün* ayrı servise çıkarılabilecek disiplinle yazılıyor.

---

## 2. Teknoloji Kararları

### ✅ Onaylanmış

| Alan | Karar | Ana gerekçe |
|---|---|---|
| Backend | NestJS + TypeScript | Native DI + modül sistemi Clean Arch'a birebir uyuyor; frontend ile tek dil |
| Frontend | Next.js (App Router) | SSR + RSC, modül bazlı route grupları, self-host edilebilir |
| Database | PostgreSQL | RLS, JSONB, pgvector — üçü de bu ürün için kritik |
| ORM | Drizzle ORM | Explicit transaction/connection kontrolü → RLS güvenliği öngörülebilir |
| Auth | Kendi modülümüz | Tam kontrol, sıfır vendor lock-in, tenant modeliyle tam entegre |
| Repo | Turborepo monorepo | Tip paylaşımı, atomik commit, tek CI |
| Tenant kimliği | JWT claim + subdomain | Güvenlik sınırı token'da, subdomain sadece routing |
| API versioning | URI path `/api/v1` | Okunabilir, test edilebilir, NestJS native |

### ⏳ Karara bağlanmamış

Aşağıdakiler ilgili fazda Product Owner'a ayrıca sorulacaktır — bu doküman öneri kaydeder, karar vermez.

| Alan | Ön öneri | Ne zaman sorulacak |
|---|---|---|
| Cache | Redis | Faz 3 |
| Queue / Jobs | BullMQ (Redis üzerinde) | Faz 3 |
| Message broker | Faz 1'de gerek yok — in-process bus + Outbox | Mikroservis geçişinde |
| Object storage | S3-uyumlu (MinIO lokal / R2 veya S3 prod) | Faz 3 |
| Search | PostgreSQL Full Text ile başla; gerekirse Meilisearch | Faz 4 |
| Vector store | pgvector (ayrı DB yerine) | Faz 4 |
| Observability | OpenTelemetry + Pino | Faz 1 |
| CI/CD | GitHub Actions | Faz 1 |
| Hosting | Belirlenmedi | Faz 7 |

---

## 3. Multi-Tenancy — Sistemin Kalbi

Bu bölüm mimarinin **en kritik parçasıdır**. Burada yapılan hata veri sızıntısıdır ve üründen daha fazlasını kaybettirir.

### 3.1 İzolasyon stratejisi

**Aşama 1 (bugün):** Shared database + shared schema + **Row Level Security**
**Aşama 2 (Enterprise):** Aynı kod, dedicated database

Geçiş yeniden yazma gerektirmez çünkü tenant→bağlantı çözümü tek bir yerde soyutlanır:

```typescript
interface TenantConnectionResolver {
  resolve(tenantId: TenantId): Promise<DbConnection>;
}
```

- **Shared mod:** her zaman aynı pool'u döner, RLS izolasyonu sağlar.
- **Dedicated mod:** tenant'ın kendi connection'ını döner, RLS gereksizleşir ama zararsızdır.

Business logic hangi modda olduğunu **bilmez**. Bu, Aşama 2'nin maliyetini bir adapter'a indirger.

### 3.2 Tenant context akışı

```
HTTP isteği
   ↓
JWT doğrulanır → tenant_id claim çıkarılır      ← GÜVENLİK SINIRI BURASI
   ↓
Subdomain ile çapraz kontrol → uyuşmazsa 403
   ↓
TenantContext, AsyncLocalStorage'a yazılır
   ↓
Transaction açılır
   ↓
SET LOCAL app.current_tenant_id = '<uuid>'      ← transaction-scoped, sızmaz
   ↓
Sorgular çalışır — RLS otomatik filtreler
   ↓
Commit / Rollback → context temizlenir
```

**Neden `SET LOCAL`:** Transaction bitince otomatik sıfırlanır. Connection pool'a geri dönen bağlantıda önceki tenant'ın id'si **kalmaz**. `SET` (LOCAL'sız) kullanmak bu projede yasaktır — connection pooling ile birleştiğinde tenant sızıntısı üretir.

### 3.3 RLS politikası standardı

Tenant verisi tutan her tablo şu şablona uyar:

```sql
ALTER TABLE <schema>.<table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <schema>.<table> FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON <schema>.<table>
  USING      (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

- `FORCE` şart — aksi halde tablo sahibi rolü politikayı **atlar**.
- Uygulama, tablo sahibi olmayan ayrı bir DB rolü ile bağlanır.
- `USING` okumayı, `WITH CHECK` yazmayı korur. İkisi de zorunlu.

> ⚠️ **`FORCE` kuralının tek gerekçeli istisnası: `platform.tenants`.**
> Tenant resolution, context **kurulmadan önce** slug'ı çözmek zorundadır;
> `FORCE` uygulansaydı bunu yapan `SECURITY DEFINER` fonksiyonu da kendi
> politikasına takılırdı. Kayıp sınırlıdır (uygulama zaten sahip olmayan bir
> rolle bağlanır) ve sapma bir entegrasyon testiyle sabitlenmiştir.
> Gerekçenin tamamı:
> [`MULTI_TENANT_ARCHITECTURE.md` §12.4.1](docs/architecture/MULTI_TENANT_ARCHITECTURE.md#1241-tenant-resolution-i%CC%87%C3%A7in-kontroll%C3%BC-rls-a%C5%9F%C4%B1m%C4%B1).
> **Diğer her tenant-scoped tabloda `FORCE` zorunludur.**

### 3.4 Zorunlu güvenlik testi

Her tenant-scoped tablo için, tenant A'nın tenant B'nin kaydını **okuyamadığını ve yazamadığını** kanıtlayan entegrasyon testi yazılır. Bu test olmadan modül merge edilmez. Pazarlık konusu değildir.

---

## 4. Katman Mimarisi

```
┌─────────────────────────────────────────┐
│ Presentation  controller, HTTP şeması   │
├─────────────────────────────────────────┤
│ Application   use case, port, DTO       │
├─────────────────────────────────────────┤
│ Domain        entity, VO, domain event  │  ← saf TypeScript
├─────────────────────────────────────────┤
│ Infrastructure  repo impl, adapter      │
└─────────────────────────────────────────┘
        Bağımlılık yönü: yukarıdan aşağıya
        Infrastructure, Application'ın port'unu implemente eder
```

### Domain katmanı kuralları

- Framework import'u **yasak** — NestJS, Drizzle, Express hiçbiri giremez.
- Dış dünya ile konuşmaz. I/O yapmaz.
- Invariant'ları constructor'da korur. Geçersiz nesne **yaratılamaz**.
- Value Object'ler immutable'dır.

**Neden bu kadar katı:** Domain katmanı ürünün 10 yıl yaşayacak parçası. Framework'ler değişir. Domain kalır.

### Runtime tip güvenliği

TypeScript tipleri runtime'da yoktur. Bu, DDD invariant'ları için gerçek bir zayıflıktır. Karşı önlem:

- Sisteme giren **her** dış veri (HTTP body, query, env, LLM cevabı, webhook) Zod ile doğrulanır.
- Domain nesneleri sadece factory metodu ile yaratılır — `new` ile değil.
- Primitive obsession yok: `string` yerine `TenantId`, `Email`, `Money` value object'leri.

---

## 5. Request Lifecycle

Bir isteğin sistemde izlediği sıra **sabittir**. Adım atlanamaz, sıra değiştirilemez. Bu bölüm, "yetki kontrolünü şuraya alsak" tartışmasını kapatmak için vardır.

```
Client
   │
   ▼
Middleware              correlationId üretimi, request log, body limit, CORS, helmet
   │
   ▼
Tenant Resolver         subdomain → aday tenant  (YALNIZCA routing/branding)
   │
   ▼
Authentication          JWT doğrulanır → tenant_id + user_id claim   ← GÜVENLİK SINIRI
   │                    subdomain ↔ claim çapraz kontrolü → uyuşmazsa 403
   │                    TenantContext, AsyncLocalStorage'a yazılır
   ▼
Authorization           merkezi policy engine: (role, permission, resource, action)
   │                    deny-by-default → izin açıkça verilmemişse 403
   ▼
Validation              Zod: params + query + body — sınırda, istisnasız
   │
   ▼
Use Case                application katmanı; transaction BURADA açılır
   │                    SET LOCAL app.current_tenant_id = '<uuid>'
   ▼
Repository              application port'unun infrastructure implementasyonu
   │
   ▼
Database                RLS otomatik filtreler
   │
   ▼
Commit                  domain event'ler outbox'a yazılmış hâlde commit edilir
   │
   ▼
Response                DTO'ya map edilir — domain nesnesi asla doğrudan dönmez
```

### 5.1 Adım kuralları

| Adım | Kritik kural |
|---|---|
| Tenant Resolver | Subdomain **yetki kaynağı değildir**. Tek başına veri erişimi açamaz. |
| Authentication | `tenant_id`'nin tek meşru kaynağı doğrulanmış JWT claim'idir. Header/body'den asla alınmaz. |
| Authorization | Controller'da dağınık `if` yasak. Karar merkezî policy engine'de verilir. |
| Validation | Doğrulama yetkilendirmeden **sonra** çalışır: yetkisiz kullanıcıya şema detayı sızdırılmaz. |
| Use Case | Transaction sınırı burasıdır. Repository kendi başına transaction açmaz. |
| Response | Domain nesnesi serialize edilmez — sızıntı yüzeyi budur. |

### 5.2 Hata yolu

Herhangi bir adımda hata → global exception filter → **RFC 7807** yanıtı.
Yanıt `traceId` taşır; stack trace, SQL veya dosya yolu **taşımaz**.

### 5.3 Arka plan işleri

Cron ve queue tetiklemeli işlerde HTTP katmanı yoktur; tenant context **açıkça** kurulur:

```
Job Handler → TenantContext.run(tenantId) → Use Case → Repository → Database
```

Tenant context'i kurulmamış bir job, tenant verisine erişemez. Bu, HTTP yolundaki güvenceyle aynıdır.

---

## 6. Modül Mimarisi

### 6.1 Modül sınırı — üç sert kural

1. **Database izolasyonu:** Her modül kendi PostgreSQL schema'sına sahiptir. Modül A, modül B'nin tablosunu okuyamaz. Cross-schema foreign key yasaktır — referans, id ile tutulur.
2. **Kod izolasyonu:** Modülün `internal` klasörü dışarıdan import edilemez. Sadece `<module>.public.ts` dışa açıktır. Bu, lint kuralı ile **makine tarafından** zorlanır.
3. **İletişim:** Senkron ihtiyaç → public interface. Asenkron/bildirim → domain event.

**Neden bu kadar sert:** Bu üç kural sağlandığında bir modülü mikroservise ayırmak "schema'yı ayrı DB'ye taşı, event bus'ı network'e çıkar" işlemine iner. Sağlanmazsa aynı iş aylarca sürer.

### 6.2 Modül haritası

**Platform (çekirdek — sıra bağımlılıktır, atlanamaz)**

```
Tenant → Identity → Authorization (RBAC) → Audit
```

| Modül | Sorumluluk |
|---|---|
| Tenant | Tenant yaşam döngüsü, provisioning, plan/limit |
| Identity | Kullanıcı, kimlik doğrulama, oturum, token |
| Authorization | Rol, izin, policy değerlendirme |
| Audit | Değişmez denetim kaydı |

**İş modülleri (Faz 5+)**

CRM · Projects · Documents · Knowledge Base (kurumsal hafıza) · Workflow · Reporting

Her biri bağımsız geliştirilir, bağımsız test edilir.

---

## 7. Event Mimarisi

### 7.1 Transactional Outbox — neden zorunlu

Bir domain event, onu doğuran veri değişikliğiyle **aynı transaction'da** kaydedilmelidir.

Aksi halde: DB commit olur, event yayınlanamaz (process çöker) → **sistem kalıcı olarak tutarsız** hale gelir. Bu, dağıtık sistemlerin en yaygın sessiz hatasıdır.

```
┌── Transaction ──────────────────────────┐
│  1. Domain değişikliği kaydedilir       │
│  2. Event, outbox tablosuna yazılır     │
└── COMMIT ───────────────────────────────┘
             ↓ (ayrı process)
   Outbox publisher → event bus → handler'lar
```

### 7.2 Kurallar

- Event isimleri **geçmiş zaman**: `InvoiceIssued`, `UserInvited` — `CreateInvoice` değil.
- Event'ler immutable ve versiyonlanabilir.
- Her event `tenantId`, `occurredAt`, `correlationId` taşır.
- Handler'lar **idempotent** olmak zorundadır — at-least-once teslimat varsayılır.
- Faz 1–5'te bus in-process çalışır. Mikroservis geçişinde aynı interface network bus'a bağlanır; handler kodu değişmez.

---

## 8. AI Mimarisi

### 8.1 Temel ilke

> Business logic hiçbir LLM sağlayıcısını **bilmez**.

```
Use Case
   ↓ (sadece bunu bilir)
LLMPort  ← interface
   ↓
OpenAI · Anthropic · Gemini · xAI · Azure · OpenRouter · Ollama · LM Studio
```

**Kabul testi:** Yeni sağlayıcı eklemek yalnızca yeni adapter yazmayı gerektirmeli. Business logic'te tek satır değişmemeli. Değişiyorsa soyutlama yanlıştır.

### 8.2 AI katmanı bileşenleri

| Bileşen | Sorumluluk |
|---|---|
| `LLMPort` | Sağlayıcı-bağımsız completion / streaming / tool-use arayüzü |
| Provider Registry | Tenant bazlı sağlayıcı ve model seçimi |
| Prompt Registry | Versiyonlanmış prompt'lar — kodun içine gömülmez |
| Cost Tracker | Token ve maliyet takibi, tenant bazlı kota |
| Fallback Chain | Sağlayıcı hatasında alternatife düşme |
| Guardrails | Girdi/çıktı doğrulama, PII maskeleme |

### 8.3 Kritik kurallar

- **LLM çıktısına asla güvenilmez.** Her cevap Zod ile doğrulanır, sonra domain'e girer.
- **Prompt'lar tenant verisi içerir** → prompt loglama PII sızıntısı riskidir. Loglar maskelenir.
- **Maliyet tenant'a atfedilir.** Atfedilemeyen AI çağrısı yazılamaz.
- Sağlayıcı API anahtarları tenant bazlı olabilir (BYOK — Enterprise talebi).

---

## 9. Altyapı Port'ları

AI katmanındaki ilke tüm altyapı bağımlılıkları için geçerlidir:

> Business logic **hiçbir** altyapı sağlayıcısını bilmez. Sağlayıcı bir adapter detayıdır.

```
Use Case
   ↓ (sadece port'u bilir)
StoragePort · CachePort · SearchPort
   ↓
Adapter'lar (değiştirilebilir)
```

**Kabul testi (üçü için de aynı):** Sağlayıcı değiştirmek yalnızca yeni adapter yazmayı gerektirmeli. Business logic'te tek satır değişmemeli. Değişiyorsa soyutlama yanlıştır.

> ⚠️ Bu bölüm **soyutlamayı** tanımlar, sağlayıcıyı **seçmez**. Hangi adapter'ın production'da kullanılacağı Faz 3'te Product Owner'a ayrıca sorulur.

### 9.1 StoragePort — dosya/nesne depolama

```typescript
interface StoragePort {
  put(key: StorageKey, data: Readable, meta: ObjectMeta): Promise<void>;
  get(key: StorageKey): Promise<Readable>;
  delete(key: StorageKey): Promise<void>;
  signedUrl(key: StorageKey, ttl: Duration, mode: 'read' | 'write'): Promise<Url>;
  exists(key: StorageKey): Promise<boolean>;
}
```

| Adapter | Kullanım |
|---|---|
| MinIO | Lokal geliştirme ve CI (Docker) |
| AWS S3 | Production adayı |
| Cloudflare R2 | Production adayı — egress maliyeti düşük |
| Azure Blob | Enterprise müşteri talebi hâlinde |

**Kurallar**

- Nesne anahtarı **daima** tenant ile başlar: `tenants/<tenantId>/<module>/<resourceId>/<file>`. Tenant prefix'i olmayan anahtar yazılamaz.
- `StorageKey` bir value object'tir; `string` kabul eden metot yazılmaz (path traversal ve tenant sızıntısı önlemi).
- Dosya **asla** API üzerinden stream edilmez; signed URL ile doğrudan storage'dan servis edilir. TTL kısa tutulur.
- Yüklenen dosyanın MIME türü ve boyutu sınırda doğrulanır; içerik türü istemci beyanına göre değil, gerçek içeriğe göre belirlenir.
- Storage **kaynak-of-truth değildir**: her nesnenin metadata'sı PostgreSQL'de tenant-scoped bir satırda tutulur. Yetim nesneler periyodik iş ile temizlenir.

### 9.2 CachePort — önbellek

```typescript
interface CachePort {
  get<T>(key: CacheKey): Promise<T | null>;
  set<T>(key: CacheKey, value: T, ttl: Duration): Promise<void>;
  delete(key: CacheKey): Promise<void>;
  deleteByPrefix(prefix: CacheKey): Promise<void>;
  withLock<T>(key: CacheKey, ttl: Duration, fn: () => Promise<T>): Promise<T>;
}
```

| Adapter | Kullanım |
|---|---|
| Redis | Birincil aday (Faz 3'te karara bağlanacak) |
| In-memory | Yalnızca test ve tek-process geliştirme |

**Kurallar**

- Cache anahtarı **daima** tenant içerir: `t:<tenantId>:<module>:<entity>:<id>`. Tenant'sız anahtar yazmak yasaktır — cache, RLS'in **koruyamadığı** tek veri yoludur.
- Cache **opsiyoneldir**. Cache düşerse sistem yavaşlar, **çalışmaz hâle gelmez**. Cache'e bağımlı business logic yazılamaz.
- Yetkilendirme sonucu cache'lenecekse TTL kısa tutulur ve rol/izin değişiminde açıkça invalidate edilir. Bayat izin = güvenlik açığı.
- Invalidation stratejisi yazının yanında değil, **domain event'te** yaşar: `InvoiceIssued` → ilgili cache prefix'i temizlenir.
- Cache'de PII veya token tutulmaz.

### 9.3 SearchPort — arama

```typescript
interface SearchPort {
  index(doc: SearchDocument): Promise<void>;
  bulkIndex(docs: SearchDocument[]): Promise<void>;
  remove(id: SearchDocumentId): Promise<void>;
  search(query: SearchQuery): Promise<SearchResult>;   // tenantId ZORUNLU alan
}
```

| Adapter | Kullanım |
|---|---|
| PostgreSQL Full Text (`tsvector` + GIN) | **Faz 1–4 varsayılanı** — sıfır ek altyapı |
| Meilisearch | Ölçek/alaka ihtiyacı doğduğunda |
| OpenSearch | Enterprise ölçek, gelişmiş analiz |

**Neden PostgreSQL FTS ile başlıyoruz:** Ayrı arama motoru ikinci bir veri deposu demektir — senkronizasyon, tutarsızlık ve operasyonel yük getirir. Bu maliyet, arama gerçekten darboğaz olduğunda ödenir; önce değil. Port bugün tanımlandığı için geçiş bir adapter işidir.

**Dürüst dezavantaj:** PostgreSQL FTS'te tipo toleransı (typo tolerance), gelişmiş alaka skorlama ve facet desteği zayıftır. Ürün "Google gibi arama" beklentisi doğurursa Meilisearch'e geçiş Faz 4'ten önce gündeme gelebilir.

**Kurallar**

- `SearchQuery` içinde `tenantId` **zorunlu** alandır — opsiyonel yapılamaz. Harici arama motorunda RLS yoktur; izolasyonu sorgu kendisi sağlar.
- Index yazımı **domain event üzerinden**, outbox akışıyla yapılır. Use case doğrudan `index()` çağırmaz — aksi hâlde DB commit olur, index güncellenmez ve arama sessizce bayatlar.
- Index yeniden kurulabilir olmalıdır: PostgreSQL kaynak-of-truth'tur, arama index'i **türetilmiş** veridir. Silinip sıfırdan üretilebilir olmalıdır.
- Arama sonucu yetki filtresinden geçer: kullanıcının göremeyeceği kayıt sonuçta görünmez. Index'te olması, erişilebilir olması demek değildir.

---

## 10. Güvenlik

| Alan | Karar |
|---|---|
| Token | JWT access (kısa ömürlü) + refresh token rotation |
| Şifre | Argon2id |
| Yetkilendirme | RBAC; policy değerlendirme merkezi — controller'da dağınık `if` yasak |
| Transport | Her yerde TLS |
| Secret | Asla repo'da. Env + secret manager |
| Input | Sınırda Zod doğrulaması, istisnasız |
| Audit | Güvenlik açısından anlamlı her işlem denetim kaydına yazılır |
| Rate limit | Tenant + IP bazlı |

### 10.1 Yetkilendirme modeli — Role · Permission · Resource · Action

Yetkilendirme dört kavram üzerine kuruludur. Bu dördü karıştırılırsa yetki sistemi bakılamaz hâle gelir.

| Kavram | Tanım | Örnek |
|---|---|---|
| **Resource** | Üzerinde işlem yapılan varlık türü. Modül sahipliğindedir. | `invoice`, `document`, `user`, `project` |
| **Action** | Bir kaynağa uygulanabilen fiil. | `create`, `read`, `update`, `delete`, `approve`, `export` |
| **Permission** | Tek bir yetenek — `resource:action` biçiminde atomik izin. | `invoice:approve`, `document:read` |
| **Role** | Kullanıcıya tenant içinde atanan, adlandırılmış izin demeti. | `owner`, `admin`, `member`, `viewer` |

```
User ──atanır──► Role ──içerir──► Permission ──= ──► Resource : Action
```

**Kurallar**

- **Permission'lar koda sabittir.** Kaynak ve fiil kümesi kod deploy'u ile gelir; runtime'da üretilmez. Sebep: kodda karşılığı olmayan izin, sessizce hiçbir şeyi korumaz.
- **Roller veridir ve tenant-scoped'tur.** Her tenant kendi rollerini tanımlayabilir; bir tenant'ın rolü diğerine sızmaz. Sistem rolleri (`owner`) değiştirilemez.
- **Varsayılan deny.** İzin açıkça verilmemişse cevap `403`'tür. "Yasaklanmamışsa serbesttir" bu projede geçerli değildir.
- **Karar merkezîdir.** Değerlendirme tek bir policy engine'de yapılır; controller'da dağınık `if` yazılamaz (bkz. §5 Request Lifecycle).
- **Yetki kontrolü tenant kontrolünün yerine geçmez.** İkisi ayrı katmandır: RLS "hangi tenant", RBAC "bu kullanıcı ne yapabilir" sorusunu yanıtlar. Biri diğerini gereksiz kılmaz.
- **Her kaynak bir modüle aittir.** Modül, kendi kaynak ve fiil kümesini Authorization modülüne **deklare eder**; Authorization modülü iş modüllerini bilmez.

**Gelecek genişlemesi (Faz 5+, bugün yapılmıyor):** Kayıt bazlı koşullar — "yalnızca kendi oluşturduğu belgeyi silebilir", "yalnızca kendi departmanının projelerini görebilir". Bu, policy engine'e koşul (ABAC) katmanı eklemeyi gerektirir. Bugünün `resource:action` modeli, o katmanın altına bozulmadan girecek şekilde tasarlanmıştır.

### Tehdit modeli — bu ürünün en büyük 3 riski

1. **Tenant veri sızıntısı** → RLS + `FORCE` + zorunlu izolasyon testleri
2. **Yetki yükseltme** → merkezi policy engine, deny-by-default
3. **AI prompt injection** → guardrail, çıktı doğrulama, LLM'e yetki verilmemesi

---

## 11. Ölçeklenebilirlik Yolu

```
Aşama 1  Modular monolith · tek DB · RLS                    ← başlangıç
Aşama 2  Yatay ölçek: stateless API + read replica
Aşama 3  Enterprise dedicated DB (aynı kod, farklı resolver)
Aşama 4  Darboğaz modüller mikroservise ayrılır
```

Her aşama bir öncekinin **üzerine** kurulur. Hiçbiri yeniden yazma gerektirmez. Bu, mimarinin varlık sebebidir.

---

## 12. Architecture Decision Records

Kalıcı sonuç doğuran her karar `docs/adr/` altında kaydedilir.

Format: `NNNN-kisa-baslik.md` → Bağlam · Karar · Gerekçe · Sonuçlar · Alternatifler

**Kayıtlı ADR'ler:**

| # | Karar |
|---|---|
| 0001 | Backend: NestJS + TypeScript |
| 0002 | Multi-tenancy: Shared DB + RLS |
| 0003 | ORM: Drizzle |
| 0004 | Auth: Kendi modülümüz |
| 0005 | Monorepo: Turborepo |
| 0006 | Event: Transactional Outbox |
| 0007 | AI: Provider-agnostic port/adapter |
| 0008 | API versioning: URI path |
| 0009 | Storage: provider-agnostic `StoragePort` |
| 0010 | Cache: provider-agnostic `CachePort` |
| 0011 | Search: `SearchPort` — PostgreSQL FTS ile başlangıç |
| 0012 | Tenant Definition: One Company = One Tenant |
| 0013 | Organization Strategy: V1'de Organization entity yok |
| 0014 | Global User & Membership (+ Role Value Object) |
| 0015 | Tenant Resolution: Hybrid — Custom Domain → Subdomain → JWT |
| 0016 | Tenant Provisioning: Email verification önce |

0012–0016 multi-tenancy kararlarının bütünsel anlatımı için:
[`docs/architecture/MULTI_TENANT_ARCHITECTURE.md`](docs/architecture/MULTI_TENANT_ARCHITECTURE.md) —
multi-tenancy konusunda **Single Source of Truth**'tur.

---

## 13. Future Extensions

Bu bölüm gelecek yönelimleri **kayda geçirir**. **Hiçbiri bugün yapılmıyor.**
Her biri gündeme geldiğinde ayrı bir ADR ile karara bağlanır.

Buradaki maddeler bir taahhüt değildir. Amaç, bugünün kararlarının yarının
yönünü **kapatmadığından** emin olmaktır.

### 13.1 Agent ekosistemi

**Tetikleyici:** AI katmanı (§8, ADR-0007 — provider-agnostic `LLMPort`) olgunlaştığında **ve** gerçek iş modülleri (CRM, Finance, HR, Projects) veri üretmeye başladığında. Bugün hiçbir iş modülü yoktur; bu yüzden bugün inşa edilmiyor.

**Vizyon — karar değil, kayıt.** Tek bir genel amaçlı AI yerine, aynı tenant içinde **uzmanlaşmış ajanlar**: CEO Agent · Finance Agent · Sales Agent · HR Agent · Legal Agent.

Ajanlar ortak kurumsal hafızayı paylaşır, birbirine soru sorabilir ve sonuçlarını **tek bir rapor** hâlinde birleştirebilir. "Son 6 ayı analiz et" sorusu, Finance Agent'ın nakit akışını, Sales Agent'ın pipeline'ı ve HR Agent'ın ekip kapasitesini ayrı ayrı değerlendirip birleştirmesiyle yanıtlanır.

Bu, `CLAUDE.md` "Proje Nedir" bölümündeki konumlandırmanın doğal sonucudur: modüller AI'a bağlam ve hafıza sağlar; ajanlar o hafızanın üzerinde uzmanlaşır.

> ⚠️ **Bugünden not düşülmesi gereken kritik kısıt**
>
> **Agent-to-agent iletişim dâhil, her etkileşim tenant sınırını korumak zorundadır.**
>
> Ajanlar arası mesajlaşma, uygulama katmanının altından geçen yeni bir veri
> yoludur ve RLS'in **doğal olarak korumadığı** bir yüzeydir — tıpkı cache,
> storage ve arama indeksi gibi (`MULTI_TENANT_ARCHITECTURE.md` §12.5).
>
> Bu genişleme gündeme geldiğinde mevcut tenant context ve RLS modeli
> (`MULTI_TENANT_ARCHITECTURE.md` §10–§13) **yeniden gözden geçirilmelidir —
> gevşetilmemelidir.** Her ajan çağrısı bir tenant context'i altında çalışmalı,
> ajanlar arası her mesaj `tenantId` taşımalı ve iki farklı tenant'ın ajanı
> aynı bağlamı **hiçbir koşulda** paylaşmamalıdır.
>
> "Ajanlar zaten aynı sistemin parçası" gerekçesiyle bu kısıtın gevşetilmesi,
> izolasyon garantisinin sonu olur.

**Açık kalan sorular:** Ajanlar arası iletişim senkron mu, event tabanlı mı · Bir ajanın hangi modüllere erişebileceğini ne belirler (RBAC'in ajanlara uzantısı) · Maliyet hangi ajana ve hangi tenant'a atfedilir (§8.3) · Ajan çıktısının doğrulanması (guardrail) nasıl ölçeklenir.

### 13.2 Marketplace ve plugin katmanı — "platformdan uygulamaya"

**Tetikleyici:** Temel modüller **ve** AI katmanı stabil olduğunda. Üçüncü tarafa açılmak, önce kendi sözleşmelerimizin oturmasını gerektirir; erken açılan bir API, sonradan değiştirilemeyen bir API'dir.

| Genişleme | Ne getirir |
|---|---|
| **Plugin SDK** | Üçüncü tarafın kendi modülünü yazabilmesi — mevcut modül sınırı disiplini (§6.1) bunun ön hazırlığıdır |
| **Marketplace** | Modül ve ajan dağıtımı, sürümleme, kurulum/kaldırma yaşam döngüsü |
| **Üçüncü parti entegrasyonlar** | Muhasebe, e-posta, takvim, ödeme sağlayıcıları — her biri port/adapter olarak (§9) |
| **MCP Server** | Business OS'un kurumsal hafızasını dış AI istemcilerine standart bir protokolle açması |
| **Automation Builder** | Kullanıcının kod yazmadan iş akışı kurması; domain event'lerin (§7) kullanıcıya görünen yüzü |

Bu adım ürünü bir **uygulamadan platforma** dönüştürür ve beraberinde bugün olmayan sorunları getirir: üçüncü taraf kodunun izolasyonu (sandbox), plugin'lerin tenant verisine erişim yetkisi, sürüm uyumluluğu, güvenlik denetimi ve marketplace yönetişimi.

> ⚠️ Aynı kısıt burada da geçerlidir: bir plugin veya dış MCP istemcisi, **tenant sınırının dışına çıkamaz**. Üçüncü taraf kodu, kendi yazdığımız koddan daha az değil **daha çok** kısıtlanır.
