# 0037 — Faz 5 / Modul 5: Belge / Sozlesme Yonetimi

- **Durum:** Onerildi
- **Tarih:** 2026-08-14
- **Karar veren:** Product Owner
- **Faz:** 5

> **Not.** Bu ADR yalnizca **karari** yazar; kod yazilmadi. Uygulama, asagidaki
> slice planina gore ayri ayri onaylanarak ilerler (CLAUDE.md Calisma Akisi).

## Baglam

Faz 5'in ilk dort modulu kapandi ve prod'da canli: CRM ([ADR-0031](0031-crm-module.md) +
[ADR-0032](0032-company-summary.md)) · Projeler ([ADR-0033](0033-projects-module.md)) ·
Finans ([ADR-0034](0034-finance-module.md)) · Randevu/Rezervasyon
([ADR-0035](0035-randevu-rezervasyon-modulu.md)). ROADMAP §3.5'in **besinci**
sirasi **Belge / Sozlesme Yonetimi**'dir. **Altinci sema.**

Zemin dort modulde sinandi ve bu ADR ondan cogunlukla **yalnizca tuketici**
olarak yararlanir:

| Ne                       | Projeler'de              | Finans'ta             | Randevu'da               | Belge'de                              |
| ------------------------ | ------------------------ | --------------------- | ------------------------ | ------------------------------------- |
| `EmbeddingPort`          | `shared/`'dan hazir      | `shared/`'dan hazir   | `shared/`'dan hazir      | **`shared/`'dan hazir**               |
| Chunk tablosu deseni     | Ikinci uygulama          | Ucuncu uygulama       | **Reddedildi** (§3)      | **Besinci uygulama — GERI DONUYOR**   |
| Oran siniri              | Bir satir deklarasyon    | Bir satir deklarasyon | Bir satir deklarasyon    | **Bir satir deklarasyon**             |
| Retrieval ucu            | Iki katkici              | Iki katkici           | Iki katkici              | **TEK katkici** (§8)                  |
| RLS + `FORCE` sablonu    | Ikinci kez               | Ucuncu kez            | Dorduncu kez             | **Besinci kez**                       |
| Kaynak bazli izin modeli | Ikinci kez               | Ucuncu kez (**dar**)  | Dorduncu kez (**genis**) | **Besinci kez (genis — §10)**         |
| Cross-modul referans     | ADR-0033 §2 deseni kurdu | Iki hedef, sifir yeni | **YENI** bir dizin yazdi | **IKI hedef, SIFIR yeni dizin** (§4)  |
| Modul imza rengi         | Kural sinandi            | Iki satir             | Iki satir + yeniden ad   | **Iki satir** (palet zaten olculmus)  |
| Object storage           | —                        | —                     | —                        | ⚠️ **ILK KEZ GEREKIYOR** (§5)         |
| Havuz taban kisiti       | —                        | —                     | ADR-0036'yi **dogurdu**  | ⚠️ **ADR-0036'nin ILK GERCEK SINAVI** |

Bu modul "besinci kez ayni sey" **degildir**. Gercekten yeni **dort** soru var:

1. **Proje ilk kez KENDI VERITABANI DISINA yaziyor.** (§5) Bugune kadar her
   modulun tum durumu PostgreSQL'deydi ve RLS ile korunuyordu. Bir dosya
   PostgreSQL'de yasayamaz; yani bu modul **ikinci bir kalici durum yuzeyi**
   aciyor ve onunla birlikte iki yeni soru geliyor: tenant izolasyonu orada
   nasil saglanir, ve iki yer arasindaki tutarsizlik (yetim nesne / nesnesiz
   kayit) nasil ele alinir. ROADMAP §2.3'un _"dosya eki gundeme gelince"_ diye
   erteledigi **object storage karari bu modulle zorunlu hale geliyor** ve
   [ADR-0009](0009-storage-port.md)'un acikca acik biraktigi saglayici secimi
   **burada kapaniyor**.
2. **Icerik ilk kez KULLANICININ YAZDIGI BIR METIN DEGIL.** (§6) Onceki bes
   anlamsal kaynagin hepsinde metni kullanici bir forma yazdi; burada metin bir
   **dosyanin icinden cikarilir** ve cikarim **basarisiz olabilir** (taranmis
   PDF). Yani "vektorsuz kayit" bu modulde ilk kez **veri turunun** dogal bir
   sonucudur, bir ariza ya da bir yaris kosulu degil.
3. **ADR-0035 §3'un "hayir"i ILK KEZ TERSINE DONUYOR.** (§3) Randevu chunk
   tablosunu bilincli olarak reddetmisti; Belge onu **geri getirir**. Iki karar
   celismiyor — ayni olcut (metin uzunlugu ve parcalanabilirligi) iki farkli
   cevap veriyor, ve bu, olcutun gercekten bir olcut oldugunun kanitidir.
4. **ADR-0036'nin taban kisiti ilk gercek yukunu tasiyacak.** (§8.2)
   [ADR-0036](0036-context-retrieval-kota.md) §3 su cumleyi yazdi:
   _"ADR-0037 bu kararin USTUNE oturur ve onu DEGISTIRMEZ."_ Bu modul **altinci
   anlamsal kaynagi** ekliyor ve o cumlenin sinavi bu modulun kapanis
   denetiminde yapilacak.

> ⚠️ **Bu ADR'nin cizdigi sinir bir ARSIV sinirdir.** Belge v1 bir dosyayi
> **saklar, baglar ve aranabilir kilar**: kim yukledi, ne zaman, hangi kisiye
> veya projeye ait, icinde ne yaziyor. E-imza, versiyon gecmisi, onay akisi,
> sozlesme sablonu ve yenileme hatirlatmasi **kapsam disidir** (§12). Bu bir
> asama degil bir **sinirdir**; genisletme talebi ayri bir ADR ister —
> ADR-0034'un muhasebe siniri ve ADR-0035'in takvim siniriyla ayni disiplin.

## Karar

### 1. Yeni `documents` semasi

Mutlak Kural 5 geregi Belge kendi semasina sahiptir. `platform` disindaki
**altinci** sema (`knowledge`, `crm`, `projects`, `finance`, `appointments`,
`documents`). Tum tablolar RLS `ENABLE` + `FORCE` tasir (MT §12.2 standart
sablonu), `tenant_id uuid NOT NULL REFERENCES platform.tenants(id)` icerir,
bilesik index'lerde `tenant_id` **daima ilk kolondur** ve unique kisitlar
tenant-scoped'tir (MT §12.3). **Bu paragrafta yeni bir karar yoktur.**

| Tablo                       | Kolonlar                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `documents.documents`       | `id`, `tenant_id`, `original_filename` (`text`, NOT NULL), `storage_key` (`text`, NOT NULL, **tenant-scoped UNIQUE**), `mime_type` (`text`, NOT NULL), `size_bytes` (`bigint`, NOT NULL), `label` (`text`, **nullable** — §2), `crm_contact_id` (nullable, **FK YOK** — §4), `project_id` (nullable, **FK YOK** — §4), `created_by_user_id` (**FK YOK**), `created_at`, `updated_at` |
| `documents.document_chunks` | `id`, `tenant_id`, `document_id` (**`ON DELETE CASCADE`**), `chunk_index` (`integer`, NOT NULL), `content` (`text`, NOT NULL), `embedding` (`vector(1536)`, nullable), `created_at` · **`UNIQUE (tenant_id, document_id, chunk_index)`**                                                                                                                                             |

Notlar:

- `embedding` uzerinde **HNSW**, `vector_cosine_ops` — bes kez uygulanmis ayni
  index karari.
- Index'ler: `(tenant_id, created_at DESC)` (liste — modulun birincil okuma
  yolu), `(tenant_id, crm_contact_id)` ve `(tenant_id, project_id)` (bagli
  kayit sorgulari), `(tenant_id, label)` (etiket filtresi — §2).
- `created_by_user_id` FK'siz — `interactions.author_user_id` /
  `transactions.created_by_user_id` / `appointments.created_by_user_id` ile
  ayni desen ve ayni gerekce.
- ⚠️ **`storage_key` tenant-scoped UNIQUE'tir** ve bu bir suslemedir degil bir
  **korkuluktur**: iki satirin ayni nesneyi isaret etmesi, birini silmek
  digerini **sessizce bozardi** (§7'nin "yeni dosya = yeni key" karari bunu
  zaten garanti eder, kisit onu veritabani seviyesinde kilitler).
- `size_bytes` `bigint` — `integer` 2 GB'da tasar ve sinir bugun 20 MB olsa da
  (§6.1) kolonun tipi bir urun ayarina baglanmaz.

### 2. Etiket SERBEST METINDIR — sabit enum YOK, tenant sozlugu de YOK

**Karar: `label text NULL` — kullanicinin kendi yazdigi tek bir serbest
etiket.**

