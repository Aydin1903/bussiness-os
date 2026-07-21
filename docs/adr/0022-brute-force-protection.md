# 0022 — Kaba kuvvet korumasi: katmanli kilit

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-21
- **Karar veren:** Product Owner
- **Faz:** 3

## Baglam

Baslangictaki gereksinim basitti: "5 yanlis denemede hesap 15 dakika
kilitlensin."

Bunu YALNIZCA E-POSTA BAZLI uygulamak iki acik uretir:

1. **Hedefli DoS.** Saldirgan, kurbanin e-postasina 5 yanlis parola gonderir.
   Kurban KENDI HESABINA giremez. Surekli tekrarlanirsa hesap kalici olarak
   kullanilamaz hale gelir. Kilit, bir savunma araci olarak tasarlanmisken bir
   SALDIRI aracina donusur.
2. **Hesap numaralandirma.** Kilitlenen hesap farkli bir yanit veya davranis
   uretirse, saldirgan hangi e-postalarin kayitli oldugunu KILITLEYEREK ogrenir.

Yalnizca IP bazli kilit de yetersizdir: botnet veya proxy havuzu kullanan
saldirgan her denemede IP degistirir, ve NAT arkasindaki mesru kullanicilar
haksiz yere engellenir.

## Karar

**Uc katmanli model:**

| Katman | Anahtar | Esik | Etki |
| ------ | ------- | ---- | ---- |
| 1 — birincil | `(e-posta, IP)` | 5 hata / 15 dk | O CIFT icin 15 dk kilit |
| 2 — yayilma | e-posta | 20 hata / saat | **Ustel gecikme** (1s -> 2s -> 4s...), kilit YOK |
| 3 — kaynak | IP | 50 hata / saat | `429`, ileride CAPTCHA |

**Degismez:** kilitli hesap ile yanlis parola AYNI yaniti ve AYNI sureyi uretir.

**Bilgilendirme:** kilit olustugunda hesaba e-posta gonderilir.

## Gerekce

**Katman 1 — hedefli DoS'u sinirlar.** Saldirgan kurbani kilitlemek icin kendi
IP'sinden dener ve yalnizca KENDI IP'si icin kilitlenir. Kurban baska bir agdan
sorunsuz girer. Kilit hala vardir ama silaha donusmez.

**Katman 2 — kilit degil GECIKME.** IP degistiren saldirgani yavaslatir ama
hesabi kilitlemez. Bu ayrim kasitlidir: kilit bir DoS silahidir, gecikme
degildir. Ustel gecikme, otomatik saldiriyi ekonomik olarak anlamsiz kilarken
mesru kullaniciyi disarida birakmaz.

**Katman 3 — parola puskurtmeyi yakalar.** Bu, en az bilinen ve en cok
atlanan katmandir. Kimlik dogrulama saldirilarinin cogu tek bir hesabi
zorlamaz; COK SAYIDA hesaba AZ SAYIDA yaygin parola dener ("Winter2026!").
Her hesapta yalnizca 1-2 deneme oldugu icin katman 1 ve 2 bu saldiriyi HIC
GORMEZ. Yalnizca kaynak bazli sayac yakalar.

**Neden kilit durumu sizdirilmaz.** "Hesabiniz kilitlendi" mesaji, hesabin VAR
OLDUGUNU dogrular. Kayit, giris ve sifirlama uclarinin tamaminda ayni gizlilik
kurali gecerlidir; birinde delinirse digerleri anlamsizlasir.

**Neden yine de e-posta gonderilir.** Mesru kullanici neden giremedigini
bilmelidir. Bilgi, kanalin DOGRU tarafina verilir: istegi yapana degil, hesabin
sahibine. Saldirgan e-postayi goremez.

**Hash maliyetiyle iliskisi.** ADR-0017'deki Argon2id maliyeti, kimliksiz giris
ucunda kendi CPU'muza karsi bir DoS vektorudur. Katman 3 ayni zamanda BIZI
korur: kimliksiz bir istemcinin tetikleyebilecegi toplam hash sayisini sinirlar.
Hash maliyetini artirmak, oran sinirini sikilastirmadan yapilirsa saldiri
yuzeyini BUYUTUR. Iki parametre birlikte kararlastirilir.

## Sonuclari

**Olumlu**

- Hedefli DoS pratik olarak etkisiz: saldirgan yalnizca kendi IP'sini kilitler.
- Parola puskurtme saldirisi yakalanir.
- Hesap varligi hicbir yanittan sizmaz.
- Kendi CPU'muz da korunur.

**Olumsuz / bedeli**

- **Uc ayri sayac** demek uc ayri durum deposu ve temizlik isi demektir.
  `login_attempts` tablosu hizli buyur; saklama suresi (90 gun) bastan
  planlanmali.
- **Mesru kullanici neden giremedigini ekranda goremez.** Bu, gizlilik ugruna
  odenen bilincli bir kullanilabilirlik bedelidir. E-posta bildirimi telafi
  eder ama e-posta gecikirse kullanici destek arar.
- **NAT/kurumsal ag** arkasindaki cok sayida kullanici ayni IP'yi paylasir;
  katman 3'un esigi buna gore ayarlanmali, aksi halde bir sirketin tamami
  engellenebilir.
- Ustel gecikme, istek islegini acik tutar; asiri kullanildiginda baglanti
  havuzunu tuketebilir. Gecikme UST SINIRI olmalidir.
- IPv6'da adres bollugu nedeniyle IP bazli sayaclar zayiftir; prefix (/64)
  bazinda sayilmasi degerlendirilmelidir.

## Degerlendirilen alternatifler

| Alternatif | Neden secilmedi |
| ---------- | --------------- |
| Yalnizca e-posta bazli kilit | Hedefli DoS + hesap numaralandirma; kilit saldiri aracina doner |
| Yalnizca IP bazli kilit | Botnet/proxy ile atlanir; NAT arkasindaki mesru kullanicilari engeller |
| Kilit yerine yalnizca CAPTCHA | Ucuncu taraf bagimliligi; erisilebilirlik sorunu; bot cozucu servisler ucuz |
| Kalici kilit (manuel acma) | Destek yuku ve DoS etkisi; hicbir esikte hakli degil |
| Kilit durumunu kullaniciya soylemek | Hesap varlik oracle'i |
| Tek katman, yuksek esik | Ya DoS'a acik ya da puskurtmeyi kaciran bir denge; tek sayac ikisini birden cozemez |

## Bu karar ne zaman yeniden gozden gecirilir?

- **CAPTCHA / adaptif zorluk** eklendiginde katman 3'un davranisi degisir.
- MFA eklendiginde: ikinci faktor, parola tahmininin degerini dusurur ve esikler
  gevsetilebilir.
- IPv6 trafigi anlamli hale geldiginde prefix bazli sayim.
- Telemetride yanlis pozitif (mesru kullanicinin engellenmesi) gorunurse
  esikler ayarlanir — ama gizlilik kurali (Degismez) ASLA gevsetilmez.
