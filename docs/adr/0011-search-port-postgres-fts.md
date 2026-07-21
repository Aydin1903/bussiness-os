# 0011 — Search: SearchPort, PostgreSQL FTS ile baslangic

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-20
- **Karar veren:** Product Owner
- **Faz:** 0 (uygulama Faz 4)

## Baglam

Kurumsal hafiza ve belge modulleri arama gerektirecek. Ayri bir arama motoru,
ikinci bir veri deposu demek: senkronizasyon, tutarsizlik ve isletme yuku.

## Karar

Business logic yalnizca `SearchPort` arayuzunu bilir. Baslangic adapter'i
**PostgreSQL Full Text Search** (`tsvector` + GIN). Meilisearch ve OpenSearch
ileride birer adapter olarak eklenebilir.

## Gerekce

Arama gercekten darbogaz olana kadar ikinci bir veri deposunun bedeli odenmemeli.
PostgreSQL FTS sifir ek altyapi ile makul bir arama sunuyor ve veri zaten orada —
senkronizasyon sorunu hic dogmuyor.

Port bugunden tanimlandigi icin gecis, bir adapter yazma isine iniyor.

## Sonuclari

**Olumlu**

- Faz 4'e kadar sifir ek altyapi ve sifir senkronizasyon riski.
- Arama sonuclari veriyle her zaman tutarli.
- Gecis yolu acik: port sabit, adapter degisir.

**Olumsuz / bedeli**

- **PostgreSQL FTS'te tipo toleransi yoktur**, alaka skorlama sinirlidir ve facet
  destegi zayiftir. Kullanicilar "Google gibi arama" beklerse bu yetersiz kalir.
- Buyuk veri hacminde GIN index bakimi yazma performansini etkiler.
- Meilisearch'e gecildiginde index yazimi outbox uzerinden kurulmak zorunda
  kalacak; bu is Faz 4'e ertelenmis bir maliyettir.

## Degerlendirilen alternatifler

| Alternatif               | Neden secilmedi                                              |
| ------------------------ | ------------------------------------------------------------ |
| Meilisearch ile baslamak | Ikinci veri deposunun bedeli, ihtiyac kanitlanmadan odenirdi |
| OpenSearch ile baslamak  | Isletme yuku bu asamada orantisiz                            |
| Arama olmadan baslamak   | Kurumsal hafiza modulu arama olmadan anlamsiz                |

## Bu karar ne zaman yeniden gozden gecirilir?

Kullanici geri bildirimi tipo toleransi/alaka kalitesini isterse veya arama
gecikmesi kabul edilemez hale gelirse — Faz 4'ten once bile olabilir.
