# 0032 — Musteri ozeti: istek-tetiklemeli AI onbellegi

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-09
- **Karar veren:** Product Owner
- **Faz:** 5 (Katman 2)

## Baglam

CRM'in Slice 4–7'si tamamlandi: sirket, kisi, firsat, takip ve **gorusme**
kayitlari calisiyor, gorusmeler gomuluyor ve `POST /ask` uzerinden kurumsal
hafizaya katki veriyor (ADR-0031 §5).

Ama bu katkinin tamami **cekme** (pull) modelidir: kullanici bir soru sormak
zorundadir. Oysa CRM'de en sik ihtiyac duyulan bilgi bir soru degil, bir
**hazirliktir** — bir musteriyi aramadan once "bu iliski nereye geldi"
sorusunun cevabi. O soruyu her seferinde elle sormak, cevabin zaten sistemde
oldugu bir durumda kullaniciya is yuklemektir.

Katman 2, bu cevabi **musteri sayfasinin kendisine** koyar.

Bu ayni zamanda `CLAUDE.md`'nin kurucu kisitinin ilk gorunur sinavidir:
_"Modüller ürün değildir, hafızadır."_ CRM'in gorusme notlari o hafizadir;
musteri ozeti, hafizanin **kullanicinin karsisina cikan** ilk halidir.

## Karar

### 1. Istek-tetiklemeli ONBELLEK — worker DEGIL

Ozet, birisi o musteriye baktiginda uretilir ve `crm.company_summaries`
tablosunda saklanir. Zamanlanmis bir is **yoktur**.

**Neden worker degil:** ADR-0030'un gunluk raporu bir worker'dir cunku is
ZAMANA baglidir (her gun, kimse istemese de uretilmelidir). Burada is TALEBE
baglidir. Worker kurmak, hicbir zaman acilmayacak musteri sayfalari icin her
gece para harcamak olurdu — bin musterili bir tenant'ta bunun bin kati.

**Mimari sonucu buyuk ve bilincli:** worker olmadigi icin

- BYPASSRLS rolu **yok** (migration `0012` bir tane getirmisti),
- `SECURITY DEFINER` fonksiyon **yok** (`0012` iki tane getirmisti),
- zamanlayici **yok**,
- `attempt_count` / `next_attempt_at` / `dead_lettered_at` **yok**.

Yeniden deneme mekanizmasi kurulmadi cunku cagiran bir **insandir ve
oradadir**: cagri coktugunde 502 gorur, isterse tekrar dener. Altyapiya
tasinacak olan sey, kullanicinin zaten yaptigi seydi.

`0019` tek bir tablodur ve geri almasi tek bir `DROP`tur.

### 2. Uc fren, ucu de farkli bir israfi keser

| Fren                 | Neyi baglar                    | Nerede                                                           |
| -------------------- | ------------------------------ | ---------------------------------------------------------------- |
| **Oran siniri** (T0) | Saatte kac kez uretilebilecegi | `generate_company_summary` kovasi                                |
| **Israf freni**      | GEREKSIZ cagriyi tumden keser  | `source_watermark` karsilastirmasi                               |
| **Baglam tavani**    | GEREKLI cagrinin buyuklugu     | `CRM_SUMMARY_CONTEXT_INTERACTIONS` + `..._CHARS_PER_INTERACTION` |

Ucu birbirinin yerine gecmez. ADR-0029 §5'in bilinen siniri hala gecerli —
oran siniri istek **sayisini** baglar, token harcamasini degil — ve bu ADR o
sinirin etrafindan iki ayri yoldan dolasir.

**`source_watermark`** kaynaklarin bugunku imzasidir:

```
{gorusme}:{maxGorusmeCreatedAt}:{firsat}:{maxFirsatUpdatedAt}:{kisi}:{sirketUpdatedAt}
```

**Sayi ve zaman BIRLIKTE tutulur** cunku ikisi farkli degisimi yakalar:

| Degisim        | Sayi      | En buyuk zaman damgasi |
| -------------- | --------- | ---------------------- |
| Ekleme         | degisir   | ilerler                |
| **Silme**      | **duser** | degismez               |
| **Guncelleme** | degismez  | **ilerler**            |

Yalnizca zaman damgasi tutulsaydi, silinen bir gorusme ozeti bayat SAYMAZDI ve
kullanici sildigi bir gorusmeyi ozette okumaya devam ederdi. Yalnizca sayi
tutulsaydi, bir firsatin asamasinin degismesi gorunmezdi.

Imza **opaktir**: disaridan ayristirilmaz, yalnizca esitlik icin
karsilastirilir. Bu yuzden `text` saklanir ve ileride alan eklemek migration
gerektirmez — eski imzalar yenisiyle esit cikmaz, yani bir kez yeniden uretim
olur. Kabul edilmis ve ucuz bir bedel.

**POST bile ucretsiz olabilir:** imza degismemisse model hic cagrilmaz ve
`regenerated: false` doner. "Yenile"ye ust uste basmak para harcamaz. Arayuz bu
durumu kullaniciya **soylemek zorundadir** — yoksa metnin degismemesi bir hata
gibi gorunur.

