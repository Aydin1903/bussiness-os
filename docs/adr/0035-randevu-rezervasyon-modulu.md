# 0035 — Faz 5 / Modul 4: Randevu / Rezervasyon modulu

- **Durum:** Onerildi
- **Tarih:** 2026-08-12
- **Karar veren:** Product Owner
- **Faz:** 5

> **Not.** Bu ADR yalnizca **karari** yazar; kod yazilmadi. Uygulama, asagidaki
> slice planina gore ayri ayri onaylanarak ilerler (CLAUDE.md Calisma Akisi).

## Baglam

Faz 5'in ilk uc modulu kapandi ve prod'da canli: CRM ([ADR-0031](0031-crm-module.md) +
[ADR-0032](0032-company-summary.md)) · Projeler ([ADR-0033](0033-projects-module.md)) ·
Finans ([ADR-0034](0034-finance-module.md)). ROADMAP §3.5'in dorduncu sirasi
**Randevu / Rezervasyon**'dur: _"Takvim tabanli kayit"_. **Besinci sema.**

Zemin hazir ve bu ADR ondan **yalnizca tuketici** olarak yararlanir:

| Ne                       | CRM'de                     | Projeler'de              | Finans'ta               | Randevu'da                        |
| ------------------------ | -------------------------- | ------------------------ | ----------------------- | --------------------------------- |
| `EmbeddingPort`          | Knowledge'dan tasindi      | `shared/`'dan hazir      | `shared/`'dan hazir     | **`shared/`'dan hazir**           |
| Oran siniri              | `platform.rate_limits`'e   | Bir satir deklarasyon    | Bir satir deklarasyon   | **Bir satir deklarasyon**         |
| Retrieval ucu            | `platform/context` kuruldu | Iki katkici              | Iki katkici             | **Iki katkici**                   |
| RLS + `FORCE` sablonu    | MT §12.2                   | Ikinci kez               | Ucuncu kez              | **Dorduncu kez**                  |
| Kaynak bazli izin modeli | ADR-0025'ten ilk kez       | Ikinci kez               | Ucuncu kez (**dar**)    | **Dorduncu kez**                  |
| Cross-modul referans     | (soru dogmadi)             | ADR-0033 §2 deseni kurdu | Iki hedef; §4.1 "hayir" | **Ayni desen, YENI bir dizin**    |
| Modul imza rengi         | Mekanizma kuruldu          | Kural sinandi            | Iki satir               | **Iki satir** (palet + attribute) |
| `module-kit`             | Orada dogdu                | Cikarildi (Slice 5a)     | Tuketti                 | **Tuketir + BIR bilesen ekler**   |

Ama Randevu "dorduncu kez ayni sey" **degildir**. Gercekten yeni **dort** soru
var ve dorduncu de asagida ayri baslikla ele aliniyor:

1. **Bir modul chunk tablosu OLMADAN embedding tutabilir mi?** (§3) Bugune kadar
   dort anlamsal kaynagin **dordu de** ayri bir `*_chunks` tablosu tasidi.
   Randevu tasimaz — ve bu, chunking'in ne zaman gerekli oldugu sorusuna verilen
   ilk **"hayir"**dir.
2. **Cross-modul referans dizini SIRKET degil KISI oldugunda ne olur?** (§4)
   `crm.public.ts` bugun yalnizca `CompanyDirectory` tasiyor. Randevu bir CRM
   **kisisine** baglanir, yani CRM'e **yeni bir dizin eklenir** — ADR-0034'un
   _"CRM'e hic dokunulmuyor"_ satiri bu modulde **yanlislanir** (§4.2).
3. **Takvim gorunumu bir kutuphane mi ister?** (§7) Projedeki her "agir
   kutuphane" talebi bugune kadar reddedildi (bar grafikte `recharts`); takvim
   bu reddin **en zor sinavidir** cunku takvim gercekten karmasik gorunur.
4. **Anlamsal kaynak sayisi BESE cikiyor.** (§6.3) ADR-0034 bunu bir **yeniden
   gozden gecirme tetikleyicisi** olarak yazmisti: _"Anlamsal kaynak sayisi bese
   cikinca: skor kalibrasyonu ve rerank artik ertelenemez."_ **Tetikleyici bu
   modulle cekiliyor** ve bu ADR onu gormezden gelemez.

> ⚠️ **Bu ADR'nin cizdigi sinir bir TAKVIM sinirdir.** Randevu v1 **kaydedilmis
> bir bulusmayi** tutar: ne zaman, ne kadar surecek, kiminle, ne icin. Musteriye
> hatirlatma gondermek, musterinin kendi kendine rezervasyon yapmasi, tekrarlayan
> randevu ve coklu personel takvimi **kapsam disidir** (§10). Bu bir asama degil
> bir **sinirdir**; genisletme talebi ayri bir ADR ister — ADR-0034'un muhasebe
> siniriyla ayni disiplin.

## Karar

### 1. Yeni `appointments` semasi — ve anahtar `booking` DEGIL

Mutlak Kural 5 geregi Randevu kendi semasina sahiptir. `platform` disindaki
**besinci** sema (`knowledge`, `crm`, `projects`, `finance`, `appointments`).
Tum tablolar RLS `ENABLE` + `FORCE` tasir (MT §12.2 standart sablonu),
`tenant_id uuid NOT NULL REFERENCES platform.tenants(id)` icerir, bilesik
index'lerde `tenant_id` **daima ilk kolondur** ve unique kisitlar
tenant-scoped'tir (MT §12.3). **Bu paragrafta yeni bir karar yoktur.**

