# 0049 — Ayni banddaki yapisal esitligin LIYAKATLE kirilmasi

- **Durum:** ⚠️ **KABUL EDILDI ve UYGULANDI** (2026-08-26)
- **Tarih:** 2026-08-26
- **Karar veren:** Product Owner
- **Faz:** 5 (platform karari — bir modul ADR'si DEGIL)

## Baglam

[ADR-0048](0048-denetim-tenant-tohumlama.md)'in olcumu
[ADR-0042](0042-retrieval-taban-revizyonu.md)'nin **T1** tetikleyicisini
atesledi:

> **T1:** _"Bir yapisal kaynak **ALARM bandinda (0.95)** uc farkli soruda da
> giremiyorsa."_ — ADR-0042 §3

| Kaynak                 | En iyi skor | Uc soruda da yuva |
| ---------------------- | :---------: | :---------------: |
| `appointment-schedule` |  **0.95**   |     ⚠️ **0**      |
| `project-status`       |  **0.95**   |     ⚠️ **0**      |
| `finance-cashflow`     |  **0.95**   |     ⚠️ **0**      |

ADR-0048 §8.4 kok nedeni de buldu ve **mekanik olarak** kanitladi:

1. Alti yapisal kaynagin **altisinin da** en iyi skoru **tam olarak 0.95** —
   tepede **alti yonlu bir beraberlik** var.
2. `selectFragments` beraberligi `[...candidates].sort()` ile bozar ve o sort
   ES2019'dan beri **KARARLIDIR** — esit skorlu adaylar **girdi sirasini**
   korur.
3. Girdi sirasi `#gather`in `allowed.flatMap(...)`indan gelir; `allowed`
   `registry.all()`tan, o da `InMemoryContributorRegistry`nin `Map`inden —
   yani ⚠️ **`app.module.ts`teki MODUL IMPORT SIRASINDAN**.
4. Kazanan uclu (`crm-pipeline`, `inventory-stock`, `invoicing-pipeline`)
   kayit sirasindaki **ilk uc** yapisal kaynaktir; kaybeden uclu **son uctur**.

> ⚠️ **Bugunku davranis tek cumleyle:** alarm bandinda esitlik oldugunda bir
> yapisal kaynagin havuza girip girmemesini belirleyen sey, tasidigi haberin
> aciliyeti degil ⚠️ **`app.module.ts`te kacinci sirada import edildigidir.**

### ⚠️ ADR-0042'NIN IKILEMI EKSIKTI — ve bu ADR'nin ilk katkisi budur

ADR-0042 T1 icin sunu yazmisti:

> _"Gerceklestigi gun **taban buyuklugu ya da skor merdiveni YANLISTIR** ve
> ikisinden biri degismek zorundadir."_

⚠️ **Olcum ucuncu bir ihtimali gosterdi ve ikisi de yanlis DEGIL:**

| Aday kusur           | Olcum ne diyor                                                                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Taban buyuklugu**  | ⚠️ **DOGRU CALISTI.** Taban `ceil(8/3) = 3` soz verdi ve **tam 3 ayri yapisal kaynak** yuva aldi. Vaadini eksiksiz yerine getirdi.                                                                             |
| **Skor merdiveni**   | ⚠️ **DOGRU OLCTU.** Alti kaynagin altisi da **gercekten alarm durumundaydi** (gecikmis takip · negatif nakit · gecikmis gorev · %33 gelmedi · esik alti stok · faturalanmamis kabul). 0.95 **dogru** etiketti. |
| ⚠️ **ESITLIK KIRMA** | ⚠️ **KUSUR BURADA.** Taban DOGRU SAYIDA kaynak secti ama **HANGILERINI** sectigini kayit sirasina birakti.                                                                                                     |

> ⚠️ **Yani duzeltilecek sey ne tabanin BUYUKLUGU ne skorun OLCEGIDIR;
> tabanin SECIM OLCUTUDUR.** ADR-0042'nin ikilemi eksik kuruldu, cunku o gun
> beraberligin bu kadar genis olabilecegini gosteren veri **yoktu**.

---

## Karar

### 1. ⚠️ BANDLAR AYNEN KALIR — USTUNE IKI ANAHTARLI BIR ESITLIK KIRICI EKLENIR

`selectFragments`in siralamasi **tek anahtarli** (`score`) olmaktan cikar,
**uc anahtarli** olur:

| #   | Anahtar       | Yon  | Ne olcer                                            | Liyakat mi            |
| --- | ------------- | ---- | --------------------------------------------------- | --------------------- |
| 1   | `score`       | DESC | Kaynagin kendi beyan ettigi aciliyet bandi          | ✅ (bugunku)          |
| 2   | ⚠️ `affinity` | DESC | ⚠️ **Parcanin SORUYA yakinligi**                    | ✅ **EVET**           |
| 3   | ⚠️ `lot`      | ASC  | `hash(soru + kaynak)` — kararli, soruya bagli kur'a | ⚠️ **HAYIR — ADALET** |

⚠️ **Kayit sirasi artik HICBIR yerde belirleyici degildir.** Uc anahtar da
esit olsaydi `lot` zaten esit olamaz (kaynak adi girdisinin parcasi) — yani
`Array.prototype.sort`un kararliligina **hic dusulmez**.

⚠️ **Bandin ustunlugu KORUNUR:** `affinity` bir bandi **asla** ezmez. 0.75'lik
saglikli bir satir, kelimeleri soruya daha cok benziyor diye 0.95'lik bir
alarmi **geceMEZ**. Esitlik kirici yalnizca **ayni skordaki** adaylar
arasinda calisir.

### 2. ⚠️ `affinity` — CAPRAZ KAYNAK KARSILASTIRMASINDA MESRU OLAN TEK SINYAL SORUDUR

Bu, ADR'nin merkezi savidir.

Alti kaynak **neye gore** karsilastirilacak? Aday buyuklukler
incommensurable — ve bu, projede **on kez** kaydedilmis bir sinirdir
(_"skorlar kaynaklar arasi kalibre degil"_, ADR-0031'den beri):

> _9 gun gecikmis bir takip_, _%33 gelmedi orani_, _-67.500 TRY net nakit_,
> _esigin %85 altinda bir stok kalemi_ ve _12 gun gecikmis bir gorev_.
> ⚠️ **Bu bes buyuklugun ORTAK BIRIMI YOKTUR.**

⚠️ **Ama alti kaynagin ORTAK BIR SEYI vardir: hepsi AYNI SORUYU cevaplamak
icin yarisiyor.** Retrieval'in tanimi zaten budur. Soruya yakinlik, alti
kaynagin uzerinde **gercekten kiyaslanabildigi tek eksendir**.

#### 2.1 Mekanizma — `questionAffinity(question, content) → [0, 1]`

Saf, deterministik, bagimliliksiz bir fonksiyon (`platform/context/application/`):

1. **Normalize:** NFD → birlestirici isaretleri (diacritic) at → kucuk harf →
   alfanumerik olmayanlardan bol. ⚠️ Iki taraf da ayni normalizasyondan gecer:
   sorudaki `"akışı"` ile icerikteki `"akisi"` aksi halde **eslesmezdi**.
2. **Ele:** uzunlugu 3'ten kisa token'lar + kucuk bir **soru-kelimesi** listesi
   (`neler`, `nasil`, `nedir`, `hangi`, `var`, `yok`, `bir`, `icin`, `ile`,
   `daha`, `cok`, `gibi`, `olan`, `oluyor`, `kadar`, `ozetle`, `anlat`, ...).
   ⚠️ **Alan kelimeleri listeye GIRMEZ** — `stok`, `nakit`, `randevu` elenirse
   fonksiyon isini yapamaz.
3. **Esle:** Turkce **eklemeli** bir dildir, govdeleme yok. Iki token eslesir
   ancak ve ancak: esitlerse, **ya da** kisa olan uzunun **tam onekiyse ve
   uzunlugu ≥ 4** ise. (`stok` ↔ `stoktaki` ✅ · `nakit` ↔ `nakitte` ✅ ·
   `bir` ↔ `birim` ❌ — 4'ten kisa.)
4. **Puan:** `eslesen soru token'i / toplam soru token'i`.
   ⚠️ **SORUNUN kapsanmasi olculur, icerigin degil** — aksi halde uzun bir
   parca yalnizca **daha cok kelime tasidigi** icin kazanirdi.

#### 2.2 ⚠️ KABALIGI KABUL EDILIYOR — CUNKU ROLU ONU SINIRLIYOR

`questionAffinity` bir arama motoru **degildir**: govdeleme yok, IDF yok,
es anlamli yok, `stok` ↔ `stokholm` gibi yanlis eslesmeler **mumkundur**.

⚠️ Bu kabul edilebilir, cunku fonksiyonun **yetkisi bir bandin icidir**:

- Bir bandi **ezemez** (§1) — en kotu hali, ayni derecede acil iki alarmdan
  "yanlis" olanini secmektir.
- Sifir donerse **hicbir sey bozmaz** — karar `lot`a duser (§3).
- ⚠️ **Bir SKOR degildir, disari acilmaz**; `AskResult` sekli **degismez**
  (ADR-0042'nin skoru sozlesmeye cevirme reddi korunur).

⚠️ **Bu, ADR-0011'in klasik metin aramasi (FTS) borcunu KAPATMAZ ve oyle
okunmamalidir.** Burada yapilan sey bir arama degil, **iki esit adaydan
birini secmektir**.

### 3. ⚠️ `lot` — DURUSTCE: BU LIYAKAT DEGIL, ADALETTIR

Genel bir soruda (_"Sirkette neler oluyor?"_) hicbir yapisal parcanin soruyla
ortak kelimesi olmayabilir; o zaman `affinity` alti kaynak icin de **0**dir ve
esitlik **devam eder**.

Bu durumda karar `lot = FNV1a(soru + AYIRAC + kaynak)` degerinin **artan**
sirasina birakilir.

⚠️ **Bunun liyakat OLMADIGI acikca yaziliyor.** Ne oldugunu ve ne olmadigini
ayirmak, bu ADR'nin en onemli durustluk maddesidir:

| Ozellik                                         | `lot`                                                   |
| ----------------------------------------------- | ------------------------------------------------------- |
| Deterministik mi                                | ⚠️ **EVET** — ayni soru her zaman ayni cevabi verir     |
| Soruya gore degisir mi                          | ⚠️ **EVET** — farkli sorularda farkli kaynaklar kazanir |
| Durum (state) tutar mi                          | ⚠️ **HAYIR** — `selectFragments` **SAF kalir**          |
| Kaynagin ne kadar acil oldugunu dikkate alir mi | ⚠️ **HAYIR — ve iddia da etmiyor**                      |

⚠️ **Determinizm bir suslemenin degil, bir zorunlulugun sonucudur:** ayni
sorunun farkli zamanlarda farkli cevap vermesi, hem kullanici icin (_"az once
baska soylemistin"_) hem denetim icin (**tekrar uretilemeyen olcum**) kabul
edilemezdi. ADR-0048'in butun degeri olcumun tekrar uretilebilir olmasindaydi.

### 4. ⚠️ SKOR MERDIVENINE DOKUNULMUYOR — ve bu bilincli bir RET

Is emrinin sundugu birinci yon (_"skor merdivenini daha ince granulde kurmak —
gercek gecikme suresi/esik alti miktar gibi buyuklugu skora katmak"_)
**degerlendirildi ve reddedildi**. Uc gerekce, agirdan hafife:

1. ⚠️ **SORUNU COZMEZ, ERTELER.** Daha ince sabitler de sonunda esitlesir
   (iki kaynak da 12 gun gecikmisse). Esitlik kirici olmadan **fallback yine
   kayit sirasidir** — yani bugunku kusur **daha nadir ama ayni sekilde**
   geri gelir. ⚠️ Ve nadir oldugu icin **fark edilmesi daha da zor** olur.
2. ⚠️ **CAPRAZ KAYNAK KALIBRASYONU YOK** (§2). "9 gun gecikme"yi 0.96'ya,
   "%33 gelmedi"yi 0.94'e cevirmek **keyfi bir esleme**dir. ⚠️ Keyfi bir
   eslemeyi liyakat diye sunmak, durust bir kur'adan **DAHA KOTUDUR** —
   cunku ilkeli **gorunur** ve sorgulanmaz.
3. **ALTI MODULE dokunurdu** (Mutlak Kural 1). Bu bir platform kusurudur ve
   cozumu platformda olmalidir.

⚠️ **Buyukluk YINE DE degerlidir — ama KAYNAGIN ICINDE.** Bir kaynagin kendi
parcalarini siralamasi zaten kendi isidir ve bu ADR ona **dokunmaz**. Reddedilen
sey buyuklugun **kaynaklar arasi** bir olcu olarak kullanilmasidir.

### 5. ⚠️ ADR-0046'NIN LOG SATIRI GENISLETILIR — YOKSA YALAN SOYLER

Bugun `retrieval.select` her aday icin `{ score, selected }` yaziyor. Bu ADR
sonrasi ayni banddaki iki aday **farkli sonuc** alacak ve satir **nedenini
gosteremeyecek**:

```jsonc
{ "score": 0.95, "selected": true }
{ "score": 0.95, "selected": false }   // ⚠️ NEDEN? Satir cevap veremiyor.
```

⚠️ **Bu opsiyonel bir iyilestirme degil, bir ZORUNLULUKTUR:** kaydettigi karari
aciklayamayan bir teshis satiri, olmamasindan **daha kotudur** — cunku
bakan kisi "rastgele" diye okur ve mekanizmayi arar.

`RetrievalScoreEntry` iki alan kazanir:

```jsonc
{ "score": 0.95, "affinity": 0.5, "lot": 1809774113, "selected": true }
{ "score": 0.95, "affinity": 0, "lot": 3221225472, "selected": false }
```

⚠️ ADR-0046'nin **icerik tasinmaz** kurali korunur: `affinity` bir **sayidir**,
soru metni ya da parca metni **yazilmaz**; `lot` da bir hash'tir.
⚠️ `affinity` uc ondaliga yuvarlanir (ADR-0046 §4.4'un ayni gerekcesi).

### 6. `selectFragments` SAF KALIR — imzasi genisler

`SelectFragmentsInput` `question: string` alani kazanir. Fonksiyon **saf
kalir**: ayni girdi → ayni cikti, sifir yan etki, sifir I/O.

⚠️ ADR-0046 bu imzayi zaten bir kez genisletmisti (daha zengin cikti) ve
gerekce aynidir: ⚠️ **karar `select-fragments.ts`te yasar** (ADR-0036) ve
karara giren her sey **imzada gorunmelidir**. Soruyu bir modul-disi degiskenden
ya da bir baglamdan okumak, saf fonksiyonun sinanabilirligini yok ederdi.

### 7. Kapsam disi — bu ADR'nin YAPMADIKLARI

| Kalem                               | Durum                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Taban buyuklugu** (`ceil(K/3)`)   | ⚠️ **DEGISMEZ** — §Baglam: taban vaadini yerine getirdi                                               |
| **Skor merdiveni** (0.95/0.90/0.75) | ⚠️ **DEGISMEZ** — §4                                                                                  |
| **Rerank**                          | ⚠️ **ACILMAZ** — ADR-0036'nin kendi tetikleyicisi hala kapali                                         |
| **T2 esigi**                        | ⚠️ **DEGISMEZ** — hala 6'da, hala atesleMEDI (ADR-0048 §8.2)                                          |
| **Askidaki iki katkici**            | ⚠️ **ONAYLANMAZ** — `feedback-satisfaction` ve `campaign-gap` ayri bir kararin konusu                 |
| **FTS / klasik arama**              | ⚠️ **ACILMAZ** — ADR-0011 onbirinci kez acik; `affinity` bir arama degil bir esitlik kiricidir (§2.2) |
| **`AskResult` sekli**               | ⚠️ **DEGISMEZ** — `affinity` ve `lot` **yalnizca loga** gider                                         |

---

## ⚠️ KANIT — "artik kayit sirasina bagli degil" IDDIASI TESTLE KILITLENIR

Bu ADR'nin iddiasi bir yorum degil, **kirmizi yanabilen** bir testtir. Uc test
yazilir ve ⚠️ **birincisi bugunku kodda BASARISIZ olur** (kusurun tam tersi
kaniti):

| #   | Test                                                                                                                                                                   | Seviye |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | ⚠️ **Aday dizisi TERSINE cevrildiginde secilen kaynak KUMESI DEGISMEZ.** Alti yapisal kaynak, hepsi 0.95. Bugun bu test **duser** (ilk uc → son uc).                   | birim  |
| 2   | ⚠️ **Registry sirasi TERSINE kaydedildiginde `/ask` ayni kaynaklari secer.** `InMemoryContributorRegistry`ye ters sirada kayit → ayni secim. Zincirin tamamini baglar. | birim  |
| 3   | **Band ustunlugu korunur:** `affinity = 1` olan 0.75'lik bir aday, `affinity = 0` olan 0.95'lik adayi **gecemez**.                                                     | birim  |

Ek testler: `questionAffinity`in normalizasyonu (`akışı` ↔ `akisi`), onek
kurali (`stok` ↔ `stoktaki`; `bir` ↔ `birim` **degil**), sorunun kapsanmasi
(uzun parca avantaji **yok**), `lot`un deterministikligi ve
`RetrievalScoreEntry`nin yeni alanlarinin **loga gercekten** yazildigi.

### ⚠️ DOGRULAMA — ADR-0048'in olcumu TEKRARLANIR

`pnpm seed:audit-tenant -- --with-embeddings` → ayni uc soru + hedefli bir
dorduncu soru → ayni `grep retrieval.select`.

**Beklenen sonuc:** `appointment-schedule` / `project-status` /
`finance-cashflow` **en azindan bazi sorularda** yuva alir; ⚠️ **hep ayni uclu
kazanmaz**.

⚠️ **Ozellikle hedefli bir soru** (_"Nakit akisi ve stok durumu nasil?"_)
`affinity` uzerinden `finance-cashflow`u iceri almalidir — parcanin metni
_"Nakit akisi TRY ..."_ ile basliyor. ⚠️ Bu olmazsa mekanizma **calismiyor**
demektir ve ADR geri alinir.

---

## Gerekce

**Neden bandlar korunuyor.** Olcum bandlarin **dogru** oldugunu gosterdi: alti
kaynak da gercekten alarm durumundaydi. Bir olcegi, olctugu sey dogruyken
degistirmek, gercek kusuru **gizlemek** olurdu.

**Neden soru, tek mesru capraz sinyal.** Kaynaklarin buyuklukleri
kiyaslanamaz (§2) — ama hepsi **ayni soruyu** cevaplamak icin yarisiyor.
⚠️ Retrieval'in tanimi budur; sasirtici olan, yapisal kaynaklarin bugune kadar
soruyu **hic dikkate almamasidir**.

**Neden bir de kur'a var, ve neden durustce boyle adlandiriliyor.** Genel bir
soruda `affinity` herkese 0 verir ve esitlik surer. O anda uc secenek vardi:
kayit sirasi (bugunku kusur), alfabetik (⚠️ **ayni kusur, farkli sabit sira** —
yine hep ayni ucu kazanir) ve **soruya bagli kur'a**. Ucuncusu ne liyakattir ne
liyakat iddia eder; yaptigi tek sey **sistematik acligi kirmaktir**.

**Neden `selectFragments` saf kaliyor.** ADR-0036 bu fonksiyonu bilerek saf
yapti, ADR-0046 gozlemlenebilirlik eklerken o karari **bozmadi**. Durum tutan
bir rotasyon (is emrinin ucuncu yonu) tam olarak burayi kirardi — ve bedeli
yalnizca mimari degil **olculebilirlik** olurdu: durumlu bir secim, ADR-0048'in
tekrar uretilebilir olcumunu **imkansiz** kilardi.

---

## Sonuclari

**Olumlu**

- ⚠️ **T1 kapanir:** alarm bandindaki bir kaynak, kayit sirasi yuzunden
  sistematik olarak **ac kalmaz**.
- ⚠️ **`app.module.ts`teki import sirasi bir DAVRANIS parametresi olmaktan
  cikar.** Bugun bir modulu listede yukari tasimak `/ask` cevabini
  **sessizce** degistiriyordu; bir test artik bunu kilitler.
- ⚠️ **Yapisal kaynaklar ILK KEZ soruyu dikkate alir** — kucuk ama gercek bir
  alaka kazanci: _"nakit akisi nasil?"_ sorusuna nakit akisi ozeti girer.
- Taban, skor merdiveni, T2, rerank ve `AskResult` **degismez** — degisim
  yuzeyi **tek dosyada** yogunlasir.
- ADR-0046'nin satiri **kendi kaydettigi karari aciklayabilir** hale gelir.

**Olumsuz / bedeli**

- ⚠️ **`selectFragments` daha karmasik.** ADR-0036'nin cekirdegine ikinci kez
  dokunuluyor (ilki ADR-0046) ve bu hafife alinacak bir sey degildir.
- ⚠️ **`questionAffinity` KABA** (§2.2) — govdeleme, IDF ve es anlamli yok;
  yanlis eslesmeler mumkundur.
- ⚠️ **`lot` LIYAKAT DEGIL.** Genel sorularda hangi ucunun kazandigi
  **anlamsizdir** — yalnizca **adildir**. ⚠️ Bir kullanici arka arkaya iki
  farkli genel soru sorup farkli yapisal seslerin gelmesini **tutarsizlik**
  sanabilir.
- ⚠️ **`affinity` Turkce'ye ayarlidir** (onek kurali, soru-kelimesi listesi).
  Ingilizce bir tenant'ta daha zayif calisir; ⚠️ cok dillilik **acik bir
  borctur** ve bu ADR onu kapatmaz.
- ⚠️ **Log satiri BUYUR** — aday basina iki sayi daha (ADR-0046'nin kendi
  "satir buyur" uyarisinin ikinci tekrari).
- ⚠️ **Olcum karsilastirilabilirligi KIRILIR:** ADR-0048'in dagilim tablosu bu
  degisiklikten **once** alinmistir; sonraki olcumler onunla bire bir
  karsilastirilamaz ve bu **kayda gecmelidir**.

---

## Degerlendirilen alternatifler

| Alternatif                                                          | Neden secilmedi                                                                                                                                                                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚠️ **Skor merdivenini inceltmek** (buyuklugu skora katmak)          | §4 — ⚠️ sorunu **ertelerdi** (ince sabitler de esitlesir, fallback yine kayit sirasi) · capraz kalibrasyon **yok**, keyfi esleme liyakat diye sunulurdu · **alti module** dokunurdu.                                                        |
| **Tabani buyutmek** (`ceil(K/2)` = 4)                               | ⚠️ Kusuru **cozmez, saklar**: alti kaynaktan dordu girer, ikisi yine **kayit sirasiyla** elenir. Ustelik havuzun yarisini rezerve etmek ADR-0036 §3'un acikca reddettigi seydir.                                                            |
| **Yapisal kaynaklara SIRAYLA yuva vermek (durumlu rotasyon)**       | ⚠️ `selectFragments`in **safligini** kirardi (ADR-0036), tenant basina durum (tablo/cache) gerektirirdi — ADR-0046'nin tablo reddiyle ayni gerekce — ve ⚠️ **ayni soru farkli zamanlarda farkli cevap verirdi**: olcum tekrar uretilemezdi. |
| **Alfabetik esitlik kirma**                                         | ⚠️ Deterministik ama **SABIT**: yine **hep ayni ucu** kazandirir. Bir keyfi sabit sirayi baska bir keyfi sabit sirayla degistirmek, kusuru **adini degistirerek** korumaktir.                                                               |
| **Rastgele (`Math.random`) esitlik kirma**                          | ⚠️ Determinizmi yok ederdi: ayni soru farkli cevap verir, ⚠️ ADR-0048'in olcumu **tekrar uretilemez** olurdu ve bir hata ayiklama oturumu imkansizlasirdi.                                                                                  |
| **Yapisal parcalari da EMBED edip kosinus benzerligiyle siralamak** | ⚠️ Her `/ask` cagrisinda **katkici basina** bir embedding cagrisi demekti (bugun 6 yapisal kaynak). Maliyet ve gecikme, bir **esitlik kirici** icin fahis; ADR-0034 §6.1'in havuz kirlenmesi endisesinin maliyet tarafi.                    |
| **`ContextFragment`e `severity`/`occurredAt` alani eklemek**        | ⚠️ Kilik degistirmis §4: alani **katkicilar doldurur**, yani yine alti module dokunur ve yine **capraz kalibrasyon** sorunuyla karsilasilir. Ustelik port sozlesmesi genisler.                                                              |
| **Kayit sirasini `app.module.ts`te "dogru" siraya getirmek**        | ⚠️ Bir davranis garantisini **import sirasina** emanet etmek olurdu: hicbir test korumaz, hicbir lint yakalar, ve bir refactor onu **sessizce** bozar. Kusurun kendisi zaten budur.                                                         |
| **`affinity`yi ANA skor yapmak (bandlari kaldirmak)**               | ⚠️ Bir alarm, soruda gecmiyor diye **susardi** — tabanin var olma sebebi tam olarak bunun tersidir (ADR-0036). `affinity` bir bandi **asla ezmez** (§1).                                                                                    |
| **`affinity`yi `AskResult`e acmak**                                 | ⚠️ ADR-0042'nin skoru **sozlesmeye cevirme** reddi; ayrica ADR-0031 §5.3 acisindan gereksiz bir ic detay sizintisi. Yalnizca **loga** gider (§5).                                                                                           |
| **Hicbir sey yapmamak, T1'i "kabul edilmis sinir" ilan etmek**      | ⚠️ ADR-0042 T1'i **acikca** bir tetikleyici olarak yazdi ve _"ikisinden biri degismek zorundadir"_ dedi. Atesledigi gun gorezden gelmek, tetikleyiciyi **bastan anlamsiz** kilardi.                                                         |

---

## Bilinen sinirlar

- ⚠️ **`lot` LIYAKAT DEGILDIR** (§3) — genel sorularda secim **adildir ama
  anlamli degildir**. Bu ADR'nin en durust kabulu budur.
- ⚠️ **`questionAffinity` KABADIR** (§2.2): govdeleme yok, IDF yok, es anlamli
  yok. `stok` ↔ `stokholm` gibi yanlis eslesmeler mumkundur.
- ⚠️ **TURKCE'YE AYARLI** — onek kurali ve soru-kelimesi listesi Turkce icin
  yazildi. Cok dilli bir tenant'ta zayiflar; **acik borc**.
- ⚠️ **ANLAMSAL TARAFTA PRATIK ETKISI YOK** — kosinus skorlari kayan noktali
  ve tam esitlik neredeyse hic olmaz. Mekanizma **tekdüze** uygulanir (tur
  ayrimi yok) ama gercekte yalnizca **yapisal** tarafta isirir.
- ⚠️ **BIR KAYNAGIN KENDI PARCALARI ARASINDAKI esitlik de ayni kuralla
  kirilir** — orada `lot` kaynak adini sabit tuttugu icin **etkisizdir** ve
  siralama `affinity`ye, o da esitse **girdi sirasina** duser. ⚠️ Yani
  **kaynak ICI** kararlilik korunur; bu bilinclidir (bir kaynagin kendi
  siralamasi kendi isidir, §4).
- ⚠️ **ADR-0048'IN OLCUMUYLE BIRE BIR KARSILASTIRILAMAZ** — dagilim tablosu bu
  degisiklikten oncedir.
- ⚠️ **T1'in KOKU KAPANDI, T1'in KENDISI DEGIL:** bir kaynak hala uc soruda da
  giremeyebilir (ornegin gercekten alakasizsa). Tetikleyici **kaldirilmiyor**;
  bir daha ateslerse sebep **baska** olacaktir.
- **Yeni bir env degiskeni, yeni bir bagimlilik ve yeni bir migration YOKTUR.**

---

## Uygulama plani (tek slice) — ⚠️ PO ONAYINDAN SONRA

| Adim | Ne                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------- |
| 1    | `question-affinity.ts` — saf `questionAffinity` + `fnv1a` (`platform/context/application/`)                               |
| 2    | `selectFragments`: `question` girdisi + uc anahtarli siralama; ⚠️ **SAF KALIR**                                           |
| 3    | `RetrievalScoreEntry`e `affinity` + `lot`; `#recordSelection` ve log implementasyonu                                      |
| 4    | `#gather` soruyu `selectFragments`e gecirir                                                                               |
| 5    | Testler — ⚠️ **ozellikle 1. ve 2.si**: ters aday sirasi · ters registry sirasi · band ustunlugu · affinity birim testleri |
| 6    | ⚠️ **Dogrulama:** `seed:audit-tenant` + dort soru + `grep retrieval.select` (§Kanit)                                      |

⚠️ **Migration YOK, sema degisikligi YOK, prod davranisi yalnizca `/ask`in
SECIMINDE degisir.**

---

## ✅ Uygulandi — 2026-08-26

Migration YOK, sema degisikligi YOK, `AskResult` sekli DEGISMEDI.
`pnpm verify` cikis kodu **0** (api **2190** birim · web **571** birim).

### ⚠️ KANIT — uc test, ve KUSURLU KODDA KIRMIZI YANDIKLARI dogrulandi

Iddia yorumla degil, **kirmizi yanabilen** bir testle kilitlendi. Siralama
gecici olarak eski tek-anahtarli haline (`score`, sonra `return 0`) cevrildi
ve ⚠️ **dort test dustu**; implementasyon geri yuklendiginde **13/13** gecti.

| Test                                                                   | Eski kod | Yeni kod |
| ---------------------------------------------------------------------- | :------: | :------: |
| KANIT 1 — aday dizisi TERSINE cevrilince secilen KUME degismez         | ❌ duser | ✅ gecer |
| KANIT 1b — dizinin HER permutasyonu ayni kumeyi secer                  | ❌ duser | ✅ gecer |
| KANIT 2 — registry TERS sirada kayitliyken ayni secim                  | ❌ duser | ✅ gecer |
| KANIT 3 — band esitken `affinity` kazanir                              | ❌ duser | ✅ gecer |
| KANIT 3b — `affinity = 1` olan 0.75, `affinity = 0` olan 0.95i GECEMEZ |    ✅    |    ✅    |

⚠️ **KANIT 1b ONCE DEGERSIZDI ve duzeltildi:** yardimci fonksiyon `limit: 8`
kullaniyordu, yani alti adayin hepsi havuza giriyor ve **eleme hic
yasanmiyordu** — test kusurlu kodda da YESIL yaniyordu. `limit` 3'e cekildi.
⚠️ Bir siralama garantisi ancak **yuva KITKEN** sinanabilir; kusur altinda
yesil yanan bir test, garantiyi korumaz.

### ⚠️ OLCUM — dagilim TEKRARLANDI (ADR-0048'in ayni tenant'i, ayni grep)

`pnpm seed:audit-tenant -- --with-embeddings` → dort soru → `retrieval.select`.
`YUVA` = o kaynak cevaba girdi.

| Yapisal kaynak         | S1 genel | S2 riskler | S3 nakit+stok | S4 randevu+gorev |
| ---------------------- | :------: | :--------: | :-----------: | :--------------: |
| `crm-pipeline`         |    ·     |  **YUVA**  |       ·       |        ·         |
| `inventory-stock`      | **YUVA** |  **YUVA**  |   **YUVA**    |        ·         |
| `invoicing-pipeline`   | **YUVA** |     ·      |       ·       |     **YUVA**     |
| `appointment-schedule` |    ·     |  **YUVA**  |       ·       |     **YUVA**     |
| `project-status`       | **YUVA** |     ·      |   **YUVA**    |     **YUVA**     |
| `finance-cashflow`     |    ·     |     ·      |   **YUVA**    |        ·         |

⚠️ **T1'IN UC KURBANI DA ARTIK YUVA ALIYOR:** `appointment-schedule` (S2, S4),
`project-status` (S1, S3, S4), `finance-cashflow` (S3). ⚠️ Ve **hep ayni uclu
kazanmiyor** — dort soruda **dort farkli uclu**.

### ⚠️ KABUL OLCUTU KARSILANDI — ve secimin LIYAKAT ayagi calisti

ADR'nin kendi kabul olcutu: _"hedefli bir soru `finance-cashflow`u iceri
almalidir; olmazsa mekanizma calismiyor demektir ve ADR geri alinir."_

S3 (_"Nakit akisi ve stok durumu nasil?"_) icin log satiri:

```
crm-pipeline           score=0.95 affinity=0     lot=880237570   selected=false
inventory-stock        score=0.95 affinity=0.25  lot=772881070   selected=TRUE
invoicing-pipeline     score=0.95 affinity=0     lot=1373598686  selected=false
appointment-schedule   score=0.95 affinity=0     lot=3723516622  selected=false
project-status         score=0.95 affinity=0     lot=632846241   selected=TRUE
finance-cashflow       score=0.95 affinity=0.5   lot=3389564201  selected=TRUE
```

⚠️ **Uc yuvanin IKISI LIYAKATLE, BIRI KUR'AYLA dagildi** — tasarimin uc
anahtari canli olarak ayrisiyor:

1. `finance-cashflow` (affinity **0.5**) ve `inventory-stock` (**0.25**) soruya
   gercekten cevap verdikleri icin **kazandi**.
2. ⚠️ `finance-cashflow`un `lot`u alti kaynagin **EN YUKSEGI** (3.389.564.201)
   — yani kur'ayla kesinlikle kaybederdi. ⚠️ **`affinity`nin `lot`u ezdiginin
   canli kaniti**; eski kodda ise kayit sirasinin **sonuncusu** oldugu icin
   zaten hic giremiyordu.
3. Ucuncu yuva, `affinity = 0` olan dort kaynak arasindan **en dusuk `lot`a**
   (`project-status`, 632.846.241) gitti — ⚠️ **bu liyakat degil ADALETTIR** ve
   satir bunu **gosterebiliyor**.

⚠️ **§5'in gerekcesi boylece dogrulandi:** `affinity` ve `lot` olmasaydi bu
satirda alti kaynak da `score=0.95` gorunur, ucu secilir, ucu secilmezdi ve
**neden** sorusunun cevabi **hicbir yerde olmazdi**.

### ⚠️ Uygulamada ADR'ye EKLENEN tek karar

`selectFragments` artik `rankings` (aday → `{affinity, lot}`) da **donduruyor**;
kayit tarafi degerleri **yeniden hesaplamiyor**. ADR §5 alanlarin yazilacagini
soyluyordu ama **nereden** geleceklerini belirtmemisti.

Gerekce ADR-0046 §5'in `selected` icin verdigi kararla **birebir aynidir**:
kaydi yazan taraf degerleri kendi hesaplasaydi, formul degistigi gun kayit
**eski degeri** yazmaya devam ederdi ve ⚠️ o sapma **SESSIZ** olurdu — log
yesil kalir, veri yalan soyler.

### ⚠️ Yol boyunca duzeltilen bir TESHIS kusuru (kapsam disi ama kayda deger)

Dogrulama sirasinda Docker durdu ve `seed:audit-tenant` sunu bastı:

```
[seed] beklenmeyen hata:
```

⚠️ `pg`, baglanti reddedildiginde `message`i **BOS** bir `AggregateError`
firlatiyor. `db-preflight.mts`in var olma sebebi tam olarak bu sinif bir
belirsizlikti (_"Exit status 1 hicbir sey soylemiyor"_); betik ayni tuzaga
dusuyordu. `errorMessage` bos `message` durumunda hatanin **adini ve alt
hatalarini** yazacak sekilde duzeltildi.

---

## Bu karar ne zaman yeniden gozden gecirilir?

- ⚠️ **T1 yeniden ateslerse:** sebep artik kayit sirasi **olamaz**; o gun
  bakilacak yer taban buyuklugu ya da skor merdivenidir — ADR-0042'nin
  ikilemi **o zaman** gecerli olur.
- ⚠️ **`lot`un payi buyurse** (yani cogu soruda `affinity` herkese 0 veriyorsa):
  bu, `questionAffinity`nin **zayif** oldugunun olcusudur ve o gun gercek bir
  metin arama (ADR-0011'in FTS kalemi) gundeme gelir. ⚠️ Log satiri bu orani
  **olculebilir** kilar.
- ⚠️ **Rerank acildiginda** (ADR-0036'nin kendi tetikleyicisi): secim
  algoritmasi bastan yazilir ve bu ADR'nin uc anahtari o tasarima **girdi**
  olur.
- ⚠️ **Cok dilli tenant geldiginde:** onek kurali ve soru-kelimesi listesi
  dile bagimlidir; o gun `affinity` dil-farkinda hale getirilmeli ya da
  devre disi birakilip `lot`a birakilmalidir.
- ⚠️ **Askidaki iki katkici eklendiginde** (`feedback-satisfaction`,
  `campaign-gap`): yapisal kaynak 8 olur, beraberlik ihtimali **artar** ve bu
  mekanizmanin yuku **buyur** — o gun olcum tekrarlanmalidir.
