# 0042 — `POST /ask` yapisal tabani: ADR-0036'nin OLCUMLE yeniden sinanmasi

- **Durum:** Onerildi — ⚠️ **PRODUCT OWNER ONAYI BEKLIYOR**
- **Tarih:** 2026-08-24
- **Karar veren:** Product Owner
- **Faz:** 5 (platform karari — bir modul ADR'si DEGIL)

## Baglam

[ADR-0036](0036-context-retrieval-kota.md) `POST /ask` havuzunda yapisal
kaynaklara `ceil(K / 3)` yuvalik bir **taban** verdi ve kendi yeniden gozden
gecirme tetikleyicisini yazdi:

> _"**Yapisal kaynak sayisi tabanin iki katini gectiginde** (bugun 4, esik 6):
> o noktada kaynaklarin yarisindan fazlasi garanti disinda kalir ve 'genislik'
> vaadi anlamini yitirmeye baslar."_

Bu satir **ucuncu kez** bir modul ADR'sinde okundu ve bu kez **tetiklendi**:

| ADR                                              | Yapisal kaynak | Ne oldu                                                                                      |
| ------------------------------------------------ | :------------: | -------------------------------------------------------------------------------------------- |
| [ADR-0039](0039-stok-envanter-modulu.md) §7.2    |   4 → **5**    | Esige **bir kaldi**; satir bir sonraki module ADRESLENDI                                     |
| [ADR-0040](0040-tedarikci-yonetimi-modulu.md) §3 |   5 → **5**    | Uc aday reddedildi; esige **bilincli olarak dokunulmadi**                                    |
| [ADR-0041](0041-teklif-fatura-modulu.md) §4.3    |   5 → **6**    | ⚠️ **ESIK ASILDI** — PO onayiyla; ADR-0036 **degistirilmedi**, revizyon **buraya** birakildi |

ADR-0041 §4.3 bunu bilerek yapti ve sirayi da yazdi: **once olcum, sonra
karar.** Gerekce, bu ADR'nin de dayandigi ilkedir:

> _"Bir platform karari, onu degistirmesi gereken **veriye sahip olmadan**
> revize edilmez."_

Olcum ADR-0041'in kapanis denetiminde yapildi (2026-08-23) ve **bu ADR'nin tek
girdisidir**.

### ⚠️ Bu ADR TAZE bir karar vermiyor — YAZILI bir reddi sinIYOR

Kritik bir nokta: _"tabani 4'e cikaralim"_ secenegi ADR-0036'da **zaten
degerlendirilmis ve reddedilmisti** (§2):

> _"**Neden 3, neden 4 degil:** bugun dort yapisal kaynak var; dordune de
> garanti vermek havuzun **yarisini** rezerve ederdi ve anlamsal icerik —
> cevaplarin asil yasadigi yer — ikinci plana duserdi."_

Ayrica §3 **katkici sayisina gore olcekleme**yi de acikca reddetti. Yani buradaki
soru _"taban kac olmali"_ degil:

> **Yeni olcum, ADR-0036'nin o gerekcelerini CURUTUYOR MU?**

Bu ayrim bu ADR'nin butun yapisini belirliyor. Curutmuyorsa dogru cikti bir
degisiklik degil, **yazili reddin OLCUMLE guclendirilmesi** ve tetikleyicinin
yenilenmesidir.

---

## Olcum — ham veri

**On dort katkici dolu** (8 anlamsal + 6 yapisal), gercek saglayicilarla, uc
farkli soru, **iki ayri kosulda**. `K = 8`, taban `ceil(8/3) = 3`.

**A) `invoicing-pipeline` SAKIN bandda (0.75 — yalnizca acik teklif ozeti):**

| Kaynak                                                                                               | Tur         | s1    | s2    | s3    |
| ---------------------------------------------------------------------------------------------------- | ----------- | ----- | ----- | ----- |
| `knowledge` · `crm-interactions` · `inventory-notes` · `appointment-notes` · `supplier-interactions` | anlamsal    | 1     | 1     | 1     |
| `crm-pipeline`                                                                                       | **YAPISAL** | 1     | 1     | 1     |
| `finance-cashflow`                                                                                   | **YAPISAL** | 1     | 1     | 1     |
| `inventory-stock`                                                                                    | **YAPISAL** | 1     | 1     | 1     |
| ⚠️ `invoicing-pipeline`                                                                              | **YAPISAL** | **0** | **0** | **0** |
| **TOPLAM**                                                                                           |             | **8** | **8** | **8** |

