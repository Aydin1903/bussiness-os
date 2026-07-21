# 0014 — Global User & Membership

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-21
- **Karar veren:** Product Owner
- **Faz:** 2

## Baglam

ADR-0012 tenant'i bir sirket olarak tanimladi, ADR-0013 araya hicbir gruplama
katmani koymadi. Geriye tek soru kalir: kullanici kime aittir?

Iki secenek vardir ve ikisi geri donulmez sekilde farklidir:

- **Tenant'a ait kullanici:** her tenant kendi kullanici tablosuna sahiptir; ayni
  kisi uc sirkette calisiyorsa uc ayri hesabi, uc ayri parolasi olur.
- **Global kullanici:** kimlik kisiye aittir; uyelik ayri bir kavramdir.

Bu karar authentication modelini (ADR-0004) dogrudan etkiler ve sonradan
degistirmek tum kimlik verisinin migrasyonu demektir.

## Karar

**Kimlik globaldir, uyelik tenant-scoped'tur.**

| Varlik       | Kapsam            | Tasidigi                                                  |
| ------------ | ----------------- | --------------------------------------------------------- |
| `User`       | Global            | Global tekil `email`, parola (Argon2id), MFA, dogrulama    |
| `Membership` | Tenant-scoped     | `(tenant_id, user_id)` uzerinde tekil; **rol ve durum**    |

`User` **rol tasimaz.** Rol yalnizca `Membership` uzerinde yasar.

Bir access token tam olarak **tek bir** `tenant_id` claim'i tasir. Tenant
degistirmek, sunucuda uyelik dogrulamasindan gecerek yeni bir token almaktir;
es zamanli cok-tenant oturum desteklenmez.

Ayrinti: MULTI_TENANT_ARCHITECTURE.md §5.3 ve §7.

## Gerekce

Kimlik **kisiye** aittir, sirkete degil. Bir danisman uc musteri sirkette
calisiyorsa uc parola yonetmemelidir; MFA'yi uc kez kurmamalidir.

`User`'in rol tasimamasi kritik bir invariant'tir: rol tenant'a **gorelidir**.
Ayni kisi bir tenant'ta `owner`, digerinde `viewer` olabilir. Rolu `User`'a
koymak bu iki baglami birbirine karistirir — ve karistigi gun yetki yukseltmeye
donusur.

Tek token = tek tenant kurali, `AsyncLocalStorage` tabanli tenant context'inin
(MULTI_TENANT_ARCHITECTURE.md §11) hangi tenant'a ait oldugunu belirsizlikten
kurtarir. Es zamanli cok-tenant oturum, context sizintisinin en kolay yoludur.

## Role Value Object karari

`Membership.role`, persistence katmaninda V1'de sabit bir string/enum kolonu
olarak tutulur (`owner` | `admin` | `member` | `viewer`) — **ancak
domain/application katmaninda ciplak string olarak kullanilmaz.** Bir `Role`
value object olarak modellenir.

**Gerekce.** ARCHITECTURE.md §10.1'in nihai vizyonu tenant-scoped, veri-tabanli
rollerdir: her tenant kendi rollerini tanimlar, roller ayri bir `roles`
tablosunda yasar. V1'de bu karmasikligi ustlenmiyoruz — ADR-0013 ile ayni
"gereksiz karmasikligi erteleme" ilkesi. Ama `Role`'u en bastan bir VO olarak
modellemek, ileride enum → `roles` tablosu FK gecisini **business logic'e
dokunmadan** yapilabilir kilar; yalnizca persistence adapter'i degisir.

Bu ayrica DEVELOPMENT_RULES §2.4'un primitive obsession yasaginin dogrudan
uygulanmasidir: rol bir kimliktir, `string` degil.

**`owner` sistem roludur** ve VO seviyesinde bir invariant olarak korunur:
degistirilemez ve silinemez. Bu koruma yalnizca bir veritabani kisiti degildir —
kisit veri butunlugunu korur, VO ise **is kuralini** korur ve kural veritabanina
ulasmadan once uygulanir.

**Sonuc**

| Katman        | Temsil                                        |
| ------------- | --------------------------------------------- |
| Domain        | `Role` value object                           |
| Persistence   | `string` / `enum` kolon                       |
| Gelecek       | `roles` tablosuna minimum kirilimla gecis     |

## Ek: Uyelik yasam dongusunde `revoked -> invited`

- **Tarih:** 2026-07-21 · **Karar veren:** Product Owner

Uyeligi iptal edilmis (`revoked`) bir kullanici yeniden davet edildiginde,
uyelik dogrudan `active` OLMAZ — once `invited` durumuna doner ve kullanici
daveti KABUL ETMEK zorundadir.

