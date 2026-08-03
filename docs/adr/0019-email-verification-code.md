# 0019 — E-posta dogrulama: 6 haneli kod

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-21
- **Karar veren:** Product Owner
- **Faz:** 3

## Baglam

ADR-0016 e-posta dogrulamasini tenant acmanin ONKOSULU yapti ve akisi bir
BAGLANTI (`/auth/verify?token=...`) olarak tarif etti.

Faz 3 tasariminda bu yeniden degerlendirildi. Baglantinin iki pratik sorunu var:

1. Baglanti, e-posta istemcisinin tarayicisinda acilir ve kullanicinin oturumunu
   BOLER. Mobil uygulamada baslayan kayit tarayicida biter; geri donus akisi
   kirilgandir.
2. Kurumsal e-posta guvenlik tarayicilari baglantilari ONCEDEN tiklar. Tek
   kullanimlik bir baglanti bu sekilde tuketilir ve kullanici "gecersiz baglanti"
   hatasi alir — sebebini anlamadan.

## Karar

Dogrulama **6 haneli kod** ile yapilir.

| Ozellik                | Deger                                                   |
| ---------------------- | ------------------------------------------------------- |
| Bicim                  | 6 hane, `000000`-`999999`                               |
| Uretim                 | Kriptografik RNG (`crypto.randomInt`), duzgun dagilimli |
| Omur                   | **15 dakika**                                           |
| Kullanim               | Tek kullanimlik                                         |
| Ayni anda gecerli kod  | Bir tane; yeni kod oncekini gecersizlestirir            |
| Saklama                | **HMAC-SHA256 + sunucu tarafi pepper**                  |
| Maksimum yanlis deneme | **5** — sonra kod gecersizlesir                         |
| Sayac artirimi         | **Atomik**, dogrulama ile ayni transaction'da           |
| Yeniden gonderme       | 60 sn bekleme · 5/saat (hesap) · 20/saat (IP)           |

Parola sifirlama ayni deseni **daha siki** parametrelerle kullanir (ADR-0024).

## Gerekce

**Neden kod, baglanti degil.** Yukaridaki iki sorun. Kod, kullaniciyi uygulamada
tutar ve e-posta tarayicilari tarafindan tuketilemez.

**Neden 15 dakika.** E-posta teslimati gecikebilir, spam klasoru kontrol edilir.
10 dakika yavas teslimatta kullaniciyi ikinci koda zorlar ve destek yuku uretir.
Asil koruma sure DEGIL, deneme siniridir — bu yuzden 15 dakika guvenli.

**Neden HMAC + pepper, duz veya Argon2 degil.**

| Yaklasim                 | Sonuc                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Duz sakla                | Veritabani okuma yetkisi olan herkes dogrudan hesap ele gecirir                                                                            |
| Duz SHA-256              | Arama uzayi yalnizca 10^6; sizan hash siradan bir makinede MILISANIYELER icinde geri cevrilir. Hash'lemek neredeyse hicbir sey kazandirmaz |
| Argon2id                 | Guvenli ama YANLIS ARAC: her denemede 100+ ms maliyet, kod zaten kisa omurlu ve deneme sinirli                                             |
| **HMAC-SHA256 + pepper** | Pepper veritabaninda DEGILDIR. Sizan bir veritabani tek basina yetmez; saldirganin uygulama sirrina da erismesi gerekir                    |

Bu, parola ile kodun FARKLI TEHDIT MODELLERI oldugunun kabuludur: parola dusuk
entropili ve uzun omurludur (yavas KDF sart); kod yuksek oranda kisitli, tek
kullanimlik ve dakikalar omurludur (hizli MAC + pepper yeterli).

**Neden deneme siniri ZORUNLU.** 6 haneli kod yalnizca 1.000.000 olasiliktir.
Sinir olmadan, saniyede birkac yuz istek gonderen bir saldirgan kodu DAKIKALAR
icinde bulur ve mekanizma tumuyle anlamsizlasir. Bu, kod secmenin bedelidir ve
odenmesi opsiyonel degildir.

**Neden atomik sayac.** Sayac "oku -> karsilastir -> yaz" bicimindeyse, es zamanli
100 istek 100 denemeyi 1 SAYILMIS gibi gecirebilir. `UPDATE ... SET
attempt_count = attempt_count + 1` ile ve dogrulama ile ayni transaction'da
artirilmalidir.

**Neden yeniden gonderme de sinirli.** Sinirsiz olsaydi saldirgan her 5 denemede
yeni kod isteyerek SINIRSIZ deneme yapabilirdi. Deneme siniri ile yeniden
gonderme siniri BIRLIKTE calisir; biri olmadan digeri yetersizdir.

## Sonuclari

**Olumlu**

- Kullanici uygulamadan cikmaz; mobil akis kirilmaz.
- E-posta guvenlik tarayicilari kodu tuketemez.
- Sizan veritabani tek basina hesap ele gecirmeye yetmez.
- Online tahmin, 5 deneme + oran sinirlariyla pratik olarak kapali.

**Olumsuz / bedeli**

- **Arama uzayi kucuk (10^6).** Guvenlik tumuyle deneme ve oran sinirlarina
  BAGIMLIDIR; bu mekanizmalardan biri hatali yazilirsa dogrulama comer.
- Pepper bir operasyonel yuktur: secret manager'da saklanmali, rotasyonu
  planlanmali. Pepper kaybedilirse aktif kodlar dogrulanamaz (kabul edilebilir —
  kodlar dakikalar omurlu).
- Kullanici kodu elle yazar; kopyala-yapistir hatasi ve yazim hatasi olasiligi
  baglantiya gore yuksektir.
- 6 hane, SMS/authenticator aliskanligina uyar ama uzun vadede MFA kodlariyla
  karisabilir; arayuzde ayrimin net olmasi gerekir.

## Degerlendirilen alternatifler

| Alternatif                                | Neden secilmedi                                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Baglanti tabanli dogrulama (onceki karar) | Oturum bolunmesi ve e-posta tarayicilarinin baglantiyi tuketmesi                               |
| 8 haneli kod                              | Arama uzayi 100x buyur ama kullanilabilirlik duser; deneme siniri zaten asil korumayi sagliyor |
| Alfanumerik kod                           | Buyuk/kucuk harf ve benzer karakter (O/0, l/1) karisikligi; destek yuku                        |
| Kodu duz saklamak                         | Veritabani okuma yetkisi dogrudan hesap ele gecirmeye donusur                                  |
| Argon2id ile kod hash'leme                | Her denemede gereksiz 100+ ms; yanlis arac                                                     |
| Hem kod hem baglanti sunmak               | Iki akis, iki saldiri yuzeyi, iki kat test                                                     |

## Bu karar ne zaman yeniden gozden gecirilir?

- **MFA eklendiginde**: kullanici iki farkli 6 haneli kod turuyle karsilasacak;
  ayrim netlestirilmeli veya dogrulama akisi degistirilmeli.
- **SSO eklendiginde**: kimlik saglayici e-postayi dogrulanmis olarak
  bildiriyorsa bu akis o kullanicilar icin tumden atlanir.
- Kod tahmin girisimleri telemetride anlamli sekilde gorunurse: kod uzunlugu
  veya oran sinirlari sikilastirilir.