| Tablo                       | Kolonlar                                                                                                                                                                                                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appointments.appointments` | `id`, `tenant_id`, `crm_contact_id` (nullable, **FK YOK** — §4), `service_note` (`text`, nullable), `embedding` (`vector(1536)`, nullable — §3), `scheduled_at` (`timestamptz`, **NOT NULL**), `duration_minutes` (`integer`, **NOT NULL**), `status`, `created_by_user_id` (**FK YOK**), `created_at`, `updated_at` |

Notlar:

- `embedding` uzerinde **HNSW**, `vector_cosine_ops` — dort kez uygulanmis ayni
  index karari.
- Index'ler: `(tenant_id, scheduled_at)` (takvim penceresi sorgusu — modulun
  **birincil** okuma yolu) ve `(tenant_id, crm_contact_id)` (kisi bazli liste).
- `created_by_user_id` FK'siz — `interactions.author_user_id` /
  `transactions.created_by_user_id` ile ayni desen ve ayni gerekce.

#### 1.1 ⚠️ Sema, modul ve `data-module` anahtari UCU DE `appointments`

`module-colors.css` bugun bu modulun paletini **`[data-module='booking']`**
altinda tasiyor. **Anahtar `appointments` olarak degistirilir; RENK DEGISMEZ**
(deger bloguna dokunulmaz, yalnizca secici adi).

Gerekce, projenin uc kez yazdigi kuralin devamidir: `crm` · `projects` ·
`finance` — semanin adi, modulun adi ve `data-module` anahtari **ayni
kelimedir**. Sema `appointments`, anahtar `booking` olsaydi ortaya **iki adli
tek bir modul** cikardi ve hata **sessiz** olurdu: `data-module="appointments"`
yazan bir layout hicbir paletle eslesmez, ekran calisir ve **terracotta kalir** —
FRONTEND §4.8'in adiyla kaydettigi tuzagin tam olarak kendisi.

Degisiklik **tek satirdir** ve `booking` string'i bugun kod tabaninda **baska
hicbir yerde gecmiyor** (dogrulandi). Turkce olan sey yine **etikettir**
("Randevular").

### 2. Randevu: tek tablo, durum kodda ENUM

**Karar: `status text NOT NULL CHECK (status IN ('scheduled','completed','cancelled','no_show'))`
— dort deger, KODDA sabit, tenant-tanimli DEGIL.**

**(a) Neden ADR-0034'un tenant-tanimli sozlugu DEGIL.** Finans kategorisi
tenant tablosuna cikti cunku _"Sunucu maliyeti"_ ile _"Hammadde"_ ayni listede
yasayamaz. Randevu durumu **oyle degildir**: bir randevu ya planlanmistir, ya
gerceklesmistir, ya iptal edilmistir, ya da **kisi gelmemistir**. Bu dort hal
her sektorde ayni sey demektir — `OpportunityStage` ve `TaskStatus`'un ayni
degerlendirmesi. Tenant tablosuna cikarmak §6.2'nin yapisal katkicisini de
bozardi: "gelmedi orani" ancak `no_show`'un **anlami sabitse** hesaplanabilir.

**(b) `no_show` neden `cancelled`'dan AYRI.** Ikisi de "randevu gerceklesmedi"
demektir ama **isletme icin ayni sey degildir**: iptal bir haberdir, gelmemek
bir **kayiptir** (ayrilan zaman bosa gitti). Tek degerde birlestirmek, §6.2'nin
alarm sinyalini **tumuyle yok ederdi** — "gelmedi orani" diye bir sey
hesaplanamazdi. Bu, projede tekrar tekrar verilen "iki farkli olguyu tek kolona
sikistirma" kararinin bu moduldeki karsiligidir.

**(c) `scheduled_at timestamptz`, `date` DEGIL — ONCEKI UC MODULDEN BILINCLI
SAPMA.** ADR-0031 §3 (takip tarihi), ADR-0033 §5 (son tarih) ve ADR-0034 §2e
(odeme gunu) `date` secmisti ve gerekce her seferinde ayniydi: _"bir takvim
gunudur, saat bilgisi tasimaz."_ **Randevu bunun tam tersidir** — 14:30'da olan
bir bulusmayi `date` ile temsil etmek modulun **var olus sebebini** yok eder.

⚠️ **Bedeli acikca: bu modul, tenant bazli saat dilimi sorusunu ONCEKI UC
MODULUN ERTELEDIGI YERDEN GERI GETIRIR.** `timestamptz` UTC'de saklar ve
dogru sorudur; ama _"bu randevu saat kacta"_ sorusunun cevabi **okuyanin saat
dilimine** baglidir. v1'in karari: **sunucu UTC dondurur, cevrimi istemci
yapar** (tarayicinin kendi saat dilimi). Tek bir sehirde calisan bir isletme
icin bu dogru davranir. Cok bolgeli bir tenant icin **yanlis gorunur** ve
tenant bazli saat dilimi ayari ayri bir karardir (§10) — ⚠️ **bu, ADR-0029'dan
beri ertelenen kalemin ilk kez GORUNUR bir yanlis uretebildigi moduldur.**

**(d) `duration_minutes integer`, `ends_at` kolonu DEGIL.** Bitis zamani
`scheduled_at + duration_minutes` ile **turetilir**. Projede **yedinci** kez
verilen ayni karar (`last_activity_at`'in reddi, `finance.balances`'in reddi,
`daily_report_runs.status`'un reddi …): iki kolon tutulsaydi biri guncellenip
digeri unutuldugunda hata **sessiz** olurdu ve takvim gridinde **ust uste binen
bir blok** cizilirdi. `CHECK (duration_minutes > 0)`.

**(e) Cakisma kontrolu YOK.** Iki randevu ayni saate yazilabilir. Engellemek
**coklu personel takvimi** demektir (§10 — kapsam disi): tek takvimde cakisma
bir hatadir, iki personelli bir isletmede **normaldir**. Yanlis tarafa
karar vermek yerine v1 **kayit tutar, kural koymaz**; takvim gridi cakisan
bloklari **yan yana** cizerek durumu gorunur kilar (§7).

### 3. ⚠️ CHUNK TABLOSU YOK — tek satira tek embedding

**Karar: `service_note` DOGRUDAN `appointments.appointments.embedding`
kolonunda gomulur. `appointment_note_chunks` diye bir tablo ACILMAZ.**

Bu, dort modulde uygulanmis desenden **bilincli ve gerekceli** bir sapmadir:
`knowledge.note_chunks` · `crm.interaction_chunks` ·
`projects.progress_note_chunks` · `finance.commentary_chunks` — dordu de ayri
tablo. Randevu besincisini **acmaz**.

**(a) Chunking neyi cozer.** `shared/chunking.ts` uzun **anlatisal** govdeleri
boler: bir gorusme notu sayfalarca olabilir ve tek bir vektor, uzun metnin
yalnizca ortalamasini temsil eder — spesifik bir cumle kaybolur. Randevunun
`service_note`'u boyle bir metin **degildir**: _"Dis temizligi + kontrol; sol
ust azida hassasiyet var"_. Bir randevu **tek seferlik bir olaydir** ve notu
tanimi geregi **kisadir**.

**(b) Ikinci tablonun bedeli bedavaya gelmiyor.** Her chunk tablosu su anda
sunlari beraberinde getiriyor: ayri RLS politikasi, ayri `tenant_id`
denormalizasyonu, `UNIQUE (parent_id, chunk_index)`, `ON DELETE CASCADE`
zinciri, retention listesinde **ikinci** bir satir, ve "parcasiz kayit"
durumunu tespit eden `LEFT JOIN`. Bir randevu icin bunlarin **tamami tek bir
satirin NULL'lugu** ile ifade edilebiliyorsa, tabloyu acmak yapiyi
**gerekcesiz** buyutmektir.

**(c) `embedding IS NULL` mesru bir durumdur ve zaten ele alinmak zorundadir.**
Notsuz randevu **cok yaygindir** (takvime saat yazmak icin kurulmus bir kayit).
Yani "vektoru olmayan satir" bu modulde bir **ariza degil normaldir** — ayni
kolon, ADR-0029 §4'un iki transaction'li akisinin uretebildigi
"gomulememis" halini de tasir ve **ayni onarim yolu** (`POST /appointments/reindex`)
ikisini birden kapatir.

**(d) ⚠️ BEDELI: UZUNLUK ARTIK BIR SINIRDIR VE ZORLANMALIDIR.** Chunking yokken
`service_note` embedding modelinin girdi sinirini asarsa ne olacagi
**belirlenmelidir**; belirlenmezse hata sessiz olur — adapter metni **sessizce
kirpar** ve kullanici notunun yarisinin arandigini **hic ogrenemez**.

**Karar: domain katmaninda SERT bir karakter siniri konur** (`shared/chunking.ts`in
tek parca hedefiyle ayni buyukluk sinifi) ve **asilirsa 422 doner**. Sessiz
kirpma **yasaktir**. Uzun bir metin yazmak isteyen kullanicinin dogru yeri
zaten Knowledge notu veya CRM gorusmesidir.

> **Bu karar geri alinabilir ve yonu tektir:** ileride gercekten uzun randevu
> notlari gorulurse `appointment_note_chunks` **eklenebilir** (kolon bosaltilir,
> parcalar tabloya tasinir). Tersi — dort tabloyu birlestirmek — mumkun degildir.
> Ucuz olan yonde durmak dogrudur.

### 4. Cross-modul referans: `crm_contact_id` — YENI bir dizin, AYNI sozlesme

`appointments.appointments` **tek** opsiyonel yumusak referans tasir:

| Kolon            | Hedef          | Public interface                              | Kapi izni      |
| ---------------- | -------------- | --------------------------------------------- | -------------- |
| `crm_contact_id` | `crm.contacts` | `crm.public.ts` — **YENI `ContactDirectory`** | `contact:read` |

ADR-0033 §2'nin **uc parcali deseni degistirilmeden** uygulanir: (a) FK yok
cunku yazilamaz (Mutlak Kural 5) · (b) ad denormalize **edilmez**, public
interface'ten okunur · (c) okuma hedef kaynagin iznine baglidir ve kapi
**arayuzun icindedir** · (d) sarkan isaretci tolere edilir, okuyan her yol
dayanikli yazilir.

Sozlesme sekli **birebir aynidir** — ADR-0034 §4.1'in _"genellesen sey kod degil
SOZLESME SEKLIDIR"_ karari **dorduncu kez** dogrulanir:

```
ContactDirectory:
  findNames(input: { ids: readonly string[]; role: string })
    : Promise<ReadonlyMap<string, string>>
