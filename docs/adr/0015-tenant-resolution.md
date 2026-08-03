# 0015 — Tenant Resolution: Hybrid (Custom Domain → Subdomain → JWT)

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-21
- **Karar veren:** Product Owner
- **Faz:** 2

## Baglam

Gelen bir HTTP isteginin hangi tenant'a ait oldugu belirlenmeden hicbir veri
erisimi yapilamaz. Bu belirlemenin kaynagi birden fazla olabilir: `Host` basligi
(custom domain veya subdomain), JWT claim'i, header, query parametresi.

Buradaki tehlike, birbirine benzeyen ama **tamamen farkli** iki sorunun
karistirilmasidir:

| Soru                                              | Kaynak                       | Guven           |
| ------------------------------------------------- | ---------------------------- | --------------- |
| Bu istek hangi tenant'in **arayuzune** geldi?     | `Host` basligi               | Guvenilmez      |
| Bu istek hangi tenant'in **verisine** erisebilir? | Dogrulanmis JWT + membership | Guvenlik siniri |

Bu iki soru karistirilirsa, istemci kontrolundeki bir baslik yetki kaynagi haline
gelir — multi-tenant SaaS'ta en sik gorulen kritik aciktir
(DEVELOPMENT_RULES §4.5).

## Karar

Cozum zinciri: **Custom Domain → Subdomain → JWT Membership Validation.**

`Host` basligindan cikan tenant yalnizca bir **hint**'tir (routing ve branding
amacli) ve **tek basina hicbir veri erisimi acmaz.** Tek mesru yetki kaynagi
dogrulanmis JWT claim'idir.

Zincir:

1. `Host` normalize edilir; dogrulanmis bir custom domain'e karsilik geliyorsa
   `hintTenantId` bulunur.
2. Degilse `*.businessos.app` subdomain'i cozulur; slug bir tenant'a karsilik
   gelmiyorsa `404` (tenant varligi sizdirilmaz).
3. Host bir tenant'a isaret etmiyorsa (apex/API domain) hint **yoktur** — bu
   gecerli bir durumdur; mobil ve API istemcileri buradan gelir.
4. JWT dogrulanir; `claimTenantId` ve `userId` cikarilir.
5. Hint varsa `hintTenantId == claimTenantId` **capraz kontrolu** yapilir;
   uyusmazsa `403` doner **ve guvenlik olayi olarak loglanir.**
6. `membership(userId, claimTenantId)` durumu `active` degilse `403`.
7. `tenant.status` `active` degilse `403`.
8. Ancak bundan sonra `TenantContext` kurulur ve `tenantId = claimTenantId` olur.

Bir custom domain, **TXT kaydi ile sahiplik kanitlanmadan** cozum zincirine
girmez. Dogrulama periyodik olarak yeniden kontrol edilir.

Ayrinti: MULTI_TENANT_ARCHITECTURE.md §8 ve §4 (P1).

## Gerekce

Bir saldirgan `Host` basligini degistirebilir, `X-Tenant-Id` basligini uydurabilir.
Imzali bir JWT'yi uyduramaz. Guvenlik sinirini token dogrulamasina koymak, tenant
kimliginin **tek** ve **dogrulanabilir** bir kaynagi olmasini saglar.

Host'un tumden yok sayilmamasinin sebebi ise capraz kontrolun kendisidir: Host ↔
claim uyusmazligi normalde olmamasi gereken bir durumdur ve tekrarlanmasi token
calinmasinin veya aktif kesfin erken sinyalidir. Yani Host, guvenlik kaynagi
degil ama guvenlik **sinyali** olarak degerlidir.

Custom domain destegi kurumsal satista sik bir taleptir; dogrulamasiz kabul ise
bir tenant'in baska bir tenant'in alan adini kendine baglamasi demektir — bu
yuzden TXT kaniti pazarlik konusu degildir.

## Sonuclari

**Olumlu**

- Guvenlik siniri tek yerdedir: yalnizca JWT. Host manipulasyonu hicbir kapi
  acmaz.
- Kurumsal custom domain beklentisi karsilanir.
- Yanlis-tenant durumlari erken yakalanir ve alarm uretir.
- Domain'siz istemciler (mobil, API) desteklenir; hint yoklugu gecerli bir
  durumdur.
- Slug degisikligi veri katmanini etkilemez (ADR-0012).

**Olumsuz / bedeli**

- **Operasyonel yuk:** wildcard DNS, wildcard TLS ve custom domain basina
  sertifika saglama gerekir.
- **Cache Host'a duyarli hale gelir:** CDN/edge cache tenant'lar arasi
  karisabilir. `Vary: Host` ve tenant'li cache anahtari zorunludur.
- **Capraz kontrol yanlis pozitif uretebilir:** kullanici tenant degistirip eski
  sekmede islem yaparsa `403` alir. UX'te "oturumunuz baska bir tenant'a gecti"
  olarak ele alinmalidir.
- Dangling domain devralma riskine karsi periyodik yeniden dogrulama isi
  isletilmelidir.
- Cozum zinciri her istekte membership sorgusu gerektirir; cache'lenirse TTL kisa
  tutulmali ve uyelik degisiminde invalidate edilmelidir.

## Degerlendirilen alternatifler

| Alternatif                             | Neden secilmedi                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Yalnizca subdomain'den cozme           | `Host` istemci kontrolundedir; tek basina yetki kaynagi yapmak tum veritabanini bir baslik uzakligina getirir |
| Yalnizca JWT, Host tumden yok sayilir  | Calisir ama capraz kontrolun urettigi erken uyari sinyali kaybedilir; custom domain branding'i de zorlasir    |
| `X-Tenant-Id` header'i                 | Istemciden gelen deger; DEVELOPMENT_RULES §4.5 geregi acikca yasak                                            |
| URL path'inde tenant (`/t/<slug>/...`) | Slug'i her URL'e yayar; ADR-0012'nin slug'i degistirilebilir tutma karari ile celisir                         |
| Custom domain'i dogrulamasiz kabul     | Bir tenant baska bir tenant'in alan adini kendine baglayabilir                                                |

## Bu karar ne zaman yeniden gozden gecirilir?

Bolgesel yerlesim (data residency) gundeme geldiginde: cozum katmani bolge-farkinda
hale gelmelidir ve zincire bir bolge secimi adimi eklenir.

Ayrica ADR-0002'nin Asama 2'si (tenant basina veritabani) devreye girdiginde,
cozum sonucunun `TenantConnectionResolver`'a nasil beslendigi yeniden
degerlendirilir — zincirin kendisi degismez.
