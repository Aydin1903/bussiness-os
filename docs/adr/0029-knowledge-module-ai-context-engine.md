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

| Tablo | Kolonlar |
| ----- | -------- |
| `knowledge.notes` | `id`, `tenant_id`, `author_user_id`, `title` (nullable), `body`, `created_at`, `updated_at` |
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

| Port | Adapter | Saglayici / model |
| ---- | ------- | ----------------- |
| `LLMPort` (`complete`) | `DeepSeekLlmAdapter` | DeepSeek — `deepseek-v4-flash` |
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

### 4. Akis

**`POST /api/v1/knowledge/notes`**

1. Note kaydedilir (**T1**),
2. Chunking + embedding **senkron** calisir — transaction'in DISINDA,
3. `note_chunks` yazilir (**T2**).

**`POST /api/v1/knowledge/ask`**

1. Soru embed edilir,
2. pgvector ile **tenant-scoped** en yakin ~8 chunk cekilir,
3. `LLMPort.complete()` cagrilir,
4. Cevap + **kaynak not id'leri** doner.

### 5. Rate limiting

`/knowledge/ask` icin **kullanici + tenant** bazli (IP DEGIL). Oneri:
**30 istek/saat/kullanici**, asilirsa `429`.

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

| | Embedding | Completion |
| --- | --- | --- |
| Ciktisi | **Saklanan, surumlu veri** — `note_chunks.embedding` | Durumsuz bir yanit |
| Model degisince | Tum chunk'lar **yeniden uretilir**; `notes` degismez | Hicbir sey yeniden uretilmez |
| Boyut varsayimi | `vector(1536)` kolonunu BAGLAR | Baglamaz |

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

| Alternatif | Neden secilmedi |
| ---------- | --------------- |
| Embedding'i `notes` tablosunda tutmak | Embedding'in yasam dongusu note'unkinden bagimsiz; model degisince tum satirlar yeniden yazilirdi |
| IVFFlat index | Veri buyudukce sorgu performansi daha SERT bozunur; urun yuz binlerce kullanici hedefliyor |
| Daha buyuk/kucuk chunk esigi | Cok buyuk gurultulu baglam, cok kucuk parcali baglam uretir; ~500 token kanitlanmis baslangic |
| Streaming + function-calling'i arayuze bugunden koymak | Ilk saglayicinin bicimi soyutlamaya kacardi; ADR-0007'nin kabul testi kirilirdi |
| **Tek `LLMPort`** (`embed` + `complete` birlikte) | "Bir saglayici iki isi de yapar" varsayimini kodlar; sunmayan bir saglayicida ya port sozlesmesi yalan soyler ya da adapter icine ikinci saglayici gizlenir. Ayrica embedding boyutu kararini chat saglayicisina baglardi |
| Embedding'i transaction icinde yapmak | Pahali ag cagrisi boyunca DB baglantisi tutulurdu |
| IP bazli rate limit | Amac maliyet kontrolu; harcamayi yapan kullanicidir, adres degil |

## Bu karar ne zaman yeniden gozden gecirilir?

- **Hacim artinca:** senkron embedding outbox'a tasinir (bkz. Bilinen sinirlar).
- **Kullanim verisi birikince:** 8 chunk ve 30 istek/saat rakamlari kalibre edilir.
- **Not guncelleme eklenince:** chunk yeniden hesaplama stratejisi karara baglanir.
- **Model veya saglayici degisince:** `vector(1536)` boyutu ve embedding yeniden
  uretim yolu yeniden degerlendirilir. `text-embedding-3-small` yerine baska bir
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

| Test | Istek | Sonuc |
| ---- | ----- | ----- |
| Chat/completion | `POST https://api.deepseek.com/chat/completions`, `model: deepseek-v4-flash` | **HTTP 200** — gercek yanit dondu (`object: chat.completion`, `finish_reason: length`) |
| Embeddings | `POST https://api.openai.com/v1/embeddings`, `model: text-embedding-3-small` | **HTTP 200** — `data[0].embedding` **1536 eleman**, tipi `number` |

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

> Bu not, ADR'nin daha onceki "Bilinen sinirlar" maddesindeki *"embedding boyutu,
> gercek saglayici secimi dogrulanana kadar GECICIDIR"* ifadesini KAPATIR. O
> madde kaldirildi; yerini iki saglayiciya baglilik riski aldi.
