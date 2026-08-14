# 0036 — `POST /ask` havuzunda yapisal kaynaklar icin TABAN KISITI

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-14
- **Karar veren:** Product Owner
- **Faz:** 5

## Baglam

ADR-0035 §6.3'un kapanis denetimi bir olcum yapti ve o olcum, ADR-0031 §5.1'de
verilen "modul basina kota YOK, global top-K" kararinin **kapasite sinirini**
gorunur kildi.

Dokuz katkici da doluyken (bes anlamsal + dort yapisal) tek bir `POST /ask`
cagrisinin kaynak dagilimi, **uc farkli soruda da AYNI** cikti:

| Kaynak                     | Satir |
| -------------------------- | ----- |
| `project-status`           | 2     |
| `knowledge`                | 1     |
| `crm-interactions`         | 1     |
| `appointment-notes`        | 1     |
| `project-notes`            | 1     |
| `finance-commentaries`     | 1     |
| `crm-pipeline`             | 1     |
| **`appointment-schedule`** | **0** |
| **`finance-cashflow`**     | **0** |

Toplam **8** (global top-K), `degradedSources: []` — yani iki kaynak
**bozulmadi**, **elendi**. Izole tenant testi ikisinin de calistigini
kanitladi: yalniz randevu verisiyle `appointment-schedule` **2 satir**, Finans
verisi eklendiginde `finance-cashflow` **1 satir** doner.

### Kok neden: iki farkli skor OLCEGI ayni havuzda yarisiyor

- **Anlamsal katkicilar** skoru `1 - index / (length + 1)` ile uretir. Bu bir
  ALAKA olcusu degil, bir SIRALAMA korumasidir; her katkicinin **en iyi
  isabeti 1.0'a cok yakin** doner ve **merdiveni yoktur**. Bes anlamsal kaynak,
  dolu bir tenant'ta sekiz yuvanin cogunu bu skorlarla kapar.