**Gerekce.** Dogrudan aktiflestirmek, bir yoneticinin kullanicinin onayi
olmadan ona erisim vermesi demektir. DEVELOPMENT_RULES 8: "Varsayilan deny.
Erisim ACIKCA verilir." Yeniden davet, ilk davetten farkli bir sey degildir;
ayni onay adimindan gecmelidir.

**Sonucu.** Yeniden davette `joinedAt` TEMIZLENIR: kisi henuz yeniden
katilmamistir ve `invited` durumu katilma zamani tasiyamaz (tutarlilik
invariant'i). Onceki katilma tarihi entity'nin degil, DENETIM KAYDININ
sorumlulugundadir — uyelik kaydi "su an ne durumda" sorusunu yanitlar, "gecmiste
neler oldu" sorusunu degil.

**Bedeli.** Bir kullaniciyi hizlica geri almak isteyen yonetici icin fazladan
bir adim olusur; kullanici davet e-postasini gormezse erisim geri gelmez. Bu,
onay ilkesinin bilincli olarak odenen bedelidir.

MULTI_TENANT_ARCHITECTURE 7.2 state diagram'i bu karara gore duzeltilmistir
(dokuman surum 1.3). Diagram onceden `Revoked --> Active` gosteriyordu ama
etiketi "yeniden davet edildi" idi — hedef ile etiket celisiyordu.

## Sonuclari

**Olumlu**

- Bir kullanici tek kimlikle N tenant'ta calisabilir; parola ve MFA tek yerde.
- Rol/tenant baglami net ayrilmistir; yetki yukseltme yuzeyi daralir.
- Uyelik iptali kimligi silmez — denetim izi korunur (`revoked` durumu).
- Role VO sayesinde veri-tabanli rollere gecis bir adapter isine iner.

**Olumsuz / bedeli**

- **Global `users` tablosu tenant-scoped degildir** ve RLS'in kapsamadigi bir
  yuzeydir. Telafi: `users` dogrudan sorgulanmaz; erisim daima RLS korumali
  `memberships` uzerinden `JOIN` ile yapilir
  (MULTI_TENANT_ARCHITECTURE.md §12.4).
- Kullanici numaralandirma (enumeration) riski dogar: davet ve login akislari bir
  e-postanin platformda kayitli olup olmadigini sizdirabilir. Telafi: sabit yanit
  ve sabitlenmis yanit suresi (§7.3).
- Her istekte uyelik dogrulamasi gerekir; cache'lenirse TTL kisa tutulmali ve
  uyelik degisiminde acikca invalidate edilmelidir. Bayat izin = guvenlik acigi.
- Tenant degistirme ek bir endpoint ve token yenileme akisi getirir.
- Role VO, V1'de enum'a gore bir miktar fazladan kod demektir; bedeli bilincli
  olarak gelecekteki gecis kolayligi icin odenmistir.

## Degerlendirilen alternatifler

| Alternatif                                  | Neden secilmedi                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Tenant basina ayri kullanici kaydi          | Ayni kisi icin N parola, N MFA; parola sifirlama ve guvenlik olaylari tenant sayisi kadar coklanir  |
| `User` uzerinde tek rol alani               | Rol tenant'a gorelidir; tek alan iki baglami karistirir ve yetki yukseltme uretir                   |
| `Membership` yerine `user_tenants` join tablosu (rolsuz) | Rolun nerede yasayacagi cevapsiz kalir; rol yine `User`'a veya ayri bir tabloya kacar    |
| Rolu bastan `roles` tablosuna almak         | ADR-0013 ile ayni gerekce: bugun karsiligi olmayan karmasiklik. Role VO gecisi zaten ucuz kiliyor   |
| Rolu ciplak string/enum olarak kullanmak    | Primitive obsession (DEVELOPMENT_RULES §2.4); `roles` tablosuna gecis business logic'i kirar        |
| Es zamanli cok-tenant oturum                | Tenant context'ini belirsizlestirir; sizintinin en kolay yolu                                       |

## Bu karar ne zaman yeniden gozden gecirilir?

Iki tetikleyici:

1. **Tenant'a ozel rol tanimi** gercek bir musteri talebi haline geldiginde —
   `Role` VO korunur, arkasindaki persistence `roles` tablosuna tasinir.
2. **Kurumsal SSO/SCIM** talebi yogunlastiginda — global `User` modeli korunur,
   kimlik saglayici ADR-0004'un ongordugu sekilde bir port arkasina alinir ve
   `Membership` sagalama (provisioning) otomatiklesir.
