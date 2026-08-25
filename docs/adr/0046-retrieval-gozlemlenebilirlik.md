# 0046 — `POST /ask` secim gozlemlenebilirligi: `retrieval.select`

- **Durum:** Onerildi — ⚠️ **PRODUCT OWNER ONAYI BEKLIYOR** (PLATFORM karari)
- **Tarih:** 2026-08-25
- **Karar veren:** Product Owner
- **Faz:** 5 (platform karari — bir modul ADR'si DEGIL)

## Baglam

[ADR-0042](0042-retrieval-taban-revizyonu.md) §4, kapanis denetimlerinin olcum
protokolunu **degistirdi** ve uc sey istedi:

> 1. hangi kaynaklarin cevaba girdigi (bugunku kayit),
> 2. ⚠️ **her yapisal kaynagin o cagrida DONDURDUGU SATIR SAYISI** — `0` ise
>    kaynak elenmedi, **soyleyecek seyi yoktu** (T2'nin girdisi),
> 3. ⚠️ **giren ve girmeyen her parcanin SKORU** — band ici siralamanin
>    liyakatli mi yoksa kararli-siralama mi oldugunu gosteren tek veri.

Ayni ADR bunun bir **kod degisikligi degil denetim protokolu degisikligi**
oldugunu yazdi ve olcumun _"denetim sirasinda sunucu loglarindan ya da gecici
bir arac kosumuyla"_ alinacagini varsaydi.

### ⚠️ O VARSAYIM IKI KEZ TEST EDILDI VE IKISINDE DE COKTU

| Kapanis denetimi                                 | Ne oldu                                                                                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ADR-0043](0043-ik-personel-modulu.md) (IK)      | ⚠️ **UYGULANAMADI.** Gecici enstrumantasyon `@nestjs/config`in Zod semasinin bilinmeyen env anahtarlarini **eleyip atmasi** yuzunden calistirilamadi. |
| [ADR-0045](0045-musteri-geri-bildirim-modulu.md) | ⚠️ **YINE UYGULANAMADI.** Sure olculdu (N=15, ~3,35 s) ama satir sayisi ve skorlar **hicbir yerde kaydedilmiyor**.                                    |

⚠️ **Iki bagimsiz denetim, iki farkli modul, ayni duvar.** Bu artik "o gun
denenmedi" degil, **yapisal bir eksiklik**tir: ADR-0042 kendi protokolunu
yazarken ihtiyac duydugu araci **var saydi** ve o arac hic var olmadi.

### Somut bedeli — bir karar ASKIDA kaldi

ADR-0045 §3.4 `feedback-satisfaction` yapisal katkicisini **reddetmedi**,
**kosullu erteledi** ve on kosullari sirayla yazdi:

> _"(1) `retrieval.select` gozlemlenebilirlik satiri yazilir, (2) bir kapanis
> denetiminde olcum yapilir, (3) ADR-0036/0042 yeniden acilir, (4) ancak ondan
> sonra katkici."_ ⚠️ _"Sira TERSINE CEVRILEMEZ."_

Yani bugun **bir modul karari, bir platform aracinin yoklugu yuzunden
verilemiyor**. Ve bu tekil bir durum degil: ROADMAP §3.5'in kalan iki modulu
(11. Kampanya, 12. Sadakat) ayni esik kontrolunden gececek ve ayni soruyu
soracak.

> ⚠️ **Bu ADR'nin var olma sebebi tek cumleyle:** ADR-0042'nin ilkesi
> _"bir platform karari, onu degistirmesi gereken VERIYE SAHIP OLMADAN revize
> edilmez"_ idi. ⚠️ **O ilke, veriyi URETEN ARACIN VAR OLMASINI gerektirir** —
> ve bugun etmiyor. Bu belge o araci yaziya gecirir, **kararlarin hicbirini
> vermez**.

---

## Karar

### 1. ⚠️ TEK BIR YAPILANDIRILMIS LOG SATIRI — `retrieval.select`

Her `POST /ask` cagrisi, secim tamamlandiktan sonra **tek bir** yapilandirilmis
log satiri birakir. Ad SABITTIR ve **degistirilmez**:

```
event = "retrieval.select"
```

⚠️ `ai.call`in kendi yorumundaki gerekce burada da aynen gecerlidir:
_"DEGISTIRILMEMELIDIR — degisirse gecmis kayitlarla yeni kayitlar ayni sorguya
dusmez ve donem karsilastirmasi sessizce bozulur."_

### 2. ⚠️ TABLO DEGIL, LOG — VE BU KARARIN GEREKCESI UC KATLI

Ayri bir `platform.retrieval_selections` tablosu **degerlendirildi ve
REDDEDILDI**:

1. ⚠️ **RETENTION LISTESINE YIRMI DORDUNCU VE EN HIZLI BUYUYEN KALEMI
   EKLERDI.** Bugun o unvan `platform.audit_log`ta ve ROADMAP §8.5 onu
   _"kararı en zor olan kalem"_ diye isaretliyor. Bu tablo daha da hizli
   buyurdu: **her `/ask` × her katkici** = cagri basina on bese kadar satir.
   Bir denetim aracinin, urunun en buyuk retention borcunu ikiye katlamasi
   kabul edilemez.
2. ⚠️ **YAZMA YOLU, BILEREK TRANSACTION DISINDA TUTULAN BIR AKISA TRANSACTION
   SOKARDI.** `AskUseCase.execute`in yorumu iki ag cagrisinin da transaction
   disinda oldugunu ozellikle yaziyor. Secim sonrasi bir `INSERT`, cevabi
   kullaniciya vermeden once yeni bir transaction acmak demekti — ve o yazma
   coktugunde ne olacagi bir karar daha gerektirirdi.
3. ⚠️ **VERININ TABIATI TESHISTIR, URUN DEGIL.** Bu satirlari hicbir ekran
   okumaz, hicbir kullanici sorgular. Denetim gunlerinde **toplu olarak**
   okunur. `ai.call` tam olarak ayni sinifta bir veriydi ve log secildi;
   burada farkli davranmak **yeni bir felsefe icat etmek** olurdu.

⚠️ **DOGRUDAN SONUCU — ve acikca yaziliyor:** bu kalem **ROADMAP §8.5'e
GIRMEZ**. Retention listesi VERITABANI TABLOLARINI sayar; log satirlarinin
saklama suresi platformun log altyapisinin sorunudur ve **henuz karara
baglanmamistir** (§ Bilinen sinirlar).

### 3. ⚠️ CAGRI BASINA TEK SATIR — KATKICI BASINA DEGIL

On bes ayri satir yerine, ici dizi tasiyan **tek** bir satir yazilir.

Gerekce, ADR-0042'nin sordugu sorunun **seklidir**: sorulan sey _"su katkici
kac satir dondurdu"_ degil, ⚠️ _"**BIR CAGRIDA** kimler yaristi, kim girdi, kim
girmedi"_dir. Uc yapisal sesin ayni cevapta bulunup bulunmadigi ancak cagri
ATOMIK bir birim oldugunda okunur.

On bes ayri satir yazilsaydi, her analiz once `correlationId` uzerinden bir
**JOIN** gerektirirdi ve o join'in yanlis yapilmasi (ornegin iki es zamanli
istegin satirlarinin karismasi) **sessiz bir yanlis** uretirdi.

