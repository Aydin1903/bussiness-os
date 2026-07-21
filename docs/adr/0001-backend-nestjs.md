# 0001 — Backend: NestJS + TypeScript

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-20
- **Karar veren:** Product Owner
- **Faz:** 0

## Baglam

Uzun omurlu, cok kiracili bir SaaS platformu icin backend framework'u secilmeli.
Sistem modular monolith olarak baslayacak ve modullerin ileride ayri servislere
cikarilabilmesi gerekiyor (ARCHITECTURE 1).

## Karar

Backend NestJS + TypeScript ile yazilir.

## Gerekce

NestJS'in yerlesik dependency injection ve modul sistemi, Clean Architecture'in
gerektirdigi bagimlilik tersine cevirme (DIP) desenine dogrudan karsilik geliyor.
Port/adapter ayrimi framework ile savasarak degil, framework ile birlikte kuruluyor.

TypeScript ayrica frontend ile tek dil demek: sozlesmeler `packages/contracts`
uzerinden paylasilabiliyor ve API ile web arasindaki tip uyusmazligi derleme
zamaninda yakalaniyor.

## Sonuclari

**Olumlu**

- DI ve modul sinirlari framework tarafindan destekleniyor.
- Tek dil, tek tip sistemi, atomik commit.
- Buyuk ekosistem, olgun dokumantasyon.

**Olumsuz / bedeli**

- Decorator ve metadata yogun kullanim, ogrenme egrisi getiriyor.
- Node.js CPU-yogun islerde JVM/Go kadar iyi degil. AI cikarimi gibi agir isler
  zaten dis servislere gidecegi icin bu bedel kabul edildi.
- Framework, `domain` katmanina sizmamasi icin ESLint ile aktif olarak
  disarida tutulmak zorunda (bkz. packages/config/eslint/nest.js).

## Degerlendirilen alternatifler

| Alternatif       | Neden secilmedi                                                |
| ---------------- | -------------------------------------------------------------- |
| Express (ciplak) | DI ve modul sinirlari elle kurulurdu; disiplin insana kalirdi  |
| Fastify (ciplak) | Ayni sorun; hiz avantaji bu urunun darbogazi degil             |
| Go / Java Spring | Frontend ile dil birligi kaybolur, sozlesme paylasimi zorlasir |

## Bu karar ne zaman yeniden gozden gecirilir?

Bir modul CPU-yogun hale gelip Node.js darbogaz olursa — o modul ayri bir serviste
farkli bir dille yazilabilir. Bu, monolitin tamaminin degistirilmesini gerektirmez.
