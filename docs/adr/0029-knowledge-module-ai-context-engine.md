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

### 3. `LLMPort` arayuzu — ADR-0007'nin ilk somut uygulamasi

```
embed(text): Promise<number[]>
complete({ systemPrompt, userMessage, context: string[] }): Promise<string>
```

Bilerek minimal: **streaming yok, function-calling yok**, DeepSeek'e ozgu hicbir
parametre arayuze SIZMAZ. `DeepSeekLlmAdapter` bu iki metodu implement eder.

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

## Sonuclari

**Olumlu**

- Projenin ilk gercek is modulu ve AI'in ilk somut uygulamasi acilir.
- `LLMPort` (ADR-0007) teoriden cikip ilk kez uygulanir; soyutlamanin gercekten
  saglayici-bagimsiz olup olmadigi ancak boyle sinanir.
- Dar kapsam, modulun AI'a baglam uretme desenini kucuk bir yuzeyde kanitlar;
  Faz 5 bu deseni ikinci kez uygular.

**Olumsuz / bedeli**

- Senkron embedding, not kaydetme istegini LLM saglayicisinin gecikmesine bagli
  hale getirir; saglayici yavaslarsa kullanici bekler.
- `vector(1536)` boyutu bir saglayici/model varsayimi tasir; model degisirse
  kolon ve tum embedding'ler yeniden uretilir.
- Not guncelleme olmadigi icin urun eksik hissettirir; kullanici duzeltme icin
  silip yeniden yazmak zorunda kalir.

## Degerlendirilen alternatifler

| Alternatif | Neden secilmedi |
| ---------- | --------------- |
| Embedding'i `notes` tablosunda tutmak | Embedding'in yasam dongusu note'unkinden bagimsiz; model degisince tum satirlar yeniden yazilirdi |
| IVFFlat index | Veri buyudukce sorgu performansi daha SERT bozunur; urun yuz binlerce kullanici hedefliyor |
| Daha buyuk/kucuk chunk esigi | Cok buyuk gurultulu baglam, cok kucuk parcali baglam uretir; ~500 token kanitlanmis baslangic |
| Streaming + function-calling'i arayuze bugunden koymak | Ilk saglayicinin bicimi soyutlamaya kacardi; ADR-0007'nin kabul testi kirilirdi |
| Embedding'i transaction icinde yapmak | Pahali ag cagrisi boyunca DB baglantisi tutulurdu |
| IP bazli rate limit | Amac maliyet kontrolu; harcamayi yapan kullanicidir, adres degil |

## Bu karar ne zaman yeniden gozden gecirilir?

- **Hacim artinca:** senkron embedding outbox'a tasinir (bkz. Bilinen sinirlar).
- **Kullanim verisi birikince:** 8 chunk ve 30 istek/saat rakamlari kalibre edilir.
- **Not guncelleme eklenince:** chunk yeniden hesaplama stratejisi karara baglanir.
- **Model veya saglayici degisince:** `vector(1536)` boyutu ve embedding yeniden
  uretim yolu yeniden degerlendirilir.
- **Per-tenant saglayici secimi gundeme gelince:** `LLMPort`'un cozumlenme yolu
  (tenant bazli adapter secimi) ayri bir ADR gerektirir.
