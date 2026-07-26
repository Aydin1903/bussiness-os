# 0026 — Frontend token saklama ve tasima: hibrit cookie

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-24
- **Karar veren:** Product Owner
- **Faz:** 3

## Baglam

ADR-0020 iki asamali token modelini tanimladi: kimlik token'i (5 dk), tenant-scoped
access token (15 dk). ADR-0021 refresh token'i tanimladi: 256 bit, 30 gun kayan
pencere, 90 gun tavan, her kullanimda rotasyon, yeniden kullanimda tum aile iptal.

Ama bu token'larin ISTEMCIDE NEREDE saklanacagi hic karara baglanmamisti. Bugunku
backend saf bearer-token modelidir: tum token'lar JSON govdesinde doner, refresh
token istek govdesinden okunur, hicbir sey cookie degildir.

Karar guvenlik kritiktir cunku token saklama secimi tam olarak XSS ve CSRF yuzeyini
belirler. Bir web istemcisinde en pahali olay hesap ele gecirmedir ve bunun en
olası vektoru, uzun omurlu kimlik bilgisinin (refresh token) JavaScript tarafindan
okunabilir bir yerde durmasidir.

## Karar

**Hibrit saklama:**

| Token | Nerede | Neden |
| ----- | ------ | ----- |
| **refresh token** | `HttpOnly` + `Secure` + `SameSite` cookie, `Path=/api/v1/auth` | JS okuyamaz; XSS sizdiramaz |
| **access token** | JS memory (React state / modul degiskeni) | kisa omurlu, Bearer tasima gerektirir, CSRF'e bagisik |
| **identity token** | JS memory | yalnizca tenant secimi; kalici deger tasimaz |

**`localStorage` / `sessionStorage` HICBIR token icin kullanilmaz.**

Bu karar bir **backend kontrat degisikligini** onceden gerektirir: `login` /
`refresh` / `switch-tenant` / `logout` `Set-Cookie` yazmali, `refresh` token'i
cookie'den okumali, CORS `credentials: true` + CSRF stratejisi eklenmelidir.
Backend web-disi istemciler icin **govde tasimasini da korur** (iki tasima).

> Bu ADR karari verir; backend degisikligi AYRI, dikkatle planlanacak bir sonraki
> is olarak uygulanir. Karar once verilir cunku istemci kodu yazildiktan sonra
> token saklamayi degistirmek cok daha pahalidir.

## Gerekce

**Neden cookie yalnizca refresh token icin.** Bu modelin tehlikeli tek seyi 30 gun
omurlu refresh token'dir; calinirsa yeniden kullanim tespit edilene kadar hesap
saldirganin elindedir. `HttpOnly` cookie JS erisimini tamamen keser — bir XSS acigi
bile onu okuyamaz.

**Neden access token memory'de, cookie'de degil.** Korunan uclar `Authorization:
Bearer` bekler (ADR-0020 stateless dogrulama). Access token cookie'ye konsa CSRF
yuzeyi HER isteme yayilirdi. Memory + explicit header ise ambient gonderilmez,
dolayisiyla CSRF'e bagisiktir. XSS memory'deki access token'i sayfa omru boyunca
okuyabilir — ama yalnizca 15 dk, tek tenant scope ve refresh token'a ULASAMAZ;
kalici ele gecirme olmaz.

**Neden localStorage hicbir zaman.** Diske yazilan token herhangi bir script
tarafindan okunur. Refresh token'i localStorage'da tutmak, tum bu savunmayi bir
satirda cozer; projenin P1/P2 gizlilik disiplinine aykiridir.

**CSRF neden burada zaten zayif.** Cross-site tetiklenen bir `refresh` cagrisinin
donduru yeni token GOVDEDE gelir ve saldirganin cross-origin JS'i onu CORS
nedeniyle OKUYAMAZ. En fazla gereksiz bir rotasyon olur; o da `SameSite=Strict`
ve double-submit token ile kapanir.

**Neden ADR-0020 ile celismez.** Access token yine Bearer, yine durumsuz dogrulanir;
mikroservise gecis hedefi korunur. Yalnizca refresh TASIMASI cookie'ye tasinir.

## Sonuclari

**Olumlu**

- Uzun omurlu kimlik bilgisi (refresh token) XSS'ten tamamen izole edilir.
- Access token asla diske yazilmaz; maruz kalma penceresi 15 dk ile sinirli.
- Bearer + memory secimi access token'i CSRF'e bagisik kilar.
- Cookie tasimasi, ileride Server Component'larin auth'i gormesini (SSR auth)
  mumkun kilar (FRONTEND_ARCHITECTURE §3.1).

**Olumsuz / bedeli**

- **Backend kontrati degisir.** Yazilmis ve test edilmis temiz stateless model
  genisletmeli: Set-Cookie, cookie'den refresh okuma, CORS credentials, CSRF.
- **httpOnly cookie web'e ozgudur.** Mobil/programatik istemci cookie kullanamaz;
  backend muhtemelen IKI tasimayi (cookie + govde) surdurmek zorunda kalir — gercek
  bir karmasiklik.
- `SameSite` + double-submit CSRF ek bir istemci/sunucu koordinasyonu getirir.
- Karar bugun uygulanamayan bir hedefi tanimlar; doküman ile kod bir sure ayrik
  kalir (FRONTEND_ARCHITECTURE §0 bunu acikca isaretler).

## Degerlendirilen alternatifler

| Alternatif | Neden secilmedi |
| ---------- | --------------- |
| Tum token'lar `localStorage`/JS | Refresh token XSS ile okunur → 30 gun hesap ele gecirme; kabul edilemez |
| Tum token'lar JS memory (persist yok) | Guvenli ama her reload = yeniden giris; "beni hatirla" imkansiz, kotu UX |
| Access token da cookie'de | CSRF yuzeyi her isteme yayilir; Bearer stateless modeli bozulur |
| Refresh token'i normal (non-httpOnly) cookie | JS okur → localStorage ile ayni XSS zafiyeti |
| Backend'i degistirmeyip govde modelinde kalmak | Refresh token JS'e goruunur kalir; bu ADR'nin cozdugu sorun cozulmez |

## Bu karar ne zaman yeniden gozden gecirilir?

- Mobil istemci eklendiginde: cookie tasimasi ise yaramaz; govde tasimasi + guvenli
  saklama (Keychain/Keystore) o istemci icin ayri karara baglanir.
- `SameSite`/CSRF stratejisi uretimde yanlis pozitif (sebepsiz cikis) uretirse:
  gecis penceresi veya alternatif CSRF yaklasimi degerlendirilir.
- Backend mikroservise ayrildiginda: cookie set eden uc ile dogrulayan servisler
  arasindaki sinir yeniden cizilir.