**B) Ayni tenant, `invoicing-pipeline` ALARM bandda (0.95 — kabul edilip
faturalanmamis + suresi dolmus + cevapsiz teklifler):**

| Kaynak                                                                                               | Tur         | s1    | s2    | s3    |
| ---------------------------------------------------------------------------------------------------- | ----------- | ----- | ----- | ----- |
| `knowledge` · `crm-interactions` · `inventory-notes` · `appointment-notes` · `supplier-interactions` | anlamsal    | 1     | 1     | 1     |
| `crm-pipeline`                                                                                       | **YAPISAL** | 1     | 1     | 1     |
| `inventory-stock`                                                                                    | **YAPISAL** | 1     | 1     | 1     |
| ⚠️ `invoicing-pipeline`                                                                              | **YAPISAL** | **1** | **1** | **1** |
| ⚠️ `finance-cashflow`                                                                                | **YAPISAL** | **0** | **0** | **0** |
| **TOPLAM**                                                                                           |             | **8** | **8** | **8** |

Her iki kosulda `degradedSources: []` — disarida kalanlar **bozulmadi, ELENDI**.
`project-status` ve `appointment-schedule` **hicbir kosulda** gorunmedi;
anlamsal tarafta `documents`, `project-notes` ve `finance-commentaries` sifir
aldi.

### ⚠️ Verinin GUVENLE soyledigi ve SOYLEMEDIGI

Bu ayrim yapilmazsa asagidaki butun tartisma bir kum uzerine kurulur.

**Guvenle soyledigi:**

1. **Taban her kosulda tam olarak `ceil(8/3) = 3` yapisal ses uretti.** Formul
   calisiyor.
2. ⚠️ **EN AZ DORT yapisal kaynak satir donduruyor ve en az biri HER SORUDA
   eleniyor.** Bu, ikisi karsilastirilarak **kanitlanir**: `finance-cashflow`
   A'da iceride (yani satir donduruyor), B'de disarida — ve Finans verisinde
   iki kosul arasinda hicbir sey degismedi. Ayni sekilde `invoicing-pipeline`
   A'da satir donduruyordu (11 acik teklifin ozeti) ve girmedi.
3. ⚠️ **BANDLAR ARASI ELEME LIYAKATLIDIR.** B'de 0.95'e cikan kaynak girdi ve
   0.75'te kalan dustu; A'da tam tersi. Skor merdiveni (0.95/0.90/0.75)
   **gercekten** siralamayi belirliyor — sabit skor verilseydi bu yer degistirme
   HIC olmaz, giren kaynak kayit sirasina gore **sabitlenirdi**.

**Soylemedigi — ve bu ADR bunlari IDDIA ETMEZ:**

1. ⚠️ **`project-status` ve `appointment-schedule` ELENDI Mi, yoksa BOS MU
   DONDU — BILINMIYOR.** Ikisi de mumkun ve fark onemlidir: ADR-0036 §2'nin
   `min(satir donduren yapisal kaynak sayisi, ceil(K/3))` kisiti geregi bos
   donen bir kaynak icin yuva zaten ayrilmaz. Yani _"alti kaynagin ucu
   susturuluyor"_ ifadesi **kanitlanmis degildir**; kanitlanan sey **en az
   birinin her soruda elendigidir**.
2. ⚠️ **BAND ICI siralamanin neye gore yapildigi OLCULMEDI.** A'da ucuncu yuvayi
   `finance-cashflow` aldi; `invoicing-pipeline`, `project-status` ve
   `appointment-schedule` de o an 0.75 bandinda olabilirdi. Esitlik varsa
   kazanani **kararli siralama** (kayit sirasi) belirler — yani liyakat degil.
   Ve bu esitlik **her soruda ayni sekilde** cozulecegi icin, band ici kaybeden
   bir kaynak **sistematik olarak** kaybeder.
3. **Cevap KALITESI olculmedi.** Olculen sey **dagilimdir**: hangi kaynagin
   girdigi. Cevabin daha iyi ya da daha kotu oldugu **hicbir sekilde**
   olculmedi.

> ⚠️ Ucuncu madde bu ADR'nin **rerank karari icin belirleyicidir** (§2 asagida)
> ve olcumun protokolu bu yuzden degistiriliyor (§4).