### 4. Satirin sekli

```jsonc
{
  "event": "retrieval.select",
  "retrieval": {
    "limit": 8, // global top-K (K)
    "structuralFloor": 3, // ceil(K/3) — o cagrida gecerli taban
    "selectedCount": 8, // modele giden parca sayisi
    "candidateCount": 23, // taban ONCESI toplam aday
    "sources": [
      {
        "source": "crm-pipeline",
        "kind": "structural",
        "status": "returned", // asagidaki dort halden biri
        "rowCount": 2, // ⚠️ ADR-0042 §4 madde 2
        "selectedCount": 1,
        "scores": [
          // ⚠️ ADR-0042 §4 madde 3
          { "score": 0.95, "selected": true },
          { "score": 0.75, "selected": false },
        ],
      },
      {
        "source": "documents",
        "kind": "semantic",
        "status": "empty",
        "rowCount": 0,
        "selectedCount": 0,
        "scores": [],
      },
      {
        "source": "finance-cashflow",
        "kind": "structural",
        "status": "forbidden",
        "rowCount": null,
        "selectedCount": 0,
        "scores": [],
      },
      {
        "source": "project-notes",
        "kind": "semantic",
        "status": "degraded",
        "rowCount": null,
        "selectedCount": 0,
        "scores": [],
      },
    ],
  },
  "tenantId": "...",
  "userId": "...",
  "correlationId": "...",
}
```