**(a) Neden sabit enum degil.** Bir enum yazmak, on iki sektorun belge
turlerini bugunden bilmeyi gerektirir: bir hukuk burosunun "vekaletname"si, bir
insaat firmasinin "hakedis"i ve bir ajansin "brief"i ayni listede yasayamaz.
Sabit bir liste kullaniciyi **sahte kategoriye** iterdi — ADR-0033'un `tasks.
project_id` icin yazdigi ayni ders (_"zorunlu olsaydi kullanici sahte 'Genel'
projeler acardi"_), bu kez sozluk tarafinda. Sahte etiket yalnizca kotu bir
kayit degildir: §8'in baglam basligina girer ve **AI'a yanlis bilgi ogretir**.

**(b) Neden ADR-0034'un tenant-tanimli sozlugu de degil.** Finans kategorileri
ayri bir tabloya cikti cunku oradaki sozlugun **yapisal bir isi** vardi: yon
(`income`/`expense`) kategoride tutulur ve bilesik FK ile zorlanir. Belge
etiketinin boyle bir isi **yoktur** — hicbir hesabin, hicbir kisitin, hicbir
katkicinin dogrulugu etiketin sabitligine dayanmaz. Ayri bir tablo acmak
kullaniciya bir **yonetim ekrani** borclandirirdi (etiket olustur, yeniden
adlandir, kullanimdakini silme) ve karsiliginda hicbir sey kazandirmazdi.

**(c) Bedeli acikca kaydediliyor: yazim farklari birikir.** "Sozlesme",
"sozlesme" ve "Sözleşme" uc ayri etikettir. v1 iki telafi kurar ve **ucuncusunu
kurmaz**:

- Yazarken: `trim` uygulanir, bos dize **NULL'a** cevrilir (bos etiket diye bir
  sey yoktur), uzunluk sinirlanir.
- Okurken: etiket filtresi **buyuk/kucuk harf duyarsizdir**.
- ⚠️ **Otomatik birlestirme / oneri YOKTUR.** Arayuz mevcut etiketleri
  gosterebilir (bu bir frontend isidir), ama sunucu iki farkli yazimi **ayni
  sey saymaz**. Birlestirmek, kullanicinin kastini tahmin etmektir.

**(d) Tek etiket, coklu degil.** Coklu etiket ayri bir tablo (`document_labels`)
ve bir cok-a-cok iliski demektir. v1'de tek kolon yeterlidir ve yon **tektir**:
tek kolondan coklu tabloya gecmek bir migration'dir, tersi veri kaybidir.

### 3. ⚠️ CHUNK TABLOSU GERI DONUYOR — ADR-0035 §3'un TAM TERSI

**Karar: `documents.document_chunks` acilir. Dort modulde (`knowledge.note_chunks`
· `crm.interaction_chunks` · `projects.progress_note_chunks` ·
`finance.commentary_chunks`) kanitlanmis desen **birebir** uygulanir.**

Bu, ADR-0035'in bir onceki modulde verdigi karara **acikca zit** bir karardir ve
zitligi gizlenmiyor. Iki karar celismiyor cunku **ayni olcut** iki farkli cevap
veriyor:

| Soru                                    | Randevu (`service_note`)                  | Belge (dosya icerigi)                                         |
| --------------------------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| Metin ne kadar uzun?                    | Bir-iki cumle                             | **On sayfalik bir sozlesme**                                  |
| Ust siniri kim koyuyor?                 | Biz — ve `TARGET_CHUNK_CHARS`'a esitlendi | **Kimse.** Dosyanin uzunlugunu kullanici degil belge belirler |
| Parcalayici kac parca uretirdi?         | **Her zaman 1**                           | **On, yuz, uc yuz**                                           |
| Tek vektor neyi temsil ederdi?          | Metnin kendisini                          | **Butun sozlesmenin ortalamasini** — yani hicbir seyi         |
| Ikinci tablonun bedeli neyi satin alir? | Hicbir sey (bir join maliyeti)            | **Modulun var olus sebebini**                                 |

ADR-0035 §3a chunking'in **neyi cozdugunu** yazmisti: _"uzun anlatisal
govdeleri boler; tek bir vektor, uzun metnin yalnizca ortalamasini temsil eder
— spesifik bir cumle kaybolur."_ Bir sozlesme tam olarak budur:
_"fesih bildirimi otuz gun oncesinden yapilir"_ cumlesi, on sayfalik bir metnin
tek vektorunde **kaybolur**. Bu modulun tek isi o cumleyi bulabilmektir.

⚠️ **Bu bir icat degil, besinci uygulamadir.** Desenin butun parcalari
degistirilmeden alinir: `parent_id` + `chunk_index` + `content` + `embedding` ·
`ON DELETE CASCADE` · tenant-scoped `UNIQUE (document_id, chunk_index)` ·
`tenant_id` denormalizasyonu · retention listesinde **ebeveyn** satiri (§ Bilinen
sinirlar). `shared/chunking.ts` **oldugu gibi** kullanilir; yeni bir parcalama
algoritmasi yazilmaz.

> **Iki ADR'nin birlikte urettigi kural** — bundan sonraki anlatisal modullerin
> okuyacagi sey budur:
>
> **Chunk tablosu, metnin ust sinirini KULLANICI DEGIL VERININ KENDISI
> belirliyorsa acilir.** Sinirini bizim koyabildigimiz (ve
> `TARGET_CHUNK_CHARS`'a esitleyebildigimiz) bir alan chunk tablosu istemez;
> disaridan gelen bir govde her zaman ister.

### 4. Cross-modul referans: IKI baglanti, SIFIR yeni dizin

`documents.documents` **iki** opsiyonel yumusak referans tasir ve **ikisi de
birbirinden bagimsizdir**:

| Kolon            | Hedef               | Public interface                          | Kapi izni      |
| ---------------- | ------------------- | ----------------------------------------- | -------------- |
| `crm_contact_id` | `crm.contacts`      | `crm.public.ts` — `ContactDirectory`      | `contact:read` |
| `project_id`     | `projects.projects` | `projects.public.ts` — `ProjectDirectory` | `project:read` |

**Ikisi de opsiyonel ve BAGIMSIZ.** Bir belge ikisine birden, yalnizca birine ya
da **hicbirine** bagli olabilir. Bu, ADR-0033 §2'nin `tasks.project_id`
karariyla ayni gerekcedir: bir sozlesme tanimi geregi bir kisiye ya da projeye
ait **degildir** (sirket ana kira sozlesmesi hicbirine ait degildir), ve
zorunlu kilmak kullaniciyi sahte baglantilar kurmaya iterdi.

ADR-0033 §2'nin **uc parcali deseni degistirilmeden** uygulanir: (a) FK yok
cunku yazilamaz (Mutlak Kural 5) · (b) ad denormalize **edilmez**, public
interface'ten okunur · (c) okuma hedef kaynagin iznine baglidir ve kapi
**arayuzun icindedir** · (d) sarkan isaretci tolere edilir, okuyan her yol
dayanikli yazilir.

#### 4.1 ⚠️ BU MODUL CRM'E DE PROJELER'E DE HIC DOKUNMUYOR

ADR-0035 §4.2, ADR-0034'un _"`crm.public.ts` bu iste TEK SATIR degismez"_
cumlesini **yanlislamis** ve kurali netlestirmisti:

> - yeni bir **TALIP** eklendiginde **bu dosya degismez**,
> - yeni bir **KAYNAK TURU** talep edildiginde o kaynagin **sahibi** modul
>   kendi dizinini yazar.

**Belge yalnizca bir TALIPTIR — ustelik iki dizin icin birden.** Ihtiyac
duydugu iki arayuz de **zaten yazilmis**: `ContactDirectory` Randevu'da
(ADR-0035 §4), `ProjectDirectory` Finans'ta (ADR-0034 §4). Yani bu modul
`crm.public.ts` ve `projects.public.ts` dosyalarinin **tek satirina
dokunmadan** iki modulun verisine baglanir.

Bunun **olculebilir** sonucu su: **cross-modul referans icin ayri bir slice
GEREKMIYOR** (§ Uygulama plani). ADR-0033 ve ADR-0035 o isi Mutlak Kural 1-2
geregi ayirmisti; burada ayrilacak bir is yok, cunku **baska modulde sifir
degisiklik** var. Desenin ise yaradiginin olcusu tam olarak budur ve ilk kez
**hicbir sey yapilmayarak** gosteriliyor.

⚠️ Ayni sebeple **`findNames(ids, role) -> ReadonlyMap<id, name>` sozlesme
sekli besinci ve altinci kez kullaniliyor** ama **yedinci kez yazilmiyor**.
ADR-0034 §4.1'in genellestirme reddi bu modulde **tekrar tartisilmadi**: ortak
bir yardimci, iki hazir dizini birlestirmekten baska bir sey yapmazdi ve izin
kapisini yine ya cagirana (sizinti) ya `shared/`'a (Mutlak Kural 6) devrederdi.

#### 4.2 Bagimlilik grafigi — alti kenar, hala DAG

```
Projeler → CRM
Finans   → CRM
Finans   → Projeler
Randevu  → CRM
Belge    → CRM         ← YENI
Belge    → Projeler    ← YENI
```

**Donguselligin kaniti bir siralamadir:** dugumler su sekilde katmanlanir ve
**her kenar yuksek katmandan dusuk katmana** gider —

```
katman 0:  CRM
katman 1:  Projeler          (→ CRM)
katman 2:  Finans, Randevu, Belge
```

Katman 2'deki hicbir modul digerini bilmez; katman 1 yalnizca katman 0'a bakar;
katman 0 hicbir seye bakmaz. Geriye giden tek bir kenar yoktur, dolayisiyla
dongu de yoktur. ⚠️ **Ters yon (CRM'in kisi detayinda o kisinin belgelerini
gostermesi, ya da proje detayinda projenin sozlesmelerini gostermesi) bir modul
dongusu kurar**; cozum `forwardRef` **degildir** — projede bir kez yasandi
(Tenant ↔ Identity) ve cozum **ucuncu bir modul** oldu (`platform/session`).
Ayni cozum uygulanir.

⚠️ **Sarkan isaretci sayisi UCTEN BESE cikti** (`projects.company_id` ·
`finance.project_id` · `appointments.crm_contact_id` · **`documents.crm_contact_id`**
· **`documents.project_id`**). Karar aynen gecerli: veri bozulmasi degildir, her
okumada tespit edilir, ve `contactName: null` / `projectName: null` gelince
arayuz **hicbir sey yazmaz** — null'in uc sebebi (hic bagli degil · silinmis ·
izin yok) **ayirt edilmez** ve "silinmis" yazmak bir kaydin varligini sizdirirdi.

### 5. Object storage: **Cloudflare R2** — ADR-0009'un acik kalemi KAPANIYOR

⚠️ **Bu paragraf yeni bir port icat etmiyor.** [ADR-0009](0009-storage-port.md)
soyutlamayi **2026-07-20'de** karara baglamisti ve durumunu acikca su sekilde
yazmisti: _"Kabul edildi (soyutlama) · Saglayici secimi ACIK"_, yeniden gozden
gecirme kosulu _"production saglayicisi secilirken"_. **Bu modul o kosulu
cekiyor.** Yeni olan sey **saglayici secimi** ve portun **ilk implementasyonudur**.

**Karar: production saglayicisi Cloudflare R2'dir.**

**(a) Neden R2.** Uc gerekce, sirasiyla:

- **Egress ucretsiz.** ADR-0009'un gerekce bolumu tam olarak bunu yazmisti:
  _"egress maliyeti saglayicilar arasinda kat kat degisiyor."_ Bu modulde her
  belge goruntuleme bir indirmedir ve §5.4'un karari geregi trafik **API
  uzerinden** akar — yani egress, kullanim arttikca dogrudan buyuyen tek
  kalemdir. S3'te bu kalem sinirsiz buyur; R2'de **sifirdir**.
- **S3-uyumlu API.** Adapter standart bir S3 istemcisiyle yazilir; saglayici
  degisimi bir endpoint ve kimlik bilgisi meselesidir. Kilitlenme yuzeyi,
  ADR-0009'un zaten kabul ettigi "S3-uyumlu ortak payda"nin disina cikmaz.
- **Lokal ve CI karsiligi var.** MinIO ayni API'yi konusur (§5.5), yani
  gelistirme ve test gercek bir bulut hesabina bagimli **olmaz** — ADR-0009'un
  ikinci gerekcesi.

⚠️ **Bedeli acikca:** Cloudflare bugun projenin hicbir yerinde kullanilmiyor,
yani bu **yeni bir saglayici hesabi ve yeni bir sir seti** demektir (Railway
prod dahil). Ayrica R2'nin gelismis ozellikleri (yasam dongusu politikalari,
olay tetikleyicileri) ADR-0009'un yazdigi gibi **soyutlamanin disindadir** ve
altyapi tarafinda ayrica yonetilir.

#### 5.1 `StoragePort` `shared/`'a girer, adapter `infrastructure/storage/`'a

`shared/storage.port.ts` — `EmbeddingPort` ve `LLMPort` ile **birebir ayni
yerlesim ve ayni katilikta**: framework'suz, NestJS import'suz, saglayici
kelimesi gecmez.

```ts
export interface StoragePort {
  put(input: { key: string; body: Buffer; contentType: string }): Promise<void>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}

