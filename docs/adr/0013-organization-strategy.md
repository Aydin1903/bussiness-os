# 0013 — Organization Strategy: V1'de Organization entity yok

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-21
- **Karar veren:** Product Owner
- **Faz:** 2

## Baglam

Kurumsal SaaS urunlerinde sik gorulen bir model, `Tenant` ile `User` arasina bir
gruplama katmani koymaktir: Organization, departman, sube, ekip.

ADR-0012 tenant'i "bir sirket" olarak tanimladi. Dogal soru su: sirket icindeki
bolumler modellenmeli mi? Bu, bugun kurulmazsa sonradan eklemesi pahali gorunen
bir yapidir — ve tam bu algi, erken karmasikligin en yaygin gerekcesidir.

## Karar

V1'de `Tenant` ile `User` arasinda **hicbir ara varlik yoktur**. Organization,
departman, bolum, sube — hicbiri modellenmez.

Uyelik dogrudan `Tenant` ↔ `User` arasindadir (ADR-0014).

Ayrinti: MULTI_TENANT_ARCHITECTURE.md §5.3, §3 (N1) ve §17.1.

## Gerekce

Bir hiyerarsi katmani eklendigi anda uc sey birden degisir:

1. **RLS politikalari hiyerarsik hale gelir.** `tenant_id = current_setting(...)`
   yerine `tenant_id IN (<subtree>)` gerekir. Bu, her politikayi bir alt-agac
   sorgusuna cevirir; hem performans hem dogrulanabilirlik kaybi demektir.
2. **Roller devralinabilir olur.** "Ust dugumdeki admin, alt dugumde de admin mi?"
   sorusunun cevabi RBAC'i belirgin sekilde karmasiklastirir.
3. **Raporlama capraz-dugum okumak zorunda kalir.** Bu, izolasyon modelinde
   bilincli bir delik acmak demektir.

Bu bedel, **henuz olmayan bir ihtiyac** icin odenmis olur. ADR-0012'nin duz
`tenant_id` anahtari korundugu surece, Organization sonradan **ustte** bir
katman olarak eklenebilir; mevcut RLS politikalarinin hicbiri degismez.

Diger yon de dogru degerlendirilmeli: hiyerarsi yanlis kurulursa geri alinmasi,
hic kurulmamis olmasindan cok daha pahalidir. Veri zaten agaca gore
yerlestirilmis olur.

## Sonuclari

**Olumlu**

- `tenant_id` duz ve tek kalir; her RLS politikasi ayni sablonu kullanir
  (MULTI_TENANT_ARCHITECTURE.md §12.2).
- RBAC V1'de yassi kalir: rol tenant icinde tanimlidir, devralma yoktur.
- Domain modeli okunabilir; yeni gelistirici bir gunde kavrar.
- Gelecekteki Organization katmani, mevcut politikalari bozmadan ustte
  konumlanabilecek sekilde yer birakilmistir.

**Olumsuz / bedeli**

- **Holding yapisindaki musteriler V1'de tam karsilik bulamaz.** Bagli sirketler
  ayri tenant'lar olur; konsolide raporlama urun icinden yapilamaz.
- Ayni sirketin departmanlari icin veri ayrimi istenirse tek cozum ayri tenant
  acmaktir (ADR-0012'nin de kabul ettigi bedel).
- Organization sonradan eklendiginde, o gune kadar acilmis "departman yerine
  gecen" tenant'lari birlestirmek icin bir tasima araci gerekecektir.

## Degerlendirilen alternatifler

| Alternatif                                        | Neden secilmedi                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Bugunden Organization entity eklemek              | Hiyerarsik RLS, devralinan roller ve capraz-dugum raporlama; olmayan bir ihtiyac icin erken bedel     |
| Tenant'a `parent_tenant_id` (self-referans agac)  | En ucuz gorunen secenek ama en tehlikelisi: RLS'i sessizce alt-agac sorgusuna cevirir                 |
| Membership'e opsiyonel `department` alani         | Yarim cozum: yetki ve izolasyon uzerinde hicbir etkisi olmayan, yalniz kozmetik bir alan              |
| Etiket (tag) tabanli gruplama                     | Yetkilendirme dayanagi olamaz; "grup" gorunumu verir ama izolasyon saglamaz — yanlis guven uretir      |

## Bu karar ne zaman yeniden gozden gecirilir?

Gercek bir holding veya cok-sirketli musteri talebi geldiginde
(MULTI_TENANT_ARCHITECTURE.md §17.1).

O noktada gecerli olacak kisit bugunden kayda gecirilir: **Organization
eklendiginde de veri erisimi tenant sinirinda kalir.** Organization capraz-tenant
veri okuma yetkisi vermez; yalnizca ust seviye gruplama, yonetim ve toplu
raporlama saglar. Bu kisit gevsetilirse tum izolasyon modeli bastan
degerlendirilmelidir.
