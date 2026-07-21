# 0002 — Multi-tenancy: Shared DB + Row Level Security

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-20
- **Karar veren:** Product Owner
- **Faz:** 0

## Baglam

Cok kiracili bir SaaS'ta en buyuk risk tenant veri sizintisidir (ARCHITECTURE 8).
Izolasyon stratejisi, urunun ilk gunden dogru kurmasi gereken karardir; sonradan
degistirmek tum veri erisim katmanini yeniden yazmak demektir.

## Karar

Asama 1: tek veritabani, tek schema, **PostgreSQL Row Level Security**.
Asama 2 (Enterprise): ayni kod, tenant'a ozel veritabani.

Gecis, `TenantConnectionResolver` soyutlamasi ile tek bir noktada cozulur.

## Gerekce

RLS, izolasyonu **veritabani seviyesinde** zorunlu kilar. Uygulama katmanindaki
`WHERE tenant_id = ?` disiplini bir gun unutulur; RLS unutulamaz.

Tenant basina veritabani ile baslamak, birkac yuz tenant'ta operasyonel olarak
tasinamaz hale gelir (migration, yedekleme, baglanti havuzu sayisi).

## Sonuclari

**Olumlu**

- Izolasyon veritabani tarafindan garanti ediliyor, uygulama hatasi veri sizdirmiyor.
- Tek migration, tek yedekleme, tek baglanti havuzu.
- Enterprise'a gecis yeniden yazma gerektirmiyor.

**Olumsuz / bedeli**

- RLS yalnizca dogru kurulursa calisir: `FORCE ROW LEVEL SECURITY` sart ve
  uygulama **tablo sahibi olmayan** bir rolle baglanmali. Tablo sahibi politikalari
  bypass eder. Bu, sessizce yanlis yapilabilecek bir ayrintidir.
- Her sorgu tenant context'i altinda calismak zorunda; context kurulmamis bir
  cron/queue isi veriye erisemez.
- "Gurultulu komsu" (noisy neighbor) riski paylasilan veritabaninda mevcut.

## Degerlendirilen alternatifler

| Alternatif                 | Neden secilmedi                                                  |
| -------------------------- | ---------------------------------------------------------------- |
| Tenant basina schema       | Migration sayisi tenant sayisiyla buyur; yonetilemez             |
| Tenant basina veritabani   | Bugun icin operasyonel olarak asiri pahali; Asama 2'ye birakildi |
| Yalnizca uygulama filtresi | Tek bir unutulan WHERE tum veritabanini acar                     |

## Bu karar ne zaman yeniden gozden gecirilir?

Bir tenant'in veri hacmi veya uyumluluk talebi (veri ikametgahi, izole yedekleme)
paylasilan modeli imkansiz kildiginda — o tenant Asama 2'ye tasinir, digerleri kalir.
