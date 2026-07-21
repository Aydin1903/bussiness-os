# 0024 — Parola sifirlama

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-21
- **Karar veren:** Product Owner
- **Faz:** 3

## Baglam

AUTH_ARCHITECTURE'in ilk taslaginda parola sifirlama bir NON-GOAL idi: "kendi
basina bir akis, e-posta altyapisi ve token modeli oturduktan sonra."

Bu degerlendirme gozden gecirildi. Parola sifirlama olmadan, parolasini unutan
bir kullanicinin hesabina erisim yolu **hic yoktur**. Destek ekibi bile
yardim edemez — cunku parolayi sifirlayacak bir mekanizma yok. Bu, kullanilabilir
bir urun icin kabul edilemez bir bosluktur ve "sonra ekleriz" denemeyecek kadar
temeldir.

Ayrica ADR-0019 ile kod deseni zaten kurulmus durumdadir; sifirlama onu yeniden
kullanir ve marjinal maliyeti dusuktur.

## Karar

Parola sifirlama **Faz 3 kapsamindadir** ve ADR-0019'un kod desenini
**daha siki parametrelerle** kullanir.

| Parametre | Dogrulama (0019) | **Sifirlama** |
| --------- | ---------------- | ------------- |
| Kod omru | 15 dk | **10 dk** |
| Yanlis deneme | 5 | **3** |
| Resend bekleme | 60 sn | **120 sn** |
| Saklama | HMAC + pepper | Ayni |

**Sifirlama tamamlandiginda zorunlu yan etkiler:**

1. Kullanicinin **tum refresh aileleri iptal edilir** (ADR-0023).
2. Aktif tum sifirlama kodlari gecersizlesir.
3. Hesaba **bilgilendirme e-postasi** gonderilir.

**Gizlilik:** sifirlama talebi yaniti, e-posta kayitli olsun olmasin AYNIDIR.

## Gerekce

**Neden daha siki parametreler.** Tehdit modeli farklidir. Dogrulama kodu bir
hesabi AKTIVE eder; sifirlama kodu bir hesabi **ELE GECIRMEYE YETER**. Ayni
riski tasimayan iki mekanizmaya ayni esikleri vermek, ikisinden birini yanlis
ayarlamak demektir.

**Neden tum oturumlar iptal edilir.** Parola sifirlamanin en yaygin sebebi
"hesabim ele gecirilmis olabilir" supkesidir. Eski oturumlarin ayakta kalmasi,
islemi anlamsiz kilar: saldirgan zaten elindeki refresh token ile devam eder.

**Neden bilgilendirme e-postasi.** Sifirlamayi YAPAN kisi zaten biliyor. Bu
e-posta, **yapmayan** kisi icin vardir: hesabi ele gecirilmekte olan kullanici
icin bu, tek erken uyaridir.

**Neden ayni gizlilik kurali.** Sifirlama talebi "bu e-posta kayitli mi"
sorusuna cevap verirse, kayit ve giris uclarindaki tum gizlilik onlemleri
anlamsizlasir. Zincirin en zayif halkasi belirleyicidir.

## Sonuclari

**Olumlu**

- Parolasini unutan kullanici icin kurtarma yolu var.
- Kod deseni yeniden kullanildigi icin ek karmasiklik dusuk.
- Hesap ele gecirme supkesinde kullanici tum oturumlari tek islemle dusurebilir.

**Olumsuz / bedeli**

- **Yeni ve degerli bir saldiri yuzeyi.** Sifirlama akisi, basarili oldugunda
  dogrudan hesap erisimi verir. Bu yuzden oran sinirlari ve deneme sinirlari
  dogrulama akisindan DAHA sikidir ve gevsetilmemelidir.
- E-posta hesabi ele gecirilmis bir kullanicinin Business OS hesabi da ele
  gecirilebilir. Bu, e-posta tabanli sifirlamanin YAPISAL siniridir; cozumu MFA'dir
  ve MFA V1'de yoktur.
- Sifirlama sonrasi tum oturumlarin dusmesi, cok cihazli kullanicilar icin
  rahatsiz edicidir. Bilincli bir tercihtir.
- Bir kullaniciya tekrar tekrar sifirlama e-postasi gondererek taciz mumkundur;
  120 sn bekleme ve saatlik ust sinir bunu sinirlar ama tamamen ortadan
  kaldirmaz.

## Degerlendirilen alternatifler

| Alternatif | Neden secilmedi |
| ---------- | --------------- |
| Sifirlamayi V1'e almamak | Parolasini unutan kullanici icin kurtarma yolu kalmaz; destek bile cozemez |
| Baglanti tabanli sifirlama | ADR-0019 ile ayni gerekceler: oturum bolunmesi, e-posta tarayicilarinin tuketmesi |
| Dogrulama ile ayni parametreler | Sifirlama daha yuksek riskli; ayni esikler ya birini gevsek ya digerini asiri siki yapar |
| Sifirlama sonrasi oturumlari korumak | Ele gecirme senaryosunda islemi anlamsiz kilar |
| Guvenlik sorulari | Cevaplari sosyal medyadan bulunabilir; NIST acikca onermiyor |
| Destek ekibi uzerinden manuel sifirlama | Sosyal muhendislige acik; denetlenemez |

## Bu karar ne zaman yeniden gozden gecirilir?

- **MFA eklendiginde**: sifirlama akisi ikinci faktoru de dogrulamali, aksi
  halde MFA'yi atlatmanin yolu haline gelir. Bu, MFA ADR'sinin acikca ele almasi
  gereken bir noktadir.
- SSO eklendiginde: federe kullanicilar icin parola sifirlama ANLAMSIZDIR ve
  akis onlara sunulmamalidir.
- Taciz (sifirlama e-postasi bombardimani) sikayeti gelirse oran sinirlari
  sikilastirilir.
