# 0006 — Event: Transactional Outbox

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-20
- **Karar veren:** Product Owner
- **Faz:** 0 (uygulama Faz 4+)

## Baglam

Moduller arasi iletisim domain event ile yapilacak (ARCHITECTURE 6.1). Bir event,
onu doguran veri degisikligiyle tutarli olmak zorunda.

## Karar

Domain event'ler, onlari doguran degisiklikle **ayni transaction icinde** bir
outbox tablosuna yazilir. Ayri bir surec outbox'i okuyup event bus'a yayinlar.

## Gerekce

"Once commit et, sonra yayinla" yaklasiminda process commit ile yayin arasinda
coker ve sistem kalici olarak tutarsiz kalir. Bu, dagitik sistemlerin en yaygin
sessiz hatasidir ve genellikle aylar sonra veri tutarsizligi olarak fark edilir.

Outbox, event yayinini veri degisikligiyle ayni atomik islemin parcasi yapar.

## Sonuclari

**Olumlu**

- Veri degisikligi ile event yayini arasinda tutarsizlik olusamaz.
- Yayinci coksede event kaybolmaz; outbox'ta bekler.
- Mikroservise gecerken ayni desen network bus ile calisir, handler kodu degismez.

**Olumsuz / bedeli**

- Teslimat **at-least-once**'tir: handler'lar idempotent olmak ZORUNDA. Bu, her
  handler yazarken akilda tutulmasi gereken bir yuktur.
- Ek bir tablo, ek bir arka plan sureci ve onun izlenmesi gerekir.
- Event yayininda kucuk bir gecikme olusur (anlik degil, neredeyse anlik).

## Degerlendirilen alternatifler

| Alternatif                     | Neden secilmedi                                       |
| ------------------------------ | ----------------------------------------------------- |
| Commit sonrasi dogrudan yayin  | Process cokusunde kalici tutarsizlik                  |
| Iki fazli commit (2PC)         | Operasyonel karmasiklik ve performans bedeli agir     |
| Change Data Capture (Debezium) | Bugun icin asiri altyapi; ileride degerlendirilebilir |

## Bu karar ne zaman yeniden gozden gecirilir?

Event hacmi outbox tablosunu darbogaza cevirirse CDC tabanli bir yaklasim
degerlendirilir.