#### 4.1 ⚠️ DORT DURUM — VE `empty` ILE `returned` AYRIMI BU ADR'NIN OMURGASIDIR

| `status`    | Anlami                                                 | `rowCount` |
| ----------- | ------------------------------------------------------ | ---------- |
| `returned`  | Katkici cagrildi ve **en az bir satir** dondurdu       | `>= 1`     |
| `empty`     | ⚠️ Katkici cagrildi ve **SIFIR satir** dondurdu        | `0`        |
| `forbidden` | ⚠️ Cagiran izni TASIMIYOR — katkici **HIC CAGRILMADI** | `null`     |
| `degraded`  | Katkici **COKTU** (`degradedSources`ta da gorunur)     | `null`     |

⚠️ **`empty` ile `returned` arasindaki fark, ADR-0042'nin CEVAPLAYAMADAN
KAPANDIGI sorunun ta kendisidir:**

> _"`project-status` ve `appointment-schedule` ELENDI Mi, yoksa BOS MU DONDU —
> BILINMIYOR. Ikisi de mumkun ve fark onemlidir."_

Ve T2'nin girdisi dogrudan budur: T2 _"satir donduren yapisal kaynak sayisi"_ni
sayar, **kayitli** olani degil. `status = "returned" && kind = "structural"`
satirlarini saymak, T2'yi **ilk kez olculebilir** kilar.

