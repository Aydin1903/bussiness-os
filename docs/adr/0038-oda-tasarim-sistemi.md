# 0038 — ODA tasarim sistemi

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-14
- **Karar veren:** Product Owner
- **Faz:** 5

> **Not.** Bu ADR bir **is modulu** tanimlamaz. Dort canli modulun (CRM ·
> Projeler · Finans · Randevu) ve Panel'in **arayuz sistemini** degistirir.
> Bu, CLAUDE.md **Mutlak Kural 1'e** (her prompt tek bir modul gelistirir)
> bilincli bir istisnadir ve Product Owner tarafindan **acikca onaylanmistir**
> (2026-08-14, "Hepsi"). Sessiz bir yan is degildir.

## Baglam

Product Owner dort canli modulun arayuz kalitesinden memnun degildi:
_"duz muhendis yapimi gibi duruyor, canlilik yok, kullaniciyi iceride tutacak
bir kalite hissi yok"_. Talep acikti: **dolgulu, premium, klas** — ve
**"AI yapmis gibi hissedilmesin"**.

### Teshis olculdu, goz karariyla konusulmadi

`apps/web/src` uzerinde sayildi (2026-08-14):

| Bulgu                                     | Olcum                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| 1. Tipografik olcek yok                   | 156 yazi boyutu kullaniminin **139'u 9–13,5 px** bandinda; 16,5 px ustu **8**     |
| 2. Dort modul tek sekil                   | 13 ekranin **13'u** `ModuleBody` → 720 px tek sutun, hepsi ayni `RecordCard`      |
| 3. Renk var ama alani yok                 | 109 imza rengi / 370 notr; `bg-accent`'in 29 kullanimi neredeyse tumuyle dugmede  |
| 4. Urunun tezi ekranda gorunmuyor         | Dort modulun **ucunde** modul ici AI yuzeyi **yok** (Projeler · Finans · Randevu) |
| 5. Bekleme ve bosluk anlari tasarlanmamis | Yukleme durumu duz metin `Yukleniyor…`; iskelet (skeleton) yok                    |

Kod **ozensiz degildi** — tam tersi. Sorun kalitede degil, sistemde
**hiyerarsi uretecek arac bulunmamasindaydi**.

### Rahatsiz edici ek bulgu

2026 itibariyla yapay zeka uretimi arayuzun en taninan imzasi sudur:
**sicak krem zemin + serif baslik + terracotta vurgu + yuvarlak kartlar +
hover'da kenardan isinan vurgu cubugu**. "Atolye" (2026-08-05) bu tarifin bes
maddesinin **besini birden** tasiyor. O gun mor/mavi klisesinden kacinma karari
dogruydu, ama kacinilan klisenin yerini bu aldi — yani
**"AI yapmis gibi durmasin" talebi Atolye'nin evrimiyle karsilanamazdi**.

### Iki tur oneri yapildi

**Birinci tur reddedildi** ve gerekce dogruydu: uc yon sunulmustu ama ucu de
**ayni iskeletin farkli boyasiydi** (ayni sol menu, ayni baslik seridi, ayni
kart izgarasi). Renk degisiyordu, **isin nasil yapildigi** degismiyordu.

**Ikinci turda dort yapisal konsept** sunuldu — kaplama degil etkilesim modeli:
Brifing (uygulama cevapla acilir) · Tezgah (sayfa degistirmezsiniz, yanina
eklersiniz) · Nabiz (moduller yer degil mercek) · **Oda** (her modul bir mekan).

Product Owner **Oda**'yi secti ve iki ek bilgi verdi:
**KobiWise isletme sahibi icin bir uygulamadir** (operasyoncu icin degil), ve
**logo hazirdir** (`logo/` — K isareti + kelime logosu).

## Karar

**Her modul kendi isigi ve derinligi olan bir ODA'dir.** Modulun imza rengi
artik bir dugme dolgusu degil, **ekranin tamamini yikayan tuval rengidir**.
Her oda tek bir dikey kaydirmada iki bolgeden olusur: ustte **duvar** (karar
yuzeyi), altta **tezgah** (calisma yuzeyi). Gezinme, odalarin dizildigi bir
**koridordur**.

## Alt kararlar

### 1. Duvar ve tezgah — eskizin olumcul acigi buydu

Konsept eskizi "tek dev nesne + uydular" diyordu ve **200 satirlik islem
listesi bir odaya sigmiyordu**. Cozum ikinci bir yuzeydir:

| Bolge      | Ne gosterir    | Icerigi                                                       |
| ---------- | -------------- | ------------------------------------------------------------- |
| **Duvar**  | "Ne oluyor"    | Kahraman rakam + delta + egilim · uydular · asistanin cumlesi |
| **Tezgah** | "Ne yapacagim" | Yogun liste — tablo yogunlugunda, ayni odanin isiginda        |