### 3. Eszamanlilik claim'i — kuyruksuz

`generating_at` bir zaman damgasidir ve claim TEK deyimde alinir
(`INSERT ... ON CONFLICT DO UPDATE ... WHERE`). Iki es zamanli istek "once oku
sonra yaz" yapsaydi ikisi de claim'i bos gorur ve **model iki kez cagrilirdi**.

Claim alamayan istek **409** alir (`COMPANY_SUMMARY_GENERATION_IN_PROGRESS`).

> **Bayat ozeti dondurmek REDDEDILDI.** Kullanici "yeniledim" sanip eski metni
> okurdu — sessizce yanlis. Ustelik ilk uretimde donecek bir sey olmazdi, yani
> yine ozel bir durum gerekirdi.

**Neden boolean degil zaman damgasi:** coken bir istek `true` biraksa satir
sonsuza kadar kilitlenir ve elle mudahale gerekirdi. Iki dakikadan eski bir
claim OLU sayilir. Sure, olculen LLM suresinin (2–4 sn) cok uzerinde ve bir
insanin "bir daha deneyeyim" esiginin altinda.

Ayrica uretim coktugunde claim **acikca birakilir**; birakilmasaydi kullanici
"tekrar dene" dedigunde hatanin ustune ikinci bir hata (409) alirdi.

`SKIP LOCKED` burada **ise yaramaz**: o, ayni anda calisan transaction'lar
icindir. Buradaki catisma AYRI ISTEKLER arasindadir ve LLM cagrisi boyunca
transaction acik tutulmaz.

### 4. Baglam ham gorusmelerden kurulur — embedding'den DEGIL

Ozet, en son N gorusmenin **metninden** uretilir; benzerlik aramasi
yapilmaz.

Gerekce: bu bir ARAMA degil, "her seyin ozeti"dir. Retrieval, "hangi kayit bu
soruyla ilgili" sorusunu cevaplar; burada soru "bu iliski nereye geldi"dir ve
getirme olcutu alaka degil **GUNCELLIKTIR**. Embedding kullanmak dogru araci
yanlis ise kosmak olurdu.

Baglam modele **kronolojik** verilir (eski → yeni): bir iliski ozetinde "nerede
kaldik" sorusunun cevabi sondadir.

**Ucuncu bir sistem promptu yazildi** (`COMPANY_SUMMARY_SYSTEM_PROMPT`).
ADR-0030'un gerekcesi aynen gecerli: soru-cevap promptu bir soruya cevap verir
ve netlestirici soru sorabilir — ozetin soracak kimsesi yoktur; gunluk rapor
promptunun kapsami zamandir, kimlik degil. Tek prompt'a uc gorevi bindirmek
ucunu de bulaniklastirirdi.

1. kural degismedi ve pazarlik konusu degil (uydurma yasak). Burada riski
   **daha pahalidir**: bir satis temsilcisi bu metni musteriyi aramadan once
   okur; ozet konusulmamis bir seyden bahsediyorsa temsilci onu telefonda tekrar
   eder ve urunun tum degeri (kurumsal hafizaya guven) tek seferde kaybolur.

**Hic gorusmesi olmayan musteride model CAGRILMAZ** ve satir bile acilmaz
(`422`). ADR-0030'un dersi: bos baglamla model cagirmak, 1. kuralin
engellemeye calistigi riski davet etmektir. Sirket karti ve firsatlardan ozet
uretmek de **reddedildi** (Product Owner karari): uretilecek metin ekranda
ZATEN gorunen bilgiyi tekrar ederdi.

### 5. Arayuz: sayfanin ilk ekrani, AI'in kendi sesiyle

Ozet, musteri detayinin **en ustundedir** ve buyuktur (`.ai-voice-lead`, serif).

Bu bir hiyerarsi karari: musteriyi aramadan once okunacak sey telefon numarasi
degil, "nerede kaldik"tir. Kucuk bir kutuya alinsaydi urunun iddiasi ile
ekranin soyledigi celisirdi.

**Renk tarafi bu ADR'nin en gorunur sonucudur.** Bilesen
`[data-module="crm"]` agacinin icindedir, yani `bg-accent` yazsa CRM'in civit
mavisini alirdi. Almaz: `--ai-accent` / `--ai-ink` kullanilir ve hicbir modul
onlari ezemez (FRONTEND §4.8). Bu, "AI'in sesi her modulde terracotta kalir"
kuralinin **ilk gercek sinavidir** — o kural yazildiginda AI yalnizca Panel'de
konusuyordu ve Panel bir modul degildi, yani kuralin somut ornegi henuz yoktu.

Bes durum ve hicbiri digerinden turetilemez:

