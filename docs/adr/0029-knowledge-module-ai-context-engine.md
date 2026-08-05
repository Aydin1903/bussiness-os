# 0029 — Faz 4: Knowledge Modulu + AI Context Engine v1

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-02
- **Karar veren:** Product Owner
- **Faz:** 4

## Baglam

Faz 4'un onundeki kapi kosulu (tenant outbox tuketicisi) kapandi. Bu ADR,
projenin ilk gercek is modulunu ve AI'in ilk somut uygulamasini tanimliyor.

Kapsam **bilincli dar**: manuel metin girisi + serbest soru-cevap. Dosya eki,
email entegrasyonu, otomatik ozet kartlari, per-tenant saglayici secimi, Queue,
Cache — kapsam disi, ayri ADR'ler gerektirecek.

## Karar

### 1. Veri modeli — yeni `knowledge` semasi

Tenant-scoped; RLS `ENABLE` + `FORCE` (MT §12.2 standart sablonu).

| Tablo                   | Kolonlar                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `knowledge.notes`       | `id`, `tenant_id`, `author_user_id`, `title` (nullable), `body`, `created_at`, `updated_at`                       |
| `knowledge.note_chunks` | `id`, `tenant_id` (denormalize), `note_id` (FK), `chunk_index`, `content`, `embedding vector(1536)`, `created_at` |

Chunk'lar **ayri tabloda** tutulur.

**Index:** `note_chunks.embedding` uzerinde **HNSW** (IVFFlat degil).

### 2. Chunking

~500 token esigi, **paragraf sinirina saygili** bolme.

### 3. IKI AYRI PORT — ADR-0007'nin ilk somut uygulamasi

```
EmbeddingPort:  embed(text): Promise<number[]>
LLMPort:        complete({ systemPrompt, userMessage, context: string[] }): Promise<string>
```

Ikisi **ayri port'tur** ve ayri cozumlenir. Bir adapter ikisini birden implement
EDEBILIR, ama etmek ZORUNDA DEGILDIR — **ve bu projede etmiyor:**

| Port                      | Adapter                  | Saglayici / model                 |
| ------------------------- | ------------------------ | --------------------------------- |
| `LLMPort` (`complete`)    | `DeepSeekLlmAdapter`     | DeepSeek — `deepseek-v4-flash`    |
| `EmbeddingPort` (`embed`) | `OpenAiEmbeddingAdapter` | OpenAI — `text-embedding-3-small` |

`DeepSeekLlmAdapter` **YALNIZCA** `LLMPort`'u implement eder; `embed` metodu
YOKTUR ve olmayacaktir — DeepSeek'in embeddings uc noktasi yoktur (canli
dogrulama: bkz. "Not — canli API dogrulamasi"). `EmbeddingPort` ayri bir
`OpenAiEmbeddingAdapter` tarafindan implement edilir.

Bu, §3'un bolunme gerekcesinin **ilk gunden dogru cikmasidir**: iki port iki
FARKLI saglayiciya cozuluyor. Tek port olsaydi tek bir adapter sinifi iki
saglayicinin istemcisini birden tasimak zorunda kalirdi.

Her ikisi de bilerek minimal: **streaming yok, function-calling yok**, hicbir
saglayiciya ozgu parametre arayuzlere SIZMAZ.

> **GENISLETILDI — [ADR-0030](0030-conversation-memory-daily-report-onboarding.md) §1.3.**
> `LLMPort.complete()` opsiyonel bir `history` parametresi kazandi (konusma
> hafizasi). Yukaridaki imza bu yuzden GUNCEL DEGILDIR; guncel hali ADR-0030'dadir.
> `EmbeddingPort` ve adapter esleme tablosu DEGISMEDI.

#### 3.1 `DeepSeekLlmAdapter` varsayilani: `thinking` KAPALI

Adapter, `complete()` cagrilarinda varsayilan olarak
`thinking: {"type": "disabled"}` gonderir.

**Gerekce:** RAG akisinda baglam ZATEN chunk'larla veriliyor (§4). Modelin ayrica
"dusunmesi" cogu soru icin gereksiz bir maliyet kalemidir — cevabin dayanagi
modelin ic muhakemesi degil, kendisine verilen chunk'lardir.

**Olculdu** (canli test, ayni trivial soru, tek fark parametre):