- **Yapisal katkicilar** riske gore SABIT TAVANLI bir merdiven kullanir
  (0.95 / 0.90 / 0.75 — Slice 6'da CRM ile hizalanan politika). Tavan **0.95**
  oldugu icin yapisal bir satir, bir anlamsal katkicinin en iyi isabetini
  **hicbir kosulda** geceremez.

Sonuc aritmetiktir: veri zenginlestikce yapisal katkicilar **once sonuncu,
sonra hic** girer. Bu, kotu yazilmis bir katkicinin degil, **iki olcegin ayni
siralamada yarismasinin** sonucudur.

### Neden bu bir PLATFORM karari

Kusur hicbir is modulunun icinde degil. Her katkici kendi sozlesmesine uygun
davraniyor (`0..1, yuksek = daha alakali`) ve her biri **tek basina** dogru.
Bozulan sey, dokuz dogru katkicinin **birlestirildigi yerdir** — yani
`platform/context`. ADR-0035 §6.3 bunu acikca yazmisti: _"rerank ayri bir ADR
ile gelir ve `platform/context`'i ilgilendirir — tek bir modulu degil."_

### Neden BUGUN

ADR-0037 (Belge/Sozlesme, 5. modul) **altinci** anlamsal kaynagi ekleyecek.
ADR-0035 §6.3'un tetikleyicisi tam olarak buydu: _"5. modul altinci anlamsal
kaynagi ekledigi gun soru kendiliginden yeniden sorulur."_ Bu karar o modulun
**altina** yazilmalidir, ustune degil — aksi halde 5. modul, bozuk oldugu
**bilinen** bir havuza dogar ve duzeltme altinci kaynagin da tasindigi bir
regresyon isine doner.

## Karar

**Saf skor siralamasinin USTUNE, yapisal kaynaklar icin bir TABAN KISITI
eklenir.** Skor siralamasi kaldirilmaz; havuzun bir kismi, doldurma
sirasinda yapisal kaynaklara **garanti** edilir.

### 1. Taban KAYNAK BASINA bir yuvadir — toplu bir kota DEGIL

Bu, kararin en kritik ayrintisidir ve olcumden dogrudan cikar.

Olculen dagilimda yapisal kaynaklar zaten **3/8** yuva almisti
(`project-status` 2 + `crm-pipeline` 1). Yani "yapisal kaynaklara toplam 3 yuva
ayir" bicimindeki bir kota, **sorunu yasandigi senaryoda hicbir seyi
degistirmezdi**: `project-status` ikinci satirini yine alir,
`appointment-schedule` yine 0 alirdi.

Gercek sorun toplam pay degil, **yapisal kaynaklar ARASINDAKI aclıktir.** Bu
yuzden taban soyle tanimlanir:

> Taban icindeki her yuva **AYRI bir yapisal kaynaga** verilir ve her kaynak
> tabandan **en fazla BIR** yuva alir. Kaynaklar, kendi **en iyi** parcalarinin
> skoruna gore azalan sirada secilir.

Yani taban **derinlik** degil **genislik** satin alir: sekiz yuvada dort ayri
yapisal sesin uc tanesini duymak, tek bir yapisal sesi uc kez duymaktan
degerlidir — cunku farkli yapisal kaynaklar **farkli sorulara** cevap verir
("yarin kim geliyor" ile "nakit akisi nasil" ayni satirda yazmaz).

### 2. Taban buyuklugu: `ceil(K / 3)`, ve asla `K - 1`'i gecmez

`K = 8` icin taban **3**'tur.

**Neden 3, neden 2 degil:** taban, **olculen dagilimda zaten iceride olan
yapisal kaynak sayisindan (2) BUYUK** olmak zorundadir. Aksi halde kisit, onu
dogurmus senaryoda **hicbir sey yapmayan** bir kod olurdu — yani yesil yanan
bir testle korunan bir no-op.

**Neden 3, neden 4 degil:** bugun dort yapisal kaynak var; dordune de garanti
vermek havuzun **yarisini** rezerve ederdi ve anlamsal icerik — cevaplarin
asil yasadigi yer — ikinci plana duserdi. Ayrica bu, kaynak sayisi arttikca
**tutulamaz** bir sozdur (asagida §3).

**`K - 1` tavani:** taban hicbir zaman `K - 1`'i gecmez, yani **havuzun genel
birincisi hicbir kosulda disari itilemez.** `K = 8`'de bu kisit devreye girmez
(3 < 7); anlami kucuk `K` degerlerindedir — `K = 1` yapilandirmasinda taban
0 olur ve davranis saf skora doner. Bir konfigurasyon degeri yuzunden en
alakali parcanin dusmesi, kisitın cozmeye calistigi seyden daha kotu olurdu.

Taban ayrica **gercekten satir donduren** yapisal kaynak sayisiyla sinirlidir:

```
taban = min( satir donduren yapisal kaynak sayisi,
             min( ceil(K / 3), K - 1 ) )
```

Bos bir tenant'ta yapisal katkicilar zaten `[]` doner (bkz.
`appointment-schedule`'in "hicbir sey yoksa hicbir sey gonderilmez" karari);
onlar icin yuva ayirmak, havuzu **bos** yuvalarla harcamak olurdu.

### 3. Taban `K` uzerinden dinamiktir — KATKICI SAYISI uzerinden DEGIL

Ikisi arasindaki fark, bu ADR'nin on iki modullu bir gelecekte ayakta kalip
kalmayacagini belirler.

- **`K` uzerinden dinamik (SECILEN):** `K` buyurse taban da buyur
  (`K = 12 → 4`), kucukse kucul. Havuzun **UCTE BIRI** yapisal genisleme icin
  ayrilir; ucte ikisi liyakate kalir.
- **Katkici sayisi uzerinden dinamik (REDDEDILEN):** "her yapisal kaynaga bir
  yuva" kurali bugun calisir (4 ≤ 8), ama 12 modul ve 10+ yapisal katkici
  oldugunda taban havuzun **tamamini** yer ve anlamsal icerik tumuyle disari
  duser. Yani bugun dogru gorunen kural, **kendi basarisi yuzunden** bozulurdu.

⚠️ **ADR-0037 bu kararin USTUNE oturur ve onu DEGISTIRMEZ.** Belge/Sozlesme
altinci anlamsal kaynagi ekledigi gun taban yine 3 kalir; degisen tek sey,
serbest bes yuvanin artik alti anlamsal kaynak arasinda paylasilmasidir. Bu
**liyakate dayali** bir daralmadir ve top-K'nin yapmasi gereken tam olarak
budur. Korudugumuz sey bir modulun payi degil, **olcek uyusmazligi yuzunden
sistematik olarak kaybeden KATEGORIDIR.**

Taban orani (`3`) bir **kod sabitidir**, config'e acilmaz — `MIN_SAMPLE` icin
verilen ayni gerekceyle: bu bir **is tercihi** degil, iki skor olcegi
arasindaki **mimari dengedir**. Ayarlanabilir olsaydi 0'a cekilebilir ve bu
ADR sessizce geri alinmis olurdu.

### 4. ⚠️ Taban bir TAVAN DEGILDIR

Rezerve edilen yuvalar dagitildiktan sonra kalan yuvalar, **anlamsal ve yapisal
ayrimi gozetmeden**, saf skor sirasina gore doldurulur.

Sonucu somut: gercekten alarm durumundaki bir yapisal kaynak (`0.95`) hem
tabandan yuvasini alir, **hem de** serbest havuzda ek satirlar kazanabilir.
Olculen dagilimdaki `project-status` 2 satiri bu kararla **korunur** — kisit
onun ikinci satirini elinden almaz, yalnizca **ucuncu bir kaynagin sifira
dusmesini** engeller.

Bu, katkicilarin kendi belgelerinde yazili "kendi kendini duzenleyen" tasarima
sadiktir: sakin bir takvim yuvalarini anlatisal icerige birakir, sorunlu bir
takvim one cikar.

### 5. Katkici turunu MODUL DEKLARE EDER

Platform, bir kaynagin yapisal mi anlamsal mi oldugunu **bilemez** — ve
bilmemelidir. `retrieval-contributor.port.ts` bunu acikca yaziyor: _"Platform
`knowledge`/`crm` kelimelerinin ANLAMINI bilmez."_ Platformun icine
`['crm-pipeline', 'project-status', ...]` gibi bir liste koymak, tam olarak
reddedilmis olan bagimliligi kurardi ve **her yeni modulde sessizce bayatlardi**.

Bu yuzden port'a **zorunlu** bir alan eklenir:

```ts
readonly contributionKind: ContributionKind; // 'semantic' | 'structural'
```

- **Zorunlu**, opsiyonel degil: varsayilani `'semantic'` olan opsiyonel bir alan,
  alani yazmayi unutan yeni bir yapisal katkiciyi **sessizce** anlamsal sayardi
  ve garanti yuvasini kaybederdi. Zorunlu alan, unutuldugunda **derleme
  hatasidir** — 6. modulun katkicisi icin de.
- Ad `kind` DEGIL `contributionKind`: ayni dosyalarda `reference.kind` zaten var
  (`'note'`, `'appointment'`) ve iki farkli anlam tek kelimeyi paylasamaz.

Bu, "platform mekanizmayi sahiplenir, modul kimligini deklare eder" disiplininin
(ADR-0025 / ADR-0031, frontend'de `data-module`) ayni uygulamasidir.

⚠️ **Katkicilarin SKORLAMA MANTIGI DEGISMEZ.** Dokuz katkicinin her birine
eklenen sey tek satirlik bir **beyandir**; hicbir formul, esik ya da sorgu
degismez.

#### 5.1 Garanti, parcanin KENDI etiketine degil KATKICI KAYDINA dayanir

`ContextFragment` zaten bir `source` alani tasiyor — ama o alani **parcayi
donduren modul** yazar. Taban garantisini ona baglamak, garantiyi bir modulun
disiplinine emanet etmek olurdu: yanlis etiket yazan bir katkici, garantisini
**sessizce** kaybederdi ve hicbir test kirmizi yanmazdi.

Bu yuzden secim asamasina giren birim ham parca degil, **parca + onu ureten
katkicinin kimligi**dir (`RankedCandidate`). Ikisi uretimde ayni sabittir;
fark, platformun verdigi sozun **platformun bildigi bilgiye** dayanmasidir.

⚠️ Bu ayrinti tasarim sirasinda **bir testin kirmizi yanmasiyla** bulundu:
ilk uygulama turu `fragment.source` uzerinden aramistir ve `AskUseCase`
seviyesindeki test, etiketi sabit yazan bir fake yuzunden dusmustu. Kusur
fake'te degil, **bagimliligin kendisindeydi**.

### 6. `degradedSources` ve atif mekanizmasi DEGISMEDI

- **`degradedSources`** cagrilip **hata veren** katkicilarin listesidir. Taban
  kisitı yalnizca **basarili** sonuclar arasinda secim yapar; bir kaynagin
  elenmesi buraya **girmez** — tipki bugunku gibi. "Alamadik" ile "yuva
  yetmedi" farkli seylerdir ve ikincisi kullaniciya soylenmez.
- **Atif (`sources`)** secilen parcalardan turetilmeye devam eder. Secim
  bittikten sonra liste **yeniden skora gore siralanir**, yani `distinctSources`
  fonksiyonunun dayandigi "alaka sirasi" sozlesmesi korunur. Rezerve edilmis bir
  yapisal satir, skoru geregi listenin ortasina yerlesir — basina zorlanmaz.
- **Modele giden baglam** yine yalnizca parca METINLERIDIR; hangi yuvanin
  rezerve oldugu bilgisi modele **gitmez**.

### 7. Nerede yasar

`apps/api/src/platform/context/application/select-fragments.ts` — **saf
fonksiyon**, framework'suz, kendi spec'iyle. `AskUseCase.#gather` bugun uc
satirda yaptigi `flat().sort().slice()` isini bu fonksiyona devreder.

Ayri bir dosya olmasinin sebebi `follow-up-parser.ts` ile aynidir: karar
**girdi/cikti olarak sinanabilir** olmali, uc ag cagrisi ve uc transaction
iceren bir akisin icinden degil.

## Gerekce

**Neden garantili yuva, skorlari yakinsatmak degil.** Iki olcegi birbirine
yaklastirmak (anlamsal skorlari da merdivenli yapmak) **kirilgan** bir
duzeltmedir: dogru merdiven degerlerini bilmiyoruz, elimizde olculmus bir
kalite verisi yok ve her yeni kaynak turu merdiveni yeniden ayarlamayi
gerektirir. Daha kotusu, yanlis ayarlandiginda hata **sessizdir** — havuz
dolar, cevap uretilir, yalnizca yanlis parcalarla. Garantili yuva ise
**yapisal** bir garantidir: dogrulugu bir esik degerine degil, bir sayma
islemine bagldir ve bir testle kesin olarak kilitlenebilir.

**Neden simdi, rerank degil.** Rerank hala bir **kalibrasyon** isidir ve
kalibrasyon icin olculmus kalite verisi gerekir; bugun elimizde olan sey
**dagilim** verisidir, **kalite** verisi degil. Dagilim verisi "bir kaynak hic
giremiyor" demek icin yeterlidir; "su parca su parcadan daha alakali" demek
icin degildir. Taban kisitı tam olarak dagilim verisinin destekledigi
mudahaledir — ne fazlasi.

**Neden top-K buyutulmedi.** Havuzu buyutmek sorunu **cozmez, erteler**:
oran ayni kaldigi icin yapisal kaynaklar yine en sona duser, ustelik her soru
daha pahali hale gelir.

## Sonuclari

**Olumlu**

- Yapisal kaynaklarin **sistematik** aclıgi biter; en az `ceil(K/3)` ayri
  yapisal ses her cevapta duyulur (kaynak varsa).
- Duzeltme **tek bir dosyada** yasar; dokuz katkicinin skorlama mantigi
  degismez, dolayisiyla her modulun kendi davranis testleri aynen gecerlidir.
- Karar `K` ile olceklenir; 12 modullu gelecekte **kendi basarisiyla**
  bozulmaz.
- Alarm durumundaki yapisal kaynak **cezalandirilmaz** — taban tavan degildir.
- Yeni bir katkici turunu unutmak **derleme hatasidir**, sessiz bir kayip
  degil.

**Olumsuz / bedeli**

- **Havuzun ucte biri liyakatten cikarilir.** En yuksek skorlu bes anlamsal
  parcadan biri, daha dusuk skorlu bir yapisal satir icin yerini birakabilir.
  Bu, kararin **kabul edilmis** bedelidir: skorlar kaynaklar arasinda kalibre
  olmadigi icin "daha yuksek skor" zaten "daha alakali" demek degildir.
- **Dordunculuk garantisi YOK.** Bugun dort yapisal kaynak var, taban 3 — yani
  **biri yine disarida kalabilir**. Disarida kalan, en dusuk en-iyi-skora sahip
  olandir (tipik olarak "saglikli/alarm yok" durumundaki kaynak) ve bu dogru
  tercihtir; ama "her yapisal kaynak her cevapta" **vaat edilmiyor**.
- Dokuz katkici dosyasina birer satir eklendi — **Mutlak Kural 1'e bilincli bir
  istisna** (bkz. Bilinen sinirlar).
- Secim mantigi artik saf `sort().slice()` degil; okunmasi bir kademe daha
  zor. Bedel, ayri bir saf fonksiyon ve kendi spec'iyle sinirlandirildi.

## Degerlendirilen alternatifler

| Alternatif                                                                           | Neden secilmedi                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Skor formullerini birbirine yakinsatmak** (anlamsal skorlari da merdivenli yapmak) | En kirilgan secenek. Dogru merdiven degerleri **bilinmiyor** ve elimizde kalite verisi yok; yanlis ayarlandiginda hata **SESSIZDIR** (havuz dolar, cevap uretilir, yalnizca yanlis parcalarla). Ayrica duzeltme **dokuz katkicinin skorlama mantigina** dagilirdi — yani platform kusuru is modullerine ihrac edilirdi. Her yeni kaynak turu yeniden ayar isterdi.                                                             |
| **top-K'yi buyutmek** (8 → 12/16)                                                    | Sorunu **cozmez, erteler**: oran degismedigi icin yapisal kaynaklar yine en sona duser. Bedeli ise dogrudan **token**dir: her `/ask` cagrisinda baglam %50–100 buyur ve bu maliyet TUM sorulara yayilir — ustelik yapisal katkilar zaten **her soruda** gonderiliyor (dort katkicinin dordunun de kayitli bedeli). Olcum darbogazin `LLMPort.complete` oldugunu gosterdi; baglami buyutmek dogrudan o darbogazi besler.        |
| **Gercek bir rerank modeli / adimi**                                                 | Hala erken — ve gerekce ADR-0035'tekiyle **ayni**, tekrar degil: rerank bir **kalibrasyon** isidir, elimizdeki ise **dagilim** verisidir. Dagilim "bir kaynak hic giremiyor" demeye yeter, "su parca su parcadan alakali" demeye yetmez. Ayrica rerank her soruya **ucuncu bir ag cagrisi** ekler (embed + complete + rerank) ve gecikme butcesini, olculmus darbogazin ustune yigar. Taban kisitı **sifir** ag cagrisi ekler. |
| **Modul basina sabit kota** (ADR-0031 §5.1'in reddettigi)                            | Reddi hala gecerli: "her modulden 2" kurali, bir musteri sorusunda en iyi kanitlarin **hepsinin** tek modulden gelebilecegi gercegini yok sayar ve en iyi kanitlari en kotuleriyle degistirir. Bu ADR **modul** basina degil **kaynak TURU** basina konusuyor ve yalnizca bir **taban** koyuyor — tavan degil.                                                                                                                 |
| **Yapisal kaynaklara toplu kota** ("yapisallara 3 yuva")                             | Olculen senaryoda **hicbir sey degistirmezdi**: yapisal kaynaklar zaten 3/8 almisti, ama ikisi `project-status`'a gidiyordu. Sorun toplam pay degil, yapisal kaynaklar **arasindaki** aclıktir — bu yuzden taban kaynak basina tanimlandi.                                                                                                                                                                                     |
| **Taban degerini config'e acmak** (`CONTEXT_STRUCTURAL_FLOOR`)                       | `MIN_SAMPLE` icin verilen ayni gerekce: bu bir **is tercihi** degil, iki skor olcegi arasindaki **mimari dengedir**. Ayarlanabilir olsaydi 0'a cekilebilir ve bu ADR **sessizce geri alinmis** olurdu.                                                                                                                                                                                                                         |
| **Platformun yapisal kaynaklari ADINDAN tanimasi** (dahili liste)                    | `platform/context`'i is modullerinin **adlarina** baglardi — port'un acikca reddettigi sey. Liste her yeni modulde **sessizce bayatlardi**: yeni yapisal katkici garantisini alamaz, hicbir test kirmizi yanmaz.                                                                                                                                                                                                               |

## Bilinen sinirlar

- ⚠️ **Skorlar kaynaklar arasinda HALA KALIBRE DEGIL.** Bu ADR kalibrasyon
  yapmaz; kalibrasyonsuzlugun **en gorunur sonucunu** telafi eder. ADR-0031'in
  bilinen siniri yerinde durur.
- ⚠️ **"Her yapisal kaynak her cevapta" GARANTI DEGILDIR** (§ Sonuclari). Dort
  yapisal kaynak, uc yuvali taban — biri disarida kalabilir.
- ⚠️ **Anlamsal kaynaklar arasinda taban YOKTUR.** Alti anlamsal kaynak bes
  serbest yuva icin yarisacak ve biri sifir alabilir. Bu **bilincli**: anlamsal
  kaynaklar **ayni olcegi** paylasir, yani aralarindaki eleme liyakattir —
  bu ADR'nin duzelttigi olcek uyusmazligi degil.
- ⚠️ **Bu karar Mutlak Kural 1'e bilincli bir istisnadir**: dokuz katkici
  dosyasina birer satirlik beyan eklendi. Alternatifi (platformun modul
  adlarini bilmesi) mimari olarak daha kotuydu. Product Owner onayiyla, tek
  islem olarak yapildi.
- **Olcum tekrarlanmadi.** Bu ADR'nin etkisi birim ve entegrasyon testleriyle
  kilitlenmistir; ADR-0035 §6.3'un turunden **canli bir dagilim olcumu**
  ADR-0037'nin (altinci anlamsal kaynak) kapanis denetimine birakildi.

## Bu karar ne zaman yeniden gozden gecirilir?

- **`K` degistiginde** (`KNOWLEDGE_RETRIEVAL_LIMIT`): taban kendiliginden
  olceklenir ama `ceil(K/3)` oraninin hala dogru oldugu **tekrar sorulmalidir**.
- **Yapisal kaynak sayisi tabanin iki katini gectiginde** (bugun 4, esik 6):
  o noktada kaynaklarin yarisindan fazlasi garanti disinda kalir ve "genislik"
  vaadi anlamini yitirmeye baslar.
- **Olculmus bir KALITE verisi olustugunda**: o gun rerank tartismasi
  yeniden acilir ve bu ADR'nin yerini alabilir — bu kisit, rerank'in
  **yerine** degil, **once**sine konmustur.
- **Bir yapisal kaynak alarm durumundayken (`0.95`) sistematik olarak
  giremiyorsa**: taban buyuklugu ya da yapisal skor merdiveni yanlis
  demektir.
