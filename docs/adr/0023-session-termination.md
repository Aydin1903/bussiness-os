# 0023 — Oturum sonlandirma ve iptal

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-21
- **Karar veren:** Product Owner
- **Faz:** 3

## Baglam

"Cikis" en cok yanlis uygulanan guvenlik ozelliklerinden biridir. Yaygin hata,
cikisi bir ISTEMCI islemi saymaktir: `localStorage.clear()` cagrilir, kullanici
giris ekranina yonlendirilir ve is bitmis sayilir.

Bu, token'in kopyasini almis bir saldirgani HIC ETKILEMEZ. Token hala gecerlidir
ve saldirgan kullanmaya devam eder. Kullanici "cikis yaptim" sanir.

Ayrica cikis, iptalin yalnizca bir tetikleyicisidir. Parola degisikligi, uyelik
iptali, tenant askiya alma — hepsi oturumlari sonlandirmalidir ve bunlar
MULTI_TENANT_ARCHITECTURE 15.3'te "guvenlikle baglantili event'ler" olarak
zaten isaretlenmisti; karsiligi tanimlanmamisti.

## Karar

### Cikis SUNUCUDA gerceklesir

| Islem | Etki |
| ----- | ---- |
| `POST /auth/logout` | Sunulan refresh token'in **ailesi** iptal edilir |
| `POST /auth/logout-all` | Kullanicinin **tum** aileleri iptal edilir |

### Iptal tetikleyicileri

| Olay | Kapsam |
| ---- | ------ |
| Parola degisikligi / sifirlama | Kullanicinin TUM aileleri |
| Refresh token yeniden kullanimi | Ilgili aile (ADR-0021) |
| Kullanici `deactivated` / `locked` | Tum aileler |
| `MemberRemoved` / `MemberSuspended` | Ilgili TENANT'a bagli oturumlar |
| `TenantSuspended` / `TenantArchived` | O tenant'a bagli oturumlar |

### Access token'in iptal edilemezligi — KABUL EDILDI

Cikis sonrasi mevcut access token, suresi dolana kadar (**en fazla 15 dakika**)
teknik olarak gecerli kalir. V1'de deny-list YOKTUR.

## Gerekce

**Neden sunucu tarafi.** Cikis bir DURUM DEGISIKLIGIDIR, bir arayuz olayi degil.
Istemcideki temizlik yalnizca o cihazi etkiler; calinan bir kopya etkilenmez.

**Neden aile bazli.** ADR-0021'in aile modeli zaten var; cikis, ailenin
iptalidir. Tek tek token iptali, rotasyon nedeniyle anlamsizdir — zaten her
kullanimda degisiyorlar.

**Neden `logout-all` ayri.** Kullanici bir cihazini kaybettiginde tum
oturumlarini sonlandirmak isteyebilir. Bu, "cihaz yonetimi" arayuzu olmadan da
sunulabilen minimum yetenektir.

**Neden parola degisikliginde TUM aileler.** Parola degistirmenin en yaygin
sebebi "hesabim ele gecirilmis olabilir" supkesidir. Eski oturumlarin ayakta
kalmasi bu islemi anlamsiz kilardi.

**Neden access token deny-list'i YOK.** Her istekte bir deny-list aramasi, JWT'nin
tek avantaji olan DURUMSUZ dogrulamayi ortadan kaldirir ve her istege bir
veritabani/cache okumasi ekler. 15 dakikalik pencere, bu maliyete karsi bilincli
olarak kabul edilmistir.

## Sonuclari

**Olumlu**

- Cikis gercekten oturumu bitirir; calinan refresh token kullanilamaz hale gelir.
- Uyelik ve tenant iptalleri oturumlara yansir — MULTI_TENANT_ARCHITECTURE
  15.3'un karsiligi tanimlanmis olur.
- Durumsuz access token dogrulamasi korunur; her istek DB'ye gitmez.

**Olumsuz / bedeli**

- **Cikis sonrasi 15 dakikaya kadar access token gecerli kalir.** Bu, dokumante
  edilmis ve kabul edilmis bir aciktir. Cihazini kaybeden veya hesabinin ele
  gecirildigini dusunen kullanici icin bu pencere UZUN olabilir.
- Guvenlik kritik olaylarda (parola sifirlama, hesap askiya alma) bu pencere
  kabul edilemez hale gelirse, `sid` bazli DAR bir deny-list gerekecektir —
  tum token'lar icin degil, yalnizca iptal edilmis aileler icin. Bu, ertelenmis
  bir istir ve ertelendigi burada yazilidir.
- Event tabanli iptal (uyelik/tenant) asenkrondur; outbox publisher gecikirse
  iptal de gecikir. Gecikme suresi izlenmelidir.
- `logout-all` tum cihazlari dusurur; kullanici bunu beklemiyorsa rahatsiz olur.
  Arayuzde acikca belirtilmelidir.

## Degerlendirilen alternatifler

| Alternatif | Neden secilmedi |
| ---------- | --------------- |
| Yalnizca istemci tarafi cikis | Calinan token kopyasini hic etkilemez; guvenlik gorunumu uretir, guvenlik uretmez |
| Her istekte access token deny-list kontrolu | Durumsuz dogrulamayi ortadan kaldirir; her istege ek okuma |
| Access token omrunu 1-2 dakikaya dusurmek | Pencereyi daraltir ama yenileme trafigini 7-15 kat artirir |
| Refresh token'i silmek yerine yalnizca isaretlemek | Secildi zaten (iptal isareti); fiziksel silme denetim izini yok ederdi |
| Cikista yalnizca sunulan token'i iptal etmek | Ayni aileden tureyen digerleri gecerli kalirdi |

## Bu karar ne zaman yeniden gozden gecirilir?

- Bir guvenlik olayindan sonra 15 dakikalik pencere sorun olarak tespit
  edilirse: `sid` bazli dar deny-list uygulanir.
- Kurumsal musteri "aninda oturum sonlandirma" (immediate revocation) sozlesme
  sarti getirirse.
- Cihaz/oturum yonetimi arayuzu eklendiginde: kullanici tek tek oturum
  sonlandirabilmeli.
