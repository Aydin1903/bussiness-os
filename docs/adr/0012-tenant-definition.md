# 0012 — Tenant Definition: One Company = One Tenant

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-21
- **Karar veren:** Product Owner
- **Faz:** 2

## Baglam

ADR-0002 izolasyon **mekanizmasini** (shared DB + RLS) secti ama izolasyonun
**sinirini** tanimlamadi: `tenant_id` tam olarak neyi temsil eder?

Bu soru ertelenemez. Tenant'in ne oldugu belirsiz kalirsa her modul kendi
yorumunu uretir; RLS anahtarinin anlami modulden module kayar ve izolasyon
garantisi olculebilir olmaktan cikar.

Ayni sekilde tenant'in **kimlik alanlari** de karisiktir: subdomain etiketi mi
kimliktir, veritabani id'si mi? Bu ikisinin karistirilmasi, routing degisikliginin
veri erisimini etkilemesi demektir.

## Karar

Bir `Tenant` **tam olarak bir sirkete** karsilik gelir.

Tenant, ayni anda uc sinirin **kesisimidir** ve bu uc sinir ayni varliga baglidir:

| Sinir             | Anlami                                        |
| ----------------- | --------------------------------------------- |
| Izolasyon siniri  | Veri buradan disari cikmaz                    |
| Faturalama siniri | Plan, kota ve fatura buraya kesilir           |
| Yonetim siniri    | Roller, davetler ve ayarlar burada tanimlanir |

Kimlik alanlari uc tanedir ve **rolleri karistirilamaz**:

| Alan           | Rol                                                        | Degisebilir mi |
| -------------- | ---------------------------------------------------------- | -------------- |
| `id` (UUIDv7)  | Kalici teknik kimlik. RLS anahtari, FK hedefi, JWT claim'i | Asla           |
| `slug`         | Subdomain etiketi. Yalnizca routing/branding               | Kontrollu      |
| `customDomain` | Tenant'in kendi alan adi. Dogrulanmadan aktif olmaz        | Evet           |

`slug` ve `customDomain` **routing kimlikleridir, guvenlik kimligi degildir.**
Veri erisimi daima `id` uzerinden ve daima dogrulanmis JWT claim'inden gelen
degerle yapilir.

Ayrinti: MULTI_TENANT_ARCHITECTURE.md §5.3 ve §6.

## Gerekce

Uc sinirin **ayni** varliga baglanmasi, modelin tum sadeliginin kaynagidir.
Ayristiklari an (ornegin "bir fatura, uc izolasyon alani") hiyerarsi kacinilmaz
hale gelir ve ADR-0013'un ertelemeye karar verdigi karmasiklik bugun odenir.

`slug`'in guvenlik kimligi olmamasi kritik: hicbir veri satiri `slug`'a bagli
olmadigi icin bir tenant slug'ini degistirdiginde tek bir satir bile etkilenmez.
Ters model (slug'i kimlik yapmak) yeniden adlandirmayi veri migrasyonuna cevirir
ve subdomain'i istemci kontrolunde bir yetki kaynagi haline getirir.

## Sonuclari

**Olumlu**

- `tenant_id` tek ve duz bir anahtardir; her RLS politikasi ayni tek satirlik
  sablonu kullanir.
- Faturalama, kota ve yonetim ayni sinira dustugu icin "bu kayit kimin" sorusunun
  tek bir cevabi vardir.
- Slug/domain degisikligi veri katmanini hic etkilemez.

**Olumsuz / bedeli**

- **Ayni sirketin iki departmani veri ayrimi isterse, V1'de tek cozum iki ayri
  tenant acmaktir.** Bu, iki ayri fatura ve departmanlar arasi sifir gorunurluk
  demektir. Kullanicilar iki tenant arasinda gecis yapmak zorunda kalir.
- Sirket birlesme/bolunme senaryolarinda tenant tasima veya birlestirme
  operasyonel bir arac gerektirir; V1'de yoktur.
- Rezerve slug listesi (`www`, `api`, `app`, `admin`, ...) bakim gerektirir;
  liste genisletilebilir ama daraltilamaz.

## Degerlendirilen alternatifler

| Alternatif                                            | Neden secilmedi                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Tenant = calisma alani (workspace), sirket ust varlik | Faturalama ile izolasyonu ayirir; hiyerarsi ve capraz-tenant raporlama bugunden gerekir          |
| Tenant = departman/ekip                               | Izolasyon sinirini asiri paralar; kullanici sayisi kadar tenant, yonetilemez                     |
| Slug'i birincil kimlik yapmak                         | Yeniden adlandirma veri migrasyonuna doner; subdomain istemci kontrolunde bir yetki kaynagi olur |
| Tenant'i faturalama disinda tutmak                    | "Bu maliyeti kim odeyecek" sorusu cevapsiz kalir; kota zorlamasi dayanaksiz olur                 |

## Bu karar ne zaman yeniden gozden gecirilir?

Ayni sirket icinde departman bazli veri ayrimi talebi tekrar eden bir musteri
ihtiyaci haline geldiginde. O noktada cozum tenant tanimini degistirmek degil,
ADR-0013'un ertelendigi Organization katmanini gundeme almaktir.