export class StorageFailedError extends Error {} // §9
```

**Neden `shared/`, modulun icinde degil.** Bugun tek tuketicisi Belge'dir ve
"once modulde dursun" savunulabilir bir itirazdir — ama ikisi de yanlis olurdu:

- `EmailPort` da `shared/` altindadir ve **tek** tuketicisi vardir (Identity).
  Yerlesim tuketici sayisiyla degil, **portun ne oldugu** ile belirlenir:
  saglayici degistirilebilir bir dis yetenek `shared/` + `infrastructure/`
  ikilisine aittir.
- ADR-0009 bu portu **platform seviyesinde** karara bagladi ve iki modul daha
  onu talep edecek (Teklif/Fatura'nin uretecegi PDF, IK'nin ozluk dosyasi).
  Faz 4'un dersi tam tersi yondeydi: Knowledge port'lari **icinde tuttu** ve
  ADR-0031 onlari disari tasimak zorunda kaldi.

Adapter'lar `infrastructure/storage/`'a girer (`infrastructure/ai/` ile ayni
sekil): **R2** (production) ve **MinIO** (lokal/CI) — ikisi de ayni S3 istemcisi
uzerinden, farkli endpoint ile.

#### 5.2 Anahtar duzeni ve "her yukleme YENI bir key"

ADR-0009'un yazdigi duzen **oldugu gibi** uygulanir:

```
tenants/<tenantId>/documents/<documentId>/<uuid>-<sanitized-filename>
```

- ⚠️ **`tenantId` anahtarin ONUNDEDIR** ve bu bir suslemedir degil: nesne
  deposunda **RLS yoktur**. Tenant izolasyonunun tek mekanik dayanagi anahtarin
  kendisidir. Bir okuma yolu anahtari **veritabanindan** almak zorundadir —
  istemciden gelen bir anahtarla asla nesne okunmaz (aksi halde bir tenant,
  baska bir tenant'in anahtarini tahmin ederek okuyabilirdi).
- ⚠️ **Her yukleme YENI bir anahtar uretir; ayni anahtarin uzerine YAZILMAZ.**
  §7'nin dosya degisimi kararinin dogrudan sonucu. Uzerine yazmak (a) nesne
  depolarinin okuma-sonrasi-yazma tutarliligina, (b) araya giren CDN/tarayici
  onbelleklerine guvenmek demektir — ikisi de **sessiz** yanlis uretir:
  kullanici yeni dosyayi yukler, eskiyi indirir ve bunu **fark etmez**.
- Dosya adi anahtarda **temizlenir** (`sanitize`), ama `original_filename`
  kolonunda **oldugu gibi** saklanir; kullaniciya gosterilen ad odur.

#### 5.3 ⚠️ Iki dogruluk kaynagi var — SIRA bilincli olarak secilir

ADR-0009 bunu bilinen bir bedel olarak yazmisti: _"nesne depolama
kaynak-of-truth degildir: her nesnenin metadata'si PostgreSQL'de tutulur, yani
iki yerde tutarlilik saglanmasi gerekir."_ Iki yer arasinda **atomik islem
yoktur**, dolayisiyla soru "tutarsizlik olur mu" degil, **"hangi tutarsizlik
olsun"**dur.

**Karar: her zaman YETIM NESNE tarafinda kalinir; NESNESIZ KAYIT asla.**

| Islem       | Sira                                                                                                          | Yarida kalirsa kalan                             |
| ----------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Yukleme** | (1) dogrula → (2) metni cikar (§6) → (3) **R2'ye yaz** → (4) **DB satiri commit**                             | R2'de **yetim nesne** — gorunmez, temizlenebilir |
| **Degisim** | (1) yeni nesneyi yaz → (2) DB'de `storage_key`i degistir + chunk'lari sil (tek tx) → (3) **eski nesneyi sil** | **Yetim nesne** (eski dosya)                     |
| **Silme**   | (1) **DB satirini sil** (chunk'lar cascade) → (2) R2 nesnesini sil                                            | **Yetim nesne**                                  |

Gerekce simetrik degildir ve bu yuzden karar kolaydir: **yetim nesne
gorunmez bir maliyettir** (fatura), **nesnesiz kayit ise gorunur bir
bozukluktur** — kullanici listede duran bir belgeye tiklar ve indiremez, ve bu
hata **her denemede tekrarlanir**. Ters sira (once nesneyi sil, sonra DB) tam
olarak bunu uretirdi.

⚠️ **Yetim nesne temizligi v1'de YOKTUR** ve bu bir bilinen sinirdir (§ Bilinen
sinirlar). Dogru cozumu bir **isaretleme + gecikmeli temizlik** isidir ve
retention karariyla (ROADMAP §8.5) **ayni gun** verilmelidir; ikisi ayni
mekanizmayi paylasir.

#### 5.4 Indirme API uzerinden STREAM edilir — presigned URL YOK

**Karar: `GET /api/v1/documents/:id/content` dosyayi API uzerinden stream eder.
Imzali (presigned) URL v1'de URETILMEZ.**

Presigned URL standart ve performansli bir cozumdur; reddedilme sebebi
**yetkilendirmedir**:

- Imzali bir URL, uretildigi andan gecerlilik suresi bitene kadar **kimlik
  dogrulamasi olmadan** calisir. Yani belge erisimi, ADR-0025'in policy
  engine'inden cikip **bir dizeye** devredilir; o dize bir sohbete
  yapistirildiginda izin sistemi devre disi kalir.
- Tenant izolasyonu da ayni dizeye devredilir. Bugun izolasyonun iki bagimsiz
  dayanagi var (RLS + anahtardaki `tenantId`); imzali URL ucuncu ve **en
  zayif** dayanagi tek basina yeterli hale getirirdi.
- Bedeli olculmustur ve kucuktur: R2'de **egress ucretsizdir** (§5a), yani
  aradan gecmenin bedeli bant genisligi degil **sunucu zamanidir** — ve bu,
  akis (stream) ile sabit bellekte yapilir.

⚠️ Yeniden degerlendirme kosulu acik: **buyuk dosyalar veya yuksek es zamanli
indirme** olculdugu gun presigned URL yeniden gundeme gelir — ama o gun,
kisa omurlu ve tek kullanimlik URL uretimi **ayri bir karardir**.

#### 5.5 Lokal ve CI: MinIO — `docker-compose.yml` degisir

Gelistirme ve entegrasyon testleri gercek bir R2 hesabina **bagimli olamaz**
(ADR-0009 gerekce). `docker-compose.yml`'e MinIO servisi eklenir ve
`STORAGE_*` degiskenleri `env.schema.ts`'te Zod ile dogrulanir (saglayici,
endpoint, bucket, anahtar cifti).

> ⚠️ **KALICI DERSIN GECERLI OLDUGU YER.** CLAUDE.md: _"`docker-compose.yml`'deki
> `image` degistiginde calisan container kendi kendine guncellenmez"_ ve
> _"`docker/postgres/init/` betikleri yalnizca bos veri dizininde calisir."_
> **Yeni bir servis eklemek ayni siniftandir**: `docker compose up -d`
> calistirilmadan MinIO ayaga kalkmaz ve modulun her ucu, sebebi belirsiz bir
> baglanti hatasiyla duser. Slice 1'in ilk adimi bu komuttur.

⚠️ **Prod tarafinda bu, Railway'e uc yeni sir demektir** (hesap, anahtar cifti,
bucket). CLAUDE.md'nin prod kaydi geregi: sirlar **once ve `--skip-deploys`
ile** aktarilir, dagitim en son tetiklenir — `NODE_ENV=production` gecisinde
uygulanan ayni sira.

### 6. Metin cikarimi: yalnizca PDF ve DOCX — OCR YOK

**Karar: v1 `application/pdf` ve `.docx`
(`application/vnd.openxmlformats-officedocument.wordprocessingml.document`)
kabul eder; metni sunucuda otomatik cikarir ve parcalar. Baska hicbir tur kabul
EDILMEZ.**

#### 6.1 Allowlist ve boyut siniri SUNUCUDA zorlanir

| Kisit        | Deger                           | Asilirsa                     |
| ------------ | ------------------------------- | ---------------------------- |
| MIME turu    | PDF · DOCX (**allowlist**)      | **415** (desteklenmeyen tur) |
| Dosya boyutu | **20 MB**                       | **413**                      |
| Parca sayisi | **300** (`MAX_DOCUMENT_CHUNKS`) | **422**                      |

- ⚠️ **MIME turu ICERIKTEN tespit edilir, uzantiya ve istemcinin gonderdigi
  `Content-Type` basligina GUVENILMEZ.** Ikisi de istemci tarafindan serbestce
  yazilabilir; bir ayristiriciya yanlis turde bir govde vermek, ayristiricinin
  saldiri yuzeyini acmanin en kisa yoludur.
- ⚠️ **Neden allowlist, "her seyi kabul et ama sadece PDF/DOCX'i indeksle"
  degil.** Ikinci secenek daha esnek gorunur ve **sessizce yanlistir**: xlsx
  yukleyen kullanici dosyasinin arama disinda kaldigini **hicbir yerden
  ogrenemez**; ekranda digerleriyle ayni gorunur. Ayrica her yeni tur yeni bir
  ayristirici bagimliligi demektir. **415 acik bir cevaptir** — ADR-0035 §3d'nin
  "sessiz kirpma yerine 422" karariyla ayni disiplin.
- **Neden 300 parca.** Bir belge **tek istekte** onlarca embedding cagrisi
  uretir (§10'un oran siniri notu). Sinirsiz birakmak, tek bir yuklemenin
  dakikalarca suren ve sinirsiz maliyet ureten bir istege donusmesi demektir.
  Sinir asildiginda **kayit acilmaz ve dosya R2'ye YAZILMAZ** — cunku dogrulama
  §5.3'un sirasinda **yuklemeden once** yapilir (cikarim istegin govdesinde,
  bellekte gerceklesir). Reddedilen hicbir dosya depoya girmez.

#### 6.2 Ayristirici bir KUTUPHANEDIR — ve bu, §7'nin takvim reddiyle celismez

PDF ve DOCX ayristirmasi icin kutuphane kullanilir. ADR-0035 §7 bir takvim
kutuphanesini, ADR-0031 `recharts`'i reddetmisti; **bu red buraya
uygulanmaz** ve sebebi gerekcenin kendisindedir:

| Reddin gerekcesi (ADR-0035 §7a)      | Ayristirici icin gecerli mi                                   |
| ------------------------------------ | ------------------------------------------------------------- |
| "Yuzeyin %90'i kullanilmayacak"      | ❌ Yuzeyin **tamami** kullanilir: bir dosya, bir metin        |
| "Tasarim dili catisir" (kendi CSS'i) | ❌ **Arayuzu yoktur** — sunucu tarafinda calisir              |
| "`--accent` override'i islemez"      | ❌ Ilgisiz                                                    |
| "Bagimlilik yuzeyi buyuk"            | ✅ Gecerli — bu yuzden **port arkasina** alinir (§6.2 devami) |

Bir PDF ayristiricisini kendimiz yazmak **ciddi bir onerinin bile konusu
degildir**. Secim olcutu serttir ve slice'i baglar: **saf JavaScript, native
binding yok** (Railway derlemesini kirmasin), **aktif bakim**, **buffer'dan
okuyabilme** (dosyayi diske yazmadan). Bugunku en guclu adaylar PDF icin
`pdfjs-dist`, DOCX icin `mammoth`'tur.

**Cikarim bir PORT arkasindadir — ama `shared/`'da DEGIL.**
`TextExtractorPort` modulun kendi `application/` katmaninda yasar. Ayrim
bilinclidir ve §5.1'in kuralinin **diger yuzudur**: `StoragePort` ve
`EmbeddingPort` birden fazla modulun kullanacagi **platform yetenekleridir**;
metin cikarimi bugun **yalnizca bu modulun** isidir. `shared/`'a bugunden
koymak, Faz 4'un hatasinin **tersini** yapmak olurdu — kimsenin kullanmadigi
bir seyi kernele koymak. Ikinci tuketici cikarsa (Faz 6'nin fatura okuma'si)
ADR-0031'in yaptigi tasima yapilir.

#### 6.3 Bos cikarim MESRU bir sonuctur — sessiz basarisizlik DEGIL

**Taranmis (yalnizca goruntu iceren) bir PDF'ten metin cikmaz.** Bu bir hata
degildir; dosyada gercekten metin yoktur.

**Karar: belge normal sekilde YUKLENIR ve KAYDEDILIR; chunk uretilmez, arama
onu bulamaz. Islem BASARILIDIR (201).**

Bu, ADR-0035 §3c'nin _"notsuz randevu"_ karariyla **ayni mantiktir**:
"vektoru olmayan kayit" bu modulde bir **ariza degil normaldir**. Dosya
saklanir, indirilir, kisiye/projeye baglanir, etiketlenir — yalnizca **icerigi
aranamaz**.

⚠️ **Sessiz olmamasini saglayan sey arayuzdur.** Cevap, cikarilan parca
sayisini (`chunkCount`) **acikca doner** ve `0` geldiginde arayuz bunu
gorunur kilar (_"Bu belgenin metni okunamadi; icerigi aramalarda
bulunamayacak"_). Bu cumle yazilmazsa karar **sessiz basarisizliga** doner:
kullanici sozlesmesini yukledigini sanir, aylar sonra aradiginda bulamaz ve
sebebini asla ogrenemez.

**OCR v1'de YOKTUR** (§12). Yapilabilirdi ama ayri bir dis servis, ayri bir
maliyet kalemi ve ayri bir gecikme profili demektir — ve dogru zamani, taranmis
belgelerin gercekten **olculdugu** gundur.

### 7. Versiyon gecmisi YOK — yeni dosya ESKISINI DEGISTIRIR

**Karar: `PUT /api/v1/documents/:id/file` yeni dosyayi yukler; eski nesne ve
belgenin TUM chunk'lari SILINIR, yenisiyle degistirilir. Versiyon tablosu
ACILMAZ.**

Ayni disiplinin ucuncu uygulamasi: ADR-0034 `transactions` icin (yanlis tutar
duzeltilebilmeli), ADR-0035 `appointments` icin (randevu ertelenir) ayni karari
verdi. Engellemek kullaniciyi **sahte kayitlar uretmeye** iterdi — burada
"Sozlesme_v2_SON_FINAL.pdf" adiyla ikinci bir belge acmaya, yani versiyon
karmasasini yazilimin disinda ve **daha kotu** bir bicimde kurmaya.

Versiyon **tablosunun** reddi ayri bir karardir ve gerekcesi sudur: gercek bir
versiyon gecmisi yalnizca bir tablo degildir — versiyonlar arasi fark,
"hangi versiyon yururlukte", eski versiyonun aranabilir kalip kalmayacagi
(kalirsa **havuz iki kat kirlenir**), ve saklama suresi sorularini beraberinde
getirir. Yarim bir versiyon gecmisi, hic olmamasindan **kotudur**.

⚠️ Sonuclari acikca:

- **Eski dosya geri getirilemez.** Yanlis dosya yuklendiginde onceki icerik
  kaybolur (§5.3'un yetim nesnesi bir yedek **degildir**; adresi hicbir yerde
  yazmaz).
- Chunk'lar **tumuyle** silinip yeniden uretilir — kismi guncelleme yoktur.
  ⚠️ Yeniden uretim, degisim use-case'inin **ayni akisinda** yapilir; unutulursa
  hata **sessizdir**: arama **eski dosyanin** icerigini bulur ve kullaniciya
  yeni dosyayi gosterir. Bir entegrasyon testi bunu kilitler.
- `original_filename`, `mime_type`, `size_bytes` ve `storage_key` **birlikte**
  guncellenir; dordu tek bir dosyanin ozellikleridir ve ayrisirlarsa liste
  ekrani yalan soyler.

### 8. TEK katkici — yalnizca ANLAMSAL

ADR-0031 §5.4'un deseni besinci kez uygulanir, ama **ilk kez tek katkiciyla**:

| Katkici     | Kaynak                      | `contributionKind` | Nasil calisir              | Izin            |
| ----------- | --------------------------- | ------------------ | -------------------------- | --------------- |
| `documents` | `documents.document_chunks` | **`'semantic'`**   | pgvector benzerlik sorgusu | `document:read` |

**Yapisal katkici YOKTUR ve bu bilincli bir karardir.** Onceki dort modulun
hepsi ikinci bir yapisal katkici kaydetti cunku her birinin **turetilebilir bir
DURUMU** vardi: takipte gecikmis firsat, durgun proje, nakit akisi ozeti,
yaklasan randevu. **Bir belgenin boyle bir durumu yoktur.** Bir sozlesme
"gecikmis" ya da "durgun" olmaz; yalnizca **vardir**.

Zorlanabilecek her aday ya baska bir modulun isi ya da §12'nin kapsam
disidir:

- _"Suresi dolmak uzere olan sozlesmeler"_ → bir **bitis tarihi** kolonu ve bir
  **yenileme** kavrami ister; ikisi de v1 kapsaminin disinda (§12) ve dogru
  yapildiginda bir **hatirlatma** (Queue karari) sorusudur.
- _"En cok belge hangi projede"_ → bir sayim, bir hafiza degil. AI'a hicbir sey
  ogretmez.

⚠️ **Uydurma bir yapisal katkici yazmak, ADR-0036'nin taban kisitindan
haksiz bir yuva calmak olurdu** — taban yapisal kaynaklara _garanti_ verdigi
icin, "yapisal" etiketi bir **imtiyazdir**. Bos bir ozeti yapisal ilan etmek,
o imtiyazi anlamsizlastirirdi.

`contributionKind: 'semantic'` **zorunlu alandir** (ADR-0036 §5) ve unutulmasi
bir **derleme hatasidir** — o kararin altinci modulde tuttugunun ilk kaniti bu
satirdir.

#### 8.1 Baglam basligi: dosya adi + etiket — BAGLI VARLIK ADI KONMAZ

Gomulen metin ciplak parca **degildir**; onune baglam basligi konur — projede
besinci kez ayni karar:

```
[Belge · Ofis Kira Sozlesmesi 2026.pdf · sozlesme] ... parcanin metni ...
```

Uc parca: **sabit etiket** + **dosya adi** + **varsa kullanicinin etiketi**.

⚠️ **Bagli kisinin ve projenin ADI basliga GIRMEZ** — ve bu, ADR-0035 §6.1'den
**bilincli bir sapmadir.** Randevu, bagli CRM kisisinin adini basliga koymustu
ve bedelini (bayatlama) `reindex` ile odemisti. Burada ayni sey yapilmaz cunku
ADR-0033'un kurali **iki bagli varlik oldugunda** yon gosteriyor:

> _"ikinci bir denormalize ad ikinci bir bayatlama yuzeyi demektir"_ — basliga
> **yalnizca bir ad** girer.

Belgenin **iki** opsiyonel baglantisi var (§4). Ikisini birden koymak kurali
dogrudan ihlal eder; birini secmek **keyfidir**. Ucuncu yol secildi: **hicbiri**.
Yerine konan `original_filename` kaydin **kendi kolonudur**, baska bir modulden
kopyalanmaz ve **hicbir zaman bayatlamaz**.

⚠️ **Bedeli acikca kaydediliyor:** _"Ahmet Yilmaz'la olan sozlesmede ne
yaziyordu"_ sorusu, ad dosya adinda ya da etikette gecmiyorsa **eslesmez**.
Telafi kullanicinin elindedir (dosyayi anlamli adlandirmak) ve `reindex`
**yine de ilk gunden vardir** — cunku etiket degisimi ve dosya degisimi
basligi bayatlatir.

#### 8.2 ⚠️ ADR-0036'nin taban kisiti ILK GERCEK YUKUNU TASIYOR

ADR-0036 §3 su cumleyi yazdi ve bu ADR onu **degistirmez**:

> _"ADR-0037 bu kararin USTUNE oturur ve onu DEGISTIRMEZ. Belge/Sozlesme
> altinci anlamsal kaynagi ekledigi gun taban yine 3 kalir; degisen tek sey,
> serbest bes yuvanin artik alti anlamsal kaynak arasinda paylasilmasidir."_

Bu modulden sonraki durum:

| Olcu                     | Randevu sonrasi | Belge sonrasi                 |
| ------------------------ | --------------- | ----------------------------- |
| Anlamsal kaynak          | 5               | **6**                         |
| Yapisal kaynak           | 4               | **4 — DEGISMEDI** (§8)        |
| Toplam katkici (fan-out) | 9               | **10**                        |
| Global top-K             | 8               | **8 — DEGISMEDI**             |
| Yapisal taban            | `ceil(8/3)` = 3 | **3 — DEGISMEDI**             |
| Serbest yuva             | 5               | **5 — ama 6 kaynak arasinda** |

Uc sonuc kaydediliyor:

1. **ADR-0036'nin yeniden gozden gecirme esigi CEKILMIYOR.** O ADR
   _"yapisal kaynak sayisi tabanin iki katini gectiginde (bugun 4, esik 6)"_
   demisti; bu modul yapisal kaynak **eklemedigi** icin sayi 4'te kaliyor.
2. **Anlamsal yarisma GERCEKTEN siklasiyor** ve bu modul baskiyi Randevu'dan
   **daha cok** artiriyor: Randevu kayit basina **tek** vektor yaziyordu
   (ADR-0035 §6.3'un birinci gerekcesi), Belge kayit basina **onlarca** parca
   yaziyor (§3). Yani bes serbest yuvada, alti kaynak arasinda, **daha
   kalabalik** bir havuzla yarisilacak.
3. ⚠️ **Bir anlamsal kaynagin sifir alabilmesi BEKLENEN sonuctur ve ADR-0036
   bunu bilincli olarak korumadi:** _"Anlamsal kaynaklar arasinda taban
   YOKTUR. Alti anlamsal kaynak bes serbest yuva icin yarisacak ve biri sifir
   alabilir. Bu bilincli: anlamsal kaynaklar ayni olcegi paylasir, yani
   aralarindaki eleme LIYAKATTIR."_ Bu modulun denetiminde boyle bir sonuc
   gorulurse, **ADR-0036'nin bir kusuru degil, yazili beklentisidir**.

⚠️ **Olcum bu modulun kapanis denetiminde ZORUNLU bir maddedir.** ADR-0036
kendi bilinen sinirlarina _"canli bir dagilim olcumu ADR-0037'nin kapanis
denetimine birakildi"_ diye yazdi; o borc **burada odenir** (§ Kapanis
denetimi). Olculecek sey iki tanedir: (a) on katkici doluyken kaynak dagilimi,
(b) **tabanin gercekten calistigi** — yani en az uc **ayri** yapisal sesin
cevapta bulunmasi. Taban ADR-0036'nin birim testleriyle kilitli; eksik olan
**canli** kanittir.

### 9. Exception filter — DORT hata tipi, hepsi ILK GUNDEN

**Karar: `DocumentsDomainExceptionFilter` `@Catch(...)` listesine
`EmbeddingFailedError`, `StorageFailedError`, `RateLimitExceededError` ve
`CompletionFailedError` — **dordu de** — BASTAN yazilir.**

ADR-0035 §8'in genellenmis kurali dogrudan uygulanir:

> **Bir modul yeni bir port kullanmaya basladiginda, o portun hata tipi filtreye
> eklenmelidir.**

Bu modul **iki** paylasilan port kullanir (`EmbeddingPort`, `StoragePort`) ve
platformun oran siniri mekanizmasina baglanir. Hicbiri
`DocumentsDomainError`'dan **turemez**; `@Catch(...)`e yazilmazlarsa filtre
onlari **gormez** ve kullanici 502/429 yerine **islenmemis 500** alir.

**`DisclosableProblem` isareti** (`DisclosableHttpException`,
`infrastructure/http`) **ilk gunden** tasinir — beste sonradan eklenen sey burada
**bastan** yazilir. Isaret yalnizca **bilincli yazilmis** govdelere konur:

| Hata                     | Kod     | Kullaniciya giden govde                                                                                                                          |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `StorageFailedError`     | **502** | _"Belge deposuna ulasilamadi. Dosya kaydedilmedi, tekrar deneyin."_                                                                              |
| `EmbeddingFailedError`   | **502** | _"Belge yuklendi ancak icerigi indekslenemedi; `reindex` ile onarilabilir."_                                                                     |
| `RateLimitExceededError` | **429** | Standart govde + `Retry-After` (⚠️ 4xx **isaret tasimaz** — maske yalnizca 5xx'e)                                                                |
| `CompletionFailedError`  | **502** | ⚠️ **Bugun tetiklenemez** — §12'nin "belgeyi ozetle"si eklendigi gun: _"Belge ozeti uretilemedi; belge ve icerigi etkilenmedi, tekrar deneyin."_ |

Ikinci satir tam olarak ADR-0035'in kapanis denetiminde bulunan kusurdur ve
mesajin ulasmasi burada **bir regresyon degil bir gereksinimdir**: §5.3'un
sirasi geregi bu durumda **dosya kaydedilmistir**, yani kullanicinin yapmasi
gereken sey yeniden yuklemek **degil** onarmaktir. Mesaj ulasmazsa kullanici
ayni dosyayi tekrar yukler ve **ikinci bir kopya** olusur.

⚠️ **Tek bir `StorageFailedError`, iki ayri tip degil.** "Saglayiciya
ulasilamadi" ile "kayit var ama nesne yok" farkli sebeplerdir, ama ikisi de
istemcinin **dogru** bir istegine karsi sunucu tarafinda olusur (502) ve
ikisinde de kullanicinin yapabilecegi sey **aynidir**. Ayrim, **govde
metnindedir** — HTTP kodunda degil.

> ### ⚠️ `CompletionFailedError` BUGUN TETIKLENEMEZ — ve yine de BASTAN yaziliyor
>
> Bu modul `LLMPort`'u **kullanmaz** (§8: tek katkici, modul ici AI yuzeyi yok),
> yani o satir bugun **olu koddur**. Yazilmasinin sebebi ADR-0035 §8'in
> **asimetrik bedel** argumanidir ve o arguman burada **degismeden** gecerlidir:
>
> > _"Bedeller simetrik degil: bir satirlik olu kod ile islenmemis bir 500.
> > Simetrik olmayan bir riskte ucuz tarafta durulur."_
>
> **Belirleyici ayrinti §12'dedir:** "bu sozlesmeyi ozetle" bir **yasak degil**,
> v2 kapsam listesinde duran bir **kalemdir**. Yani bu modulun `LLMPort`'a
> baglanmasi **ongorulmus bir gelecektir**; ongorulmus bir gelecege ait tek
> satiri "o gun hatirlariz" diye ertelemek, projenin tekrar tekrar reddettigi
> seydir. CRM'de tam olarak bu yasandi: ayni gerekceyle disarida birakilan
> satir Katman 2'de (musteri ozeti eklenirken) **yanlislandi** ve o gun
> hatirlanmak zorunda kalindi.
>
> ⚠️ Bu, **"her modul her hata tipini yakalasin" DEGILDIR** — ADR-0035 §8'in
> koydugu sinir burada da gecerli: filtre yalnizca `shared/`daki portlarin
> hatalarini kapsar, cunku hepsi bu modulun kullandigi ya da **yarin kullanmasi
> ongorulen** portlara aittir.
>
> ⚠️ Bedeli acikca: bugun **tetiklenemeyen** bir kod yolu yazilmis oluyor ve bir
> birim testi onu ancak **sahte** bir hata firlatarak sinayabilir. Bu, ADR-0034
> Slice 1'in `CategoryInUseError` icin verdigi kararin aynisidir — _"bugun
> tetiklenemeyen bir yol bilerek yazildi"_ — ve orada da alternatif, sonraki
> slice'ta **hatirlamaya guvenmekti**.

### 10. Izinler, uclar ve oran siniri

ADR-0025'in `resource:action` modeli, **besinci** kez.

| Permission        | owner | admin | member | viewer |
| ----------------- | :---: | :---: | :----: | :----: |
| `document:read`   |  ✅   |  ✅   |   ✅   |   ✅   |
| `document:write`  |  ✅   |  ✅   |   ✅   |   ❌   |
| `document:delete` |  ✅   |  ✅   |   ❌   |   ❌   |

**Katalog GENISTIR — Finans'in dar katalogu DEGIL.** Karar tartisildi cunku
belgeler ilk bakista muhasebe verisine yakin durur (sozlesme, hassas icerik).
Sonuc yine de ADR-0034 §7'nin **kendi olcutunu** izliyor: _"musteri listesi ve
gorev listesi PAYLASILAN is gercekleridir, sirketin nakit akisi degildir."_
Bir sartname, bir teklif dosyasi, bir tedarikci sozlesmesi **paylasilan is
gercekleridir**; ekipteki kimsenin projeye ait sozlesmeyi acamamasi modulun
amacini bozar.

⚠️ **Asil gerekce ise TERSTEN gelir ve kaydedilmesi sart:**

> **Dar katalog bu modulde YANLIS BIR GUVENLIK HISSI verirdi.**

Finans'ta hassasiyet **semanin tamamina** aitti: her satir nakit akisidir.
Belgede hassasiyet **belge basinadir** — bir teklif taslagi ile bir personel
sozlesmesi **ayni tabloda** yasar. Rol seviyesinde bir kapi bu ayrimi ifade
**edemez**: dar katalog secilseydi `member` ve `viewer` disari kalirdi ama
`admin` yine **tum** belgeleri gorurdu, ve okuyan biri sorunun cozuldugunu
sanabilirdi. Dogru cozum **belge bazli erisimdir** (ABAC/ACL) ve o bugun
**backlog**tadir (ROADMAP §1.1).

⚠️ **Bu yuzden bir URUN KISITI yaziliyor:** v1'de `document:read` tasiyan
**herkes tum belgeleri gorur ve indirir**. Kisiye ozel hassas belgeler
(ozluk dosyasi, bordro, saglik verisi) bu module **konulmamalidir**.
Tetikleyici bellidir: **9. modul (IK)** geldiginde belge bazli erisim
**ertelenemez** hale gelir — ROADMAP §3.5'in IK icin yazdigi _"maas ve saglik
verisi YOK"_ notuyla ayni siniftan bir kisit.

⚠️ **Ayri bir `document:download` izni ACILMADI.** Metadata'yi gorup icerigi
indiremeyen bir rol, gercek bir koruma saglamaz: belge **adi** icerigin cogunu
zaten soyler ("2026 Kira Sozlesmesi.pdf"), ve icerik `POST /ask` uzerinden
zaten ayni izinle (`document:read`) cevaba girer. Iki izin, tek bir sinirin
**iki yerde** yasamasi olurdu.

⚠️ **`document:read` katkicinin da kapisidir** (§8) ve dort rol de tasidigi icin
bu modul `POST /ask` izin filtresini **tetiklemez** — tetikci hala **yalnizca
Finans**'tir (`cashflow:read` / `commentary:read`). Bu, dordu modulde de
kaydedilen ayni cumledir ve kaydedilmesinin sebebi, dar katalogun bir
konvansiyon **sanilmamasidir**.

| Uc                                  | Izin              | Not                                                                                     |
| ----------------------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| `POST /api/v1/documents`            | `document:write`  | **multipart** · dosya + etiket + opsiyonel `contactId`/`projectId` · **oran sinirli**   |
| `GET /api/v1/documents`             | `document:read`   | Etiket · kisi · proje filtresi + sayfalama (sunucu tarafinda)                           |
| `GET /api/v1/documents/:id`         | `document:read`   | Metadata + cozulmus kisi/proje adlari (§4) + `chunkCount` (§6.3)                        |
| `GET /api/v1/documents/:id/content` | `document:read`   | **Stream** (§5.4) · `Content-Disposition` `original_filename` tasir                     |
| `PATCH /api/v1/documents/:id`       | `document:write`  | Yalnizca **metadata**: etiket, baglantilar. Dosya **degismez**                          |
| `PUT /api/v1/documents/:id/file`    | `document:write`  | **multipart** · dosya degisimi (§7) · chunk'lar silinip yeniden uretilir · oran sinirli |
| `DELETE /api/v1/documents/:id`      | `document:delete` | DB satiri + chunk cascade + R2 nesnesi (§5.3)                                           |
| `POST /api/v1/documents/reindex`    | `document:write`  | Vektorsuz **parcali** belgeleri onarir                                                  |

⚠️ **Metadata guncellemesi (`PATCH`) ile dosya degisimi (`PUT .../file`) AYRI
uclardir.** Ayni uca koymak, JSON ve multipart govdelerini tek bir dogrulama
semasinda birlestirmeyi gerektirirdi; ayrica ikisinin yan etkisi **taban tabana
zittir** — biri bir kolonu yazar, digeri bir dosyayi ve tum chunk'lari degistirir.

**Oran siniri**, `platform.rate_limits` uzerinde **tek** kalem deklare eder
(`document_embedding`) ve **altinci modulde de altinci bir sayac tablosu
ACILMAZ**.

⚠️ **Kalem adi ADR-0035'in adlandirma dersini izler** (`appointment_embedding`
kalibi): sinirlanan sey **embedding uretilen her yoldur**, hangi fiil olursa
olsun — yani hem `POST /documents` hem `PUT .../file` ayni kovadan yer.

⚠️ **AMA KOVA BOYUTU DIGERLERINDEN KUCUK OLMALIDIR** ve bunun sebebi bu
modulde **ilk kez** ortaya cikiyor: onceki dort moduldde bir istek **bir**
embedding cagrisi uretiyordu; burada bir istek **onlarca** uretir (bir belge =
N parca). Oran siniri **istek sayar, token saymaz** — bu ADR-0031'den beri
yazili bilinen sinirdir, ama bugune kadar sayac ile maliyet arasindaki oran
sabitti. **Burada degil.** Ayni saatlik limit, bu modulde onceki modullerin
onlarca kati maliyete izin verirdi.

### 11. Frontend

**Renk: imza rengi `module-colors.css`'te ZATEN OLCULMUS ve ayrilmis:**

```
[data-module='documents']   acik: #557380 / ink #45626e
                            koyu: #8dacba / ink #9dbdcb
