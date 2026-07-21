# 0021 — Refresh token rotation ve yeniden kullanim tespiti

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-21
- **Karar veren:** Product Owner
- **Faz:** 3

## Baglam

CLAUDE.md ve ADR-0004 "refresh rotation" demisti ama rotasyonun NASIL
yapilacagini ve — daha onemlisi — CALINMIS bir token'in nasil tespit
edilecegini tanimlamamisti.

Rotasyon tek basina bir tespit mekanizmasi DEGILDIR. Yalnizca token'i
degistirmek, calan tarafin isini bir kullanim geciktirir: saldirgan token'i
mesru kullanicidan once kullanirsa zinciri devralir ve kullanici sessizce
disarida kalir. Kullanici "oturumum dustu" der, yeniden giris yapar ve hicbir
sey olmamis gibi devam eder — saldirgan ise iceridedir.

## Karar

| Kural | Deger |
| ----- | ----- |
| Bicim | 256 bit kriptografik rastgele deger — **JWT degil** |
| Saklama | Veritabaninda **SHA-256 hash'i** |
| Mutlak omur | 30 gun |
| Rotation | **Her kullanimda**; eski token aninda gecersizlesir |
| **Yeniden kullanim** | **Tum AILE iptal edilir** + guvenlik alarmi |

**Aile (token family):** bir giristen dogan refresh token zinciri. Hirsizlik
tespitinin birimidir.

**Her yenilemede yeniden dogrulananlar:** kullanici `active` mi · secili
tenant'taki membership `active` mi · tenant `active` mi. Biri bile hayirsa
yenileme reddedilir.

## Gerekce

**Neden JWT degil.** Refresh token'in kendi kendini dogrulamasina gerek yoktur —
zaten her kullanimda veritabanina bakilir (iptal kontrolu icin). JWT yapmak,
iptal edilemeyen bir yapiyi iptal edilebilir kilmaya calismak olurdu.

**Neden SHA-256, Argon2 degil.** Argon2 DUSUK ENTROPILI girdiler (parolalar)
icindir. 256 bit rastgele bir degerin kaba kuvvetle bulunmasi zaten
imkansizdir; yavas KDF her yenilemeye 100+ ms eklerdi, hicbir sey
kazandirmadan. Hash'lemenin buradaki tek amaci, veritabani sizintisinda
token'larin dogrudan kullanilamamasidir.

**Neden yeniden kullanimda TUM aile iptal edilir.** Zaten kullanilmis bir
refresh token yeniden sunulursa, IKI TARAF ayni zinciri kullaniyor demektir:
mesru kullanici ve token'i calan taraf. Hangisinin hangisi oldugunu BILEMEYIZ.

Bu yuzden ailenin tamami iptal edilir:

- Mesru kullanici yeniden giris yapar — kucuk rahatsizlik.
- Saldirgan erisimini kaybeder — asil kazanc.

Yanlis tarafi cezalandirma riskini almak yerine ikisini de dusurmek, tek dogru
davranistir. Kararsiz kalip hicbir sey yapmamak, saldirganin lehinedir.

**Neden yenilemede yetki yeniden dogrulanir.** Refresh, yalnizca yeni token
uretmek degildir; yetkinin HALA GECERLI oldugunun kontrol noktasidir. Uyeligi
iptal edilmis bir kullanicinin refresh ile sonsuza kadar yeni access token
almaya devam etmesi, iptalin anlamini yok ederdi.

## Sonuclari

**Olumlu**

- Calinmis token TESPIT EDILEBILIR hale gelir — rotasyonun asil degeri budur.
- Sizan veritabani token'lari dogrudan kullanilabilir kilmaz.
- Uyelik/tenant iptalleri en gec bir yenileme dongusunde etkili olur.
- Her yenileme bir denetim izi birakir (`used_at`).

**Olumsuz / bedeli**

- **Yanlis pozitif riski gercektir.** Ag kesintisinde veya es zamanli iki
  sekmede istemci ayni refresh token'i iki kez gonderebilir ve aile iptal
  edilir. Kullanici sebepsiz yere cikis yapmis gorunur.
  Telafi: istemci tarafinda yenileme cagrilari TEKILLESTIRILMELI (ayni anda tek
  yenileme); ve kisa bir "gecis penceresi" (orn. 10 sn icinde ayni token'in
  tekrari tolere edilir) degerlendirilebilir — ama bu pencere, saldirgana da
  ayni toleransi tanir ve V1'de EKLENMEDI.
- Her yenileme bir veritabani yazmasidir; yuksek trafikte `refresh_tokens`
  tablosu hizli buyur. Saklama suresi politikasi (30 gun sonra temizlik)
  bastan planlanmalidir.
- Token ailesi kavrami veri modelini karmasiklastirir (iki tablo).

## Degerlendirilen alternatifler

| Alternatif | Neden secilmedi |
| ---------- | --------------- |
| Rotasyonsuz, uzun omurlu refresh token | Calinan token 30 gun boyunca gecerli; tespit imkani yok |
| Rotasyon var ama yeniden kullanimda yalnizca O TOKEN reddedilir | Saldirgan zinciri devralir, mesru kullanici disarida kalir ve kimse fark etmez |
| Refresh token'i JWT yapmak | Iptal edilebilirlik kaybedilir; her kullanimda DB'ye zaten bakiliyor |
| Argon2 ile hash'leme | Yuksek entropili token icin gereksiz; her yenilemeye 100+ ms ekler |
| Token'i duz saklamak | Veritabani sizintisi dogrudan oturum ele gecirmeye donusur |
| Yenilemede yetki dogrulamamak | Iptal edilmis uyelik sonsuza kadar token uretmeye devam eder |

## Bu karar ne zaman yeniden gozden gecirilir?

- Yanlis pozitif (sebepsiz cikis) sikayetleri telemetride anlamli sekilde
  gorunurse: kisa gecis penceresi veya istemci tarafi tekillestirme zorunlulugu
  tekrar degerlendirilir.
- Mobil istemci eklendiginde: agir ag kesintisi profili yanlis pozitifleri
  artirabilir.
- `refresh_tokens` tablosu olcek sorunu uretirse: saklama suresi kisaltilir veya
  bolumleme (partitioning) gundeme gelir.