Sekme **yok**, mod degistirme **yok** — ikisi ayni dikey kaydirmadadir.
Gerekce kullanici modelidir: KobiWise'i acan **isletme sahibi** once durumu
gorur, sonra kalemlere iner.

### 2. Koridor — sol serit, alt serit DEGIL

Eskizde oda secici alttaydi. Iki nedenle sola tasindi:
**kesfedilebilirlik** (alt serit bir gezinme yeri olarak okunmuyor) ve
**klavye/ekran okuyucu sirasi** (alt serit DOM'un sonuna dusuyor, yani
gezinmeye ulasmak icin tum icerik gecilmesi gerekiyordu).

54 px'lik serit `sidebar.tsx`'in yerini alir. Her oda bir **kapi**; aktif kapi
kendi rengiyle yanar ve sol kenarinda cubugunu tasir. Metafor bozulmaz —
kapilar bir koridorda dizilidir.

⚠️ Renk **tek ayirt edici degildir**: her kapi ikon + etiket + `aria-current`
tasir (ADR-0031/0033'un renk korlugu kurali aynen gecerli).

### 3. Tuval katmani — "renk %2" sorununun asil cozumu

Modulun rengi ekranin **zeminini** yikar:

```
gunduz: linear-gradient(rgb(var(--mc-rgb) / 7%), …) uzerine  #f8f7f4
gece:   linear-gradient(rgb(var(--mc-rgb) / 8%), …) uzerine  #0a0b0c
```

Yuzeyler (kart, tezgah satiri) bu tuvalden **yukselir**. Sonuc: renk artik
ekranin ~%2'si degil, **zemininin tamami**.

⚠️ `rgb(var(--mc-rgb) / %)` sozdizimi **bilincli** olarak korunuyor —
`color-mix`'in geri dusus sorunu ADR-0031 doneminde olculup reddedilmisti
(`module-colors.css` §3). Yeni bir mekanizma **uretilmedi**, var olan
genisletildi.

### 4. Gece, gunduzun tersi DEGILDIR

Ikisi **ayni odanin iki isik kaynagidir**: gunduz pencereden gelir (oda rengi
kagidi yikar, yuzeyler **beyaz** yukselir), gece lambadan gelir (oda rengi
karanligi boyar, yuzeyler **isikla** yukselir). Isik her ikisinde de
**sol usttendir**.

Onemli sonuc: **"renk %2" sorunu gunduz modunda da cozulur.** Aydinlik temayi
kurtarmak icin karanliga kacilmiyor — bu, konseptin ilk eskizindeki en buyuk
riskti ve kapandi.

⚠️ **Tema anahtari artik ZORUNLU.** Bugune kadar koyu tema yalnizca isletim
sistemi tercihinden geliyordu ve `data-theme` hicbir yerde yazilmiyordu
(FRONTEND §4.8'in kayitli sinirlarindan biri). Oda sistemi iki isigi da birinci
sinif vatandas yaptigi icin kullanicinin secebilmesi gerekir.

### 5. Kahraman rakam tek basina birakilmaz

Baglamsiz buyuk sayi bir **afistir**, arac degil. Her duvar rakami uc seyle
gelir: **donem** · **degisim** · **kucuk egilim cubugu**. "1.284.500" bir bilgi
degildir; "gecen aya gore %12 arti" bir karardir.

Kahraman secimi modul basina ayri yapilir ve **isletme sahibinin sordugu
soruya** gore secilir, tabloda ne varsa ona gore degil:

| Oda        | Kahraman                        | Neden                                              |
| ---------- | ------------------------------- | -------------------------------------------------- |
| Panel      | **Asistanin o sabahki cumlesi** | Panel modul degil, AI'in kendi yuzeyi              |
| Musteriler | **Acik firsat toplami**         | "Kac kayit var" degil, "ne kadar is havada"        |
| Projeler   | **Yuruyen is + riskteki**       | "Kac proje var" cevabi hicbir seyi degistirmez     |
| Finans     | **Net donem rakami**            | Zaten turetilmis, deterministik                    |
| Randevular | **Siradaki randevunun saati**   | Tek oda ki kahramani bir buyukluk degil bir **an** |

### 6. Asistanin cumlesi tiklanabilir olmak ZORUNDADIR

Eskizde AI bir sus cumlesiydi. Artik cumledeki her iddia bir **baglantidir** ve
kanita goturur. Suslemeyle arac arasindaki fark bu tek kuraldir.

⚠️ **Terracotta = AI'in sesi kurali AYNEN gecerli** (2026-08-08 karari) ve oda
sistemi onu **guclendirir**: odalar artik doygun renkli oldugu icin terracotta
hicbir odanin rengi degildir, dolayisiyla her gorulusunde tek bir sey der.

⚠️ Bu karar **bulgu 4'un cevabidir**: Projeler, Finans ve Randevu odalarina
modul ici AI yuzeyi **girer**.

> ### ⚠️ DUZELTME (uygulama sirasinda, 2026-08-14) — bu madde FAZLA SOZ VERDI
>
> ADR yazilirken "ADR-0033 §10, ADR-0034 §10 ve ADR-0035'in _modul ici AI
> yuzeyi v1'de yok_ kayitlari bu ADR ile **kapanir**" deniyordu.
> **Bu yanlisti ve Finans odasi yazilirken ortaya cikti.**
>
> Bir odaya AI cumlesi koymak bir **arayuz** isi degil, bir **modul** isidir:
> asistanin o donem hakkinda cumle kurmasi icin bir sunucu ucu gerekir
> (`LLMPort` cagrisi + donem baglami + oran siniri + izin kapisi). Bu ADR ise
> acikca **yalnizca arayuzu** kapsiyor.
>
> Elde olan sey yeterli **degildi**:
>
> - `finance.commentaries` **kullanicinin** yazdigi metindir. Onu terracotta
>   ile cizmek, kullanicinin kendi cumlesini asistanin agzindan soylemek
>   olurdu — `cashflow-screen.tsx`'in kendi uyarisinin ihlali.
> - `POST /ask` her oda acilisinda cagrilamaz: dokuz katkiciya dokunur,
>   ~4 saniye surer ve token harcar (ADR-0035 fan-out olcumu).
>
> **Bugunku durum:** Panel odasinin kahramani zaten asistanin cumlesidir
> (`GET /knowledge/daily-report` — var olan uc). Finans · CRM · Projeler ·
> Randevu odalarinda `RoomAi` **cizilmiyor** ve ADR-0033/0034/0035'in ilgili
> kayitlari **acik kaliyor**.
>
> **Kapanmasi icin gereken:** modul basina bir "donem ozeti" ucu. Bu ayri bir
> karardir ve Product Owner onayi bekler — sessizce yapilmadi, cunku alternatifi
> kullanicinin yazdigi metni AI'in sesiyle boyamakti.

### 6.5 BIR MODULUN HER ROTASI ODADIR — duvar ORTAK, tezgah DEGISIR

> **Product Owner talimati, 2026-08-17:** _"finans modulunde sadece Nakit akisi
> tarafi oda dizayninda ama islemler ve kategoriler eski halinde kalmis.
> Onlarda oda olsun. Bundan sonraki butun tasarimlarda bunu goz onune al."_

Ilk uygulamada modulun **bir** rotasi odaya cevrilmisti; digerleri eski
`ModuleBody` (720 px tek sutun) duzeninde kaldi. Sonuc tutarsizdi: ayni modulun
sekmeleri arasinda gezerken tasarim dili degisiyordu.

**Kural (on iki modulun tamamini baglar):**

1. **Bir modulun HER rotasi bir odadir.** Yarim gecis yoktur.
2. **Duvar ORTAKTIR, tezgah DEGISIR.** Bir modulun birden cok rotasi varsa
   bunlar ayri odalar degil, **ayni odanin farkli calisma yuzeyleridir**:

   | Rota                | Duvar              | Tezgah                       |
   | ------------------- | ------------------ | ---------------------------- |
   | `/finance`          | donem neti + delta | islem listesi                |
   | `/finance/cashflow` | donem neti + delta | kategori kirilimi + yorumlar |

   Gerekce kullanici modelidir: sekmeler arasinda gezerken _"hangi donemdeyim,
   durum ne"_ sorusunun cevabi **gozden kaybolmamalidir**. Her sekmeye farkli
   bir kahraman koymak, ayni odada uc ayri gerceklik uretirdi.

   Uygulamasi paylasilan bir bilesendir (`finance-wall.tsx`); kopyalanmaz.

3. **ISTISNA — rotanin sorusu gercekten farkliysa duvari da farklidir.**
   `/finance/categories` sozluk yonetir, donem finansi degil; oraya donem neti
   koymak **sorulmamis bir soruya dev puntoyla cevap vermek** olurdu. O rota
   kendi hafif duvarini kurar (kategori sayisi + yon kirilimi).

⚠️ Karar noktasi sudur: **bu rota hangi soruyu cevapliyor?** Ayni soruysa duvar
ortak, farkli soruysa duvar farkli. "Ayni modulde" olmak tek basina yeterli
degildir.

### 6.6 PANEL IKIYE AYRILDI — brifing ve sohbet

> **Product Owner geri bildirimi, 2026-08-17:** _"Gunluk ozet ile chatbot tek
> odada karisiyor. Mevcut hali cok karmasik."_

ADR'nin ilk halinde Panel'in duvari asistanin sabah cumlesi, tezgahi ise sohbet
akisiydi — **ve bu yanlisti.** Iki farkli zihinsel mod ayni ekranda yarisiyordu:

| Mod          | Ne ister                                   |
| ------------ | ------------------------------------------ |
| **OKUMAK**   | sakin, tek yonlu, "bugun ne olmus?"        |
| **KONUSMAK** | aktif, cift yonlu, bos sayfa + hazir imlec |

Altta yanip sonen bir imlec varken ustteki metni okumak zor; okurken de o imlec
_"bir sey yazmaliyim"_ diye bastiriyordu.

**Ayrim:**

- **`/app` — Brifing odasi.** Duvar: asistanin o sabahki cumlesi. Tezgah: son
  notlar + **not alma** alani (not almak bir konusma degil, brifingin dogal
  devamidir). Birincil eylem: **"Sohbet et →"**.
- **`/app/chat` — Sohbet odasi.** Her giriste **TEMIZ SAYFA**. Bos sayfa,
  baslangic sorulari, `← Panel` donus yolu.

⚠️ **Sohbet koridorda bir kapi DEGILDIR** — koridor bes **modulun** yeridir.
Buraya Panel'den gelinir; bu yuzden donus yolu ekranda gorunur olmak zorundadir
(tarayicinin geri tusuna guvenmek, yolu yalnizca onu dusunen kullaniciya vermek
olurdu).

⚠️ **Sohbet odasinin DUVARI YOKTUR** ve bu bilincli bir istisnadir: bir
sohbetin ozetlenecek bir DURUMU yoktur, konusmanin kendisi zaten calisma
yuzeyidir. Zorla bir kahraman rakam koymak ("3 soru soruldu") bilgi degil sus
olurdu.

⚠️ Sohbette **mod anahtari YOKTUR** (`Composer`in `onModeChange`i verilmez).
Orada "Sor / Not ekle" secimi sunmak, ayirmak icin ugrasilan seyi geri
bulandirirdi.

### 6.7 GRAFIKLER — halka YALNIZCA gider, cizgi son alti ay

> **Product Owner talebi, 2026-08-17:** _"Finans kismina ilk giriste genel ozet
> bolumu ekleyelim, iki tane grafik koyulmali göz zevki icin. Yuvarlak grafik ve
> cizgi grafigi gibi."_ Asagidaki kisitla **onaylandi**.

Duvar tek bir **ani** soyler (bu donemin neti). Iki grafik onun baglamini verir:

- **Halka** → "parayi nereye harciyoruz" (donemin gider kirilimi)
- **Cizgi** → "hangi yone gidiyoruz" (son alti ayin neti)

⚠️ **HALKA YALNIZCA GIDERI GOSTERIR — ADR-0034'un pasta reddi KORUNUYOR.**
`category-bars.tsx` pastayi su gerekceyle reddetmisti: her kirilim satiri
`direction` tasir, yani ayni para biriminde hem gelir hem gider kategorileri
vardir ve **ortada "butun" diye bir sey yoktur**. O gerekce hala gecerli;
halka bu yuzden **tek yone** kapatildi — giderlerin toplami GERCEK bir butundur
ve dilimler onun payidir. Gelirin halkasi yoktur (gelir genelde tek kalemdir,
tek dilimlik halka bilgi tasimaz).

⚠️ **Grafik kutuphanesi YINE YOK** (FRONTEND §4.10). Elle SVG; `category-bars`
ile ayni disiplin ve ayni `Number()` kurali: parse edilen deger **yalnizca
geometri** icindir, ekrandaki tutar daima sunucunun kanonik dizesidir.

⚠️ **Dilim renkleri tek hue, luminans basamaklari** (`--accent-rgb` + alfa).
Rastgele bir kategorik palet yerine odanin kendi rengi kullanilir: grafik
modulun kimliginde kalir **ve renk korlugu altinda bozulmaz** (ayrim hue degil
parlakliktir). Renk yine tek ayirt edici degildir — lejant ad + tutar + yuzde
yazar.

⚠️ **Alti ay = alti cagri.** Sunucuda "son N donemin serisi" ucu YOK; acmak bir
modul degisikligi olurdu. `Promise.all` ile paralel gider. Seri `allSettled`
**degil** `all` kullanir: eksik bir ay grafikte "sifir" gorunurdu ve o, olcum
degil olcememenin sonucudur — yanlis bir egilim cizmektense hic cizmemek dogru.

### 6.8 TEK IZGARA — orantinin asil cozumu

> **Product Owner geri bildirimi, 2026-08-17:** _"ozet kismi cok buyuk ama son
> notlar kismi kucuk ve ortada … goz yoruyor buyuklu kuculku olunca."_

Teshis **dolgu ya da punto degildi, IKI AYRI IZGARAYDI**: duvar tam genislikte,
tezgah ise 760 px'de **ortalanmis**. 1280 px'lik bir ekranda ikisinin **sol
kenari hizalanmiyordu** ve goz iki ayri kompozisyon goruyordu.

**Kural:** odanin her bolgesi (ust serit · duvar · tezgah basligi · tezgah
icerigi) **ayni `max-w` ve ayni yatay dolguyu** kullanir. Boyut farki sorun
degildi — **hizasizlik** sorundu; hizalanmis kenar, farkli boyuttaki ogeleri
tek kompozisyon olarak okutan seydir.

⚠️ Ekran basina elle `max-w` yazilmaz; `DeskBody` bu secimi ekranin elinden
alir. Bir ekran kendi olcusunu secerse hata SESSIZDIR: o ekran tek basina iyi
gorunur, yalnizca digerleriyle karsilastirildiginda bozulur — ve kimse iki
ekrani yan yana koymaz.

### 6.9 Koridor acilip kapanabilir

> **Product Owner, 2026-08-17:** _"Soldaki genel menu dizayni guzel ama kucuk
> geldi bana biraz. Onu bence acilip kapanabilir yapalim."_

Dar hal 62 px (ikon + kisaltma), genis hal 216 px (tam etiket + sirket adi +
hesap). **Varsayilan GENIS**: ilk kez acan kullanici urunun neye sahip oldugunu
okuyabilmeli; daraltma bir aliskanlik kazandiktan sonraki tercihtir. Tercih
kalicidir (`bo_rail`).

⚠️ Dar halde kapinin **erisilebilir adi TAM kalir** (`aria-label`), yalnizca
gorunen etiket kisalir — gorsel kullanici ikonu gorup baglami tamamlar, ekran
okuyucu kullanicisi tamamlayamaz.

### 6.10 BINLIK AYRACI — ADR-0034'un "bilinen siniri" KAPANDI

> **Product Owner talimati, 2026-08-17:** _"binlik ayraci eksikligini duzelt …
> tarayicinin otomatik locale algisina guvenme — kendi formatlama fonksiyonunu
> yaz, davranisi sabitle."_

ADR-0034 bunu bilinen sinir olarak kaydetmisti: _"Binlik ayraci yok:
sunucunun kanonik dizesi oldugu gibi yazilir; bicimlendirmek `Number`a cevirmek
demekti ve para bu projede hicbir noktada `number` olmuyor."_

⚠️ **Sinir ODA SISTEMIYLE GORUNUR HALE GELDI.** 13–15 px'te `1284500.00` goze
batmiyordu; duvarin **64 px'lik** kahraman rakaminda okunaksiz bir rakam
dizisi. Yani teshis degil, TESHIRI degisti.

**Cozum `lib/format/money.ts`** ve o gunku itirazi bozmuyor: dize
**PARCALANIR**, `Number`dan gecmez. Bir test 17 haneli bir tutarla bunu
kanitliyor — `Number`dan gecseydi son basamak degisirdi (IEEE-754 yalnizca
2^53'e kadar kayipsiz).

⚠️ **`Intl.NumberFormat` / `toLocaleString` REDDEDILDI**, iki gerekce:

1. Sayiya cevirmeyi gerektirir (yukaridaki kural).
2. **Ortama bagimlidir** — tarayici, isletim sistemi ve ICU verisine gore
   farkli cikti verebilir ve fark SESSIZDIR.

⚠️ Ikinci madde teorik degil: bu projede ayni siniftan bir hata YASANDI.
`text-transform: uppercase`, belge `lang="tr"` oldugu icin "Business OS"u
ekranda **"BUSINESS OS"** yerine noktali I ile cizdi. Locale'e duyarli her
donusum ayni riski tasir; ayraclar bu yuzden **koda yazilidir**.

⚠️ **Iki bicim var ve ayrimi anlamlidir:**

| Fonksiyon            | Kurus            | Nerede                               |
| -------------------- | ---------------- | ------------------------------------ |
| `formatMoney`        | daima yazilir    | duvarin kahramani, tutar isaretleri  |
| `formatMoneyCompact` | sifirsa gizlenir | yogun listeler (CRM firsat kartlari) |

Ikincisi CRM'de ZATEN alinmis bir karardi (`stage-pill.tsx`) — ve dogru cozum
projede VARDI, yalnizca **paylasilmiyordu**: Finans ayni sorunu yasarken ham
dize basiyordu. Mantik `lib/`e tasindi, `stage-pill.tsx` imzasini koruyan bir
sarmalayici oldu.

### 7. Marka — logo uc sey soyluyor

`logo/` altindaki iki dosya okundu (K isareti + "KobiWise / BUSINESS OS"
kelime logosu). Uc sonuc:

1. **Markanin rengi yok.** Logo soguk fume siyah, hicbir hue'ya sahip degil —
   yani **rengin tamami odalara kalir** ve marka hicbir odayla cakismaz.
   Markasi mavi olan bir urunde bu konsept kurulamazdi.
2. **Notr eksen soguga cekilir.** Mevcut palet sicak kahve-siyah (`#1e1811`),
   logo soguk fume (`#1c1f22`). Yan yana durunca logo kirli gorunur. Bu
   duzeltme ayni zamanda krem/terracotta "AI urunu" imzasindan da cikistir —
   **iki sorun tek kararla kapanir**.
3. **Kelime logosu uygulama kabuguna GIRMEZ.** Ince agirlikli ve genis; 12 px'de
   cilizdir — tam olarak kacinilan his. Kabukta **yalnizca K isareti** durur;
   tam kilit giris ekrani, e-posta ve pazarlama icindir. "BUSINESS OS" alt
   satiri uygulamaya hic girmez: kullanici zaten icindedir.

> ### ⚠️ DUZELTME (2026-08-17) — 3. MADDENIN GEREKCESI GECERSIZ
>
> Product Owner `logo/örnek_logo.png` ile **TradingView** kilidini referans
> verdi ve kelime logosunun ona gore duzenlenmesini istedi.
>
> **Referansin belirleyici ozelligi AGIRLIKTIR:** dolu bir isaretin yaninda
> **kalin, siki takipli bir grotesk**, kompakt bir butun olarak.
>
> Bu, yukaridaki 3. maddenin gerekcesini gecersiz kilar. Orada yazan sey
> ("12 px'de cilizdir") **ince agirliga bagliydi** — kalin ve siki bir kelime
> logosu kucuk boyutta ciliz DEGIL, saglamdir. Referans urunun kendi arayuzunde
> kelime logosunu kullanabilmesinin sebebi tam olarak budur.
>
> ⚠️ Ayrica eski kilitte **gercek bir kusur** vardi: KobiWise isareti DOLU ve
> agir, kelime logosu ise ince (300) ve havadardi. Goz onlari tek bir kilit
> degil, yan yana durmus **iki ayri nesne** olarak okuyordu.
>
> ### ⚠️ IKINCI DUZELTME (ayni gun) — "KILIT" DIYE BIR VARLIK YOK
>
> Ilk duzeltmede isaret ve yazi tek bir **kilit**te birlestirilip yer olan her
> yere o konmustu. Product Owner bunu da duzeltti:
>
> _"k harfli kucuk logo sadece favicon, mobil uygulama gorseli, ya da
> dashboardda sol ekrani kucultürken falan gelsin. Kucuk yerlerde gorunsun, ama
> giriste vs yazili logomuz olsun."_
>
> **Marka sistemi IKI AYRI VARLIKTIR ve ikisi YAN YANA KULLANILMAZ:**
>
> | Varlik          | Nerede                                           |
> | --------------- | ------------------------------------------------ |
> | **K isareti**   | Favicon · mobil uygulama ikonu · **dar** koridor |
> | **Yazili logo** | Giris/kayit ekrani · e-posta · **genis** koridor |
>
> Gerekce: bir markanin adi zaten yaziliyken yanina bas harfini koymak **ayni
> seyi iki kez soylemektir**. Kucuk yuzeylerde isaret yazinin **YERINE** gecer,
> yanina degil.
>
> ⚠️ **FAVICON HIC YOKTU.** Bu istek onu ortaya cikardi: `apps/web/src/app`
> altinda ne `icon` ne `apple-icon` vardi, yani sekmede bos bir ikon duruyordu.
> Ikisi de eklendi (`icon.svg`, `apple-icon.svg`).
>
> ⚠️ **Isaretin geometrisi UC yerde yasiyor** (bilesen + iki statik SVG) cunku
> statik SVG dosyalari TSX'ten import edemez. Ikizlesme riski gercektir ve
> sessizdir — uygulama yeni isareti, sekme eskisini gosterirdi.
> `brand-assets.spec` uc kopyayi kilitler.
>
> ⚠️ **Yazili logonun takibi OPTIKTIR** (20 px → -0.022em, 48 px → -0.036em).
> Sabit bir `letter-spacing` her boyutta yanlistir: ayni deger buyuk puntoda
> gevsek, kucuk puntoda siki gorunur.
>
> ⚠️ **`text-transform: uppercase` KULLANILMADI** ve bu bir hatanin duzeltmesi:
> belge `lang="tr"` tasiyor, CSS buyuk harf donusumu DILE DUYARLIDIR ve Turkce
> kurallariyla `i` → `İ` olur. Tanimlayici ekranda **"BUSİNESS OS"** diye
> ciziliyordu — tarayicida goruldu. Harfler artik oldugu gibi yaziliyor.
>
> **Eski kural (asagidaki tablo) YERINI BUNA BIRAKTI:**
>
> **Yeni kural:**
>
> | Yuzey                  | Ne durur             |
> | ---------------------- | -------------------- |
> | Giris ekrani · e-posta | Tam kilit            |
> | **Genis koridor**      | **Tam kilit** (yeni) |
> | Dar koridor (62 px)    | Yalnizca K isareti   |
>
> Kisit **gevsetildi, kaldirilmadi**: 62 px'e hicbir agirlikta bir kelime
> sigmaz.
>
> **Yazi tipi: Inter 700, `-0.03em` takip.** Dorduncu bir font ailesi eklemek
> REDDEDILDI — bu urunun ses ayrimi zaten UC aileye dayaniyor (urun / AI /
> sistem, FRONTEND §4.5) ve yalnizca logo icin dorduncu bir ses acmak o ayrimi
> bulandirirdi. Inter 700 referansa yakin durur: kapali apertürler, notr
> iskelet, siki ritim.
>
> ⚠️ Punto artik isarete **oranlidir** (`size * 1.08`). Eski deger `0.86` idi ve
> buyuk harfler isaretin %62'sinde kaliyordu — yazi isaretin yaninda KUCUK
> duruyordu. Inter'in buyuk harf yuksekligi em'in ~%73'u oldugu icin 1.08 orani
> harfleri isaretle ayni hizaya getirir.
>
> ⚠️ Daha ayirt edici bir **display yuzu** istenirse bu bir satirlik istir ama
> AYRI bir karardir: marka yuzu, urun yuzunden bagimsiz secilmelidir. Bugun
> bilincli olarak acilmadi.

⚠️ Elimizdeki dosyalar **JPEG/PNG**'dir. K isareti SVG olarak **yeniden cizildi**
(tek `<symbol>`, `currentColor`). Product Owner kelime logosunun vektorunu
gondermeye gerek olmadigini bildirdi (2026-08-14); kelime logosu artik kabukta
da kullanildigi icin **metin olarak** (Inter 700) diziliyor — bir vektor kopya
tutulmuyor, yani iki kaynak arasinda sapma riski de yok.

## Ne DEGISMIYOR

Bu ADR'nin en onemli bolumu budur — oda sistemi mevcut olculmus altyapiyi
**tuketir**, yeniden uretmez:

| Korunan                                     | Nerede                                 |
| ------------------------------------------- | -------------------------------------- |
| 12 modul renginin **olculmus** paleti       | `module-colors.css` (kontrast tablosu) |
| `data-module` alt agac override mekanizmasi | ADR-0031 / FRONTEND §4.8               |
| **Terracotta = AI'in sesi**, ezilemez       | 2026-08-08 karari                      |
| `@theme inline` + `rgb(… / %)` turetmesi    | `globals.css` / `module-colors.css` §3 |
| Uc ses uc aile (Inter · Newsreader · Mono)  | FRONTEND §4.5                          |
| Grafik kutuphanesi **reddi**                | FRONTEND §4.10 (PO karari, 2026-08-12) |

**Hicbir renk yeniden olculmuyor.** Ilk tahminde "12 odanin ayri
kalibrasyonu" maliyeti yazilmisti; numuneler kurulunca bunun **fazla** oldugu
goruldu ve tahmin duzeltildi (4–5 hafta → **3–4 hafta**).

## Gerekce

Reddedilen alternatiflerin hepsi teshisin **bir kismini** cozuyordu; Oda
besini birden cozer ve ustune urunun tezini ekranda gorunur kilar.

- Bulgu 1 → duvarin kahraman rakami **9 px ile ~74 px'i yan yana** getirir
- Bulgu 2 → duvar/tezgah iskeleti 720 px tek sutun tekelini kirar
- Bulgu 3 → tuval katmani rengi zeminin tamamina yayar
- Bulgu 4 → her odaya AI yuzeyi girer, cumle tiklanabilirdir
- Bulgu 5 → iskelet **odanin kendi seklini** tasir, bos oda **bos gorunmez**

Ve "AI yapmis gibi durmasin": krem zemin terk edilir, notr eksen soguga cekilir,
kart+golge izgarasi tek bicimli olmaktan cikar.

## Sonuclari

**Olumlu**

- Isletme sahibinin sordugu soru her odada **ilk gorulen sey** olur
- Modul kimligi bir dugmede degil ekranin tamaminda hissedilir
- Gunduz temasi de renk kazanir — koyu temaya kacilmadi
- Tema anahtari nihayet gelir (acik borctu)
- Uc modulun "AI yuzeyi yok" borcu tek iste kapanir
- Olculmus palet **yeniden kullanilir**, yeniden uretilmez

**Olumsuz / bedeli**

- **Mutlak Kural 1'e istisnadir** — dort modul + Panel birden degisir
- `apps/web`in **349 testinin onemli bir kismi guncellenir**
- `ModuleBody`nin 720 px tekeli, `sidebar.tsx` ve `RecordCard`in **liste
  kullanimi** emekliye ayrilir (detay ekranlarinda kalir)
- Her modul icin bir **duvar sorgusu** gerekir (kahraman + karsilastirma
  donemi). Bazi modullerde bu **yeni bir API ucu** demek olabilir — Finans'in
  delta'si bugun turetilemiyor.
- Notr eksenin soguga cekilmesi **her ekrani** etkiler; kontrast oranlari
  yeniden dogrulanmalidir
- Tuval tint'i doygun renklerde metin kontrastini dusurur; **olcum sart**

## Degerlendirilen alternatifler

| Alternatif                  | Neden secilmedi                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| **A · Atolye II** (evrim)   | Bulgu 1/2/3/5'i cozuyordu ama bulgu 4'u ve **"AI yapmis gibi durmasin"** talebini cozemiyordu           |
| **B · Kabin** (koyu pano)   | Ayni iskeletin farkli boyasiydi; etkilesim modeli degismiyordu                                          |
| **C · Bulten** (editoryal)  | En guzeli, ama dolgunlugu **gercek icerige** bagli; prod'da 1 kullanici / 0 is kaydi var                |
| **01 · Brifing**            | Tamamen AI'in cumle kalitesine bagli, kacacak yer yok. **En iyi fikri (anlatici) Panel odasina alindi** |
| **02 · Tezgah**             | Guclu kullanici modeli; KobiWise **isletme sahibi** icin (PO teyidi, 2026-08-14)                        |
| **03 · Nabiz**              | Kronoloji nakit akisi ozeti ve satis hunisi icin yanlis duzenleyici                                     |
| Alt oda seridi (eskiz hali) | Kesfedilebilir degildi ve klavye/ekran okuyucu sirasinda **en sona** dusuyordu                          |
| `color-mix` ile tint        | Geri dusus sorunu ADR-0031 doneminde olculup **reddedilmisti**; karar korunuyor                         |

## Uygulama plani

| Dilim | Is                                                                     | Not                                              |
| ----- | ---------------------------------------------------------------------- | ------------------------------------------------ |
| **0** | Marka: K isareti SVG · notr eksen soguga · `BO` rozetinin kaldirilmasi | Logo elde; kelime logosu kabuga girmez           |
| **1** | Iskelet: tuval · `Room`/`Wall`/`Desk`/`Rail` · **tema anahtari**       | Tema anahtari artik zorunlu                      |
| **2** | Panel odasi (koridor) — asistanin cumlesi kahraman                     | En gorunur ekran                                 |
| **3** | Finans odasi                                                           | En veri yogun olan — **yogunluk burada sinanir** |
| **4** | CRM · Projeler · Randevu odalari                                       | Desen 3'te oturursa hizli                        |
| **5** | Durumlar (iskelet · bos oda · hata) + mobil turu                       | Bulgu 5 + acik mobil borcu                       |

## Bu karar ne zaman yeniden gozden gecirilir?

- **Tuval tint'i bir odada metin kontrastini AA altina dusururse** — o odanin
  tint yuzdesi dusurulur, sistem degil.
- **Bir modulun duvarina anlamli bir kahraman secilemezse** — o modulun
  isletme sahibine ne soyledigi yeniden dusunulur; bos bir duvar sistemin degil
  modulun sorunudur.
- **Bir modul 200+ satirlik yogunlugu tezgahta tasiyamazsa** — tezgaha kendi
  sayfasi verilir; duvar/tezgah ayrimi korunur.
- **Faz 6'da gercek musteri geldiginde** bos oda ve ilk gun akisi gercek
  kullaniciyla sinanir; oda sisteminin en zayif noktasi orasidir.
