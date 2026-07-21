# 0016 — Tenant Provisioning: Email verification once

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-21
- **Karar veren:** Product Owner
- **Faz:** 2

## Baglam

Yeni bir sirketin sisteme girisi, urunun ilk temas noktasidir ve kayit akisindaki
her ek adim donusum oranini dusurur. Bu, akisi olabildigince kisa tutmak yonunde
guclu bir baski yaratir: "kullanici kaydolsun, tenant hemen acilsin, e-postayi
sonra dogrulariz."

Ancak tenant, acildigi anda pasif bir kayit degildir: veri, davet ve fatura
kaydi dogurur. Bu yuzden "sonra temizleriz" varsayimi burada gecerli degildir.

Ayrica akis birden fazla dis sistemi (storage, arama index'i, e-posta) icerir ve
bunlarin hicbiri bir veritabani transaction'i icinde beklenemez.

## Karar

**`Tenant` kaydi, `User.emailVerified == true` olmadan olusturulmaz.**

Akis:

```
1. Sign Up          → User(status=pending, emailVerified=false)
                      Tenant YOK
2. Email Verification → User(status=active, emailVerified=true)
3. Tenant Provisioning
   ┌── TEK TRANSACTION ──────────────────────────┐
   │  Tenant(status=provisioning)                │
   │  Membership(owner, active)                  │
   │  varsayilan roller / ayarlar                │
   │  TenantProvisioningRequested → outbox       │
   └── COMMIT ───────────────────────────────────┘
4. Asenkron tamamlama (idempotent handler)
   storage prefix · arama index'i · ornek veri
   → Tenant(status=active)   + TenantProvisioned
   → veya Tenant(status=failed) + TenantProvisioningFailed
     telafi isi kaydi temizler, slug serbest birakilir
```

Slug tekilligi **veritabani unique index'i** ile saglanir; kisit ihlali yakalanip
`409`'a cevrilir.

Ayrinti: MULTI_TENANT_ARCHITECTURE.md §9.

## Gerekce

Dogrulanmamis e-posta ile acilan tenant dort risk dogurur:

| Risk                              | Sonuc                                                            |
| --------------------------------- | ---------------------------------------------------------------- |
| Bot kaydi                         | Cop tenant'lar, tuketilmis slug'lar, sismis veritabani            |
| Baskasinin e-postasiyla kayit     | Gercek sahip sisteme girdiginde e-postasi "alinmis" olur          |
| Slug squatting                    | Degerli slug'lar sahte kayitlarla rezerve edilir                  |
| Sahipsiz tenant                   | `owner` rolu erisilemeyen bir e-postaya baglanir; kurtarma yolu yok |

Bunlarin hepsi *sonradan temizlenebilir* gorunur; degildir. Tenant acildigi anda
veri, davet ve fatura kaydi dogurur — temizlik bir satir silme islemi olmaktan
cikar.

**Tek transaction sinirinin gerekcesi:** Sahipsiz bir tenant asla var olamaz.
Tenant kaydi commit olup owner membership'i olusmazsa, tenant'a hicbir kullanici
erisemez ve kurtarilmasi manuel mudahale gerektirir. Bu atomiklik pazarlik konusu
degildir.

**Asenkron tamamlamanin gerekcesi:** Storage ve arama index'i hazirligi dis sistem
cagrilaridir. Bunlari transaction icinde beklemek, transaction'i dis sistemin
gecikmesine baglar ve kilit sureleri buyur. ADR-0006'nin outbox akisi, event'in
veri degisikligiyle ayni transaction'da kaydedilmesini garanti ettigi icin
"commit oldu ama provisioning baslamadi" durumu olusamaz.

## Sonuclari

**Olumlu**

- Her tenant'in dogrulanmis bir sahibi vardir; kurtarma yolu daima acik.
- Bot kaydi ve slug squatting ekonomik olarak anlamsiz hale gelir.
- Sahipsiz tenant fiziksel olarak olusamaz (transaction garantisi).
- Uzun suren provisioning adimlari HTTP istegini bloklamaz; istemci `202` alir.
- Yarim kalan provisioning `failed` durumunda kalir; `active` olmaz.

**Olumsuz / bedeli**

- **Kayit akisi iki adima cikar** ve e-posta teslimatina bagimli hale gelir.
  Donusum orani duser; e-posta gecikirse veya spam'e duserse kullanici tenant
  acamaz. E-posta teslimat kalitesi artik bir urun sorunudur.
- Kullanici `202 Accepted` sonrasi tenant'i hemen kullanamaz; arayuzde bir bekleme
  durumu tasarlanmalidir.
- Provisioning handler **idempotent** yazilmak zorundadir (at-least-once teslimat);
  bu, her adimda "zaten yapilmis mi" kontrolu demektir.
- `failed` durumundaki tenant'lari ve serbest birakilmamis slug'lari temizleyen bir
  telafi isi isletilmelidir.
- Dogrulama e-postasi bir saldiri yuzeyidir: token tek kullanimlik ve sureli
  olmali, gonderim oranlanmalidir.

## Degerlendirilen alternatifler

| Alternatif                                          | Neden secilmedi                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Tenant'i hemen ac, e-postayi sonra dogrula          | Bot kaydi, slug squatting ve sahipsiz tenant; tenant acildigi anda veri/davet/fatura dogurdugu icin temizlik pahali |
| Tenant'i ac ama `unverified` durumunda tut          | Ayni riskler daha yumusak bicimde surer: slug yine tuketilir, cop kayit yine olusur                     |
| Tum provisioning'i tek senkron transaction'da yapmak | Dis sistem cagrilarini transaction icine sokar; kilit sureleri ve zaman asimi riski                      |
| Provisioning'i tumden asenkron yapmak (tenant kaydi dahil) | Istemci hangi tenant'i actigini ogrenemez; slug catismasi gec yakalanir                          |
| Slug tekilligini uygulamada kontrol etmek           | "Once kontrol et sonra yaz" bir yaris kosuludur; tekillik veritabani kisitinda olmalidir                |

## Bu karar ne zaman yeniden gozden gecirilir?

Iki tetikleyici:

1. **Kurumsal satis akisi** (sales-led onboarding) devreye girdiginde: tenant'i
   musteri degil operator acar. O durumda e-posta dogrulamasi yerine sozlesme
   onayi onkosul haline gelir; sahipsiz tenant yasagi degismez.
2. **SSO ile giris** eklendiginde: kimlik saglayici e-postayi zaten dogrulanmis
   olarak bildiriyorsa, ayri bir dogrulama adimi gereksizlesir. Onkosul korunur,
   dogrulamanin kaynagi degisir.