```

**Genellestirme yeniden degerlendirildi ve YINE REDDEDILDI.** ADR-0034 §4.1
_"dorduncu talip ciktiginda bu paragraf tekrar okunur"_ demisti; okundu.
Degisen tek sey **izin kapisinin sahipligi konusundaki karar** olsaydi cevap
degisirdi — degismedi. Ortak bir `ExternalRefDirectory` hala kapiyi ya cagirana
(sizinti) ya `shared/`'a (Mutlak Kural 6) devrederdi.

#### 4.1 Bagimlilik grafigi — dorduncu kenar, hala DAG

```
Projeler → CRM
Finans   → CRM
Finans   → Projeler
Randevu  → CRM        ← YENI
```

Dort kenar, dongu yok. ⚠️ Ters yon (CRM'in kisi detayinda o kisinin
randevularini gostermesi) bir modul dongusu kurar; cozum `forwardRef`
**degildir** — projede bir kez yasandi (Tenant ↔ Identity) ve cozum **ucuncu
bir modul** oldu. Ayni cozum uygulanir.

⚠️ **Sarkan isaretci sayisi UCE cikti** (`company_id`, `project_id`,
`crm_contact_id`). Karar aynen gecerli: veri bozulmasi degildir, her okumada
tespit edilir, ve `contactName: null` gelince arayuz **hicbir sey yazmaz** —
null'in uc sebebi (hic bagli degil · silinmis · izin yok) **ayirt edilmez** ve
"silinmis" yazmak bir kaydin varligini sizdirirdi.

#### 4.2 ⚠️ Bu modul CRM'E DOKUNUYOR — ADR-0034'un satiri BURADA yanlislaniyor

ADR-0034 §4 su cumleyi kurmustu ve desenin ise yaradiginin kaniti diye
kaydetmisti:

> _"`crm.public.ts` bu iste TEK SATIR degismez."_

**Randevu'da degisir.** Sebep dizinin **turudur**: bugune kadar iki modul de
CRM'in **sirketine** baglandi ve `CompanyDirectory` zaten vardi. Randevu bir
**kisiye** baglanir; kisi adlarini veren bir dizin **hic yazilmadi**.

Bu, desenin bir zayifligi **degildir** — kapsaminin dogru olcusudur: yeni bir
**kaynak turu** talep edildiginde o kaynagin sahibi modul **kendi dizinini
yazar** ve kendi izin kapisini (`contact:read`) kendi eliyle kurar. Yeni bir
**talip** eklendiginde ise (ADR-0034'un iki referansi) hicbir sey degismez.

⚠️ **Mutlak Kural 1-2 geregi bu is KENDI SLICE'INDA yapilir** (Slice 2) ve
olcusu sudur: **yalnizca ekleme, sifir davranis degisikligi, mevcut testler
kirmizi yanmaz.** CRM'e dosyaya **eklenir**, dosyada **duzenlenmez**;
`CompanyDirectory`nin tek satiri degismez ve hicbir imza kirilmaz. ADR-0033'un
`crm.public.ts`'i ayri bir slice'a koymasiyla **birebir ayni disiplin**, ikinci
kez.

> **Duzeltme (Slice 2 uygulandiktan sonra yazildi).** Bu paragrafin ilk hali
> olcuyu _"kapsami TEK DOSYAYA + onun testine kapalidir"_ diye yaziyordu ve bu
> **iyimserdi**. Gercekte CRM tarafinda **bes dosya** gerekti — cunku bir dizin
> tek basina yasamaz: `crm.public.ts` (arayuz) · `contact.repository.port.ts`
> (`findNamesByIds`) · `drizzle-contact.repository.ts` (implementasyon) ·
> `contact-directory.query.ts` (izin kapisi) · `crm.module.ts` (baglanti).
> `CompanyDirectory` de tam olarak bu bes parcadan olusuyor.
>
> Olculen sonuc: **134 ekleme, 3 "silinen" satir** — ve ucu de genisletilen
> `import`/`export` satiriydi (`CRM_CONTACT_DIRECTORY` ve `inArray` eklendi),
> yani **sifir davranis degisikligi**. CRM'in 64 birim + 89 entegrasyon testi
> tek satiri duzenlenmeden yesil kaldi.
>
> Dogru olcu **dosya sayisi degildir**: bir dizin bes dosyaya dokunup hicbir
> davranisi degistirmeyebilir, ya da tek dosyada bir imzayi kirabilir. Bagimsiz
> denetlenebilirligi saglayan sey, degisikligin **eklemeli** olmasi ve mevcut
> testlerin **dokunulmadan** yesil kalmasidir.

### 5. Yasam dongusu, silme ve guncelleme

**Randevu GUNCELLENEBILIR ve SILINEBILIR.** Randevu ertelenir, suresi degisir,
saati kayar — bu, modulun **normal** kullanimidir; ADR-0034'un `transactions`
icin verdigi ayni karar, ayni gerekceyle (engellemek kullaniciyi sahte kayitlar
uretmeye, yani **yazilima yalan soylemeye** iterdi).

- Silme **fiziksel**tir; `appointments` bagimsizdir ve silinmesi baska hicbir
  satiri goturmez (chunk tablosu **yok** — §3).
- `service_note` degistiginde **embedding YENIDEN URETILIR**. ⚠️ Unutulursa
  hata **sessizdir**: arama eski metni bulur. Bu yuzden yeniden uretim,
  guncelleme use-case'inin **ayni transaction sirasinda** yapilir ve bir
  entegrasyon testi kilitler.
- ⚠️ **Degisiklik denetim izi YOK** — ADR-0034 §8'in acikca gorunur kildigi
  borc **bu modulde de** gecerlidir: bir randevunun saatini kimin degistirdigi
  **sorulamaz**. Tetikleyici degismedi (Teklif/Fatura, 8. modul).

### 6. Iki katkici — yapisal ve anlamsal

ADR-0031 §5.4'un deseni **dorduncu kez** uygulanir:

| Katkici                | Kaynak                      | Nasil calisir                              | Izin               |
| ---------------------- | --------------------------- | ------------------------------------------ | ------------------ |
| `appointment-schedule` | `appointments.appointments` | **Yapisal** — deterministik SQL, SINIRLI   | `appointment:read` |
| `appointment-notes`    | `appointments.appointments` | Anlamsal — pgvector, **tek satir vektoru** | `appointment:read` |

⚠️ **Ikisi de AYNI tabloyu okur** ve bu, projede ilk kez oluyor — onceki
modullerde yapisal ve anlamsal katkici **farkli tablolara** bakiyordu. Sorun
degildir: ayrim tabloda degil **soruda**dir (biri "takvim nasil gidiyor",
digeri "sunu ne zaman konusmustuk"), ve `source` etiketleri ayri oldugu icin
`degradedSources` ve atif dogru calisir.

#### 6.1 Anlamsal katkici — baglam basligi kisi adini TASIR

Gomulen metin ciplak `service_note` **degildir**; onune **baglam basligi**
konur — projede dorduncu kez ayni karar:

```
[Randevu · 2026-08-20 · Ahmet Yilmaz] Dis temizligi + kontrol; sol ust azida hassasiyet var
```

Uc parca: **sabit etiket** (kaynagin ne oldugunu metne yazar) + **randevu
tarihi** + **varsa bagli CRM kisisinin adi**.

**Neden gerekli.** Randevunun kimligi (kiminle, ne zaman) **kolonlardadir,
metinde degil**. Kullanici _"Dis temizligi"_ yazar; _"Ahmet Yilmaz"_ kelimesi
hic gecmez ve _"Ahmet Yilmaz'la ne konusmustuk"_ sorusu **hicbir satirla
eslesmez**.

**Neden ad eklemek KURALA UYGUN.** `withProjectHeader` proje adini,
`Interaction` sirket adini basliga koydu; ikisi de ayni bedeli odedi
(denormalizasyon) ve ayni telafiyi kurdu: **yeniden indeksleme ucu ILK GUNDEN
vardir**. Kisi yeniden adlandirilirsa eski satirlar eski adi tasir — ta ki
`POST /appointments/reindex` calisana kadar. ⚠️ Telafi mekanizmasi olmasaydi ad
basliga **konamazdi**.

⚠️ Basliga **yalnizca bir ad** girer (ADR-0033'un _"ikinci bir denormalize ad
ikinci bir bayatlama yuzeyi demektir"_ kurali).

#### 6.2 Yapisal katkici RISKE GORE skor verir — duz 0.95 YASAK

Slice 6'da CRM ve Projeler icin **hizalanan**, Finans'ta **ilk gunden**
uygulanan politika burada da **ilk gunden** uygulanir. Aritmetik bunu zorunlu
kiliyor: artik **dort** yapisal katkici var ve global top-K hala **8**'dir.
Dordu de sabit 0.95 verseydi yapisal satirlar sekiz yuvanin **yarisindan
fazlasini** kaplardi.

```
son donemde GELMEDI ORANI yuksek (no_show esigi asildi)  -> 0.95   (gercek alarm)
BUGUN ve YARIN icinde yaklasan randevu var               -> 0.90   (dikkat)
saglikli                                                  -> 0.75   (bilgi; anlatisala yenilir)
```

Sonuc kendi kendini duzenler: sakin bir takvimde randevu satirlari yuvalari
anlatisal icerige birakir, dolu veya sorunlu bir takvimde one cikar.

Katkinin icerigi **sabit ve kucuk** tutulur: yaklasan randevularin sayisi ve en
yakin birkac tanesi + donem ozeti (toplam / tamamlanan / gelmeyen). Bedeli
acikca: her soruda gonderilir, yani soru randevuyla ilgisiz olsa bile birkac yuz
token maliyeti vardir — ve bu maliyet artik **dorduncu** kez ekleniyor.

`no_show` esigi bir **sabit**tir ve ⚠️ **web'de bir karsiligi olursa ikisi
senkron kalmak zorundadir** — `CRM_STALE_STAGE_DAYS` / `STALE_STAGE_DAYS`
ayrismasinin ayni sinifi; ayrisirlarsa hata sessizdir (ekran "sorunlu" der,
katkici 0.75 verir).

#### 6.3 ⚠️ ADR-0034'un TETIKLEYICISI CEKILDI: anlamsal kaynak sayisi BESE cikiyor

ADR-0034 "Bu karar ne zaman yeniden gozden gecirilir?" bolumunde su satiri
yazmisti:

> _"Anlamsal kaynak sayisi bese cikinca: skor kalibrasyonu ve rerank artik
> ertelenemez."_

Bu modul o kaynagi ekliyor: `knowledge` · `crm-interactions` · `project-notes` ·
`finance-commentaries` · **`appointment-notes`**. Tetikleyici **cekilmistir** ve
bu ADR onu **sessizce gecemez**.

**Karar: rerank v1'e ALINMAZ, ama borc "ertelendi" olarak degil, OLCULMESI
GEREKEN bir kalem olarak yazilir.** Uc gerekce:

1. **Bu modul havuz baskisini digerlerinden AZ artiriyor** (§3). Onceki dort
   kaynagin her biri bir kayda **birden cok** chunk yaziyor; Randevu **kayit
   basina tek vektor** yaziyor ve notsuz randevular **hic** yazmiyor. Yani
   besinci kaynak, oncekilerin uretecegi baskinin bir kesridini uretir.
2. **Rerank bir kalibrasyon isidir, bir tahmin isi degil.** Bugun elde
   **olculmus** bir kalite verisi yok; skorlari bir modul yazarken "hissederek"
   yeniden agirliklandirmak, cozdugunden fazlasini bozar.
3. **Olcum yolu zaten var** — Slice 0.5'in `ai.call` satirlari ve `/ask`
   cevabinin kaynak dagilimi. Finans denetiminde bes kaynak icin yapilan
   olcumun (dort kaynaktan besleme, `crm-pipeline` 2 · `knowledge` 1 ·
   `project-notes` 3 · `project-status` 2) **ayni turden** bir tekrari, bu
   modulun kapanis denetiminde **zorunlu bir madde** olarak yazildi (§ Kapanis
   denetimi).

⚠️ **Bu, "hayir" degil "olcmeden karar vermeyecegiz"dir.** Olcum bir kaynagin
sistematik olarak disari itildigini gosterirse rerank **ayri bir ADR** ile
gelir ve `platform/context`'i ilgilendirir — tek bir modulu degil.

### 7. Frontend: HAFTALIK TAKVIM — yeni kutuphane YOK

**Karar: haftalik grid gorunumu `components/module-kit/`'e YENI bir bilesen
olarak eklenir ve CSS grid + native `Date` ile ELLE kurulur. Takvim
kutuphanesi (FullCalendar, `react-big-calendar`, benzerleri) REDDEDILDI.**

**(a) Neden kutuphane degil.** Bu, bar grafikte `recharts`'in reddedildigi ayni
gerekcedir ve degerlendirme ayni sekilde yapildi:

- **Yuzeyin %90'i kullanilmayacak.** Bu kutuphaneler surukle-birak, kaynak
  havuzu, tekrar kurallari (RRULE), zaman dilimi motoru ve alti gorunum
  getirir. v1'in istedigi **tek** sey: yedi sutun, saat satirlari, ve dogru
  yere konmus bloklar.
- **Tasarim dili catisir.** "Atolye" (FRONTEND §1) kendi tipografisini,
  yuzeylerini ve renk token'larini tasiyor; bu kutuphaneler kendi CSS'ini
  getirir ve onu ezmek, bilesenlerini sifirdan yazmaktan **daha pahali**
  olur — projede bir kez daha olculmus bir gercek.
- **Modul basina imza rengi mekanizmasi `--accent`/`--tint` token'larina
  dayanir.** Disaridan gelen bir takvim kendi renklerini kullanir ve
  `data-module` alt agac override'i ona **islemez**; sonuc, modulun renginde
  olmayan bir takvim olurdu — hata **sessiz**, tam olarak FRONTEND §4.8'in
  uyardigi turden.
- **Bagimlilik yuzeyi.** Bir takvim kutuphanesi buyuk bir yuzeydir ve modulun
  **en kritik ekraninin** kaderini disari baglar.

**(b) Elle kurmanin gercek maliyeti kucuktur cunku ISTENEN SEY KUCUK.**
Haftalik grid, `scheduled_at` ve `duration_minutes`'tan hesaplanan bir
`grid-row` araligi ile ciziler; hafta baslangici ve gun sinirlari native `Date`
ile bulunur. Cakisan bloklar yan yana daraltilir (§2e). Sanallastirma,
surukleme ve tekrar kurallari **yoktur** (§10).

**(c) Bu bilesen `module-kit`'e girer, modul klasorune DEGIL.** ADR-0033 Slice
5a'nin dersi: _"ikinci modul bir seyin genel olup olmadigini ogrendigimiz
yerdir."_ Bir haftalik grid **acikca** Randevu'ya ozgu degildir (Projeler'in
zaman cizelgesi, ileride Ik'nin vardiya listesi ayni sekli ister). Yine de
⚠️ **kabul olcutu serttir:** bilesen randevu kelimesini **bilmez**; genel bir
"zaman araligi bloklari" arayuzu alir. Bilemiyorsa modul klasorunde kalir.

**(d) Aylik takvim v2'ye ERTELENIYOR** (§10). Haftalik gorunum, "bu hafta ne
var" sorusunu — modulun birincil sorusunu — tam olarak karsilar. Aylik gorunum
**farkli bir bilesendir** (blok degil, gun hucresi + tasma sayaci) ve ikisini
ayni anda yazmak, ikisini de yarim yazmak olurdu.

**Renk: imza rengi PETROL** — `module-colors.css`'te **zaten olculmus** palet
kullanilir, uretilmez:

```
[data-module='appointments']   acik: #057a89 / ink #006a77
                               koyu: #51b5c5 / ink #64c6d7
