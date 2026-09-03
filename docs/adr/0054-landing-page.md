# 0054 — Landing page: onaylanmis prototipin uretim koduna donusmesi

- **Durum:** ✅ **KABUL EDILDI ve UYGULANDI** (alti PO kalemi onaylandi, 2026-09-03)
- **Tarih:** 2026-09-03
- **Karar veren:** Product Owner
- **Faz:** 9 (Landing Page + Marka Kimligi)

> ### ⚠️ ONCE SINIR: BU ADR UYGULAMANIN VE AUTH'UN ICINE HIC DOKUNMAZ
>
> Bu karar **yalnizca bes kimliksiz pazarlama sayfasini** kapsar (`/` ·
> `/moduller` · `/sorular` · `/hakkinda` · `/blog`).
>
> ⚠️ **ODA sistemi (ADR-0038) tek satir degismedi:** `module-colors.css`in on
> iki rengi, `globals.css`in kok token'lari, `app-shell.tsx`, `RoomTop`/`Wall`/
> `Desk` iskeleti, AI'in terracotta sesi — **hicbiri**. `/app` altinda **hicbir
> dosya acilmadi** ve bir test bunu kilitliyor.
>
> ⚠️ **Auth yuzeyi (ADR-0052) de tek satir degismedi:** `auth-surface.css`,
> `auth-screen.tsx`, `auth-panels.ts`, yedi ekranin hicbiri. §7'de kaydedilen
> bir ayrisma (`--bot-mint`) bilerek **kapatilmadi** — kapatmak auth'a
> dokunmayi gerektirirdi ve Mutlak Kural 1 bunu yasaklar.

---

## Baglam

### Ne vardi, ne yoktu

ROADMAP §7'nin (Faz 9) kapi kosulu **karsilanmisti**: domain (`kobiwise.com`)
alinmis, marka (yazili logo + K isareti) tamamlanmisti. Web prod'da canliydi
(`app.kobiwise.com`), yedi auth ekrani ADR-0052 ile yeniden tasarlanmis ve
Google ile giris (ADR-0053) prod'da dogrulanmisti.

⚠️ **Eksik olan tek sey urunun kendisini anlatan sayfaydi.** Kok rota
2026-08-27'den beri **307 ile `/login`e** gidiyordu ve o yonlendirme bir
guvenlik duzeltmesiydi: `/` Faz 1'den beri bir altyapi saglik karti ciziyordu
— servis adi, surum, **ortam**, **uptime**, **veritabani gecikmesi** — ve
`middleware.ts`in kapsami disinda oldugu icin **kimliksiz herkese acikti**.

⚠️ Ve prod'da artik **gercek kullanici vardi**: 2026-09-01 olcumunde
`platform.users` = 3, `platform.tenants` = 2. Yani _"kimse gormuyor"_ onculu
dusmustu.

### Onaylanmis tasarim nereden geldi

Product Owner bes sayfalik bir **statik prototipi** onayladi
(`~/Desktop/kobiwise-v2/`, "Viza tarzi"): paylasilan bir CSS/JS sistemi, dort
alt sayfa ve bir ana sayfa. Prototip bir **tasarim** artefaktiydi, kalici
degildi.

⚠️ Prototipin kendi yorumlari bir tercih degil **olcum** kaydidir ve bu ADR'nin
uygulamasinda **korundu**. En degerlisi: `.oda .nokta` bir `<span>`di, yani
SATIR ICIydi — `width`/`height` satir ici ogede **uygulanmaz** ve on iki
modulun imza rengi ekranda **hic gorunmuyordu**. Hata sessizdi: kart calisiyor,
lint susuyor, hicbir test kirmizi yanmiyor.

---

## Karar

**Onaylanmis prototip, `apps/web` icinde `(landing)` rota grubuna, uc yuzeyli
token sisteminin UCUNCU kapsami olarak tasindi: `[data-surface='landing']`.
Bes sayfanin besi de Server Component'tir; gorsel tasarim yeniden
yorumlanmadan, olculen degerleriyle birlikte tasindi. Kok rotanin `/login`
yonlendirmesi KALKTI.**

Yedi karar, sirayla.

---

## 1. Ucuncu yuzey — ve neden ucuncu bir DOSYA

