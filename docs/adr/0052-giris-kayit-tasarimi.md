# 0052 — Giris / Kayit ekranlarinin tasarimi: SPLIT-SCREEN + marka maskotu

- **Durum:** ✅ **KABUL EDILDI ve UYGULANDI** (dort PO kalemi A/B/C/D onaylandi, 2026-08-31)
- **Tarih:** 2026-08-31
- **Karar veren:** Product Owner
- **Faz:** 9 (Landing Page + Marka Kimligi) — ⚠️ landing page'in KENDISI bu ADR'nin **kapsami disindadir**

> ### ⚠️ ONCE SINIR: BU ADR UYGULAMANIN ICINE HIC DOKUNMAZ
>
> Bu karar **yalnizca yedi kimliksiz ekrani** kapsar (`register` ·
> `verify-email` · `login` · `forgot-password` · `reset-password` ·
> `create-tenant` · `select-tenant`).
>
> ⚠️ **ODA sistemi (ADR-0038) tek satir degismez:** `module-colors.css`'in on
> iki rengi, `globals.css`'in kok token'lari, `app-shell.tsx`, `RoomTop` /
> `Wall` / `Desk` iskeleti, AI'in terracotta sesi — **hicbiri**. `/app`
> altindaki hicbir dosya bu iste acilmaz.
>
> ⚠️ Ve bu **iki tasarim dilidir, bir evrim degil**: auth yuzeyi SICAK ve
> KARAKTERLIDIR, uygulama SOGUK-NOTR ve SESSIZDIR. §7 ikisinin nerede
> ayrildigini ve o sinirin **nasil testle kilitlendigini** yazar — cunku
> boyle bir sinir yazili durup uygulanmazsa, kacinilmaz olarak sizar.

---

## Baglam

### Ne var, ne yok

Yedi ekranin yedisi de **yazili, calisir ve API'ye baglidir** (~920 satir) ve
zincir 2026-08-31'de **prod'da, gercek tarayicida, ucdan uca kostu**:
kayit → dogrulama → giris → tenant acma → sayfa yenileme. Yani bu is bir
**islevsellik** isi degildir; islev yerindedir.

Bugunku gorsel durum tek cumleyle: **ortalanmis 384 px'lik tek bir kart**
(`(auth)/layout.tsx` — `max-w-sm`), ustunde yazili logo, icinde form. Yedi
ekranin yedisi de ayni kutudur. ADR-0038'in Faz 5 icin olctugu teshisin
(_"13 ekranin 13'u 720 px tek sutun"_) auth tarafindaki karsiligidir — ODA
sistemi uygulamanin **icini** duzeltti, kapisina hic dokunmadi.

### Neden simdi

⚠️ **Cunku bu ekranlar artik gercekten goruluyor.** app.kobiwise.com canli,
kok rota `/login`'e gidiyor ve Faz 9'un sirasi Faz 6'nin **onune alindi**
(ROADMAP §7) — gerekce tek cumleydi: _"gercek kullanici olmadan Faturalama'nin
anlami yoktur."_ Bir kullanicinin urunle kurdugu **ilk temas** bu yedi ekrandir
ve bugun o temas noter bir formdur.

### Product Owner'in verdigi yon

1. **Split-screen** — solda tam kaplayan gorsel + kisa slogan, sagda temiz form
   (referans: TradingView giris ekrani; ornek `logo ve fotograflar/ornek_logo.png`).
2. **Marka maskotu hazir** — `logo ve fotograflar/` altinda dort sahne.
3. **Sosyal giris yalnizca Google + Microsoft + Apple.** Baska saglayici yok.
4. ⚠️ **Sicak/maskotlu dil YALNIZCA auth + landing.** Uygulama ici degismez.
5. **Renk Mars/turuncu temali, ama terracotta ile CAKISMAYACAK.**

### Elimizdeki maskot varliklari (olculdu)

| Kod    | Dosya                            | Sahne                                                                   | Agirlik |
| ------ | -------------------------------- | ----------------------------------------------------------------------- | ------- |
| **M1** | `...21.17.56.jpeg`               | Mars sirti, gun batimi; el sallayan maskot; sehre giden **isikli yol**  | 279 KB  |
| **M2** | `...21.17.56 (1).jpeg`           | Koyu sahne; podyum uzerinde maskot; havada grafikler; **yan podyumlar** | 207 KB  |
| **M3** | `...21.17.56 (2).jpeg`           | Mars duzlugu; gunese dogru **yuruyen** maskot; arkada kesif araci       | 216 KB  |
| **M4** | `...21.17.56 (3).jpeg`           | Yorunge platformu; asagida Dunya; maskot **bakiyor**                    | 244 KB  |
| —      | `WhatsApp Video ...13.58.23.mp4` | Hareketli maskot                                                        | 1018 KB |

Karakterin sabitleri: **fume-siyah govde · mint yesili gozler ve isik ·
lila/mor detay**. Dordu de **1:1 kare**; panel ise **dikey**dir — bu, §4.4'un
kirpma kuralini zorunlu kilar.

⚠️ **Dosya adlari WhatsApp ciktisidir ve kalici varlik adi olamaz** (bosluk,
parantez, tarih). §5.4 adlandirmayi tanimlar.

---

## Karar

**Yedi ekranin yedisi de AYNI split-screen iskeletini paylasir; degisen sey
iskelet degil, sol panelin ICERIGIDIR. Auth yuzeyi kendi kapsamini
(`[data-surface="auth"]`) deklare eder ve o kapsamda `--accent` NOTR MUREKKEBE
cekilir — yani terracotta auth ekranlarindan TAMAMEN CIKAR. Mars paleti
yalnizca sol panelin icinde yasar; sag panel notr kalir. Sosyal giris
dugmeleri TASARLANIR ama Faz 8'in backend'i gelene kadar RENDER EDILMEZ.**

Yedi karar, sirayla.

---

## 1. Duzen: yedi ekranin yedisi de split-screen — ama uc KADEMEDE

### 1.1 Karar

Tek iskelet, uc kademe. `(auth)/layout.tsx` iki sutunlu izgarayi kurar; hangi
kademede oldugunu **her sayfa kendi deklare eder** (§5.1).

| Kademe                       | Ekranlar                                              | Sol panel                                        |
| ---------------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| **A — Kapi** (karar ani)     | `login` · `register`                                  | **Tam kaplayan fotograf** + slogan               |
| **B — Akis** (mekanik adim)  | `verify-email` · `forgot-password` · `reset-password` | **Fotograf YOK** — Mars zemini + maskot portresi |
| **C — Esigin ici** (kurulum) | `create-tenant` · `select-tenant`                     | **Tam kaplayan fotograf** + slogan               |

### 1.2 Neden tek iskelet — "hepsi ya da bazilari" sorusunun cevabi

