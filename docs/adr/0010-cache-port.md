# 0010 — Cache: saglayici-bagimsiz CachePort

- **Durum:** Kabul edildi (soyutlama) · Saglayici secimi ACIK
- **Tarih:** 2026-07-20
- **Karar veren:** Product Owner
- **Faz:** 0 (uygulama Faz 3)

## Baglam

Onbellek, olcekleme icin gerekli olacak. Ancak Faz 1'de hicbir is yuku onbellek
gerektirmiyor ve erken eklenen onbellek, gercek erisim desenleri bilinmeden yanlis
yerlere konur.

## Karar

Business logic yalnizca `CachePort` arayuzunu bilir. Redis birincil adaydir; karar
Faz 3'te verilecektir.

**Faz 1 kapsami:** Redis container'i `docker-compose.yml` icinde ayaga kalkar,
uygulama ona BAGLANMAZ ve `ioredis` bagimliligi kurulmaz. Yalnizca lokal ortam hazir bekler.

## Gerekce

Onbellegi kod tabanina erken sokmak, saglayici kararini fiilen vermek demektir.
Container'i hazir tutup kodu bagimsiz birakmak, karari gercekten acik tutar.

## Sonuclari

**Olumlu**

- Cache saglayici karari gercekten acik kaldi; kod kilitlenmedi.
- Lokal ortam Faz 3 geldiginde hazir.
- Anahtar duzeninde tenant zorunlu kilinabiliyor: `t:<tenantId>:<module>:<entity>:<id>`.

**Olumsuz / bedeli**

- Faz 1'de calisan ama kullanilmayan bir container var; gelistiricide "bu ne ise
  yariyor" sorusu dogurur. Bu ADR ve docker-compose yorumlari bu soruyu yanitlar.
- Cache, RLS'in koruyamadigi TEK veri yoludur. Tenant'siz bir anahtar yazmak
  dogrudan veri sizintisidir; bu risk Faz 3'te ozel dikkat gerektirecek.

## Degerlendirilen alternatifler

| Alternatif                        | Neden secilmedi                                |
| --------------------------------- | ---------------------------------------------- |
| Faz 1'de Redis'i koda baglamak    | Faz 3 karari fiilen simdi verilmis olurdu      |
| Redis container'ini hic eklememek | Faz 3'te lokal ortam kurulumu bastan yapilirdi |
| Uygulama ici bellek onbellegi     | Cok instance'li calismada tutarsizlik uretir   |

## Bu karar ne zaman yeniden gozden gecirilir?

Faz 3'te — saglayici secimi ve ilk onbellek kullanimi birlikte kararlastirilacak.