Projede artik uc tasarim dili var ve **ucu de ayni mekanizmayi** kullanir
(kapsam attribute'u + token override; bilesen degismez):

| Yuzey       | Kapsam                     | Dil                             | Dosya                 |
| ----------- | -------------------------- | ------------------------------- | --------------------- |
| **app**     | `[data-module='…']`        | ODA — soguk-notr, sessiz        | `module-colors.css`   |
| **auth**    | `[data-surface='auth']`    | Mars — sicak, maskotlu          | `auth-surface.css`    |
| **landing** | `[data-surface='landing']` | ⚠️ **YENI** — beyaz, kontrastli | `landing-surface.css` |

Ucunu tek dosyada toplamak **reddedildi** ve gerekce ADR-0052'nin auth icin
yazdiginin aynisidir: `module-colors.css` on iki **is modulunun** SSOT'udur ve
landing bir modul degildir (semasi, izni, rotasi, katkicisi yok). Ayni dosyaya
koymak on ucuncu modul geldiginde paletin **yanlis yerde aranmasina** yol
acardi.

⚠️ **Mekanizmanin ucuncu kez tekrar etmesi bir tesadufi degil, bir kanittir:**
ADR-0038 mekanizmayi kurdu, ADR-0052 onu ikinci bir yuzeye tasidi ve **hicbir
bilesen degismedi**; burada ucuncu kez ayni sey oldu. `landing-surface.css`
`--accent`i landing murekkebine (`#131313`) ceker ve `globals.css`in
`:focus-visible { outline: 2px solid var(--accent) }` kurali **tek satir
yazmadan** dogru renge gelir.

⚠️ Ezilmeseydi hata SESSIZ olurdu: beyaz sayfanin ustunde terracotta bir odak
halkasi kalirdi — ekran calisir, kimse fark etmez.

---

## 2. Kok rota: yonlendirme KALKTI, sizinti iddiasi KALMADI

`/` artik landing page'dir. `src/app/page.tsx` ve `page.spec.tsx` **silindi**.

⚠️ **2026-08-27'nin 307 karari bugun karsiligini verdi.** O gun
`permanentRedirect` (308) yazilabilirdi ve daha "dogru" gorunurdu; reddedilmis
ve gerekcesi yazilmisti:

> _"308'i tarayicilar KALICI olarak onbellege alir ve landing page yayina
> alindigi gun daha once siteye girmis her tarayici **hala `/login`e giderdi**
> — hata SESSIZ olurdu: sunucu dogru sayfayi sunar, istemci onu hic istemez."_

Bugun tam olarak o gun geldi ve **hicbir tarayicinin onbellegini temizlemesi
gerekmiyor**.

⚠️ **Eski test silinmedi, IKIYE BOLUNDU.** `page.spec.tsx` iki sey iddia
ediyordu: (a) kok rota `/login`e yonlendirir, (b) **saglik verisi cizmez**.
(a) dustu; **(b) DURUYOR** ve `landing.spec.tsx`e tasindi
(`uptimeSeconds|latencyMs|dependencies|fetchHealth` aranir). Ikisini birlikte
silmek, guvenlik duzeltmesinin kilidini de kaldirirdi.

⚠️ **Kimlik kontrolu YOK ve bu dogru:** oturumu acik bir kullanici da landing'i
gorur. `bo_session_hint`e bakip `/app`e dallanmak mumkundur ama o cerez bir
guvenlik siniri **degildir** (FRONTEND §3.2) ve daha onemlisi bir pazarlama
sayfasinin musteriye kapanmasi icin sebep yok.

---

## 3. ⚠️ NONCE BAGIMLILIGI — LANDING BUGUN **DINAMIK**, VE BU AYRI BIR ISTIR

⚠️ **Bu, bu ADR'nin en kolay atlanacak ve en pahali kalemidir.**

FRONTEND §3.1 pazarlama sayfalarini acikca siniflandirir:
**"Pazarlama / public → Server Component (statik)"**. Bes sayfanin besi de
Server Component'tir — ama **statik DEGILDIR**, ve sebebi landing'in kendisiyle
hic ilgili degildir.

### Zincir, adim adim

1. ADR-0053 EK-2 **nonce tabanli bir CSP** kurdu (`script-src 'self'
'nonce-…'`, `'unsafe-inline'` **YOK**). Nonce'un butun degeri budur:
   `'unsafe-inline'`siz bir `script-src`, XSS'e karsi asil korumayi veren
   satirdir.
2. Nonce **istek basina** uretilir (`middleware.ts`). Sabit bir nonce, nonce
   olmamakla ayni seydir.
3. Kok layout (`src/app/layout.tsx`) o nonce'u `headers()` ile okur — cunku
   tema script'i `dangerouslySetInnerHTML` ile **elle** yazilmistir ve Next
   kendi uretmedigi bir etikete nonce **dagitmaz**.
4. ⚠️ **`headers()` okumak sayfayi DINAMIK yapar.** Bu Next'in bir kurali
   degil bir zorunluluktur: istek basina degisen bir deger okuyan bir sayfa,
   derleme aninda uretilemez.
5. Kok layout **her rotanin** ustundedir → landing de dinamiktir.

### Neden bugun cozulmedi

⚠️ Cozum kok layout'u degistirmeyi gerektirir: tema script'ini (ve dolayisiyla
nonce okumasini) `/app` ve `(auth)` layout'larina **indirmek**. Bu, ADR-0053
EK-2'nin **prod'da dogrulanmis** nonce zincirine dokunmak demektir ve o zincir
zaten **iki gercek kusurla** kurulmustu:

- kok layout'un tema script'ine nonce **yazmamasi**,
- `middleware.ts`in nonce'u `authGate` dalina **hic tasimamasi**.

⚠️ Ikisi de yalnizca **gercek tarayicida sunulan HTML olculerek** bulundu; ne
lint, ne tip denetimi, ne `pnpm verify` gordu — ucu de tarayiciyi hic
calistirmaz. Ayni zincire pazarlama sayfasi ugruna dokunmak, **yedi auth
ekraninda ve `/app`te sessiz bir tema parlamasi** riskini geri getirirdi.

### ⚠️ Bugunku bedel ve gelecekteki is

|                       | Durum                                                                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bugunku bedel         | Her ziyaret Vercel'de **sunucu tarafi render** tetikler. Sayfalar veri cekmez (bir test `fetch` olmadigini kilitler), yani render **saf metin uretimidir**; olculen risk performans degil **maliyet ve CDN onbellegi kaybidir**. |
| ⚠️ **Gelecekteki is** | **Tema script'ini kok layout'tan indirmek** → landing statiklesir. Kendi slice'i, kendi dogrulamasi (`Report-Only` → gercek tarayicida sifir ihlal → zorlayici) ve muhtemelen **ADR-0053'e bir EK** gerektirir.                  |

⚠️ **Kayit bu yuzden buraya yazildi:** yarin biri FRONTEND §3.1'i okuyup
_"pazarlama sayfasi statik olmali, neden degil"_ diye sorarsa cevap bir
unutkanlik degil **olculmus bir oncelik siralamasi** olarak burada durur.
`middleware.ts` ve `layout.tsx`in kendi yorumlari bu tartismayi zaten
ongormustu (_"Faz 9'un landing page'i geldiginde bu YENIDEN TARTILMALIDIR"_) —
⚠️ tartisildi, **ertelendi**, ve erteleme bir karar olarak kaydedildi.

---

## 4. Font: `next/font` bir uslup tercihi DEGIL, CSP'nin ZORUNLU KILDIGI sey

Prototip Google Fonts'a bir `<link>` atiyordu. ⚠️ **O satir uretimde sessizce
engellenirdi:** ADR-0053 EK-2'nin CSP'si `style-src 'self' 'unsafe-inline'`
yazar ve `fonts.googleapis.com` orada **yoktur**. Sayfa acilir, yalnizca
fallback fontla cizilir — ve sebebi hicbir yerde yazmaz.

`Plus Jakarta Sans` bu yuzden `next/font/google` ile **kendi origin'imizden**
servis edilir.

⚠️ **Font kok layout'a DEGIL, landing layout'una yuklenir.** `next/font`
yuklendigi layout'un altindaki rotalar icin font dosyalarini **preload eder**;
kok layout'a yazilsaydi `/app`in on iki odasi ve yedi auth ekrani da **hic
kullanmadiklari** bir fontu indirirdi. Hata sessiz olurdu: hicbir sey bozulmaz,
her sayfa yalnizca daha yavas acilir.

⚠️ `weight` yazilmaz: Plus Jakarta Sans **degisken** bir fonttur ve agirlik
belirtilmediginde tek bir dosya iner. Tasarim 300–700 bandinin tamamini
kullanir (rakamlar 300, govde 400, baslik 500, alt baslik 600); agirliklari tek
tek saymak **bes ayri dosya** indirmek olurdu.

⚠️ `italic` **istenmez** — ve bu, kok layout'un Inter icin verdigi kararin
tersidir. Orada auth panelinin slogani gercekten italiktir; burada italik
kullanan tek oge `.hero h1 i`dir ve o `font-style: normal` ile **ezilir**:
`<i>` orada bir kesim degil, **sonuk kelime** icin bir kancadir.

---

## 5. Varliklar: ADR-0052 §5.5 GENISLETILMEDI, UYGULANDI

Kural aynen gecerlidir: **uretilmis ciktilar repoya girer, ham kaynak girmez.**

| Varlik                                             | Karar                                                                                                                                                                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mascot-scene-{path,walk,orbit,stage}.{avif,webp}` | ⚠️ **YENIDEN URETILMEDI** — prototipin WebP'leri `public/brand/` altindakilerle **bayt bayt aynıydı** (olculdu). Ikinci bir kopya, ayni gorselin iki ayri butceye ve iki ayri onbellege dusmesi demekti; auth'ta sahne degistigi gun landing eskisini gostermeye devam ederdi. |
| `wordmark.webp` (29 KB)                            | ✅ girdi — markanin gercek cizilmis yazili logosu                                                                                                                                                                                                                              |
| `mascot-wave.webp` (32 KB)                         | ✅ girdi — maskot kutusunun duragan karesi                                                                                                                                                                                                                                     |
| `mascot-loop-{1x,2x}.webm` (330 / 585 KB)          | ✅ girdi — **uretilmis** ciktilar                                                                                                                                                                                                                                              |
| `mascot-loop.web.mp4` (1 MB)                       | ❌ **girmedi** — ham kaynak                                                                                                                                                                                                                                                    |
| `bot-bak.webp` · `bot-dur.webp`                    | ❌ girmedi — yalnizca prototipin **arsiv** sayfalarinda kullaniliyordu                                                                                                                                                                                                         |

⚠️ **Video sayfa acilisinda TEK BAYT indirmez.** `preload="none"` ve kaynak
(`src`) **yalnizca imlec kutuya girince** atanir; varsayilan hal yuksek
cozunurluklu duragan karedir. Bu, "pikselli" ve "kasiyor" sikayetlerini
**birlikte** cozer — sayfada surekli yazilimla cozulen bir VP9 akisi yoktur.

⚠️ Uc kapi **ayni anda** saglanmadikca video hic kurulmaz: hareket tercihi
(`prefers-reduced-motion`), genislik (`≥760px`) ve isaretleme aygiti
(`pointer: fine`). Ucuncusu ipucu rozetini de baglar — ⚠️ dokunmatikte
_"USTUNE GELIN"_ yazmak **yalan** olurdu; rozet CSS'te `@media (hover: none)`
ile gizlenir, yani iddia ile davranis **ayni kosuldan** beslenir ve iki ayri
yerde ayrisamaz.

---

## 6. ⚠️ ON IKI RENK IKINCI KEZ YAZILDI — VE RISK BIR TESTLE KAPATILDI

On iki imza renginin SSOT'u `module-colors.css`tir (CLAUDE.md'nin baglayici
kurali). `components/landing/modules.ts` onlarin **kopyasini** tutar.

⚠️ **Neden okunamiyor:** renkler bir CSS ozel degiskeninde ve `[data-module='…']`
kapsaminda yasar. Bir Server Component CSS'i **cozemez**; landing kartlari
`data-module` kapsamina da **giremez** — girselerdi ADR-0038'in mekanizmasi on
iki kez ic ice kurulur ve **her kart `--accent`i ezerdi**.

⚠️ **Sapma SESSIZ olurdu:** bir modulun rengi degisir, uygulama yeni rengi
gosterir, pazarlama sayfasi eskisini gosterir, hicbir test kirmizi yanmaz.

⚠️ Bu yuzden risk bir **yorumla degil bir TESTLE** kapatildi:
`landing.spec.tsx` `module-colors.css`i ayristirip on iki `--mc-light` degerini
landing tablosuyla **birebir** karsilastirir ve **anahtar kumelerinin de** ayni
oldugunu iddia eder — on ucuncu modul eklenip landing unutulursa test kirmizi
yanar. `brand-assets.spec`in `MARK_PATHS` icin kurdugu desen (ADR-0038 §7).

---

## 7. ⚠️ IKI BILINEN AYRISMA — GIZLENMEDI, KAYDA GECTI

Ikisi de **bugun zararsizdir** ve ikisi de auth'a dokunmayi gerektirdigi icin
kapatilmadi (Mutlak Kural 1).

### 7.1 Maskotun nanesi iki farkli hex

| Yer                               | Deger                               |
| --------------------------------- | ----------------------------------- |
| `auth-surface.css` → `--bot-mint` | `#8ee3b6`                           |
| `landing-surface.css` → `--nane`  | ⚠️ **`#7be0b4`** (onaylanan piksel) |

⚠️ **Bugun zararsiz ve sebebi olculebilir:** `--bot-mint` auth'ta **tanimli ama
hic kullanilmiyor** — panel onu hicbir yerde boyamaz (arandi). Yani ekranda iki
farkli nane **gorunmuyor**.

⚠️ **Kosul yazilidir:** auth o token'i gercekten kullanmaya basladigi gun ikisi
**tek degere** cekilmelidir. Landing token'i `--bot-mint` **adiyla** yazilmadi
ve bu bilincli: ayni ada iki farkli deger vermek, ayrismayi **gorunmez**
kilardi.

### 7.2 Yazili logo iki ayri uygulama

| Yer                                     | Nasil                                                            |
| --------------------------------------- | ---------------------------------------------------------------- |
| auth (`brand.tsx` → `KobiWiseWordmark`) | Markanin adi **kalin Inter ile dizilir** (optik takip hesabiyla) |
| landing (`site-header.tsx`)             | ⚠️ Markanin **gercek cizilmis logosu** (`wordmark.webp`)         |

Gerekce ADR-0038 §7.3'un kendi cumlesidir: yazili logo _"giris ekrani, e-posta
ve **pazarlama**"_ icindir ve o gun _"Product Owner kelime logosunun vektorune
gerek olmadigini bildirdi"_ — **cunku kabukta kullanilmiyordu**. Pazarlama
yuzeyi ilk kez var oldu; gercek varligin kullanilacagi yer burasidir.

⚠️ **Bedeli durustce:** iki uygulama yan yana yasar ve biri degisirse digeri
**sessizce ayrisir**. Kabul edildi.

---

## 8. Yazilmamis sayfalar: BAGLANTI DEGILDIR

Blog **yazi detayi**, **fiyatlandirma**, **KVKK** ve **gizlilik** metinleri bu
isin kapsami disindadir (fiyatlandirma Faz 6'nin kararina, KVKK/gizlilik
ROADMAP §8.2'nin kontrol noktasina baglidir).

Prototipte bunlarin hepsi `href="#"` tasiyordu. ⚠️ Uretimde bu kabul edilemez
ve sebep kozmetik degildir: **`href="#"` tiklandiginda sayfayi BASA ATAR.**
Kullanici bir metin bekler, sayfanin tepesine firlar ve bunu bir **ariza**
olarak okur.

Uc sonuc:

1. Yasal metinler `<span class="yok">` olarak cizilir, `[yazilacak]` isareti
   **korunur**.
2. Blog kartlari `<article>`dir, `<a>` degil — gorsel tasarim birebir ayni.
3. ⚠️ **`.yazi:hover` kurali CSS'ten CIKARILDI.** Birakilsaydi imlec uzerine
   gelince kart rengi degisir, kullanici tiklanabilir sanir ve tiklardi;
   hicbir sey olmazdi. **Gorsel bir vaat, bir vaattir.**
4. One cikan yazinin kunye satirindan **"YAZIYI OKU →" cikarildi** — var
   olmayan bir sayfaya davet eden tek cumle oydu.

⚠️ Bir test kartlarin **bugun baglanti OLMADIGINI** kilitler; boylece "yarisi
yapildi" hali sessizce yasamaz. Detay sayfasi yazildigi gun test **tersine
cevrilir**, silinmez.

---

## 9. ADR-0036 esik kontrolu — **bakildi, uygulanmiyor**

CLAUDE.md'nin kalici kurali her yeni is ADR'sinin bu maddeyi **atlanmadan**
tasimasini ister. Dort soru:

1. **Bu is yapisal bir `RetrievalContributor` ekliyor mu?** ⚠️ **Hayir** — ve
   bu bir "eklemedik" degil, **kavramsal olarak eklenemez**: landing bir is
   modulu degildir; semasi, izni, verisi ve tenant kapsami **yoktur**.
2. **Satir donduren yapisal kaynak sayisi kaca cikiyor?** **18'de kaliyor**
   (10 anlatisal + 8 yapisal) — degismedi.
3. **T2 esigi (`2K/3`, bugun 6) geciliyor mu?** Soru **dogmuyor**.
4. **Platform karari gerekiyor mu?** Hayir.

⚠️ Madde **cevap "hayir" oldugu halde yazildi** (ADR-0040 §3'un emsali):
sessizce atlanan bir kontrol ile _"bakildi ve gerek yoktu"_ arasindaki fark,
ADR-0040'in kendi cumlesidir.

---

## Sonuclari

**Olumlu**

- ⚠️ **Kimliksiz ziyaretcinin urune girdigi kapi ILK KEZ ACIK.** ROADMAP §7'nin
  _"kayit akisina giden hicbir genel kapi yoktu"_ maddesi kapandi: her sayfada
  `/register` ve `/login`e giden gercek rotalar var.
- Kok rota artik ne saglik verisi siziyor ne de yonlendiriyor; **307 karari
  karsiligini verdi**.
- Uc yuzeyli token mekanizmasi **ucuncu kez** hicbir bileseni degistirmeden
  calisti — ADR-0038'in mekanizmasinin gucunun ucuncu kaniti.
- Bes sayfa **veri cekmiyor** (bir test kilitliyor): API dusse pazarlama
  sayfasi ayakta kalir.
- On iki modul rengi ilk kez **uygulama disinda** kullanildi ve bir testle SSOT'a
  baglandi.
- Prototipin **olculmus** yorumlari (satir ici `.nokta` kusuru, dar ekranda
  bindirmenin neden imkansiz oldugu, perde yonu) uretim koduna **tasindi**;
  bir sonraki okuyan onlari yeniden kesfetmek zorunda kalmayacak.

**Olumsuz / bedeli**

- ⚠️ **Landing STATIK DEGIL, dinamik** (§3). FRONTEND §3.1'in siniflandirmasi
  bugun karsilanmiyor; sebebi kok layout'un nonce okumasidir ve **cozumu ayri
  bir istir**.
- ⚠️ **On iki renk ikinci kez yazildi** (§6). Test ayrismayi yakalar ama
  **kopyayi ortadan kaldirmaz**.
- ⚠️ **Iki bilinen ayrisma acik** (§7): maskotun nanesi iki hex, yazili logo iki
  uygulama.
- ⚠️ **915 KB video repoya girdi.** Sayfa acilisinda indirilmez ama **git
  gecmisinde kalicidir**; daha kucuk bir donguye gecmek eski nesneleri silmez.
- ⚠️ **`.gir` ogeleri JS'siz gorunmez** olurdu; `<noscript>` icinde bir `<style>`
  ile kapatildi. Bu satir CSP'ye **uyar** (`style-src 'unsafe-inline'`) ama ayni
  istisnanin `script-src`te **olmadigi** unutulmamalidir — oraya tasinamaz.
- ⚠️ **Playwright e2e hala yok** (ROADMAP §8): bes sayfa gercek tarayicida
  **elle** gezildi. Bir regresyon otomatik yakalanmaz.
- ⚠️ **Fiyatlandirma, KVKK ve gizlilik metinleri hala YOK** — ROADMAP §7'nin
  _"pazarlama icerigi"_ maddesi **tam kapanmadi**.

---

## Degerlendirilen alternatifler

| Alternatif                                                          | Neden secilmedi                                                                                                                                                                                                            |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prototipi ayri bir statik site olarak (ayri domain/repo) yayinlamak | Iki dagitim, iki marka sistemi, iki font zinciri. `/` ile `/register` arasinda **origin degisirdi** ve kullanici "baska bir siteye dustum" hissini tam da en kirilgan anda yasardi (ADR-0052 §1.2'nin ayni gerekcesi).     |
| CSS'i Tailwind utility'lerine cevirmek                              | Onaylanan tasarim **olculmus degerlerle** geliyordu (clamp'ler, gradyan aci dereceleri, perde duraklari). Utility'ye cevirmek her degeri **yeniden yorumlamak** demekti — Product Owner'in acik talimati bunu yasakladi.   |
| `landing-surface.css`i `globals.css`ten import etmek                | `auth-surface.css` boyle yapiliyor, ama o **her sayfada** gecerli olmali degil: landing CSS'i ~30 KB'dir ve `/app`in on iki odasina hic gerekmez. Landing layout'undan import etmek onu **kendi rota parcasina** hapseder. |
| Blog kartlarini `<a href="#">` birakmak                             | Olu baglanti sayfayi basa atar; kullanici bunu ariza olarak okur (§8).                                                                                                                                                     |
| Yazi detayi ve fiyatlandirmayi bu iste yazmak                       | Ikisi de **ayri kararlar**: detay bir icerik hattini (CMS mi, MDX mi, kim yazacak), fiyatlandirma **Faz 6'nin plan/kota kararini** gerektirir. Bugun yazmak ikisini de tahmine dayandirmak olurdu.                         |
| Kok layout'u degistirip landing'i statiklestirmek                   | ADR-0053 EK-2'nin prod'da dogrulanmis nonce zincirine dokunmayi gerektirir; o zincir **iki gercek kusurla** kurulmustu ve ikisi de yalnizca gercek tarayicida gorulmustu (§3).                                             |
| Prototipin nane rengini `--bot-mint` (`#8ee3b6`) ile degistirmek    | Onaylanan **pikseli** degistirirdi. Fark gozle neredeyse ayirt edilemez ama talimat acikti: _"piksel piksel saygi goster, yeniden yorumlama"_. Ayrisma bunun yerine **kayda gecti** (§7.1).                                |

---

## Bu karar ne zaman yeniden gozden gecirilir?

- ⚠️ **Tema script'i kok layout'tan indirildiginde** — landing statiklesir ve
  §3'un tamami gecersizlesir. Bu, bu ADR'nin **en somut acik isidir**.
- **Blog yazi detayi yazildiginda** — §8'in uc karari (article → Link, hover
  kurali, kunye satirindaki davet) **tersine cevrilir**.
- **Fiyatlandirma odasi eklendiginde** — koridor **besinci odayi** alir ve
  `landing-surface.css`in besli izgarasi **yeniden olculmelidir** (dosyanin
  kendi yorumu bunu yaziyor).
- **Auth `--bot-mint`i gercekten kullandiginda** — §7.1'in ayrismasi kapatilir.
- **On ucuncu modul eklendiginde** — `modules.ts` guncellenmeli; test unutmayi
  yakalar ama **hatirlatmaz**.
- **KVKK/gizlilik metinleri yazildiginda** — `.yok` span'lari gercek rotalara
  baglanir.

---

## Product Owner onayi gereken kalemler

| #   | Kalem                                                                                                              | Karar             |
| --- | ------------------------------------------------------------------------------------------------------------------ | ----------------- |
| 1   | Nane hex ayrismasi — onaylanan piksel korunsun, ayrisma kayda gecsin                                               | ✅ onaylandi      |
| 2   | Yazili logo landing'de **gorsel**, auth'ta metin                                                                   | ✅ onaylandi      |
| 3   | Landing bugun **dinamik** kalsin; nonce bagimliligi ADR'ye yazilsin ve **ayri bir gelecek is** olarak isaretlensin | ✅ onaylandi (§3) |
| 4   | Yazilmamis sayfalar **baglanti olmasin**                                                                           | ✅ onaylandi      |
| 5   | JS'siz gorunurluk icin `<noscript>` geri dususu                                                                    | ✅ onaylandi      |
| 6   | Bu ADR yazilsin                                                                                                    | ✅ onaylandi      |

---

## Kapsam disi

- Blog **yazi detay** sayfasi ve icerik hatti (CMS/MDX karari).
- **Fiyatlandirma** odasi — Faz 6'nin plan/kota kararina bagli.
- **KVKK** ve **gizlilik** metinleri — ROADMAP §8.2.
- **Landing'in statiklestirilmesi** (§3) — ayri slice, muhtemelen ADR-0053'e ek.
- **Playwright e2e** — ROADMAP §8'in acik borcu, bu iste de kapanmadi.
- **Kok alan `kobiwise.com`** apex kaydi — bugun yalnizca `app.` ve `api.` alt
  domainleri bagli.
- **`/app` ve auth yuzeyleri** — tek satir dokunulmadi.