---

## Karar

### 1. ⚠️ TABAN `ceil(K / 3)` OLARAK KALIR — formul DEGISMEZ

**ADR-0036 §2 ve §3 aynen yururluktedir.** Bu ADR onlari degistirmez,
genisletmez, config'e acmaz.

Gerekce tek cumleyle: **yeni olcum, ADR-0036'nin 4'u reddederken kullandigi
gerekceyi curutmuyor — GUCLENDIRIYOR.** Ayrinti § Degerlendirilen
alternatifler'de.

⚠️ **Product Owner'in one surdugu gerekce DOGRUDUR AMA EKSIKTIR ve bu ADR onu
oldugu gibi kabul etmez.** Onerilen gerekce sudur:

> _"Olcum, tabanin 3 yuvasinin 6 yapisal aday arasinda liyakate gore dogru
> rotasyon yaptigini gosteriyor."_

Rotasyon gercekten olcüldu — ama **yalnizca BANDLAR ARASINDA** (0.95 ↔ 0.75).
**Band ICINDE** siralamanin liyakatli oldugu **olculmedi** ve muhtemelen
degildir (kararli siralama). Yani "sistem dogru rotasyon yapiyor" ifadesi
verinin soyledigin*den fazlasi*dir. Kararin dayandigi asil gerekce §Gerekce'de
farkli kuruluyor: **tabanin isi rotasyon degil, BIR KATEGORININ sistematik
susturulmasini onlemektir — ve o is yapiliyor.**

### 2. ⚠️ RERANK ACILMAZ — cunku KENDI ON KOSULU KARSILANMADI

ADR-0036 rerank'i reddetmedi; **ertelendi** ve tetikleyicisini yazdi:

> _"**Olculmus bir KALITE verisi olustugunda**: o gun rerank tartismasi yeniden
> acilir ve bu ADR'nin yerini alabilir — bu kisit, rerank'in **yerine** degil,
> **once**sine konmustur."_

⚠️ **ADR-0041'in olcumu bir KALITE verisi DEGILDIR, bir DAGILIM verisidir.**
Hangi kaynagin cevaba girdigini soyler; cevabin **daha iyi** olup olmadigini
soylemez. Ikisini karistirmak, bu ADR'nin engellemesi gereken hatadir: dagilim
verisiyle rerank acmak, **olcmedigimiz bir sorunu** cozmek icin darbogaza
(`LLMPort.complete`, olculen surenin ~%84'u) ikinci bir model cagrisi eklemek
olurdu.

Rerank bu ADR'de **reddedilmiyor** — sirasi gelmedi. §5'in yeni tetikleyicisi
onu canli tutuyor.

### 3. ADR-0036'nin TETIKLEYICISI EMEKLI EDILIR — yerine iki YENI tetikleyici

⚠️ Bu, bu ADR'nin **fiilen degistirdigi tek sey**tir ve gereklidir: eski
tetikleyici **atesledi**, yani **tukendi**. Yerine bir sey konmazsa ADR-0036
**canli tetikleyicisi olmayan** bir karar olarak kalir ve bir sonraki gecis
**fark edilmeden** olur.

**Emekli edilen** (ADR-0036 § Bu karar ne zaman yeniden gozden gecirilir, 2. madde):

> ~~_"Yapisal kaynak sayisi tabanin iki katini gectiginde (bugun 4, esik 6)"_~~
> — ATESLENDI (ADR-0041, yapisal kaynak 6). Metin silinmez, uzerine bu not
> eklenir.

**Yerine gecen iki tetikleyici — ikisi de SAYIM degil DAVRANIS olcer:**

| #      | Tetikleyici                                                                                   | Neden bu esik                                                                                                                                                                                                                                                                                                                 |
| ------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T1** | ⚠️ **Bir yapisal kaynak ALARM bandinda (0.95) uc farkli soruda da giremiyorsa**               | Sayim degil **basarisizlik** olcer. ADR-0041'in olcumunde bu **GERCEKLESMEDI** (`invoicing-pipeline` 0.95'e cikinca girdi) — yani taban **calisiyor**. Gerceklestigi gun taban buyuklugu ya da skor merdiveni **yanlistir** ve ikisinden biri degismek zorundadir.                                                            |
| **T2** | ⚠️ **Satir donduren yapisal kaynak sayisi `2 × K / 3`'u gectiginde** (bugun `K=8` icin **6**) | Eski tetikleyicinin sayisal muadili ama **dogru sey**i sayar: kayitli katkici degil, **gercekten satir donduren** kaynak. ADR-0036 §2'nin `min(...)` kisiti zaten bunu soyluyordu; eski tetikleyici yanlis sayiyi sayiyordu ve bu yuzden ADR-0041'de "asildi mi asilmadi mi" sorusu **olculmeden** cevaplanmak zorunda kaldi. |