```

Iki satirlik is (FRONTEND §4.8): modulun kendi `layout.tsx`'inde
`<div data-module="appointments" style={{ display: 'contents' }}>` + sidebar
satiri. ⚠️ Secici adi `booking` → `appointments` olarak degistirilir (§1.1);
**renk degerlerine dokunulmaz**.

**AI'in sesi TERRACOTTA KALIR.** Bu modulde modul ici AI yuzeyi **v1'de
yoktur**; eklenirse `--ai-accent` / `--ai-ink` kullanmak **zorundadir**.

> ⚠️ **`SOON` dizisi BOSTU ve bu modulle GERI DOLMAZ — dogrudan `LIVE`'a
> girer.** Sidebar bugun `SOON.length === 0` oldugu icin "Modüller" bolumunu
> **hic cizmiyor** (ADR-0034 §10). Randevu satiri yazildiginda `LIVE`'a eklenir
> ve bolum **acilmaz**. ⚠️ Yeni bir **ikon** gerekir (`icons.tsx`'te karsiligi
> yok) — bu bir **tasarim** isidir ve frontend slice'inin kapsamindadir.

Rotalar: `/app/appointments` (haftalik takvim) · `/app/appointments/list`
(liste + filtreler). Ekranlarin ayrintili tasarimi bu ADR'nin konusu degildir;
FRONTEND §4.8'in renk kurali ve Atolye dili baglayicidir.

### 8. ⚠️ Exception filter UC HATA TIPIYLE BIRLIKTE, ILK GUNDEN

**Karar: `AppointmentsDomainExceptionFilter` `@Catch(...)` listesine
`EmbeddingFailedError`, `RateLimitExceededError` ve `CompletionFailedError`
BAsTAN yazilir.**

Gerekce bir **derstir**, bir tercih degil. `RateLimitExceededError` ve
`EmbeddingFailedError` `AppointmentsDomainError`'dan **turemez** — biri
platformun ortak oran siniri mekanizmasina (`shared/rate-limit.policy`), digeri
paylasilan porta (`shared/embedding.port`) aittir. `@Catch(...)`e
yazilmazlarsa filtre onlari **gormez** ve kullanici 429/502 yerine **islenmemis
500** alir; hata **sessizdir** cunku sunucu "bir sey ters gitti" der ve neyin
ters gittigini soylemez.

⚠️ **CRM'de bu ders DORT KEZ ogrenildi** (Slice 2, Slice 3, Slice 6 ve Katman 2) ve her seferinde bir testin kirmizi yanmasiyla bulundu. Projeler onceden
uyguladi; Finans da oyle yapti. **Randevu, `EmbeddingPort`'u kullanan besinci
moduldur ve ayni hatayi yapmanin hicbir mazereti kalmamistir.**

Genellenmis kural (Finans'in filtresinde zaten yazili): **bir modul yeni bir
port kullanmaya basladiginda, o portun hata tipi filtreye eklenmelidir.**

> ⚠️ **`CompletionFailedError` konusunda bu ADR Finans'tan AYRISIYOR ve bu
> bilinclidir.** Finans'in filtresi onu **bilerek** disarida birakti ve gerekce
> dogruydu: _"Finans `LLMPort` KULLANMAZ; var olmayan bir bagimliligin hatasini
> yakalamak yuzeyi gereksizce genisletirdi."_ Randevu v1'de de modul ici bir AI
> yuzeyi **yoktur** (§7), yani ayni mantikla disarida kalabilirdi.
>
> **Product Owner karari: ucu de bastan yazilir.** Gerekce, bu satirin
> **unutuldugunda sessiz** olmasidir — CRM'in ayni satiri Katman 2'de (musteri
> ozeti eklenirken) **yanlislandi** ve o gun hatirlanmasi gerekti. Bedeli
> **bir satirlik olu kod**tur ve olculebilir bir zarari yoktur; alternatifin
> bedeli islenmemis bir 500'dur.
>
> ⚠️ Bu, "her modul her hata tipini yakalasin" **degildir** — filtre yalnizca
> `shared/`'daki uc AI hatasini kapsar, cunku ucu de bu modulun kullandigi ya
> da **yarin kullanmasi cok muhtemel** olan portlara aittir.

### 9. Izinler, uclar ve oran siniri

ADR-0025'in `resource:action` modeli, **dorduncu** kez.

| Permission           | owner | admin | member | viewer |
| -------------------- | :---: | :---: | :----: | :----: |
| `appointment:read`   |  ✅   |  ✅   |   ✅   |   ✅   |
| `appointment:write`  |  ✅   |  ✅   |   ✅   |   ❌   |
| `appointment:delete` |  ✅   |  ✅   |   ❌   |   ❌   |

**Katalog GENISTIR, Finans'in dar katalogu DEGIL** — ve bu bir tutarsizlik
degil, ADR-0034 §7'nin kendi gerekcesinin dogru uygulanmasidir: _"musteri
listesi ve gorev listesi PAYLASILAN is gercekleridir, sirketin nakit akisi
degildir."_ **Bir randevu takvimi paylasilan bir is gercegidir**; ekipteki
kimsenin "bugun kim geliyor"u gorememesi modulun amacini bozar. Cizgi CRM ve
Projeler'inkiyle ayni yere dusuyor.

⚠️ **`appointment:read` iki katkicinin da kapisidir** (§6). Dort rol de tasidigi
icin bu modul `POST /ask` izin filtresini **tetiklemez** — tetikci hala
Finans'tir.

| Uc                                  | Izin                 | Not                                                                        |
| ----------------------------------- | -------------------- | -------------------------------------------------------------------------- |
| `POST /api/v1/appointments`         | `appointment:write`  | `contactId` opsiyonel (§4) · **not varsa embedding uretir — oran sinirli** |
| `GET /api/v1/appointments`          | `appointment:read`   | **Tarih araligi** (takvim penceresi) · durum · kisi filtresi + sayfalama   |
| `PATCH /api/v1/appointments/:id`    | `appointment:write`  | Durum gecisi burada · **not degisirse embedding YENIDEN URETILIR** (§5)    |
| `DELETE /api/v1/appointments/:id`   | `appointment:delete` |                                                                            |
| `POST /api/v1/appointments/reindex` | `appointment:write`  | Vektorsuz **notlu** randevulari onarir                                     |

**Oran siniri**, `platform.rate_limits` uzerinde **tek** kalem deklare eder ve
**besinci modulde de besinci bir sayac tablosu ACILMAZ** — desenin ise
yaradiginin olcusu budur.

⚠️ **Kalem adi `appointment_embedding`, `create_appointment` DEGIL** ve bu
adlandirma onceki uc modulden (`create_interaction` · `create_progress_note` ·
`create_commentary`) **bilincli olarak ayrisir**. Sebep, sinirlanan seyin
**farkli** olmasidir: oncekilerde AI maliyeti ureten kayit **olusturmakti** ve
her olusturma bir embedding demekti. Burada oyle degil — **notsuz bir randevu
hicbir sey harcamaz** (cok yaygin), buna karsilik bir **guncelleme** harcar
(§5). `create_` oneki, sayacin **ne oldugu** konusunda yanlis bilgi verirdi ve
bu yanlis bilgi sessiz kalirdi. Sayac adi olcunun kendisini soyler: **embedding
uretilen her yol**, hangi fiil olursa olsun.

Yeniden indeksleme **ilk gunden** vardir; is listesi **turetilmistir**
(`WHERE service_note IS NOT NULL AND embedding IS NULL`), ayri bir
"onarilacaklar" tablosu ve deneme sayaci **yoktur**.

### 10. Kapsam disi (bugun yapilmiyor)

**Takvim siniri** — bunlar "sonra ekleriz" degil, **v1'in tanimi disidir**:

- **SMS / e-posta hatirlatma** — ⚠️ bir **zamanlayici** (scheduler/queue) ister
  ve ROADMAP §2.3'un Queue karari **hala verilmedi**. `EmailPort` var ama
  "randevudan 24 saat once gonder" bir **cron/queue** sorusudur, bir adapter
  sorusu degil. Bu kalem, Queue kararini tetikleyecek en yakin adaydir
  (Belge/Sozlesme'nin object storage'i tetiklemesiyle ayni sinif).
- **Online rezervasyon** (musterinin kendisi randevu alir) — ⚠️ **kimliksiz bir
  yuzey** demektir: bugun her uc kimlik dogrulamasi arkasindadir ve public bir
  rezervasyon sayfasi yeni bir tehdit yuzeyi (bot, spam, kotuye kullanim) acar.
  Ayri ADR.
- **Tekrarlayan randevu** (her hafta ayni saat) — Projeler'in "tekrarlayan
  gorev" ve Finans'in "tekrarlayan islem" kalemleriyle **ayni sinif**, ucuncu
  kez ertelendi. RRULE benzeri bir model ve "seriyi mi tek kaydi mi
  duzenliyorsun" sorusu ayri bir karardir.
- **Coklu personel takvimi / kaynak yonetimi** (oda, koltuk, cihaz) — §2e'nin
  cakisma kararinin dogrudan bagli oldugu kalem. Personel modeli **9. modulun**
  (IK) konusudur ve ondan once yazilirsa kendi paralel personel modelini kurar,
  sonra goc eder — ADR-0034'un **8 → 3** bagimliligiyla ayni sekil.
- **Aylik takvim gorunumu** (§7d)
- **Hizmet / hizmet suresi katalogu** — "dis temizligi = 30 dk" gibi bir sozluk;
  Finans kategorilerinin randevu tarafindaki karsiligi olurdu
- **Musteri geri bildirimi / randevu sonrasi anket** — **10. modul**
- **Randevu ucretlendirmesi / Finans'a otomatik kayit** — ⚠️ **kasitli**: ters
  yon `Randevu → Finans` yeni bir kenar acar (§4.1) ve dogru cozumu bir
  **domain event**tir, dogrudan cagri degil
- **Modul ici AI yuzeyi** (§7) · **Tenant bazli saat dilimi** (§2c) ·
  **Degisiklik denetim izi** (§5) · **Klasik metin aramasi** (ADR-0011,
  **besinci** kez)

ADR-0029/0030/0031/0033/0034'un kapsam disi maddeleri aynen gecerlidir.

## Gerekce

**Neden §3 bu ADR'nin en tartismali karari.** Dort kez uygulanmis bir deseni
besinci kez uygulamamak, varsayilan olarak **yanlistir** — projede bu refleks
bilerek kuruldu. Burada dogru olmasinin sebebi, chunking'in **neyi cozdugudur**:
uzun metnin tek vektorde erimesini. Randevu notu uzun degildir ve olmamalidir
(§3d bunu bir **kisit** olarak yaziyor, bir temenni olarak degil). Yanlis karar
verilseydi bedeli gorunurdu: bes tablo, bes RLS politikasi, bes cascade zinciri
ve retention listesinde bes satir — **tek satirlik bir kolonun isi icin**.

**Neden §6.3 "hayir" demiyor ama "evet" de demiyor.** ADR-0034 bir tetikleyici
yazdi ve o tetikleyici cekildi; bunu gormezden gelmek ADR'lerin birbirine
verdigi sozu bozmak olurdu. Ama rerank'i **olcum olmadan** yapmak, bu projenin
tekrar tekrar reddettigi seyin ta kendisidir: gorunmeyen bir sorunu tahmine
dayanarak cozmek. Karar bu yuzden **olcumu bir denetim maddesi haline
getirmektir** — borc "ertelendi" degil, **tarihi belli**dir.

**Neden §7 kutuphaneyi reddediyor.** Reddin gerekcesi "kendimiz yazariz" degil,
**istenen seyin kucuk olmasidir**. Bir takvim kutuphanesinin getirdigi degerin
%90'i (surukleme, RRULE, kaynak havuzu, zaman dilimi motoru) bu ADR'de
**kapsam disi** (§10) olarak zaten yazili. Kullanilmayacak bir yuzeyi bagimlilik
olarak almak, bedelini yalnizca **tasarim catismasinda ve renk mekanizmasinda**
odemek demektir.

**Neden §8 Finans'tan ayrisiyor.** Finans'in gerekcesi ("var olmayan bir
bagimliligin hatasini yakalamak yuzeyi genisletir") mantikli ve dogruydu; ama
CRM'in ayni gerekcesi Katman 2'de **yanlislandi** ve o gun bir satir hatirlanmak
zorunda kalindi. Iki secenegin bedelleri simetrik degil: **bir satirlik olu
kod** ile **islenmemis bir 500**. Simetrik olmayan bir riskte ucuz tarafta
durulur.

## Sonuclari

**Olumlu**

- **Zaman, kurumsal hafizaya ilk kez BIR EKSEN olarak giriyor.** Bugune kadar
  AI'in gordugu her sey **gecmisti** (olan gorusme, yazilan not, gerceklesen
  odeme). Randevu **gelecegi** getirir: _"yarin kim geliyor"_ sorusunun cevabi
  hicbir modulde yoktu. CLAUDE.md'nin "dijital yonetici asistani" tarifinde
  eksik olan parca budur.
- **Chunking'in siniri ilk kez CIZILDI** (§3). Bugune kadar "anlatisal icerik →
  chunk tablosu" sorgusuz uygulaniyordu; artik ne zaman **gerekmedigi** de
  yazili.
- **`crm.public.ts` ikinci dizinini aliyor** (§4.2) ve desen **yeni bir kaynak
  turunde** sinaniyor — ADR-0034'un _"CRM'e hic dokunulmuyor"_ satirinin
  kapsami netlesiyor.
- **Desen besinci kez ucuz calisiyor:** besinci sema, besinci izin katalogu,
  besinci oran siniri kalemi — ve **tek bir platform dosyasi degismiyor**.
- **`module-kit` ilk kez bir modul tarafindan BUYUTULUYOR** (§7c). ADR-0033
  onu CRM'den cikarmisti; bir modulun ona **katki** vermesi, klasorun bir
  arsiv degil **yasayan** bir ortaklik oldugunun kanitidir.

**Olumsuz / bedeli**

- **Tenant bazli saat dilimi borcu ILK KEZ GORUNUR bir yanlis uretebilir**
  (§2c). Onceki uc modul `date` secerek soruyu tumuyle ortadan kaldirmisti;
  Randevu bunu yapamaz. Cok bolgeli bir tenant'ta saatler **yanlis okunacaktir**
  ve bu, kullanicinin **fark edebilecegi** bir yanlistir.
- **Skor kalibrasyonu borcu tetikleyicisine ULASTI** (§6.3) — bes anlamsal, dort
  yapisal kaynak, ve top-K hala 8. Bu modul baskiyi az artiriyor ama **esigi
  gecen** modul odur.
- **Yapisal katki sabit token tabanini DORDUNCU kez buyutur.** Her `/ask`
  cagrisi artik dort modulden sabit metin tasiyor. Olculebilir (`ai.call`) ama
  hala zorlanmiyor.
- **Fan-out N=7 → 9** ve ⚠️ **N=7 hic olculmedi** (Finans'in hafif denetimi onu
  bilincli olarak atladi). Yani bugun elde **N=5'in olcumu** var ve iki adim
  gerideyiz. Bu ADR fan-out olcumunu kapanis denetimine **geri koyuyor**.
- **Retention borcu 12 → 13 tabloya cikar** (ROADMAP §8.5) ve **vektor tasiyan
  tablo sayisi 4 → 5** olur. ⚠️ Ama bu modul listeye **tek** satir ekliyor
  (oncekiler ikiser ekliyordu) — §3'un dogrudan olculebilir kazanci. Dogru
  retention kolu `appointments.appointments`'tir ve **cascade gerekmez**:
  vektor ayni satirdadir.
- **`service_note` uzunluk siniri bir URUN kisitidir** (§3d). Kullanici uzun
  yazmak isterse **422 gorur** ve bu, bir metin alaninin beklenmedik
  davranisidir; arayuz sayaci **onceden** gostermelidir yoksa kullanici yazdigi
  metni kaybetmis hisseder.
- **Cakisma kontrolu yoklugu bir eksiklik gibi okunacaktir** (§2e) — dogru
  karar, ama tek personelli bir isletme icin **acikca eksik** hissedilir.
- **Randevu v1 bir rezervasyon sistemi degildir**: hatirlatma yok, online
  rezervasyon yok, tekrar yok, kaynak yonetimi yok. Bilincli (§10), ama modulun
  adi ("Rezervasyon") beklentiyi **yukari** cekiyor — Finans'in "muhasebe"
  cagrisimiyla ayni tuzak, ikinci kez.

## Degerlendirilen alternatifler

| Alternatif                                                       | Neden secilmedi                                                                                                                                                                                             |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`crm` semasini genisletmek** (randevu = bir gorusme turu)      | Mutlak Kural 5; ayrica randevu **gelecege** bakar, gorusme **gecmise** — ayni tabloda iki farkli olgu                                                                                                       |
| **Ayri `appointment_note_chunks` tablosu** (§3)                  | Chunking uzun anlatisal govdeler icindir; randevu notu tanimi geregi kisadir. Bes tablo, bes RLS politikasi ve retention'da bes satirin bedeli tek bir kolonun isi icin odenmez                             |
| **`service_note`u uzun birakip SESSIZCE kirpmak**                | Kullanici notunun yarisinin arandigini **hic ogrenemez** — projenin tekrar tekrar reddettigi sessiz hata; 422 acik bir cevaptir                                                                             |
| **`scheduled_at date`** (onceki uc modulle ayni)                 | 14:30'daki bir bulusmayi gunle temsil etmek modulun **var olus sebebini** yok eder                                                                                                                          |
| **`ends_at` kolonu** (`duration_minutes` yerine)                 | Turetilebilir bilgiyi kaliciya yazmak — projede **yedinci** kez reddedilen ayni karar; ikisi ayrisirsa takvimde **ust uste binen blok** cizilir ve hata sessizdir                                           |
| **`status` tenant-tanimli tablo** (Finans kategorisi gibi)       | Dort hal her sektorde ayni sey demektir; ayrica "gelmedi orani" ancak `no_show`un anlami **sabitse** hesaplanabilir (§6.2)                                                                                  |
| **`no_show`u `cancelled` icinde eritmek**                        | Iptal bir haber, gelmemek bir **kayiptir**; birlestirmek §6.2'nin alarm sinyalini tumuyle yok eder                                                                                                          |
| **Cakisma kontrolunu zorlamak** (`EXCLUDE` kisiti)               | Coklu personel takvimi kapsam disi (§10); iki personelli bir isletmede cakisma **normaldir**. Yanlis tarafa karar vermek yerine kayit tutulur, kural konmaz                                                 |
| **`crm_contact_id`ye cross-schema FK**                           | Mutlak Kural 5 — tartisma konusu degil                                                                                                                                                                      |
| **Kisi ADINI denormalize etmek** (kolona kopyalamak)             | Yeniden adlandirmada bayatlar; ikinci dogruluk kaynagi. Ayrica ad, `contact:read` tasimayan kullaniciya sizardi (ADR-0033 §2b/2c). ⚠️ Baglam basligindaki kopya **farklidir**: telafisi `reindex`tir (§6.1) |
| **Ortak `ExternalRefDirectory` yardimcisi**                      | ADR-0034 §4.1'in "hayir"i, dorduncu talip icin tekrar okundu ve **degismedi**: izin kapisini ya cagirana (sizinti) ya `shared/`'a (Mutlak Kural 6) devrederdi                                               |
| **FullCalendar / `react-big-calendar`** (§7a)                    | Yuzeyin %90'i (surukleme, RRULE, kaynak havuzu, zaman dilimi motoru) bu ADR'de **kapsam disi**; Atolye dili ve `--accent` override'i ile catisir — `recharts` reddiyle ayni gerekce                         |
| **Aylik takvimi de v1'e almak**                                  | Farkli bir bilesendir (gun hucresi + tasma sayaci); ikisini birden yazmak ikisini de yarim yazmak olurdu                                                                                                    |
| **Takvim gridini modul klasorunde tutmak**                       | Bir haftalik grid acikca Randevu'ya ozgu degil; ADR-0033 Slice 5a'nin dersi — ucuncu talipte ucuncu kopya demekti                                                                                           |
| **Yapisal katkicida duz 0.95 skor**                              | Dort yapisal katkici sekiz yuvanin yarisindan fazlasini kaplar ve bes anlamsal kaynak sikisir — Slice 6'da olculmus, hizalanmis politika                                                                    |
| **Yalnizca yapisal katkici** (anlamsal yuzey hic olmasin)        | "Sunu ne zaman konusmustuk" sorusunun cevabi bir kolonda yazmaz; randevu hafizasinin anlatisal parcasi kaybolurdu                                                                                           |
| **`CompletionFailedError`i filtreden CIKARMAK** (Finans gibi)    | Gerekcesi dogruydu ama CRM'de Katman 2 onu **yanlisladi**. Bedeller simetrik degil: bir satirlik olu kod ile islenmemis bir 500 (§8)                                                                        |
| **Ayri `appointments.rate_limits` tablosu**                      | `platform.rate_limits` zaten var; besinci modulde besinci tablo, ADR-0031 §4.2'nin tam olarak onledigi cogalma                                                                                              |
| **Oran siniri kalemi `create_appointment`**                      | Notsuz randevu hicbir sey harcamaz, guncelleme harcar — `create_` oneki sayacin **ne oldugu** konusunda sessizce yanlis bilgi verirdi (§9)                                                                  |
| **`data-module` anahtarini `booking` birakmak**                  | Sema `appointments`, anahtar `booking` = **iki adli tek modul**; eslesmeyen bir attribute yazildiginda ekran calisir ve terracotta kalir — FRONTEND §4.8'in adiyla kaydettigi tuzak                         |
| **Dar izin katalogu** (Finans gibi `member`/`viewer` hic gormez) | Randevu takvimi **paylasilan bir is gercegidir**; ekipteki kimsenin "bugun kim geliyor"u gorememesi modulun amacini bozar (§9)                                                                              |

## Bilinen sinirlar

- **Uzun `service_note` REDDEDILIR** (§3d) — sessiz kirpma yok, 422 var. Arayuz
  sayaci onceden gostermezse kullanici yazdigi metni kaybetmis hisseder.
- **Tenant bazli saat dilimi YOK** (§2c) — `timestamptz` UTC saklar, cevrimi
  istemci yapar. **Cok bolgeli bir tenant'ta saatler yanlis okunur.**
- **Cakisma kontrolu YOK** (§2e) — iki randevu ayni saate yazilabilir; takvim
  gridi bunu **gorunur** kilar ama **engellemez**.
- **Degisiklik denetim izi YOK** (§5) — ADR-0034 §8'in borcu bu modulde de
  gecerli. **Tetikleyici degismedi:** Teklif/Fatura (8. modul).
- **Sarkan `crm_contact_id` temizlenmez** (§4.1) — ucuncu sarkan isaretci. CRM
  hala **domain event yayinlamiyor** ve karar "acikca yeniden degerlendirildi ve
  ertelendi"dir.
- **Baglam basligindaki kisi adi BAYATLAR** (§6.1) — telafi `POST /appointments/reindex`'tir
  ve ilk gunden vardir; calistirilmazsa eski ad aranir.
- **"Vektorsuz notlu randevu" MUMKUNDUR** — ADR-0029 §4'un iki transaction'li
  akisinin ayni sonucu, besinci kez. Onarim mekanizmasi ilk gunden var.
- **`embedding` kolonunda model/surum bilgisi YOK** — ADR-0029/0031/0033/0034'un
  ayni bilinen siniri, besinci kez.
- **Skorlar kaynaklar arasinda KALIBRE DEGIL** ve anlamsal kaynak sayisi **bese**
  cikiyor (§6.3) — tetikleyici cekildi, karar **olcume baglandi**.
- **Fan-out N=9** ve **N=7 hic olculmedi** — bugunku tek dayanak ADR-0033'un
  N=5 olcumudur (fan-out payi %2–3, darbogaz `LLMPort.complete`).
- **Arama yalnizca anlamsaldir** — "notunda 'kontrol' gecen randevular" gibi
  klasik metin aramasi yok (ADR-0011, **besinci** kez).
- **Aylik gorunum yok** (§7d) — "bu ay ne kadar dolu" sorusu haftalik gridde
  yedi gun yedi gun gezilerek cevaplanir.
- **Hatirlatma yok** (§10) — ve bu, kullanicinin **ilk soracagi** eksiktir;
  Queue karari verilmeden yapilamaz.

## Uygulama plani (slice'lar)

Sira, her slice'in **kendi basina calisan** bir sey birakmasina gore kuruldu.

| Slice | Ne                                                                                                  | Migration                  |
| ----- | --------------------------------------------------------------------------------------------------- | -------------------------- |
| **1** | `appointments` semasi + randevu yasam dongusu (durum, sure) + izin katalogu + liste/pencere sorgusu | `0026_appointments_schema` |
| **2** | Cross-modul referans: `contactId` yazma yolu + **`crm.public.ts`'e `ContactDirectory`**             | —                          |
| **3** | `service_note` + **tek satir embedding** + `reindex` + oran siniri + **exception filter (§8)**      | —                          |
| **4** | Iki katkici (`appointment-schedule` · `appointment-notes`)                                          | —                          |
| **5** | Frontend: **haftalik takvim gridi** (`module-kit`) + liste rotasi + petrol + sidebar `LIVE`         | —                          |
| **6** | **HAFIF** kapanis denetimi (asagidaki liste)                                                        | —                          |

`crm_contact_id`, `service_note` ve `embedding` **kolonlari Slice 1'de acilir**;
yazma yollari Slice 2 ve 3'e birakilir — ADR-0033 Slice 1'in ogrettigi ders
(dogrulanamayan bir isaretciyi kabul etmek, ilk gunden sarkan satir uretmektir).
Boylece **CRM'e dokunulan tek slice ayrik kalir** (Mutlak Kural 1-2) ve tek
migration bir kerede yazilir — ikinci bir tablo olmadigi icin ikinci bir
migration'in getirisi yoktur (§3b).

> ⚠️ **Bir migration prod'a gider.** `feature/tenant-multi-tenancy-core`'a
> yapilan her push Railway'de `db:preflight && db:migrate` calistirir
> (CLAUDE.md). **Slice 1'in push'u oncesinde ayrica haber verilir.**

> ⚠️ **Migration eklerken `database.integration.spec`'in GERI ALMA listesine de
> eklenir.** Projeler Slice 1'de ogrenilen kalici ders: eksik olan down dosyasi
> degil, onu **calistiran satirdi**.

## Kapanis denetimi (Slice 6) — **HAFIF seviye**

> **Surec kurali (Product Owner, 2026-08-10):** kapanis denetimleri **iki
> seviyelidir**. Her modul sonunda **HAFIF** denetim yapilir; **AGIR** denetim
> yalnizca birkac modulde bir yapilir ve seviyeyi Product Owner belirtir.
> Randevu **HAFIF** ile kapanir.

**Yapilacaklar:**

- [ ] `git status` temiz · `pnpm verify` **cikis koduna** bakilarak yesil
      (DEVELOPMENT_RULES 5.4: cikti `grep`'lenmez)
- [ ] Bes yeni ucun **hizli** turu — gercek isteklerle, 200/401/403/422/429
- [ ] **Renk turu**: `/app/appointments` ve alt rotalari **petrol** gosteriyor
      mu — acik **ve** koyu temada; kabugun rozeti terracotta kaliyor mu.
      ⚠️ `booking` → `appointments` yeniden adlandirmasinin gercekten
      **eslestigi** burada gorulur (eslesmezse ekran terracotta kalir)
- [ ] **§8 sinavi**: oran siniri asildiginda **429** (`Retry-After` basligiyla),
      embedding saglayicisi hata verdiginde **502** — ikisi de **500 DEGIL**
- [ ] **§3d sinavi**: sinir uzunlugunu asan bir `service_note` **422** doner ve
      **sessizce kirpilmaz**
- [ ] **§6.1 sinavi**: bagli kisi yeniden adlandirilir → `reindex` sonrasi yeni
      ad baglam basliginda gorunur
- [ ] ⚠️ **§6.3 OLCUMU — bu denetimin ZORUNLU maddesi:** bes anlamsal + dort
      yapisal kaynak doluyken tek bir `POST /ask` cagrisinin kaynak dagilimi
      olculur ve **yazilir**. Bir kaynagin sistematik olarak disari itildigi
      gorulurse rerank ayri bir ADR'ye cikar
- [ ] Bilinen sinirlar listesi guncellenir (bu ADR + CLAUDE.md + ROADMAP §8.5)

**Yapilmayacaklar (bilincli):**

- ❌ Sifirdan kurulum (ayri container'da bastan sona)
- ❌ Iki tenant'la tam RLS izolasyon turu — sema sablonu degismedi, besinci kez
  ayni; entegrasyon testleri bunu zaten kapsiyor

> ⚠️ **Fan-out gecikmesi olcumu (N=9) BU KEZ YAPILIR** ve hafif denetimin
> istisnasidir. Gerekce: N=5'ten beri iki adim gecti ve N=7 hic olculmedi;
> ucuncu kez atlamak, olcumun **dayanagini** kaybetmek olurdu.

## Bu karar ne zaman yeniden gozden gecirilir?

- **§6.3'un olcumu bir kaynagin sistematik olarak disari itildigini
  gosterince:** rerank ve skor kalibrasyonu **ayri bir ADR** ile gelir ve
  `platform/context`'i ilgilendirir — tek bir modulu degil.
- **Hatirlatma istenince:** Queue/scheduler karari (ROADMAP §2.3) **once**
  verilir; bu kalem onu tetikleyen en yakin adaydir.
- **Online rezervasyon istenince:** ayri ADR — kimliksiz bir yuzey, yeni bir
  tehdit modeli.
- **IK (9. modul) gelince:** coklu personel takvimi ve kaynak yonetimi acilir;
  §2e'nin cakisma karari **o gun yeniden okunur**.
- **Uzun randevu notlari gercekten gorulunce:** §3'un karari geri alinabilir —
  `appointment_note_chunks` eklenir, kolon bosaltilir. Yon **tektir** ve ucuz
  olan taraftayiz.
- **Cok bolgeli bir tenant cikinca:** tenant bazli saat dilimi **ertelenemez**
  hale gelir (§2c) — ADR-0029'dan beri ertelenen kalemin ilk gercek talibi.
- **Randevu → Finans baglantisi istenince:** cozum dogrudan cagri **degil**,
  domain event'tir; §4.1'in DAG kurali once okunur.