Alternatif buydu: yalnizca `login`/`register` split-screen, kalan bes ekran
bugunku ortalanmis kart. **Reddedildi ve gerekce olcumsel degil AKISSALDIR.**

Gercek kullanici yolu tek bir ekran degil, bir **zincirdir**:

```
register → verify-email → login → create-tenant → /app
```

Bu zincirde ikinci adim birincinin **devamidir**, ayri bir sayfa degil. Split
ekrandan ortalanmis karta gecmek, kullanicinin **baska bir siteye dustugu**
hissini verir — ve tam olarak en kirilgan anda: e-postasini dogrulamak icin
gelen kutusuna gidip geri donduginde. Bir kayit akisinda "geri dondum ve her
sey degismis" hissi, terk etme sebebidir.

⚠️ Ikinci ve daha somut gerekce: **iki ayri duzen iki ayri iskelettir.**
ADR-0038 bunun bedelini ODA sisteminde bir kez odedi — `ModuleHeader` /
`ModuleBody` ile elle yazilan `max-w`'lar iki ayri izgara uretmisti ve oranti
hatasi tam olarak oradan dogmustu. Ayni hatayi auth tarafinda **bilerek**
yapmayiz.

### 1.3 Neden yine de UC KADEME — "hepsi ayni" da yanlis

Iskelet ayni, **panelin isi ayni degil**:

- **Kademe A** kullanicinin **icerideki hayati gormedigi** andir. Panelin isi
  ikna ve karsilamadir; fotograf orada bir maliyet degil, isin kendisidir.
- **Kademe B** kullanicinin **zaten karar vermis** oldugu andir. Isi mekaniktir:
  gelen kutusundan alti hane tasimak. Buyuk bir fotograf burada ikna etmez,
  **geciktirir** — ve ⚠️ bu ekranlar cogunlukla **telefonda** acilir (kod
  e-postadadir), yani panel zaten daralir.
  ⚠️ Somut bedeli de var: sabirsiz bir kullaniciya mobil baglantida **~250 KB
  dekoratif goruntu** indirtmek. §4.2 bunu ayrica engeller.
- **Kademe C** kullanicinin **kimligi kanitlanmis** ama isyerinin henuz
  kurulmamis oldugu andir. Bu iki ekran teknik olarak `(auth)` altindadir ama
  psikolojik olarak **esigin icidir**: kullanici ikna edilmiyor,
  **kuruluyordur**. Panelin isi bu yuzden ikna degil **yer duygusu** vermektir
  — fotograf var, ama sahne farkli (§2).

⚠️ **Kademe B'de "fotograf yok" bir eksiklik degil, panelin SUSMASIDIR.** Panel
kaybolmaz — Mars zemini, ince tanecik, yazili logo ve maskotun kucuk portresi
kalir. Iskelet, ritim ve renk aynidir; degisen sey **sesin yuksekligidir**.

---

## 2. Maskot: hangi ekranda hangi sahne

### 2.1 Karar — sahne, kullanicinin DURUMUNU anlatir

Maskot bir sus degildir; **karakterin bulundugu durum, kullanicinin bulundugu
durumla ayni olmalidir.** Esleme rastgele degil, bu olcutle yapildi:

| Ekran             | Sahne            | Neden                                                                                             |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| `register`        | **M1 — Yol**     | Yeni gelen. Maskot **el salliyor** ve sehre giden isikli yol goruntude: _"yol buradan basliyor"_. |
| `login`           | **M3 — Yuruyus** | Donen kullanici. Yuruyus = sureklilik; sahne **yumusak ve dusuk kontrastli** — §2.2.              |
| `verify-email`    | portre           | Kademe B — sahne yok                                                                              |
| `forgot-password` | portre           | Kademe B — sahne yok                                                                              |
| `reset-password`  | portre           | Kademe B — sahne yok                                                                              |
| `create-tenant`   | **M4 — Yorunge** | Sirketini kuruyor. Yukaridan bakis: _"buradan hepsini gorursun"_.                                 |
| `select-tenant`   | **M2 — Sahne**   | ⚠️ Goruntude **birden fazla podyum** var; kullanici da birden fazla sirket arasindan **seciyor**. |

⚠️ **M2'nin `select-tenant`'a dusmesi bir tesadufun degil, goruntunun ICERIGININ
sonucudur** — merkezdeki podyumda maskot durur, yanlarda bos podyumlar bekler.
Bir "sirket sec" ekraninda bundan daha dogru bir gorsel yok ve elimizde zaten
duruyor.

### 2.2 En cok gorulen ekran, en SAKIN gorseli alir

`login` gunde birden cok kez gorulur; `register` **hayatta bir kez**. Bu asimetri
secimi belirledi: M1'in yuksek doygunluklu gun batimi bir kez **etkileyicidir**,
her sabah **yorucudur**. M3 ayni palettedir ama isigi dagilmis ve kontrasti
dusuktur — ⚠️ **gunluk tekrara dayanikli tek Mars sahnesi odur.**

### 2.3 Kademe B: maskot var, sahne yok — ve bu YENI BIR VARLIK GEREKTIRIR

Kademe B'nin paneli su ucudur: **Mars gradyan zemini + ince tanecik + yazili
logo + maskotun sahnesiz portresi** (saydam zeminli, bas ve govde).

