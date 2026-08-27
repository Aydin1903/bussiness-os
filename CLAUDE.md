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
**Faz 5 ✅ TAMAMEN KAPANDI (2026-08-27)** — on iki iş modülünün on ikisi de
canlı (ROADMAP §3.5). Kapanış 12. modülün (Sadakat) HAFİF denetiminde
doğrulandı ve o denetim aynı zamanda **Faz 5'in genel kapanış denetimidir**:
⚠️ **13 iş şemasının 13'ü de prod'da RLS + FORCE** (`knowledge` · `crm` ·
`projects` · `finance` · `appointments` · `documents` · `inventory` ·
`suppliers` · `invoicing` · `hr` · `feedback` · `marketing` · `loyalty`) ve
⚠️ **12 modülün 12'sinin kök rotası prod'da gerçek istekle 401** — olmayan
yollar **404**, yani cevap **ayırt edici**.
⚠️ `platform` bu sayıma **dahil değildir ve bu doğrudur**: on tablosu
(kullanıcı, kimlik bilgisi, refresh token, kilit sayaçları, doğrulama kodları,
`identity_outbox`) **tenant kapsamlı değildir** — Faz 3'ün kimlik olayları
`tenantId = null` taşır; onlara tenant RLS koymak olmayan bir kapsamı **var
gibi göstermek** olurdu.
⚠️ **Faz 6'nın (Faturalama) kapı koşulu KARŞILANDI** — ama Faz 6 bir "başla"
düğmesi **değildir**: ROADMAP §8.2'nin KVKK kontrol noktası ve §8.5'in
**yirmi dört tablolu** retention borcu **hâlâ açıktır**.
**12. modül Sadakat Programı ✅ bitti — VE FAZ 5'İ KAPATTI** (ADR-0051; üç
slice, HAFİF kapanış denetimi 2026-08-27; backend prod'da doğrulandı — migration
39 → 40).
⚠️ Bu modül **beş ilk** taşıyor: **cross-modül işaretçisi ilk kez ZORUNLU**
(`crm_contact_id NOT NULL`) — beş modülde _"zorunluluk sahte kayıt üretir"_
dersi burada **ters işliyor**, çünkü bir işletme puan verdiği kişiyi zaten
tanımak zorundadır; **bir değişmezin veritabanı garantisi ilk kez YOK**
(bakiye ≥ 0 satırlar arası bir koşuldur, `CHECK` göremez — tek dayanak tek kod
yolu + `SELECT … FOR UPDATE`); **defter değiştirilemez ama hesap silinebilir**
(beşinci şekil, `RESTRICT` KVKK yüzünden kullanılamazdı); **satır içi damga
ilk kez bir denetim izinden zayıf değil** (ekleme-yalnız defterde damganın
kendisi sıradır, `platform/audit` bu yüzden kullanılmıyor); ve **kahraman
rakam ilk kez anlamlı bir TOPLAM** (ADR-0034'ün para birimi ve ADR-0039'un
birim kuralı ilk kez **tetiklenmiyor** — puanın para birimi yok, tek birim
var).
⚠️ **SIFIR KATKICI — İK'dan sonra ikinci, ama FARKLI sebeple:** İK'da sıfır
bir **güvenlik özelliğiydi**, burada bir **SINIR**. Üç aday dört testle elendi
ve ⚠️ **T2 hiçbirinin reddinde gerekçe olarak KULLANILMADI** (ADR-0050 §Karar
4). En derin bulgu: ⚠️ **bu projedeki her yapısal alarm ya kullanıcının BEYAN
ETTİĞİ BİR EŞİĞE ya BİR TARİHE dayanır** — Sadakat v1'de ikisi de yok, yani
eksik olan katkıcı değil **onun besleyeceği girdi**. Fan-out **18'de kaldı**.
⚠️ **İKİ YAZILI KARAR UYGULAMADA ÖLÇÜMLE DEĞİŞTİ** ve ikisi de ADR'ye işlendi:
① **FK bileşik oldu** — düz bir FK ile tenant A, tenant B'nin hesabına işaret
eden satır yazabiliyordu, çünkü ⚠️ **PostgreSQL'de referans bütünlüğü denetimi
RLS'i ATLAR** ve `WITH CHECK` yalnızca satırın *kendi* `tenant_id`'sini bağlar.
Çözüm ADR-0034'ün bileşik FK deseni. ② **`accounts` üzerinde `GRANT UPDATE`
var, ama bir TRIGGER onu bağlıyor** — ⚠️ `SELECT … FOR UPDATE` bir satır
kilididir ve PostgreSQL `ACL_SELECT_FOR_UPDATE` ister, o da `ACL_UPDATE`'e
eşittir; yani **kilit UPDATE yetkisi olmadan alınamaz**. Bir `GRANT`in yokluğu
yalnızca uygulama rolünü bağlardı, trigger **tablo sahibini de** bağlar — yani
koruma zayıflamadı **güçlendi** ve bu **prod'da davranışsal olarak** kanıtlandı
(owner ve app aynı `23001`, `point_entries` ise `42501` — iki farklı katman).
⚠️ **Kademe (tier) v2'ye ERTELENDİ** ve bu bir **ROADMAP §3.5 sapmasıdır**:
ayrıcalıksız bir kademe bir **etikettir**, ayrıcalıklar ödül kataloğunu
gerektirir; kademe türetilebilir olduğu için erteleme **hiçbir veri
kaybettirmiyor**.
⚠️ **Retention YİRMİ ÜÇTEN YİRMİ DÖRDE çıktı** (`loyalty.point_entries`) ve
⚠️ listedeki **ikinci** _"silmek geçmişi değil BUGÜNKÜ SAYIYI değiştirir"_
kalemidir (`inventory.movements`ten sonra). `loyalty.accounts` listeye
**girmedi** (müşteri sayısıyla artar, zamanla değil). ⚠️ **Vektör taşıyan
tablo sayısı ONDA KALDI** — Faz 5'te bu sayıyı artırmayan **üçüncü** modül.