|                     | `thinking: disabled` | varsayilan (`enabled`)  |
| ------------------- | -------------------- | ----------------------- |
| `prompt_tokens`     | 19                   | **98**                  |
| `completion_tokens` | 1                    | **45** (43'u reasoning) |
| `total_tokens`      | **20**               | **143**                 |

**~7 kat fark.** Dikkat: maliyet yalnizca ciktida degil GIRDIDE de artiyor —
thinking modu sunucu tarafinda ek bir sistem promptu enjekte ediyor
(19 -> 98 prompt token). `reasoning_tokens` ayrica faturalanmiyor,
`completion_tokens`'in ALT KUMESIDIR ve normal cikti fiyatindan gecer.

**Bu bir ADAPTER-SEVIYESI parametredir ve `LLMPort` imzasina DOKUNMAZ.**
`thinking` DeepSeek'e ozgudur; port'a girseydi ADR-0007'nin kabul testi
kirilirdi (baska bir saglayicinin adapter'i onu tasiyamazdi). Ayni sebeple
`reasoning_effort` (`low` | `high` (varsayilan) | `max`) da adapter icinde kalir;
gerekirse orada ayarlanir.

> Ihtiyac dogarsa (ornegin "derin analiz" gerektiren bir soru tipi) thinking
> adapter icinde acilabilir — karar noktasi ADAPTER'dadir, is mantiginda degil.

### 4. Akis

**`POST /api/v1/knowledge/notes`**

1. Note kaydedilir (**T1**),
2. Chunking + embedding **senkron** calisir — transaction'in DISINDA,
3. `note_chunks` yazilir (**T2**).

**`POST /api/v1/knowledge/ask`**

> **SUPERSEDED — [ADR-0031](0031-crm-module.md) §5.2.** Uc **`POST /api/v1/ask`**
> oldu ve `platform/context`'e tasindi. Asagidaki DORT ADIM aynen gecerlidir;
> tek fark 2. adimin artik yalnizca `note_chunks`'a degil, **kayitli tum
> `RetrievalContributor`'lara** sorulmasidir. Ayrinti asagida, "Not — dort karar
> superseded".

1. Soru embed edilir,
2. pgvector ile **tenant-scoped** en yakin ~8 chunk cekilir,
3. `LLMPort.complete()` cagrilir,
4. Cevap + **kaynak not id'leri** doner.

### 5. Rate limiting

**Kullanici + tenant** bazli (IP DEGIL), saatlik pencere, asilirsa `429`:

| Uc nokta                | `action`      | Limit             | Ne tur bir sinir |
| ----------------------- | ------------- | ----------------- | ---------------- |
| `POST /knowledge/ask`   | `ask`         | 30/saat/kullanici | **BUTCE**        |
| `POST /knowledge/notes` | `create_note` | 60/saat/kullanici | **SIGORTA**      |

Iki eylem **AYRI KOVADIR**: `/ask` payini tuketmek not eklemeyi engellemez.

**Neden `/notes` de dahil** (kapsam 2026-08-04'te genisletildi). Ilk tasarim
yalnizca `/ask`'i kapsiyordu; bu eksikti. Uzun bir not **cok sayida chunk**
uretir ve her chunk **bir embedding cagrisidir** — 20 parcali bir not, tek bir
`/ask` isteginden (1 embedding + 1 completion) pahaliya patlayabilir. Projenin
en pahali ucunu korurken yanindaki daha pahali olabilecek ucu acik birakmak,
korumayi anlamsiz kilardi.

**Neden 60 > 30 — ve neden bu "notlar daha ucuz" DEMEK DEGIL.** Yukaridaki
gerekce zaten tersini soyluyor. Iki sayi farkli TURDE sinirlardir:

- `/ask` bir **butcedir**: insan gercekten 30'a yaklasabilir, cunku soru sormak
  tekrar tekrar yapilan bir eylemdir. Sinir normal kullanimi olcer.
- `/notes` bir **sigortadir**: bir insan saatte 60 anlamli not yazamaz. O
  rakama ancak bir istemci retry hatasi veya script ulasir. Sinir normal
  kullanimi degil, KACAK DONGUYU hedefler.

**Bilinen sinir: bu mekanizma ISTEK SAYISINI baglar, TOKEN HARCAMASINI degil.**
Tek bir devasa not, 60 kucuk nottan pahaliya patlayabilir ve sayac bunu gormez.
Token/karakter tabanli butce AYRI bir mekanizmadir; ihtiyac olursa ayri bir
karar olarak ele alinir.

#### 5.1 Mekanizma — sayac satiri, istek logu DEGIL

`knowledge.rate_limits`, birincil anahtari
`(tenant_id, user_id, action, window_start)` olan bir SAYAC tablosudur.
`platform.login_attempts` deseni (istek basina bir satir + `COUNT(*)`)
BILEREK tekrarlanmadi:

1. **Atomiklik.** Maliyet saldirisinin sekli es zamanliliktir. "Once say,
   sonra yaz" deseninde 100 paralel istek ayni sayiyi okur ve hepsi gecer.
   Tek deyimlik `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` sayim ile
   artirmayi ayni satir kilidinin altina alir.
2. **Buyume.** Log deseni kullanici basina saatte 30-60 satir yazardi; sayac
   kullanici + eylem basina saatte BIR satir tutar.

Kaybedilen sey "hangi istek ne zaman geldi" izidir; amac maliyet kontrolu
oldugu icin gerekli gorulmedi.

**Pencere SABIT saat dilimidir** (`date_trunc('hour', now())`), kayan degil.
Bedeli acikca: sinir ihlali penceresi — 10:59'da 30, 11:00'de 30 istek, yani
iki dakikada butcenin IKI KATI. Kabul edildi cunku bu rakamlar sert bir butce
degil yumusak bir frendir. Yukseltme yolu tabloyu DEGISTIRMEDEN acik: iki
kovali agirlikli sayac (Cloudflare deseni), yalnizca okuma formulu degisir.

**Sayac pahali isten ONCE ve KENDI transaction'inda artar** (T0). Sebep,
projede tekrarlanan transaction disiplininin aynisidir: sayac is
transaction'ina girseydi, hata halinde GERI ALINIRDI ve hata ureten istekler
bedava olurdu — bir hata dongusu sinirsiz para harcayabilirdi.

**Basarisiz istek de kotadan duser.** Cagri yapildiysa para harcanmistir ve
"iade" mantigi sayaci yeniden yarisa acardi. Kabul edilen bedel: uzun bir
saglayici kesintisinde kullanici kotasi yanar; pencere bir saat oldugu icin
kendiliginden iyilesir.

Domain dogrulamasi (bos govde gibi) T0'dan ONCE calisir: `422` alan bir istek
saatlik paydan DUSMEZ.

## Gerekce

**1. Chunk'lar neden ayri tablo.** Embedding'in yasam dongusu, note'un yasam
dongusunden BAGIMSIZDIR: model veya saglayici degistiginde embedding yeniden
hesaplanir, ama note'un kendisi degismez.

**1. Neden HNSW, IVFFlat degil.** Olcek gerekcesi: veri buyudukce sorgu
performansi daha YUMUSAK bozunur. Urun yuz binlerce kullanici hedefliyor.

**2. Neden ~500 token.** RAG sistemlerinde kanitlanmis bir baslangic noktasidir.
Cok buyuk chunk **gurultulu baglam**, cok kucuk chunk **parcali baglam** getirir.

**3. Neden IKI PORT, tek `LLMPort` degil.** Embedding'in yasam dongusu
completion'inkinden BAGIMSIZDIR — ve bu ayrimi bu ADR zaten §1'de
`notes`/`note_chunks` tablolarini ayirirken gerekce olarak kullaniyor. Ayni akil
yurutme PORT SINIRINDA da gecerlidir ve orada da uygulanir:

|                 | Embedding                                            | Completion                   |
| --------------- | ---------------------------------------------------- | ---------------------------- |
| Ciktisi         | **Saklanan, surumlu veri** — `note_chunks.embedding` | Durumsuz bir yanit           |
| Model degisince | Tum chunk'lar **yeniden uretilir**; `notes` degismez | Hicbir sey yeniden uretilmez |
| Boyut varsayimi | `vector(1536)` kolonunu BAGLAR                       | Baglamaz                     |

Tek port, bu iki bagimsiz karari birbirine yapistirirdi: chat saglayicisi
degistiginde embedding kolonuna dokunmak gerekmemeli.

Ayrica tek port ortuk bir varsayim tasir — **"bir saglayici iki isi de yapar"** —
ve bu varsayim garanti degildir. Sunmayan bir saglayici secildiginde elde iki
kotu secenek kalirdi: (a) `embed()` hata firlatir ve port sozlesmesi yalan
soyler, (b) adapter'in icine sessizce IKINCI bir saglayicinin istemcisi
gizlenir — ki bu tam olarak ADR-0007'nin onlemek icin var oldugu gizli
bagimliliktir.

**3. Neden minimal arayuz.** ADR-0007'nin kabul testi: yeni saglayici eklemek
yalnizca yeni bir adapter yazmayi gerektirmeli, business logic'te tek satir
degismemeli. Streaming ve function-calling arayuze bugunden girseydi, ilk
saglayicinin bicimi soyutlamaya kacardi.

**4. Neden embedding transaction'in disinda.** Pahali bir ag cagrisi boyunca
veritabani baglantisi TUTULMAZ.

**5. Neden IP degil kullanici+tenant.** Buradaki amac kaba kuvvet korumasi degil
**maliyet kontroludur**: her istek olculebilir bir para harcamasidir ve harcamayi
yapan kullanicidir, adres degil.

## Kapsam disi (bugun yapilmiyor)

Dosya eki · email entegrasyonu · otomatik ozet kartlari · per-tenant saglayici
secimi · Queue · Cache · hassas veri redaksiyonu (Faz 6 KVKK kontrol noktasinda
ele alinacak).

## Bilinen sinirlar

- **Not guncelleme henuz yok** — geldiginde chunk yeniden hesaplama gerekir.
- **Senkron embedding**, hacim artinca outbox'a tasinacak.
- **8 chunk / 30 istek-saat rakamlari tahminidir**, kullanim verisiyle kalibre
  edilecek.
- **Iki saglayiciya baglilik**: sistem artik chat icin DeepSeek'e, embedding icin
  OpenAI'a bagli. Biri kesintiye girerse ilgili akis durur (`ask` her ikisine de
  ihtiyac duyar, `notes` yalnizca embedding'e). Fallback zinciri bugun YOK.
- **"CHUNK'SIZ NOT" MUMKUNDUR** — §4'un iki transaction'li akisinin dogrudan
  sonucu. Ayrinti asagida.

### Bilinen sinir: chunk'siz not

§4 sunu soyler: T1 (not kaydi) -> transaction DISINDA embedding -> T2 (parcalar).
T1 COMMIT OLDUKTAN SONRA embedding cokerse ortaya **notu olan ama parcasi olmayan**
bir kayit cikar.

**Neden boyle birakildi:**

| Alternatif                | Neden secilmedi                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------- |
| Tek transaction           | Pahali ag cagrisi boyunca DB baglantisi TUTULURDU — §4'un var olma sebebini iptal eder |
| Notu geri almak           | T1 zaten commit; "geri alma" ikinci bir DELETE demektir ve o da cokebilir              |
| `notes.indexed_at` kolonu | Sema degisikligi; turetilebilir bir bilgiyi kaliciya yazmak (asagi)                    |

**Davranis:** hata YUZEYE CIKAR (`502`), not **SILINMEZ**. Istemciye donen metin
acikca "not kaydedildi ancak indekslenemedi" der — genel bir hata donmek,
kullanicinin notu yeniden yazmasina ve MUKERRER kayda yol acardi.

**Sonucu:** o not `/ask` tarafindan ASLA bulunamaz. Sessiz bir kayip DEGILDIR
(istek 5xx aldi) ama kalici bir bosluktur.

**Tespit edilebilir kalir — ek kolon GEREKMEZ.** Yetim notlar turetilebilir bir
sorgudur:

```sql
SELECT n.id, n.tenant_id, n.created_at
FROM knowledge.notes n
LEFT JOIN knowledge.note_chunks c ON c.note_id = n.id
WHERE c.id IS NULL;
```

`indexed_at` gibi bir kolon eklemek, bu sorgunun zaten verdigi bilgiyi ikinci bir
dogruluk kaynagina kopyalamak olurdu — ve iki kaynak zamanla birbirini yalanlar
(`daily_report_runs`'ta `status` kolonunu reddederken verilen ayni gerekce,
ADR-0030 §2.1).

> **YENIDEN-INDEKSLEME ISI, FAZ 5 ONCESI AYRI BIR SLICE OLARAK ELE ALINMALIDIR.**
>
> Yukaridaki sorgu tespit eder ama DUZELTMEZ. Yetim notlari bulup embedding'lerini
> yeniden ureten bir surec gerekir ve ayni surec **model degisimi** senaryosunu da
> karsilar (ADR-0029: "model veya saglayici degistiginde embedding yeniden
> hesaplanir") — yani iki ihtiyac tek islar.
>
> **Neden Faz 5'ten ONCE:** Faz 5 modulleri bu deseni ikinci ve ucuncu kez
> uygulayacak. Yeniden-indeksleme yoksa her yeni modul ayni boslugu kopyalar ve
> borc modul sayisiyla carpilir.

## Sonuclari

**Olumlu**

- Projenin ilk gercek is modulu ve AI'in ilk somut uygulamasi acilir.
- ADR-0007'nin port/adapter disiplini teoriden cikip ilk kez uygulanir
  (`EmbeddingPort` + `LLMPort`); soyutlamanin gercekten saglayici-bagimsiz olup
  olmadigi ancak boyle sinanir.
- Dar kapsam, modulun AI'a baglam uretme desenini kucuk bir yuzeyde kanitlar;
  Faz 5 bu deseni ikinci kez uygular.
- **Port bolunmesi ilk gunden karsiligini verdi:** iki port iki FARKLI
  saglayiciya cozuluyor (DeepSeek + OpenAI) ve bu, hicbir adapter'a ikinci bir
  saglayici gizlemeden mumkun oldu.

**Olumsuz / bedeli**

- Senkron embedding, not kaydetme istegini embedding saglayicisinin gecikmesine
  bagli hale getirir; saglayici yavaslarsa kullanici bekler.
- `vector(1536)` boyutu bir saglayici/model bagliligidir: `text-embedding-3-small`
  degisirse kolon ve TUM embedding'ler yeniden uretilir. Boyut bugun DOGRULANMIS
  bir olcudur (bkz. "Not — canli API dogrulamasi"), ama kalici degil — modele
  bagli.
- Not guncelleme olmadigi icin urun eksik hissettirir; kullanici duzeltme icin
  silip yeniden yazmak zorunda kalir.

## Degerlendirilen alternatifler

| Alternatif                                             | Neden secilmedi                                                                                                                                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Embedding'i `notes` tablosunda tutmak                  | Embedding'in yasam dongusu note'unkinden bagimsiz; model degisince tum satirlar yeniden yazilirdi                                                                                                                         |
| IVFFlat index                                          | Veri buyudukce sorgu performansi daha SERT bozunur; urun yuz binlerce kullanici hedefliyor                                                                                                                                |
| Daha buyuk/kucuk chunk esigi                           | Cok buyuk gurultulu baglam, cok kucuk parcali baglam uretir; ~500 token kanitlanmis baslangic                                                                                                                             |
| Streaming + function-calling'i arayuze bugunden koymak | Ilk saglayicinin bicimi soyutlamaya kacardi; ADR-0007'nin kabul testi kirilirdi                                                                                                                                           |
| **Tek `LLMPort`** (`embed` + `complete` birlikte)      | "Bir saglayici iki isi de yapar" varsayimini kodlar; sunmayan bir saglayicida ya port sozlesmesi yalan soyler ya da adapter icine ikinci saglayici gizlenir. Ayrica embedding boyutu kararini chat saglayicisina baglardi |
| Embedding'i transaction icinde yapmak                  | Pahali ag cagrisi boyunca DB baglantisi tutulurdu                                                                                                                                                                         |
| IP bazli rate limit                                    | Amac maliyet kontrolu; harcamayi yapan kullanicidir, adres degil                                                                                                                                                          |

## Bu karar ne zaman yeniden gozden gecirilir?

- **Hacim artinca:** senkron embedding outbox'a tasinir (bkz. Bilinen sinirlar).
- **Kullanim verisi birikince:** 8 chunk ve 30 istek/saat rakamlari kalibre edilir.
- **Not guncelleme eklenince:** chunk yeniden hesaplama stratejisi karara baglanir.
- **Yeniden-indeksleme slice'i yazilinca:** "chunk'siz not" bilinen siniri
  KAPANIR (yalnizca tespit edilebilir olmaktan cikip duzeltilebilir olur).
- **Model veya saglayici degisince:** `vector(1536)` boyutu ve embedding yeniden
  uretim yolu yeniden degerlendirilir. Yeniden-indeksleme slice'i bu senaryoyu
  da karsilar — iki ihtiyac tek is. `text-embedding-3-small` yerine baska bir
  model secilirse kolon boyutu ve tum saklanan vektorler etkilenir.
- **DeepSeek bir embeddings uc noktasi sunarsa:** tek saglayiciya inmek
  degerlendirilebilir — ama port bolunmesi KORUNUR; degisen yalnizca
  `EmbeddingPort`'un hangi adapter'a cozuldugudur.
- **Per-tenant saglayici secimi gundeme gelince:** `LLMPort`'un cozumlenme yolu
  (tenant bazli adapter secimi) ayri bir ADR gerektirir.

## Not — §3 port yuzeyi ikiye bolundu (2026-08-02)

**Product Owner karari.** ADR "Kabul edildi" durumundayken §3 DEGISTI: tek bir
`LLMPort` yerine `EmbeddingPort` + `LLMPort`. Degisiklik sessizce yapilmadi,
burada kayda geciyor.

**Neyi degistirdi:** yalnizca port SINIRINI. Veri modeli, chunking, akis ve rate
limiting kararlarinin hicbiri degismedi. §4'teki akis aynen gecerlidir; tek fark,
"soru embed edilir" adiminin artik `EmbeddingPort`'a, `complete()` cagrisinin
`LLMPort`'a gitmesidir.

**Neden ilk yazimda gozden kacti:** ADR, `DeepSeekLlmAdapter`'in iki metodu da
implement edecegini varsayiyordu. Bu varsayim, **ilk somut saglayicida** kirilma
riski tasiyor: DeepSeek'in embeddings endpoint'i olup olmadigi o an dogrulanmis
DEGILDI. Varsayim kirilirsa tek port'la elde iki kotu secenek kalirdi —
`embed()`'in hata firlatmasi (port sozlesmesi yalan soyler) veya adapter icine
ikinci bir saglayicinin gizlenmesi (ADR-0007'nin onlemek icin var oldugu gizli
bagimlilik).

Bolunme, bu riski tasarimla karsilar: embedding saglayicisi chat
saglayicisindan farkli cikarsa **hicbir sey degismez**, yalnizca iki port farkli
adapter'lara cozulur.

> **DOGRULANDI — risk gercek cikti.** Ayni gun yapilan canli API testinde
> DeepSeek'in embeddings uc noktasinin OLMADIGI olculdu; embedding OpenAI'a
> cozuldu. Yani bolunme teorik bir onlem degil, ILK GUN devreye giren bir
> gereklilikti. Bkz. "Not — canli API dogrulamasi".

**Ilgili surec duzeltmesi:** DeepSeek, bu ADR yazildiginda ADR-0007'nin ve
`CLAUDE.md`'nin onaylanmis saglayici listelerinde YOKTU. Ayni tarihte ikisine de
eklendi (Product Owner karari, maliyet-performans gerekcesi) — bkz. ADR-0007
"Not — saglayici listesine DeepSeek eklendi".

## Not — canli API dogrulamasi (2026-08-02)

§3'un adapter esleme tablosu ve `vector(1536)` boyutu **varsayim degil, olculmus
gercektir**. Iki canli API cagrisiyla dogrulandi:

| Test            | Istek                                                                        | Sonuc                                                                                  |
| --------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Chat/completion | `POST https://api.deepseek.com/chat/completions`, `model: deepseek-v4-flash` | **HTTP 200** — gercek yanit dondu (`object: chat.completion`, `finish_reason: length`) |
| Embeddings      | `POST https://api.openai.com/v1/embeddings`, `model: text-embedding-3-small` | **HTTP 200** — `data[0].embedding` **1536 eleman**, tipi `number`                      |

**DeepSeek'in embeddings uc noktasi YOKTUR.** Ayni oturumda dogrulandi:
`POST /embeddings` ve `POST /v1/embeddings` -> **HTTP 404, bos govde**; var
olmayan bir yol (`/bu-yol-yok`) ile BIREBIR ayni yanit. Ayrimin guvenilir
olmasinin sebebi: o sirada hesap bakiyesi sifirdi ve VAR OLAN bir uc nokta
(`/chat/completions`) `402 Insufficient Balance` donuyordu — yani 404 "bakiye
yok" degil "yol tanimli degil" demekti. `GET /models` de yalnizca
`deepseek-v4-flash` ve `deepseek-v4-pro` listeliyor, hicbir embedding modeli yok;
resmi dokumantasyon da embeddings uc noktasi belgelemiyor.

**Sonuc:** `vector(1536)` DEGISMIYOR — `text-embedding-3-small`'in gercek cikti
boyutu 1536'dir ve olculerek dogrulanmistir. Kolon bir OpenAI varsayimi tasiyordu
ve o varsayim artik ONAYLANMIS bir karardir (Product Owner: embedding saglayicisi
OpenAI). Chat completion DeepSeek'te KALIYOR.

> Bu not, ADR'nin daha onceki "Bilinen sinirlar" maddesindeki _"embedding boyutu,
> gercek saglayici secimi dogrulanana kadar GECICIDIR"_ ifadesini KAPATIR. O
> madde kaldirildi; yerini iki saglayiciya baglilik riski aldi.

## Not — liste ucu artik VAR (2026-08-04)

`GET /api/v1/knowledge/notes` yazildi. Bu ADR liste ucunu **bilerek bos
birakmisti** (ADR-0029 §5.1'in `/notes/exists` gerekcesinde: "liste ucu
sayfalama, siralama ve projeksiyon kararlari demektir ve hicbiri bu ise ait
degil"). O gerekce hala dogru — is degisti: `/app/knowledge` ekrani gelince
liste GEREKLI oldu ve kararlar artik somut bir ihtiyaca dayaniyor.

**Sayfalama `limit`/`offset`**, `GET /me/memberships` ile birebir ayni desen
(`{ items, total, limit, offset }`). Cursor icat EDILMEDI: projede zaten bir
liste konvansiyonu var ve ikinci bir paradigma, her yeni listede "hangisini
kullanacagiz" sorusunu dogururdu.

> Bilinen bedel: `offset` derin sayfalarda yavaslar ve sayfalama SIRASINDA yeni
> not eklenirse kayma olur. Yeniler basa eklendigi ve kimse derin sayfaya
> gitmedigi icin kabul edildi; cursor'a gecis yolu acik.

**Siralama `created_at DESC, id DESC`.** Tie-breaker SART: onboarding yedi notu
saniyeler icinde yazar ve esitlikte kararsiz siralama, sayfalamada bir notun
iki kez ya da hic gorunmesi demektir.

### Bilinen sinir: liste TAM METIN dondurmez

`items[].preview` govdenin ilk `KNOWLEDGE_NOTE_PREVIEW_LENGTH` karakteridir
(varsayilan 280); `bodyLength` tam uzunlugu verir, yani istemci metnin
kirpilip kirpilmadigini TAHMIN ETMEZ.

Gerekce: bir not 500.000 karaktere kadar cikabilir (`MAX_BODY_LENGTH`), 20
notun tam govdesi tek yanitta megabaytlar demektir. Kirpma VERITABANINDA
yapilir (`substring`), uygulamada degil — aksi halde tasarrufun tamami
kaybolurdu.

**Sonucu:** tam metni gosteren bir **not detay ucu YOKTUR** ve bu bilinen
sinirdir. Ihtiyac dogdugunda ayri bir uctur (`GET /knowledge/notes/:id`).

## Not — yeniden indeksleme MEKANIZMASI yazildi (2026-08-05)

"Chunk'siz not" bilinen siniri artik ONARILABILIR. Bu ADR "yeniden-indeksleme
isi Faz 5 oncesi ayri bir slice olarak ele alinmali, LEFT JOIN ile tespit
edilebilir kaliyor" diyordu; ikisi de yapildi.

| Uc                               | Ne                                                           |
| -------------------------------- | ------------------------------------------------------------ |
| `GET /knowledge/notes/unindexed` | `{ count }` — `notes LEFT JOIN note_chunks WHERE id IS NULL` |
| `POST /knowledge/reindex`        | en fazla `KNOWLEDGE_REINDEX_BATCH_SIZE` notu onarir          |

**Is listesi TURETILMISTIR, saklanmaz.** Ayri bir "onarilacaklar" tablosu ve
deneme sayaci YOK: chunk'in yoklugu is listesinin KENDISIDIR. Sayac/backoff,
OTOMATIK ve sonsuz bir donguyu dizginlemek icin vardir (outbox, gunluk rapor);
burada tetikleyici ACIK bir istektir ve oran sinirina tabidir.

**6. dar rol GEREKMEDI.** Hem tespit hem onarim tenant-scoped'dir; RLS ve
`businessos_app` yeter. Tenant'lar ARASI otomatik bir supurucu 6. bir dar rol
gerektirirdi ve [ADR-0030](0030-conversation-memory-daily-report-onboarding.md)
§2.4'un "ertelenemez genellestirme" kuralini tetiklerdi. **Supurucu BILEREK
yapilmadi**: genellestirme kendi basina bir istir ve bu isin icine
gizlenmemelidir. Otomatik supurme istenirse, o slice genellestirmeyi de icerir.

**Oran siniri `create_note` kovasini PAYLASIR** — ayni maliyet profili. Ayri bir
kova, onarimi butcesiz bir yan kapiya cevirirdi.

**Idempotency bedava:** `UNIQUE (note_id, chunk_index)` (migration 0011) zaten
"yeniden uretim idempotent olsun" diye konmustu; es zamanli iki onarimda
ikincisi kisitla reddedilir ve o not `failed` sayilir — veri BOZULMAZ.

### Model degisimi — tasarim acik, bu slice'ta YAPILMADI

Is listesi turetilmis oldugu icin model degisiminde yalnizca YUKLEM degisir
("chunk'i yok" -> "chunk'i ESKI modelden"); onarim yolu aynen kalir.

⚠️ Bugun `note_chunks`'ta model/surum kolonu **YOKTUR**. Model degisimi bu
kolonun eklenmesini gerektirir — ama bu slice'ta yazilan hicbir sey onu
engellemez.

## Not — DORT KARAR SUPERSEDED: [ADR-0031](0031-crm-module.md) (2026-08-05)

Faz 5'in ilk modulu (CRM) bu ADR'nin dort kararini gecersiz kildi. **Metinler
yukarida silinmedi**; asagidaki tablo hangisinin nereye tasindigini soyler.
Sebep tektir ve dordunde de aynidir: bu ADR yazildiginda Knowledge **tek is
modulu** oldugu icin, aslinda platforma ait olan seyler onun icinde durabiliyordu.
Ikinci modul o ayrimi zorunlu kildi.

| Bu ADR'de                                     | Nerede         | Bugun                                                    |
| --------------------------------------------- | -------------- | -------------------------------------------------------- |
| `POST /api/v1/knowledge/ask`                  | §4 okuma akisi | **`POST /api/v1/ask`** (ADR-0031 §5.2)                   |
| `knowledge.rate_limits` tablosu               | §5.1           | **`platform.rate_limits`** (§4.2)                        |
| `EmbeddingPort`/`LLMPort` Knowledge'in icinde | §3             | **`shared/`** + adapter'lar `infrastructure/ai/`'da (§4) |
| `knowledge:ask` permission'i                  | katalog        | **`context:ask`** (§5.3)                                 |

**§3'un port AYRIMI degismedi** — iki port, iki ayri saglayici, ayni kabul
testi. Degisen yalnizca **nerede tanimlandiklaridir**: ADR-0007 "`LLMPort`
hicbir is modulunun mulku degildir" der ve bu ADR'nin onlari Knowledge'in
`application/` katmanina koymasi bir karar degil, o gunku tek tuketicinin
tesadufuydu. `chunking.ts` de ayni gerekceyle `shared/`'a tasindi.

**Retrieval ucunun tasinmasinin sebebi urun tanimidir**, kod duzeni degil:
CLAUDE.md'nin CEO ornegi ("son 6 ayimizi analiz et") cross-modul bir sorudur ve
modul basina `/ask` uclariyla **yapisal olarak** cevaplanamaz. Uc artik
`platform/context`'tedir ve moduller ona `RetrievalContributor` ile katki verir;
hicbir modul digerinin semasini okumaz (Mutlak Kural 5-6 korunur).

**DEGISMEYENLER** — "her sey degisti" izlenimi yanlis olurdu: veri modeli
(`notes`/`note_chunks`) · chunking esigi ve algoritmasi · `vector(1536)` ·
HNSW + `vector_cosine_ops` · iki port ayrimi ve minimal arayuz disiplini ·
§3.1'in `thinking: disabled` adapter karari · §4'un iki transaction'li yazma
akisi · oran siniri **mekanizmasi** (sayac satiri, sabit saat penceresi, T0'da
artirma, basarisiz istegin de kotadan dusmesi) · §5'in limit rakamlari · liste
ucu ve yeniden indeksleme.