⚠️ **BU VARLIK BUGUN YOKTUR.** Elimizdeki dordu de **sahneli** JPEG'dir. Portre
bir uretim isidir (M3 veya M2'den kesim, saydam PNG/WebP). ⚠️ **Uretilene kadar
Kademe B paneli yalnizca gradyan + logo ile calisir ve bu kabul edilebilir bir
geri dusustur** — bir sahneyi kirpip "portre" diye kullanmak degil, cunku kirpma
arka plandaki Mars zeminini de tasir ve panelin kendi gradyaniyla ust uste biner.

### 2.4 Maskot bir marka ISARETI DEGILDIR — uc sinir

ADR-0038 §7.1 marka sistemini iki varlik olarak tanimlar (K isareti · yazili
logo) ve _"ikisi yan yana kullanilmaz"_ der. Maskot **ucuncu bir varlik degil,
farkli bir SINIFTIR** ve karisiklik olmamasi icin uc sinir yazilir:

1. ⚠️ **Maskot favicon / mobil ikon / daraltilmis koridor OLAMAZ.** Orasi K
   isaretinindir ve kural degismedi. Maskot o boyutta zaten okunmaz.
2. ⚠️ **Maskot yazili logonun YERINE gecmez** — yaninda durur. ADR-0038'in
   _"ad zaten yaziliyken yanina bas harfini koymak"_ yasagi **isaret icindir**;
   maskot adi tekrar etmez, baska bir sey soyler.
3. ⚠️ **Maskot uygulamanin icine giremez** (§7).

---

## 3. Renk: Mars paleti — ve terracotta ile cakismanin COZUMU

### 3.1 Problem, dogru sekliyle

Bugun auth ekranlarinda `--accent` = `--ai-accent` = **terracotta `#b25628`**
(`globals.css:119`). Sol panele Mars turuncusu koyarsak ekranda **iki sicak
turuncu** olur ve ikisi de "vurgu" rolundedir. Bu, gozle cozulebilecek bir
mesafe sorunu degildir — cunku sorun **hue mesafesi degil ROL cakismasidir.**

⚠️ Ve asil bedel auth ekraninda bile degildir: kullanici auth'ta _"turuncu =
marka"_ ogrenir, `/app`'e girer ve orada turuncu _"asistan konusuyor"_ demektir
(FRONTEND §4.8). ⚠️ **Ayni renk iki farkli sey soylerse ikisini de soylemez** —
ODA sisteminin CRM'e terracottayi biraktiran cumlesinin ta kendisi.

### 3.2 Karar — ayrim HUE ILE DEGIL, TERITORYA ILE yapilir

Iki kural, birlikte okunur:

> **(1) Mars paleti YALNIZCA sol panelin icinde yasar.** Bir dugme dolgusu, bir
> baglanti rengi, bir odak halkasi, bir rozet **asla** Mars turuncusu olmaz.
>
> **(2) Auth kapsaminda `--accent` NOTR MUREKKEBE cekilir.** Yani sag paneldeki
> birincil dugme terracotta degil, **neredeyse siyah** (koyu temada neredeyse
> beyaz) olur.

Sonuc olculebilir ve tek cumleyle sinanabilir: ⚠️ **auth ekraninda tam olarak
BIR turuncu bolge vardir — sol panel.** Terracotta ekranda **hic yoktur**.

### 3.3 Neden birincil dugme notr — ve neden bu bir KAYIP DEGIL

_"Dugmeyi Mars turuncusu yapalim"_ reddedildi: dolgulu bir vurgu dugmesi tam
olarak `--accent`'in uygulamadaki isidir; Mars'i oraya koymak, teritorya
kuralini kurdugumuz anda kirmak olurdu.

Notr dolgunun kendi gerekcesi de var ve o daha guclu:
⚠️ **Auth ekraninda yapilacak TAM OLARAK BIR sey vardir.** Birincil eylemin
bulunmak icin renge ihtiyaci yok — **kontrasta** ihtiyaci var. Beyaz formun
ustunde neredeyse siyah bir dugme, elde edilebilecek en yuksek kontrasttir ve
hicbir seyle yarismaz. `Button` bileseninin kendi yorumu bunu zaten yaziyor:
_"kontrast dolgu (§4 'renk degil kontrast')"_.

### 3.4 Mekanizma — ADR-0038'in kendi mekanizmasi, YENI KOD YOK

§4.8'in `[data-module]` deseninin birebir aynisi. Auth layout'u kendi kapsamini
deklare eder:

```tsx
<div data-surface="auth"> … </div>
```

```css
/* apps/web/src/app/auth-surface.css  — YENI DOSYA */
[data-surface='auth'] {
  --accent: #16181b; /* notr murekkep dolgu */
  --accent-fg: #fbfcfd;
  --ink: #16181b; /* accent-renkli metin = duz metin */
  --tint: rgba(20, 23, 27, 0.05);
  --tint-2: rgba(20, 23, 27, 0.08);
  --glow: rgba(20, 23, 27, 0.14); /* odak halkasi da notr */
}
/* koyu tema: dolgu ters cevrilir — --accent acik, --accent-fg koyu */
```

⚠️ **Hicbir bilesen degismez.** `Button` yine `bg-accent` yazar; degeri
farklidir. Bu, `module-colors.css`'in yorumunda **derlenmis CSS'e bakilarak**
dogrulanmis gercegin ayni kullanimidir (`@theme inline` → utility'ler ara
degiskeni atlar).

⚠️ **`module-colors.css`'e DOKUNULMAZ.** O dosya on iki is modulunun SSOT'udur
ve auth bir modul degildir. Ayri dosya, ayri kapsam, ayri gerekce.

### 3.5 Mars token'lari — ve nerede kullanilabilecekleri

`auth-surface.css` icinde, **yalnizca panel bileseninin okudugu** ad uzayi:

| Token          | Deger                       | Ne                                     |
| -------------- | --------------------------- | -------------------------------------- |
| `--mars-deep`  | `#7a2d12`                   | panelin en koyu kenari, vinyet         |
| `--mars-core`  | `#d9491a`                   | gradyan ana ton                        |
| `--mars-glow`  | `#f7a35a`                   | ufuk / isik                            |
| `--mars-haze`  | `#ffd9a8`                   | gunes cekirdegi, en acik               |
| `--mars-ink`   | `#fff6ef`                   | panel uzerindeki metin                 |
| `--mars-ink-2` | `rgba(255, 246, 239, 0.72)` | panel uzerindeki ikincil metin         |
| `--bot-mint`   | `#8ee3b6`                   | maskotun isigi — **yalnizca panelde**  |
| `--bot-lilac`  | `#b9a3e8`                   | maskotun detayi — **yalnizca panelde** |

⚠️ **`--bot-mint` ve `--bot-lilac` uygulamaya giremez** ve bunun ek bir sebebi
var: uygulamada yesil **Finans'in** (`#307d54`), mor **IK'nin** (`#896096`)
imza rengidir. Maskotun renkleri orada modul rengi sanilirdi.

### 3.6 ⚠️ Bu karar §4.8'in YASAK KORIDORUNU deliyor — bilerek ve sinirli

FRONTEND §4.8'in uc secim kuralindan birincisi: _"turuncu bandi yasak —
terracottanin cevresinde ±35° koridor bos, cunku AI'in sesi ondan bir bakista
ayrilmali."_ **Mars turuncusu bu koridorun tam icindedir.**

⚠️ Ihlal **sessizce yapilmaz, yazilir ve sinirlanir.** Gerekce:

> §4.8'in koridor kurali **modul imza renkleri icindir** ve amaci, AI'in sesinin
> modulun renginden ayirt edilmesidir. Auth ekraninda **AI konusmaz** — yedi
> ekranin yedisinde de sifir AI yuzeyi vardir (dosyalar okundu ve dogrulandi:
> ne `--ai-*` token'i, ne Newsreader, ne bir ozet) ve **modul yoktur**. Kuralin
> korudugu sey orada mevcut degildir.

⚠️ Bu bir muafiyet degil bir **kapsam tespitidir** ve tersi de baglayicidir:
**Mars turuncusu `/app` altina girerse koridor kurali derhal ihlal edilmis
olur.** §7.2'nin testi tam olarak bunu bekler.

### 3.7 Panel uzerindeki metnin kontrasti — FOTOGRAFA GORE OLCULEMEZ

⚠️ Bu, bu ADR'nin en kolay atlanacak ve en pahali kalemidir. Bir fotografin
uzerine yazilan metnin kontrasti sabit degildir: her sahne farklidir ve
**fotograf degistigi gun metin sessizce okunmaz olur** — hicbir test, hicbir
lint yakalamaz.

**Kural:** panel metni **her zaman bir scrim uzerindedir**, fotografin ciplak
uzerinde degil.

```css
/* panelin altina oturan koyu gecis */
background: linear-gradient(
  to top,
  rgba(26, 10, 4, 0.86) 0%,
  rgba(26, 10, 4, 0.72) 28%,
  rgba(26, 10, 4, 0.32) 55%,
  transparent 78%
);
```

**Metin blogu panelin ALT %40'indadir** ve orada scrim opakligi ≥ 0.72'dir.
Hesaplanan en kotu durum (dort sahnenin **en acik** pikseli — M1'in gunes
cekirdegi `#fff0d0` — 0.72 scrim altinda `#5a4a3d`'ye duser): `--mars-ink` ile
**~8.5:1**, `--mars-ink-2` ile **~6.1:1**.

### ✅ OLCULDU — tarayicida, gercek piksellerle (2026-08-31)

~~Bu bir HESAPTIR, bir OLCUM DEGIL.~~ Kapandi. Olcum yontemi tahmine yer
birakmiyor: sahne ayni origin'den bir `<canvas>`a alindi, metin kutusunun
ALTINA dusen kaynak piksel araligi `cover` matematigiyle hesaplandi, her
piksele o satirin scrim alfasi kompozitlendi ve **en kotu oran** arandi —
ortalama degil.

| Sahne        | Ekran               | Ornek piksel |   Slogan | Destek satiri |
| ------------ | ------------------- | -----------: | -------: | ------------: |
| `walk`       | login               |       88 506 | **8.30** |          6.77 |
| `path`       | register            |       88 506 | **7.51** |          7.13 |
| `orbit`      | create-tenant       |       88 506 | **8.36** |      **5.86** |
| `stage`      | select-tenant       |       88 506 | **6.16** |          5.96 |
| — (Kademe B) | verify/forgot/reset |     analitik | **9.46** |          6.19 |

⚠️ **En kotu deger 5.86** (orbit'in destek satiri) — WCAG AA'nin 4.5 esiginin
uzerinde, ve bu bir ortalama degil **en kotu tek piksel**.

⚠️ **Kademe B'nin satiri ANALITIKTIR ve bu dogrudur:** orada fotograf yoktur,
zemin bizim yazdigimiz determinist bir gradyandir — yani bu bolumun kendi
gerekcesi (_"fotograf degisirse metin sessizce okunmaz olur"_) orada
GECERSIZDIR. Olculecek bir degisken yok.

⚠️ **Kademe B'nin scrim'i uygulamada HAFIFLETILDI.** Fotograf gucundeki scrim,
altinda fotograf olmayan bir panelde Mars gradyaninin zaten koyu olan alt ucunu
neredeyse SIYAHA indiriyordu; `verify-email`de goruldu. Hafifletmek kontrasti
zayiflatmadi (9.46 / 6.19).

⚠️ **Form tarafi da iki temada olculdu** (tema `localStorage` uzerinden
kurulup sayfa YENIDEN YUKLENEREK — canli attribute degisiminde tarayicinin stil
yeniden hesaplamasi olcumden geride kalip **bayat deger** verdi ve bu bir kez
yanlis tabloya yol acti):

| Olcum                                      |      Acik |      Koyu |
| ------------------------------------------ | --------: | --------: |
| Birincil dugme metni / dolgu               | **17.32** | **16.62** |
| Dolgu / form zemini (oge siniri, esik 3.0) |     16.47 |     17.10 |
| Baslik · alan etiketi / zemin              |     16.47 |     17.10 |
| Yardimci ve ipucu metni / zemin            |      8.27 |      9.81 |

⚠️ **`--accent` olculen degeri:** acik `#16181b`, koyu `#f0f2f3` — yani karar
davranissal olarak dogrulandi: **terracotta auth ekranlarinda `--accent`
DEGILDIR.** `--ai-accent` ise iki temada da kok degerinde kaldi
(`#b25628` / `#e8935a`), yani §2'nin "AI token'lari ezilmez" karari da yerinde.
`--mars-*` degerleri iki temada **birebir ayni** — panelin temaya duyarsiz
oldugu (§Sonuclari) olculdu.

---

## 4. Duyarli davranis — split-screen dar ekranda nasil daralir

### 4.1 Uc kirilma noktasi

| Genislik          | Duzen                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| **≥ 1024px** (lg) | Iki sutun `1fr / 1fr`. Form sutununun **icerigi 380 px'te kapanir** ve kendi sutununda optik olarak ortalanir. |
| **768–1023** (md) | Tek sutun. Panel **ustte ~208 px serit** — ⚠️ **FOTOGRAFSIZ**, Kademe B'nin paneli (asagida).                  |
| **< 768** (sm)    | ⚠️ **Panel TAMAMEN KALKAR.** Form tek basina; yazili logo formun ustune doner (§5.2).                          |

⚠️ **≥ 1536px (2xl)**: form sutunu 380 px'te sabit kalir, **panel buyur**. Aksi
halde 27 inclik bir ekranda 900 px genisliginde bir e-posta alani olusurdu —
bugun `max-w-sm` ile onlenen sey, iki sutunlu duzende **yeniden** onlenmelidir.

> ### ⚠️ md KADEMESI UYGULAMADA DEGISTI — "fotograf kirpilir" TUTMADI
>
> Bu bolum once _"panel ustte kisa bir serit, fotograf kirpilir"_ diyordu ve
> §4.4 ayni anda _"maskotun tamami gorunur"_ diye bir kabul olcutu koyuyordu.
> **Ikisi ayni anda saglanamaz** ve bu, olcunce goruldu: kaynak 1:1 karedir,
> maskot cercevenin ~%40'i kadar yer kaplar; 1024×208'lik bir seritte `cover`
> kirpmasi maskotun basini KESER. Bandi ~420 px yapmak tabletin ekraninin
> neredeyse yarisini yerdi.
>
> **Karar:** md'de panel Kademe B'nin panelidir (gradyan + logo + slogan,
> fotograf yok). Kural boylece basitlesir ve GUCLENIR:
> **maskot gorundugu her yerde tamami gorunur.**
>
> ⚠️ Yan kazanci olculebilir: fotograf artik yalnizca ≥1024'te istenir — yani
> §4.2'nin "mobilde indirilmez" garantisi **tableti de kapsar**. Uc genislikte
> ag kaydiyla dogrulandi: 1200 px'te AVIF **indirildi**, 900 px'te **sifir**
> gorsel, 500 px'te **sifir** gorsel.

### 4.2 ⚠️ Mobilde panel "gizlenmez", HIC INDIRILMEZ

`hidden lg:block` **yanlis cozumdur**: goruntu yine indirilir. Kural:

> Panel gorseli `<picture>` / `next/image`'in `media` sorgusuyla **kosullu
> kaynak** olarak verilir; `< 768px`'te tarayici goruntuyu **hic istemez**.

Bedeli somut: aksi halde her telefon kullanicisi, hic gormeyecegi bir gorsel
icin ~250 KB oder — ve bu tam olarak `verify-email`'e kosan sabirsiz
kullanicidir (§1.3).

### 4.3 Klavye ve yukseklik — `vh` degil `dvh`

- Yukseklik olcusu **`dvh`**; mobil tarayici cubugu acilip kapandiginda duzen
  ziplamaz.
- ⚠️ Viewport yuksekligi **700 px'in altindaysa dikey ortalama BIRAKILIR**
  (`items-start` + ust bosluk). Ortalanmis bir form, klavye acildiginda gonder
  dugmesini **ekranin disina** iter ve kullanici formu bitiremez.
- Tum dokunma hedefleri **≥ 44 px** — ROADMAP'in acik "web'in tam mobil turu"
  kaleminin bu yedi ekrandaki karsiligi. (Kalemin tamami bu ADR'yle kapanmaz.)

### 4.4 Fotograf kirpma — ⚠️ MASKOTUN KAFASI KESILEMEZ

Dort sahne de **1:1 kare**, panel **dikey**. `cover` ile kirpilir ve her sahne
**kendi konumunu tasir**.

⚠️ **Kabul olcutu:** maskotun **tamami** gorunur olmalidir. Bu, "guzel gorunsun"
degil, **basi ya da kolu kesilmis bir maskotun markayi bozmasi** meselesidir.

### ⚠️ DORT KONUMUN DORDU DE UYGULAMADA DEGISTI — ve gozle degil HESAPLA

Ilk yazimda konumlar "maskotun agirlik merkezi" diye goz karariyla verilmisti
(41% / 68% / 70% / 66%). ⚠️ **Dordunde de kirpma vardi** ve olcunce goruldu.

⚠️ **Belirleyen sey EN DAR GENISLIK DEGIL, EN-BOY ORANIDIR** — panel ekranin
yarisi oldugu icin 1440×900'de kaynagin %80'i gorunurken 1024×1100'de yalnizca
**%47'si** gorunur. Yani "uc kirilma noktasinda bak" yetmez; **en dikey** panel
sinav noktasidir.

Yontem: maskotun kaynak goruntudeki yatay araligi **cetvelli bir kaplamayla
OKUNDU**, sonra `cover` penceresi (`L = X·(1−a)`, `R = L + a`, burada
`a = panelGenislik / panelYukseklik`) iki uc en-boy icin cozuldu:

| Sahne   | Maskotun kaynaktaki araligi | Gecerli `X` araligi | Secilen |
| ------- | --------------------------- | ------------------- | ------- |
| `walk`  | 22–60%                      | 25–41%              | **34%** |
| `path`  | 56–90%                      | 81–100%             | **86%** |
| `orbit` | 62–92%                      | 85–100%             | **90%** |
| `stage` | 52–84%                      | 70–97%              | **84%** |

⚠️ Saga yasli uc sahnede pencere sola kaydikca kaybedilen sey **maskot degil
ARKA PLANDIR** (sehir, Dunya, grafikler) — takas bilincli olarak bu yonde
yapildi: sahnenin baglami kirpilabilir, karakter kirpilamaz.

⚠️ **Bilinen sinir, durustce:** garanti **hesaplanan iki uc en-boy arasi** icin
gecerlidir (a ≈ 0.47 – 0.80). Dikey (portre) bir monitorde panel cok daha dar
kalir ve o aralik disina cikilir; orada kirpma yeniden mumkundur. Bu bir
"her kosulda" garantisi **degildir** ve oyle yazilmamalidir.

---

## 5. Uygulama sekli — dosya, kapsam, varlik

### 5.1 Kademeyi sayfa deklare eder, layout HARITA TUTMAZ

ADR-0025 / ADR-0031 / ADR-0038'in ayni disiplini: **platform mekanizmayi
sahiplenir, yuzey kimligini deklare eder.** `(auth)/layout.tsx` icinde
`pathname → kademe` haritasi **tutulmaz** — boyle bir harita sekizinci ekran
geldiginde layout dosyasinin degismesini gerektirirdi ve `data-module`'un
kabuga konmama gerekcesi birebir burada da gecerlidir.

Her sayfa panelini kendisi verir; layout yalnizca izgarayi kurar ve
`data-surface="auth"` kapsamini acar.

### 5.2 Yazili logo nereye gider — ⚠️ mevcut kural GOZDEN GECIRILDI

Bugunku kural (`(auth)/layout.tsx`, PO 2026-08-17): _"Giris ekrani kullanicinin
HENUZ ICERIDE OLMADIGI yuzeydir; markanin kendini tam olarak tanittigi tek yer
burasidir"_ — bu yuzden yazili logo **ortada, kartin ustunde** ve "BUSINESS OS"
alt satiri aciktir.

**Gerekce gecerliligini korur; KONUM degisir.**

| Genislik | Yazili logo nerede                        | Neden                                                                                  |
| -------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| ≥ 1024px | **Sol panelin sol-ustunde**, ortada degil | Panel zaten marka beyanidir; sag panelde tekrar etmek markayi iki kez soylemek olurdu. |
| 768–1023 | Ust seridin icinde                        | Ayni gerekce                                                                           |
| < 768px  | **Formun ustune DONER**, ortalanmis       | Panel yok; logo o genislikte **tek marka tasiyicisidir**                               |

⚠️ **"BUSINESS OS" alt satiri her ucunde de acik kalir** — kullanici hala iceride
degildir, kuralin kendisi degismedi.

⚠️ **Maskot logonun yerini ALMAZ.** _"Maskot zaten o isi goruyor mu"_ sorusunun
cevabi **hayirdir**: maskot markanin **karakteridir**, **adi degildir**. Bir
kullanici maskotu gorup urunun adini ogrenemez — ve giris ekrani, adin
ogrenildigi tek yerdir.

⚠️ **K isareti auth ekranlarinda yine KULLANILMAZ** (ADR-0038 §7.2). Degismedi.

### 5.3 Varlik butcesi ve format

| Kural            | Deger                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| Format           | AVIF (WebP geri dusus) — `next/image`; `sharp` derlemeye zaten izinli |
| Butce            | **≤ 120 KB** / sahne, 1600 px genislikte                              |
| Yer tutucu       | `blurDataURL` — panel bos beyaz yanip sonmez                          |
| Oncelik          | `priority` **yalnizca** `login` ve `register`'da (LCP orada)          |
| Alternatif metin | `alt=""` + `aria-hidden` — gorsel **dekoratiftir**                    |

⚠️ **Slogan ASLA gorsele gomulmez.** Gercek DOM metnidir: ekran okuyucu okur,
tarayici cevirir, kopyalanabilir — ve degistirmek icin bir goruntu duzenleyici
gerekmez. §7.2'nin ucuncu testi bunu kilitler.

⚠️ **Slogan Inter'dir, Newsreader DEGIL** ve en fazla iki satirdir (§7.1).

### 5.4 Varlik adlandirma

WhatsApp dosya adlari (bosluk, parantez, tarih) kalici varlik adi olamaz.
`apps/web/public/brand/` altina, sahnenin **ne anlattigi** ile adlandirilir:

```
mascot-scene-path.avif     (M1 — register)
mascot-scene-walk.avif     (M3 — login)
mascot-scene-orbit.avif    (M4 — create-tenant)
mascot-scene-stage.avif    (M2 — select-tenant)
mascot-portrait.webp       (⚠️ HENUZ URETILMEDI — §2.3)
```

⚠️ Ad, **kullanildigi ekranla degil sahnenin icerigiyle** verilir: yarin `login`
baska bir sahneye gecerse `mascot-login.avif` adinda ama yuruyus gosteren bir
dosya kalirdi ve yanlis ad **sessizce** yasardi.

### 5.5 Kaynak dosyalar repoya girer mi

⚠️ Bugun `logo ve fotograflar/` **git'te izlenmiyor** (`git status` onu `??`
olarak gosteriyor) ve icinde **1 MB'lik bir video** var. Karar: uretilmis
AVIF/WebP ciktilari `apps/web/public/brand/` altina **girer**; ham JPEG'ler ve
video **girmez**. Video hicbir auth ekraninda kullanilmaz (§6.4).

---

## 6. Sosyal giris — Google · Microsoft · Apple

### 6.1 ⚠️ TASARLANIR, AMA BUGUN RENDER EDILMEZ

**Backend'de OAuth YOKTUR.** ROADMAP §6 onu **Faz 8** olarak tanimlar ve
_"bagimsiz kalem"_ der; bugun ne bir saglayici kaydi, ne bir callback ucu, ne
`Credential` tarafinda federe bir yol vardir.

> **Karar:** dugmelerin yeri, sirasi, etiketi ve bicimi **bu ADR'de tanimlanir**;
> Faz 8'in backend'i gelene kadar **render edilmez.**

⚠️ Gerekce projenin kendi kaydidir. Faz 2 boyunca `POST /api/v1/tenants` her
istege **503** dondu ve o kayit CLAUDE.md'de bilerek duruyor: _"bir ozelligin
'kapali oldugunu soylemesi' sessizce yanlis calismasindan iyidir."_ Tiklandiginda
hicbir sey yapmayan ya da "yakinda" diyen uc dugme, bunun **giris ekranindaki
karsiligi** olurdu — ve giris ekrani, guvenin kuruldugu ekrandir.

⚠️ **Yer de AYRILMAZ:** bos bir alan birakip "buraya gelecek" demek ayni seyin
daha sessiz halidir. Dugmeler geldigi gun form asagi kayar; bu bir kerelik ve
kabul edilebilir bir gorsel degisikliktir.

### 6.2 Geldiginde: sira, yer, bicim

| Karar    | Deger                                                                           |
| -------- | ------------------------------------------------------------------------------- |
| Ekranlar | **Yalnizca `login` ve `register`.** Digerlerinde anlamsizdir.                   |
| Yer      | ⚠️ **E-posta formunun ALTINDA**, "veya" ayraciyla — ustunde degil               |
| Sira     | **Google · Microsoft · Apple**                                                  |
| Bicim    | Her saglayicinin **kendi marka kilavuzu**; bizim tasarim sistemimize uydurulmaz |

⚠️ **Neden altta:** uc yabanci markali dugme, ekranin **bize ait olmayan** tek
parcasidir ve tasarim sistemimize uydurulamaz (saglayici kilavuzlari buna izin
vermez). Uste konursa ekranin ilk gorunen seyi uc baska sirketin logosu olur.
Ayrica **bugun calisan yol e-postadir** ve birincil yol gorsel olarak da
birincil olmalidir.

⚠️ **Sira gerekcelidir:** Google Turkiye'deki KOBI'lerde en yaygin hesap;
Microsoft ikinci, cunku Microsoft 365 kullanan sirket sayisi yuksek; Apple
ucuncu ve §6.3'un esigi yuzunden en gec gelecek olan.

### 6.3 ⚠️ Faz 8'e devredilen ve BUGUNDEN GORULEN uc kisit

1. ⚠️ **Apple'in "Hide My Email"i** `...@privaterelay.appleid.com` bicimli bir
   adres uretir. Bizim modelimizde `User.email` **kimligin capasidir** ve
   `EmailPort` oraya dogrulama/sifirlama postasi atar. Rolelenmis adres calisir,
   ama kullanici Apple tarafindaki iliskiyi iptal ederse **adres oluir** — Faz 8
   bunu cozmeden Apple acilamaz.
2. ⚠️ **Apple Developer Program uyeligi ucretli bir ON KOSULDUR.** Google ve
   Microsoft'ta boyle bir esik yoktur — yani uc saglayici **ayni anda hazir
   olmayabilir** ve tasarim **ikisi acik, biri kapaliyken de** ayakta durmalidir
   (dugme sayisi 2 veya 3 olabilir).
3. ⚠️ **Federe kullanicinin parolasi yoktur.** `Credential`'in `User`'dan ayri
   tutulmasi (AUTH §5.3) tam olarak bunun icin yapildi — ama `forgot-password`
   ve `/me/change-password` o kullanici icin **anlamsizdir** ve ekranlar bugun
   bunu bilmiyor. Faz 8 geldiginde bu iki ekranin metni yeniden okunmalidir.

### 6.4 Video kullanilmaz

`logo ve fotograflar/` altindaki 1 MB'lik mp4 **hicbir auth ekraninda
kullanilmaz**: giris ekrani bir **islemdir**, bir gosteri degil. Yeri landing
page'dir (kapsam disi). Izin verilen tek hareket, formun mevcut `--ease-rise`
girisidir ve `prefers-reduced-motion: reduce` onu **tamamen kapatir** — bu bir
tercih degil erisilebilirlik geregidir (FRONTEND §4.6).

---

## 7. ⚠️ IKI TASARIM DILI ARASINDAKI SINIR — ve nasil kilitlenir

### 7.1 Sinirin kendisi

|                    | **Auth + landing**        | **Uygulama (`/app`)**      |
| ------------------ | ------------------------- | -------------------------- |
| Zemin              | Mars gradyani, fotografik | Notr `#f6f6f7` / `#16181b` |
| Karakter           | **Maskot**                | **Yok**                    |
| Vurgu (`--accent`) | Notr murekkep             | Modul rengi (on iki renk)  |
| AI'in sesi         | **Yok** — AI konusmaz     | Terracotta + Newsreader    |
| Ses tonu           | Sicak, karsilayici        | Sessiz, olculu             |

⚠️ **Panel metni Inter'dir, Newsreader DEGIL.** Newsreader = AI'in sesi
(FRONTEND §4.5) ve maskot **AI degildir**, markanin karakteridir. Bu ayrim
tartismalidir ve gizlenmiyor: maskot bir **robottur** ve bir gun birinin onu
uygulama icinde konusturmak istemesi kacinilmazdir. O gun karar **yeniden**
verilir, ve sartlari bugunden yazili:

> Maskot uygulamaya girerse **AI'in kurallarini alir** (Newsreader + `--ai-*`
> token'lari) ve **Mars paletini birakir.** Karakter siniri gecebilir, palet
> gecemez.

### 7.2 ⚠️ Sinir TESTLE kilitlenir — cunku yazili sinirlar sizar

Uc test, uc ayri sizinti yolunu kapatir:

1. **Kapsam testi:** `(auth)` layout kokunun `data-surface="auth"` tasidigini
   dogrular. ⚠️ Unutulursa hata **sessizdir** — ekran calisir, yalnizca
   terracotta geri gelir; ne lint ne tip denetimi yakalar. (`data-module`'un
   bilinen sinirinin aynisi, FRONTEND §4.8.)
2. ⚠️ **Sizinti testi:** `apps/web/src/app/app/**` altinda **hicbir dosyanin**
   `mascot-` varligini ya da bir `--mars-*` / `--bot-*` token'ini kullanmadigini
   dogrular. Bu, `brand-assets.spec.ts`'in **dosya okuyan** deseninin ayni
   kullanimidir — bir sinir, tekrarlanabilir degilse yalnizca o gunun
   fotografidir (ADR-0043 Slice 1b'nin ayni cumlesi).
3. **Metin testi:** yedi ekranin yedisinde de sloganin **DOM metni** olarak
   bulundugunu dogrular; gorsele gomulmedigini kanitlar (§5.3).

### 7.3 ADR-0036 esik kontrolu — **bakildi, uygulanmiyor**

CLAUDE.md'nin kalici kurali her yeni modul ADR'sinin ADR-0036/0042 esik
kontrolunu tasimasini ister. ⚠️ **Bu bir is modulu ADR'si degildir** (ADR-0038
gibi): sema acmaz, uc eklemez, `RetrievalContributor` yazmaz. Yapisal kaynak
**8'de**, fan-out **18'de** kalir; T2 durumu **degismez**.

Kural _"cevap hayir olsa bile madde yazilir"_ dedigi icin bu madde yazildi —
_"eklemedik"_ degil, **"bakildi ve yoktu"**.

---

## Sonuclari

**Olumlu**

- Kullanicinin urunle ilk temasi noter bir formdan cikar; marka **ilk saniyede**
  konusur ve konusan sey bir slogan degil, bir **karakterdir**.
- Zincir boyunca (register → verify → login → create-tenant) **tek bir iskelet**
  vardir; hicbir adimda "baska bir siteye dustum" hissi olusmaz.
- ⚠️ Terracotta auth ekranlarindan **tamamen cikar** — yani `/app`'e girildiginde
  terracotta **ilk kez** goruldugu anda tek bir sey soyler: _"asistan
  konusuyor."_ Sinyal auth tarafindan **seyreltilmez**; ODA sisteminin kendi
  kurali guclenir.
- Mekanizma **yeni kod degildir**: `[data-surface]` kapsami `[data-module]`'un
  ayni deseni, ayni derleyici gercegi. Hicbir bilesen degismez.
- Mobilde panel **indirilmez** — sabirsiz kullanici bedel odemez.
- Sinir uc testle kilitlenir; "iki dil karismayacak" bir niyet degil bir
  **kabul olcutu** olur.

**Olumsuz / bedeli**

- ⚠️ **Dort sahne uretilecek + bir portre HENUZ YOK.** `mascot-portrait` bugun
  mevcut degildir ve uretilene kadar Kademe B'nin paneli gradyan + logo ile
  calisir (§2.3). Bu bir eksiktir ve gizlenmiyor.
- ⚠️ **Sosyal giris dugmeleri bugun EKRANDA OLMAYACAK.** Product Owner uc
  saglayici belirtti; karar onlari **tasarliyor ama ertelemektedir**. Bedeli
  acik: kullanici bugun yalnizca e-posta ile girer.
- ~~⚠️ **Panel metninin kontrasti HESAPLANDI, OLCULMEDI.**~~ ✅ **KAPANDI
  (2026-08-31)** — dort sahne de tarayicida gercek piksellerle, form tarafi iki
  temada olculdu; en kotu deger **5.86**. Tablo §3.7'de.
- ⚠️ **Fotograflar tema degistirmez.** Koyu temada da ayni Mars sahneleri
  gorunur; yalnizca **sag panel** temayi izler. Alternatif (her sahnenin koyu
  varyanti) varlik sayisini ikiye katlar ve ADR-0038'in _"ayni paletin uc
  kopyasi sapmaya aciktir"_ uyarisinin dort katini uretirdi. ⚠️ Acik temada
  panelin sicak kenari ile neredeyse beyaz form arasinda bir **dikis** olusur;
  1 px `--border` ayraci ve panelin ic vinyeti bunu yumusatir ama **yok etmez**.
- ⚠️ **`--accent`'in kok degeri ILK KEZ bir modul olmayan sey tarafindan
  eziliyor.** Mekanizma ayni ama kavram genisliyor: bugune kadar `--accent`'i
  yalnizca **modul** ezerdi. Yarin baska bir yuzey de isteyebilir ve o gun
  _"kim ezebilir"_ sorusunun bir cevabi gerekir.
- ⚠️ **Bu ADR yedi ekranin METNINI degistirmez.** Basliklar, hata mesajlari ve
  yardim metinleri bugunku halleriyle kalir; yalnizca **slogan** yeni bir
  metindir. Bir "metin turu" isi ayrica gerekebilir ve bu ADR onu kapsamiyor.
- ⚠️ **Playwright e2e hala yok** (ROADMAP'in acik borcu). Bu ADR uc yeni kirilma
  noktasi ve uc yeni gorsel durum getiriyor; dogrulama yine **elle, gercek
  tarayicida** yapilacaktir.

---

## Degerlendirilen alternatifler

| Alternatif                                                         | Neden secilmedi                                                                                                                                                   |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Yalnizca `login`/`register` split, kalan bes ekran mevcut kart** | Zincirin ortasinda duzen degisirdi — kullanici "baska siteye dustum" hissi yasardi; ayrica iki ayri iskelet, ADR-0038'in ODA oncesi oranti hatasinin tam kaynagi. |
| **Yedi ekranda da ayni fotograf**                                  | Sahne kullanicinin durumunu anlatmali (§2.1). Tek fotograf, `select-tenant`'ta "sec" fikrini ve `register`'da "basla" fikrini ayni anda **soyleyemez**.           |
| **Her ekranda farkli fotograf (Kademe B dahil)**                   | Akis ekranlarinda her adimda yeni sahne bir **slayt gosterisine** doner; ayrica mobilde ~250 KB'lik dekoratif indirme.                                            |
| **Birincil dugme Mars turuncusu**                                  | Teritorya kuralini kurdugu anda kirardi; dolgulu vurgu dugmesi tam olarak `--accent`'in uygulamadaki isidir ve terracotta ile **rol** cakismasi yeniden dogardi.  |
| **Terracottayi auth'ta birakip Mars'i yalnizca fotografa vermek**  | Ekranda iki sicak turuncu kalirdi; kullanici auth'ta "turuncu = marka" ogrenip `/app`'te "turuncu = asistan" ile karsilasirdi — ayni renk iki sey soyleyemez.     |
| **Maskotu yazili logonun yerine koymak**                           | Maskot markanin **karakteridir, adi degildir**. Giris ekrani adin ogrenildigi tek yerdir (ADR-0038 §7.2'nin kendi gerekcesi).                                     |
| **Maskotu favicon / koridor ikonu yapmak**                         | O boyutta okunmaz ve K isaretinin isini calar (ADR-0038 §7.2). Iki isaret ayni isi yaparsa ikisi de zayiflar.                                                     |
| **Video panelde otomatik oynasin**                                 | 1 MB, giris ekraninda; `prefers-reduced-motion` ile catisir; ve giris bir **islemdir**, gosteri degil. Yeri landing page.                                         |
| **Sosyal dugmeleri simdi cizip "yakinda" demek**                   | Faz 2'nin `503` kaydinin tersi: calismayan bir sey **calisiyormus gibi** durur. Giris ekrani guvenin kuruldugu ekrandir.                                          |
| **Sosyal dugmeler e-posta formunun USTUNDE**                       | Ekranin ilk gorunen seyi uc baska sirketin logosu olurdu; ayrica bugun calisan birincil yol e-postadir.                                                           |
| **`hidden lg:block` ile mobilde paneli gizlemek**                  | Goruntu yine **indirilirdi**. Gizlemek ile indirmemek ayni sey degildir.                                                                                          |
| **Auth kapsamini `module-colors.css`'e eklemek**                   | O dosya on iki **is modulunun** SSOT'udur; auth bir modul degildir. Karistirmak, on ucuncu modul geldiginde yanlis dosyada aranmasina yol acardi.                 |
| **Her sahnenin koyu tema varyantini uretmek**                      | Varlik sayisi ikiye katlanir ve senkron kalmasi gereken ikinci bir kopya dogar — ADR-0038'in "ayni paletin uc kopyasi sapmaya aciktir" uyarisi.                   |

---

## Bu karar ne zaman yeniden gozden gecirilir?

1. ⚠️ **Faz 8 (OAuth) geldiginde** — §6.1'in render kararini kaldirir; dugmeler
   eklenir ve §6.3'un uc kisiti orada cozulur.
2. **Landing page ADR'si yazildiginda** — bu ADR'nin Mars paleti ve maskot
   esleme kurallari landing icin **girdidir**; landing farkli bir sey isterse
   ikisi **birlikte** revize edilir (iki yuzey ayni dili konusur).
3. ⚠️ **Maskot uygulama icine girmek istendiginde** — §7.1'in sartlari
   (Newsreader + `--ai-*`, Mars paleti birakilir) yeniden tartisilir. Bu, en
   olasi ve en sessiz sapma yoludur.
4. **Panel kontrasti tarayicida olculdugunde** — §3.7'nin hesabi olcumle
   celisirse token degerleri guncellenir (ADR-0038'in `#B85C2B` duzeltmesi
   gibi).
5. ⚠️ **`--accent`'i modul olmayan ucuncu bir yuzey ezmek istediginde** —
   _"kim ezebilir"_ sorusu o gun cevaplanir; bugun cevap **"modul + auth"**tur
   ve ikisi de yazilidir.

---

## Product Owner onayi gereken kalemler

| #     | Kalem                                                                                                                                                 | Neden onay gerekiyor                                                                                            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **A** | ⚠️ **Terracotta auth ekranlarindan tamamen cikiyor**; birincil dugme **notr murekkep** oluyor (§3.2–3.3).                                             | Marka renginin en cok gorulen kimliksiz yuzeyden kaldirilmasi bir gorsel tercih degil, bir **anlam** kararidir. |
| **B** | ⚠️ **Mars turuncusu §4.8'in ±35° yasak koridorunun icindedir** ve bilerek deliniyor — sinirli olarak, yalnizca sol panelde (§3.6).                    | Yazili bir platform kuralindan **kapsam tespitiyle** cikiliyor; sessizce yapilmamalidir.                        |
| **C** | ⚠️ **Sosyal giris dugmeleri BUGUN RENDER EDILMEYECEK** (§6.1) — Faz 8 gelene kadar ekranda gorunmezler.                                               | PO uc saglayici belirtti; karar onlari tasarlayip **erteliyor**. Bedeli acik ve kabul edilmelidir.              |
| **D** | **Yazili logo ortadan sol panele tasiniyor**; mobilde formun ustune donuyor (§5.2). "BUSINESS OS" alt satiri korunuyor, K isareti yine kullanilmiyor. | 2026-08-17 tarihli PO kuralinin **konumu** degisiyor; gerekcesi degismiyor.                                     |

---

## Kapsam disi

- ⚠️ **Landing page'in kendisi** — icerik, fiyatlandirma, KVKK/gizlilik metni,
  apex alan adi (`kobiwise.com`), `/`'in 307 yonlendirmesinin kaldirilmasi.
  **Ayri bir ADR.** Bu ADR yalnizca o sayfanin **gorsel dilini** hazirlar.
- **E-posta sablonlarinin tasarimi** — maskotun dogal ikinci tuketicisidir ve
  bugun sade metindir; ayri bir is.
- **`/app` altindaki hicbir sey** (§7).
- **OAuth'un kendisi** — Faz 8 (§6).
- **Yedi ekranin metin turu** (basliklar, hata mesajlari) — yalnizca slogan yeni.
- **Playwright e2e** — ROADMAP'in acik borcu; bu is onu kapatmaz.
