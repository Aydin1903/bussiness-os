# 0003 — ORM: Drizzle

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-20
- **Karar veren:** Product Owner
- **Faz:** 0

## Baglam

ADR-0002 ile RLS'e dayali izolasyon secildi. RLS, tenant context'inin **ayni
transaction icinde** `SET LOCAL` ile kurulmasini gerektirir. Bu, ORM'den acik
transaction ve baglanti kontrolu ister.

## Karar

ORM olarak Drizzle kullanilir.

## Gerekce

Drizzle, uretilen SQL'i ve kullanilan baglantiyi gizlemez. Hangi sorgunun hangi
baglantida ve hangi transaction icinde calistigi ongorulebilir — RLS'in guvenilir
olmasi tam olarak buna bagli.

Ayrica sema TypeScript ile tanimlaniyor ve tipler sorgudan **turetiliyor**; ayri
bir kod uretim adimi ve senkronizasyon sorunu yok.

## Sonuclari

**Olumlu**

- `SET LOCAL app.current_tenant_id` guvenle uygulanabiliyor.
- Uretilen SQL ongorulebilir; performans sorunu okunabilir.
- Migration'lar duz SQL — elle yazilip review edilebiliyor (DEVELOPMENT_RULES 6).

**Olumsuz / bedeli**

- Prisma'ya gore ekosistem daha genc, ornek ve makale sayisi daha az.
- Yuksek seviye kolayliklar (otomatik iliski yukleme gibi) daha azdir; daha cok
  SQL bilgisi gerektirir. Bu ekip icin bedel degil, tercih sebebidir.

## Degerlendirilen alternatifler

| Alternatif | Neden secilmedi                                                          |
| ---------- | ------------------------------------------------------------------------ |
| Prisma     | Baglanti/transaction yonetimi soyutlanmis; RLS ile birlestirmek kirilgan |
| TypeORM    | Bakim gecmisi ve tip guvenligi zayif; otomatik senkronizasyon riski      |
| Ciplak SQL | Tip guvenligi ve refactor destegi yok                                    |

## Bu karar ne zaman yeniden gozden gecirilir?

Drizzle'in bakimi durursa veya RLS ile transaction kontrolunde cozulemeyen bir
kisit ortaya cikarsa.
