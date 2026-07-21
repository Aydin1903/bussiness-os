# 0018 — Parola politikasi

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-21
- **Karar veren:** Product Owner
- **Faz:** 3

## Baglam

Parola kurallari, guvenlik gorunumu ile gercek guvenlik arasindaki farkin en
belirgin oldugu yerdir. "En az bir buyuk harf, bir sembol, 90 gunde bir degistir"
gibi kurallar guvenli GORUNUR ama kullaniciyi `P@ssw0rd1` -> `P@ssw0rd2`
kalibina iter — yani tahmin edilebilir hale getirir.

Ayrica bir UST SINIR kararı da gerekliydi ve bu, ilk bakista guvenlikle degil
DAYANIKLILIKLA ilgilidir.

## Karar

| Kural | Deger |
| ----- | ----- |
| Minimum uzunluk | 8 karakter |
| Maksimum uzunluk | **128 karakter** |
| Bilesim | En az bir harf + bir rakam |
| Buyuk/kucuk harf, sembol zorunlulugu | **YOK** |
| Periyodik zorunlu degisim | **YOK** |
| Parola gecmisi (son N parolayi kullanma) | **YOK** |
| Uzunluk sayimi | **Kod noktasi** (byte degil) |
| Normalizasyon | **NFKC**, hash'lemeden once |

## Gerekce

**Neden maksimum 128 karakter.** Argon2id'nin maliyeti girdi uzunlugundan gorece
bagimsizdir, ama girdiyi ALMAK, BELLEGE KOYMAK ve NORMALIZE ETMEK degildir.
10 MB'lik bir "parola" gonderen istemci, kimlik dogrulamasi YAPILMADAN sunucuda
bellek ve CPU harcatir. Giris uc noktasi kimliksizdir; oradaki her maliyet bir
saldiri yuzeyidir. 128 karakter, en uzun makul parola cumlesinin cok uzerindedir
ve hicbir gercek kullaniciyi kisitlamaz.

**Neden karmasiklik kurali yok.** NIST SP 800-63B bunlari acikca onermiyor.
Kurallar entropiyi artirmaz; kullaniciyi ONGORULEBILIR ikamelere yoneltir
(`a`->`@`, `s`->`$`, sona `1!`). Uzunluk, karmasiklikten cok daha etkili bir
entropi kaynagidir.

**Neden periyodik degisim yok.** Zorunlu rotasyon, kullanicilari kucuk ve
tahmin edilebilir degisikliklere iter; ayrica parolayi bir yere yazma egilimini
artirir. Parola yalnizca SIZINTI SUPHESI oldugunda degistirilmelidir.

**Neden parola gecmisi yok.** Uygulanabilmesi icin eski hash'lerin saklanmasi
gerekir — yani sizinti halinde bir degil N parola hash'i aciga cikar. Sagladigi
fayda bu riski karsilamiyor.

**Neden kod noktasi sayimi.** `é` veya emoji iceren bir parola, byte sayimiyla
haksiz yere reddedilirdi. Kullanicinin gordugu karakter sayisi ile sistemin
saydigi ayni olmalidir.

**Neden NFKC normalizasyonu.** Ayni parola farkli Unicode normalizasyonlariyla
yazildiginda (ornegin macOS ile Windows arasinda) bayt dizisi farklidir ve giris
BASARISIZ OLUR. Kullanici dogru parolayi girdigi halde giremez ve sebebini
anlayamaz.

## Sonuclari

**Olumlu**

- Kullanici uzun ve akilda kalir parola cumleleri secebilir.
- Sinirdaki DoS yuzeyi kapali.
- Unicode iceren parolalar platformlar arasi tutarli calisir.
- Kullanicilar kurallarla savasmadigi icin destek yuku duser.

**Olumsuz / bedeli**

- **8 karakter minimum, tek basina zayiftir.** `abc12345` bu politikayi gecer.
  Gercek koruma ADR-0022'deki oran sinirlamasi ve kilit modelidir — politika tek
  basina yeterli DEGILDIR ve boyle sunulmamalidir.
- Sizmis parola listesi kontrolu (HIBP) V1'de yok; bu, en yaygin zayif
  parolalarin kabul edilmeye devam edecegi anlamina gelir.
- "Guvenli sifre" beklentisi olan kurumsal musteriler, karmasiklik kurali
  olmamasini eksiklik olarak gorebilir; gerekce anlatilmak zorunda kalinacaktir.

## Degerlendirilen alternatifler

| Alternatif | Neden secilmedi |
| ---------- | --------------- |
| Min 12 karakter | Guvenlik acisindan daha iyi; ancak onaylanan gereksinim 8. Sizmis parola kontrolu eklendiginde bu tekrar tartisilmali |
| Karmasiklik kurallari (buyuk/kucuk/sembol) | Entropi artirmaz, ongorulebilir kaliplar uretir (NIST SP 800-63B) |
| Ust sinir yok | Kimliksiz uc noktada acik bir kaynak tuketim yuzeyi |
| bcrypt uyumlulugu icin 72 bayt siniri | Argon2id kullaniyoruz; bcrypt'in kisitini tasimamiz icin sebep yok |
| Zorunlu 90 gunluk rotasyon | NIST onermiyor; zayif kaliplara ve parola yazmaya iter |

## Bu karar ne zaman yeniden gozden gecirilir?

- **Sizmis parola kontrolu (HIBP k-anonymity) eklendiginde** — o noktada minimum
  uzunlugun 8'de kalip kalmayacagi tekrar degerlendirilmeli.
- Kurumsal bir musteri sozlesme geregi belirli bir parola politikasi dayatirsa;
  bu durumda politika TENANT BAZLI yapilandirilabilir hale gelmeli, global
  olarak sikilastirilmamalidir.
