# 0031 — Faz 5: CRM Modulu + Context Engine'in platforma yukselmesi

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-05
- **Karar veren:** Product Owner
- **Faz:** 5

## Baglam

Faz 4 kapandi ve kapi kosulu karsilandi: AI Context Engine deseni **bir modulde
kanitlandi** (ROADMAP §3). Faz 5 onu **ikinci kez** uygular — "desen ancak
tekrarlandiginda desen olur".

Ilk modul **CRM**'dir (Product Owner karari). Gerekce: en cok AI baglami
uretecek modul odur — verisi **anlatisaldir** (gorusme notlari, toplanti
kayitlari) ve bu, Knowledge'in `notes`/`note_chunks` deseniyle mimari olarak en
uyumlu ilk adaydir.

Ama "ikinci kez uygulamak" bu ADR'de iki ayri soru dogurdu ve **ikisi de
kacinilmaz**:

1. **Kod tekrari sorusu.** `EmbeddingPort`, `LLMPort`, chunking ve oran siniri
   bugun `modules/knowledge/` **icinde** yasiyor. CRM bunlari import EDEMEZ —
   bu bir uslup tercihi degil, `import/no-restricted-paths` ile **makine
   tarafindan zorlanan** bir kisittir (`packages/config/eslint/nest.js`,
   `moduleIsolationZones`). Kural bolgeleri dosya sisteminden URETILDIGI icin
   `modules/crm` klasoru acilir acilmaz Knowledge'in katmanlari CRM'e kapanir.
   Mutlak Kural 6 zaten aynisini soyluyor.

2. **Hafiza havuzu sorusu — bu fazin en onemli mimari karari.** CRM verisi
   AI'a nasil ulasacak? `/knowledge/ask` genisleyecek mi, yoksa CRM'in kendi
   `/crm/ask`'i mi olacak? Bu soru CLAUDE.md'nin kurucu kisitiyla dogrudan
   temas eder ve yanlis cevabi **geri donusu pahalidir**.

