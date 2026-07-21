# 0005 — Monorepo: Turborepo + pnpm workspace

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-20
- **Karar veren:** Product Owner
- **Faz:** 0

## Baglam

API ve web ayni sozlesmeleri paylasiyor. Iki ayri repo, sozlesme degisikliginin
iki ayri PR'a bolunmesi ve aralarinda tutarsiz bir an olusmasi demek.

## Karar

Turborepo + pnpm workspace ile tek repo. `packages/contracts` API ve web arasindaki
tek tip kaynagidir.

## Gerekce

Sozlesme degisikligi tek commit'te her iki tarafa uygulanir ve CI ikisini birden
dogrular. Tutarsiz ara durum olusamaz.

Turborepo, gorev grafigini anlayarak yalnizca degisen paketleri yeniden
calistiriyor; monorepo'nun klasik "her sey her seyi tetikler" sorununu cozuyor.

## Sonuclari

**Olumlu**

- Atomik commit: sozlesme + API + web birlikte degisiyor.
- Tek CI, tek lint/format/tsconfig kaynagi.
- Paketler arasi tip guvenligi derleme zamaninda dogrulaniyor.

**Olumsuz / bedeli**

- Repo buyudukce CI suresi tum ekibi etkiler; onbellek disiplini sart olur.
- Uygulamalarin bagimsiz surumlenmesi ve deploy'u ek yapilandirma ister.
- Yeni gelen icin ilk kurulum, tek uygulamali bir repo'ya gore daha karmasik.

## Degerlendirilen alternatifler

| Alternatif         | Neden secilmedi                                                    |
| ------------------ | ------------------------------------------------------------------ |
| Ayri repo'lar      | Sozlesme senkronizasyonu elle; tutarsiz ara durum kacinilmaz       |
| Nx                 | Guclu ama daha agir ve daha fazla kavram getiriyor                 |
| npm/yarn workspace | pnpm'in sert bagimlilik izolasyonu (isolated linker) tercih edildi |

## Bu karar ne zaman yeniden gozden gecirilir?

Bir uygulama tamamen bagimsiz bir yasam dongusune gecerse (ayri ekip, ayri surum
takvimi) kendi repo'suna cikarilabilir.
