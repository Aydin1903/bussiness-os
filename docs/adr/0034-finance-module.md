# 0034 — Faz 5 / Modul 3: Finans modulu

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-11
- **Karar veren:** Product Owner
- **Faz:** 5

> **Kabul notu (2026-08-11).** ADR **tum kararlariyla** onaylandi. Uc kalem
> ayrica ve acikca soruldu, ucunde de bu metindeki oneri secildi: (1) `member`
> ve `viewer` finansi HIC gormez (§7), (2) anlamsal yuzey ISLEM ACIKLAMALARI
> degil AYRI BIR YORUM GUNLUGUDUR (§6.1), (3) kategori tenant tablosudur ve yonu
> BILESIK FK ile zorlanir (§3c).

## Baglam

Faz 5'in ilk iki modulu kapandi ve prod'da canli: CRM ([ADR-0031](0031-crm-module.md)

- [ADR-0032](0032-company-summary.md)) ve Projeler ([ADR-0033](0033-projects-module.md)).
  ROADMAP §3.5'in ucuncu sirasi **Finans**'tir: _"Gelir · gider · nakit akisi —
  finansal hafiza"_.

Zemin hazir ve bu ADR ondan **yalnizca tuketici** olarak yararlanir:

| Ne                          | CRM'de                     | Projeler'de               | Finans'ta                         |
| --------------------------- | -------------------------- | ------------------------- | --------------------------------- |
| `EmbeddingPort` / `LLMPort` | Knowledge'dan tasindi      | `shared/`'dan hazir       | **`shared/`'dan hazir**           |
| `chunking`                  | Knowledge'dan tasindi      | `shared/`'dan hazir       | **`shared/`'dan hazir**           |
| Oran siniri                 | `platform.rate_limits`'e   | Bir satir deklarasyon     | **Bir satir deklarasyon**         |
| Retrieval ucu               | `platform/context` kuruldu | Iki katkici kaydedildi    | **Iki katkici kaydedilir**        |
| RLS + `FORCE` sablonu       | MT §12.2                   | Ayni sablon, ucuncu kez   | **Ayni sablon, dorduncu kez**     |
| Kaynak bazli izin modeli    | ADR-0025'ten ilk kez       | Ayni model, ikinci kez    | **Ayni model, ucuncu kez**        |
| Cross-modul referans        | (soru dogmadi)             | ADR-0033 §2 deseni kurdu  | **Desen IKI hedefe birden**       |
| Modul imza rengi            | Mekanizma kuruldu          | Iki satir (kural sinandi) | **Iki satir** (palet + attribute) |

Ama Finans "ucuncu kez ayni sey" **degildir**. ADR-0031 kapanirken tam olarak bu
modulu isaret etmisti:

> _"Ucuncu modul (Finans) gelince: `RetrievalContributor` portunun yeterliligi
> ilk kez gercek bir sinav verir — ozellikle **sayisal/tablosal** veri anlatisal
> veriden farkli davranir."_

Gercekten yeni **bes** soru var ve hepsi asagida ayri baslikla ele aliniyor:

1. **Sayisal veri AI'a nasil baglam olur?** (§6) Bugune kadarki uc anlamsal
   kaynagin (Knowledge notlari · CRM gorusmeleri · Projeler ilerleme notlari)
   hepsi **anlatisaldi**. Bir islem satiri anlatisal degildir ve onu embed etmek
   ortak havuzu bozar.
2. **Cross-modul referans desenini genellestirme zamani mi?** (§4) ADR-0033
   acikca _"ucuncu modul benzeri bir referans isteyince genellestirme o gun
   degerlendirilir"_ demisti. Finans **iki** referans birden istiyor, yani gun
   bugundur ve karar **ertelenmez**.
3. **Bir modul TUM rollere acik olmak zorunda mi?** (§7) CRM ve Projeler'de dort
   rolun dordu de okuma aliyordu. Finans'ta almiyor — ve bunun mimari bir yan
   etkisi var (§7.1).
4. **Sozluk kodda mi tabloda mi?** (§3) Bugune kadar her sozluk kodda enum'du
   (`MembershipRole`, `OpportunityStage`, `ProjectStatus`, `TaskStatus`).
   Finans kategorisi projenin **ilk tenant-tanimli sozlugudur**.
5. **Para nasil temsil edilir?** (§2) CRM'de tutar **opsiyonel bir tahmindi**
   (`estimated_value`); Finans'ta tutar **kaydin kendisidir**. Ayni kolon tipi,
   farkli kisitlar.

Geri kalan her sey **kanitlanmis desenin tekrari**dir ve bu ADR'de kisa gecilir.

> ⚠️ **Bu ADR'nin cizdigi en onemli sinir muhasebe sinirdir.** Finans v1
> **gerceklesmis nakit hareketini** kaydeder: para girdi, para cikti. Tahakkuk
> (fatura kesildi ama tahsil edilmedi), vergi, yasal defter ve muhasebe
> entegrasyonu **kapsam disidir** (§11). Bu bir asama degil bir **sinirdir**;
> genisletme talebi ayri bir ADR ister — ROADMAP §3.5'in 9. modulunde (IK) ayni
> disiplinle cizilen sinirin aynisi.

## Karar

### 1. Yeni `finance` semasi

Mutlak Kural 5 geregi Finans kendi semasina sahiptir. `platform` disindaki
**dorduncu** sema (`knowledge`, `crm`, `projects`, `finance`). Tum tablolar RLS
`ENABLE` + `FORCE` tasir (MT §12.2 standart sablonu),
`tenant_id uuid NOT NULL REFERENCES platform.tenants(id)` icerir, bilesik
index'lerde `tenant_id` **daima ilk kolondur** ve unique kisitlar tenant-scoped'tir
(MT §12.3). **Bu paragrafta yeni bir karar yoktur.**

| Tablo                       | Kolonlar                                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `finance.categories`        | `id`, `tenant_id`, `name`, `direction`, `is_archived`, `created_at`, `updated_at`                                                                                                                                                                                                                                                                  |
| `finance.transactions`      | `id`, `tenant_id`, `direction`, `amount` (`numeric(14,2)` **NOT NULL**), `currency` (**NOT NULL**), `occurred_on` (`date`, **NOT NULL**), `description` (nullable), `category_id` (FK, **sema ici**, nullable — §3), `company_id` (**FK YOK** — §4), `project_id` (**FK YOK** — §4), `created_by_user_id` (**FK YOK**), `created_at`, `updated_at` |
| `finance.commentaries`      | `id`, `tenant_id`, `author_user_id`, `occurred_on` (`date`), `body`, `created_at`                                                                                                                                                                                                                                                                  |
| `finance.commentary_chunks` | `id`, `tenant_id` (denormalize), `commentary_id` (FK), `chunk_index`, `content`, `embedding vector(1536)`, `created_at`                                                                                                                                                                                                                            |

Notlar — hepsi ADR-0031 §1 / ADR-0033 §1'in tekrari:

- `commentary_chunks.tenant_id` denormalizasyonu `note_chunks` /
  `interaction_chunks` / `progress_note_chunks` ile **birebir ayni** gerekcedir:
  RLS politikasi JOIN'siz calissin.
- `embedding` uzerinde **HNSW**, `vector_cosine_ops`.
- `UNIQUE (commentary_id, chunk_index)` — yeniden uretimi idempotent kilar.
- `commentaries` **EKLEME-YALNIZ** bir gunluktur (ucuncu kez ayni sinir).