| Durum      | Kosul                        | Ekran                                              |
| ---------- | ---------------------------- | -------------------------------------------------- |
| YOK        | `summary === null`           | davet metni + "Ozet cikar"                         |
| VAR        | `summary !== null && !stale` | metin + tarih                                      |
| BAYAT      | `stale`                      | metin + **"sonrasinda degisiklik var"** + "Yenile" |
| URETILIYOR | `generating`                 | dugme kilitli, durum yazili                        |
| KAPALI     | `!summarizable`              | gorusme yok, uretim dugmesi cizilmez               |

> `stale` ile "ozet yok" **ayri seylerdir**. Hic uretilmemis bir ozet bayat
> DEGILDIR; ikisini birlestirmek, hic ozeti olmayan bir musteride "ozet guncel
> degil" demek olurdu.

Tazelik rozeti **metin tasir** ("sonrasinda degisiklik var"), yalnizca renk
degil — FRONTEND §4.8'in renk korlugu kurali.

### 6. Izinler: `company:summarize` — yeni bir fiil

| Uc                 | Izin                | Gerekce                         |
| ------------------ | ------------------- | ------------------------------- |
| `GET .../summary`  | `interaction:read`  | Ozet **gorusme icerigindendir** |
| `POST .../summary` | `company:summarize` | Uretmek **para harcar**         |

**Neden yeni bir fiil:** okumak bedava, uretmek ucretlidir ve bu ayrim
`read`/`write` ikilisine sigmaz — uretmek sirket kaydini degistirmez (yani
`write` degildir) ama okuma da degildir. Somut sonucu: `viewer` ozeti OKUR,
uretemez. Bir izleyicinin sayfayi yenileyerek para harcayabilmesi bir butce
deligi olurdu; okumasini engellemek ise ozelligi ondan tamamen almak olurdu.

**GET neden `company:read` degil `interaction:read`:** ozetin sizdirabilecegi
sey sirket kartindaki telefon numarasi degil, gorusme notlarinin ozetidir.
ADR-0031 §3'un guvenlik ekseninin aynisi.

> ### ⚠️ Bilinen bosluk: tek izinli decorator
>
> `@RequirePermission` **tek** bir izin alir; "company:read VE
> interaction:read" ifade **edilemez**. Bugun bu bir sorun degil — dort rolun
> dordu de ikisini birden tasiyor, yani kumeler ozdes ve davranis farki yok.
>
> Iki kume ilk kez ayrildiginda coklu-izin decorator'u gerekecek. O karar
> `platform/authz`'a aittir ve **bu ADR'de tek tarafli verilmedi** (Mutlak
> Kural 1: her prompt tek modul). Product Owner karari, 2026-08-09: bugun
> `interaction:read` ile korunur, bosluk kayda gecer.

## Sonuclar

**Olumlu**

- Musteri sayfasi artik bir kayit ekrani degil, bir **hazirlik** ekrani.
- Ayni musteriye tekrar bakmak **para harcamaz** (onbellek + israf freni).
- Es zamanli iki kullanici modeli iki kez cagirtamaz.
- Worker olmadigi icin yeni bir RLS asim yuzeyi dogmadi.

**Olumsuz / bedeller**

- **Ilk goruntuleme yavas degil ama ilk URETIM 2–4 saniyedir.** Streaming yok
  (ROADMAP §8.3 hala acik); kullanici dugmeye basip bekler.
- **Denormalize baglam:** ozet, uretildigi andaki gorusmeleri yansitir. Bayat
  oldugunda bunu SOYLER ama kendiliginden guncellenmez — bu bilincli, cunku
  otomatik guncelleme worker demektir.
- **Uc yeni env degiskeni.** Varsayilanlari makul ama ayarlanmasi gereken
  seyler cogaldi.
- **CRM ilk kez `LLMPort` kullaniyor.** Bunun sessiz bir sonucu vardi ve kod
  incelemesinde yakalandi: `CompletionFailedError` `CrmDomainExceptionFilter`e
  eklenmek zorunda kaldi, yoksa saglayici cokmesi **502 yerine islenmemis 500**
  donerdi. Bu, ayni sinif hatanin projede **dorduncu** tekrarıdır; filtre
  dosyasi artik genellenebilir kurali yaziyor: _bir modul yeni bir port
  kullanmaya basladiginda, o portun hata tipi filtreye eklenmelidir._

**Kapsam disi (ayri ADR ister)**

- Ozet gecmisi / surumleme (tek satir, tek ozet).
- Ozetin `POST /ask` baglamina katilmasi (bugun katkicilar ham gorusmeleri
  veriyor; ozeti de vermek **ikinci kez ozetlemek** olurdu).
- Streaming.
- Tenant bazli prompt ozellestirmesi.
- Otomatik tazeleme (worker karari yeniden acilmadan yapilamaz).

## Retention

`crm.company_summaries` **retention listesine girmez** (ROADMAP §8.5). Sirket
basina **tek satir** tutar ve sirket silinince cascade ile gider; yani sinirsiz
buyuyen bir tablo degildir. Bu, ADR-0030'un `daily_report_runs`'indan (tenant
basina gunde bir satir, kalici) yapisal olarak farklidir.