```

⚠️ Anahtar **`documents`** — sema, modul ve `data-module` **ayni kelime**
(ADR-0035 §1.1'in kurali; bu kez **yeniden adlandirma gerekmiyor**, palet dogru
adla yazilmis). Iki satirlik is: modulun kendi `layout.tsx`'inde
`<div data-module="documents" style={{ display: 'contents' }}>` + sidebar satiri.

⚠️ `module-colors.css` bu rengi acik bir gerekceyle **en sonuk** renk olarak
secmis ve dosyanin basina yazmis: _"BELGE/SOZLESME BILINCLI OLARAK EN SONUK —
tek dusuk doygunluklu renk. Sozlesme ekrani dikkat cekmek icin degil okumak
icin vardir."_ Bu bir tercih degil, **olculmus** bir karardir ve degistirilmez.

**AI'in sesi TERRACOTTA KALIR.** Bu modulde modul ici AI yuzeyi **yoktur**
(§12) — Randevu'daki durumun aynisi. Sinav yine _"terracotta dogru yerde mi"_
degil **"kabuk boyanmiyor mu"** olarak yapilir.

> ⚠️ **`SOON` dizisi BOS ve bu modulle GERI DOLMAZ — dogrudan `LIVE`'a girer.**
> Sidebar `SOON.length > 0` kontrolu geregi "Moduller" bolumunu **hic
> cizmiyor** (ADR-0034 §10, ADR-0035 §7). Randevu'da uygulanan ayni karar
> ikinci kez uygulanir. ⚠️ Yeni bir **ikon** gerekir (`icons.tsx`'te karsiligi
> yok) — bir **tasarim** isidir ve frontend slice'inin kapsamindadir.

**Rotalar:** `/app/documents` (liste + filtreler) · `/app/documents/[id]`
(detay: metadata, baglantilar, indirme).

⚠️ **DOSYA YUKLEME PROJEDEKI ILK ORNEKTIR** ve bu, frontend slice'inin
kucumsenmemesi gereken parcasidir. Bugune kadar her form JSON gonderiyordu.
Yeni ve gercek olan uc sey var:

1. **Sinirlar ONCEDEN gosterilmelidir** — kabul edilen turler ve boyut siniri
   secim yapilmadan **once** yazilir. ADR-0035 §3d'nin dersi (_"arayuz sayaci
   onceden gostermezse kullanici yazdigini kaybetmis hisseder"_) burada daha
   agirdir: 20 MB'lik bir dosyayi yukleyip **413** almak, dakikalarca suren bir
   yuklemeyi cope atmaktir.
2. **Ilerleme gorunur olmalidir.** Bir dosya yuklemesi anlik degildir; geri
   bildirimsiz bir bekleyis, kullaniciyi ikinci kez gondermeye iter ve **iki
   kopya** olusur.
3. **§6.3'un `chunkCount: 0` durumu ekranda SOYLENMELIDIR** — aksi halde
   karar sessiz basarisizliga doner.

Ekranlarin ayrintili tasarimi bu ADR'nin konusu degildir; FRONTEND §4.8'in
renk kurali ve Atolye dili baglayicidir.

### 12. Kapsam disi (bugun yapilmiyor)

**Arsiv siniri** — bunlar "sonra ekleriz" degil, **v1'in tanimi disidir**:

- **E-imza** — ⚠️ ayri bir hukuki ve teknik alan (imza sertifikasi, zaman
  damgasi, dogrulama zinciri, denetim izi). Bir belge modulunun icine
  sikistirilamaz; **ayri bir ADR** ve buyuk olasilikla ayri bir saglayici
  karari ister.
- **Versiyon gecmisi** (§7) — yarim yapilmasi hic yapilmamasindan kotudur.
- **OCR** (§6.3) — taranmis belgeler **olculdukten** sonra; ayri servis, ayri
  maliyet, ayri gecikme profili.
- **Modul ici AI yuzeyi** ("bu sozlesmeyi ozetle") — Randevu'daki §7 karariyla
  ayni. Belge yalnizca `RetrievalContributor` uzerinden **merkezi `POST /ask`**'a
  beslenir. ⚠️ Eklendigi gun `--ai-accent` kullanmak **zorunludur**; filtre
  tarafinda ise yapilacak bir sey **yoktur** — §9 `CompletionFailedError`i tam
  olarak bu gun icin **bastan** yazdi.
- **Belge sablonlari** (sozlesme uretme) — bu bir **yazma** ozelligidir; modul
  v1'de bir **arsivdir**. Ayrica dogru sirasi 8. modulden (Teklif/Fatura)
  sonradir.
- **Belge bazli erisim / gizlilik seviyesi** (§10) — ABAC backlog'una bagli,
  tetikleyicisi 9. modul (IK).
- **Sozlesme bitis tarihi ve yenileme hatirlatmasi** — ⚠️ ADR-0035'in
  hatirlatma kalemiyle **ayni sinif**: bir **zamanlayici** ister ve ROADMAP
  §2.3'un Queue karari `SKIP LOCKED` deseniyle verilmis olsa da, "sozlesme
  bitmeden 30 gun once haber ver" ayri bir urun karari ve ayri bir bildirim
  yuzeyidir.
- **Klasor / hiyerarsi** — serbest etiket (§2) bilincli olarak **duz** bir
  yapidir; agac yapisi tasima, yeniden adlandirma ve yetkilendirme sorularini
  birlikte getirir.
- **Onay akisi** (belge onaya gonderilir) — bir **surec motoru** sorusudur,
  bir belge sorusu degil.
- **Tam metin (klasik) aramasi** — ADR-0011, **altinci** kez ertelendi.
  ⚠️ Bu modulde eksikligi **en cok** hissedilecek yerdir: _"icinde 'fesih'
  gecen sozlesmeler"_ tipik bir belge sorusudur ve anlamsal arama onu tam
  olarak karsilamaz.
- **Yetim nesne temizligi** (§5.3) · **Degisiklik denetim izi**
  (ADR-0034 §8'in borcu, **besinci** kez; tetikleyici degismedi: 8. modul)

ADR-0029/0030/0031/0033/0034/0035'in kapsam disi maddeleri aynen gecerlidir.

## Gerekce

**Neden §3 (chunk tablosunun geri donusu) bir tutarsizlik degil.** Bir onceki
ADR'nin verdigi karari tersine cevirmek, varsayilan olarak supheyle
karsilanmalidir. Burada dogru olmasinin sebebi, **iki kararin ayni olcutu
kullanmasidir**: metnin ust sinirini kim belirliyor. Randevu'da sinir bizimdi ve
`TARGET_CHUNK_CHARS`'a esitlendi; burada sinir **dosyanindir** ve 300 parcaya
kadar cikabilir. Ayni olcut iki farkli cevap verdiginde, olcut **gercek** bir
olcuttur — her seferinde ayni cevabi veren bir olcut ise bir olcut degil, bir
aliskanliktir.

**Neden §5'in tamami bu kadar uzun.** Bu, projenin **PostgreSQL disina yazdigi
ilk kalici durumdur** ve o siniri gecerken kaybedilen sey RLS'tir. Bugune kadar
tenant izolasyonunun bir kismi **veritabani tarafindan zorlaniyordu**; nesne
deposunda boyle bir mekanizma yok, izolasyon tumuyle **bizim yazdigimiz
anahtara** bagli. Bu yuzden §5.2'nin anahtar duzeni ve "anahtar her zaman
veritabanindan gelir" kurali bir ayrinti degil, **modulun guvenlik eksenidir**.
§5.3'un sira karari ayni sinifin ikinci sorusudur: atomiklik kaybedildiginde
hangi tutarsizligin **gorunur** oldugu, hangisinin **sessiz** oldugu belirler.

**Neden §10 genis katalog seciyor ama bir urun kisiti yaziyor.** Iki secenek de
sorunu cozmuyordu; dar katalog ustelik **cozmus gibi gorunuyordu**. Projede
tekrar tekrar verilen karar burada da veriliyor: eksikligi **gizleyen** degil
**soyleyen** taraf secilir. "v1'de belge bazli gizlilik yoktur, hassas belge
koymayin" cumlesi bir kusur itirafi degil, kullanicinin dogru karari
verebilmesi icin gereken **tek** bilgidir.

**Neden §8 tek katkici.** Dort modulun dordunde de ikinci bir yapisal katkici
vardi ve besincisini yazmamak bir eksiklik gibi okunur. Ama ADR-0036 yapisal
kaynaklara **garantili yuva** verdikten sonra "yapisal" etiketi bir imtiyaz
haline geldi; icerigi zayif bir ozeti yapisal ilan etmek, o yuvayi gercekten
alarm ureten bir kaynagin elinden almak olurdu. Bir modulun **katki
vermemesi**, kotu bir katki vermesinden iyidir.

**Neden §9 ADR-0035'i AYNEN izliyor.** `CompletionFailedError` bu modulde
bugun **tetiklenemez** ve bir sure daha olu kod olarak duracak. Yine de bastan
yazilmasinin sebebi ADR-0035 §8'in asimetrik bedel argumanidir: bir satirlik
olu kodun bedeli olculebilir degildir, islenmemis bir 500'un bedeli ise
kullanicinin gordugu **tek** seydir. Belirleyici ayrinti §12'de duruyor —
"belgeyi ozetle" kapsam disi ama **v2 listesinde**, yani modulun `LLMPort`'a
baglanmasi ongorulmus bir gelecektir. Ongorulmus bir gelecege ait tek satiri
"o gun hatirlariz" diye ertelemek, CRM'de Katman 2'de bir kez zaten
**yanlislandi**.

## Sonuclari

**Olumlu**

- **Kurumsal hafiza ilk kez ELDE YAZILMAMIS bilgiyi kapsiyor.** Bugune kadar
  AI'in gordugu her metni bir kullanici bir forma yazmisti. Sozlesmeler,
  sartnameler ve teklifler bir sirketin **en yogun bilgi tasiyan** metinleridir
  ve hicbiri bu urune bir forma yazilarak girmez. CLAUDE.md'nin "Kurumsal
  hafiza" tanimindaki en buyuk bosluk budur.
- **ADR-0009 dort haftalik bir "acik saglayici" kalemini kapatiyor** ve bunu
  ROADMAP §2.3'un ongordugu **tam zamanda** yapiyor: karar 5. modulden **once**,
  ilk satir yazilmadan.
- **Desen altinci kez ucuz calisiyor:** altinci sema, altinci izin katalogu,
  altinci oran siniri kalemi, besinci chunk tablosu — ve **tek bir platform
  dosyasi degismiyor**.
- ⚠️ **Cross-modul referans deseni ILK KEZ HICBIR SEY YAPILMAYARAK dogrulaniyor**
  (§4.1). Iki modulun verisine baglanan bir modul, o iki modulun **tek satirina**
  dokunmuyor. ADR-0035'in netlestirdigi kural ("yeni talip ≠ yeni kaynak turu")
  ilk kez **talip** tarafindan sinaniyor.
- **ADR-0036'nin sozu tutuluyor:** taban kisiti degistirilmeden, altinci
  anlamsal kaynak eklenebiliyor. `contributionKind` zorunlulugu bu modulde
  ilk kez **yeni bir katkici** tarafindan karsilaniyor.

**Olumsuz / bedeli**

- ⚠️ **Ikinci bir kalici durum yuzeyi acildi ve orada RLS YOK.** Tenant
  izolasyonunun nesne deposundaki tek dayanagi §5.2'nin anahtar duzenidir.
  Bir okuma yolunun anahtari istemciden almasi, RLS'in yakalayamayacagi bir
  sizinti kapisi acar — ve hata **sessiz** olur.
- ⚠️ **Iki dogruluk kaynagi arasinda ATOMIKLIK YOK** (§5.3). Yetim nesneler
  **birikecektir** ve v1'de temizleyen bir sey yoktur; bedel bir **faturadir**
  ve zamanla buyur.
- **Retention borcu 13 → 15 tabloya cikar** ve vektor tasiyan tablo sayisi
  5 → **6** olur (§ Bilinen sinirlar). ⚠️ Ustelik bu, listeye **R2'yi de**
  sokan ilk kalemdir: retention isi yazildiginda satirla birlikte **nesneyi de**
  silmelidir.
- **Anlamsal havuz baskisi Randevu'dan DAHA COK artiyor** (§8.2): kayit basina
  bir vektor degil, **onlarca**. Bes serbest yuvada alti kaynagin yarismasi
  siklasiyor.
- **Fan-out N=9 → 10.** Olcum kapanis denetiminde **zorunlu**; N=7'nin iki kez
  atlanip ucuncu kez atlanmamasi gibi, bu kez de atlanmaz.
- **Yeni bir dis bagimlilik sinifi:** iki ayristirici kutuphane (PDF, DOCX) +
  bir S3 istemcisi + docker-compose'a MinIO + Railway'e uc yeni sir. Bu, Faz
  5'te bir modulun getirdigi **en genis altyapi yuzeyidir**.
- **Belge bazli gizlilik yok** (§10) — ve bu, kullanicinin **fark edecegi** bir
  eksikliktir: "bu sozlesmeyi sadece ben goreyim" ilk sorulacak seylerden
  biridir.
- **Bagli kisi/proje adi vektorde YOK** (§8.1) — Randevu'nun tersine, ad ile
  arama calismaz.
- **Modulun adi ("Sozlesme Yonetimi") beklentiyi YUKARI cekiyor**: e-imza,
  onay akisi ve yenileme takibi yok. Finans'in "muhasebe" ve Randevu'nun
  "rezervasyon" cagrisimiyla **ucuncu kez** ayni tuzak — bu kez kaydedilerek.

## Degerlendirilen alternatifler

| Alternatif                                                        | Neden secilmedi                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dosyalari PostgreSQL'de (`bytea`) tutmak**                      | ADR-0009'un zaten reddettigi secenek: veritabani boyutu ve yedekleme suresi patlar. Ayrica her `pg_dump` on sayfalik sozlesmeleri tasir                                                                                                                                                                                      |
| **Dogrudan S3 SDK, port'suz**                                     | ADR-0009: saglayici degisimi tum kodu etkilerdi. Ayrica Mutlak Kural 7'nin dis servis karsiligi                                                                                                                                                                                                                              |
| **AWS S3** (R2 yerine)                                            | Egress ucretli ve bu modulde egress **kullanimla dogru orantili** buyuyen tek kalemdir (§5a). S3-uyumluluk sayesinde karar zaten geri alinabilir                                                                                                                                                                             |
| **MinIO'yu prod'da da kullanmak**                                 | Kendi nesne deposunu isletmek (yedek, dayaniklilik, olcekleme) bir altyapi isidir; Railway uzerinde tek instance ile calistirmak **veri kaybi riskidir**                                                                                                                                                                     |
| **Presigned URL ile indirme** (§5.4)                              | Erisim karari policy engine'den **bir dizeye** devredilir; tenant izolasyonunun en zayif dayanagi tek basina yeterli hale gelir. R2'de egress ucretsiz oldugu icin kazanci da kucuk                                                                                                                                          |
| **Chunk tablosu ACMAMAK** (Randevu gibi tek satir vektor)         | Bir sozlesme `TARGET_CHUNK_CHARS`'a sigmaz; tek vektor on sayfanin **ortalamasi** olur ve _"fesih bildirimi otuz gun once"_ cumlesi kaybolur — yani modulun var olus sebebi (§3)                                                                                                                                             |
| **Sabit belge turu enum'u** (`sozlesme`/`teklif`/`fatura`)        | On iki sektorun belge turlerini bugunden bilmeyi gerektirir; kullaniciyi **sahte kategoriye** iter ve sahte kategori §8'in baglam basligina girip AI'a yanlis bilgi ogretir (§2a)                                                                                                                                            |
| **Tenant-tanimli etiket sozlugu** (Finans kategorisi gibi)        | Finans sozlugunun **yapisal bir isi** vardi (yon + bilesik FK). Etiketin yoktur; ayri tablo bir yonetim ekrani borclandirir, karsiliginda hicbir sey kazandirmaz (§2b)                                                                                                                                                       |
| **Coklu etiket** (`document_labels` tablosu)                      | Cok-a-cok iliski + yonetim yuzeyi. Tek kolondan coklu tabloya gecmek bir migration'dir; tersi **veri kaybidir** (§2d)                                                                                                                                                                                                        |
| **Her dosya turunu kabul edip yalnizca PDF/DOCX'i indekslemek**   | Kullanici dosyasinin arama disinda kaldigini **hicbir yerden ogrenemez** — ekranda digerleriyle ayni gorunur. **415 acik bir cevaptir** (§6.1)                                                                                                                                                                               |
| **OCR'i v1'e almak**                                              | Ayri servis, ayri maliyet kalemi, ayri gecikme profili; dogru zamani taranmis belgelerin gercekten **olculdugu** gundur (§6.3)                                                                                                                                                                                               |
| **Metin cikarimini kendimiz yazmak** (kutuphane reddi)            | ADR-0035 §7'nin red gerekcesi (kullanilmayan %90 + tasarim dili catismasi + `--accent` override'i) **hicbiri** bir sunucu tarafi ayristiriciya uygulanmaz. Bir PDF ayristiricisi yazmak ciddi bir onerinin konusu degil (§6.2)                                                                                               |
| **`TextExtractorPort`u `shared/`'a koymak**                       | Bugun tek tuketicisi var ve bir **platform yetenegi degil**. `shared/`'a koymak Faz 4'un hatasinin tersi olurdu: kimsenin kullanmadigi seyi kernele koymak (§6.2)                                                                                                                                                            |
| **Versiyon gecmisi tablosu**                                      | Gercek versiyon gecmisi fark, yururluk, aranabilirlik (havuz **iki kat** kirlenir) ve saklama sorularini birlikte getirir. Yarim bir versiyon gecmisi hic olmamasindan **kotudur** (§7)                                                                                                                                      |
| **Ayni `storage_key` uzerine yazmak** (versiyon degisiminde)      | Nesne depolarinin tutarlilik modeline ve CDN/tarayici onbelleklerine guvenmek demektir; kullanici yeni dosyayi yukler, **eskisini indirir** ve fark etmez (§5.2)                                                                                                                                                             |
| **Once R2'yi silip sonra DB satirini silmek**                     | **Nesnesiz kayit** uretir: kullanici listede duran belgeye tiklar, indiremez ve hata **her denemede** tekrarlanir. Yetim nesne ise gorunmez ve temizlenebilir (§5.3)                                                                                                                                                         |
| **Yapisal bir katkici da yazmak** ("sozlesme durumu")             | Bir belgenin **durumu yoktur**. Zorlanabilecek her aday ya baska bir modulun isi ya kapsam disi; ustelik ADR-0036 sonrasi "yapisal" etiketi bir **imtiyazdir** ve bos bir ozet o imtiyazi anlamsizlastirirdi (§8)                                                                                                            |
| **Bagli kisi/proje adini baglam basligina koymak** (Randevu gibi) | **Iki** bagli varlik var; ikisini koymak ADR-0033'un "tek ad" kuralini ihlal eder, birini secmek keyfidir. Ucuncu yol (hicbiri) `original_filename`e dayanir ve **hic bayatlamaz** (§8.1)                                                                                                                                    |
| **Dar izin katalogu** (Finans gibi)                               | Sorunu **cozmez ama cozmus gibi gorunur**: hassasiyet belge basinadir, rol seviyesinde ifade edilemez; `admin` yine tumunu gorurdu. Dogru cozum belge bazli erisimdir ve backlog'tadir (§10)                                                                                                                                 |
| **Ayri `document:download` izni**                                 | Belge **adi** icerigin cogunu soyler ve icerik `POST /ask` uzerinden zaten `document:read` ile cevaba girer. Tek bir sinirin iki yerde yasamasi olurdu (§10)                                                                                                                                                                 |
| **`CompletionFailedError`i filtreden CIKARMAK** (Finans gibi)     | Gerekcesi savunulabilirdi — modul bugun `LLMPort` kullanmiyor. Ama ADR-0035 §8'in **asimetrik bedeli** burada da gecerli (bir satirlik olu kod ile islenmemis bir 500) ve "belgeyi ozetle" §12'nin **v2 listesinde** duruyor: baglanti ongorulmus bir gelecektir. CRM'de ayni satir Katman 2'de bir kez **yanlislandi** (§9) |
| **`PATCH` ile dosya degisimini ayni uca koymak**                  | JSON ve multipart tek dogrulama semasinda birlesirdi; ustelik yan etkileri zit (bir kolon vs. dosya + tum chunk'lar) (§10)                                                                                                                                                                                                   |
| **Ayri `documents.rate_limits` tablosu**                          | `platform.rate_limits` zaten var; altinci modulde altinci tablo, ADR-0031 §4.2'nin tam olarak onledigi cogalma                                                                                                                                                                                                               |

## Bilinen sinirlar

- ⚠️ **Nesne deposunda RLS YOKTUR** (§5.2). Tenant izolasyonu anahtar duzenine
  ve "anahtar her zaman veritabanindan gelir" kuralina dayanir. Bu kural bir
  yerde delinirse hata **sessizdir**.
- ⚠️ **Yetim nesne temizligi YOK** (§5.3). Yarida kalan yuklemeler, degistirilen
  dosyalar ve silme sonrasi basarisiz R2 cagrilari nesne birakir; hicbir sey
  onlari toplamaz. Cozum retention karariyla **ayni gun** verilmelidir.
- ⚠️ **Belge bazli gizlilik YOK** (§10). `document:read` tasiyan herkes **tum**
  belgeleri gorur ve indirir. Hassas belge (ozluk, bordro, saglik) bu module
  konulmamalidir. **Tetikleyici: 9. modul (IK).**
- ⚠️ **Taranmis belgeler ARANAMAZ** (§6.3) — OCR yok. Kayit basarilidir,
  `chunkCount: 0` doner ve arayuz bunu **soylemek zorundadir**; soylemezse
  karar sessiz basarisizliga doner.
- **Yalnizca PDF ve DOCX kabul edilir** (§6.1) — gorsel, xlsx, pptx, txt hepsi
  **415**. Genisletmek ucuzdur, geri almak degildir.
- **20 MB / 300 parca sert sinirlardir** — asilirsa 413 / 422 ve **kayit
  acilmaz**; sessiz kirpma yoktur.
- **Versiyon gecmisi YOK** (§7) — yanlis dosya yuklendiginde eski icerik
  **geri getirilemez**.
- ⚠️ **Bagli kisi/proje adi vektorde YOK** (§8.1) — Randevu'dan bilincli sapma.
  _"Ahmet'le olan sozlesme"_ sorgusu, ad dosya adinda ya da etikette gecmiyorsa
  eslesmez.
- **Etiket serbest metindir; yazim farklari birikir** (§2c) — otomatik
  birlestirme yok, yalnizca `trim` + case-insensitive filtre.
- ⚠️ **Oran siniri istek sayar, TOKEN saymaz** — ve bu bilinen sinir bu modulde
  **ilk kez gercekten yaniltici**: onceki dort modulde bir istek bir embedding
  cagrisiydi, burada onlarca. Kova bu yuzden kucuk tutulur (§10) ama olcu hala
  dolayli.
- ⚠️ **Anlamsal kaynak sayisi ALTIYA cikti ve serbest yuva bes** (§8.2). Bir
  anlamsal kaynagin sifir alabilmesi ADR-0036'nin **yazili beklentisidir**, bir
  kusur degil. Olcum kapanis denetiminde yapilacak.
- **Retention borcu ONBESE cikar** ve vektor tasiyan tablo **ALTIYA**:
  `documents.documents` + `documents.document_chunks`. Dogru retention kolu
  **`documents.documents`**'tir (chunk'lar `ON DELETE CASCADE` ile gider —
  besinci kez ayni ders, ilk gunden uygulandi). ⚠️ **YENI:** retention isi bu
  kalemde satirla birlikte **R2 nesnesini de** silmek zorundadir; yalnizca satir
  silen bir is, faturaya donusen bir yetim nesne yigini birakir.
  ⚠️ Ayrica `finance.transactions`'in **ters gerekcesi** burada **kismen**
  gecerlidir: bir kira sozlesmesi ya da bir vergi belgesi yasal olarak
  saklanmalidir. Ayrim **tablo basina degil belge basina**dir ve v1 bunu ayirt
  **etmez** — ROADMAP §8.2'nin KVKK kontrol noktasina bir girdidir.
- **Degisiklik denetim izi YOK** — ADR-0034 §8'in borcu **besinci** kez;
  bir belgeyi kimin degistirdigi ya da sildigi **sorulamaz**. Tetikleyici
  degismedi (8. modul).
- **Sarkan `crm_contact_id` ve `project_id` temizlenmez** (§4.2) — dorduncu ve
  besinci sarkan isaretci. CRM ve Projeler hala **domain event yayinlamiyor**.
- **Iyimser eszamanlilik YOK** — son yazan kazanir; alti modulde ayni sinir.
- **`embedding` kolonunda model/surum bilgisi YOK** — alti kez ayni sinir.
- **Klasik metin aramasi YOK** (ADR-0011, **altinci** kez) — ⚠️ eksikligi bu
  modulde **en cok** hissedilecek yerdir: _"icinde 'fesih' gecen sozlesmeler"_
  tipik bir belge sorusudur.
- **Fan-out N=10 HENUZ OLCULMEDI** — kapanis denetiminin zorunlu maddesi.
  - ✅ **OLCULDU** (2026-08-19): ortalama **5030 ms**, fan-out payi **≤315 ms
    (%6)**, darbogaz `LLMPort.complete` (4458 ms). N=9'un 82 ms'ine gore
    artti — belge katkicisi bir chunk tablosunu tariyor — ama oran hala kucuk.
- ~~⚠️ **DOSYA DEGISTIRME ARAYUZU YOK.**~~ ✅ **KAPANDI (2026-08-19, PO
  talimati).** Detay ekranina **iki asamali** bir akis eklendi: (1) dosya
  SECILIR — bu adim hicbir sey gondermez, (2) secilen dosyanin adi ve
  boyutuyla birlikte _"bu islem geri alinamaz — mevcut dosya ve arama indeksi
  (embedding) kalici olarak degisecek"_ uyarisi gosterilir ve NE KORUNACAGI da
  yazilir (etiket · kisi · proje), (3) ancak ondan sonra onaylanir.
  ⚠️ Kapanma bicimi kaydin kendisiydi: eksik olan **uc degil, GERI
  ALINAMAZLIGI ANLATAN TASARIMDI**. Backend'e TEK SATIR dokunulmadi.
  ⚠️ Donen `chunkCount` ekranda TAZELENIR — eski dosyanin parca sayisi
  kalsaydi, yeni dosyanin metni okunamadiginda kullanici belgeyi aranabilir
  sanmaya devam ederdi (§6.3'un tersten ihlali).
- ⚠️ **DENETIMIN BULDUGU UC KUSUR** (hepsi duzeltildi) — ve ucu de **birim
  testleriyle gorunmuyordu**. Kayda geciyor cunku hangi test turunun neyi
  kacirdigini gosteriyorlar:
  1. **`multipart` opsiyonel alanlari**: `optionalFormText`te `.optional()`
     eksikti; `contactId` yazmayan HER yukleme **422** aliyordu ve dogrulama
     dosya kontrolunden once calistigi icin desteklenmeyen tur de **415 yerine
     422** donuyordu. Birim testleri govdeyi ZATEN COZULMUS veriyordu, yani Zod
     katmanina hic ugramiyorlardi. `documents.dto.spec` semayi artik DOGRUDAN
     sinar.
  2. **Parca sayaci**: projeksiyona gomulu korelasyonlu alt sorgu hata VERMEDI
     ve **her zaman 0** dondurdu — yani parcasi olan bir belge ekranda
     "Aranamiyor" gorunuyordu. Bu, §6.3'un tam TERSI bir sessiz yanlistir.
     Elle yazilan ayni SQL psql'de dogru calisiyordu; sorun Drizzle'in `sql`
     sablonunda tablo interpolasyonundaydi. Acik, toplu bir sorguya cevrildi.
  3. **Indirme**: controller ham bir `Readable` donduruyordu; NestJS onu govde
     sanip serilestirmeye calisiyor ve **islenmemis 500** uretiyordu.
     `StreamableFile` ile sarmalandi.
     ⚠️ **Ortak ders:** ucu de ancak **gercek bir HTTP istegiyle** gorundu. Bu
     modulun yuzeyi (multipart govde, akis cevabi, ORM sablonu) birim testlerinin
     dogal olarak atladigi yerlerde yasiyor.

## Uygulama plani (slice'lar)

Sira, her slice'in **kendi basina calisan** bir sey birakmasina gore kuruldu.

| Slice | Ne                                                                                                                                                                  | Migration               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **0** | **Bu ADR** — karar, kapsam, sinirlar                                                                                                                                | —                       |
| **1** | **Backend / depolama:** `documents` semasi + `StoragePort` (`shared/`) + R2 & MinIO adapter'lari + docker-compose/env + yukleme·liste·indirme·silme + izin katalogu | `0027_documents_schema` |
| **2** | **Backend / hafiza:** metin cikarimi (`TextExtractorPort`) + `document_chunks` + embedding + `reindex` + oran siniri + **exception filter (§9)** + katkici (§8)     | `0028_documents_chunks` |
| **3** | **Frontend + HAFIF kapanis denetimi:** iki rota, dosya yukleme yuzeyi, `documents` rengi, sidebar `LIVE` + asagidaki denetim listesi                                | —                       |

> ⚠️ **Cross-modul referans icin AYRI SLICE YOK — ve bu bir atlama degil, §4.1'in
> dogrudan sonucudur.** ADR-0033 ve ADR-0035 o isi ayirmisti cunku **baska bir
> modulun dosyalari degisiyordu** (Mutlak Kural 1-2). Burada `crm.public.ts` ve
> `projects.public.ts` **tek satir bile degismiyor**; ayrilacak bir is yoktur.
> `crm_contact_id` ve `project_id` kolonlari Slice 1'de acilir **ve yazma
> yollari da Slice 1'de gelir** — ADR-0033 Slice 1'in dersi ("dogrulanamayan
> isaretciyi kabul etme") burada **tersine** calisir: dogrulayan iki dizin de
> **zaten hazir**, yani ilk gunden dogrulanabilir.

**Neden backend ikiye bolundu.** Slice 1'in birakti sey **kendi basina
calisan bir belge arsividir**: dosya yuklenir, listelenir, indirilir, silinir.
Slice 2 onun ustune **hafizayi** ekler. Tek slice olsaydi, iki tamamen farkli
risk sinifi (nesne deposu tutarliligi + AI hattı) ayni denetimde karisirdi ve
biri digerini maskelerdi.

> ⚠️ **IKI migration prod'a gider.** `feature/tenant-multi-tenancy-core`'a
> yapilan her push Railway'de `db:preflight && db:migrate` calistirir
> (CLAUDE.md). **Slice 1 ve Slice 2'nin push'lari oncesinde ayrica haber
> verilir.**

> ⚠️ **Migration eklerken `database.integration.spec`'in GERI ALMA listesine de
> eklenir.** Projeler Slice 1'de ogrenilen kalici ders: eksik olan down dosyasi
> degil, onu **calistiran satirdi**. ⚠️ Bu modulde ek bir tuzak var: `0028`in
> geri alinmasi `0027`den **once** gelmelidir (chunk tablosu ebeveyne
> baglidir).

> ⚠️ **Slice 1'in ILK adimi `docker compose up -d`'dir** (§5.5). MinIO servisi
> eklendikten sonra calisan container kendiliginden guncellenmez; unutulursa
> modulun her ucu sebebi belirsiz bir baglanti hatasiyla duser.

## Kapanis denetimi (Slice 3) — **HAFIF seviye**

> **Surec kurali (Product Owner, 2026-08-10):** kapanis denetimleri **iki
> seviyelidir**. Her modul sonunda **HAFIF** denetim yapilir; **AGIR** denetim
> yalnizca birkac modulde bir yapilir ve seviyeyi Product Owner belirtir.
> Belge **HAFIF** ile kapanir.

**Yapilacaklar:**

- [x] `git status` temiz · `pnpm verify` **cikis koduna** bakilarak yesil
      (DEVELOPMENT_RULES 5.4: cikti `grep`'lenmez)
- [x] Sekiz yeni ucun **hizli** turu — gercek isteklerle, 200/401/403/413/415/422/429
- [x] **Renk turu**: `/app/documents` ve alt rotalari `#557380` gosteriyor mu —
      acik **ve** koyu temada; kabugun rozeti ve `--ai-accent` terracotta
      kaliyor mu