#### 1.1 Tablo neden `commentaries` — "her modul kendi kelimesini alir"

ADR-0033 §1.1'in kurdugu kural ucuncu kez uygulaniyor: `knowledge.notes` var,
`crm.interactions` var, `projects.progress_notes` var. Dorduncu bir `notes`
insan konusmasinda ve ROADMAP §8.5'in retention listesinde belirsizlik uretirdi.

Finans'in kelimesi **`commentaries`**'tir (arayuzde "Finansal yorum"). Icerigi
bir islem aciklamasi degil, bir **donem yorumudur**: _"Mart'ta nakit sikisti,
X musterisi odemeyi geciktirdi."_ Bu ayrim §6.1'in temelidir.

`finance.notes` ve `finance.financial_notes` elendi: birincisi yukaridaki
karisikligi uretir, ikincisi `finance.` onekiyle birlikte kendini tekrarlar.

### 2. Para: tek tablo + `direction`, ISARETLI tutar DEGIL

**Karar: gelir ve gider TEK tabloda yasar (`finance.transactions`), yon
`direction text NOT NULL CHECK (direction IN ('income','expense'))` kolonunda
tutulur, ve `amount` DAIMA POZITIFTIR.**

**(a) Neden tek tablo.** Iki tablonun (`incomes` / `expenses`) kolonlari
birebir ayni olurdu: tutar, para birimi, tarih, kategori, aciklama, uc referans.
Ayrilardi, ve nakit akisi **tanimi geregi ikisinin farki** oldugu icin her ozet
sorgusu bir `UNION ALL` ile baslardi. Ayni sekildeki veriyi ikiye bolmenin
kazanci yok, bedeli her sorguda.

**(b) Neden isaretli tutar DEGIL.** Cazip alternatif tek kolondu: gider negatif
yazilir, `direction` turetilir. **Reddedildi.** Isaret koymayi unutan **tek** bir
yazma yolu, bir gideri gelir gibi toplar ve hata **sessizdir**: ekran bir sayi
gosterir, sayi yanlistir, hicbir sey patlamaz. `direction` + `amount > 0`
kombinasyonu ayni bilgiyi tasir ama **CHECK ile zorlanabilir**, index'lenebilir
ve filtrelenebilir.

**(c) `numeric(14,2)`, `double precision` DEGIL** — ADR-0031 §1'in birebir
tekrari. Kayan noktali sayida para tutmak yuvarlama hatasi biriktirir.

**(d) `currency` NOT NULL — CRM'den bilincli SAPMA.** `crm.opportunities`'te
`estimated_value` nullable'di ve kisit _"tutar varsa para birimi zorunlu"_
seklindeydi. Burada tutar **kaydin kendisidir**: tutarsiz bir gelir/gider kaydi
diye bir sey yoktur. Dolayisiyla kosullu kisit **kosulsuza sadelesir**.
Bicim de zorlanir: `CHECK (currency ~ '^[A-Z]{3}$')` (ISO 4217 sekli; kod
listesi **dogrulanmaz**, yalnizca sekil).

**(e) `occurred_on date`, `timestamptz` DEGIL** — projede **dorduncu** kez ayni
karar (ADR-0031 §3 takip tarihi · ADR-0033 §5 son tarih). Bir odeme tarihi bir
**takvim gunudur**. Bu secim tenant bazli saat dilimi sorusunu v1'de **tumuyle
ortadan kaldirir**. Bedeli: gun ici saat verilemez.

**(f) `created_by_user_id` FK'siz** — `interactions.author_user_id` /
`tasks.assignee_user_id` ile ayni desen ve ayni gerekce (cross-schema FK yasak).

### 3. Kategori — projenin ILK tenant-tanimli sozlugu

**Karar: `finance.categories` tenant basina bir tablodur, her kategori bir
`direction` tasir, ve bu yon `transactions`'a BILESIK FK ile zorlanir.
`transactions.category_id` NULLABLE'dir.**

**(a) Neden enum DEGIL.** Bugune kadarki her sozluk kodda enum'du ve bu dogruydu:
`won`/`lost` her sirkette ayni sey demektir. Finans kategorileri **oyle
degildir** — bir yazilim sirketinin "Sunucu maliyeti" kalemiyle bir kafenin
"Hammadde" kalemi ayni listede yasayamaz. Sabit bir enum, kullanicilarin
%80'ini **"Diger"e siginmaya** iterdi ve kategori bazli ozet anlamsizlasirdi.

**(b) Neden serbest metin DEGIL.** En ucuz yol `category text` olurdu.
Reddedildi: "Kira" · "kira" · "KIRA" uc ayri kategori olur, toplamlar sessizce
bolunur ve **nakit akisi ozeti dogru gorunen yanlis sayilar uretir**. Bu, bu
projenin tekrar tekrar reddettigi sessiz hatanin en pahali turudur — cunku
ciktisi bir **sayidir** ve sayilara itiraz edilmez.

Tekillik tabloda zorlanir: `UNIQUE (tenant_id, lower(name), direction)`.

**(c) Neden kategoride `direction` var ve neden BILESIK FK.**

```sql
-- finance.categories
UNIQUE (id, direction)

-- finance.transactions
FOREIGN KEY (category_id, direction)
  REFERENCES finance.categories (id, direction)
```

Bu iki satir, _"gelir kaydina gider kategorisi"_ hatasini **veritabani
seviyesinde imkansiz** kilar. Uygulama katmani ayni kontrolu zaten yapar; buradaki
kisit uygulamayi **atlayan** her yolu (elle SQL, ileride bir ithalat betigi) da
baglar — `projects_status_valid` CHECK'iyle ayni disiplin.

Kazanc gercek: yanlis yondeki bir kategori, ozetin **kategori kirilimini**
sessizce bozardi ("Kira" kalemi gelir tarafinda gorunurdu).

**Bedeli acikca:** kullanimda olan bir kategorinin **yonu degistirilemez** —
FK reddeder ve PostgreSQL'in hata mesaji kriptiktir. Arayuz bunu **onceden**
engellemeli ("bu kategori 42 kayitta kullaniliyor, yonu degistirilemez"); yoksa
kullanici anlasilmaz bir hata gorur.

**(d) `category_id` NULLABLE.** Zorunlu kilmak, kullaniciyi tek kalemlik sahte
kategoriler acmaya iterdi — ADR-0033 §3'un **sahte "Genel" projesi** dersinin
birebir aynisi, ikinci kez. Kategorisiz kayit mesru bir durumdur: "hizli gir,
sonra siniflandir". Ozet bunu `Kategorisiz` olarak **acikca** gosterir, gizlemez.

**(e) Silme: `ON DELETE RESTRICT` + `is_archived`.** Kategori silmek gecmis
ozetleri **sessizce degistirirdi** (kayitlar kategorisize duserdi ve gecen ayin
raporu bugun baska bir sey soylerdi). Bu yuzden kullanimda olan kategori
silinemez; **arsivlenir** — yeni kayitlarda secilemez, gecmiste durur.
Kullanilmayan kategori silinebilir.

### 4. Cross-modul referans IKI hedefe birden — genellestirme REDDEDILDI

`finance.transactions` iki opsiyonel yumusak referans tasir:

| Kolon        | Hedef               | Public interface                   | Kapi izni      |
| ------------ | ------------------- | ---------------------------------- | -------------- |
| `company_id` | `crm.companies`     | `crm.public.ts` — **ZATEN VAR**    | `company:read` |
| `project_id` | `projects.projects` | `projects.public.ts` — **YAZILIR** | `project:read` |

ADR-0033 §2'nin **uc parcali deseni degistirilmeden** uygulanir: (a) FK yok
cunku yazilamaz · (b) ad denormalize edilmez, public interface'ten okunur ·
(c) okuma hedef kaynagin iznine baglidir ve kapi **arayuzun icindedir** ·
(d) sarkan isaretci tolere edilir, okuyan her yol dayanikli yazilir.

**`crm.public.ts` bu iste TEK SATIR degismez** ve bu, desenin ise yaradiginin
ilk somut kanitidir: ADR-0033'te CRM'e dokunmak icin ayri bir slice ayrilmisti;
burada CRM'e **hic dokunulmuyor**.

`projects.public.ts` yazilir ve yuzeyi `crm.public.ts` ile **birebir ayni
sekildedir**:

```
ProjectDirectory:
  findNames(input: { ids: readonly string[]; role: string })
    : Promise<ReadonlyMap<string, string>>
```

#### 4.1 Genellestirme degerlendirildi ve REDDEDILDI — gerekce mimari, "erken" degil

ADR-0033 _"genellestirme (ortak bir `ExternalRef` yardimcisi) o gun
degerlendirilir"_ demisti. Degerlendirildi:

Ortak bir `ExternalRefDirectory` yardimcisi `shared/`'a konsaydi, izin kontrolunu
**iki yoldan biriyle** ele almak zorunda kalirdi ve **ikisi de bozuk**:

1. **Izni parametre olarak disaridan almak** — `findNames(ids, role,
'company:read')`. Bu, `crm.public.ts`'in en kritik kararini (_"izin kontrolu
   bu arayuzun icinde, cagirana birakilmaz; unutan tek modul bir sizinti kapisi
   acar ve unutmak sessiz olur"_) **tersine cevirir**. Yani genellestirme, tam
   olarak desenin onlemek icin var oldugu hatayi geri getirir.
