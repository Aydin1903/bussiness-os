# 0009 — Storage: saglayici-bagimsiz StoragePort

- **Durum:** Kabul edildi (soyutlama) · Saglayici secimi ACIK
- **Tarih:** 2026-07-20
- **Karar veren:** Product Owner
- **Faz:** 0 (uygulama Faz 3+)

## Baglam

Belge yonetimi ve kurumsal hafiza modulleri dosya saklayacak. Nesne depolama
saglayicilari arasinda maliyet farki (ozellikle egress) buyuk ve zamanla degisiyor.

## Karar

Business logic yalnizca `StoragePort` arayuzunu bilir. MinIO (lokal), AWS S3,
Cloudflare R2 ve Azure Blob birer adapter'dir.

> Bu ADR **soyutlamayi** karara baglar, saglayiciyi degil. Production saglayicisi
> Faz 3'te ayrica secilecektir.

## Gerekce

Egress maliyeti saglayicilar arasinda kat kat degisiyor; urun buyudukce saglayici
degistirmek gercekci bir ihtiyac haline gelecek. Ayrica lokal gelistirme ve CI'in
gercek bir bulut hesabina bagimli olmamasi gerekiyor (MinIO ile karsilanir).

## Sonuclari

**Olumlu**

- Saglayici degisimi tek adapter ile sinirli.
- Lokal ve CI ortami buluta bagimli degil.
- Tenant izolasyonu anahtar duzeninde zorunlu kilinabiliyor:
  `tenants/<tenantId>/<module>/<resourceId>/<file>`.

**Olumsuz / bedeli**

- Port, S3-uyumlu API'lerin ortak paydasini temsil eder; saglayiciya ozgu
  gelismis ozellikler (yasam dongusu politikalari, olay tetikleyicileri) soyutlamanin
  disinda kalir ve altyapi tarafinda ayrica yonetilir.
- Nesne depolama kaynak-of-truth degildir: her nesnenin metadata'si PostgreSQL'de
  tutulur, yani iki yerde tutarlilik saglanmasi gerekir (yetim nesne temizligi).

## Degerlendirilen alternatifler

| Alternatif                     | Neden secilmedi                              |
| ------------------------------ | -------------------------------------------- |
| Dogrudan S3 SDK kullanimi      | Saglayici degisimi tum kodu etkilerdi        |
| Dosyalari veritabaninda tutmak | Veritabani boyutu ve yedekleme suresi patlar |

## Bu karar ne zaman yeniden gozden gecirilir?

Faz 3'te production saglayicisi secilirken.