⚠️ **T1 ve T2'nin ikisi de bugun KAPALI.** T1 olculdu ve gerceklesmedi; T2 icin
gereken sayi (kac yapisal kaynagin satir dondurdugu) **olculmedi** — §4 bunu
zorunlu hale getiriyor.

### 4. ⚠️ OLCUM PROTOKOLU DEGISIR — bundan sonra SKOR ve SATIR SAYISI da kaydedilir

ADR-0041'in olcumu iki soruyu cevaplayamadi (§ Verinin soylemedigi) ve ikisi de
**kayit eksikligindendi**, mekanizma eksikliginden degil.

Bundan sonra her modulun kapanis denetimindeki ADR-0036 olcumu **su ucunu**
kaydeder:

1. hangi kaynaklarin cevaba girdigi (bugunku kayit),
2. ⚠️ **her yapisal kaynagin o cagrida DONDURDUGU SATIR SAYISI** — `0` ise
   kaynak elenmedi, **soyleyecek seyi yoktu** (T2'nin girdisi),
3. ⚠️ **giren ve girmeyen her parcanin SKORU** — band ici siralamanin liyakatli
   mi yoksa kararli-siralama mi oldugunu gosteren tek veri.

⚠️ Bu bir **kod degisikligi degil, denetim protokolu degisikligidir**: `/ask`
yaniti bugun skor DONDURMEZ ve **dondurmemelidir** (skor bir ic siralama
detayidir; disari acmak onu bir sozlesme haline getirirdi). Olcum, denetim
sirasinda **sunucu loglarindan** ya da gecici bir arac kosumuyla alinir.

### 5. Bu ADR ADR-0036'yi SUPERSEDE ETMEZ

Sadece **tetikleyici bolumunu** gunceller (§3). Taban formulu, `K - 1` tavani,
`min(...)` kisiti, tur beyaninin modulde olmasi, `degradedSources` davranisi —
**hicbiri degismez**. ADR-0036 yururlukte kalir ve okunmaya devam eder.

---

## Degerlendirilen alternatifler

⚠️ Uc secenek de **ayni veriyle** tartildi. Sonucun "hicbir sey degismesin"
cikmasi, secenegin zayif oldugu anlamina gelmez — asagidaki her satir gercek
bir bedel/kazanc hesabidir.

### A) Tabani `ceil(K / 2) = 4`'e cikarmak

**En guclu yanini once yazmak gerekiyor, cunku ilk bakista gorunenden IYI bir
secenek:**

- ⚠️ **Token acisindan muhtemelen KAZANCLIDIR.** Yapisal parca **tek satirlik**
  deterministik bir ozettir; anlamsal parca bir **chunk**tir (`TARGET_CHUNK_CHARS`
  mertebesinde). Bir anlamsal yuvayi bir yapisal yuvayla degistirmek baglami
  **kucultur**. ADR-0036'nin "top-K'yi buyutmek" icin yazdigi token itirazi
  burada **gecerli degildir** — bu bir buyutme degil, bir **takas**tir.
- Genislik artar: alti yapisal kaynagin dordu her cevapta duyulur.

**Yine de reddediliyor — uc gerekceyle, en agirdan hafife:**

1. ⚠️ **SORUNU COZMUYOR, SINIRI KAYDIRIYOR.** Sikayet _"alti kaynagin bir kismi
   hic duyulmuyor"_ idi. Taban 4 olsa **iki kaynak yine disarida kalir**. Yani
   bugunun rahatsizligi icin **kalici** bir yeniden tahsis yapilir ve
   rahatsizlik **devam eder**. ⚠️ Ustelik 9. modul (IK) bir yapisal katkici
   eklerse 7 kaynak / 4 yuva olur ve ayni tartisma **ayni yerden** yeniden
   baslar — bu kez `ceil(K/2)`den sonra gidilecek yer `K-1`dir, yani havuzun
   tamami.
2. ⚠️ **KAZANILAN YUVAYA GIRECEK ICERIK, TANIMI GEREGI "HABER OLMAYAN"DIR.**
   Skor merdiveni 0.95/0.90/0.75'tir ve **0.75 bandi "saglikli" demektir**.
   Olcum bunu dogrudan gosteriyor: A kosulunda taban disinda kalan
   `invoicing-pipeline`in icerigi _"11 acik teklif (TRY)"_ idi — bir durum
   bildirimi, bir uyari degil. Dorduncu yuva, **her cevapta bir modulun "bende
   sorun yok" cumlesini** garanti eder ve karsiliginda o soruya **gercekten
   benzeyen** bir anlatisal parcayi disari atar.
3. ⚠️ **ADR-0036 §3'un ONGORUSUNU DOGRULAR YONDE ILERLETIR, KIRMAZ.** O ADR
   tabanin **`K` uzerinden** olceklenmesini secmis, katkici sayisi uzerinden
   olceklemeyi _"kendi basarisi yuzunden bozulur"_ diye reddetmisti. `ceil(K/2)`
   hala `K` uzerindendir ama **oran** kararini degistirir: havuzun ucte biri
   yerine **yarisi** kalici olarak deterministik ozetlere ayrilir. Bu, on iki
   modullu bir gelecekte savunulmasi cok daha zor bir taahhuttur.

> ⚠️ **Karsi-argumanin durust kaydi:** yukaridaki 2. madde, band ici siralamanin
> liyakatli oldugunu **varsayar**. Eger dorduncu yuvaya giren sey her zaman 0.75
> degil de bazen 0.90 ise, takas daha iyi olurdu. Bunu bugun **bilmiyoruz**
> (§ Verinin soylemedigi, madde 2) — ve §4'un protokol degisikligi tam olarak bu
> bosluğu kapatmak icindir. ⚠️ Yani bu red, **veri geldiginde yeniden
> okunmalidir**; T2 tetikleyicisi onu canli tutuyor.

### B) Rerank acmak

- ⚠️ **On kosulu karsilanmadi** (§2): ADR-0036 rerank'i _"olculmus bir KALITE
  verisi"_ne bagladi; elimizdeki **dagilim** verisidir.
- ⚠️ **Bedeli dogrudan olculen darbogaza biner.** Fan-out N=14 olcumu: toplam
  ~5004 ms, `LLMPort.complete` ~4207 ms (**%84**), fan-out 372 ms (%7). Bir
  rerank adimi ya ikinci bir model cagrisi (darbogazi ~iki katina cikarir) ya da
  yeni bir cross-encoder bagimliligi demektir.
- ⚠️ **Kalibrasyon verisi yok.** Rerank, skorlari **karsilastirilabilir** hale
  getirme isidir; bugun anlamsal ve yapisal skorlar **ayni olcekte degil** ve bu
  ADR-0031'den beri bilinen bir sinir. Kalibrasyonsuz bir rerank, olcek
  uyusmazligini **gizler** — ADR-0036'nin gorunur kildigi seyi geri gorunmez
  yapar.
- ⚠️ Ve en onemlisi: **rerank tabani GEREKSIZ KILMAZ.** ADR-0036 bunu acikca
  yazdi (_"kisit, rerank'in yerine degil, oncesine konmustur"_). Ikisi ayni
  sorunun cozumu degil.

**Sonuc: reddedilmiyor, ERTELENIYOR** — ve ertelemenin bir tetikleyicisi var
(§5, "olculmus kalite verisi").

### C) Tabani katkici sayisina gore olceklemek ("her yapisal kaynaga bir yuva")

⚠️ **ADR-0036 §3'te ZATEN REDDEDILDI ve yeni veri bu reddi guclendiriyor.**
Bugun 6 yapisal kaynak var; kural uygulansaydi taban **6** olur ve `K=8`lik
havuzun yalnizca **2** yuvasi anlatisal icerige kalirdi. Olcumde anlamsal taraf
zaten **5 yuvada 8 kaynakla** yarisiyor ve ucu sifir aliyor; taban 6 olsa bu
sayi **altiya** cikardi.

Yani bu secenek, cozmeye calistigi seyi (genislik) **anlamsal tarafta** ayni
siddette uretirdi.

### D) Kaynak basina KOTA (round-robin)

⚠️ **ADR-0031 §5.1'de reddedildi**, ADR-0036 §1 tekrar reddetti (_"taban KAYNAK
BASINA bir yuvadir — toplu bir kota DEGIL"_). Yeni veri bu redde dokunmuyor:
kota, olculen rotasyonu (alarmin sakini dusurmesi) **ortadan kaldirirdi** —
her kaynak sirasini beklerdi ve **alarm ile sessizlik ayni muameleyi** gorurdu.

### E) `K`'yi buyutmek (8 → 12)

⚠️ ADR-0036'da **acikca reddedildi** (_"sorunu cozmez, erteler; bedeli dogrudan
tokendir"_) ve yeni olcum bu reddi **guclendiriyor**: her iki kosulda da havuz
**tam doldu** (8/8) ve `degradedSources` bos. Yani sorun **kapasite degil
PAYLASIMDIR**; kapasiteyi buyutmek payi degistirmez, yalnizca herkesin payini
biraz artirip **her soruya token** ekler.

---

## Gerekce

**Neden taban degismiyor — ve gerekce PO'nun onerdiginden farkli kuruluyor.**

Onerilen gerekce _"rotasyon dogru calisiyor"_ idi. Rotasyon **bandlar arasinda**
gercekten olculdu, ama **band icinde** olculmedi (§ Verinin soylemedigi). Karar
bu yuzden daha dar ve daha saglam bir zemine oturtuluyor:

> **Tabanin isi bir ROTASYON PLANI yurutmek degil, BIR KATEGORININ olcek
> uyusmazligi yuzunden SISTEMATIK OLARAK susturulmasini onlemektir.**

ADR-0036 bunu kendi cumlesiyle yazmisti: _"korudugumuz sey bir modulun payi
degil, olcek uyusmazligi yuzunden sistematik olarak kaybeden KATEGORIDIR."_

Olcum tam olarak bunu dogruluyor: **yapisal kategori her cevapta uc sesle
temsil edildi** ve alarm durumundaki bir kaynak **girmeyi basardi**. Yani
korunmasi gereken sey korunuyor. Bir modulun **her cevapta** duyulmasi ise
taban tarafindan hicbir zaman vaat edilmedi — ADR-0036 § Bilinen sinirlar bunu
zaten yaziyordu (_"'her yapisal kaynak her cevapta' GARANTI DEGILDIR"_).

**Neden bu, "hicbir sey yapmamak" degil.** Bu ADR uc somut sey yapiyor:

1. Atesleyip **tukenmis** bir tetikleyiciyi emekli edip yerine **iki davranissal**
   tetikleyici koyuyor — biri (T1) tabanin **basarisizligini**, digeri (T2)
   **dogru sayiyi** olcuyor.
2. Olcum protokolunu degistiriyor: bundan sonra **skor ve satir sayisi** da
   kaydedilir — yani bir sonraki tartisma, bu ADR'nin cevaplayamadigi iki
   soruyu **cevaplayabilecek** veriyle acilir.
3. `ceil(K/2)` reddinin **kosullu** oldugunu yaziya gecirivor: red, band ici
   siralamanin liyakatsiz olmasi varsayimina dayaniyor ve veri geldiginde
   **yeniden okunmalidir**.

**Neden rerank bugun acilmiyor.** Cunku on kosulu bir **tarih** ya da bir
**modul sayisi** degil, bir **veri turu**dur ve o veri hala yok. Bu ADR'nin en
kolay hatasi, elindeki veriyi "yeterince yakin" sayip darbogaza ikinci bir model
cagrisi eklemek olurdu.

---

## Sonuclari

**Olumlu**

- Taban formulu, `K` uzerinden olcekleme ve `min(...)` kisiti **degismiyor**;
  ADR-0036 yururlukte kaliyor ve bir platform karari **veri olmadan** revize
  edilmemis oluyor.
- ⚠️ **Canli bir tetikleyici geri geliyor.** Atesledigi icin tukenmis olan
  eskisinin yerine, biri **basarisizlik** (T1) digeri **dogru sayi** (T2) olcen
  iki tetikleyici konuyor.
- Olcum protokolu, bir sonraki tartismayi **cevaplanabilir** kiliyor (skor +
  satir sayisi).
- Hicbir kod degismiyor: sifir regresyon riski, sifir token maliyeti.

**Olumsuz / bedeli**

- ⚠️ **Alti yapisal kaynagin bir kismi her cevapta duyulmuyor ve bu KABUL
  EDILIYOR.** Bugun kac tanesi oldugu **bilinmiyor** (en az biri); §4'un
  protokolu bunu bir sonraki denetimde netlestirecek.
- ⚠️ **Band ici siralamanin liyakatsiz olma ihtimali ACIK KALIYOR.** Uc kaynak
  0.75'te esitse kazanani kararli siralama belirler ve kaybeden **her soruda**
  kaybeder. Bu, T1'in yakalayamadigi bir sinirdir (T1 yalnizca 0.95'i izler).