2. **Modulleri bilmek** — `shared/` bir kaynagin hangi module ait oldugunu
   bilseydi Mutlak Kural 6'yi ihlal ederdi ve `shared/`'in uc kosulundan
   (ADR-0031 §4: framework'suz · is anlami tasimaz · en az iki modul) ikincisi
   duserdi.

**Genellesen sey KOD degil SOZLESME SEKLIDIR.** `findNames(ids, role) →
ReadonlyMap<id, name>` sekli artik uc kez yazildi (`crm`, `projects`, ve
gelecekte Tedarikci/Stok) ve bir **konvansiyondur**. Kod tekrari iki tane
~40 satirlik dosyadir; bedeli, izin kapisini sahibinin elinde tutmanin fiyatidir.

> **Bu, ADR-0033'un actigi sorunun kapanmasidir.** Karar "bugun degil, sonra"
> degil; **"hayir, ve sebebi su"**. Dorduncu talip ciktiginda bu paragraf tekrar
> okunur — degisen tek sey izin kapisinin sahipligi konusundaki karar olursa
> karar da degisir.

#### 4.2 Modul bagimlilik grafigi ilk kez DALLANIYOR

```
Projeler → CRM
Finans   → CRM
Finans   → Projeler
```

Uc kenar, dongu yok — bir **DAG**. Kalan dokuz modulu baglayan kural budur:

⚠️ **Yeni bir kenar eklenmeden once dongu kontrol edilir.** Ters yon isteniyorsa
(ornegin CRM'in sirket detayinda o sirketin gelirlerini gostermesi) cozum
`forwardRef` **degildir**; projede bir kez yasandi (Tenant ↔ Identity) ve cozum
**ucuncu bir modul** oldu (`platform/session`). Ayni cozum uygulanir.

⚠️ **Sarkan isaretci sayisi ikiye cikti.** Silinen bir sirketin ve silinen bir
projenin id'si `finance.transactions`'ta kalir. ADR-0033 §2d'nin karari aynen
gecerli: veri bozulmasi degildir (UUID yeniden kullanilmaz), her okumada tespit
edilir, ve `companyName: null` / `projectName: null` gelince arayuz **hicbir sey
yazmaz** — cunku null'in uc sebebi (hic bagli degil · silinmis · izin yok)
**ayirt edilmez** ve "silinmis" yazmak bir kaydin varligini sizdirirdi.

### 5. Nakit akisi ozeti — TURETILIR, tablo YOK; ve PARA BIRIMI BAZINDA

**Karar: `GET /api/v1/finance/summary?from=&to=` deterministik bir SQL
toplamasidir. Toplam tablosu, materialized view veya `balance` kolonu YOKTUR.**

Bu, projede **altinci** kez verilen ayni karardir (`daily_report_runs.status`'un
reddi · yeniden indeksleme is listesi · yetim not tespiti · `follow_ups`
tablosunun reddi · `last_activity_at`'in reddi). Turetilebilir bilgiyi kaliciya
yazmak ikinci bir dogruluk kaynagi yaratir; bir tazeleme yolu unutuldugunda hata
**sessizdir** ve burada ciktisi bir **para rakamidir**.

Tenant basina islem sayisi binlerle olculur ve
`(tenant_id, occurred_on)` index'i sorguyu ucuz tutar. Olculebilir bir darbogaz
cikarsa cozum kolon degil **materialize edilmis gorunumdur** — o zaman tazeleme
yolu tektir ve unutulamaz.

#### 5.1 ⚠️ FARKLI PARA BIRIMLERI TOPLANMAZ

Ozet **tek bir "net" sayisi dondurmez**. Cikti para birimi basina bir satirdir:

```
[ { currency: 'TRY', income: …, expense: …, net: … },
  { currency: 'USD', income: …, expense: …, net: … } ]
```

Cevrim kapsam disidir (§11) ve bu, ADR-0031'in _"cok para birimli toplama yok —
sakladigimiz sey birim, cevirdigimiz sey degil"_ karariyla tutarlidir. Dogru
cevrim bir **kur kaynagi**, bir **kur tarihi** (islem gunu mu bugun mu) ve
tarihsel kur saklama gerektirir; ucu de ayri kararlardir.

**Tek bir sayi dondurmek, kullanicinin GOREMEYECEGI bir yanlis uretirdi** —
2000 TRY ile 2000 USD'yi toplayan bir "net" rakami, hatali oldugu belli olmayan
bir rakamdir.

**Bedeli acikca:** tek para birimi kullanan bir tenant'ta bile arayuz tek
elemanli bir liste gosterir. Kabul edildi.

Kirilim: **tarih araligi + para birimi + (opsiyonel) kategori**. Sirket/proje
bazli karlilik kirilimi **kapsam disidir** (§11) — islem listesinde filtre
olarak vardir, ozette yoktur.

### 6. Iki katkici — anlamsal ve YAPISAL

ADR-0031 §5.4'un deseni **ucuncu kez** uygulanir:

| Katkici                | Kaynak                      | Nasil calisir                            | Izin              |
| ---------------------- | --------------------------- | ---------------------------------------- | ----------------- |
| `finance-commentaries` | `finance.commentary_chunks` | Anlamsal — pgvector                      | `commentary:read` |
| `finance-cashflow`     | `finance.transactions`      | **Yapisal** — deterministik SQL, SINIRLI | `cashflow:read`   |

#### 6.1 Anlamsal yuzey YORUMLARDIR, islem aciklamalari DEGIL

**Karar (Product Owner, 2026-08-10): `transactions.description` embed EDILMEZ.
Duz bir kolon olarak kalir. Embed edilen sey `finance.commentaries`'tir.**

Bu, bu modulun ADR-0031'in isaret ettigi sinavi verdigi yerdir: _"sayisal/tablosal
veri anlatisal veriden farkli davranir."_

**Neden aciklamalar embed edilmiyor — uc sebep, agirlik sirasiyla:**

1. **Ortak havuzu kirletir.** Global top-K **8**'dir ve dort anlamsal kaynak ayni
   havuzda siralanir. "Ocak kirasi", "Subat kirasi", "Mart kirasi" birbirine
   neredeyse **ozdes** kisa vektorlerdir; bir kira sorusunda sekiz yuvanin
   yarisini bunlar doldurur ve **digerlerinin en iyi parcalarini disari iter**.
   Bu, Slice 6'da yapisal skor politikasi icin cozulen sorunun anlamsal
   tarafidir.
2. **Cevabi zaten yapisal katkici veriyor.** _"Gecen ay ne kadar harcadik"_ bir
   aciklamada yazmaz, `amount` kolonunda yazar. Onu embedding'e havale etmek,
   deterministik bir cevabi **tahmine** cevirmektir — ADR-0031 §5.4 ve ADR-0033
   §6.1'de iki kez verilmis ayni karar.
3. **Para harcar.** Her islem satiri bir embedding cagrisi demektir ve islem,
   projedeki en yuksek hacimli yazma yoludur (gunde onlarca satir mumkun).
   Karsiliginda alinan sey 1. maddede zarara donusuyor.

**Yorumlar ise gercekten anlatisaldir** ve baska hicbir kolonda yasamaz:
_"Mart'ta nakit sikisti cunku X musterisi odemeyi geciktirdi; Nisan'da toparlanmasi
bekleniyor."_ CLAUDE.md'nin _"finansal hafiza"_ ifadesinin karsiligi tam olarak
budur — rakamlar zaten tabloda, **neden**i yorumda.

⚠️ `description` **kaybolmuyor**: listede gorunur, filtrelenir ve ADR-0011'in
FTS kaleminin en dogal adayidir (klasik metin aramasi geldiginde ilk musteri
bu kolondur).

#### 6.2 Yapisal katkici RISKE GORE skor verir — duz 0.95 YASAK

Slice 6'da CRM ve Projeler icin **hizalanan** politika burada **ilk gunden**
uygulanir. Aritmetik bunu zorunlu kiliyor: artik **uc** yapisal katkici var ve
global top-K hala 8'dir. Ucu de sabit 0.95 verseydi yapisal satirlar sekiz
yuvanin tamamini kaplar ve dort anlamsal kaynak **hic girmezdi**.

```
son 30 gunun net nakit akisi NEGATIF        -> 0.95   (gercek alarm)
net pozitif ama onceki 30 gune gore DUSTU   -> 0.90   (dikkat)
saglikli                                     -> 0.75   (bilgi; anlatisala yenilir)
```

Sonuc kendi kendini duzenler: saglikli bir tenant'ta finans satirlari yuvalari
anlatisal icerige birakir, sikisik bir tenant'ta one cikar.

Katkinin icerigi **sabit ve kucuk** tutulur: para birimi basina son donem
ozeti + en buyuk N gider kategorisi. Bedeli acikca: her soruda gonderilir, yani
soru finansla ilgisiz olsa bile birkac yuz token maliyeti vardir — ve bu maliyet
artik **ucuncu** kez ekleniyor (§ Sonuclari).

### 7. Izinler — ILK KEZ dar

ADR-0025'in `resource:action` modeli, ucuncu kez.

| Permission                | owner | admin | member | viewer |
| ------------------------- | :---: | :---: | :----: | :----: |
| `transaction:read`        |  ✅   |  ✅   |   ❌   |   ❌   |
| `transaction:write`       |  ✅   |  ✅   |   ❌   |   ❌   |
| `transaction:delete`      |  ✅   |  ✅   |   ❌   |   ❌   |
| `finance_category:read`   |  ✅   |  ✅   |   ❌   |   ❌   |
| `finance_category:write`  |  ✅   |  ✅   |   ❌   |   ❌   |
| `finance_category:delete` |  ✅   |  ✅   |   ❌   |   ❌   |
| `cashflow:read`           |  ✅   |  ✅   |   ❌   |   ❌   |
| `commentary:read`         |  ✅   |  ✅   |   ❌   |   ❌   |
| `commentary:create`       |  ✅   |  ✅   |   ❌   |   ❌   |

**`member` ve `viewer` finansi HIC gormez** (Product Owner karari, 2026-08-10).
CRM ve Projeler'de dort rolun dordu de okuma aliyordu; burada cizgi farkli
cunku sirketin nakit akisi, musteri listesiyle ayni hassasiyette degildir.

**Dokuz permission da bugun AYNI kumeyi tasiyor ve bu acikca kaydediliyor:
ayrimlarin bugunku pratik degeri SIFIRDIR.** Yine de ayri tutuluyorlar —
`knowledge.permissions.ts`'in yazdigi ayni gerekceyle: _"iki permission, bugun
ayni kume — yarin bagimsiz degisebilir"_. Degeri tenant-configurable roller
(ROADMAP §1.1) geldiginde ortaya cikar; o gun _"muhasebeci islemleri girer ama
silemez"_ tek satirlik bir degisiklik olur.

**`finance_category` neden nitelenmis ad.** `category:read` global permission ad
uzayinda **tekil degildir** — Stok/Envanter (ROADMAP §3.5, 6. modul) kendi
kategorilerini isteyecek ve ayni string'i talep edecek. `progress_note` zaten
bilesik bir ad emsali kurdu. Model bozulmuyor: hala `resource:action`, yalnizca
resource daha ozgul adlandirildi.

**`cashflow:read` neden ayri bir kaynak.** _"Ozeti gorur ama tek tek islemleri
gormez"_ gercek ve klasik bir taleptir (yoneticiye toplam, muhasebeciye detay).
`opportunity:read`'in ayri tutulmasiyla ayni gerekce. Ayrica yapisal katkicinin
kapisi budur.

#### 7.1 ⚠️ `POST /ask` izin filtresi ILK GERCEK TETIKLEYICISINI buluyor

ADR-0031 §5.3 katkicilarin cagiranin izinlerine gore elenmesini _"tasarimin en
kritik detayi"_ diye tanimlamisti. Bugune kadar o kapi **hic gercekten
tetiklenmedi**: dort rolun dordu de her kaynagi goruyordu. CLAUDE.md bunu
_"kapi var, tetikci yok"_ diye kaydetti ve ADR-0033'un kapanis denetiminde
`company:read`'siz kullanici **uretilemedi** — o madde bugun hala acik.

Finans bunu degistirir: bir `member` gercekten `cashflow:read` ve
`commentary:read` **tasimaz**, dolayisiyla iki Finans katkicisi onun sorusunda
**hic cagrilmaz** ve finans icerigi cevaba **giremez**.

Bu, hafif kapanis denetiminde **gercek bir istekle** sinanabilir hale gelir ve
ADR-0033'un kapanmayan maddesi **ruhen** kapanir. ⚠️ **Harfiyen kapanmaz:**
`company:read`'i tasimayan bir rol hala yoktur; kapanan sey mekanizmanin
gercek bir rolle sinanmis olmasidir.

### 8. Silme, duzeltme ve DENETIM IZI

**`finance.transactions` GUNCELLENEBILIR ve SILINEBILIR.** Bu,
`crm.interactions` ve `projects.progress_notes`'un ekleme-yalniz cizgisinden
**bilincli bir sapmadir**: yanlis yazilmis bir tutar duzeltilebilmelidir.
Engellemek kullaniciyi telafi kayitlari (0 TL'lik satirlar, ters isaretli
"duzeltme" kalemleri) yazmaya iterdi — yani **yazilima yalan soylemeye**, ki bu
ADR-0031 §2'nin durum makinesi karariyla ayni ilkedir.

> ⚠️ **Bedeli acikca ve bu ADR'nin en rahatsiz edici satiri: DEGISIKLIK DENETIM
> IZI YOKTUR.** Bir tutarin ne zaman, kim tarafindan degistirildigi
> **sorulamaz**. `platform/audit` ARCHITECTURE §6.2'nin zincirinde yaziyor ama
> **kod olarak yoktur** (bugun `platform/` altinda `authz` · `context` ·
> `health` · `session` var). Bu borc bugune kadar teorikti; **Finans onu
> gercek yapan ilk moduldur** ve kapatilmasi ayri bir istir. Tetikleyici acik:
> Teklif/Fatura (8. modul) parayi disari cikaran belgeler uretecek ve o gun
> denetim izi **ertelenemez** hale gelir.

Cascade ve silme kurallari:

- `commentaries` → `commentary_chunks` **`ON DELETE CASCADE`** (sema ici,
  veritabani garantisi). Yorum silme v1'de **yoktur**; zincir retention ve
  ileride gelebilecek silme icin dogru sekilde kurulur.
- `categories` → `transactions` **`ON DELETE RESTRICT`** (§3e).
- `transactions` bagimsizdir; silinmesi baska hicbir satiri goturmez.
- Sema **DISINDAKI** iliskiler (`company_id`, `project_id`) yumusak referanstir
  ve okuma tarafinda tolere edilir — ADR-0033 §8'in ayrimi aynen gecerli.

### 9. Uclar, oran siniri ve yeniden indeksleme

| Uc                                        | Izin                      | Not                                                          |
| ----------------------------------------- | ------------------------- | ------------------------------------------------------------ |
| `POST /api/v1/finance/categories`         | `finance_category:write`  |                                                              |
| `GET /api/v1/finance/categories`          | `finance_category:read`   | Yon + arsiv filtresi                                         |
| `PATCH /api/v1/finance/categories/:id`    | `finance_category:write`  | Arsivleme burada; **yon degistirilemez**                     |
| `DELETE /api/v1/finance/categories/:id`   | `finance_category:delete` | Kullanimdaysa **409** (§3e)                                  |
| `POST /api/v1/finance/transactions`       | `transaction:write`       | `companyId`/`projectId` opsiyonel (§4)                       |
| `GET /api/v1/finance/transactions`        | `transaction:read`        | Tarih · yon · kategori · sirket · proje filtresi + sayfalama |
| `PATCH /api/v1/finance/transactions/:id`  | `transaction:write`       |                                                              |
| `DELETE /api/v1/finance/transactions/:id` | `transaction:delete`      |                                                              |
| `GET /api/v1/finance/summary`             | `cashflow:read`           | **Para birimi bazinda** (§5.1)                               |
| `POST /api/v1/finance/commentaries`       | `commentary:create`       | **Embedding uretir — oran sinirli**                          |
| `GET /api/v1/finance/commentaries`        | `commentary:read`         |                                                              |
| `POST /api/v1/finance/reindex`            | `commentary:create`       | Parcasiz yorumlari onarir                                    |

**Oran siniri**, `platform.rate_limits` uzerinde **tek** kalem deklare eder:
`create_commentary` (**SIGORTA** turu — para harcayan tek yazma yolu). Islem ve
kategori yazma yollari AI cagirmaz, dolayisiyla sinirlanmaz. **Dorduncu modulde
de dorduncu bir sayac tablosu acilmiyor** — desenin ise yaradiginin olcusu budur.

Yeniden indeksleme **ilk gunden** vardir; is listesi **turetilmistir**
(`LEFT JOIN ... WHERE chunk IS NULL`), ayri bir "onarilacaklar" tablosu ve deneme
sayaci **yoktur**.

### 10. Frontend — imza rengi YESIL, AI'in sesi terracotta

Renk **uretilmez**; `module-colors.css`'te ayrilmis palet kullanilir:

```
[data-module='finance']   acik: #307d54 / ink #1a6b43
                          koyu: #6cb78b / ink #7dc89b
```

⚠️ **Anahtar `finance`'tir, `finans` DEGIL.** On iki modulun hepsi Ingilizce
anahtar tasir; `sidebar.tsx` zaten `module: 'finance'` yaziyor. Turkce olan sey
**etikettir** ("Finans").

Iki satirlik is (FRONTEND §4.8): modulun kendi `layout.tsx`'inde
`<div data-module="finance" style={{ display: 'contents' }}>` (CRM/Projeler
layout'unun birebir aynisi) + sidebar satirinin `SOON` → `LIVE` tasinmasi.

> ⚠️ **`SOON` dizisi BOSALIYOR ve bu sessiz bir arayuz hatasi uretir.** Bugun
> `sidebar.tsx`'te `SOON` **tek** eleman tasiyor ve o Finans'tir. Satir `LIVE`'a
> tasininca dizi bos kalir; bolum kosullu render edilmezse **bos bir "Yakinda"
> basligi** ekranda durur. Ne lint ne tip denetimi yakalar.
> `sidebar.spec.tsx`'in placeholder testleri (bugun `['Finans']` bekliyor)
> buna gore guncellenir — bu, testin **daralmasi** degil, iddiasinin
> degismesidir.

**AI'in sesi TERRACOTTA KALIR.** Bu modulde AI'in konustugu yer bugun yalnizca
Panel'dir; modul agacinin disindadir, yani otomatik olarak dogrudur. Modul icinde
bir AI yuzeyi (ADR-0032'nin musteri ozetine karsilik gelen bir "donem yorumu
ozeti") **v1'de yoktur**; eklenirse `--ai-accent` / `--ai-ink` kullanmak
**zorundadir**.

Rotalar: `/app/finance` (islem listesi + ozet seridi) · `/app/finance/cashflow`
(nakit akisi + yorumlar) · `/app/finance/categories`. Ekranlarin ayrintili
tasarimi bu ADR'nin konusu degildir; FRONTEND §4.8'in renk kurali ve Atolye dili
baglayicidir.

### 11. Kapsam disi (bugun yapilmiyor)

**Muhasebe sinirı** — bunlar "sonra ekleriz" degil, **v1'in tanimi disidir**:

- **Fatura / teklif olusturma** — ROADMAP §3.5'in **8. modulu**; Finans'a bagimli
  oldugu icin ondan sonra gelir
- **Tahakkuk (accrual) muhasebesi** — "fatura kesildi, tahsil edilmedi";
  alacak/borc yaslandirma, odeme durumu. v1 yalnizca **gerceklesmis nakit
  hareketini** kaydeder
- **Coklu para birimi CEVRIMI** — birim saklanir, cevrilmez (§5.1)
- **Vergi / KDV hesaplama**, stopaj, beyanname
- **Muhasebe entegrasyonu** (e-fatura, Logo · Mikro · Parasut), yasal defter
- **Banka entegrasyonu / mutabakat**, ekstre ithalati, CSV ithalat-ihracat
- **Tekrarlayan islem** (her ay kira) — Projeler'in "tekrarlayan gorev"
  kalemiyle ayni sinif
- **Butce ve tahmin (forecast)**
- **Fis / makbuz eki** — object storage karari ROADMAP §3.5'te 5. module bagli
- **Harcama onay akisi** (talep → onay → odeme)
- **Sirket / proje bazli karlilik raporu** — isaretci tutulur, ozet kirilimi
  yazilmaz (§5.1)
- **Islem aciklamalarinin embed edilmesi** (§6.1)
- **Degisiklik denetim izi** (§8) — borc **gorunur kilindi**, kapatilmadi
- **Finans domain event YAYINLAMAZ** (§ Bilinen sinirlar)
- **Klasik metin aramasi** — ADR-0011'in FTS kalemi **dorduncu** kez gorunur olur
- **Modul ici AI yuzeyi** (§10)

ADR-0029/0030/0031/0033'un kapsam disi maddeleri aynen gecerlidir (dosya eki,
per-tenant saglayici secimi, Cache, hassas veri redaksiyonu, streaming, tenant
bazli saat dilimi).

## Gerekce

**Neden bu modul ucuncu sirada.** ROADMAP §3.5 sirayi belirledi ve bir bagimlilik
tasiyor: **8 → 3**. Teklif/Fatura, Finans'in veri modeli uzerine oturur; Finans'tan
once yazilirsa kendi paralel gelir modelini kurar ve sonra goc eder.

**Neden §6.1 bu ADR'nin merkezi.** ADR-0031 bu modulu isaret ederek bir sinav
tanimlamisti: sayisal veri anlatisal veriden farkli davranir. Cevap, port'u
degistirmek **degil** — `RetrievalContributor` zaten `contribute()` diyor,
`search()` demiyor ve yapisal katkici deseni sayisal veriyi zaten tasiyor.
Cevap **neyin embed edilecegi** sorusundadir ve yanlis cevabin bedeli yalnizca
Finans'ta degil, **ortak havuzda** odenir: sekiz yuvali bir havuza binlerce
neredeyse ozdes kisa vektor sokmak, diger uc modulun kalitesini dusururdu.
Yani bu karar **Finans'in degil, `POST /ask`'in kararidir**.

**Neden §4.1 "hayir" diyor.** Bir deseni ucuncu kez yazarken genellestirmemek
genelde yanlistir; burada dogru olmasinin sebebi genellestirmenin **neyi
tasimasi gerektigidir**. Tasinacak sey kod degil **izin kapisidir**, ve kapinin
sahibi kaynagin sahibi modul olmak zorundadir. Genellestirme bu sahipligi ya
cagirana ya `shared/`'a devrederdi; ikisi de ADR-0031 §5.3'un onledigi sizintiyi
geri getirir.

**Neden §7 dar.** CRM ve Projeler'de "herkes gorur" varsayilani **isin
tabiatindan** geliyordu: musteri listesi ve gorev listesi paylasilan is
gercekleridir. Nakit akisi degildir. Bu sapma ayrica **mimariye bir hizmet
ediyor**: bir izin kapisi, hicbir rol onu tetiklemiyorsa **test edilmemis bir
kapidir**. §7.1 bunu ilk kez gercek bir rolle sinanabilir hale getiriyor.

## Sonuclari

**Olumlu**

- **CLAUDE.md'nin kurucu ornegi UCTE UC tamamlanir.** _"CRM'deki musteri
  hareketlerine, **Finans'taki nakit akisina**, Projeler'deki teslim
  performansina birlikte bakar"_ — uc kaynagin ucu de yerinde olur ve `POST /ask`
  **alti kaynagi** birlestirir. Bu, urunun tanimindaki cumlenin ilk kez **tam**
  karsilanmasidir.
- **Cross-modul referans deseni ikinci ve ucuncu kez tekrarlanir** ve
  genellestirme sorusu **karara baglanir** (ertelenmez) — ADR-0033'un actigi
  madde kapanir.
- **Izin filtresi ilk gercek sinavini verir** (§7.1); bugune kadar hicbir rolun
  tetikleyemedigi kapi artik tetiklenebilir.
- **Ilk tenant-tanimli sozluk** (§3) yazilir — `MembershipRole` icin planlanan
  enum → tablo gecisinin provasi, dusuk riskli bir yerde.
- **Desen dorduncu kez ucuz calisir:** dorduncu sema, dorduncu izin katalogu,
  dorduncu oran siniri kalemi — ve **tek bir platform dosyasi degismez**.

**Olumsuz / bedeli**

- **Modul bagimlilik grafigi ilk kez dallanir** (§4.2). Finans **iki** modulu
  biliyor; yon tek ve yuzey dar ama grafik artik bir agac degil, bir DAG'dir ve
  her yeni kenar once dongu acisindan kontrol edilmelidir.
- **Yapisal katki sabit token tabanini UCUNCU kez buyutur.** Her `/ask` cagrisi
  artik uc modulden sabit metin tasiyor. Olculebilir (`ai.call`) ama hala
  zorlanmiyor.
- **Fan-out N=5 → 7.** ADR-0033'un kapanis denetimi fan-out'un kendi payini
  ~70–95 ms (toplamin %2–3'u) olcmustu ve darbogazin `LLMPort.complete` oldugunu
  gostermisti; zaman asimi butcesi **hala gerekmiyor**. ⚠️ Ama olcum **hafif
  denetimde tekrarlanmaz** (yeni surec kurali) — yani N=7'nin olculmemis
  oldugu kayda geciyor.
- **Skor kalibrasyonu borcu buyur:** dort anlamsal kaynak tek havuzda siralaniyor
  (`knowledge` · `crm-interactions` · `project-notes` · `finance-commentaries`).
  §6.1'in karari bu borcu **artirmamak** icin verildi ama kapatmiyor.
- **Retention borcu 10 → 12 tabloya cikar** (ROADMAP §8.5): `finance.commentaries`
  - `finance.commentary_chunks`. Ikincisi `vector(1536)` tasidigi icin yine
    **satir basina en pahali** siniftandir ve **vektor tasiyan tablo sayisi 3 → 4**
    olur. Dogru retention kolu `commentaries`'tir (parcalar cascade ile gider) —
    ders ucuncu kez ilk gunden uygulaniyor.
- ⚠️ **`finance.transactions` bu listeye GIRMEZ ve sebebi onemlidir:** sinirsiz
  buyur ama cozumu "eskiyi sil" **degildir** — mali kayitlarin saklanmasi yasal
  bir yukumluluktur (TTK). Yani ROADMAP §8.2'nin KVKK kontrol noktasina bir
  girdidir, ama cevabi digerlerinin tersidir: **silinmez**. Bu ayrim
  kaydedilmezse tablo "temizlenecekler" listesine yanlislikla girer.
- **Degisiklik denetim izi yoklugu ilk kez gercekten canim acitir** (§8).
- **Coklu para birimi cevrilmedigi icin arayuz tek bir net rakam gosteremez**
  (§5.1) — dogru davranis, ama kullaniciya eksik hissettirecektir.
- **Finans v1 bir muhasebe programi degildir**: fatura yok, KDV yok, e-fatura
  yok, banka yok. Bilincli (§11), ama CRM v1 ve Projeler v1'in odedigi ayni
  bedel — ve bu modulde beklenti **daha yuksektir**, cunku "finans" kelimesi
  muhasebeyi cagristirir.

## Degerlendirilen alternatifler

| Alternatif                                                | Neden secilmedi                                                                                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`crm` ya da `projects` semasini genisletmek**           | Mutlak Kural 5; ADR-0031/0033'un verdigi ayni cevap, dorduncu kez                                                                                                        |
| **Ayri `incomes` / `expenses` tablolari**                 | Kolonlar birebir ayni; her ozet sorgusu `UNION ALL` ile baslardi ve nakit akisi tanimi geregi ikisinin farkidir                                                          |
| **Isaretli tutar** (gider negatif, `direction` turetilir) | Isaret koymayi unutan tek yazma yolu gideri gelir gibi toplar ve hata **sessizdir** — cikti bir para rakamidir ve rakamlara itiraz edilmez                               |
| **`amount double precision`**                             | Kayan noktali sayida para tutmak yuvarlama hatasi biriktirir (ADR-0031 §1)                                                                                               |
| **`currency` nullable** (CRM'deki gibi kosullu CHECK)     | CRM'de tutar opsiyonel bir TAHMINDI; burada kaydin kendisidir. Kosullu kisit kosulsuza sadelesir                                                                         |
| **Kategori: sabit enum**                                  | Sirketten sirkete degisir; kullaniciyi "Diger"e siginmaya iter ve kategori bazli ozeti anlamsizlastirir                                                                  |
| **Kategori: serbest metin**                               | "Kira"/"kira"/"KIRA" toplamlari sessizce boler; nakit akisi ozeti **dogru gorunen yanlis sayilar** uretir                                                                |
| **Kategoride yon YOK** (duz kategori tablosu)             | "Gelir kaydina gider kategorisi" engellenmez; ozetin kategori kirilimi sessizce bozulur. Bilesik FK bunu iki satirla imkansiz kiliyor                                    |
| **`category_id NOT NULL`**                                | Sahte "Diger" kategorisi uretir — ADR-0033 §3'un sahte "Genel" projesi dersinin aynisi                                                                                   |
| **Kategori silmede `ON DELETE SET NULL`**                 | Gecmis ozetleri **sessizce degistirirdi**: gecen ayin raporu bugun baska bir sey soylerdi. `RESTRICT` + arsivleme gecmisi korur                                          |
| **Ortak `ExternalRefDirectory` yardimcisi** (§4.1)        | Izin kapisini ya cagirana (sizinti) ya `shared/`'a (Mutlak Kural 6) devrederdi — desenin **onlemek icin var oldugu** hatanin geri gelmesi                                |
| **`company_id` / `project_id`'ye cross-schema FK**        | Mutlak Kural 5 — tartisma konusu degil                                                                                                                                   |
| **Sirket/proje ADINI denormalize etmek**                  | Yeniden adlandirmada bayatlar; ikinci dogruluk kaynagi. Ayrica ad, ilgili izni tasimayan kullaniciya sizardi (ADR-0033 §2b/2c)                                           |
| **`finance.balances` / aylik toplam tablosu**             | Turetilebilir bilgiyi kaliciya yazmak — projede **altinci** kez reddedilen ayni karar; bir tazeleme yolu unutulunca hata sessizdir ve ciktisi bir para rakamidir         |
| **Ozette tek "net" rakami** (para birimlerini toplayarak) | 2000 TRY + 2000 USD = 4000 — kullanicinin **goremeyecegi** bir yanlis. Cevrim kur kaynagi + kur tarihi + tarihsel kur demektir; ayri bir karar                           |
| **Islem aciklamalarini embed etmek** (§6.1)               | Binlerce neredeyse ozdes kisa vektor, sekiz yuvali ORTAK havuzu kirletir ve diger uc kaynagi disari iter; cevabi zaten yapisal katkici veriyor; ve her satir para harcar |
| **Yalnizca yapisal katkici** (anlamsal yuzey hic olmasin) | "Neden nakit sikisti" hicbir kolonda yazmaz; finansal hafizanin anlatisal parcasi kaybolurdu                                                                             |
| **Yapisal katkicida duz 0.95 skor**                       | Uc yapisal katkici sekiz yuvanin tamamini kaplar ve dort anlamsal kaynak hic girmez — Slice 6'da olculmus, hizalanmis politika                                           |
| **`finance:read` / `finance:write`** (modul bazli izin)   | ADR-0025'in `resource:action` modelini bozar; CRM ve Projeler'de iki kez reddedildi                                                                                      |
| **`category:read`** (nitelenmemis ad)                     | Global permission ad uzayinda tekil degil; Stok/Envanter ayni string'i isteyecek                                                                                         |
| **Dort role de okuma vermek** (CRM/Projeler ile ayni)     | Nakit akisi musteri listesiyle ayni hassasiyette degil; ve izin kapisi bir kez daha **tetikleyicisiz** kalirdi (§7.1)                                                    |
| **Islemleri ekleme-yalniz yapmak** (`interactions` gibi)  | Yanlis tutar duzeltilemezdi; kullanici 0 TL'lik telafi kayitlari yazardi — yazilima yalan soyleme (ADR-0031 §2 ilkesi)                                                   |
| **Ayri `finance.rate_limits` tablosu**                    | `platform.rate_limits` zaten var; dorduncu modulde dorduncu tablo, ADR-0031 §4.2'nin tam olarak onledigi cogalma                                                         |
| **Tablo adi `finance.notes`**                             | `knowledge.notes` ile insan konusmasinda ve retention listesinde karisir — "her modul kendi kelimesini alir" (ADR-0033 §1.1), ucuncu kez                                 |

## Bilinen sinirlar

- **Degisiklik denetim izi YOK** (§8) — bir tutarin kim tarafindan degistirildigi
  sorulamaz. **Tetikleyici:** Teklif/Fatura (8. modul).
- **Coklu para birimi toplanmaz** (§5.1) — ozet para birimi basina ayrisir; tek
  bir konsolide rakam yoktur.
- **Sarkan `company_id` ve `project_id` temizlenmez** (§4.2) — ADR-0033'un
  `CompanyDeleted` kaydi hala gecerli ve artik **ikinci talip cikmistir**. Bu,
  ADR-0033'un yazdigi tetikleyicinin **gerceklestigi** anlamina gelir: olay
  yayinlama karari yeniden gundeme alinabilir. v1'de **hala yayinlanmiyor**
  (okuma dayanikli, islevsel hata yok) ama karar artik "ertelendi" degil,
  "acikca yeniden degerlendirildi ve ertelendi"dir.
- **Finans domain event YAYINLAMAZ.** ADR-0031 `OpportunityWon` icin
  _"tetikleyici: Finans modulu 'firsat kazanildi → fatura taslagi' isteyince"_
  demisti. **Finans v1 bunu ISTEMIYOR** cunku fatura olusturma 8. moduldedir —
  yani tetikleyici **hala cekilmedi** ve `OpportunityWon` yazilmaz. Ayni sey
  ADR-0033'un _"Finans 'proje tamamlandi → fatura taslagi' isteyince"_ kaydi icin
  de gecerlidir. **Ikisinin de gercek talibi 8. moduldur.**
- **"Parcasiz yorum" MUMKUNDUR** — ADR-0029 §4'un iki transaction'li akisinin ayni
  sonucu. Onarim mekanizmasi ilk gunden var (`POST /finance/reindex`).
- **`commentary_chunks`'ta model/surum kolonu YOK** — ADR-0029/0031/0033'un ayni
  bilinen siniri, dorduncu kez.
- **Skorlar kaynaklar arasinda KALIBRE DEGIL** ve anlamsal kaynak sayisi **dorde**
  cikiyor. §6.1'in karari borcu buyutmemek icin verildi; kapatmiyor.
- **Fan-out N=7** ve **hafif denetimde OLCULMEYECEK** (yeni surec kurali) —
  ADR-0033'un N=5 olcumu (fan-out payi %2–3, darbogaz LLM) bugunku dayanak olarak
  kalir.
- **Arama yalnizca anlamsaldir** — "aciklamasinda 'sunucu' gecen giderler" gibi
  klasik metin aramasi yok (ADR-0011, dorduncu kez). Finans'ta bu beklenti
  digerlerinden **daha gucludur**, cunku `description` duz kolon olarak duruyor.
- **Kullanimdaki kategorinin yonu degistirilemez** (§3c) — arayuz bunu onceden
  engellemezse kullanici kriptik bir FK hatasi gorur.

## Uygulama plani (slice'lar)

Sira, her slice'in **kendi basina calisan** bir sey birakmasina gore kuruldu.

| Slice | Ne                                                                                  | Migration                   |
| ----- | ----------------------------------------------------------------------------------- | --------------------------- |
| **1** | `finance` semasi + kategoriler (CRUD, yon, arsivleme) + izin katalogu               | `0023_finance_schema`       |
| **2** | Islemler (tutar/para birimi/tarih/kategori) + liste filtreleri                      | `0024_finance_transactions` |
| **3** | Nakit akisi ozeti — **para birimi bazinda** (§5)                                    | —                           |
| **4** | Cross-modul referans: `companyId`/`projectId` yazma yolu + **`projects.public.ts`** | —                           |
| **5** | Yorumlar + embedding + `reindex` + oran siniri                                      | `0025_finance_commentaries` |
| **6** | Iki katkici (`finance-commentaries` · `finance-cashflow`)                           | —                           |
| **7** | **HAFIF** kapanis denetimi (asagidaki liste)                                        | —                           |

`company_id` ve `project_id` **kolonlari Slice 2'de acilir**, yazma yolu Slice
4'e birakilir — ADR-0033 Slice 1'in ogrettigi ders (dogrulanamayan bir isaretciyi
kabul etmek, ilk gunden sarkan satir uretmektir). Boylece Projeler'e dokunulan
tek slice ayrik kalir (Mutlak Kural 1-2), ADR-0033'un `crm.public.ts`'i ayri bir
slice'a koymasiyla birebir ayni disiplin.

> ⚠️ **Uc migration prod'a gider.** `feature/tenant-multi-tenancy-core`'a yapilan
> her push Railway'de `db:preflight && db:migrate` calistirir (CLAUDE.md).
> Slice 1, 2 ve 5'in push'lari **oncesinde ayrica haber verilir**.

> ⚠️ **Migration eklerken `database.integration.spec`'in GERI ALMA listesine de
> eklenir.** Projeler Slice 1'de ogrenilen kalici ders: eksik olan down dosyasi
> degil, onu **calistiran satirdi**.

## Kapanis denetimi (Slice 7) — **HAFIF seviye**

> **Yeni surec kurali (Product Owner, 2026-08-10):** kapanis denetimleri artik
> **iki seviyelidir**. Her modul sonunda **HAFIF** denetim yapilir; **AGIR**
> denetim yalnizca birkac modulde bir veya kilometre taslarinda yapilir ve
> seviyeyi Product Owner belirtir. Finans **HAFIF** ile kapanir.

**Yapilacaklar:**

- [ ] `git status` temiz · `pnpm verify` **cikis koduna** bakilarak yesil
      (DEVELOPMENT_RULES 5.4: cikti `grep`'lenmez)
- [ ] On iki yeni ucun **hizli** turu — gercek isteklerle, 200/401/403/429
- [ ] **Dar rollerin `finance` semasina gorunmedigi**: uc dar rolun sema `USAGE`
      yetkisi `false`, tablo grant sayisi `0`
- [ ] **Renk turu**: `/app/finance` ve alt rotalari **yesil** gosteriyor mu —
      acik **ve** koyu temada; kabugun rozeti terracotta kaliyor mu
- [ ] **`SOON` bolumu** bosaldiginda bos baslik birakmiyor mu (§10)
- [ ] **§7.1 sinavi**: `member` rolunde bir kullanici `POST /ask` cagirdiginda
      iki Finans katkicisi **hic cagrilmiyor** ve finans icerigi cevaba
      girmiyor — izin filtresinin **ilk gercek testi**
- [ ] Bilinen sinirlar listesi guncellenir (bu ADR + CLAUDE.md + ROADMAP §8.5)

**Yapilmayacaklar (bilincli):**

- ❌ Sifirdan kurulum (ayri container'da bastan sona)
- ❌ Fan-out gecikmesi olcumu (N=7)
- ❌ Iki tenant'la tam RLS izolasyon turu — sema sablonu degismedi, dorduncu kez
  ayni; entegrasyon testleri bunu zaten kapsiyor

## Bu karar ne zaman yeniden gozden gecirilir?

- **Teklif/Fatura (8. modul) gelince:** uc kalem birden acilir — **denetim izi**
  (§8), `OpportunityWon` / proje tamamlandi **domain event'leri**, ve tahakkuk
  (alacak/borc) modeli. Bu ADR'nin en cok baskiya girecegi gun odur.
- **Dorduncu cross-modul referans talibi cikinca:** §4.1'in "hayir"i tekrar
  okunur; degisecek tek sey izin kapisinin sahipligi konusundaki karardir.
- **Kur cevrimi istenince:** ayri ADR — kur kaynagi, kur tarihi ve tarihsel kur
  saklama, ucu birden.
- **Muhasebe entegrasyonu istenince:** ayri ADR ve muhtemelen ayri modul; §11'in
  sinirı bir asama degil bir sinirdir.
- **Tenant-configurable roller gelince:** §7'nin dokuz permission'i bugun ayni
  kumeyi tasiyor; degeri o gun ortaya cikar ("muhasebeci girer ama silemez").
- **Anlamsal kaynak sayisi bese cikinca:** skor kalibrasyonu ve rerank artik
  ertelenemez; §6.1 borcu buyutmemek icin verilmis bir karardi, kapatan degil.
- **Islem hacmi olculebilir bir darbogaz uretince:** ozet icin materialize
  edilmis gorunum (§5) — kolon **degil**.