Ikisi de asagida karara baglaniyor. Bu ADR bu yuzden yalnizca bir modul ADR'si
degil: **Faz 4'te yazilmis kodun bir kismini tasiyor.** O kalemler
["Not — bu ADR Faz 4 kodunu degistiriyor"](#not--bu-adr-faz-4-kodunu-degistiriyor)
bolumunde tek tek listelendi ve **hepsi ayri ayri onaylandi** (Product Owner,
2026-08-05). ADR-0029/0030'un gecersiz kilinan kararlari o ADR'lere superseded
notu olarak islendi; **metinleri silinmedi**.

## Karar

### 1. Yeni `crm` semasi

Mutlak Kural 5 geregi CRM kendi semasina sahiptir; `knowledge` semasi
GENISLETILMEZ. Tum tablolar RLS `ENABLE` + `FORCE` tasir (MT §12.2 standart
sablonu), `tenant_id uuid NOT NULL REFERENCES platform.tenants(id)` icerir,
bilesik index'lerde `tenant_id` **daima ilk kolondur** ve unique kisitlar
tenant-scoped'tir (MT §12.3).

| Tablo                    | Kolonlar                                                                                                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crm.companies`          | `id`, `tenant_id`, `name`, `industry` (nullable), `email` (nullable), `phone` (nullable), `website` (nullable), `created_at`, `updated_at`                                                                                       |
| `crm.contacts`           | `id`, `tenant_id`, `company_id` (FK, **sema ici**), `full_name`, `title` (nullable), `email` (nullable), `phone` (nullable), `created_at`, `updated_at`                                                                          |
| `crm.opportunities`      | `id`, `tenant_id`, `company_id` (FK), `contact_id` (FK, nullable), `title`, `stage`, `estimated_value` (`numeric`, nullable), `currency`, `next_follow_up_on` (`date`, nullable), `stage_changed_at`, `created_at`, `updated_at` |
| `crm.interactions`       | `id`, `tenant_id`, `author_user_id`, `company_id` (FK, **NOT NULL**), `contact_id` (FK, nullable), `opportunity_id` (FK, nullable), `occurred_on` (`date`), `body`, `created_at`                                                 |
| `crm.interaction_chunks` | `id`, `tenant_id` (denormalize), `interaction_id` (FK), `chunk_index`, `content`, `embedding vector(1536)`, `created_at`                                                                                                         |

Notlar:

- **Tum FK'ler sema icidir.** Cross-schema FK yasak (Mutlak Kural 5); tek
  istisna MT §12.3'un `platform.tenants` referansidir.
- `interaction_chunks.tenant_id` denormalizasyonu `note_chunks` ile **birebir
  ayni** gerekcedir: RLS politikasi JOIN'siz calissin.
- `embedding` uzerinde **HNSW** index, `vector_cosine_ops` (ADR-0029 §1 ile ayni
  gerekce ve ayni operator eslesmesi).
- `UNIQUE (interaction_id, chunk_index)` — yeniden uretimi idempotent kilar
  (ADR-0029'un migration `0011`'de ogrendigi ders, bu kez ilk gunden).
- `estimated_value` icin **`numeric`**, `double precision` DEGIL. Para
  kayan noktali sayida tutulmaz.

#### 1.1 `interactions.company_id` neden NOT NULL — ve polimorfizm neden yok

Bir gorusme kaydi sirket, kisi ve firsat ile iliskilendirilebilir. Uc nullable
FK + "tam olarak biri dolu" CHECK'i (polimorfik ebeveyn) **secilmedi**. Bunun
yerine dogal hiyerarsi kullanilir: her gorusme **bir sirkete aittir**, kisi ve
firsat **opsiyonel daraltmalardir**.

Kazanc: polimorfik JOIN yok, "hangi kolon dolu" dallanmasi yok, ve "bu sirketle
tum gecmisimiz" sorgusu tek kolonla cevaplanir.

**Bedeli acikca:** henuz sirketi acilmamis bir aday hakkinda not tutulamaz —
once sirket kaydi olusturulur. Kabul edildi; alternatifi, modelin en sik
sorgusunu bir CHECK kisitina feda etmekti.

### 2. Firsat asamalari — bes deger, serbest gecis

Product Owner "sabit 4 asama: Potansiyel → Gorusuluyor → Teklif verildi →
Kazanildi/Kaybedildi" dedi. Son kutu **iki ayri sonuctur**; sema bu yuzden
**bes enum degeri** tasir:

```
potential | in_discussion | proposal_sent | won | lost
```

`MembershipRole` ile ayni desen (ADR-0025 §1): **kodda enum, tabloda degil**.
Ozellestirilebilir asama kapsam disidir; enum → tablo gecisi gerektiginde
business logic'e dokunmadan yapilabilir.

**Kisitlayici bir durum makinesi YOK.** Projede `Tenant`, `Membership` ve `User`
durum makineleri var; firsat asamasi onlardan farklidir ve gecisler
kisitlanmaz — `won`'dan `in_discussion`'a donmek dahil.

**Neden:** gercek bir satis hattinda geri gidis OLAGANDIR (anlasma soguyor,
kazanilan is iptal olur). Bunu engellemek kullaniciyi yazilima **yalan
soylemeye** iter: asamayi guncellemez, veri bayatlar ve AI bayat veriyle cevap
verir. Modulun var olma sebebi dogru baglam uretmektir; disiplin adina yanlis
baglam uretmek kendi amacini baltalar.

**`stage_changed_at` tutulur** (asama her degistiginde yenilenir). Tek kolonluk
bir maliyetle "bu firsat 40 gundur ayni asamada" bilgisi elde edilir ve bu tam
olarak §5.4'un yapisal katkicisina giren turden bir baglamdir. **Asama gecmisi
tablosu kapsam disidir** — bugun ihtiyac duyulan tek soru "ne kadar zamandir
burada".

### 3. "Takipler" gorunumu — TURETILMIS, tablo YOK

`GET /api/v1/crm/follow-ups`, su sorgunun kronolojik ciktisidir:

```sql
SELECT ... FROM crm.opportunities
WHERE next_follow_up_on IS NOT NULL AND stage NOT IN ('won', 'lost')
ORDER BY next_follow_up_on ASC, id ASC;
```

Ayri bir `follow_ups` tablosu **kurulmaz**. Bu, projede uc kez verilmis ayni
karardir: `daily_report_runs`'ta `status` kolonunun reddi (ADR-0030 §2.1),
yeniden indeksleme is listesinin turetilmis olmasi (ADR-0029, 2026-08-05 notu),
ve yetim not tespitinin `LEFT JOIN` ile yapilmasi. **Turetilebilir bir bilgiyi
kaliciya yazmak ikinci bir dogruluk kaynagi yaratir ve iki kaynak zamanla
birbirini yalanlar.**

Bu bir **Takvim modulu DEGILDIR**: gorunumun kendi verisi yoktur, kendi yazma
ucu yoktur, ve firsat kapandiginda takip kendiliginden listeden duser.

**Tip `date`, `timestamptz` DEGIL.** Takip bir **takvim kavramidir** ("12'sinde
ara"), bir an degil. Bu secim, tenant bazli saat dilimi sorusunu (kapsam disi,
ADR-0030 §2.3 ile ayni ilke) v1 icin **tumuyle ortadan kaldirir**: gun bazli bir
alanda saat dilimi kaymasi diye bir sey yoktur.

**Bedeli:** gun ici saat verilemez ("14:00'te ara" yazilamaz). Kabul edildi.

### 4. Gorusmeler — CRM'in KENDI tablolari, PAYLASILAN port

**Karar: CRM kendi `interactions` / `interaction_chunks` tablolarina sahiptir.
Knowledge ile paylasilan sey VERI degil, PORT ve ALGORITMADIR.**

Bunun mumkun olmasi icin bugun Knowledge'in icinde duran ama **Knowledge'a ait
olmayan** parcalar disari tasinir. Ayrim cizgisi tek bir soruyla cizildi:
_"bunun icinde bir is anlami var mi?"_

| Parca                                                 | Bugun                                          | Yarin                                  | Neden                                                                        |
| ----------------------------------------------------- | ---------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| `EmbeddingPort`, `LLMPort` (arayuzler)                | `modules/knowledge/application/`               | **`shared/`**                          | Framework'suz arayuz, sifir is anlami — `Clock`/`IdGenerator` ile ayni sinif |
| `OpenAiEmbeddingAdapter`, `DeepSeekLlmAdapter`        | `modules/knowledge/infrastructure/`            | **`infrastructure/ai/`**               | Cross-cutting adapter, hicbir is moduluna ait degil                          |
| `chunking.ts` (~500 token, paragraf sinirina saygili) | `modules/knowledge/domain/`                    | **`shared/`**                          | Saf fonksiyon; "not" degil "metin" bilir                                     |
| `RateLimitPolicy` + sayac tablosu                     | `modules/knowledge/` + `knowledge.rate_limits` | **`shared/` + `platform.rate_limits`** | Maliyet kontrolu bir PLATFORM meselesidir (§4.2)                             |
| `KNOWLEDGE_SYSTEM_PROMPT`                             | `modules/knowledge/application/`               | **degismez — Knowledge'da kalir**      | Prompt bir IS kararidir                                                      |
| Retrieval stratejisi, kaynak atfi, konusma hafizasi   | `modules/knowledge/`                           | **degismez**                           | Modulun kendi semantigi                                                      |

Yerlesim yeri **icat edilmedi**; projede zaten calisan desen kullanildi:
`shared/clock.port.ts` + `infrastructure/clock/system-clock.adapter.ts`,
`shared/id-generator.port.ts`, `shared/transaction-manager.port.ts`. Port
`shared/`'da, adapter `infrastructure/`'da. `EmbeddingPort` bu tarife **birebir**
uyar: framework'suz bir arayuz, birden fazla modulun ihtiyaci, ve
saglayiciya bagli her sey adapter'in icinde.

Bu ayni zamanda ADR-0007'nin dogru okunusudur: `LLMPort` **hicbir is modulunun
mulku degildir**. Faz 4'te Knowledge'in icinde durmasi, o gun tek tuketici
oldugu icindi — bir karar degil, bir tesadufttu.

> **`shared/` cop kutusuna donusmemeli.** Bir seyin oraya girmesi icin uc kosul
> BIRDEN saglanmalidir: (1) framework'suz, (2) hicbir modulun is anlamini
> tasimiyor, (3) en az iki modul ihtiyac duyuyor. Yukaridaki dort kalem ucunu de
> saglar; `KNOWLEDGE_SYSTEM_PROMPT` (2)'de duser ve bu yuzden tasinmaz.

#### 4.1 Neden CRM verisi Knowledge'a YAZILMIYOR

Reddedilen alternatif: CRM, `knowledge.public.ts` uzerinden bir `IngestNote`
cagirsin ve gorusmeler `knowledge.notes`'ta yasasin. Mutlak Kural 6 acisindan
**yasaldir** (public interface). Yine de secilmedi:

- **Sahiplik kaybi.** Bir sirket silindiginde gorusmeleri de gitmeli. Cross-schema
  FK yasak oldugu icin bu **cascade yazilamaz** — ortada yetim satirlar kalirdi
  ve daha kotusu: **silinmis bir musteri AI'in hafizasinda yasamaya devam
  ederdi.**
- **Yapi kaybi.** Bir gorusmenin `company_id`'si, `occurred_on`'u ve
  `opportunity_id`'si vardir. Bunlar `notes` semasinda yeri olmayan alanlardir;
  govdeye metin olarak gomulurlerdi ve geri ayristirilamazlardi.
- **Tanri-modul.** Her yeni modul Knowledge'a yazsaydi, `knowledge.notes` tum
  sirketin tek tablosu olur ve modul sinirlari kagit uzerinde kalirdi.

#### 4.2 Oran siniri platforma tasinir

CRM'in yazma yolu da embedding cagirir, yani **para harcar** ve korunmasi
gerekir. Ucu asagidaki:

| Uc                       | `action`             | Tur         |
| ------------------------ | -------------------- | ----------- |
| `POST /crm/interactions` | `create_interaction` | **SIGORTA** |
| `POST /ask` (§5)         | `ask`                | **BUTCE**   |
| `POST /knowledge/notes`  | `create_note`        | **SIGORTA** |

`crm.rate_limits` diye ikinci bir sayac tablosu **acilmaz**. Mekanizma
`platform.rate_limits`'e tasinir; `action` serbest bir string'dir ve modul
tarafindan deklare edilir.

**Neden simdi, ucuncu modulde degil:** bu, ADR-0025'in Authorization icin
kurdugu deseninin aynisidir — **platform mekanizmayi sahiplenir, modul kendi
kalemini deklare eder, platform icerigi yorumlamaz**. Ve ADR-0030 §2.4'un
"ertelenemez genellestirme" kuralinin ruhu tam olarak budur: ikinci tekrarda
egilim gorunur hale gelir; ucuncude beklemek bes ozdes tablo demektir.

`platform.rate_limits` tenant-scoped'tir ve `FORCE RLS` tasir — `knowledge.rate_limits`
bugun neyse aynisi, yalnizca semasi degisir. **Yeni bir dar `BYPASSRLS` rolu
GEREKMEZ** (ADR-0030 §2.4'un altinci rol kurali TETIKLENMEZ).

### 5. AI Context Engine platforma yukselir — TEK kurumsal hafiza

**Karar: ayri bir `/crm/ask` YOKTUR. Tek bir `POST /api/v1/ask` ucu vardir ve
sorusunu TUM modullere dagitir.**

Bu, bu fazin en onemli karari ve CLAUDE.md'nin kurucu kisitinin dogrudan
sonucudur. O metin somut bir ornek veriyor: bir CEO _"son 6 ayimizi analiz et"_
der ve sistem **CRM'deki musteri hareketlerine, Finans'taki nakit akisina,
Projeler'deki teslim performansina BIRLIKTE bakar**.

Modul basina `/ask` ucu bu cumleyi **yapisal olarak imkansiz** kilar. Dahasi,
kullaniciya "bu soruyu hangi modulden sormaliyim" sorusunu yukler — ki bu tam
olarak CLAUDE.md'nin reddettigi **chatbot** cercevesidir.

Ama Mutlak Kural 5-6 da geriye adim atmaz: Knowledge `crm.interaction_chunks`'i
okuyamaz. Iki kisit birbirini disliyor gorunuyor; cozum ucuncu bir tasarimdir.

#### 5.1 `RetrievalContributor` — modul katki verir, platform birlestirir

Retrieval ucu **Knowledge'a ait degildir; platforma aittir** (`platform/context`).

```
RetrievalContributor:
  source: string                       // 'knowledge' | 'crm' — koken etiketi
  permission: Permission               // bu kaynagi goren izin (§5.3)
  contribute(input: {
    question: string
    embedding: readonly number[]
    limit: number
  }): Promise<ContextFragment[]>

ContextFragment:
  content: string                      // modele gidecek metin
  score: number                        // 0..1, yuksek = daha alakali
  source: string
  reference: { kind: string, id: string }   // kaynak atfi
```

Her modul **kendi semasindan** katki verir. Platform yalnizca portu bilir;
`crm` ya da `knowledge` kelimelerinin **anlamini bilmez** — ADR-0025'te
Authorization'in permission string'lerini yorumlamamasiyla **birebir ayni
disiplin**.

Akis:

1. Soru embed edilir (**bir kez**, `EmbeddingPort`),
2. Cagiranin izinlerine gore katkicilar **elenir** (§5.3),
3. Kalan katkicilar **paralel** cagrilir,
4. Sonuclar birlestirilir, skora gore siralanir, **global top-K** alinir,
5. `LLMPort.complete()` cagrilir,
6. Cevap + **kaynak referanslari** + `degradedSources` doner.

**Modul basina kota YOK, global top-K var.** Bir musteri sorusu 8 parcanin
8'ini de CRM'den cekebilmelidir; sabit kota ("her modulden 4") en alakali
kanitlari en alakasizlariyla degistirirdi.

#### 5.2 Uc nokta: `POST /api/v1/ask`

`POST /api/v1/knowledge/ask` **yeniden adlandirilir**. Iki uc birden
tutulmaz: ayni isi yapan iki uc, her yeni modulde "hangisini cagiracagim"
sorusunu dogurur.

⚠️ **Bu bir breaking change'dir ve ayrica onaylandi** (Product Owner,
2026-08-05). Bugun tek tuketici kendi `apps/web`'imizdir ve sistem hic prod'a
cikmadi (ROADMAP §2.4), yani degisimin maliyeti **su an mumkun olan en dusuk
seviyededir** — ve her gecen faz artar.

#### 5.2.1 Konusma hafizasi platforma tasinir

`knowledge.conversations` ve `knowledge.messages` → **`platform.conversations` /
`platform.messages`** (ADR-0030 §1.1'in sema karari **degistirildi**).

**Gerekce:** `POST /ask` artik bir platform ucudur. Tablolari `knowledge`
semasinda birakmak, `platform/context` bileseninin bir **is modulunun semasina
yazmasi** demekti — yani Mutlak Kural 5'in dogrudan ihlali. Tek kacis yolu
konusmayi Knowledge'a public interface uzerinden yazdirmakti; bu da platformun
bir is moduluna bagimli olmasi anlamina gelirdi ve bagimlilik yonunu **ters
cevirirdi** (ARCHITECTURE §6.2: `Tenant → Identity → Authorization → Audit`
zinciri is modullerini bilmez).

Anlam da bunu soyluyor: konusma artik "Knowledge'a sorulan sorularin gecmisi"
degil, **"sirkete sorulan sorularin gecmisi"**. Kaldigi yer bunu yansitmali.

Tablolar tenant-scoped kalir ve `FORCE RLS` tasir; degisen **yalnizca semadir**.
`messages → conversations` `ON DELETE CASCADE` zinciri (migration `0011`) aynen
korunur — ROADMAP §8.4'un "dogru retention kolu `conversations`'dir" tespiti
gecerliligini surdurur, yalnizca tablo adresi degisir.

**Bedeli acikca:** bu, bu ADR'nin **ucuncu** migration'idir. Kabul edildi.

#### 5.3 Izin filtresi — sizinti buradan olurdu

**Katkicilar cagiranin izinlerine gore elenir.** Bir kullanici `crm:read`
tasimiyorsa CRM katkicisi **hic cagrilmaz** ve CRM icerigi cevaba giremez.

Bu, tasarimin en kritik detayidir. Filtre olmasaydi, birlesik hafiza
**yetkilendirmeyi delen bir yan kapi** olurdu: kullanici goremedigi bir kaydin
icerigini, o kaydi ozetleyen bir cevap uzerinden okurdu. RLS bunu **yakalamaz**
— RLS tenant sinirini korur, tenant ICINDEKI izin sinirini degil (ADR-0029'un
`conversations` sahiplik kontrolunde ogrenilen ayni ders).

Karar mekanizmasi yeniden icat edilmez: eleme, ADR-0025'in **ayni policy
engine'ini** cagirir.

`POST /ask` ucunun kendi izni **`context:ask`**'tir (bugunku `knowledge:ask`'in
devami). Iki farkli soru: "soru sorabilir mi" (maliyet) ve "hangi kaynaklari
gorur" (icerik).

#### 5.4 Iki tur katkici: anlamsal ve YAPISAL

Bir katkicinin vektor tabanli olma zorunlulugu **yoktur** — port `contribute()`
der, `search()` demez. CRM bu yuzden **iki** katkici kaydeder:

| Katkici            | Kaynak                   | Nasil calisir                                                                       |
| ------------------ | ------------------------ | ----------------------------------------------------------------------------------- |
| `crm-interactions` | `crm.interaction_chunks` | Anlamsal — pgvector, Knowledge ile ayni                                             |
| `crm-pipeline`     | `crm.opportunities`      | **Yapisal** — deterministik SQL; acik firsatlar + gecikmis takipler, SINIRLI sayida |

**Neden yapisal katkici gerekli.** "Hangi anlasmalar takipte gecikti?" sorusunun
cevabi bir gorusme notunda **yazmaz**; `next_follow_up_on` kolonunda yazar.
Yalnizca anlatisal veriyi gomseydik, model bu soruyu bayat toplanti notlarindan
**tahmin ederek** cevaplardi — ve kendinden emin bir sekilde yanilirdi.
"Modul AI'a hangi baglami kazandirir" sorusunun CRM'deki cevabi **yalnizca
gorusmeler degildir**.

Yapisal katki **sabit ve kucuk tutulur** (en yuksek degerli N acik firsat +
gecikmis takipler). Bedeli acikca: her soruda gonderilir, yani soru CRM ile
ilgisiz olsa bile birkac yuz token maliyeti vardir. Onun ilgili olup olmadigini
onceden bilmenin yolu, **ayri bir LLM cagrisidir** — yani daha pahalidir.

> **Yapisal katkici v1'DE KALIYOR.** Taslak asamasinda bu bolum "kapsami
> kucultmek gerekirse temiz kesim cizgisi burasidir" notuyla sunulmustu; Product
> Owner onu **acikca kapsam icinde birakti** (2026-08-05). Karar kayda geciyor:
> CRM'in AI'a kazandirdigi baglam yalnizca anlatisal degildir ve v1 bunu ilk
> gunden yansitir.

#### 5.5 Bozulan katkici cevabi COKERTMEZ — ama SUSMAZ

Bir katkici hata verirse istek **bozulmaz**; o kaynak disarida birakilir ve
yanit `degradedSources: ['crm']` tasir. Arayuz bunu gorunur kilmak
**zorundadir** ("CRM verisi bu cevaba dahil edilemedi").

Iki uc da reddedildi: (a) tum istegi cokertmek — bir modulun yavas sorgusu
sistemin tamamini durdururdu; (b) sessizce atlamak — kullanici **eksik ama
kendinden emin** bir cevap alirdi, ki bu projenin tekrar tekrar reddettigi
sessiz hatadir ("kapali olduğunu soylemesi, sessizce yanlis calismasindan
iyidir" — CLAUDE.md, Faz 2 tenant ucu).

### 6. Izinler — kaynak bazli, `crm:read` DEGIL

ADR-0025 modeli `resource:action`'dir. `crm:read` bir **modul** iznidir, kaynak
izni degil; modeli ilk kullanimda bozardi.

| Permission           | owner | admin | member | viewer |
| -------------------- | :---: | :---: | :----: | :----: |
| `company:read`       |  ✅   |  ✅   |   ✅   |   ✅   |
| `company:write`      |  ✅   |  ✅   |   ✅   |   ❌   |
| `company:delete`     |  ✅   |  ✅   |   ❌   |   ❌   |
| `contact:read`       |  ✅   |  ✅   |   ✅   |   ✅   |
| `contact:write`      |  ✅   |  ✅   |   ✅   |   ❌   |
| `contact:delete`     |  ✅   |  ✅   |   ❌   |   ❌   |
| `opportunity:read`   |  ✅   |  ✅   |   ✅   |   ✅   |
| `opportunity:write`  |  ✅   |  ✅   |   ✅   |   ❌   |
| `opportunity:delete` |  ✅   |  ✅   |   ❌   |   ❌   |
| `interaction:read`   |  ✅   |  ✅   |   ✅   |   ✅   |
| `interaction:create` |  ✅   |  ✅   |   ✅   |   ❌   |

Uc ayrinti:

**`delete` neden `write`'tan ayri.** Silme geri alinamaz ve **AI hafizasindan da
siler** (§7'deki cascade). "Bir gorusme kaydedebilir ve firsati ilerletebilir"
ile "bir musteriyi silebilir" farkli yetkilerdir; gercek CRM rol tasarimi da
boyle ayirir. Bedeli tek bir string.

**`interaction` neden `create`, `write` degil.** Gorusmeler `notes` gibi
**ekleme-yalniz** bir gunluktur (`note:create` ile ayni adlandirma). Guncelleme
ve silme v1'de yoktur, dolayisiyla var olmayan bir fiili deklare etmek yanlis
olurdu.

**`viewer` burada READ ALIYOR — Knowledge'dan farkli.** ADR-0029'da `note:read`
viewer'a verilmemisti; `knowledge.permissions.ts` bu kisitlamanin **gecici**
oldugunu ve okuma uclari olgunlastikca viewer'in izni muhtemelen ALACAGINI
zaten yaziyor. CRM'de musteri listesini gormek **viewer'in tanimi geregi
isidir**. Sapma bilincli ve burada kayda geciyor; Knowledge'in `note:read`
satirini degistirmiyoruz (o ayri bir karar).

**`opportunity:read` neden ayri bir kaynak.** "Musteri listesini gorur ama
anlasma tutarlarini gormez" klasik ve gercek bir CRM talebidir. Alan bazli izin
(`estimated_value`) ABAC'tir ve **backlog'tadir** (ROADMAP §1.1) — ama kaba hali
("hatti hic gormesin") bugun **tek satirlik** bir degisiklikle ifade edilebilir,
cunku izin ayri tutuldu.

### 7. Silme, cascade ve AI hafizasi

`crm.companies` silindiginde: `contacts` → `opportunities` → `interactions` →
`interaction_chunks` **`ON DELETE CASCADE` ile birlikte gider.** Zincir sema
icidir, yani veritabani tarafindan garanti edilir.

Bu bir ayrinti degil, §4.1'in gerekcesinin **kaniti**: chunk'lar CRM semasinda
oldugu icin silinen bir musteri AI'in hafizasindan da silinir. Knowledge'a
yazilmis olsalardi bu cascade **yazilamazdi**.

Ayni zamanda ROADMAP §8.2'nin KVKK kontrol noktasina bir girdidir: "silme hakki"
bu modulde veritabani seviyesinde karsilanir.

## Gerekce

**1. Neden yeni `crm` semasi.** Mutlak Kural 5 ve ADR-0029'un kurdugu emsal.
`knowledge` semasini genisletmek, iki modulun tablolarini tek bir RLS/retention/
migration yuzeyinde birlestirir ve modul ayirmayi (ARCHITECTURE §6.1: "schema'yi
ayri DB'ye tasi") imkansiz kilar.

**4. Neden port paylasilir ama veri paylasilmaz.** Kod tekrarini onlemenin iki
yolu vardi ve **yalnizca biri Mutlak Kural 5-6 ile uyumludur**:

|                       | Veriyi paylas (`knowledge.notes`'a yaz)   | **Portu paylas (secilen)**    |
| --------------------- | ----------------------------------------- | ----------------------------- |
| Sema sinirı           | Bulanik — CRM verisi baskasinin semasinda | Net — herkes kendi semasinda  |
| Silme / cascade       | **Yazilamaz** (cross-schema FK yasak)     | Veritabani garantisi          |
| Yapisal alanlar       | Govdeye gomulur, geri alinamaz            | Kolon olarak durur            |
| Tekrarlanan kod       | Yok                                       | **Yok** — `shared/`'dan gelir |
| Modul ayrilabilirligi | Kaybolur                                  | Korunur                       |

Yani "veriyi paylas" secenegi, kod tekrari disinda **her sutunda kaybediyor** —
ve o tek sutunu da port paylasimi zaten kazaniyor.

**5. Neden tek havuz, modul basina `/ask` degil.** Uc sebep, agirlik sirasiyla:

1. **Urun tanimi bunu emrediyor.** CLAUDE.md'nin CEO ornegi cross-modul bir
   sorudur ve modul basina uclarla **asla** cevaplanamaz. Bu bir ozellik degil,
   urunun kendisidir.
2. **Bilissel yuk kullaniciya devredilirdi.** "Bunu CRM'e mi Knowledge'a mi
   sorayim" sorusu, kullanicidan sistemin ic yapisini bilmesini ister.
   "Dijital yonetici asistani" boyle bir soru sormaz.
3. **Altyapi N kez cogalirdi.** Prompt, konusma hafizasi, oran siniri, kaynak
   atfi, hata modeli — her modulde yeniden. Besinci modulde bes kopya olurdu.

**ADR-0007 ile tutarlilik.** "AI merkezde, moduller baglam saglar" cumlesi tam
olarak bu topolojidir: merkezde bir motor (`platform/context`), cevresinde
katki veren moduller. Modul basina `/ask`, tam tersini kurardi — **her modulun
kendi kucuk AI'i**, yani AI'in modullerin yanina esit bir bilesen olarak
konmasi. CLAUDE.md bunu "yaygin hata" olarak isimlendiriyor.

**5.1 Neden fan-out, tek ortak vektor tablosu degil.** Alternatif tablodaydi
(asagida) ve gercekten daha basit; secilmemesinin sebebi **yasam dongusudur**:
tek tabloda CRM'in silme kurali, Knowledge'in retention kurali ve gelecekteki
Finans'in KVKK kurali ayni satirlarda carpisirdi ve hicbiri FK ile
zorlanamazdi.

**6. Neden kaynak bazli izinler.** ADR-0025'in modeli `resource:action`'dir ve
`knowledge.permissions.ts` bu ayrimin **bugun ayni kume olsalar bile** neden
korunmasi gerektigini zaten gerekcelendiriyor: "iki permission, bugun ayni kume
— yarin bagimsiz degisebilir". `crm:read` o dersi ilk firsatta unutmak olurdu.

## Kapsam disi (bugun yapilmiyor)

Product Owner tarafindan acikca kapsam disi birakilanlar:

- **E-posta entegrasyonu** (gelen/giden yazismalarin otomatik kaydi)
- **Fatura / teklif olusturma** (Finans moduluna ait)
- **Gorev ve hatirlatma sistemi** — **Projeler moduluna birakiliyor.**
  "Takipler" gorunumu (§3) bunun yerine gecmez: bildirimi yoktur, atamasi
  yoktur, tamamlanma durumu yoktur — yalnizca bir tarih listesidir.
- **Ozellestirilebilir pipeline asamalari** (bes deger sabit)
- **Custom field'lar**
- **Tenant bazli saat dilimi** (ADR-0030 §2.3 ile ayni ilke; §3'un `date` secimi
  bu sorunu v1'de zaten dogurmuyor)

Tasarim sirasinda cikan, ayrica kapsam disi tutulanlar:

- **Asama gecmisi tablosu** (yalnizca `stage_changed_at`)
- **Gorusme guncelleme / silme** (ekleme-yalniz gunluk; ADR-0029'un `notes`
  sinirinin aynisi)
- **Yapisal kayitlarin (sirket/firsat) gomulmesi** — §5.4'un yapisal katkicisi
  bu ihtiyaci embedding'siz karsilar
- **Ithalat / disa aktarma** (CSV)
- **Cok para birimli toplama** — `currency` kolonu saklanir ama toplamlar
  cevrilmez; farkli para birimlerini toplayan bir gorunum yoktur
- **CRM domain event'leri** — bugun tuketicisi yok (§ Bilinen sinirlar)

ADR-0029 ve ADR-0030'un kapsam disi maddeleri aynen gecerlidir (dosya eki,
per-tenant saglayici secimi, Cache, hassas veri redaksiyonu, streaming).

## Bilinen sinirlar

- **Skorlar kaynaklar arasinda KALIBRE DEGIL.** Bir CRM parcasinin 0.82'si ile
  bir Knowledge parcasinin 0.82'si ayni sey demek degildir; farkli metin
  turlerinin mesafe dagilimlari farklidir. v1 ham mesafeyi kullanir ve tek
  havuzda siralar. Kalibrasyon (kaynak basina normalizasyon veya yeniden
  siralama/rerank) olcum verisi biriktiginde ele alinir.
- **Fan-out gecikmesi en yavas katkiciya baglidir.** Bugun N=2 ve ikisi de
  paralel; N buyudukce bir zaman asimi butcesi gerekecek.
- **Yapisal katki her soruda gonderilir** (§5.4) — soru CRM ile ilgisiz olsa
  bile sabit bir token maliyeti vardir.
- **"Chunk'siz gorusme" MUMKUNDUR.** ADR-0029 §4'un iki transaction'li
  akisinin ayni sonucu. Fark su: **onarim mekanizmasi bu kez ilk gunden
  vardir** (`POST /crm/reindex`, yeniden indeksleme deseni) — Knowledge'da
  sonradan yazilmisti. `LEFT JOIN` ile tespit ayni sekilde turetilmistir.
- **`interaction_chunks`'ta model/surum kolonu YOK** — ADR-0029'un ayni bilinen
  siniri; model degisimi bu kolonun eklenmesini gerektirir.
- **CRM domain event YAYINLAMAZ.** Bugun tuketicisi yoktur ve `platform.outbox`
  zaten is yapmayan bir event tasiyor (`TenantProvisioningRequested`); ikincisini
  eklemek "yayinliyorum sanip hicbir sey yayinlamayan" yuzeyi buyuturdu.
  Tetikleyici acik: **Finans modulu "firsat kazanildi → fatura tasarisi"
  isteyince** `OpportunityWon` yayinlanir.
- **Retention borcu SEKIZ tabloya cikiyor** (ROADMAP §8.4'te alti idi):
  `crm.interactions` + `crm.interaction_chunks`. `conversations` denetiminde
  ogrenilen ders burada **ilk gunden** uygulaniyor: `interaction_chunks →
interactions` `ON DELETE CASCADE` tasidigi icin **dogru retention kolu
  `interactions`'dir**; yalnizca chunk silen bir is, yetim satirlar birakirdi.
  Tasimalar listeyi **kisaltmaz** ama cogalmasini onler: `rate_limits` ve
  `conversations`/`messages` artik modul basina degil, platformda **tek**
  kalemdir.
- **Arama yalnizca anlamsaldir.** "Adinda 'Teknoloji' gecen sirketler" gibi
  klasik metin aramasi yoktur; ROADMAP'in acik FTS kalemi (ADR-0011) burada
  ikinci kez gorunur hale gelir — bir CRM'de sirket adiyla arama, bir bilgi
  bankasindakinden daha temel bir beklentidir.

## Sonuclari

**Olumlu**

- **Faz 4 deseni ikinci kez uygulanir** ve bu sefer tekrardan **soyutlama
  cikar**: port/adapter/chunking/oran siniri, bir modulun icinden platformun
  ortak yuzeyine tasinir. Ucuncu modul (Finans) artik hazir bir zemine oturur.
- **Tek kurumsal hafiza kurulur.** CLAUDE.md'nin CEO ornegi ilk kez **mimari
  olarak mumkun** hale gelir; bugun iki kaynakla, yarin bes kaynakla — kod
  degismeden.
- **Modul sinirlari korunarak** yapilir: hicbir modul digerinin semasini ya da
  internal kodunu gormez; lint kurali ihlali makine tarafindan yakalar.
- **Silme hakki veritabani seviyesinde** karsilanir (§7) ve KVKK kontrol
  noktasina hazir bir girdi olusur.
- Izin filtresi (§5.3) sayesinde birlesik hafiza **yetkilendirmeyi
  zayiflatmaz**; aksine RBAC'i AI yuzeyine tasiyan ilk mekanizmadir.

**Olumsuz / bedeli**

- **Bu ADR Faz 4 kodunu tasiyor.** Yeni kapanmis bir modulun dosyalari yer
  degistiriyor; testler, DI kayitlari ve **uc migration** etkileniyor. Bedel
  gercek ve asagida ayri bir bolumde listeleniyor.
- **`POST /knowledge/ask` yeniden adlandiriliyor** — breaking change. Bugun
  maliyeti en dusuk seviyede (tek tuketici kendi web'imiz, prod yok) ama sifir
  degil.
- **`platform/context` yeni bir platform bileseni.** Platform yuzeyi buyuyor;
  `Tenant → Identity → Authorization → Audit` zincirine besinci bir kalem
  ekleniyor.
- **Fan-out, tek sorgudan pahalidir**: N paralel sorgu, N sonuc birlestirme,
  kalibre edilmemis skorlar. Tek ortak tabloda bu problemlerin hicbiri olmazdi.
- **CRM v1 bir CRM'i tam karsilamaz**: e-posta yok, teklif yok, gorev yok,
  ozellestirme yok. Bilincli, ama kullaniciya eksik hissettirecektir.

## Degerlendirilen alternatifler

| Alternatif                                                                    | Neden secilmedi                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`knowledge` semasini genisletmek** (CRM tablolari orada)                    | Mutlak Kural 5. Iki modul tek RLS/retention/migration yuzeyinde birlesir; ayrilabilirlik kaybolur                                                                                                                                           |
| **CRM gorusmelerini `knowledge.notes`'a yazmak** (public interface uzerinden) | Yasal ama: silme cascade'i **yazilamaz** (silinen musteri AI hafizasinda kalir), yapisal alanlar govdeye gomulur, Knowledge tanri-modul olur                                                                                                |
| **`EmbeddingPort`'u Knowledge'da birakip CRM'de kopyalamak**                  | Iki adapter, iki API anahtari yolu, iki kez degisecek model kararı. Ve `vector(1536)` varsayimi iki yerde yasardi                                                                                                                           |
| **CRM'in Knowledge'i import etmesi**                                          | Mutlak Kural 6 — ve `import/no-restricted-paths` bunu **derlemede** reddeder. Tartisma konusu bile degil                                                                                                                                    |
| **Ayri `POST /crm/ask`**                                                      | Cross-modul soruyu yapisal olarak imkansiz kilar (CLAUDE.md'nin CEO ornegi asla cevaplanamaz); kullaniciya "hangi modulden sorayim" yukunu devreder; prompt/hafiza/oran siniri/hata modeli her modulde cogalir                              |
| **Tek ortak `platform.context_chunks` tablosu** (tum moduller oraya yazar)    | Gercekten daha basit — fan-out yok, skor kalibrasyonu sorunu yok. Ama modul verisi baskasinin tablosunda yasar; cross-schema FK yasak oldugu icin **cascade yazilamaz** ve silinen kayit AI hafizasinda kalir; retention kurallari carpisir |
| **Modul basina sabit retrieval kotasi** ("her modulden 4 parca")              | Bir musteri sorusunda en alakali 8 parcanin hepsi CRM'de olabilir; kota, en iyi kanitlari en kotuleriyle degistirirdi                                                                                                                       |
| **Yapisal veriyi de gommek** (sirket/firsat kartlarini embed etmek)           | Her guncelleme yeniden embedding demektir (maliyet + "chunk'siz kayit" riskinin katlanmasi); ve "hangi anlasmalar gecikti" sorusunun cevabi zaten deterministik SQL'dir — tahmine cevirmenin anlami yok                                     |
| **`crm:read` / `crm:write`** (modul bazli izin)                               | ADR-0025'in `resource:action` modelini ilk kullanimda bozar; "musteriyi gorur ama tutarlari gormez" gibi gercek talepler ifade edilemez hale gelir                                                                                          |
| **`delete`'i `write`'a katmak**                                               | Silme geri alinamaz ve AI hafizasindan da siler; "gorusme kaydeder" ile "musteriyi siler" ayni yetki degildir                                                                                                                               |
| **Ayri `crm.rate_limits` tablosu**                                            | Bes modulde bes ozdes tablo. ADR-0025'in "platform mekanizmayi sahiplenir, modul deklare eder" deseni zaten var                                                                                                                             |
| **Ayri `follow_ups` tablosu**                                                 | Turetilebilir bilgiyi kaliciya yazmak ikinci bir dogruluk kaynagi yaratir (ADR-0029/0030'da uc kez verilmis ayni karar); firsat kapandiginda takibi elle silmek gerekirdi                                                                   |
| **`next_follow_up_at timestamptz`**                                           | Tenant saat dilimi sorusunu v1'e sokar (kapsam disi). Takip bir takvim gunudur, bir an degil                                                                                                                                                |
| **Kisitlayici asama durum makinesi**                                          | Gercek satis hattinda geri gidis olagandir; engellemek kullaniciyi asamayi guncellememeye iter ve AI bayat veriyle cevap verir                                                                                                              |
| **Polimorfik `interactions` ebeveyni** (uc nullable FK + CHECK)               | En sik sorgu ("bu sirketle tum gecmis") bir CHECK kisiti ugruna dallanmali olurdu; dogal hiyerarsi ayni isi kisitsiz yapiyor                                                                                                                |
| **Bozulan katkicida tum istegi cokertmek**                                    | Bir modulun yavas sorgusu sistemin tamamini durdururdu                                                                                                                                                                                      |
| **Bozulan katkiciyi sessizce atlamak**                                        | Kullanici eksik ama kendinden emin bir cevap alirdi — projenin tekrar tekrar reddettigi sessiz hata                                                                                                                                         |

## Not — bu ADR Faz 4 kodunu degistiriyor

Mutlak Kural 2 ("istenmedikce refactor yapma") geregi bu kalemler **ayri ayri
onaya sunuldu ve hepsi onaylandi** (Product Owner, 2026-08-05). Hicbiri CRM'i
yazmak icin _teknik olarak_ zorunlu degildir — zorunlu olan, CRM'i **kod tekrari
uretmeden** yazmaktir.

| #   | Degisiklik                                                                | Etki                                                      | Alternatifi                            |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------- |
| 1   | `EmbeddingPort`/`LLMPort` → `shared/`, adapter'lar → `infrastructure/ai/` | Dosya tasima + import guncellemesi; **davranis degismez** | Kopyalamak                             |
| 2   | `chunking.ts` → `shared/`                                                 | Ayni; testler tasinir                                     | Kopyalamak                             |
| 3   | `knowledge.rate_limits` → `platform.rate_limits`                          | **Migration 1** + repository + RLS politikasi             | Bes modulde bes ozdes tablo            |
| 4   | `POST /knowledge/ask` → `POST /ask` + `platform/context` modulu           | **Breaking change** · `apps/web` guncellenir              | Modul basina `/ask` (§5'te reddedildi) |
| 5   | Knowledge, `RetrievalContributor` implement eder                          | Yeni sinif; mevcut retrieval kodu **yeniden kullanilir**  | —                                      |
| 6   | `knowledge:ask` → `context:ask`                                           | Permission adi; katalog satiri                            | Uc artik Knowledge'a ait degil         |
| 7   | `knowledge.conversations`/`messages` → `platform.*`                       | **Migration 2** (§5.2.1)                                  | Mutlak Kural 5 ihlali                  |

**Ucuncu migration** CRM semasinin kendisidir (§1). Yani bu is toplam **uc
migration** icerir: `platform.rate_limits`, `platform.conversations`/`messages`,
`crm.*`.

### Gecersiz kilinan onceki kararlar

Asagidakiler ADR-0029 ve ADR-0030'da **yerinde birakildi**; her birinin uzerine
bu ADR'ye isaret eden bir superseded notu eklendi. Tarih yeniden yazilmaz.

| Onceki karar                                     | Nerede             | Yeni hali                                               |
| ------------------------------------------------ | ------------------ | ------------------------------------------------------- |
| `POST /api/v1/knowledge/ask`                     | ADR-0029 §4        | `POST /api/v1/ask` (§5.2)                               |
| `knowledge.rate_limits` tablosu                  | ADR-0029 §5.1      | `platform.rate_limits` (§4.2)                           |
| `EmbeddingPort`/`LLMPort` Knowledge'in icinde    | ADR-0029 §3        | `shared/` + `infrastructure/ai/` (§4)                   |
| `knowledge:ask` permission'i                     | ADR-0029 (katalog) | `context:ask` (§5.3)                                    |
| `knowledge.conversations` / `knowledge.messages` | ADR-0030 §1.1      | `platform.conversations` / `platform.messages` (§5.2.1) |

**Degismeyenler** — kasitli olarak listeleniyor, cunku "her sey degisti"
izlenimi yanlis olurdu: chunking esigi ve algoritmasi · `vector(1536)` ·
HNSW/`vector_cosine_ops` · iki port ayrimi · `LLMPort.complete()` imzasi
(`history` dahil) · oran siniri **mekanizmasi** (sayac satiri, sabit saat
penceresi, T0 disciplini) · konusma hafizasi davranisi · gunluk rapor ·
onboarding · `businessos_report_worker` ve diger dar roller.

## Bu karar ne zaman yeniden gozden gecirilir?

- **Ucuncu modul (Finans) gelince:** `RetrievalContributor` portunun yeterliligi
  ilk kez gercek bir sinav verir — ozellikle **sayisal/tablosal** veri anlatisal
  veriden farkli davranir ve yapisal katkici deseni (§5.4) genellestirilmek
  zorunda kalabilir.
- **Katkici sayisi artinca:** fan-out'a zaman asimi butcesi ve muhtemelen
  **rerank** adimi gerekir; skor kalibrasyonu (bilinen sinir) o gun kapanir.
- **Ilk "hangi modulden geldi" karisikligi olcumlenince:** kaynak atfinin
  arayuzde nasil gosterildigi (bugun `reference: {kind, id}`) yeniden ele alinir.
- **Alan bazli izin talebi gelince** (`estimated_value`): ABAC katmani
  backlog'dan cikar (ROADMAP §1.1, ADR-0025).
- **Ozellestirilebilir asama talebi gelince:** enum → tablo gecisi; `MembershipRole`
  icin planlanan ayni yol.
- **Sirket adiyla klasik arama istenince:** ADR-0011'in FTS karari gundeme gelir
  — bir CRM'de bu, bilgi bankasindakinden daha temel bir beklentidir.
- **CRM domain event'inin ilk tuketicisi cikinca:** `OpportunityWon` ve
  kardesleri outbox'a yazilir.

---

## Not — Katman 2 geldi (2026-08-09)

[ADR-0032](0032-company-summary.md) bu ADR'nin uzerine **musteri ozetini**
ekledi. Iki kaydi buraya dusuyor:

1. **"LLM_PORT YOK — CRM completion cagirmaz" artik DOGRU DEGIL.** Bu ADR
   yazildiginda CRM yalnizca embedding uretiyordu ve `crm.module.ts` bunu
   acikca yaziyordu. Musteri ozeti varsayimi degistirdi; `crm.module.ts` artik
   `LLM_PORT` de saglıyor. Metin **silinmedi**, uzerine not eklendi.

2. **Ozet, `POST /ask` katkicilarina KATILMADI** ve bu bilincli: katkicilar
   ham gorusmeleri veriyor, ozeti de vermek ayni icerigi **ikinci kez**
   ozetlemek olurdu. Kapsam disi kaydi ADR-0032'dedir.