- ⚠️ **Rerank ertelenmeye devam ediyor** ve onunla birlikte skor kalibrasyonu da
  — ADR-0031'den beri acik olan bilinen sinir **dokuzuncu** kez tekrarlaniyor.
- 9. modul (IK) bir yapisal katkici eklerse yapisal kaynak **7** olur ve T2
     **atesler**; yani bu tartisma **bir modul sonra** yeniden acilabilir.

---

## Bilinen sinirlar

- ⚠️ **Olcum TEK BIR TENANT'ta ve YAPAY veriyle yapildi.** Her kaynakta bir-iki
  kayit vardi; gercek bir tenant'ta anlamsal kaynaklarin skor dagilimi cok daha
  genis olur ve yapisal kaynaklarin sabit tavani (0.95) onlari **daha sik**
  iceri sokabilir. ⚠️ Yani olcum tabanin **calistigini** gosterir, gercek
  kullanimdaki dagilimi **temsil ETMEZ**.
- ⚠️ **Uc soru, tek gun, tek model.** `LLMPort` ve `EmbeddingPort` saglayicilari
  degisirse skor dagilimi degisir; olcum saglayiciya **bagimlidir** ve bu
  hicbir yerde sabitlenmiyor.
- ⚠️ **`project-status` ve `appointment-schedule`in neden hic gorunmedigi
  BILINMIYOR** (elendi mi, bos mu dondu). Bu ADR'nin en buyuk veri boslugu ve
  §4 dogrudan onu kapatmak icin yazildi.
