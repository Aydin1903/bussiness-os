# 0020 — JWT yapisi ve imzalama: iki asamali token, EdDSA

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-21
- **Karar veren:** Product Owner
- **Faz:** 3

## Baglam

Iki gereksinim ilk bakista celisiyordu:

1. **"Token tenant SECMEZ"** — kullanici birden fazla tenant'a uye olabilir
   (ADR-0014) ve giris aninda hangisini istedigi bilinmez.
2. **MULTI_TENANT_ARCHITECTURE P1 ve I4** — "tenant kimliginin tek mesru kaynagi
   dogrulanmis JWT claim'idir", "`tenant_id` yalnizca dogrulanmis JWT
   claim'inden gelir".

Token tenant tasimazsa `SET LOCAL app.current_tenant_id` degerinin kaynagi
kalmaz. Geriye yalnizca `Host` basligi kalirdi — ki bu tam olarak P1'in
yasakladigi seydir ve tum RLS modelini gecersiz kilar.

Ayrica imzalama algoritmasi hic karara baglanmamisti.

## Karar

### Iki asamali token

| Asama     | Token                          | `tenant` claim'i | Omur  | Ne yapabilir                             |
| --------- | ------------------------------ | ---------------- | ----- | ---------------------------------------- |
| 1 — giris | **Kimlik token'i**             | YOK              | 5 dk  | Yalnizca uyelik listesi ve tenant secimi |
| 2 — secim | **Tenant-scoped access token** | VAR              | 15 dk | Tenant verisine erisim                   |

Tenant secimi MULTI_TENANT_ARCHITECTURE 7.4'teki `switch-tenant` akisidir ve
**membership dogrulamasindan gecer**.

### Access token claim'leri

`iss` · `aud` · `sub` (userId) · `sid` (token ailesi) · `tenant` · `typ` ·
`jti` · `iat` · `exp`

### Token'da BULUNMAYANLAR

Rol / izinler · membership listesi · e-posta / ad · `emailVerified`

### Imzalama

**EdDSA (Ed25519).** Anahtar rotasyonu icin JWT basliginda `kid` tasinir;
dogrulayici birden fazla acik anahtari ayni anda kabul eder.

## Gerekce

**Neden iki asama.** Model, "token tenant secmez" ile "token tenant tasir"
ifadelerini uzlastirir: secimi yapan token DEGIL, membership dogrulamasidir;
token yalnizca dogrulanmis sonucu tasir. Tek asama olsaydi ya giris bir tenant
TAHMIN etmek zorunda kalirdi ya da tenant kimligi token disindan gelirdi.

**Neden rol ve izin tasinmaz.** Token bir IDDIA tasir, YETKI tasimaz. Rol
degistiginde token bayatlar; yetkisi alinmis bir kullanici eski roluyle
calismaya devam ederdi. MULTI_TENANT_ARCHITECTURE 14.1 T4 bunu acikca
"bayat izin = guvenlik acigi" diye tanimliyor. Rol ve membership HER ISTEKTE
dogrulanir.

**Neden PII tasinmaz.** JWT SIFRELI DEGILDIR, yalnizca imzalidir. Base64 cozen
herkes payload'i okur. Iceriye konan her alan "istemcinin gormesi sakincasiz mi"
sorusundan gecmelidir. E-posta ve ad, her istekte agda ve loglarda dolasmamali.

**Neden EdDSA, HS256 degil.** HS256 simetriktir: dogrulayan HER servis sirri
bilir ve dolayisiyla token URETEBILIR. ARCHITECTURE 11 mikroservise ayrilmayi
acik bir hedef olarak yaziyor; o gun HS256'dan cikmak tum servislerde token
dogrulamasini degistirmek demektir. EdDSA ile yalnizca Identity ozel anahtari
tutar, digerleri acik anahtarla YALNIZCA dogrular. Bugun maliyeti neredeyse
sifir.

**Neden `kid`.** Anahtar rotasyonu icin sart. Olmadan anahtar degisimi, tum aktif
oturumlarin aninda dusmesi demektir.

**Neden `sid`.** Token ailesi kimligi; iptal ve denetim izi icin. Bir oturumun
uretttigi tum access token'lar ayni `sid`'i tasir.

## Sonuclari

**Olumlu**

- P1 ve I4 korunur: tenant kimligi daima dogrulanmis claim'den gelir.
- Cok-tenant kullanici dogal olarak desteklenir; giris tenant tahmin etmez.
- Rol degisikligi aninda etkili olur; bayat yetki olusmaz.
- Mikroservise gecis token dogrulamasini etkilemez.
- Anahtar rotasyonu oturumlari dusurmeden yapilabilir.

**Olumsuz / bedeli**

- **Istemci iki asamayi yonetmek zorunda**: giris sonrasi tenant secimi ekrani
  gerekir. Tek tenant'i olan kullanici icin bu fazladan bir adimdir; arayuzde
  otomatik secim yapilabilir ama sunucu yine membership dogrulamasindan gecer.
- Her istekte membership/rol dogrulamasi bir veritabani okumasi demektir.
  Cache'lenirse TTL kisa tutulmali ve uyelik degisiminde acikca invalidate
  edilmelidir — bayat cache, bayat token kadar tehlikelidir.
- **Anahtar cifti yonetimi** (uretim, saklama, rotasyon) HS256'nin tek sirrindan
  daha fazla operasyonel istir. Ozel anahtar secret manager'da tutulur ve ASLA
  repoda bulunmaz.
- Access token cikis sonrasi 15 dakikaya kadar gecerli kalir (ADR-0023).

## Degerlendirilen alternatifler

| Alternatif                                 | Neden secilmedi                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Tek token, tenant claim'li                 | Giris aninda tenant tahmin etmek zorunda kalir; cok-tenant kullanici icin yanlis tenant secilebilir |
| Tek token, tenant claim'siz                | `SET LOCAL` kaynagi kalmaz; tenant `Host`'tan gelirdi — P1 ihlali, RLS modeli comer                 |
| Tenant'i header'da tasimak (`X-Tenant-Id`) | Istemciden gelen deger; DEVELOPMENT_RULES 4.5 geregi acikca yasak                                   |
| Role/izinleri token'a koymak               | Bayat yetki; MULTI_TENANT_ARCHITECTURE 14.1 T4                                                      |
| HS256                                      | Dogrulayan her servis token uretebilir; mikroservis gecisinde pahali migrasyon                      |
| RS256                                      | Calisir ama Ed25519'a gore daha buyuk anahtar/imza ve daha yavas; yeni sistemde tercih sebebi yok   |
| Opak (JWT olmayan) access token            | Her istekte veritabani okumasi; JWT'nin tek avantaji olan durumsuz dogrulamayi kaybederdik          |

## Bu karar ne zaman yeniden gozden gecirilir?

- **Es zamanli cok-tenant oturum** talebi gelirse (bugun N7 ile reddedilmis).
- Access token'in 15 dakikalik iptal edilemezlik penceresi kabul edilemez hale
  gelirse — `sid` bazlı dar deny-list gundeme gelir (ADR-0023).
- Mikroservise gecis basladiginda: `kid` dagitimi ve JWKS ucu tasarlanmali.