- [x] **§9 sinavi**: oran siniri asildiginda **429** (`Retry-After` ile);
      embedding saglayicisi hata verdiginde **502** ve govde **DisclosableProblem
      mesajini tasiyor** (maskeli degil); depoya ulasilamadiginda **502** —
      ucu de **500 DEGIL**. ⚠️ `CompletionFailedError` bugun **tetiklenemez**
      (§9); filtredeki varligi birim testiyle kilitlenir, canli turda aranmaz
- [x] **§6.1 sinavi**: desteklenmeyen tur **415**, 20 MB ustu **413**, 300 parca
      ustu **422** — ve ⚠️ **reddedilen hicbir dosya R2'ye YAZILMAMIS** olmali
      (bucket sayimi ile dogrulanir)
- [x] **§6.3 sinavi**: taranmis (metinsiz) bir PDF **201** doner, `chunkCount: 0`
      ve ekran bunu **soyluyor**
- [x] **§5.3 sinavi**: silme sonrasi hem DB satiri hem R2 nesnesi **yok**;
      dosya degisimi sonrasi eski nesne **yok**, chunk'lar **yeniden uretilmis**
- [x] **§5.2 sinavi**: iki tenant, iki belge — anahtar onekleri ayri ve bir
      tenant digerinin belgesini **hicbir ucla** okuyamiyor