**11. modül Kampanya/Pazarlama ✅ bitti** (ADR-0047; üç slice, HAFİF kapanış
denetimi 2026-08-26 — migration 38 → 39, prod'da doğrulandı).
⚠️ Bu modül **dört ilk** taşıyor: **`POST /ask` havuzuna İKİ katkıcıyla giren
ilk modül** (anlamsal `campaign-notes` + yapısal `campaign-gap`) ve ⚠️ **ikisinin
ÖRTÜŞME KÜMESİ BOŞ** — `campaign-notes` yalnızca sonuç notu OLAN kayıtları
görür, `campaign-gap` yalnızca OLMAYANLARI; ADR-0045'in dördüncü ölçütü
mantıken başka türlü geçemezdi. ⚠️ **Başarısız yeniden gömme vektörü `NULL`'a
çeker** (projede ilk): bayat bir vektör DOLU görünür, `reindex` bulamaz ve
`/ask` ESKİ İÇERİKLE cevap verir — hata SESSİZDİR. ⚠️ **Hedef kitle bir
SEGMENT DEĞİLDİR** — CRM'de `segment` kavramı yoktur ve `crm.segments` açmak
CRM'in işidir. ⚠️ **Retention listesini BÜYÜTMEYEN ilk vektör tablosu**
(yılda birkaç kampanya girilir; liste 23'te kaldı, vektör taşıyan tablo 10'a
çıktı).
⚠️ **T2 ATEŞLEDİ** — bu modülün `campaign-gap`i ve Geri Bildirim'in askıdaki
`feedback-satisfaction`ı birlikte eklenince satır döndüren yapısal kaynak
**6 → 8** oldu (eşik 6). ADR-0050 üç seçeneği de (taban büyüklüğü · `K` ·
rerank) gerçek dört sorulu ölçümle sınadı ve ⚠️ **hiçbirini değiştirmedi**.

**10. modül Müşteri Geri Bildirimi ✅ bitti** (ADR-0045; üç slice, HAFİF
kapanış denetimi 2026-08-25 — migration 37 → 38, prod'da doğrulandı).
⚠️ Bu modül **üç ilk** taşıyor: **havuza DIŞARIDAN gelen ilk ses** (bugüne
kadar her anlatıyı şirket kendisi yazmıştı — görüşme notu, ilerleme notu,
servis notu; burada gömülen metin **müşterinin kendi cümlesi**), **bayatlama
penceresi olmayan ilk anlamsal modül** (başlığın üç bileşeni de —
tarih · puan · kanal — değiştirilemez, yani `staleAfterRename` türü bir borç
**hiç doğmadı**), ve **kahraman rakamı bir ORTALAMA olan ilk oda** (ölçek sabit
1–5 olduğu için ADR-0034'ün para birimi / ADR-0039'un birim kuralı burada
tetiklenmiyor).
⚠️ **YAPISAL KATKICI EKLENMEDİ — ama ADR-0040/0043'teki gibi "bakıldı ve
yoktu" DEĞİL:** aday (`feedback-satisfaction`) dört testten **üçünü geçiyor**,
yani **liyakatli**. Eklenmemesinin sebebi USULDÜR: eklemek ADR-0042 §3'ün
**T2** eşiğini tetikler ve ⚠️ **T2'nin girdisi bugün ÖLÇÜLEMİYOR**
(`retrieval.select` gözlemlenebilirlik satırı yok). Yapısal kaynak **6'da
kaldı**, T2 **kapalı** — ve bu artık **bir testle kilitli**.
⚠️ **DEĞİŞTİRİLEMEZ AMA SİLİNEBİLİR — projede ÜÇÜNCÜ şekil.** Güncelleme yok
çünkü kayıt **bizim sözümüz değil**, bir üçüncü kişinin beyanıdır; silme **var**
çünkü yorum **kişisel veri içerebilir** (KVKK m.7/m.11) — yani silme bir
kolaylık değil bir **yükümlülüktür**. Koruma üç katmanlı (`feedback:write`
diye bir izin YOK · entity/repository'de `update` YOK · veritabanında `UPDATE`
**yalnızca `embedding` kolonunda**) ve üçü de testle kilitli.
**9. modül İK/Personel ✅ bitti** (ADR-0043 + **ADR-0044**; beş iş, HAFİF
kapanış denetimi 2026-08-24; v2 aynı gün eklendi — migration 31 → 37).
⚠️ Bu modül Faz 5'te **birçok ilki** taşıyor: **`platform/audit` AÇILDI**
(üç kez ertelenen borç; ADR-0041 §8'in üçüncü ertelemesi bir karar olacaktı),
**maaş girdi ama AI'dan ÜÇ KATMANLA izole** (ayrı tablo · ayrı izin · **SIFIR
katkıcı**), **`POST /ask` havuzuna HİÇ dokunmayan ilk iş modülü**, ve
**sağlık verisi KESİN SINIR** — serbest not alanı yok, `sick` izin türü yok,
üç katmanda birden korunuyor.
**8. modül Teklif/Fatura ✅ bitti** (ADR-0041; üç slice, HAFİF kapanış denetimi
2026-08-23; Slice 1 prod'da doğrulandı 2026-08-22 — migration 31 → 32).
⚠️ Dört şey **ilk kez** oldu: **ADR-0036'nın eşiği AŞILDI** (yapısal kaynak
5 → 6, PO onayıyla; ADR-0036 bu işte **değiştirilmedi**, revizyon ADR-0042'ye
bırakıldı ve kapanış denetimi onun **tek veri girdisini** üretti), **vektör
taşımayan ilk iş modülü** (embedding/chunk/reindex/oran sınırı YOK),
`shared/`'a **ADR-0009'dan beri ilk yeni port** (`PdfPort`), ve bir ad ilk kez
**kolonda saklandı** (`customer_name` — gönderilmiş belge bir SNAPSHOT'tır).
⚠️ `platform/audit` borcu **açılmadı**: küçültülerek ertelendi (gönderilmiş
belge değiştirilemez + satır içi aktör damgası) ve tetikleyici **9. modüle**
taşındı — ⚠️ **üçüncü erteleme artık bir karar olur**.
**7. modül Tedarikçi ✅ bitti** (ADR-0040; üç slice, HAFİF kapanış denetimi
2026-08-22; Slice 1 prod'da doğrulandı 2026-08-21 — migration 30 → 31).
⚠️ Üç şey kayda değer: **ADR-0036'nın eşiğine BİLİNÇLİ OLARAK DOKUNULMADI**
(üç yapısal aday değerlendirildi, üçü de reddedildi — yapısal kaynak 5'te
kaldı), **izin adı çakışması ilk kez GERÇEK oldu** (`contact`/`interaction`
CRM'de zaten alınmıştı → `supplier_contact`/`supplier_interaction`, CRM
kataloğuna tek satır dokunulmadı), ve **cross-modül kenarı bu sefer bir ADAY
REDDEDİLEREK** boş kaldı (Stok'ta hedef şema yoktu; burada `inventory` canlı
ve yine eklenmedi).
**1. modül CRM ✅ bitti** ve **prod'da canlı** (ADR-0031 + ADR-0032; kapanış
denetimi 2026-08-09). Aynı işte Context Engine platforma yükseldi.
**2. modül Projeler ✅ bitti** (ADR-0033; altı slice, kapanış denetimi
2026-08-10). Cross-modül referans deseni ilk kez çalıştı ve `POST /ask` artık
**dört kaynağı** birleştiriyor.
**3. modül Finans ✅ bitti** (ADR-0034; yedi slice, HAFİF kapanış denetimi
2026-08-12). `POST /ask` izin filtresi ilk kez **gerçekten sınandı** ve
CLAUDE.md'nin CEO örneği **dört modülle tam karşılandı**.
**5. modül Belge/Sözleşme ✅ bitti** (ADR-0037; üç slice, HAFİF kapanış
denetimi 2026-08-19). ⚠️ Üç şey **ilk kez** oldu: kalıcı durum **veritabanı
dışına** çıktı (Cloudflare R2 — ADR-0009'un açık sağlayıcı kalemi kapandı),
chunk tablosu **geri döndü** (Randevu'nun kararının tam tersi, aynı ölçütten),
ve cross-modül referans **hiçbir şey yapılmayarak** doğrulandı (`crm.public.ts`
ve `projects.public.ts` tek satır değişmedi). ⚠️ **ADR-0036'nın taban kısıtı
ölçüldü ve ÇALIŞIYOR**: üç ayrı yapısal ses cevapta, `documents` sistematik
olarak dışlanmıyor.
**4. modül Randevu/Rezervasyon ✅ TAMAMEN KAPANDI** (ADR-0035; altı slice, HAFİF
kapanış denetimi 2026-08-13, **prod doğrulaması 2026-08-14** — `82c8ad3`,
health 200, migration 27'de sabit). Anlatısal içerik ilk kez **parçalanmadan**
embed edildi (chunk tablosu yok) ve `POST /ask`in **top-K havuzu ilk kez doldu**
— dokuz katkıcı, sekiz yuva. Denetimin bulduğu `DisclosableProblem` kusuru ve
`platform/context` alt-borcu **kapandı**. Dördü de aşağıda.

**Frontend (`apps/web`) çalışıyor** — auth ekranları (register · verify-email ·
login+routing · create-tenant · select-tenant · forgot/reset-password · logout ·
change-password) · **Panel** (`/app`) · **arşiv** (`/app/knowledge`) ·
**onboarding** (`/app/onboarding`) · **on modülün ekranları** (`/app/crm` ·
`/app/projects` · `/app/finance` · `/app/appointments` · `/app/documents` ·
`/app/inventory` · `/app/suppliers` · `/app/invoicing` · `/app/hr` ·
`/app/feedback` · `/app/loyalty`) — ⚠️ **on iki odanın on ikisi de canlı**. Riskli
runtime akışları
(bootstrap, tenant değiştirme, tüm auth zinciri) gerçek tarayıcıda doğrulandı.
Vitest + RTL **571 test**; **kalan borç: Playwright e2e yok.**
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
guard; kalan: tenant-configurable roller, ABAC, izin cache) · ~~**Faz 5'in kalan
modülleri**~~ ✅ **HEPSİ BİTTİ — on iki modülün on ikisi de canlı**
(ROADMAP §3.5) · **koyu tema UI anahtarı** (bugün yalnızca OS
tercihi) · **`company:read`'siz kullanıcı senaryosu** (dört rolün dördü de bu
izni taşıyor — kapı var, tetikçi yok; ⚠️ Finans'ın **dar** kataloğu izin
filtresini `cashflow:read` üzerinden gerçekten tetikledi ama `company:read`
satırı değişmedi) · ~~**finans denetim izi**~~ ✅ **`platform/audit` AÇILDI**
(2026-08-24, ADR-0043 §8 — üç kez ertelenmişti). ⚠️ **Ama borç TAM
KAPANMADI ve bu ayrım önemlidir:** altyapı ve `AuditPort` var, **tek tüketicisi
İK'dır**. Finans/Stok/Tedarikçi'nin _"bu tutarı kim değiştirdi"_ soruları hâlâ
**cevapsızdır** — o modüllere bağlamak ayrı bir iştir (Mutlak Kural 1).
⚠️ Denetim kaydı **DEĞER SAKLAMAZ**, yalnızca **alan adı**: "unvan değişti"
der, "X'ten Y'ye değişti" **demez** — değer saklamak, izlemek istediğimiz
veriyi ikinci bir yerde çoğaltmak olurdu
· Storage/Cache/Search adapter'ları · **MT §8.2 adım 3** (host ipucu ↔ claim
çapraz kontrolü — subdomain altyapısı kurulunca) · **retention: YİRMİ ÜÇ
tablo** (ROADMAP §8.5; İK yirmiden yirmi ikiye çıkardı — ⚠️ eklenen kalemlerden
biri bir iş modülünün tablosu **değil**: `platform.audit_log`, ve o **listenin
en hızlı büyüyen kalemidir** — bir kullanıcı isteği değil, **HER ALAN
DEĞİŞİKLİĞİ** bir satır yazar. ⚠️ Kararı en zor olan kalem de odur: denetim
izini kısaltmak, onu var etme sebebini zayıflatır. Ayrıca Belge kaleminde
veritabanı dışında bir **R2 nesnesi** var ve retention işi satırla birlikte onu
da silmek zorundadır) · **`POST /ask` top-K havuzu DOLU** (⚠️ artık **on sekiz**
katkıcı — **on anlamsal + sekiz yapısal** — sekiz yuva. ⚠️ **T2 ATEŞLEDİ**
(satır döndüren yapısal 8 > eşik 6) ve ADR-0050 üç seçeneği de ölçümle
sınayıp **hiçbirini değiştirmedi**: taban `ceil(K/3)`, `K` 8, rerank kapalı.
⚠️ ADR-0050'nin asıl bulgusu şu: kısıt bir **kapasite** değil bir **ÖLÇÜ**
sorunudur — yapısal skor sabit band, anlamsal skor `1 - index/(n+1)` yani bir
**SIRA**, ve on anlamsal kaynağın **onunun da** en iyi isabeti tam `1.0`.
⚠️ Sistematik eleme **ADR-0049 ile kapandı** (band içi eşitlik `affinity` →
`lot` ile kırılıyor; kayıt sırası artık hiçbir yerde belirleyici değil);
gerçek **rerank** hâlâ **açılmadı** ve koşulu — **ölçülmüş kalite verisi** —
hâlâ karşılanmadı. ⚠️ `affinity` o koşulu KARŞILAMAZ: band içi, kaba, ve genel
sorularda **sıfır** yuva belirliyor) · ⚠️ **`retrieval.select` gözlemlenebilirlik satırı**
✅ **KAPANDI** (ADR-0046, 2026-08-25) · **not detay ucu**
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
> ⚠️ Bu, "yeni migration ekleme kontrol listesi"nin **3. adımıdır**; 2. adım
> (`_journal.json`) ADR-0037'de atlandı ve tam listeye dönüştü — bkz. aşağıdaki
> **YENİ MIGRATION EKLEME KONTROL LİSTESİ**.
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

### Faz 5 / 5. modül — Belge / Sözleşme Yönetimi (**bitti**)

Karar: **ADR-0037** (kabul edildi, 2026-08-14). ROADMAP §3.5'in beşinci sırası.
**Altıncı şema.** Üç slice: ADR → Backend (`0027`, `0028`) → Frontend + HAFİF
kapanış denetimi.

Gerçekten yeni **dört** karar:

1. ⚠️ **Kalıcı durum ilk kez VERİTABANI DIŞINDA.** ADR-0009'un açık bıraktığı
   sağlayıcı seçimi kapandı: **Cloudflare R2** (egress ücretsiz). `StoragePort`
   `shared/`'a, adapter `infrastructure/storage/`'a; lokal/CI **MinIO** — ikisi
   de aynı adapter, fark yalnızca endpoint. ⚠️ **Nesne deposunda RLS YOKTUR**:
   izolasyonun tek mekanik dayanağı anahtar düzenidir
   (`tenants/<tenantId>/documents/...`) ve anahtar **her zaman veritabanından**
   gelir.
2. ⚠️ **İki doğruluk kaynağı arasında atomiklik yok** — sıra bilinçli seçildi:
   **her zaman YETİM NESNE tarafında kalınır, NESNESİZ KAYIT asla.** Yükleme:
   doğrula → çıkar → R2'ye yaz → DB satırını aç. Silme: DB satırını sil → nesneyi
   sil. Denetimde canlı kanıtlandı (depo çökmesinde kayıt **açılmadı**).
3. **Chunk tablosu GERİ DÖNDÜ** — ADR-0035'in kararının tam tersi, **aynı
   ölçütten**: metnin üst sınırını Randevu'da BİZ belirliyorduk, burada DOSYA
   belirliyor. İki ADR'nin birlikte ürettiği kural: _chunk tablosu, metnin üst
   sınırını kullanıcı değil verinin kendisi belirliyorsa açılır._
4. **TEK katkıcı, yalnızca anlamsal.** Bir belgenin türetilebilir bir DURUMU
   yoktur; ADR-0036 sonrası "yapısal" etiketi bir **imtiyazdır** ve uydurma bir
   özeti yapısal ilan etmek taban kısıtından haksız yuva çalmak olurdu.

> ### ✅ Cross-modül referans İLK KEZ HİÇBİR ŞEY YAPILMAYARAK doğrulandı
>
> Belge iki modülün verisine bağlanıyor (CRM kişisi + proje) ama
> `crm.public.ts` ve `projects.public.ts` **tek satır değişmedi**:
> `ContactDirectory`yi Randevu, `ProjectDirectory`yi Finans yazmıştı.
> ADR-0035'in netleştirdiği kural (_"yeni TALİP → dosya değişmez; yeni KAYNAK
> TÜRÜ → sahibi modül kendi dizinini yazar"_) ilk kez **talip** tarafından
> sınandı. Ölçülebilir sonucu: **cross-modül için ayrı bir slice gerekmedi.**
>
> Bağımlılık grafiği altı kenar, hâlâ DAG (katman 0: CRM · 1: Projeler ·
> 2: Finans, Randevu, Belge).

> ### ✅ HAFİF kapanış denetimi — **yapıldı, 2026-08-19**
>
> On bir maddenin on biri de koşuldu. ⚠️ **Denetim ÜÇ GERÇEK KUSUR buldu ve
> üçü de birim testleriyle görünmüyordu** — hepsi düzeltildi:
>
> 1. **`multipart` opsiyonel alanları**: `.optional()` eksikti; `contactId`
>    yazmayan HER yükleme 422 alıyordu ve doğrulama dosya kontrolünden önce
>    çalıştığı için desteklenmeyen tür de **415 yerine 422** dönüyordu. Birim
>    testleri gövdeyi zaten çözülmüş veriyordu, yani Zod katmanına hiç
>    uğramıyorlardı.
> 2. **Parça sayacı**: projeksiyona gömülü korelasyonlu alt sorgu hata VERMEDİ
>    ve **her zaman 0** döndürdü — parçası olan bir belge ekranda "Aranamıyor"
>    görünüyordu. Bu, §6.3'ün tam TERSİ bir sessiz yanlıştır.
> 3. **İndirme**: ham `Readable` döndürülüyordu; NestJS onu gövde sanıp
>    **işlenmemiş 500** üretiyordu (`StreamableFile` gerekiyor).
>
> ⚠️ **Ortak ders:** üçü de ancak **gerçek bir HTTP isteğiyle** göründü. Bu
> modülün yüzeyi (multipart gövde, akış cevabı, ORM şablonu) birim testlerinin
> doğal olarak atladığı yerlerde yaşıyor.
>
> ### ⚠️ ADR-0036'NIN TABAN KISITI ÖLÇÜLDÜ VE ÇALIŞIYOR
>
> On katkıcı da doluyken (altı anlamsal + dört yapısal) dağılım, üç farklı
> soruda da aynı: **üç ayrı yapısal ses** cevapta (`crm-pipeline` ·
> `finance-cashflow` · `project-status`) — tam olarak `ceil(8/3) = 3`.
> ADR-0035'in ölçümünde `finance-cashflow` **hiç giremiyordu**; taban onu içeri
> aldı. `documents` üç soruda da içeride, yani **sistematik olarak
> dışlanmıyor**.
>
> ⚠️ Dışarıda kalan ikisi de ADR-0036'nın **yazılı beklentisidir**:
> `appointment-schedule` (dördüncülük garantisi yok) ve `finance-commentaries`
> (anlamsal kaynaklar arasında taban yoktur — eleme liyakattir).
>
> **Fan-out N=10:** ortalama 5030 ms, fan-out payı ≤315 ms (%6), darboğaz
> değişmedi (`LLMPort.complete`, 4458 ms). Gerçek sağlayıcılarla ölçüldü.

> **Renk:** Belge'nin imza rengi **#557380** (koyu `#8dacba`) ve setin
> **en sönüğü** — bilinçli: _"sözleşme ekranı dikkat çekmek için değil okumak
> için vardır."_ ⚠️ Anahtar **`documents`**; palet ilk günden doğru adla
> yazılmıştı, Randevu'daki yeniden adlandırma işi burada **gerekmedi**.

> ### Belge kapanırken bilinen sınırlar (ADR-0037)
>
> - ⚠️ **Nesne deposunda RLS YOK** — izolasyon anahtar düzenine dayanır.
> - ⚠️ **Yetim nesne temizliği YOK** — retention kararıyla aynı gün verilmeli.
> - ⚠️ **Belge bazlı gizlilik YOK**: `document:read` taşıyan herkes TÜM
>   belgeleri görür. Hassas belge (özlük, bordro) bu modüle konulmamalı.
>   **Tetikleyici: 9. modül (İK).**
> - ~~⚠️ **Dosya değiştirme ARAYÜZÜ yok**~~ ✅ **kapandı (2026-08-19)**: iki
>   aşamalı akış eklendi (önce dosya seçilir, sonra "geri alınamaz — dosya ve
>   embedding kalıcı değişecek" uyarısıyla onaylanır; etiket ve bağlantıların
>   korunacağı da yazılır). ⚠️ Backend'e tek satır dokunulmadı — eksik olan uç
>   değil, geri alınamazlığı anlatan tasarımdı.
> - **Taranmış belgeler aranamaz** (OCR yok) — `chunkCount: 0` ekranda söylenir.
> - **Yalnızca PDF/DOCX** (415) · **20 MB** (413) · **300 parça** (422).
> - **Versiyon geçmişi yok** · **değişiklik denetim izi yok** (8. modül) ·
>   **bağlı kişi/proje adı vektörde yok** (ADR-0035'ten bilinçli sapma) ·
>   **klasik metin araması yok** (ADR-0011, altıncı kez).

### Faz 5 / 6. modül — Stok / Envanter (**bitti**)

Karar: **ADR-0039** (kabul edildi, 2026-08-19; uygulandı ve kapandı
2026-08-21). ROADMAP §3.5'in altıncı sırası. **Yedinci şema.** Üç slice: ADR →
Backend (`0029`, **tek slice**) → Frontend + HAFİF kapanış denetimi.

Gerçekten yeni **dört** karar:

1. ⚠️ **MODÜLÜN MERKEZİ SAYISI BİR KOLONDA DEĞİL.** Mevcut miktar
   `inventory.movements`tan **her okumada türetilir**; `items`te miktar kolonu
   **yoktur**. Projede **dokuzuncu** kez aynı karar (`finance.balances`'ın
   reddi, `ends_at`'in reddi …) — ama **ilk kez gerçek bir bedelle**: türetme
   sınırsız büyüyen bir defteri tarar. ⚠️ **ÖLÇÜLDÜ**: 5000 hareketli defterde
   **4–5 ms**; darboğaz `LLMPort.complete` (~4.5 s) yanında görünmez. Kararı
   veren şey **hatanın şekli**: kolonda bozulma *sessiz ve makul görünen yanlış
   bir sayı*, türetmede *ölçülebilir yavaşlık*.
2. ⚠️ **"DÜZELTME" ÜÇÜNCÜ BİR YÖN DEĞİLDİR.** `direction` (in/out) aritmetik
   eksen, `is_correction` sebep. Üç değerli bir `kind` ya **işaretli miktar**
   (ADR-0034 §5'in açıkça reddettiği — işaret koymayı unutan yol çıkışı giriş
   gibi toplar) ya da satır bazında anlam değiştiren nullable bir yön
   gerektirirdi.
3. ⚠️ **DEFTER DEĞİŞTİRİLEMEZ — ADR-0034'ten bilinçli sapma.** Finans işlemi
   düzeltilebilir; envanter hareketi düzeltilemez. Ölçüt: *bugünkü gerçek
   geçmiş kayıtlardan TÜRETİLİYOR mu?* Finans'ta hayır, Stok'ta evet — geçmişi
   değiştirmek **bugünü sessizce yeniden yazar**. Koruma **üç katmanlı**:
   `update` metodu yok · `stock_movement:delete` izni yok · `movements → items
   ON DELETE RESTRICT`.
4. ⚠️ **MİKTARLAR BİRİMLERİ YÜZÜNDEN TOPLANMAZ.** 3 kg un ile 12 adet vidanın
   toplamı yoktur — ADR-0034'ün para birimi kuralının aynı şekli, ikinci kez.
   Modülde **"toplam stok" diye bir rakam BULUNMAZ** ve odanın kahraman rakamı
   bu yüzden **eşik altındaki kalem sayısıdır**.

> **FİZİKSEL SAYIM:** kullanıcı **saydığını** yazar, farkı **sunucu** hesaplar
> (`SELECT … FOR UPDATE` ile tek transaction). ⚠️ Delta'yı istemciye
> hesaplatmak **yasak**: istemcinin okuduğu miktar ile isteğin vardığı an
> arasında bir hareket girerse düzeltme **yanlış** olur ve hata **sessizdir**.
> ⚠️ Kilit **dekoratif değil**: hareket yazan **her yol** önce kalem satırını
> kilitler (`movements`a `INSERT`, `items` kilidini tek başına beklemez). Fark
> sıfırsa **hiçbir satır yazılmaz** (`adjusted: false`).

> **Renk:** Stok'un imza rengi **hardal**dır (`#876b1c` / koyu `#c2a45a`) ve
> `module-colors.css`'te zaten ölçülüdür. ⚠️ Terracottanın ±35°'lik yasak
> koridoruna **en yakın komşu** ve bilinçli olarak sarıya çekilmiş.
> ⚠️ Anahtar **`inventory`**.

> **İzin adları NİTELENMİŞ** (`stock_item`, `stock_movement`) — ADR-0037'nin
> `finance_category` gerekçesi burada **tersine** çıktı: **8. modül
> (Teklif/Fatura)** _line item_ kavramını getirecek ve `item:read` o gün ya
> breaking change ile değişirdi ya da iki modül tek kelimeyi paylaşırdı.

> ⚠️ **CRM'DEN BU YANA ÇIKAN KENARI OLMAYAN İLK İŞ MODÜLÜ** (ADR-0039 §9):
> cross-modül referans v1'de **yok**, bağımlılık grafiği **altı kenarda** kaldı
> ve Stok, CRM ile aynı katmanda bir kök düğüm. 7. modül (Tedarikçi) bir kaleme
> işaret etmek istediği gün `inventory.public.ts`i **Stok yazar** — talip değil
> **sahip** yazar.

> ### ✅ HAFİF kapanış denetimi — **yapıldı, 2026-08-21**
>
> Sekiz maddenin sekizi de koşuldu. ⚠️ **Denetim BİR GERÇEK KUSUR buldu:**
> negatif uyarı eşiği **422 yerine ham 500** dönüyordu — migration'ın CHECK'i
> değeri reddediyor ama uygulama katmanında karşılığı yoktu. **Kısıt
> çalışıyordu, MESAJ çalışmıyordu.** Düzeltildi (`NegativeMinQuantityError`) ve
> üç test kilitliyor. ⚠️ Kusur yalnızca **gerçek bir HTTP isteğiyle** göründü —
> ADR-0037'nin aynı dersi.
>
> ⚠️ **ADR-0036'NIN ZORUNLU ÖLÇÜMÜ YAPILDI — TABAN ÇALIŞIYOR.** On iki katkıcı
> (7 anlamsal + 5 yapısal) doluyken üç farklı soruda dağılım **aynı** kaldı ve
> her üçünde de tam **üç ayrı yapısal ses** cevapta: `crm-pipeline` ·
> **`inventory-stock`** · `project-status` = `ceil(8/3) = 3`. Yeni modülün
> yapısal katkıcısı **sistematik olarak dışlanmadı**. Dışarıda kalanlar
> ADR-0036'nın yazılı beklentisi (`finance-cashflow`, `appointment-schedule` —
> beş kaynak üç yuva; `documents`, `finance-commentaries` — anlamsal kaynaklar
> arasında taban yoktur, eleme liyakattir).
>
> ⚠️ **Fan-out N=12 ÖLÇÜLDÜ**: ortalama toplam **5257 ms**, fan-out payı
> **136 ms (%2)**, darboğaz değişmedi (`LLMPort.complete` 4510 ms) —
> ADR-0037'nin N=10 ölçümüyle **aynı bantta**.
>
> Rol turu (üç gerçek kullanıcı): viewer okur ama **yazamaz (403)**, member
> yazar ama **silemez (403)**. Oran sınırı 60. istekte **429** — ⚠️ aynı anda
> **notsuz kalem 201** ve **hareket yazma 201**: sayaç kalem ya da hareket
> değil **embedding** sayıyor. Renk turu açık **ve** koyu temada; kabuk ve
> AI'ın sesi terracotta kaldı, `app-shell.tsx`e **altıncı kez dokunulmadı**.
>
> **Bilinçli yapılmayanlar:** sıfırdan kurulum ❌ · iki tenant'la tam RLS turu
> ❌ · **prod doğrulaması ❌ — bu slice migration TAŞIMAZ**.

> ### Stok kapanırken bilinen sınırlar (ADR-0039)
>
> - ⚠️ **Miktar sorgusu `movements` büyüdükçe yavaşlar** — bugün 5000 harekette
>   4–5 ms; önbelleğe geçiş yolu açık ve **tek yönlü**.
> - ⚠️ **"Sayım yapıldı ve tuttu" bilgisi hiçbir yerde kalmaz** — fark sıfırsa
>   satır yazılmaz. Sayım günlüğü v2'dir.
> - ⚠️ **Negatif stok mümkündür**: kayıt tutulur, engellenmez (engellemek
>   işletmeyi yalan söylemeye iterdi); yapısal katkıda **0.95** ile raporlanır.
> - ⚠️ **Parti/seri no ve son kullanma YAPISAL DEĞİL** — notta yazılabilir,
>   **sorgulanamaz**. Product Owner'ın örnek notu (_"parti no X"_) serbest
>   metindir.
> - ⚠️ **Depo/lokasyon yok** · **birim varyantları oluşabilir** (`kg`/`Kg`) ·
>   **"toplam stok" diye bir rakam yok**.
> - ⚠️ **Kalemin adını/eşiğini kimin değiştirdiği sorulamaz** (`platform/audit`
>   borcu, 8. modül). ⚠️ Hareket tarafında bu borç **YOK** — defter
>   değiştirilemez.
> - ⚠️ **ADR-0036'nın yeniden gözden geçirme eşiğine BİR KALDI** (yapısal
>   kaynak **5**, eşik 6) — **7. modülün ADR'si bunu okumak zorundadır**.
> - **`embedding`de model/sürüm bilgisi yok** · **arama yalnızca anlamsal**
>   (ADR-0011, yedinci kez) · **iyimser eşzamanlılık yok** — ⚠️ ama **miktar
>   için geçerli değil** (miktar o satırda yaşamıyor).
> - ⚠️ **Retention ONBEŞTEN ONYEDİYE çıktı** ve **yeni bir şekil** getirdi:
>   `inventory.movements` silinirse **geçmiş değil BUGÜNKÜ SAYI** değişir
>   (ROADMAP §8.5'in bağlayıcı kuralı).

### Faz 5 / 7. modül — Tedarikçi Yönetimi (**bitti**)

Karar: **ADR-0040** (kabul edildi ve kapandı 2026-08-22). ROADMAP §3.5'in
yedinci sırası: _"CRM deseninin **ucuz tekrarı** — aynı şekil, ters yön (satın
alma)"_. **Sekizinci şema.** Üç slice: ADR → Backend (`0030`, tek slice) →
Frontend + HAFİF kapanış denetimi.

Gerçekten yeni **dört** karar:

1. ⚠️ **"UCUZ TEKRAR" KOD KOPYALAMAK DEĞİLDİR.** Ucuzluk, verilecek **karar
   sayısının** az olmasıdır. İki somut sonucu var: (a) CRM'in
   `interaction_chunks` tablosu **açılmadı** — o tablo bir **emsal değil**,
   chunk ölçütü (ADR-0035 §3 + ADR-0037 §3) CRM'den **sonra** yazıldığı için
   bir **MİRAS**tır; (b) **fırsat/pipeline yok** — bir satış hattının var olma
   sebebi belirsiz bir gelirin ilerlemesidir, satın almada belirsizlik
   tedarikçide değil **siparişte**dir.
2. ⚠️ **YAPISAL KATKICI EKLENMEDİ — ve bu, ADR-0036'nın EŞİĞİNE DOKUNMAMA
   KARARIDIR.** ADR-0039 §7.2 bu modüle açıkça soru bırakmıştı. Üç aday
   değerlendirildi, üçü de reddedildi: _"performans/gecikme"_ (sipariş ve
   teslimat v1'de yok → hesaplayacak bir şey yok, bir **sayım** olurdu),
   _"durgun tedarikçi"_ (türetilebilir ama **haber değil**; yılda bir çalışılan
   tedarikçi 364 gün durgun görünür ve bir **taban yuvası işgal ederdi**),
   _"ödeme vadesi yaklaşan"_ (serbest metinden vade **çıkarılamaz**).
   **Yapısal kaynak 5'te kaldı, eşik (6) aşılmadı, ADR-0036 açılmadı.**
3. ⚠️ **CROSS-MODÜL KENARI YOK — ama bu sefer bir ADAY reddedildi.** Stok'ta
   kenar yoktu çünkü **hedef şema mevcut değildi**; burada `inventory` **canlı**
   ve ROADMAP §3.6 kenarı açıkça sayıyor (_"Tedarikçi → Stok"_). Yine de
   eklenmedi: bağlantının bir **fiili** yok (katalog, olgu değil), şekil
   bugüne kadarki desenin şekli değil (**N:N ara tablosu**) ve gerçek talep
   8. modülden gelecek. Grafik **altı kenarda**, hâlâ DAG.
4. ⚠️ **İZİN ADI ÇAKIŞMASI İLK KEZ GERÇEK.** ADR-0039 çakışmayı **öngörerek**
   nitelemişti (`item` → `stock_item`); burada öngörüye gerek yok: `contact` ve
   `interaction` **CRM tarafından zaten alınmış**. Paylaşmak **sessiz bir yetki
   genişlemesi** (müşteri kişisini gören tedarikçi kişisini de görürdü), CRM'i
   yeniden adlandırmak **breaking change** olurdu. → `supplier_contact`,
   `supplier_interaction`.

> **Renk:** Tedarikçi'nin imza rengi **#5c6cab** (koyu `#92a5e8`) ve bir tercih
> değil, `module-colors.css`'in kendi seçim kuralının sonucu: _"AKRABA MODÜLLER
> KOMŞU HUE ALIR. Tedarikçi, CRM'in yanında."_ Yani renk, ROADMAP'in
> konumlandırmasını **görsel olarak** söylüyor. ⚠️ Bedeli: CRM'in çivit
> mavisiyle (#3173af) renk körlüğü altında yakınlaşabilir — bu yüzden iki kapı
> **farklı ikon, farklı etiket** taşır ve aktif kapı `aria-current` taşır.
> ⚠️ Anahtar **`suppliers`**.

> ⚠️ **GÖRÜŞME GÜNLÜĞÜ EKLEME-YALNIZDIR — ama ADR-0039'un DEĞİŞTİRİLEMEZ
> DEFTERİ DEĞİLDİR.** İki durum karıştırılmamalı: `inventory.movements`
> değiştirilemez çünkü **bugünkü miktar ondan türetilir** ve geçmişi
> değiştirmek bugünü sessizce yeniden yazardı (koruma **üç katmanlı**: izin yok
> + FK `RESTRICT` + entity metodu yok). Burada türetilen **hiçbir sayı yok**;
> günlük yalnızca **güncellenmiyor**, çünkü bir görüşme olduktan sonra
> "değişmiş" olmaz. `update` metodunun ve `supplier_interaction:write` izninin
> olmaması **yeter**.

> ⚠️ **BAYATLAMA PENCERESİ GERİ DÖNDÜ — ADR-0039'dan bilinçli sapma.** Stok'ta
> ad kalemin **aynı satırındaydı** ve `PATCH` vektörü aynı işlemde yeniliyordu
> ("bayatlama penceresi yok"). Burada ad `suppliers.suppliers`ta, vektör
> `suppliers.interactions`ta — yani bir yeniden adlandırma o tedarikçinin
> **tüm** görüşme vektörlerini bayatlatır ve `PATCH` onları **yenilemez**
> (200 görüşme = 200 embedding çağrısı; oran sınırı isteği **ortasından**
> keserdi — yarısı yeni, yarısı eski başlıklı bir vektör kümesi: en kötü hâl).
> Bunun yerine cevap **`staleAfterRename`** bayrağı taşır ve arayüz onarımı
> **açıkça önerir**. Sessizce bayat bırakmak, "arama neden bulmuyor" sorusunu
> cevapsız bırakırdı.

> ⚠️ **KATKICI TARAFINDA RANDEVU'NUN SINIRI YOK:** `AppointmentNotesContributor`
> başlığa kişi adını **koyamıyordu** (ad başka şemadaydı, okuma izin kapılı bir
> dizin isterdi, `ContributeInput` rol taşımaz). Burada ad **aynı şemada** —
> `JOIN` meşru, izin kapısı gerekmez ve ad **okuma anında** çözülür. Somut
> kazancı: **vektör bayat olsa bile modele giden metin taze adı taşır.**

| Slice | Ne | Durum |
|---|---|---|
| 0 | **ADR-0040** — karar, kapsam, sınırlar | ✅ |
| 1 | **Backend (TEK slice):** `suppliers` şeması + üç tablo + CRUD + ekleme-yalnız günlük + embedding + `reindex` + oran sınırı + izin kataloğu + exception filter + **TEK katkıcı** (`0030`) | ✅ |
| 2 | **Frontend + HAFİF kapanış denetimi:** iki rota + detay (ODA, ortak duvar), `suppliers` rengi, koridorda sekizinci kapı | ✅ |

**Cross-modül slice'ı YOK ve bu bir atlama değil** — değiştirilecek bir
`public.ts` yoktu.

> ### ✅ HAFİF kapanış denetimi — **yapıldı, 2026-08-22**
>
> Sekiz maddenin sekizi de koşuldu. `pnpm verify` **çıkış kodu 0** ·
> uçların rol turu (viewer okur **yazamaz 403**, member yazar **silemez 403**) ·
> aynı vergi no küçük harfle **409** · takvimde olmayan gün **422** ·
> 1251 karakter **422** (sessiz kırpma yok) · renk turu açık **ve** koyu temada.
>
> ⚠️ **Denetim BİR BELGE HATASI buldu:** ADR'nin retention sayısı
> "onyediden **yirmiye**" diyordu; doğrusu **onsekiz**. Üç tablo açıldı ama
> ROADMAP §8.5'in kendi ölçütü (_"borcu doğuran şey satırın ZAMANLA
> ÇOĞALMASIDIR"_) yalnızca `suppliers.interactions`ı listeye sokar —
> `crm.companies`/`crm.contacts` listede olmadığı gibi. **Kod kusuru değil,
> borcu olduğundan büyük gösteren bir belge hatası**; retention kararında o
> liste tek dayanaktır. Düzeltildi.
>
> ⚠️ **ROTA GÖLGELEMESİ SINAVI** — bu modülün en sessiz riski: `/suppliers/
> contacts` bir UUID sanılsaydı **422** dönerdi ve hiçbir test kırmızı yanmazdı
> (CRM'in üç controller'ı yerine **tek controller + sabit yollar `:id`'den
> önce** seçilmesinin sebebi budur). Gerçek isteklerle doğrulandı: `contacts`
> **200**, `interactions` **200**, `reindex` **200**, `<UUID>` **200**,
> `not-a-uuid` **422**.
>
> ⚠️ **§5.1 SINAVI:** aynı token `/crm/contacts` **ve** `/suppliers/contacts`
> uçlarını gezdi, ikisi de **200** ve ikisi **farklı izinlerden** geçti.
> `git diff -- crm.permissions.ts` **boş** — CRM kataloğuna tek satır
> dokunulmadı.
>
> ⚠️ **ADR-0036 GÖZLEMİ (taban ölçümü bu modülde ZORUNLU DEĞİLDİ — yapısal
> katkıcı yok):** on üç katkıcı doluyken üç farklı soruda dağılım **aynı**
> kaldı; tam **üç ayrı yapısal ses** (`crm-pipeline` · `finance-cashflow` ·
> `inventory-stock`) = `ceil(8/3)` ve **`supplier-interactions` üçünde de
> içeride**. ⚠️ **Üç anlamsal kaynak sıfır aldı** (`project-notes`,
> `finance-commentaries`, `documents`) — ADR-0039 §7.2'nin **yazılı
> beklentisi**: anlamsal kaynaklar arasında taban yoktur, eleme **liyakattir**.
>
> ⚠️ **Fan-out N=13 ÖLÇÜLDÜ**: ortalama toplam **5434 ms**, fan-out payı
> **81 ms (%1–2)**, darboğaz değişmedi (`LLMPort.complete` ~5099 ms) —
> ADR-0039'un N=12 (136 ms) ve ADR-0037'nin N=10 (≤315 ms) ölçümleriyle **aynı
> bantta**. Darboğaz **altı ölçümdür** aynı yerde.
>
> **Bilinçli yapılmayanlar:** sıfırdan kurulum ❌ · iki tenant'la tam RLS turu
> ❌ · **prod doğrulaması ❌ — bu slice migration TAŞIMAZ** (Slice 1'in `0030`
> migration'ı 2026-08-21'de push edildi ve prod'da doğrulandı: health 200,
> migration 30 → 31, üç tablo `RLS + FORCE`, üç dar rol **kör**,
> `GET /api/v1/suppliers` 404 → **401**).

> ### Tedarikçi kapanırken bilinen sınırlar (ADR-0040)
>
> - ⚠️ **YAPISAL KATKICI YOK** — bu modül `POST /ask` havuzunda yalnızca
>   anlamsal yarışır ve ADR-0036'nın taban garantisinden **yararlanmaz**. Bir
>   kusur değil, kararın sonucu. ⚠️ İstenirse sıra **değiştirilemez**: (1)
>   sipariş/teslimat ayrı ADR, (2) **ADR-0036 yeniden açılır**, (3) ancak ondan
>   sonra katkıcı.
> - ⚠️ **Sekiz anlamsal kaynak beş serbest yuva için yarışıyor** — üç kaynağın
>   sıfır alması **beklenen** sonuçtur ve denetimde **ölçüldü**.
> - ⚠️ **Ödeme koşulları sorgulanamaz** — serbest metin; yalnızca anlamsal
>   aramaya girer. Arayüz de **ayrıştırmaz** (denetimde doğrulandı).
> - ⚠️ **Tedarikçi ↔ kalem bağlantısı YOK** — _"bu vidayı kimden alıyoruz"_
>   sorusu v1'de **yapısal olarak** sorulamaz; yalnızca bir görüşme notunda
>   yazıyorsa anlamsal aramayla bulunur.
> - ⚠️ **Sipariş, teslimat, gecikme ve puan YOK** — _"hangi tedarikçi
>   gecikiyor"_ sorusu **sorulamaz**. En çok istenecek eksik budur.
> - ⚠️ **Yeniden adlandırma vektörleri bayatlatır** — telafi `staleAfterRename`
>   bayrağı + `POST /suppliers/reindex { supplierId }`, ilk günden.
> - ⚠️ **Uzun görüşme metni 422 döner** — sessiz kırpma yok; doğru yer Belge
>   modülüdür.
> - ⚠️ **Ödeme koşullarını kimin değiştirdiği sorulamaz** — `platform/audit`
>   borcu (8. modül); ⚠️ ADR-0039'un aksine **kendiliğinden kapanmaz**.
> - ⚠️ **`supplier:read` taşıyan herkes TÜM tedarikçileri ve ödeme koşullarını
>   görür** — alan bazlı gizlilik ABAC'tir, backlog'ta.
> - **İyimser eşzamanlılık yok** · **`embedding`de model/sürüm bilgisi yok** ·
>   **arama yalnızca anlamsal** (ADR-0011, sekizinci kez).
> - ⚠️ **Retention ONYEDİDEN ONSEKİZE çıktı** — yalnızca
>   `suppliers.interactions`; vektör taşıyan tablo sayısı **yediden SEKİZE**.

### Faz 5 / 8. modül — Teklif / Fatura Oluşturma (**bitti**)

Karar: **ADR-0041** (kabul edildi 2026-08-22, kapandı 2026-08-23). ROADMAP
§3.5'in sekizinci sırası: _"Finans uzantısı — 3'e bağımlı"_. **Dokuzuncu şema.**
Üç slice: ADR → Backend (`0031`, tek slice) → Frontend + HAFİF kapanış denetimi.

Gerçekten yeni **yedi** karar — ama üçü diğerlerinden ağır:

1. ⚠️ **YASAL E-FATURA YOK ve bu bir aşama değil bir SINIRDIR.** Resmi e-fatura
   ülkeye özel **mevzuattır** (mükellef sorgusu, mali mühür, zarf formatı,
   saklama yükümlülüğü) ve ülke değişince baştan yazılır — global bir ürünün
   çekirdeğine konulamaz. ⚠️ Üretilen "fatura" **bir PDF belgesidir**; uyarı
   hem ekranda hem **kâğıtta** yazılı, çünkü kâğıt şirketten çıkar.
2. ⚠️ **TEK TABLO + `kind`** (ADR-0034 §5'in geliri/gideri ayıran deseni, ikinci
   kez). İki tablo reddedildi ve gerekçe **riskin şekli**: `direction` unutmak
   *sessiz ve makul görünen yanlış bir sayı* üretir, `kind` unutmak yanlış
   listede satır — ekranda **derhal** görünür. ADR-0034 tek tabloyu **daha
   tehlikeli** bir durumda seçmişti.
3. ⚠️ **GÖNDERİLDİKTEN SONRA DEĞİŞTİRİLEMEZ — ÜÇ KATMAN:** domain + uç (409) +
   **VERİTABANI TRIGGER'I**. Üçüncüsü şart çünkü **kalemler ayrı tablodadır** ve
   başlık üzerindeki kontrol onları kapsamaz; bir entegrasyon testi bunu **ham
   SQL ile**, uygulama katmanı hiç devrede değilken kanıtlıyor.
   ⚠️ Bu, ADR-0039'un *değiştirilemez defteri* DEĞİLDİR: orada koruma her zaman
   geçerliydi (bugünkü miktar ondan türetiliyordu), burada **yalnızca `draft`
   sonrası**.
4. **"Faturaya dönüştür" YENİ KAYIT üretir**, teklife tek kolon yazılmaz (ok
   fatura → teklif). Kalemler **kopyalanır** — kopyalanan şey bir *adres* değil
   **bir belgenin içeriğidir**. İkinci kez dönüştürme engellenmez (kısmi
   teslimat meşru); bedeli: _"bu teklifin ne kadarı faturalandı"_ sorulamaz.
5. ⚠️ **BELGE NUMARASI: sayaç tablosu + `SELECT … FOR UPDATE`**, `max()+1`
   REDDEDİLDİ — o, silinen bir taslaktan sonra numarayı **yeniden kullanır** ve
   hata **müşterinin elinde** ortaya çıkar. Numara taslakta **YOK**; belge dışarı
   çıktığı an üretilir. Boşluk oluşabilir ve **bu doğrudur**: boşluk görünür,
   tekrar görünmez.
6. ⚠️ **`customer_name` KOLONDA SAKLANIR** — projede beş kez verilmiş
   "ad denormalize edilmez" kararından **bilinçli sapma** ve kuralın istisnası
   değil **sınırı**: denormalizasyon yasağı *türetilebilir* bilgi içindir,
   gönderilmiş bir belgedeki ad ise **o an dondurulmuştur**. Sonucu: aynı ekranda
   iki ad görünebilir (belgeye basılan + bugünkü müşteri) ve bu ayrımın ta
   kendisidir.
7. ⚠️ **`tax_rate` bir SAYIDIR, bir KURAL DEĞİL** — sistem muafiyet, tevkifat,
   ülke bazlı oran **bilmez**; yalnızca çarpar. ADR-0034'ün vergi sınırı korunur.

> ### ⚠️ ADR-0036'NIN EŞİĞİ BU MODÜLLE AŞILDI — ve ölçüldü
>
> Yapısal kaynak **5 → 6**, fan-out **13 → 14**. ADR-0039 §7.2 eşiği ADR-0040'a
> adreslemişti, ADR-0040 §3 **bilinçli olarak dokunmadı**; burada aşıldı.
> **Product Owner onayı alındı** ve şekli önemli: katkıcı eklendi, **ADR-0036 bu
> işte DEĞİŞTİRİLMEDİ**, revizyon kapanış denetimindeki **canlı ölçümden sonra**
> ayrı bir ADR'ye (**0042 adayı**) bırakıldı — _"bir platform kararı, onu
> değiştirmesi gereken veriye sahip olmadan revize edilmez."_
>
> **Ölçüm yapıldı ve ADR-0042'nin tek veri girdisidir** (14 katkıcı, 3 soru,
> iki koşul): ✅ taban **tutuyor** — her koşulda tam `ceil(8/3) = 3` yapısal ses;
> ⚠️ ama **altı yapısal kaynağın üçü her cevapta sessiz** (yarısı) ve bu,
> ADR-0036'nın kendi eşik cümlesinin tarif ettiği noktadır. ⚠️ Eleme
> **liyakatledir, rastgele değil**: `invoicing-pipeline` alarm bandında (0.95)
> girdi ve `finance-cashflow` (0.75) düştü; sakin bandda tam tersi.

> ⚠️ **VEKTÖR TAŞIMAYAN İLK İŞ MODÜLÜ** (ADR-0041 §5): embedding yok, chunk yok,
> `reindex` yok, **oran sınırı yok**. Bir teklif kalemi ("M8 civata · 500 adet ·
> 12,50") ADR-0034 §6.1'in tarif ettiği şeydir — yüzlerce neredeyse özdeş kısa
> vektör K=8'lik havuzu kirletir. Katkı **anlamsal değil YAPISALDIR** ve bu,
> ADR-0040'ın **tam aynasıdır** (orada tek katkıcı anlamsaldı).
> ⚠️ Yine de **üç AI hata tipi filtreye baştan yazıldı** — CLAUDE.md'nin kalıcı
> kuralının **ilk kez üçünün de tetiklenemez olduğu** modülde sınanması.

> ⚠️ **`PdfPort` — ADR-0009'dan beri `shared/`'a eklenen İLK yeni port.**
> Adapter `pdfkit` + **gömülü DejaVu TTF**: `pdfkit`in standart fontları WinAnsi
> ve Latin-1'de `ğ ş ı İ` **yoktur** — font gömülmezse PDF üretilir, indirilir,
> açılır ve yalnızca **müşterinin adı yanlış yazılır**. Hata SESSİZDİR; bir test
> gömülü fontu ve Helvetica'ya düşülmediğini kilitliyor.
> ⚠️ Font bir **npm paketinden** gelir, repoya konmuş bir binary'den değil:
> `nest build` TypeScript dışı varlıkları `dist/`e kopyalamaz.
> ⚠️ **PDF SAKLANMAZ**, her istekte üretilir (§6.3) — `storage.port.ts` bu modülü
> adıyla öngörüyordu ama **öngörü bir karar değildir**. Güvenli kılan şey §2:
> gönderilmiş belgenin verisi değişmez. Tek bedel **şablon kayması** ve
> tetikleyicisi yazılı: ilk şablon değişikliğinde saklamaya geçilir, yol **tek
> yönlüdür**.

> ⚠️ **`platform/audit` AÇILMADI — küçültülerek ertelendi** (ADR-0041 §8, PO
> onayı). Sorunun büyük kısmı §2 ile **ortadan kalkıyor**: gönderilmiş belgenin
> tutarı değişmez, yani "kim değiştirdi" diye bir soru **yoktur**. Kalan durum
> geçişleri **satır içi aktör damgasıyla** cevaplanıyor (`sent_by`/`decided_by`)
> — ⚠️ bu bir **denetim izi değildir** ve öyle adlandırılmaz: olay günlüğü "ne
> oldu"yu sırasıyla anlatır, damga yalnızca **son durumu** söyler.
> ⚠️ Açıkta kalan: **taslak düzenlemeleri izlenmez**, ADR-0034/0039/0040'ın
> borçları **açık kalır**. Tetikleyici **9. modüle (İK — KVKK)** ve
> ödeme/tahsilat gününe taşındı; ⚠️ **üçüncü erteleme artık bir karar olur**.

> **Renk:** Teklif/Fatura'nın imza rengi **#257c6c** (koyu `#64b6a4`) ve bir
> tercih değil, `module-colors.css`'in kendi seçim kuralının sonucu: _"AKRABA
> MODÜLLER KOMŞU HUE ALIR. Teklif/Fatura, Finans'ın yanında."_ ⚠️ Bedeli
> koridorda **ikinci komşu-hue çifti**: Finans (#307d54) ile bu modül,
> CRM/Tedarikçi çiftinden **daha yakın**. Bu yüzden kapılar farklı ikon, farklı
> etiket ve `aria-current` taşır. ⚠️ Anahtar **`invoicing`**.

> ⚠️ **CROSS-MODÜL: TEK yeni kenar (`Teklif/Fatura → CRM`)** ve `crm.public.ts`
> **tek satır değişmedi** — iki dizin de hazırdı (ADR-0037 §4.1'in kuralı ikinci
> kez **talip** tarafından doğrulandı). ⚠️ **Finans'a kenar YOK**: ROADMAP'in
> _"8 → 3"_ bağımlılığı bir **SIRA** bağımlılığıdır, bir grafik kenarı değil —
> devralınan şey kod değil **alınmış para kararlarıdır**; kesilen fatura
> `finance.transactions`a satır **yazmaz** (o tablo gerçekleşmiş nakit
> hareketidir). ⚠️ `inventory.public.ts` **adayı değerlendirildi ve REDDEDİLDİ**
> (§7.3): bağlantının doğal beklentisi **stok düşülmesidir** ve o, bu modülün
> envanterin doğruluğundan sorumlu olması demektir. Grafik **altıdan yediye**,
> hâlâ **DAG** (hedef bir kök düğüm).

> ⚠️ **İZİN ADI: `quote` / `invoice` — NİTELİKSİZ ve doğru.** ADR-0039 §8.2
> `item` → `stock_item` nitelemesini **tam olarak bu modülün getireceği _line
> item_** için yapmıştı; kavram geldi ama **çakışma gelmedi**: satır kalemi bir
> **izin kaynağı değildir** (bağımsız yaşamı, ucu ve yetkisi yok). ⚠️ Gerçek
> çakışma **başka kelimedeydi**: `document:*` Belge modülünündür — ve bu, tablo
> adını da belirledi (`sales_documents`). Çakışma **üçüncü kez** gerçek oldu ve
> üçünde de aynı şey yapıldı: **çalışan modülün kataloğu değiştirilmedi**.

| Slice | Ne | Durum |
|---|---|---|
| 0 | **ADR-0041** — karar, kapsam, sınırlar; iki PO onayı | ✅ |
| 1 | **Backend (TEK slice):** `invoicing` şeması + üç tablo + trigger + CRUD + durum geçişleri + numara sayacı + dönüştürme + `PdfPort` + izin kataloğu + exception filter + **TEK yapısal katkıcı** (`0031`) | ✅ |
| 2 | **Frontend + HAFİF kapanış denetimi:** iki liste + iki detay (ODA, ortak duvar), `invoicing` rengi, koridorda dokuzuncu kapı | ✅ |

> ### Teklif/Fatura kapanırken bilinen sınırlar (ADR-0041)
>
> - ⚠️ **YASAL E-FATURA YOK** — üretilen "fatura" bir PDF belgesidir, mali belge
>   değildir. En çok yanlış anlaşılacak sınır budur ve **arayüzde de yazılıdır**.
> - ⚠️ **WORD/DOCX ÇIKTISI YOK** — iki şablonu senkron tutmak **ikinci bir
>   doğruluk kaynağı** demekti; tek gerçek gerekçesi (*müşteri değiştirsin*) §2
>   ile çelişir.
> - ⚠️ **Ödeme, tahsilat, kısmi ödeme ve vade takibi YOK** — _"bu fatura ödendi
>   mi"_ sorulamaz. **En çok istenecek eksik budur.** Yönü belirsiz (Finans mı
>   okur, bu modül mü yazar) ve ikisi aynı anda yazılırsa **döngü** olur.
> - ⚠️ **"Bu teklifin ne kadarı faturalandı" sorulamaz** — ikinci kez dönüştürme
>   serbesttir ama mutabakat yoktur.
> - ⚠️ **ADR-0036'nın eşiği AŞILDI ve ölçüldü**: altı yapısal kaynak, üç taban
>   yuvası — **her cevapta yarısı sessiz**. Bir kusur değil **kapasite sınırı**;
>   revizyon ADR-0042'ye bırakıldı.
> - ⚠️ **Şablon TEKTİR ve özelleştirilemez**; geçmiş belgeler **bugünkü şablonla**
>   yeniden üretilir (içerik aynıdır, **görünüm** değişebilir).
> - ⚠️ **Müşteri adı kolonda saklanır** — CRM'de yapılan bir yeniden adlandırma
>   geçmiş belgelere **yansımaz** ve bu **kasıtlıdır**.
> - ⚠️ **Belge numarasında BOŞLUK oluşabilir** — iptal edilen bir kesim numarasını
>   geri vermez.
> - ⚠️ **Taslak düzenlemeleri ve taslak silmeleri iz bırakmaz**; ADR-0034/0039/
>   0040'ın `platform/audit` borçları **açık kalır**.
> - ⚠️ **Satır kalemleri stok kalemlerine bağlı DEĞİLDİR** — fatura kesmek stoğu
>   **düşmez**.
> - ⚠️ **Tek belgede tek para birimi**; farklı para birimleri **toplanmaz** —
>   kahraman rakam bu yüzden bir **sayıdır**.
> - ⚠️ **İskonto ALANI yok** — negatif birim fiyatlı bir satır olarak yazılır.
> - ⚠️ **E-posta ile gönderim yok** — `sent` kullanıcının **beyanıdır**.
> - ⚠️ **Belge bazlı gizlilik yok**: `quote:read` taşıyan herkes tüm teklifleri ve
>   **fiyatları** görür — ABAC, backlog'ta.
> - ⚠️ **Arama YOK — ne anlamsal ne klasik**: belgeler yalnızca yapısal
>   filtrelenir. ADR-0011'in FTS kalemi **dokuzuncu** kez açık ve bu modül onun
>   **en doğal adayıdır**.
> - **İyimser eşzamanlılık yok** — ⚠️ ama gönderilmiş belgede **geçersizdir**
>   (yazma yolu kapalı).
> - ⚠️ **Retention ONSEKİZDEN YİRMİYE çıktı** (`sales_documents` +
>   `sales_document_lines`); ⚠️ **vektör taşıyan tablo sayısı SEKİZDE KALDI** —
>   Faz 5'te bu sayıyı artırmayan **ilk** modül. `number_sequences` listeye
>   **girmedi** (tenant + tür başına iki satır, zamanla çoğalmaz).

### Faz 5 / 9. modül — İK / Personel (**bitti**)

Kararlar: **ADR-0043** (kabul edildi 2026-08-23) + **ADR-0044** (İK v2, aynı
işte 2026-08-24). ROADMAP §3.5'in dokuzuncu sırası. **Onuncu şema.** Beş iş:
ADR → `platform/audit` (Slice 1) → yetki denetimi → dördüncü katman →
HR şeması (Slice 2) → Frontend + HAFİF kapanış denetimi (Slice 3) → **v2**.

Gerçekten yeni **altı** karar:

1. ⚠️ **SAĞLIK VERİSİ KESİN SINIRDIR — bir aşama değil.** KVKK m.6 özel
   nitelikli veri; dar istisna yalnızca **sağlık kuruluşlarına ve sır saklama
   yükümlülüğü altındaki hekimlere** tanınmıştır ve genel bir İK modülü bu
   tanıma **girmez**. Gereken şey her çalışandan **açık rıza** + Kurul'un
   **2018/10** sayılı kararının zorunlu ek tedbirleridir (şifreleme, ayrı
   erişim günlüğü, 2FA, ayrı politika). ⚠️ **Bu, "AI'dan izole etmekle"
   çözülmez** — kendi başına ayrı bir iştir, v2'ye ve **ayrı bir ADR'ye**
   ertelendi. ⚠️ Sınırın taşıyıcıları koda yazıldı, niyete bırakılmadı:
   `hr.employees`te **serbest not alanı YOK** ve izin türlerinde
   **`sick`/raporlu YOK** — üçer katmanda (şema CHECK'i · Zod `.strict()` ·
   arayüz listesi). Sınır koyup yanına boş bir metin kutusu bırakmak, sınırı
   **kullanıcıya ihlal ettirmek** olurdu.
2. ⚠️ **MAAŞ GİRDİ — AMA AI'DAN ÜÇ KATMANLA İZOLE** (PO kararı). Maaş özel
   nitelikli veri **değildir**; olmayınca modül işe yaramıyordu. İzolasyon:
   **ayrı tablo** (`hr.compensation_records`) · **ayrı izin**
   (`compensation:read`, yalnızca owner/admin) · **HİÇBİR
   `RetrievalContributor`a bağlı DEĞİL**. ⚠️ Maaşa göre **sıralama/filtreleme
   de KAPALI** (422): bir değer dönmese bile **sıralamanın kendisi** sızdırır —
   iki istekle bütün ekibin ücret sıralaması çıkarılırdı. ⚠️ Maaş yüzeyi
   **Faz 6'nın KVKK denetiminden geçmeden gerçek müşteri verisiyle
   kullanılmamalıdır** ve bu ADR'de yazılıdır.
3. ⚠️ **SIFIR KATKICI — `POST /ask` HAVUZUNA HİÇ DOKUNMAYAN İLK İŞ MODÜLÜ.**
   Fan-out **14'te kaldı**, yapısal kaynak **6'da**. Bu bir eksik değil bir
   **güvenlik özelliğidir**: bir maaş rakamının modele gitmesi için önce
   şemanın, sonra API'nin, sonra iznin değişmesi gerekir. ⚠️ ADR-0044'te
   **gerçek bir yapısal aday** çıktı (_"bugün izinde olanlar"_) ve yine
   **eklenmedi** — ADR-0042'nin T2 eşiği tetiklenirdi ve **ölçüm aracı bugün
   çalışmıyor** (aşağıda).
4. ⚠️ **`platform/audit` AÇILDI — üç kez ertelenen borç kapandı.** Minimal ve
   **DEĞİŞTİRİLEMEZ** bir `platform.audit_log`: tenant_id · actor_user_id ·
   occurred_at · resource_type · resource_id · **field_name**. ⚠️ **DEĞER
   SAKLANMAZ** (before/after yok) — değer saklamak, izlemek istediğimiz veriyi
   **ikinci bir yerde çoğaltmak** olurdu ve maaş için bu, izolasyonun kendisini
   delerdi. Yazma **aynı transaction'da**, kuyruk yok. Değiştirilemezlik **iki
   katman**: rol yetkisi (`GRANT SELECT, INSERT` + açık `REVOKE`) + **tablo
   sahibini de bağlayan trigger**.
5. ⚠️ **ÇALIŞAN ≠ ÜYELİK — ve bu bir tercih değil, bir ZORUNLULUK.** Kanıt
   kodda: `identity.public.ts` yalnızca `emailVerified` açar ve
   `GET /memberships` **ad döndürmez** — yani platform bir çalışanın **adını
   veremez**. Bağ `platform_user_id` ile **NULLABLE** kurulur ve `null`
   **yaygındır**: depo görevlisinin, saha ekibinin hesabı yoktur. Zorunlu
   olsaydı veri modeli şirketi **lisans satın almaya zorlardı**.
6. ⚠️ **ÜCRET DÜZELTME: YERİNDE DÜZENLEME DEĞİL, DÜZELTME KAYDI** (ADR-0044
   §1). v1 aynı yürürlük tarihine ikinci kaydı **409** ile reddediyordu ve
   bedeli ağırdı: yanlış girilen bir maaşı düzeltmenin **hiçbir yolu yoktu**,
   kullanıcı **uydurma bir tarih** yazmaya itiliyordu. Kısıt düşürüldü, garanti
   **düşmedi**: kazanan artık "kararlı sıralama" değil **anlamlı** sıralamadır
   (`recorded_at DESC`) ve düzeltilen satır **`supersededAt`** ile işaretli
   kalır. ⚠️ Alan **TÜRETİLİR, kolon YOK** — onikinci kez aynı karar.

> ⚠️ **`platform.audit_log` YAZILIRKEN GERÇEK BİR AÇIK BULUNDU** (Slice 1).
> `GRANT SELECT, INSERT` yazılmıştı ama `businessos_app` yine de
> `can_update: true` taşıyordu: `0000_init`in
> `ALTER DEFAULT PRIVILEGES ... IN SCHEMA platform GRANT SELECT, INSERT,
> UPDATE, DELETE` satırı **her yeni tabloya** sessizce uyguluyordu. ⚠️ MT
> §12.4'ün yazılı kuralı **uygulanmış GÖRÜNÜYOR ama uygulanmıyordu** — ve
> hatayı bulan şey bir okuma değil, **iddiayı sorgulayan bir testti**.
> Product Owner bunun üzerine `platform` şemasının **tamamının** denetlenmesini
> istedi: matris çıkarıldı, **başka açık BULUNMADI** ("kontrol edildi, temiz")
> ve sonuç bir yoruma değil **dokuz testlik bir dosyaya** yazıldı
> (`platform-grants.integration.spec.ts`) — bir denetim, tekrarlanabilir
> değilse yalnızca o günün fotoğrafıdır.

> ⚠️ **DÖRDÜNCÜ KATMAN** (PO talimatı): `inventory.movements` ve
> `suppliers.interactions`a açık `REVOKE UPDATE, DELETE` eklendi — ADR-0039'un
> üç katmanına **dokunulmadan**. ⚠️ Bu iş **prod'u bozabilecek bir tuzağı
> yakaladı**: düz bir `REVOKE UPDATE`, `suppliers.interactions.embedding`
> yazan yolu (`setInteractionEmbedding` + `POST /suppliers/reindex`)
> **kırardı**. Çözüm kolon bazlı oldu: `GRANT UPDATE (embedding)` — yani
> **tek meşru mutasyon türetilmiş vektördür**, içerik kolonları dışarıdadır.

> ⚠️ **İZİN TAKİBİ GİRDİ — AMA "SEBEP" ALANI YOK** (ADR-0044 §2). Bir izin
> kaydının en doğal alanı "sebep"tir ve oraya **ilk yazılacak şey
> "RAPORLU"DUR** — yani §3'ün dışarıda tuttuğu sağlık verisi. Alan **hiç
> açılmadı** ve tür listesinde **hastalık yok**; sunucu `.strict()` ile
> `reason` gönderen isteği **422** reddeder. ⚠️ **Dürüst bedel:** bir işletme
> raporlu günleri bu modülde **takip edemez**; doğru cevap "mazeret" diye
> yazmak **değildir** — o da veriyi orada tutar.

> ⚠️ **HAK EDİŞ BİR MEVZUAT KURALI DEĞİL, BİR SAYIDIR.** Sistem kıdemden izin
> hakkı **hesaplamaz** (İş Kanunu'nun 5/10/15/20 yıl kademeleri **ülkeye
> özeldir** — ADR-0041'in e-fatura gerekçesiyle aynı sınıf). İK sayıyı
> **girer**. ⚠️ Gün sayısı **TAKVİM GÜNÜDÜR**, iş günü değil: resmi tatiller de
> ülkeye özeldir. ⚠️ **Bakiye TÜRETİLİR** (onbirinci kez aynı karar) ve
> **NEGATİF olabilir** — hak edişinden fazla izin kullanmış bir çalışan gerçek
> bir durumdur; sıfırda kırpmak İK'nın **görmesi gereken şeyi saklamak**
> olurdu.

> **Renk:** İK'nın imza rengi **#896096** (koyu `#c39ccd`) ve
> `module-colors.css`'te ölçülü. ⚠️ Anahtar **`hr`**.

| Slice | Ne | Durum |
|---|---|---|
| 0 | **ADR-0043** — karar, sınırlar, üç PO onay kalemi | ✅ |
| 1 | **`platform/audit`** — `platform.audit_log` (`0032`) + `AuditPort` + trigger | ✅ |
| 1b | **Yetki denetimi** — `platform` şemasının tamamı; testle kilitlendi | ✅ |
| 1c | **Dördüncü katman** — `inventory.movements` + `suppliers.interactions` REVOKE (`0033`, `0034`) | ✅ |
| 2 | **HR şeması** — `hr.employees` + ekleme-yalnız `hr.compensation_records` + audit bağlantısı (`0035`) | ✅ |
| 3 | **Frontend + HAFİF kapanış denetimi** — ODA, onuncu kapı | ✅ |
| 4 | **v2 (ADR-0044)** — ücret düzeltme + izin takibi + beş yeni alan (`0036`) | ✅ |
| 5 | **v2 frontend** — izin bölümü + **ikinci rota** (`/app/hr/leave`, onay kuyruğu) + sekme şeridi | ✅ |

> ### ⚠️ HAFİF kapanış denetimi — **yapıldı, 2026-08-24**
>
> ⚠️ **EN KRİTİK SINAV GEÇİLDİ:** `compensation:read` taşımayan bir kullanıcı
> için ücret bölümü **DOM'da hiç YOK** ve `/compensation` ucuna **hiç istek
> atılmıyor** — gerçek tarayıcıda sayfa kaynağı ve ağ günlüğü ile doğrulandı.
> ⚠️ İddia **"görünmüyor" değil "hiç yok"tur**: bileşen koşullu **MOUNT**
> edilir, içinde bir "gizle" dalı yoktur. Bir 403 alıp yutmak bunu
> sağlamazdı — istek ağ sekmesinde görünür ve **"burada bir maaş var"**
> bilgisi kendini ele verirdi.
>
> ⚠️ **Maaşın yokluğu ÜÇ BAĞIMSIZ ÖLÇÜMLE** kanıtlandı: entity anahtar kümesi ·
> veritabanı kolon kümesi · API gövde anahtar kümesi. Üçü de tam eşitlikle
> karşılaştırılır — biri sessizce büyürse test **kırmızı yanar**.
>
> ⚠️ **ADR-0042 §4'ün YENİ ölçüm protokolü UYGULANAMADI ve bu bir PLATFORM
> BORCUDUR.** Protokol her yapısal kaynağın **satır sayısını** ve giren/girmeyen
> parçaların **skorunu** istiyor; bugün bunu üretecek bir günlük satırı **yok**
> ve geçici enstrümantasyon `@nestjs/config`in Zod şemasının bilinmeyen env
> anahtarlarını **eleyip atması** yüzünden çalıştırılamadı. ⚠️ Doğru çözüm
> geçici bir yama değil, `retrieval.select` diye **kalıcı bir gözlemlenebilirlik
> satırıdır** (Slice 0.5'in `ai.call` deseni). ⚠️ Bu, İK'nın kusuru **değildir**:
> İK'nın **sıfır katkıcısı** var, yani ölçülecek bir değişikliği de yok.

> ### İK kapanırken bilinen sınırlar (ADR-0043 + ADR-0044)
>
> - ⚠️ **SAĞLIK VERİSİ YOK** — raporlu/hastalık izni, sağlık raporu, engellilik
>   durumu **hiçbiri tutulmaz**. En çok istenecek eksik budur ve **kasıtlıdır**.
> - ⚠️ **BORDRO YOK** — SGK, vergi dilimi, kesinti, net/brüt hesabı yoktur.
>   `compensation_records` bir **sözleşme ücretidir**, bir bordro değil.
> - ⚠️ **`platform/audit`in TEK TÜKETİCİSİ İK'DIR** — Finans/Stok/Tedarikçi'nin
>   _"bu tutarı kim değiştirdi"_ soruları hâlâ **cevapsızdır**.
> - ⚠️ **Denetim kaydı DEĞER SAKLAMAZ** — "unvan değişti" der, "X'ten Y'ye"
>   demez. ⚠️ **Taslak/serbest düzenlemeler de izlenmez**: yalnızca
>   `AUDITED_EMPLOYEE_FIELDS`teki alanlar satır yazar.
> - ⚠️ **Aktörün adı HER ZAMAN çözülemez** — platform ad vermez; ad yalnızca
>   `employees.platformUserId` bağı üzerinden çözülür ve liste ilk 100 kaydı
>   kapsar. Çözülemezse ad **gösterilmez, uydurulmaz**.
> - ⚠️ **`POST /ask`e SIFIR katkı** — İK'nın hiçbir verisi kurumsal hafızaya
>   girmez. _"Ekipte kaç kişi var"_ sorusu `/ask`ten **sorulamaz**.
> - ⚠️ **İzin: iş günü hesabı YOK, resmi tatil YOK, yarım gün YOK** — takvim
>   günü sayılır.
> - ⚠️ **Hak ediş elle girilir** — kıdemden hesaplanmaz; devreden izin
>   (yıldan yıla taşıma) da **yoktur**, bakiye tek bir sayıdan türetilir.
> - ⚠️ **İzin çakışması ENGELLENMEZ** — aynı gün iki çalışan da, aynı çalışan
>   için iki izin de yazılabilir (Randevu'nun aynı sınırı).
> - ⚠️ **Vekâlet/onay zinciri yok** — `leave:decide` taşıyan herkes herkesin
>   iznini onaylar; `managerEmployeeId` **bir yetki kaynağı değildir**.
> - ⚠️ **İzin kuyruğunda ad çözümü ilk 100 çalışanla sınırlıdır** (denetim
>   damgasının aynı sınırı); çözülemezse ad **gösterilmez, uydurulmaz**.
> - ⚠️ **İzin kuyruğunda çalışana göre filtre YOK** — uç `employeeId`
>   parametresini destekler ama ekran onu bugün kullanmıyor; kişi bazlı
>   geçmişin yeri çalışanın **detay sayfasıdır**.
> - ⚠️ **Yönetici zinciri DÖNGÜ oluşturabilir** — veritabanı yalnızca
>   kendine referansı engeller (`employees_manager_not_self`).
> - ⚠️ **Belge yok** — sözleşme/özlük dosyası bu modülde tutulmaz ve Belge
>   modülüne de konulmamalıdır (`document:read` taşıyan **herkes** görür).
> - ⚠️ **Organizasyon şeması ekranı yok** · **işe alım/aday takibi yok** ·
>   **performans değerlendirme yok** · **puantaj/mesai yok**.
> - **İyimser eşzamanlılık yok** · **arama yalnızca ad üzerinde `ilike`**
>   (anlamsal arama **yok** — modülün vektörü yok).
> - ⚠️ **Retention YİRMİDEN YİRMİ İKİYE çıktı** (`platform.audit_log` +
>   `hr.leave_requests`); ⚠️ **vektör taşıyan tablo sayısı SEKİZDE KALDI** —
>   Faz 5'te bu sayıyı artırmayan **ikinci** modül. ⚠️ `hr.employees` ve
>   `hr.compensation_records` listeye **girmedi** ve gerekçeleri **farklıdır**
>   (biri çoğalmaz, diğeri **silinemez**) — ROADMAP §8.5.

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
> ### ⚠️ Prod'daki test artığı — kayıt 2026-08-26'da DÜZELTİLDİ
>
> ⚠️ Buradaki eski cümle **iki yönden de yanlıştı** ve düzeltilmesi bir
> denetim sırasında prod'a bakılarak oldu. Eski metin silinmedi ki neyin
> değiştiği görülsün:
>
> > ~~"Prod'da iki denetim artığı kullanıcı kaldı (`delivered@resend.dev`,
> > `ayirt-edici-test@example.com`) — temizlenmesi Product Owner onayına
> > bağlı."~~
>
> ⚠️ **O iki kullanıcı prod'da YOK.** `platform.users`'ta hiçbir izleri
> kalmamış; `platform.identity_outbox`'ta da onlara ait satır yok. E-posta
> gönderiminin ayırt edici kanıtı için 2026-08-09'da yazılmışlardı
> (`delivered@resend.dev` → outbox YAYINLANDI · `@example.com` → **ölü
> mektup**, HTTP 422) ve ne zaman silindikleri **kayıtlı değil**.
>
> ⚠️ **Kayıtta hiç geçmeyen, DAHA ESKİ bir artık ise duruyor** — ve tek
> başına değil, bir tenant ve içerikle birlikte:
>
> | Ne | Değer |
> |---|---|
> | Kullanıcı | `deploy-test-1785962312@example.com` · doğrulanmış · aktif · **2026-08-05 20:38** |
> | Tenant | `deploy-testi-1785962491` · aktif · **2026-08-05 20:41** |
> | Üyelik | 1 (`owner`) |
> | İçerik | 1 knowledge notu (+1 chunk) · 1 conversation (+2 mesaj) · 1 `platform.outbox` |
> | Kimlik izleri | 2 login attempt · 2 token family · 2 refresh token · 5 `identity_outbox` |
>
> ⚠️ **Prod'da BAŞKA kullanıcı yoktur** — yani bu kayıt silinirse prod
> **sıfır kullanıcı ve sıfır tenant** ile kalır. Product Owner'ın kendi
> hesabı prod'da **hiç açılmadı**.
>
> ⚠️ Ayrıca **sahipsiz bir `identity_outbox` satırı** vardı (2026-08-26,
> `user.logged_in`): ADR-0047'nin prod doğrulamasında açılan geçici
> kullanıcıdan kalmıştı. Temizlik `LIKE '%e-posta%'` ile yapılmıştı ve
> `user.logged_in` payload'ı **e-posta taşımaz** (yalnızca `userId` +
> `sessionId`) — yani filtre onu yakalayamamıştı.
>
> ⚠️ **Kalıcı ders:** kimlik temizliğinde e-posta üzerinden filtrelemek
> yetmez; `identity_outbox` gibi tablolarda bağ **`userId` üzerinden**
> kurulur ve payload şekli olaydan olaya değişir.
>
> ### ✅ TEMİZLENDİ — prod artık BOŞ (2026-08-26, PO onayı)
>
> Yukarıdaki her şey tek bir transaction'da silindi (`ON_ERROR_STOP`, silme
> sonrası sayımla teyit): **21 satır**, on üç tablodan.
>
> | | Önce | Sonra |
> |---|:---:|:---:|
> | `platform.users` · `tenants` · `memberships` · `credentials` | 1 · 1 · 1 · 1 | **0 · 0 · 0 · 0** |
> | `token_families` · `refresh_tokens` · `login_attempts` | 2 · 2 · 2 | **0 · 0 · 0** |
> | `email_verification_codes` · `verification_code_requests` | 1 · 3 | **0 · 0** |
> | `identity_outbox` · `platform.outbox` | 5 · 1 | **0 · 0** |
> | `conversations` · `messages` | 1 · 2 | **0 · 0** |
> | `knowledge.notes` · `note_chunks` | 1 · 1 | **0 · 0** |
>
> ⚠️ **PROD ARTIK SIFIR KULLANICI VE SIFIR TENANT ile duruyor** — ve bu
> bilinçli bir karardır, bir kaza değil: Product Owner'ın hesabı prod'da
> **hiç açılmamıştı**, yani "temizlik sonrası bir kullanıcı kalır"
> beklentisi bir **yanlış öncüldü** ve silmeden önce düzeltildi.
>
> ⚠️ Şema ve migration'lar **etkilenmedi**: 39 migration, 13 şema,
> `marketing.campaigns` yerinde, health **200**.
>
> ⚠️ **Faz 6'nın (gerçek müşteri) ilk adımı artık bir kayıt akışıdır** —
> ve bu, kayıt → doğrulama → giriş → tenant açma zincirini prod'da bir kez
> daha sınayacaktır. `EMAIL_FROM` hâlâ Resend'in paylaşımlı test
> göndericisidir (yukarıda); gerçek bir adrese e-posta gitmesi için alan
> adı doğrulaması **önkoşuldur**.

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

> ### ⚠️ Kalıcı ders: HER YENİ MODÜL ADR'Sİ ADR-0036 EŞİK KONTROLÜNÜ İÇERİR
>
> **Yeni bir iş modülünün ADR'si, `RetrievalContributor` ekleyip eklemediğine
> bakmaksızın, ADR-0036'nın eşik kontrolünü SABİT ve ATLANMAYAN bir madde
> olarak taşır.** Bu, modül modül yeniden tartışılmaz — `DisclosableProblem`
> kuralıyla aynı sınıfta bir süreç kuralıdır.
>
> ⚠️ **Bu kural bir varsayımdan değil, ÜÇ KEZ YAŞANMIŞ bir atlamadan doğuyor:**
> ADR-0039, ADR-0040 ve ADR-0041'in prompt'larında eşik kontrolü **istenmedi**;
> üçünde de kontrolü ADR'yi yazan taraf kendi hatırlattı. Dördüncüsünde
> hatırlanmayabilirdi — ve o gün eşik **sessizce** aşılırdı: yeni bir yapısal
> katkıcı eklenir, hiçbir test kırmızı yanmaz, hiçbir lint uyarmaz ve taban
> garantisi bir gün fark edilmeden anlamını yitirir.
>
> **Her modül ADR'sinde cevaplanacak dört soru:**
>
> 1. Bu modül **yapısal** bir katkıcı ekliyor mu? (Anlamsal olan bu kontrole
>    girmez — taban yalnızca yapısal kaynaklar içindir.)
> 2. Eklendiğinde **satır döndüren yapısal kaynak sayısı** kaça çıkıyor?
> 3. Bu sayı [ADR-0042](docs/adr/0042-retrieval-taban-revizyonu.md) §3'ün **T2**
>    eşiğini (`2K/3` — bugün `K=8` için **6**) geçiyor mu?
> 4. Geçiyorsa: ⚠️ **bu bir PLATFORM kararıdır**, modül ADR'si tek başına
>    veremez. ADR-0042'nin kendi deseni uygulanır: **katkıcı eklenir, taban
>    DEĞİŞTİRİLMEZ, revizyon kapanış denetimindeki CANLI ÖLÇÜMDEN SONRA ayrı bir
>    ADR'ye bırakılır.** Sıra tersine çevrilemez — _"bir platform kararı, onu
>    değiştirmesi gereken veriye sahip olmadan revize edilmez."_
>
> ⚠️ **Cevap "hayır, yapısal katkıcı yok" olsa bile MADDE YAZILIR** (ADR-0040
> §3 bunu örnek olarak yapmıştı: üç aday değerlendirildi, üçü de reddedildi ve
> eşiğe dokunulmadığı **açıkça** kaydedildi). Sessizce atlanan bir kontrol ile
> "bakıldı ve gerek yoktu" arasındaki fark, ADR-0040'ın kendi cümlesidir:
> **"eklemedik" değil, "bakıldı ve yoktu".**
>
> ⚠️ **Kapanış denetimindeki ölçüm de bu kuralın parçasıdır** ve ADR-0042 §4
> onu genişletti: ölçüm artık yalnızca "hangi kaynak girdi"yi değil, **her
> yapısal kaynağın döndürdüğü SATIR SAYISINI** ve **giren/girmeyen parçaların
> SKORUNU** da kaydeder. İlk ikisi olmadan T2 ölçülemez; üçüncüsü olmadan band
> içi elemenin liyakatli mi yoksa kayıt sırasına mı bağlı olduğu bilinemez —
> ADR-0042 bu iki soruyu **cevaplayamadan** kapandı.

> ### ⚠️ Kalıcı ders: YENİ MIGRATION EKLEME KONTROL LİSTESİ (zorunlu)
>
> **SQL dosyası yazmak YETMEZ.** Drizzle yalnızca `drizzle/meta/_journal.json`'da
> kayıtlı migration'ları uygular. Dosya yazılıp journal'a eklenmezse
> `pnpm db:migrate` **"migrations applied successfully" yazar, çıkış kodu 0
> verir ve HİÇBİR ŞEY UYGULAMAZ.**
>
> Hata **sessizdir** ve bu, onu tehlikeli yapan şeydir: tablolar oluşmaz,
> uygulama sorunsuz ayağa kalkar, `pnpm verify` yeşil yanar. ADR-0037'de
> gerçekten yaşandı — kusur ancak `POST /ask` bir kaynağı sessizce
> `degradedSources`a düşürünce fark edildi.
>
> ⚠️ **`database.integration.spec` bunu YAKALAMAZ:** geri alma listesi
> `DROP TABLE IF EXISTS` çalıştırır ve **olmayan bir tablo için de başarılıdır**.
> Yani yeşil yanan geri alma testi, migration'ın uygulandığının kanıtı DEĞİLDİR.
>
> **Her yeni migration'da dördü de yapılır:**
>
> 1. `drizzle/<NNNN>_<ad>.sql` **ve** `<NNNN>_<ad>.down.sql` yazılır
>    (DEVELOPMENT_RULES 6 — her migration geri alınabilir).
> 2. ⚠️ **`drizzle/meta/_journal.json`'a giriş eklenir** — `idx` sıralı, `when`
>    **artan**, `tag` dosya adıyla birebir aynı. Bu adım atlanırsa yukarıdaki
>    sessiz hata olur.
> 3. ⚠️ **`database.integration.spec`'in geri alma listesine eklenir** — en
>    yeniden eskiye, bağımlı tablo ebeveyninden **önce** (ADR-0032'nin `0019`
>    dersi — yukarıda, Projeler bölümünde).
> 4. ⚠️ **YENİ ŞEMA AÇILDIYSA `businessos_app`'e GRANT AÇIKÇA DEKLARE EDİLİR.**
>    `platform` şeması dışında **hiçbir otomatik varsayılan yoktur**:
>    `0000_init`'in `ALTER DEFAULT PRIVILEGES ... IN SCHEMA platform` satırı
>    **yalnızca o şema için** tanımlıdır (ADR-0043 Slice 1b'nin bulgusu).
>    Yeni bir şemada verilen yetki, **tam olarak yazılan yetkidir**.
>
>    ⚠️ **Unutulursa hata SESSİZDİR ve TANIDIK BİR YERDEN çıkar:** tablo
>    oluşur, migration yeşil yanar, `pnpm verify` geçer — ama uygulama rolü
>    tabloyu **göremez** ve o modülün katkıcıları `POST /ask`te sessizce
>    **`degraded`** döner. Kullanıcı eksik ama kendinden emin bir cevap alır.
>    ⚠️ ADR-0047'de gerçekten yaşandı: `marketing.campaigns` için `GRANT`
>    yazılmamıştı ve **üç katkıcı birden** (`campaign-notes`, `campaign-gap`,
>    `feedback-satisfaction`) `degraded` döndü — kusur ancak
>    `retrieval.select` satırı okunduğunda görüldü.
>
>    ⚠️ **İki satır, ve ikincisi bir KARARDIR:**
>
>    ```sql
>    GRANT USAGE ON SCHEMA <sema> TO businessos_app;                    -- şemayı görür
>    GRANT SELECT, INSERT, UPDATE, DELETE ON <sema>.<tablo> TO businessos_app;
>    ```
>
>    ⚠️ İkinci satırdaki fiil listesi **modülün değiştirilebilirlik kararını
>    yansıtmalıdır**, kopyalanmamalıdır: `feedback.responses`
>    `GRANT UPDATE (embedding)` alır (kayıt değiştirilemez, ADR-0045 §2.3),
>    `marketing.campaigns` tam `UPDATE` alır (satırın her alanı güncellenir,
>    ADR-0047 §2). ⚠️ Yanlış kopyalanan bir `GRANT`, veritabanı katmanındaki
>    savunmayı sessizce gevşetir.
>
> **Kanıt adımı:** migration'ın gerçekten uygulandığı, tabloların **varlığını**
> iddia eden bir entegrasyon testiyle kilitlenir (`documents-schema
> .integration.spec`'in "iki tablo da GERÇEKTEN oluşturuldu" maddesi bunun
> içindir). Sayı saymak yetmez — `drizzle.__drizzle_migrations` sayacı da
> journal'a bağlıdır ve aynı yalanı söyler.

> ### ⚠️ Kalıcı ders: `DisclosableProblem` — AI HATA TİPLERİ HER MODÜLDE BAŞTAN
>
> **`EmbeddingFailedError`, `RateLimitExceededError` ve `CompletionFailedError`
> HER modülün exception filter'ının `@Catch(...)` listesine BAŞTAN eklenir —
> o modül bugün kullanıyor olsun ya da olmasın.**
>
> **Bu, modül modül yeniden tartışılmaz.** Product Owner'ın kalıcı standardıdır
> (ADR-0035 §8; ADR-0037 §9 ve ADR-0039 §10.1'de tekrar uygulandı).
>
> Gerekçe **asimetrik bedeldir**:
>
> | Seçim | Yanlış olduğunda bedeli |
> |---|---|
> | **Şimdi yaz** (tetiklenemese bile) | Bir satırlık **ölü kod**. Görünür, ucuz, zararsız. |
> | **Sonra ekle** (gerektiğinde) | ⚠️ Unutulursa o yol ilk kez çalıştığı gün **ham 500** döner: `ProblemDetailsFilter` gövdeyi maskeler, kullanıcı "beklenmeyen hata" görür ve **tekrar denemesi gerektiğini öğrenemez**. Hata **SESSİZDİR**. |
>
> Bu kural bir varsayımdan doğmuyor, **yaşanmış bir kusurdan** doğuyor: ADR-0035'in
> kapanış denetimi, `DisclosableProblem` işaretinin **beş modülde birden** eksik
> olduğunu buldu (Knowledge · CRM · Projeler · Finans · Randevu) ve düzeltme tek
> bir işte beş modüle birden dokunmak zorunda kaldı; `platform/context` ayrı bir
> iş olarak devraldı. O kusur tam olarak "bugün gerekmiyor" diye ertelenen
> satırlardan oluşmuştu.
>
> ⚠️ **Kapsam AI hata tipleridir, hepsi değil.** Gerekçe bu projenin kurucu
> kısıtıdır: **her modül er ya da geç AI'a dokunur** — modüller hafızadır.
> **Alan bazlı** hata tipleri (`StorageFailedError` gibi) yalnızca o alanı
> gerçekten kullanan modülde yazılır; dosya saklamayan bir modüle depolama hatası
> koymak ölü kod değil **yanıltıcı** olurdu — okuyan biri o modülün bir depolama
> yüzeyi olduğunu sanardı.
>
> ⚠️ **429 işaret TAŞIMAZ:** maske yalnızca 5xx'e uygulanır, 4xx gövdeleri zaten
> geçer. `RateLimitExceededError` listeye girer ama `DisclosableProblem`
> **almaz**; işaret koymak hiçbir şeyi değiştirmeyip "burada bir şey açıldı"
> izlenimi verirdi.
>
> ⚠️ **Bu bir GENEL AÇMA değildir.** Eşlenmemiş domain kodunun 500'ü **maskeli
> kalır** ve her modülde bir test onu kilitler — o test olmasaydı, maskenin
> tümüyle kalktığı bir regresyonda diğer testler de yeşil yanardı.

> **Kalıcı ders:** `pnpm dev` çalışırken `pnpm verify` (ya da `pnpm build`)
> **koşulmaz** — ikisi aynı `apps/web/.next` dizinini paylaşır ve `next build`,
> `next dev`'in altındaki dosyaları ezer. Sonuç sessiz değil ama yanıltıcıdır:
> her sayfa `MODULE_NOT_FOUND` ile **500**, her `/_next/static/...` varlığı
> **404** verir; tarayıcıda görünen metin düpedüz `Internal Server Error`'dır ve
> uygulama kodunda hiçbir hata yokken bir kod hatası gibi okunur. Çözüm:
> dev sunucusunu durdur, `apps/web/.next`'i sil, yeniden başlat. Doğrulama
> gerekiyorsa **önce** dev'i durdur.