⚠️ **`rowCount` ICIN `null` VE `0` AYRI SEYLERDIR** — `ai.call`in `usage`
alanindaki ayni disiplin (_"`null`, 'sifir' DEGIL 'bilinmiyor' demektir; ikisini
karistirmak toplamlari sessizce yanlis yapardi"_). `forbidden`/`degraded` icin
katkici hic satir uretmedi, yani sayilacak bir sey **yok**; `empty` icin sayi
**gercekten sifir**.

#### 4.2 ⚠️ `forbidden` LOGA YAZILIR — API'DE GIZLI KALIR. BU CELISKI DEGIL

[ADR-0031](0031-crm-module.md) §5.3'un kurali nettir ve ADR-0034'un kapanis
denetiminde canli olarak dogrulandi: izin yuzunden elenen bir kaynak
`degradedSources`ta **GORUNMEZ**, cunku _"gorulemeyen bir kaynagin varligi
sizardi"_.

⚠️ **Bu kural CAGIRAN icindir, OPERATOR icin degil.** Ayrim bedelin sekline
dayanir:

- **API cevabinda** `forbidden` gostermek, `member` rolundeki bir kullaniciya
  _"gormedigin bir finans kaynagi VAR"_ demektir — bir yetki sizintisidir.
- **Log satirinda** ayni bilgi, sunucu operatorunun zaten sahip oldugu bilgidir
  (izin katalogu koddadir, roller veritabanindadir). ⚠️ Ustelik teshis degeri
  yuksektir: _"bu tenant'ta neden hic finans sesi yok"_ sorusunun cevabi
  cogu zaman tam olarak budur.

⚠️ Bu yuzden satir **kullaniciya hicbir kanaldan donmez** ve `AskResult` sekli
**degismez**.

#### 4.3 ⚠️ ICERIK TASINMAZ — VE `reference.id` DE ICERIKTIR

`ai.call` portunun kurali aynen devralinir:

> _"Burada soru metni, cevap metni, prompt ya da embed edilen icerik ARANMAZ ve
> EKLENMEMELIDIR. (...) Tasinan sey yalnizca SAYILARDIR."_

⚠️ **BU ADR O KURALI BIR ADIM GENISLETIYOR:** `ContextFragment.reference`
(`{ kind, id }`) **de yazilmaz**. Id bir metin degildir ama bir **isaretcidir**:
`feedback-response` id'lerini loglamak, log'a erisen birinin _"hangi musteriler
sikayet etti"_ listesini cikarabilmesi demektir. Bir teshis satirinin,
kullanici verisini **numaralandirmanin** yolu olmasi kabul edilemez.

⚠️ Yani satirda gecen tek serbest metin **KAYNAK ADIDIR** (`crm-pipeline`) ve
o, kodda yazili sabit bir etikettir — kullanici verisi degil.

#### 4.4 Skorlar YUVARLANIR

`scores` dizisindeki her deger **uc ondaliga** yuvarlanir. Gerekce boyut degil
**okunabilirliktir**: `0.9500000000000001` gibi bir kayan nokta artigi, esitlik
sorgusunu (`band ici beraberlik var mi`) gozle okunamaz hale getirir — ve bu
ADR'nin urettigi verinin **tek tuketicisi bir insandir**.

⚠️ Yuvarlama SIRALAMAYI DEGISTIRMEZ, cunku **secim zaten yapilmis** olur; bu
satir bir kayittir, bir girdi degil.

### 5. ⚠️ `selectFragments` SAF KALIR — RECORDER ONUN ICINE GIRMEZ

[ADR-0036](0036-context-retrieval-kota.md) `selectFragments`i bilerek **saf bir
fonksiyon** yapti (_"karar burada degil `select-fragments.ts`te yasar — girdi/
cikti olarak sinanabilir olmasi icin"_). Bir logger'i onun icine sokmak o
karari bozardi.

**Cozum:** `selectFragments` **daha zengin bir cikti** dondurur — hangi
adaylarin secildigi bilgisi de dahil — ve kayit isini **cagiran** (`#gather`)
yapar. Fonksiyon hala saftir: ayni girdi, ayni cikti, sifir yan etki.

⚠️ **ALTERNATIF REDDEDILDI:** `#gather`in secilen parcalari nesne kimligiyle
(`new Set(fragments)`) geri eslestirmesi. Bugun **calisirdi** — cunku
`selectFragments` ayni nesne referanslarini geciriyor — ama ileride icine tek
bir `.map()` eklendigi gun eslestirme **sessizce** bozulur ve her parca
`selected: false` gorunurdu. Kayit yesil kalir, veri yalan soyler.

### 6. Yerlesim ve sozlesme

| Parca                                               | Yer                                |
| --------------------------------------------------- | ---------------------------------- |
| `RetrievalSelectionRecorder` port'u + kayit tipleri | `platform/context/application/`    |
| Log implementasyonu                                 | `platform/context/infrastructure/` |

⚠️ **`shared/`A KONULMAZ** — `AiUsageRecorder`dan ayrildigi yer burasidir ve
gerekce yerlesim kuralinin kendisidir: o port `shared/`tedir cunku **on bir
modulun adapter'lari** onu cagirir. Bunun **TEK URETICISI** vardir
(`platform/context`). Bir kernel'e tek tuketicisi olan bir port koymak,
`shared/`i "ortak gorunen her sey" cop kutusuna cevirmenin ilk adimidir.

⚠️ **Port'un sozlesmesi `AiUsageRecorder`dan birebir devralinir** ve iki madde
**pazarlik disidir**:

- **`void` doner ve ASLA FIRLATMAZ.** Kayit tutmak, kaydedilen isin basarisini
  etkilemez: bir log satiri yazilamadi diye kullanicinin sorusu cevapsiz
  kalamaz.
- **`tenantId` / `userId` / `correlationId` CAGIRANDAN ISTENMEZ**, tenant
  context'ten (ALS) okunur — MT §11'in ayni gerekcesi.

---

## Gerekce

**Neden simdi.** Iki kapanis denetimi ust uste ayni duvara carpti ve
ucuncusu (11. modul) kesin olarak carpacak: her modul ADR'si ADR-0036/0042
esik kontrolunu **sabit madde** olarak tasiyor ve o kontrolun 2. ve 3.
sorulari **olculemedigi surece tahmine dayaniyor**. Bir sureç kurali, onu
besleyen veri yoksa bir ritueldir.

**Neden bu kadar kucuk.** Bu ADR bir pano, bir alarm, bir metrik toplayici ya
da bir rerank **onermiyor**. `ai.call`in kendi cumlesi burada da gecerli:
_"kapsam bilincli dar: satir yazar, karar vermez."_ Tek iddiasi sudur:
**her `/ask` cagrisi, secimin nasil olustugunu geriye donuk okunabilir kilan
bir satir birakir.**

**Neden log, neden tablo degil.** Uc gerekce §2'de; ozeti: veri **teshis**tir,
urun degil. Bir tabloya yazmak onu retention borcunun en hizli buyuyen kalemi
yapar, cevap yolunu bir transaction'la agirlastirir ve `ai.call`in kurdugu
deseni sebepsizce terk eder.

**Neden `forbidden` de kaydediliyor.** Cunku bir kaynagin **neden** sessiz
oldugu, sessiz oldugu gercegi kadar onemlidir. Uc farkli sessizlik (izin yok ·
coktu · soyleyecek seyi yoktu) bugun **birbirinden ayirt edilemiyor** ve
ADR-0042 tam olarak bu belirsizlikle kapandi.

---

## Sonuclari

**Olumlu**

- ⚠️ **ADR-0042 §4'un protokolu ILK KEZ UYGULANABILIR olur** ve T2 esigi
  (`2K/3`) ilk kez **olculebilir** hale gelir.
- ⚠️ **ADR-0045'in askidaki karari acilabilir**: `feedback-satisfaction`
  hakkinda veriyle konusulabilir. ⚠️ Bu ADR o karari **VERMEZ**; yalnizca
  verilebilir kilar.
- ADR-0042'nin cevaplayamadigi **iki soru** cevaplanabilir hale gelir:
  (a) bir kaynak elendi mi yoksa bos mu dondu, (b) band ici siralama liyakatli
  mi yoksa kararli-siralama mi.
- Hicbir modulun semasi degismez, hicbir migration yazilmaz, `AskResult` sekli
  **degismez** — yani istemci tarafinda **sifir** etki.
- ⚠️ Teshis degeri esik tartismasinin otesine gecer: _"bu tenant'ta neden hic
  finans sesi yok"_ sorusunun cevabi artik tek satirda gorunur.

**Olumsuz / bedeli**

- ⚠️ **HER `/ask` CAGRISI DAHA BUYUK BIR LOG SATIRI YAZAR.** Ust sinir
  hesaplanabilir: katkici sayisi (bugun 15) × katkici basina en fazla `K` (8)
  skor = **120 skor girdisi**, kabaca **3–4 KB**. Fan-out olcumlerinde toplam
  surenin ~%84'u `LLMPort.complete`te gectigi icin bu, gecikmede olculebilir
  bir fark yaratmaz — ama **log hacmi gercekten artar**.
- ⚠️ **KATKICI SAYISI ARTTIKCA SATIR BUYUR.** On iki modul tamamlandiginda
  fan-out daha da artar; satir onunla birlikte buyur. § Bu karar ne zaman
  yeniden gozden gecirilir'de tetikleyicisi yazili.
- `selectFragments`in imzasi **degisir** (daha zengin cikti). Saf kalir ve
  mevcut testleri kavramsal olarak ayni kalir, ama dosya **dokunulmus** olur —
  ADR-0036'nin cekirdegine dokunmak hafife alinacak bir sey degildir.
- ⚠️ **`platform/context`e ikinci bir port eklenir.** Modulun yuzeyi buyur;
  bugun tek tuketicisi kendisidir ve oyle kalmalidir.

---

## Degerlendirilen alternatifler

| Alternatif                                                        | Neden secilmedi                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚠️ **Ayri bir `platform.retrieval_selections` TABLOSU**           | §2 — retention listesine **yirmi dorduncu ve en hizli buyuyen** kalemi eklerdi (cagri × katkici), cevap yoluna transaction sokardi ve `ai.call`in kurdugu deseni sebepsizce terk ederdi.                                                                  |
| **Katkici basina AYRI log satiri**                                | §3 — her analiz `correlationId` uzerinden bir JOIN gerektirirdi ve es zamanli isteklerde yanlis join **sessiz bir yanlis** uretirdi. Sorulan soru cagri duzeyindedir.                                                                                     |
| **`AskResult`e (API cevabina) tani alani eklemek**                | ⚠️ ADR-0031 §5.3'u dogrudan ihlal ederdi: `forbidden` bilgisi cagirana **sizamaz**. Ayrica skor, ADR-0042'nin acikca reddettigi gibi, disari acilirsa bir **sozlesme** haline gelir.                                                                      |
| **Gecici enstrumantasyon (denetim gunu ekle, sonra kaldir)**      | ⚠️ **IKI KEZ DENENDI VE IKISINDE DE COKTU** (ADR-0043, ADR-0045). Ucuncu kez denemek, ayni sonucu bekleyerek ayni seyi yapmaktir.                                                                                                                         |
| **`selectFragments` icine logger sokmak**                         | §5 — ADR-0036'nin saf fonksiyon karariini bozardi ve fonksiyonun girdi/cikti olarak sinanabilirligini kaybettirirdi.                                                                                                                                      |
| **Nesne kimligiyle (`Set`) secilenleri geri eslestirmek**         | §5 — bugun calisir, ama `selectFragments` icine bir `.map()` eklendigi gun **sessizce** bozulur: her parca `selected: false` gorunur, test yesil kalir, veri yalan soyler.                                                                                |
| **Ornekleme (her N. istegi kaydet) ya da env bayragiyla kapatma** | ⚠️ Bugun **erken**: `ai.call` her cagriyi kaydediyor ve bir sorun cikmadi. ⚠️ Ustelik kapatilabilir bir teshis araci, tam ihtiyac duyuldugu gun **kapali** bulunur. Boyut gercek bir sorun olursa cozum § Bu karar ne zaman...'da tetikleyiciye baglandi. |
| **Skorlari degil yalnizca min/max kaydetmek**                     | ⚠️ ADR-0042 §4'un **3. maddesini karsilamazdi**: band ici beraberligin liyakatle mi kararli-siralamayla mi cozuldugu ancak **her parcanin** skoru gorulunce anlasilir. Sorunun kendisi zaten esitliklerdir.                                               |
| **`reference.id`leri de kaydetmek**                               | §4.3 — id bir **isaretcidir** ve loglamak, log'a erisen birinin _"hangi musteriler sikayet etti"_ listesini cikarabilmesi demektir. `ai.call`in "icerik tasinmaz" kurali id'leri de kapsar.                                                               |

---

## Bilinen sinirlar

- ⚠️ **LOG SATIRLARININ SAKLAMA SURESI KARARA BAGLANMAMISTIR.** Bu ADR
  ROADMAP §8.5'e bir kalem eklemez (o liste **tablolari** sayar) ama log
  altyapisinin retention'i da bugun **yoktur**. Yani satirlar yazilir; ne kadar
  yasayacaklari **acik bir sorudur** ve gozlemlenebilirlik stack'i secilirken
  (ROADMAP'in acik kalemi) cevaplanmalidir.
- ⚠️ **BU ADR HICBIR KARARI VERMEZ.** Ne tabani degistirir, ne rerank acar, ne
  `feedback-satisfaction`i onaylar, ne T2'nin esigini tartisir. Yalnizca
  **olcen aleti** kurar. ⚠️ Aletin varligi, olculen seyin degismesi gerektigi
  anlamina **gelmez**.
- ⚠️ **TEK BIR CAGRIYI ANLATIR, TOPLAM DEGIL.** Bir denetim hala uc soruyu
  elle sorup uc satiri elle karsilastirmak zorundadir; bir toplama araci,
  sorgu kutuphanesi ya da pano **YOKTUR** ve bu ADR'nin kapsaminda degildir.
- ⚠️ **SKORLAR HALA KALIBRE DEGIL** (ADR-0031'den beri bilinen sinir, onuncu
  kez). Bu satir kalibrasyonsuzlugu **gorunur** kilar, **gidermez** — anlamsal
  bir 0,92 ile yapisal bir 0,90 hala ayni olcekte degildir ve satiri okuyan
  kisi bunu bilmek zorundadir.
- ⚠️ **OLCUM YINE DE ORTAM BAGIMLIDIR.** ADR-0042'nin kendi siniri gecerli:
  dagilim tek bir tenant'ta ve o tenant'in verisiyle olculur.
  ⚠️ ADR-0045'in denetimi bunu somut olarak yasadi — tenant'ta yalnizca geri
  bildirim verisi vardi ve dagilim tek kaynaktan ibaret cikti. **Bu ADR o
  sorunu COZMEZ**; yalnizca veri varken olcumun yapilabilmesini saglar.
  ⚠️ Anlamli bir dagilim olcumu icin **on bir modulun hepsinde veri olan** bir
  denetim tenant'i gerekir ve boyle bir tohumlama araci da yoktur.
- ⚠️ **`empty` ILE "IZIN VAR AMA VERI YOK" AYNI GORUNUR.** Bos bir tenant'ta
  her kaynak `empty` doner; bu, katkicinin bozuk oldugunu **gostermez**. Satiri
  okuyan kisi tenant'in veri durumunu bilmek zorundadir.
- **Yeni bir env degiskeni, yeni bir bagimlilik ve yeni bir migration YOKTUR.**

---

## Uygulama plani (tek slice)

⚠️ **PO ONAYINDAN SONRA.** Bu bir platform isidir ve hicbir is modulunun
semasina dokunmaz.

| Adim | Ne                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `RetrievalSelectionRecorder` port'u + kayit tipleri (`platform/context/application/`)                                                      |
| 2    | `selectFragments` daha zengin cikti dondurur — ⚠️ **SAF KALIR** (§5)                                                                       |
| 3    | `#gather` dort durumu (`returned` / `empty` / `forbidden` / `degraded`) ayirt eder ve recorder'i cagirir                                   |
| 4    | Log implementasyonu (`platform/context/infrastructure/`) — `ai.call` deseni: sabit olay adi, ALS'ten tenant/user/correlation, hata YUTULUR |
| 5    | Testler: dort durumun dordu de · ⚠️ **icerik ve `reference.id` SIZMIYOR** · recorder coktugunde `/ask` **calismaya devam ediyor**          |

⚠️ **KABUL OLCUTU:** ADR-0045'in kapanis denetiminde uygulanamayan olcum, bu
slice'tan sonra **tek bir `grep` ile** yapilabilmelidir.

---

## Bu karar ne zaman yeniden gozden gecirilir?

- ⚠️ **Satir boyutu gercek bir sorun olursa** (log maliyeti ya da hacim
  uyarisi): ilk cozum **ornekleme** degil, `scores` dizisini yalnizca
  `structural` kaynaklar icin tam, `semantic` kaynaklar icin ozet (min/max)
  tutmaktir — cunku T2 ve band ici siralama sorusu **yapisal tarafla** ilgili.
  ⚠️ Ornekleme en son caredir: teshis araci, tam ihtiyac duyuldugu gun kapali
  bulunmamalidir.
- ⚠️ **Gozlemlenebilirlik stack'i secildiginde** (ROADMAP'in acik kalemi): log
  satirlarinin saklama suresi ve sorgulanabilirligi orada karara baglanir; bu
  ADR o karari **bekler**, engellemez.
- ⚠️ **ADR-0036/0042 yeniden acildiginda:** bu satirin **urettigi veri** o
  tartismanin girdisidir. O gun satirin **yeterli** olup olmadigi da sorulur —
  eksik cikarsa sekli genisletilir, felsefesi degil.
- **Rerank acildiginda** (ADR-0036'nin kendi tetikleyicisi): secim algoritmasi
  degisir, yani bu satirin alanlari da degisir. ⚠️ Olay adi (`retrieval.select`)
  **DEGISMEZ** — degisirse gecmis ile yeni kayitlar ayni sorguya dusmez.
- ⚠️ **Bir baska yuzey ayni veriye ihtiyac duyarsa** (ornegin bir "neden bu
  cevap" ekrani): o gun soru _"log yetiyor mu"_ olur ve tablo secenegi
  (§2'de reddedilen) **yeniden okunmalidir** — cunku o gun veri teshis olmaktan
  cikip **urun** olur ve §2'nin ucuncu gerekcesi duser.