- [x] ⚠️ **§8.2 OLCUMU — bu denetimin ZORUNLU maddesi** (ADR-0036'nin
      **acikca buraya biraktigi** borc): alti anlamsal + dort yapisal kaynak
      doluyken tek bir `POST /ask` cagrisinin kaynak dagilimi olculur ve
      **yazilir**. Iki sey aranir: (a) `documents` havuza **giriyor** mu,
      (b) **en az uc AYRI yapisal ses** cevapta var mi (tabanin canli kaniti)
- [x] ⚠️ **Fan-out N=10 olcumu** — N=9 (3936 ms toplam / 82 ms fan-out) ile
      karsilastirilir; darbogazin hala `LLMPort.complete` oldugu dogrulanir
- [x] Bilinen sinirlar listesi guncellenir (bu ADR + CLAUDE.md + ROADMAP §8.5:
      onuc → **onbes** tablo, vektor bes → **alti**; ROADMAP §2.3'un object
      storage satiri **kapatilir**; ADR-0009'un durumu **guncellenir**)

**Yapilmayacaklar (bilincli):**

- ❌ Sifirdan kurulum (ayri container'da bastan sona)
- ❌ Iki tenant'la **tam** RLS izolasyon turu — sema sablonu degismedi, besinci
  kez ayni; entegrasyon testleri bunu zaten kapsiyor.
  ⚠️ **Istisna:** §5.2'nin nesne deposu izolasyon sinavi **yapilir** — orada
  RLS **yoktur**, yani entegrasyon testlerinin dayandigi mekanizma da yoktur.
- ❌ R2 uzerinde yuk/dayaniklilik testi

> ### ✅ Denetim YAPILDI — 2026-08-19
>
> On bir maddenin **on biri de** kosuldu. ⚠️ Denetim **UC GERCEK KUSUR** buldu
> ve ucu de duzeltildi — hicbiri birim testleriyle gorunmuyordu:
>
> | Madde                            | Sonuc                                                                                                                                                                                           |
> | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | 1 · `git status` + `pnpm verify` | Temiz · **cikis kodu 0** (api 1732 + web 454 birim)                                                                                                                                             |
> | 2 · Sekiz ucun turu              | kimliksiz **401** · owner **201/200/204** · olmayan kayit **404** · viewer okur/indirir **200**, yazamaz/silemez **403**                                                                        |
> | 3 · Renk turu                    | Acik `#557380`/`#45626e`, koyu `#8dacba`/`#9dbdcb`; kabuk **ve** `--ai-accent` iki temada da terracotta (`#b25628` / `#e8935a`)                                                                 |
> | 4 · §9 sinavi                    | embedding cokmesi **502** + govde ULASIYOR (kayit **silinmedi**) · depo cokmesi **502** + govde ULASIYOR (kayit **acilmadi**) · oran siniri **429** + `Retry-After: 314` — ucu de **500 DEGIL** |
> | 5 · §6.1 sinavi                  | **415** (desteklenmeyen) · **413** (21 MB) · **422** (800 parca) · ⚠️ reddedilen UC dosya da R2'ye **HIC yazilmadi** (nesne sayisi 5 → 5)                                                       |
> | 6 · §6.3 sinavi                  | Metinsiz DOCX **201** + `chunkCount: 0`; ekranda uydu "ARANAMIYOR 1 · metni okunamadi", kartta kirmizi rozet, detayda tam aciklama                                                              |
> | 7 · §5.3 sinavi                  | Silme: DB satiri **ve** R2 nesnesi gitti (3 → 2) · dosya degisimi: eski nesne silindi, parcalar yeniden uretildi                                                                                |
> | 8 · §5.2 sinavi                  | Anahtarlar `tenants/<tenantId>/documents/...` onekli ve MinIO'daki nesnelerle birebir · Tenant B, A'nin belgesinde **404** (satir gorunmedigi icin ANAHTAR HIC OKUNMADI), listesi **0**         |
> | 9 · **§8.2 OLCUMU**              | ⚠️ Asagidaki blok — **taban kisiti CALISIYOR**                                                                                                                                                  |
> | 10 · Fan-out N=10                | Ortalama toplam **5030 ms**; `complete` 4458 ms + `embed` 257 ms; fan-out payi **≤315 ms (%6)**                                                                                                 |
> | 11 · Bilinen sinirlar            | Bu ADR + CLAUDE.md + ROADMAP §8.5 (onuc → **onbes** tablo, vektor bes → **alti**)                                                                                                               |
>
> **Bilincli yapilmayanlar:** ❌ sifirdan kurulum · ❌ iki tenant'la **tam** RLS
> izolasyon turu (sema sablonu degismedi, altinci kez ayni; entegrasyon
> testleri kapsiyor). ⚠️ **Istisna uygulandi:** §5.2'nin nesne deposu izolasyon
> sinavi YAPILDI — orada RLS **yoktur**, yani entegrasyon testlerinin dayandigi
> mekanizma da yoktur.
>
> ### ⚠️ OLCUM: ADR-0036'NIN TABAN KISITI GERCEKTEN CALISIYOR
>
> On katkici da doluyken (**alti** anlamsal + **dort** yapisal) tek bir
> `POST /ask` cagrisinin kaynak dagilimi, **uc farkli soruda da AYNI**:
>
> | Kaynak                 | Tur          | Satir |
> | ---------------------- | ------------ | ----- |
> | `crm-pipeline`         | yapisal      | 1     |
> | `finance-cashflow`     | yapisal      | 1     |
> | `project-status`       | yapisal      | 1     |
> | `knowledge`            | anlamsal     | 1     |
> | `crm-interactions`     | anlamsal     | 1     |
> | `project-notes`        | anlamsal     | 1     |
> | `appointment-notes`    | anlamsal     | 1     |
> | **`documents`**        | **anlamsal** | **1** |
> | `appointment-schedule` | yapisal      | 0     |
> | `finance-commentaries` | anlamsal     | 0     |
>
> Toplam **8** (global top-K), `degradedSources: []`.
>
> ✅ **UC AYRI YAPISAL SES cevapta** (`crm-pipeline` · `finance-cashflow` ·
> `project-status`) — tam olarak `ceil(8/3) = 3`. ADR-0035'in olcumunde
> `finance-cashflow` **hic giremiyordu**; taban kisiti onu iceri aldi. **Kisit
> calisiyor ve olculdu.**
>
> ✅ **`documents` SISTEMATIK OLARAK DISLANMIYOR** — uc soruda da iceride.
> Altinci anlamsal kaynagin eklenmesi onu kendiliginden disari itmedi.
>
> ⚠️ **Disarida kalan ikisi de ADR-0036'nin YAZILI BEKLENTISIDIR, kusur
> degil:**
>
> - `appointment-schedule` (yapisal): _"Dordunculuk garantisi YOK. Bugun dort
>   yapisal kaynak var, taban 3 — yani biri yine disarida kalabilir."_
> - `finance-commentaries` (anlamsal): _"Anlamsal kaynaklar arasinda taban
>   YOKTUR. Alti anlamsal kaynak bes serbest yuva icin yarisacak ve biri sifir
>   alabilir. Bu bilincli."_
>
> ⚠️ Olcum **GERCEK saglayicilarla** yapildi (OpenAI embedding + DeepSeek
> completion), yani ADR-0035'in N=9 olcumuyle dogrudan karsilastirilabilir.
> Darbogaz **degismedi**: `LLMPort.complete` (4458 ms). Fan-out payi N=9'daki
> 82 ms'ten 315 ms'e cikti — belge katkicisi bir chunk tablosunu HNSW ile
> tariyor — ama hala toplamın yalnizca **%6**'si.

## Bu karar ne zaman yeniden gozden gecirilir?

- **§8.2'nin olcumu bir anlamsal kaynagin sistematik olarak disari itildigini
  gosterince:** ADR-0036 bunu **liyakat** olarak tanimladi; yine de bir kaynak
  uc farkli soruda da sifir aliyorsa, anlamsal skorlarin kalibrasyonu
  (rerank) ayri bir ADR ile gundeme gelir.
- **Taranmis belgeler gercekten olculunce:** OCR ayri bir ADR — dis servis,
  maliyet ve gecikme profili birlikte karara baglanir.
- **Belge bazli gizlilik istenince (ya da 9. modul IK gelince):** ABAC/ACL
  karari **ertelenemez** hale gelir; §10'un urun kisiti o gun kalkar.
- **Buyuk dosyalar veya yuksek es zamanli indirme olculunce:** §5.4'un presigned
  URL reddi yeniden okunur — kisa omurlu, tek kullanimlik URL uretimi ayri bir
  karardir.
- **Yetim nesneler olculebilir bir maliyete ulasinca:** temizlik mekanizmasi
  retention karariyla (ROADMAP §8.5) **birlikte** verilir; ikisi ayni
  mekanizmayi paylasir.
- **E-imza veya onay akisi istenince:** ayri ADR — hukuki gereklilikler ve
  denetim izi (bugun **yok**) once cozulur.
- **Ikinci bir modul `StoragePort`u kullanmaya baslayinca** (Teklif/Fatura'nin
  ureteceği PDF): anahtar duzeninin `<module>` segmenti ilk kez gercekten
  kullanilir ve §5.2 tekrar okunur.
- **Sozlesme bitis tarihi / yenileme hatirlatmasi istenince:** ADR-0035'in
  hatirlatma kalemiyle **birlikte** karara baglanir — ikisi ayni zamanlayici
  yuzeyini paylasir.