- ⚠️ **Kalite hic olculmedi.** Bu ADR bir dagilim verisiyle bir dagilim karari
  veriyor; cevaplarin **daha iyi** olup olmadigi hakkinda hicbir sey soylemiyor
  ve soylememelidir.
- ⚠️ **T2'nin esigi (`2K/3`) bir SEZGIDIR**, olculmus bir deger degil. Eski
  tetikleyicinin (`2 × taban`) sayisal muadili secildi ki karsilastirilabilir
  olsun; "dogru" esik oldugu iddia edilmiyor.

---

## Bu karar ne zaman yeniden gozden gecirilir?

- ⚠️ **T1 — bir yapisal kaynak ALARM bandinda (0.95) uc farkli soruda da
  giremiyorsa.** Bu, tabanin **basarisizligidir**: taban buyuklugu ya da skor
  merdiveni yanlis demektir ve ikisinden biri degismek zorundadir.
- ⚠️ **T2 — satir donduren yapisal kaynak sayisi `2K/3`'u gectiginde** (bugun
  **6**). ⚠️ 9. modul (IK) bir yapisal katkici eklerse bu **hemen** atesler.
- **Olculmus bir KALITE verisi olustugunda:** rerank tartismasi acilir
  (ADR-0036'nin kendi tetikleyicisi, degismeden devam ediyor). ⚠️ O gun bu
  ADR'nin `ceil(K/2)` reddi de **yeniden okunmalidir**: red, band ici
  siralamanin liyakatsiz oldugu varsayimina dayaniyor.
- **`K` degistiginde** (`KNOWLEDGE_RETRIEVAL_LIMIT`): taban kendiliginden
  olceklenir ama `ceil(K/3)` oraninin hala dogru oldugu **tekrar sorulmalidir**
  (ADR-0036'nin ilk tetikleyicisi, degismeden devam ediyor).
- **Anlamsal tarafta sifir alan kaynak sayisi besi gectiginde:** bugun uc
  (`documents`, `project-notes`, `finance-commentaries`). O noktada sorun
  yapisal tabanda degil **havuz buyuklugunde** olabilir ve `K` sorusu — bu ADR'de
  reddedilen (E) — yeniden acilir.
