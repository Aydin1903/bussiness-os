# 0008 — API versiyonlama: URI path

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-20
- **Karar veren:** Product Owner
- **Faz:** 0

## Baglam

Public bir API sunulacak ve breaking change'ler kacinilmaz. Versiyonlama stratejisi
istemcilerin gecis maliyetini belirler.

## Karar

Versiyon URI path'te tasinir: `/api/v1/...`

## Gerekce

Path'teki versiyon gorunur ve test edilebilir: tarayicidan acilabilir, curl ile
denenebilir, log'da dogrudan okunur. Header tabanli versiyonlama ayni seffafligi
sunmuyor ve yanlis versiyonla yapilan cagrilar sessizce farkli davraniyor.

NestJS bunu `VersioningType.URI` ile yerlesik destekliyor.

## Sonuclari

**Olumlu**

- Versiyon her istekte gorunur; hata ayiklama kolay.
- Eski ve yeni versiyon yan yana calisabilir.
- Route seviyesinde versiyonlama mumkun — tum API'yi birden terfi ettirmek gerekmiyor.

**Olumsuz / bedeli**

- URL'ler versiyon degisiminde degisir; istemci tarafinda guncelleme gerekir.
- Saf REST/HATEOAS goruşune gore kaynak kimliginin versiyon icermesi bir kusurdur.
- Birden fazla versiyonun ayni anda bakimi maliyet uretir (deprecation disiplini sart).

## Degerlendirilen alternatifler

| Alternatif                        | Neden secilmedi                                    |
| --------------------------------- | -------------------------------------------------- |
| Header versiyonlama (`Accept`)    | Gorunur degil; yanlis versiyon sessizce kullanilir |
| Query parametresi (`?v=1`)        | Onbellekleme ve routing acisindan sorunlu          |
| Versiyonsuz + surekli geriye uyum | Uzun vadede imkansiz                               |

## Bu karar ne zaman yeniden gozden gecirilir?

Public API bir GraphQL veya sema-evrimli bir yaklasima gecerse.
