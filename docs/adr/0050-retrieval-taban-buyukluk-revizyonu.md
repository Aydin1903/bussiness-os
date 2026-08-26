# 0050 — T2 atesledi: taban buyuklugu, `K` ve rerank YENIDEN SINANDI

- **Durum:** ⚠️ **ONERILDI — PRODUCT OWNER ONAYI BEKLIYOR**
- **Tarih:** 2026-08-26
- **Karar veren:** Product Owner
- **Faz:** 5 (platform karari — bir modul ADR'si DEGIL)

> ### ⚠️ SONUC ONCE: HICBIR SEY DEGISMIYOR — AMA "OLCULDU" DIYE, "VARSAYILDI" DIYE DEGIL
>
> Taban `ceil(K/3)` kaliyor · `K` **8**'de kaliyor · rerank **acilmiyor**.
>
> ⚠️ **Ama bu, ADR-0042'nin "gozden gecirildi, degisiklik gerekmiyor"
> sonucunun tekrari DEGILDIR.** Olcum, uc secenegin de **yanlis problemi
> cozdugunu** gosterdi ve ⚠️ **asil kisiti ILK KEZ isimlendirdi:**
> skorlar kaynaklar arasi **karsilastirilabilir degil** — ve bu, tabanin da
> `K`nin da cozemeyecegi bir seydir (§4).

---

## Baglam

[ADR-0042](0042-retrieval-taban-revizyonu.md) §3'un **T2** tetikleyicisi:

> _"**Satir donduren** yapisal kaynak sayisi `2 × K / 3`'u **gectiginde**
> (bugun `K = 8` icin **6**)."_

[ADR-0045](0045-musteri-geri-bildirim-modulu.md) ve
[ADR-0047](0047-kampanya-pazarlama-modulu.md)'nin askidaki iki katkicisi
eklendikten sonra **atesledi ve dort soruda da tutarli**:

| Olcu                      | ADR-0048 (once) |  ⚠️ **Bugun**   |
| ------------------------- | :-------------: | :-------------: |
| Kayitli yapisal kaynak    |        6        |      **8**      |
| ⚠️ Satir donduren yapisal |        6        |      **8**      |
| T2 esigi (`2K/3`)         |        6        |        6        |
| **T2**                    |   atesleMEDI    | ⚠️ **ATESLEDI** |
| Toplam katkici            |       15        |     **18**      |
| `K`                       |        8        |        8        |

⚠️ Bu ADR'nin girdisi **ADR-0049 SONRASI** alinmis, dort sorulu, gercek
saglayicili bir olcumdur (denetim tenant'i, `retrieval.select`). ADR-0049
esitlik kirmayi liyakate/adalete bagladigi icin ⚠️ **bugunku dagilim, ADR-0048'in
"kayit sirasi" dagilimiyla ayni sey degildir** — ve bu fark, asagidaki uc
sorunun cevabini dogrudan degistiriyor.

---

## Olcum

### 1. Yapisal yuva dagilimi — 4 soru × 3 yuva = 12 yuva

| Soru                   | Yuva alan uc yapisal kaynak                                       |
| ---------------------- | ----------------------------------------------------------------- |
| S1 genel               | `inventory-stock` · `invoicing-pipeline` · `project-status`       |
| S2 riskler             | `appointment-schedule` · `campaign-gap` · `feedback-satisfaction` |
| S3 nakit+stok          | `finance-cashflow` · `inventory-stock` · `project-status`         |
| S4 kampanya+memnuniyet | `campaign-gap` · `feedback-satisfaction` · `project-status`       |

| Kaynak                  | Kac soruda yuva |
| ----------------------- | :-------------: |
| `project-status`        |       3/4       |
| `inventory-stock`       |       2/4       |
| `feedback-satisfaction` |       2/4       |
| `campaign-gap`          |       2/4       |
| `invoicing-pipeline`    |       1/4       |
| `appointment-schedule`  |       1/4       |
| `finance-cashflow`      |       1/4       |
| ⚠️ **`crm-pipeline`**   |   ⚠️ **0/4**    |

⚠️ **Sekiz kaynagin yedisi en az bir kez iceri girdi.** ADR-0048'in olcumunde
uc kaynak **dort soruda da** disaridaydi ve hep AYNI ucu; bugun disarida
kalanlar **soruya gore degisiyor**.

### 2. ⚠️ TABAN PRATIKTE BIR TAVAN — VE BU YAZILI BEKLENTININ TERSI

| Soru | Yapisal yuva | Anlamsal yuva | Toplam | Taban |
| ---- | :----------: | :-----------: | :----: | :---: |
| S1   |    **3**     |       5       |   8    |   3   |
| S2   |    **3**     |       5       |   8    |   3   |
| S3   |    **3**     |       5       |   8    |   3   |
| S4   |    **3**     |       5       |   8    |   3   |

⚠️ **Dort soruda da yapisal taraf TAM OLARAK 3 yuva aldi — bir fazla degil.**

ADR-0036 acikca sunu yaziyordu:

> _"⚠️ TABAN BIR TAVAN DEGILDIR: rezerve dagitildiktan sonra yapisal parcalar
> serbest havuzda da yarisir. Alarm durumundaki bir kaynak (0.95) hem tabandan
> yuvasini alir hem de ek satirlar kazanabilir."_

⚠️ **Bu, olcumde HIC GERCEKLESMEDI ve sebebi aritmetiktir** (§4.1): yapisal
tavan skoru **0.95**, anlamsal en iyi isabetler ise **1.0**. Serbest havuzda
yapisal bir parca anlamsal bir parcayi **hicbir zaman gecemez**.

> ⚠️ Yani bugun `ceil(K/3)` bir **alt sinir** degil, yapisal tarafin **tam
> payidir**. ADR-0036'nin cumlesi bir varsayimdi; olcum onu yanlisladi ve bu,
> §Karar 1'in tek en onemli girdisidir.

### 3. Secimi ne belirledi: LIYAKAT mi KUR'A mi

ADR-0049 uc anahtar koydu (`score` → `affinity` → `lot`). Hangisinin
belirledigi **ilk kez** olculdu:

| Soru                             | Yuva | ⚠️ `affinity` > 0 ile secilen | Kur'a ile secilen |
| -------------------------------- | :--: | :---------------------------: | :---------------: |
| S1 genel                         |  3   |             **0**             |       **3**       |
| S2 riskler                       |  3   |             **0**             |       **3**       |
| S3 nakit+stok (hedefli)          |  3   |             **2**             |         1         |
| S4 kampanya+memnuniyet (hedefli) |  3   |             **3**             |       **0**       |
| **Toplam**                       |  12  |             **5**             |       **7**       |

⚠️ **Desen kesin ve ikiye ayriliyor:** hedefli bir soruda `affinity` yapisal
yuvalarin **tamamina yakinini** belirliyor (5/6); genel bir soruda
**hicbirini** (0/6) — cunku hicbir yapisal parcanin soruyla ortak kelimesi
yok ve karar tumuyle kur'aya dusuyor.

⚠️ Bu, ADR-0049'un kendi tahmininin **dogrulanmasidir** ve §Karar 3'un
girdisidir: `affinity` **calisiyor ama dar**; genel sorularda hicbir sey
soylemiyor.

### 4. ⚠️ HAVUZUN GERCEK DARBOGAZI: SKORLAR KARSILASTIRILABILIR DEGIL

Bu, olcumun **beklenmeyen** ve en agir bulgusudur.

| Taraf        | Skorun kaynagi                                           | Kaynaklar arasi anlami                     |
| ------------ | -------------------------------------------------------- | ------------------------------------------ |
| **Yapisal**  | Sabit band: `0.95` / `0.90` / `0.75`                     | ⚠️ Yok — band bir **aciliyet beyani**      |
| **Anlamsal** | ⚠️ `1 - index / (satir + 1)` — **SIRA**, benzerlik DEGIL | ⚠️ Yok — her kaynagin en iyisi **tam 1.0** |

⚠️ **On anlamsal katkicinin ONU DA `1 - index/(n+1)` formulunu kullaniyor**
(kod tarandi). Yani **her kaynagin en iyi isabeti tam olarak `1.0` skorluyor**
ve tepede **on yonlu bir beraberlik** var. Kosinus mesafesi yalnizca
**kaynagin KENDI ICINDE** siralama yapiyor; disari cikan sayi bir **konum**.

**Somut sonuclari, olculmus hâliyle:**

- On anlamsal kaynaktan **besi yuva aliyor, besi sifir** — ve ayrimi yapan sey
  benzerlik **degil**, ADR-0049'un esitlik kirmasi.
- ⚠️ `candidateCount = 58`, `selectedCount = 8` — **50 aday eleniyor** ve
  elemenin buyuk kismi **bir benzerlik olcusune dayanmiyor**.
- Yapisal tarafta da durum ayni: sekiz kaynagin sekizi de alarm bandinda
  (`0.95`) olabiliyor ve band ici sira `affinity`/`lot`a kaliyor.

> ⚠️ **Havuzun bugunku kisiti bir KAPASITE sorunu degil, bir OLCU sorunudur.**
> Ne tabani buyutmek ne `K`yi buyutmek bunu degistirir: ikisi de **daha cok
> parca** alir, ama parcalari **hangi olcuyle** siraladigimizi degistirmez.

### 5. Maliyet verisi (`ai.call`, dort cagri)

| Olcu                        | Deger                                                  |
| --------------------------- | ------------------------------------------------------ |
| Ortalama `promptTokens`     | **793** (770–813)                                      |
| Ortalama `completionTokens` | 356                                                    |
| Ortalama `complete` suresi  | **3876 ms** (2783–4539)                                |
| Ortalama `embed` suresi     | 532 ms                                                 |
| Darbogaz                    | ⚠️ `LLMPort.complete` — **yedinci olcumde ayni yerde** |

---

## Karar

### 1. ⚠️ TABAN `ceil(K/3)` KALIYOR — buyutmek YALNIZCA SINIRI KAYDIRIR

`ceil(K/2)` (yani 4) degerlendirildi ve **reddedildi**. ADR-0036 bunu
**tahminle** reddetmisti; bugun **olcumle** reddediliyor ve gerekce degisti:

⚠️ **Havuz IKI TARAFTA DA doymus durumda.** 18 kaynak, 8 yuva. Taban bir
**kapasite yaratmaz**, yalnizca **transfer eder**:

|     Taban     | Yapisal pay |        Yapisal kapsama        | Anlamsal pay |      ⚠️ Anlamsal kapsama      |
| :-----------: | :---------: | :---------------------------: | :----------: | :---------------------------: |
| **3 (bugun)** |     3/8     | 8 kaynak icin **3/8 = %37,5** |     5/8      | 10 kaynak icin **5/10 = %50** |
|       4       |     4/8     |     8 kaynak icin **%50**     |     4/8      |   ⚠️ 10 kaynak icin **%40**   |
|       5       |     5/8     |             %62,5             |     3/8      |          ⚠️ **%30**           |

⚠️ **Tabani 4 yapmak, yapisal kapsamayi %12,5 artirmak icin anlamsal
kapsamayi %10 dusurur** — ve anlamsal taraf **on kaynakla daha kalabalik**.
Bu bir iyilesme degil, **bir taraftan alip digerine vermektir**.

⚠️ **VE ASIL GEREKCE:** tabani buyutmenin cozecegi sorun —
**sistematik aclik** — ⚠️ **ZATEN COZULDU** (ADR-0049), ve **sifir kapasite
bedeliyle**. Olcum bunu gosteriyor: ADR-0048'de uc kaynak dort soruda da
disaridaydi ve hep AYNI ucu; bugun sekiz kaynagin **yedisi** en az bir kez
iceri giriyor.

> ⚠️ **DURUST KALINTI — ve bu ADR onu gizlemiyor:** rotasyon **sorular
> arasinda** adildir, **tek bir soru icinde degil**. Bir soruda bes yapisal
> kaynak hala sessizdir; sessiz olan tam da o soruda gereken kaynaksa, cevap
> O SORU ICIN eksiktir. ⚠️ Bunu duzeltmenin yolu taban degil `affinity`dir
> (§3'te olculdu: hedefli soruda 5/6 yuvayi liyakat belirledi) — ve
> `affinity`nin dar oldugu yer §Karar 3'un konusudur.

⚠️ **`crm-pipeline`in 0/4'u bir ARIZA DEGIL, ISTATISTIKTIR:** sekiz kaynak
uc yuva icin yarisirken bir kaynagin dort cekilisi de kacirmasi beklenen bir
sonuctur (adil bir kur'ada ~%15). ⚠️ **Bunu "aclik" diye okumak, ADR-0049
oncesi refleksle okumaktir.**

#### 1.1 ⚠️ AMA ADR-0036'NIN BIR CUMLESI YANLISLANDI ve duzeltilmelidir

ADR-0036 _"taban bir tavan degildir"_ diyordu; §2 bunun **dort soruda da
gerceklesmedigini** olctu. ⚠️ Bu ADR o cumleyi **silmez** (v1.7 kurali) ama
uzerine sunu yazar:

> ⚠️ **`K = 8` ve bugunku skor olcekleriyle taban PRATIKTE bir tavandir**,
> cunku yapisal tepe (`0.95`) anlamsal tepeyi (`1.0`) hicbir zaman gecemez.
> Cumle **yanlis degil, KOSULLUDUR**: ancak yapisal bir parca `1.0`in ustune
> cikabilirse dogru olur — ki bu, §Karar 3'un (rerank) isidir.

### 2. ⚠️ `K` **8**'DE KALIYOR — ve bu kez itiraz OLCULMUS bir rakama dayaniyor

ADR-0036'nin itirazi ikiydi: _"oran ayni kaldigi icin yapisal kaynaklar yine
en sona duser"_ ve _"her soru daha pahali hale gelir"_. Ikisi de bugunku
veriyle **yeniden sinandi**:

**(a) Oran itirazi — ⚠️ ARTIK GECERLI DEGIL, ama sonucu degistirmiyor.**
ADR-0036 yazildiginda eleme kayit sirasina dusuyordu; `K`yi buyutmek gercekten
"ayni sonu" uretirdi. ⚠️ ADR-0049 sonrasi eleme **donusumlu**, yani `K = 12`
yapisal tarafa `ceil(12/3) = 4` yuva verirdi ve kapsama **%37,5 → %50**
cikardi. ⚠️ **Yani bu itiraz artik dogru degil ve durustce kaydediliyor.**

**(b) Maliyet itirazi — ⚠️ OLCULDU ve AYAKTA.**

| Olcu                       | `K = 8` (bugun) | `K = 12` (tahmin) |
| -------------------------- | :-------------: | :---------------: |
| Ortalama `promptTokens`    |     **793**     |    ⚠️ **~990**    |
| Artis                      |        —        |    ⚠️ **~%25**    |
| Ortalama `complete` suresi |     3876 ms     |     olculMEDI     |

Sekiz parcanin toplam agirligi promptun yaklasik yarisi (~400 token, parca
basina ~~50); dorde bir artis promptu **~~%25 buyutur** ve ⚠️ bu maliyet
**HER SORUYA** yayilir — hedefli olana da, genel olana da.

⚠️ **VE BUYUTMENIN CEVABINI IYILESTIRDIGINE DAIR HICBIR VERI YOK.** §4'un
bulgusu geregi eklenecek dort parca, **bir benzerlik olcusuyle degil**
`affinity`/`lot` ile secilirdi. ⚠️ **Kalibre olmayan bir siralamadan daha cok
ornek almak, dogruyu bulma olasiligini artirmaz — yalnizca promptu buyutur.**

> ⚠️ **Karar tek cumleyle:** `K`yi buyutmek **olculmus bir maliyeti**,
> **olculmemis bir fayda** icin oder. Once fayda olculebilir hale gelmelidir
> (§Karar 3) — ⚠️ **sira tersine cevrilemez** (ADR-0042'nin ilkesi, dorduncu
> kez).

### 3. ⚠️ RERANK ACILMIYOR — ve `affinity` onun kosulunu KARSILAMAZ

⚠️ **Bu bolum bilerek keskin yaziliyor**, cunku yanlis okunmaya en acik yer
burasidir.

`affinity` (ADR-0049 §2) bir **rerank degildir** ve oyle sunulmamalidir:

| Ozellik                               | `affinity`                                    | Bir rerank'ten beklenen              |
| ------------------------------------- | --------------------------------------------- | ------------------------------------ |
| Ne zaman calisir                      | ⚠️ **YALNIZCA ayni skor bandinda** (band ici) | Butun adaylar uzerinde               |
| Bir bandi ezebilir mi                 | ⚠️ **HAYIR — asla**                           | Evet, siralamayi bastan kurar        |
| Nasil olcer                           | Kaba **kelime ortusmesi** (govdeleme/IDF yok) | Anlamsal alaka (model/cross-encoder) |
| Kaynaklar arasi kalibrasyon saglar mi | ⚠️ **HAYIR**                                  | ⚠️ **EVET — asil isi bu**            |
| Genel sorularda ne yapar              | ⚠️ **HICBIR SEY** (§3: 0/6 yuva)              | Yine siralar                         |
| Kalite verisiyle dogrulandi mi        | ⚠️ **HAYIR**                                  | Dogrulanmasi zorunlu                 |

> ⚠️ **`affinity` bir ESITLIK KIRICIDIR: iki esit adaydan birini secer.
> Rerank ise ESITLIGIN KENDISINI ortadan kaldirir — 58 adayi tek bir
> karsilastirilabilir olcege koyar.** Ikisi ayni sorunun farkli
> buyuklukteki cevaplari degil, **farkli sorulara verilmis cevaplardir.**

**Rerank'in ertelenme kosulu — _"olculmus kalite verisi yok"_ — HALA
GECERLIDIR.** Bugun elde olan sey **dagilim** verisidir (hangi kaynak girdi),
**kalite** verisi degil (girmesi gereken kaynak girdi mi). ⚠️ Bu ikisi
karistirilirsa, "sekiz kaynagin yedisi iceri girdi" cumlesi bir **kalite
kaniti** sanilir — degildir.

⚠️ **Bu ADR o veriyi URETMEZ ve uretmeye calismaz.** Gereken sey — ve
kapsam disi birakildigi acikca yaziliyor:

1. Bir **degerlendirme kumesi**: sorular + o soru icin cevaba GIRMESI GEREKEN
   kaynak/parca kumesi (elle etiketlenmis).
2. Bir **olcut**: secilen kume ile beklenen kume arasindaki ortusme.
3. ⚠️ Bunlarin **denetim tenant'i uzerinde tekrar uretilebilir** olmasi
   (ADR-0048'in araci hazir; eksik olan **etiketli sorulardir**).

⚠️ **Uc kalem de bugun YOKTUR** ve hicbiri bir "ek" degil, kendi basina bir
istir.

### 4. ⚠️ T2'NIN ANLAMI DEGISTI — tetikleyici YENIDEN YAZILMALI

Bu, olcumun surece dair en onemli sonucudur.

T2 (`satir donduren yapisal kaynak > 2K/3`) ve T1 (`bir yapisal kaynak alarm
bandinda uc soruda da giremiyor`), ⚠️ **ADR-0049 ONCESI bir dunyada
yazilmisti**: o gun eleme **kayit sirasina** dusuyordu ve ikisi de gercek bir
**sistematik aclik** sinyaliydi.

⚠️ **Bugun ikisi de "normal calisma"da atesliyor:**

| Tetikleyici | Bugun                           | Neyi olcuyor (bugun)                                   |
| ----------- | ------------------------------- | ------------------------------------------------------ |
| **T1**      | ⚠️ `crm-pipeline` 0/4 → ATESLER | ⚠️ **Adil rotasyonun normal sonucu** — aclik DEGIL     |
| **T2**      | 8 > 6 → ATESLER                 | ⚠️ **Katkici sayisinin K'yi asmasi** — bir kusur DEGIL |

> ⚠️ **Bir tetikleyici her zaman atesliyorsa, artik bir tetikleyici degildir.**
> T2 bundan sonra HER modulde ateslenecek (12. modul gelince yapisal kaynak
> 9 olabilir) ve her seferinde bu ADR'nin sonucuna varilacak.

**Onerilen (⚠️ PO onayina bagli):** T1 ve T2 **emekliye ayrilir** ve yerlerine
⚠️ **KALITE tabanli** bir tetikleyici konur — ama **ancak §Karar 3'un
degerlendirme kumesi var olunca**. O gune kadar:

- ⚠️ T2 **kapatilmaz ama YENIDEN YORUMLANIR**: ateslemesi artik "tabani gozden
  gecir" degil, ⚠️ **"bu ADR'yi oku ve degisen bir sey var mi bak"** demektir.
- Her modul ADR'sinin **sabit esik kontrolu maddesi KALIR** (CLAUDE.md'nin
  kalici dersi) — degisen sey **cevabin ne anlama geldigidir**.

⚠️ **Bu ADR tetikleyicileri KENDISI emekli etmiyor**: onlari yazan ADR-0042'yi
supersede etmek, elimde **kalite verisi yokken** yapilacak bir sey degil —
ADR-0042'nin kendi ilkesinin (_"veriye sahip olmadan revize edilmez"_)
aynasi. ⚠️ Burada yapilan sey, **ateslemenin ANLAMINI kayda gecirmektir.**

---

## Gerekce

**Neden uc secenek de reddedildi — ve ucu de AYNI sebeple.** Taban, `K` ve
(bugunku hâliyle) rerank tartismasi hep bir **kapasite** sorusu gibi kuruldu:
"kac yuva, kime". ⚠️ Olcum kapasitenin degil **OLCUNUN** kisit oldugunu
gosterdi (§4): 58 aday, karsilastirilamaz iki olcekte (`0.95` bandlari ve
`1.0` konumlari) ve tepede on yonlu bir beraberlik. ⚠️ **Daha cok yuva
dagitmak, yanlis olcuyle daha cok secim yapmaktir.**

**Neden "degisiklik yok" bu sefer bir SONUC, bir erteleme degil.** ADR-0042 da
"degisiklik gerekmiyor" demisti ama ⚠️ **o gun elinde veri yoktu** — ADR-0046
araci, ADR-0048 numuneyi, ADR-0049 adil elemeyi kurdu. Bugun uc sorunun ucu de
**rakamla** cevaplaniyor: kapsama %37,5 (olculdu), yapisal pay tam 3/8 dort
soruda da (olculdu), prompt maliyeti %25 (hesaplandi), liyakat/kur'a dagilimi
5/7 (olculdu).

**Neden `affinity` rerank sayilmiyor.** Cunku olculdu: genel sorularda **sifir**
yuvayi belirledi (§3). Bir mekanizmayi, calistigi dar bandin disinda calisiyor
gibi sunmak, bu projede tam olarak reddedilen sey — ADR-0049'un `lot` icin
yazdigi cumlenin ayni disiplini: **ne oldugunu ve ne olmadigini ayirmak.**

---

## Sonuclari

**Olumlu**

- ⚠️ **Uc acik soru da rakamla kapandi** ve cevaplar bir sonraki modulun ADR'si
  icin hazir: taban, `K` ve rerank **yeniden tartisilmaz** — bu belge okunur.
- ⚠️ **Havuzun gercek kisiti ILK KEZ isimlendirildi** (§4): skor
  karsilastirilabilirligi. Bu, ADR-0031'den beri "bilinen sinir" diye **on bir
  kez** yazilan cumlenin ilk kez **olculmus** hâlidir.
- ⚠️ ADR-0036'nin _"taban bir tavan degildir"_ cumlesinin **kosullu** oldugu
  kayda gecti — bir varsayim, olcumle duzeltildi.
- Rerank'in gerekcesi artik **spekulatif degil**: hangi sorunu cozecegi (§4) ve
  hangi verinin eksik oldugu (§Karar 3) yazili.
- Sifir kod degisikligi, sifir migration, sifir davranis degisikligi.

**Olumsuz / bedeli**

- ⚠️ **TEK BIR SORUDA BES YAPISAL KAYNAK HALA SESSIZ.** Rotasyon bunu sorular
  arasinda adil kilar ama **tek soruyu tamamlamaz**; hedefli olmayan bir soruda
  sessiz kalan kaynak **kur'ayla** belirlenir.
- ⚠️ **`crm-pipeline` bu olcumde HIC duyulmadi** — istatistiksel olarak normal,
  ama bir kullanicinin dort sorusunda da CRM hattinin sessiz kalmasi **gercek
  bir deneyimdir**.
- ⚠️ **T1 ve T2 artik "her zaman atesleyen" tetikleyiciler** ve emekli
  edilmeleri **kalite verisine bagli** — yani bir sure daha gurultu uretecekler.
- ⚠️ Karar **tek bir tenant** ve **dort soru** uzerinde alindi; tenant bilerek
  "alarm dolu" (ADR-0048 §8.6). ⚠️ Sakin bir tenant'ta yapisal kaynaklarin cogu
  `empty` doner ve taban zaten devreye girmez — ⚠️ **o senaryo hala
  olculmedi**.
- ⚠️ `K = 12` icin prompt tahmini (**~%25**) bir **hesaptir, olcum degildir**;
  gercek etki `complete` suresinde de olculmelidir ve olculMEDI.

---

## Degerlendirilen alternatifler

| Alternatif                                                              | Neden secilmedi                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚠️ **Tabani `ceil(K/2)` = 4 yapmak**                                    | §Karar 1 — havuz iki tarafta da doymus; taban kapasite **yaratmaz, transfer eder** (anlamsal kapsama %50 → %40). ⚠️ Cozecegi sorun (sistematik aclik) ADR-0049 ile **sifir bedelle** zaten cozuldu.                                                                                   |
| **Tabani 5'e cikarmak**                                                 | Ayni gerekce, daha sert: anlamsal kapsama **%30**a duser ve on anlamsal kaynak uc yuva icin yarisir.                                                                                                                                                                                  |
| ⚠️ **`K`yi 12'ye cikarmak**                                             | §Karar 2 — ⚠️ **olculmus bir maliyeti (~%25 prompt), olculmemis bir fayda icin** oder. Eklenecek dort parca yine kalibre olmayan bir siralamadan gelirdi.                                                                                                                             |
| **`K`yi yalnizca HEDEFLI sorularda buyutmek**                           | ⚠️ "Hedefli"yi belirleyen tek sinyal `affinity`dir ve o **kaba** (§Karar 3). Bir maliyet karari, dogrulanmamis bir sinyale baglanamaz. ⚠️ Ayrica ayni soruya farkli zamanlarda farkli `K` uygulamak, ADR-0048'in **tekrar uretilebilir olcumunu** bozardi.                            |
| ⚠️ **Rerank'i simdi acmak**                                             | §Karar 3 — ertelenme kosulu (**olculmus kalite verisi**) hala karsilanmiyor. ⚠️ `affinity`nin varligi bu kosulu **karsilamaz**: band ici, kaba ve genel sorularda **sifir** etkili.                                                                                                   |
| ⚠️ **`affinity`yi ana skora karistirmak** (`score + affinity`)          | ⚠️ Bir alarm, kelimeleri soruya benzemedigi icin **susardi** — ADR-0049 KANIT 3 bunu bir testle kilitliyor. Ustelik `affinity` kalibre degil; ana skora katmak kalibrasyonsuzlugu **iki katina** cikarirdi.                                                                           |
| ⚠️ **Anlamsal skoru gercek benzerlige cevirmek** (`1 - cosineDistance`) | ⚠️ **En cazip alternatif ve TEK BASINA reddedildi:** on modulun katkicisina birden dokunur (Mutlak Kural 1) ve ⚠️ **yapisal tarafla hala kiyaslanamaz** — bir kosinus 0.83 ile bir "alarm 0.95" ayni olcekte degildir. ⚠️ Bu, rerank'in isidir ve §Karar 3'un veri kosuluna baglidir. |
| **T1/T2'yi bu ADR ile emekli etmek**                                    | §Karar 4 — ADR-0042'yi supersede etmek **kalite verisi olmadan** yapilamaz; ilkenin aynasi. Bugun yapilan sey ateslemenin **anlamini** kayda gecirmektir.                                                                                                                             |
| **Hicbir sey yazmamak** ("T2 atesledi, gecelim")                        | ⚠️ ADR-0042 T2'yi acikca bir tetikleyici olarak yazdi. Atesledigi gun sessiz kalmak, tetikleyiciyi **bastan anlamsiz** kilardi (ADR-0049'un ayni gerekcesi).                                                                                                                          |

---

## Bilinen sinirlar

- ⚠️ **KALITE OLCUSU YOK.** Bu ADR yalnizca **dagilim** olcer. "Girmesi gereken
  kaynak girdi mi" sorusu **hala cevapsizdir** ve rerank'in kosulu tam olarak
  budur.
- ⚠️ **TEK TENANT, DORT SORU, ALARM DOLU.** Sakin bir tenant olculmedi
  (ADR-0048'in ayni acik borcu).
- ⚠️ **`K = 12`nin GERCEK maliyeti olculmedi** — prompt tahmini bir hesap;
  `complete` suresine etkisi bilinmiyor.
- ⚠️ **Anlamsal skor bir SIRADIR, bir benzerlik degil** (§4) ve bu ADR onu
  **degistirmiyor** — yalnizca kayda geciriyor. On katkiciya birden dokunmak
  ayri bir istir.
- ⚠️ **T1 ve T2 bu ADR'den sonra da atesleyecek.** Emekli edilmediler; yalnizca
  ateslemelerinin anlami yaziya gecti.
- ⚠️ **`crm-pipeline`in 0/4'u kur'anin normal sonucu SAYILDI** — ama bu, dort
  sorulu kucuk bir ornekte **ayirt edilemez**: gercek bir sistematik sorun da
  ayni gorunurdu. ⚠️ Ayrimi ancak daha buyuk bir soru kumesi yapar ve o kume
  **yok**.
- **Yeni bir env degiskeni, yeni bir bagimlilik, yeni bir migration YOKTUR.**

---

## Bu karar ne zaman yeniden gozden gecirilir?

- ⚠️ **Bir DEGERLENDIRME KUMESI olustugunda** (§Karar 3'un uc kalemi): rerank'in
  ertelenme kosulu **o gun duser** ve taban/`K` sorulari da **kalite uzerinden**
  yeniden sorulabilir hale gelir. ⚠️ Bu, bu ADR'nin isaret ettigi **tek gercek
  ilerleme yoludur**.
- ⚠️ **Anlamsal skor gercek benzerlige cevrildiginde:** §2'nin "taban pratikte
  tavandir" bulgusu **degisebilir** — yapisal bir `0.95`, kalibre edilmis bir
  anlamsal skoru gecebilir hale gelir ve ADR-0036'nin cumlesi **kosulsuz
  dogru** olur.
- ⚠️ **12. modul (Sadakat) bir yapisal katkici eklerse:** yapisal kaynak 9
  olur, kapsama %37,5 → **%33**e duser. ⚠️ O gun soru "tabani buyutelim mi"
  degil, ⚠️ **"bu kaynak gercekten yapisal mi"** olmalidir (ADR-0040'in uc
  adayi reddetme disiplini).
- ⚠️ **`K` degistirilmek istendiginde:** once §Karar 2'nin maliyet tablosu
  **gercek bir olcumle** doldurulmalidir (`complete` suresi dahil), tahminle
  degil.
- **Sakin bir tenant olculdugunde:** yapisal kaynaklarin cogu `empty` donerse
  taban zaten devreye girmez ve bu ADR'nin butun aritmetigi **farkli bir
  rejimde** yeniden bakilmalidir.
