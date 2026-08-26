# 0047 — Faz 5 / Modul 11: Kampanya / Pazarlama Notlari

- **Durum:** ⚠️ **KABUL EDILDI ve KAPANDI** (Slice 0-2 tamam; HAFIF kapanis denetimi 2026-08-26)
- **Tarih:** 2026-08-25
- **Karar veren:** Product Owner
- **Faz:** 5

## Baglam

Faz 5'in ilk **on** modulu kapandi ve prod'da canli: CRM
([ADR-0031](0031-crm-module.md) + [ADR-0032](0032-company-summary.md)) ·
Projeler ([ADR-0033](0033-projects-module.md)) ·
Finans ([ADR-0034](0034-finance-module.md)) ·
Randevu/Rezervasyon ([ADR-0035](0035-randevu-rezervasyon-modulu.md)) ·
Belge/Sozlesme ([ADR-0037](0037-belge-sozlesme-yonetimi.md)) ·
Stok/Envanter ([ADR-0039](0039-stok-envanter-modulu.md)) ·
Tedarikci ([ADR-0040](0040-tedarikci-yonetimi-modulu.md)) ·
Teklif/Fatura ([ADR-0041](0041-teklif-fatura-modulu.md)) ·
IK/Personel ([ADR-0043](0043-ik-personel-modulu.md) +
[ADR-0044](0044-ik-v2-izin-ve-zenginlestirilmis-calisan-kaydi.md)) ·
Musteri Geri Bildirimi ([ADR-0045](0045-musteri-geri-bildirim-modulu.md)).

Platform seviyesinde **dort** is kalici standarttir:
[ADR-0036](0036-context-retrieval-kota.md) (havuzun yapisal taban kisiti),
[ADR-0042](0042-retrieval-taban-revizyonu.md) (o kisitin olcumle sinanmasi;
T1/T2 tetikleyicileri), [ADR-0046](0046-retrieval-gozlemlenebilirlik.md)
(⚠️ **olcumu yapan ARAC** — `retrieval.select`) ve
[ADR-0038](0038-oda-tasarim-sistemi.md) (ODA).

> ⚠️ **BELGE NOTU — [ADR-0042](0042-retrieval-taban-revizyonu.md)'NIN BASLIGI
> BAYAT.** Durum satiri hala _"Onerildi — PRODUCT OWNER ONAYI BEKLIYOR"_ diyor,
> ama ADR-0045, ADR-0046 ve CLAUDE.md ucu de onun **T2 esigini baglayici**
> sayiyor ve ADR-0046 dogrudan onu uygulamak icin yazildi. Bu ADR de T2'yi
> baglayici kabul eder. ⚠️ Basligin duzeltilmesi **bu isin kapsaminda degildir**
> (Mutlak Kural 1/2) ama **kayda geciyor**: bir okuyucu 0042'yi acip
> "bu karar daha onaylanmamis" diye okuyabilir.

ROADMAP §3.5'in **onbirinci** sirasi **Kampanya / Pazarlama Notlari**dir; kapsam
notu tek cumleyle yazilmis: _"Anlatisal veri — CRM'in embedding desenini yeniden
kullanir"_. **Onikinci sema.**

⚠️ Bu modul **hicbir sira bagimliligi tasimaz**: ROADMAP'in uc bagimliligi
(`8 → 3`, `7 → 1`, `5 → object storage`) de kapandi. Yani burada olan tek sey
desenin **onbirinci kez** tekrarlanmasidir — ve bir tekrar, ancak yeni bir soru
soruyorsa yazmaya deger.

### ⚠️ BU MODULUN YENI SORUSU: ARAC ARTIK VAR

[ADR-0045](0045-musteri-geri-bildirim-modulu.md) §3.4 yapisal bir katkiciyi
**reddetmedi**, **kosullu erteledi** ve on kosullari **sirayla** yazdi:

> _"(1) `retrieval.select` gozlemlenebilirlik satiri yazilir, (2) bir kapanis
> denetiminde olcum yapilir, (3) ADR-0036/0042 yeniden acilir, (4) ancak ondan
> sonra katkici."_ ⚠️ _"Sira TERSINE CEVRILEMEZ."_

⚠️ **BIRINCI ADIM 2026-08-25'te TAMAMLANDI** (ADR-0046 kabul edildi ve
uygulandi). Yani bu ADR, esik kontrolunu **kor karar vermeden** yapabilen
**ilk modul ADR'sidir** — ve tam olarak bu yuzden §3 bu belgenin en agir
maddesidir.

⚠️ **Ama ikinci adim TAMAMLANMADI ve bu ADR bunu gizlemez.** ADR-0046'nin
uretebildigi tek olcum, yalnizca geri bildirim verisi olan bir denetim
tenant'inda alindi:

> _"T2'nin girdisi ILK KEZ OLCULDU: kayitli yapisal kaynak **6**, satir
> donduren **0**, bos donen **6**."_ — ADR-0046 § Uygulandi

⚠️ **BU SAYI T2 HAKKINDA HICBIR SEY SOYLEMEZ**, cunku o tenant'ta alti yapisal
kaynagin **konusacak verisi yoktu**. ADR-0046 bu sinirini kendisi yaziyor:
_"anlamli bir dagilim olcumu icin on bir modulun hepsinde veri olan bir denetim
tenant'i gerekir ve boyle bir tohumlama araci da yoktur."_

> ⚠️ **Yani blokaj DEGISTI, kalkmadi.** ADR-0045'te engel _"olcecek arac yok"_
> idi; bugun arac **var**, engel **olculecek veri yok**. Ikisi ayni cumleyle
> gecistirilmemelidir — birincisi bir **muhendislik** eksigiydi, ikincisi bir
> **denetim ortami** eksigidir ve cozumu farklidir (§PO Kalem B).

### Zemin: onbirinci modul, tamamen TUKETICI

| Ne                          | Tedarikci'de           | Teklif/Fatura'da       | Geri Bildirim'de                | **Kampanya'da**                                                  |
| --------------------------- | ---------------------- | ---------------------- | ------------------------------- | ---------------------------------------------------------------- |
| `EmbeddingPort` / `LLMPort` | `shared/`'dan hazir    | HIC KULLANILMADI       | `EmbeddingPort` kullaniliyor    | ⚠️ **`EmbeddingPort` KULLANILIYOR** (`LLMPort` hayir)            |
| Chunk tablosu               | Reddedildi             | Yok (vektor yok)       | Reddedildi                      | ⚠️ **Reddedildi** — ayni birlesik olcutle (§1.3)                 |
| Oran siniri                 | Kosulsuz               | YOK                    | ⚠️ **KOSULLU**                  | ⚠️ **KOSULLU + `PATCH` de sayar** (§8)                           |
| RLS sablonu                 | MT §12.2'den hazir     | MT §12.2'den hazir     | MT §12.2'den hazir              | **MT §12.2'den hazir**                                           |
| Retrieval ucu               | TEK katkici (anlamsal) | TEK katkici (yapisal)  | TEK (anlamsal), aday askida     | ⚠️ **TEK (anlamsal)** — uc yapisal aday, biri **liyakatli** (§3) |
| Izin modeli                 | Sekizinci kez          | Dokuzuncu kez          | ⚠️ `write` YOK, `create` VAR    | ⚠️ **`write` VAR** — §2'nin izin adindaki gorunumu (§5)          |
| Cross-modul referans        | HIC YOK                | TEK kenar, sifir satir | TEK kenar, sifir satir          | **TEK kenar, sifir satir** (dorduncu kez)                        |
| Degistirilebilirlik         | Ekleme-yalniz          | `draft` sonrasi kapali | Degistirilemez ama silinebilir  | ⚠️ **TAM DUZENLENEBILIR — her durumda** (§2)                     |
| `platform/audit`            | Yok                    | Yok                    | Kullanilmiyor (alan degismiyor) | ⚠️ **Degerlendirildi ve KULLANILMIYOR** — alan DEGISIYOR (§2.4)  |
| ODA                         | Ilk gunden             | Ilk gunden             | Ilk gunden                      | **Ilk gunden**                                                   |

**Gercekten yeni DORT karar var:**

1. ⚠️ **YAPISAL ADAY ILK KEZ "SESSIZ OLABILEN" BIR ADAY** (§3.4). Bugune kadarki
   her yapisal katkici saglikli durumda da bir satir donduruyordu
   (`crm-pipeline` "3 saglikli firsat", `feedback-satisfaction` "ortalama 4,2").
   Buradaki aday, soyleyecek bir sey yoksa **sifir satir** doner — ve
   ⚠️ **T2 tam olarak satir donduren kaynaklari sayar.** Bu, ADR-0046'nin
   `empty` / `returned` ayriminin **ilk mimari sonucudur**.
2. ⚠️ **BASARISIZ YENIDEN GOMME VEKTORU `NULL`'A CEKER** (§4.2.1). Projede ilk
   kez bir vektor **kasitli olarak silinir** — cunku bayat bir vektor, olmayan
   bir vektorden **daha kotudur**: sessizce eski icerikle cevap verir.
3. ⚠️ **HEDEF KITLE BIR SEGMENT DEGILDIR — VE OLAMAZ** (§6.2). CRM'de
   `segment` diye bir kavram **yoktur**; acmak CRM'in isidir, bu modulun degil.
4. ⚠️ **RETENTION LISTESI BU MODULLE BUYUMEZ** (§ Sonuclari) — ve ilk kez
   **vektor tasiyan** bir tablo listeye **girmeden** aciliyor. Gerekce
   ADR-0040'in kapanis denetiminin duzelttigi hatadir ve bu sefer **once**
   uygulaniyor.

---

## ⚠️ PRODUCT OWNER ONAYINA SUNULAN IKI KALEM

Ikisi de ayri ayri karara baglanabilir; biri reddedilirse digeri ayakta kalir.

### Kalem A — ⚠️ Yapisal katkici v1'de EKLENMIYOR (ikinci kez KOSULLU ERTELEME)

§3.3'un dort testinden **dordu de geciyor** — yani aday, ADR-0045'inkinden
**daha guclu**. Yine de v1'e konmuyor ve gerekce ADR-0045'inkiyle **ayni
degildir**:

| ADR                | Engel                                            | Bugun                     |
| ------------------ | ------------------------------------------------ | ------------------------- |
| ADR-0045 §3.4      | ⚠️ Olcecek **arac yok**                          | ✅ **COZULDU** (ADR-0046) |
| ⚠️ **Bu ADR §3.5** | ⚠️ Olculecek **veri yok** (bos denetim tenant'i) | ❌ **ACIK**               |

- **Onay verilirse** (onerilen): Slice 1 **tek anlamsal katkici** ile yazilir;
  yapisal aday §3.5'in yazili tetikleyicisiyle askida kalir ve
  ⚠️ **bu modulun KAPANIS DENETIMI, ADR-0046'nin aracini gercek bir esik
  sorusu icin kosan ILK olcum olur** (denetim maddesi 8–9).
- **Onay verilmezse** ("katkiciyi simdi ekle"): ⚠️ **implementasyona
  GECILMEZ.** Once ADR-0036/0042 yeniden acilir ve **ayri bir platform ADR'si**
  (**0048 adayi**) yazilir. ADR-0041 §4.3'un ve ADR-0045 §3.4'un sirasi
  tersine cevrilemez: _"once olcum, sonra karar."_

### Kalem B — ⚠️ DENETIM TENANT'I / TOHUMLAMA ARACI (PLATFORM borcu)

⚠️ **Bu, ADR-0046'nin kendi yazdigi bilinen sinirdir** ve bugun Kalem A'nin
**tek** engelidir: `retrieval.select` satiri yazilir, ama on bir modulun
hepsinde veri olan bir tenant olmadan dagilim **hep tek kaynaktan** ibaret
cikar. ADR-0045'in denetimi bunu somut olarak yasadi (`feedback-comments: 4`,
digerleri sifir).

⚠️ **Bu is bu modulun kapsaminda DEGILDIR** (Mutlak Kural 1) — burada yalnizca
**sirasi** soruluyor. Onerilen: bu modulun kapanis denetiminden **once** kucuk
bir tohumlama betigi (her modulden birkac kayit), ya da denetimin **elle**
tohumlanmasi ve bunun bir kez daha _"olculemedi"_ diye kaydedilmemesi.

⚠️ **Ucuncu kez "olculemedi" yazilirsa** (ADR-0043 · ADR-0045 · bu modul), bu
artik bir eksiklik degil bir **surec arizasi**dir: ADR-0042'nin olcum protokolu
uc denetim ust uste **kagitta kalmis** olur.

---

## Karar

### 1. Yeni `marketing` semasi — TEK tablo

Onikinci sema. **`platform` disindaki semalar:** `knowledge` · `crm` ·
`projects` · `finance` · `appointments` · `documents` · `inventory` ·
`suppliers` · `invoicing` · `hr` · `feedback` · **`marketing`**.

#### 1.1 ⚠️ AD `marketing`, `campaign` DEGIL — ve palet BUNU ZATEN BILIYOR

ADR-0035'in `booking` → `appointments` dersi: **sema · modul klasoru · rota ·
`data-module` · `module-colors.css` blogu AYNI KELIME olmalidir**; ayrisirsa
`data-module` **sessizce** tutmaz (ekran calisir, terracotta kalir, lint
yakalamaz).

⚠️ **Kelime `module-colors.css`te ZATEN SECILMIS: `marketing`** (`#7665a6` /
koyu `#ae9de2`). Yani ADR-0035'in yeniden adlandirma isi burada **gerekmiyor**
— `documents` ve `feedback` gibi, palet **ilk gunden dogru adla** yazilmis.

⚠️ **IZIN KAYNAGI ISE `campaign`** ve bu bir tutarsizlik **degildir**: projede
modul anahtari ile izin kaynagi ayrismak **kuraldir**, istisna degil.

| Modul           | Izin kaynaklari                                       |
| --------------- | ----------------------------------------------------- |
| `crm`           | `company` · `contact` · `opportunity` · `interaction` |
| `inventory`     | `stock_item` · `stock_movement`                       |
| `invoicing`     | `quote` · `invoice`                                   |
| **`marketing`** | **`campaign`**                                        |

Ayrim anlamlidir: **modul bir HAFIZA ALANIDIR** (pazarlama hafizasi),
**izin bir KAYNAK uzerindedir** (kampanya). ⚠️ ADR-0045 §5 bunu **ismen
ongormustu** (_"11. ve 12. modullerin kavramlari `campaign` ve
`loyalty_point`tir"_) ve katalog tarandi: `campaign`, `marketing`, `channel`
**ucuyle de** cakisma yok.

#### 1.2 `marketing.campaigns`

| Kolon                | Tip                    | Not                                                                                          |
| -------------------- | ---------------------- | -------------------------------------------------------------------------------------------- |
| `id`                 | `uuid` PK              |                                                                                              |
| `tenant_id`          | `uuid NOT NULL`        | RLS + **FORCE** (MT §12.2)                                                                   |
| `name`               | `text NOT NULL`        | Bos/whitespace **422**; ust sinir **160**                                                    |
| `channel`            | `text NULL`            | ⚠️ Serbest metin etiketi; ust sinir **80** — ADR-0045 §1.5'in **ayni karari** (§1.4)         |
| `starts_on`          | `date NOT NULL`        | ⚠️ **`date`, `timestamptz` DEGIL** (§1.5)                                                    |
| `ends_on`            | `date NULL`            | ⚠️ `null` = **suresiz/acik uclu kampanya** — gercek bir durumdur (§1.5)                      |
| `status`             | `text NOT NULL`        | ⚠️ `CHECK (status IN ('draft','active','done'))` — **SABIT enum** (§1.6); varsayilan `draft` |
| `result_note`        | `text NULL`            | ⚠️ **OPSIYONEL**; ust sinir `TARGET_CHUNK_CHARS`ten **TURETILIR** (§1.3)                     |
| `crm_company_id`     | `uuid NULL`            | ⚠️ Cross-modul isaretci — **FK YOK**, `null` **YAYGIN DURUMDUR** (§6)                        |
| `embedding`          | `vector(1536) NULL`    | ⚠️ Satirin kendi kolonu — chunk tablosu YOK (§1.3). **Onuncu vektor tablosu.**               |
| `created_by_user_id` | `uuid NOT NULL`        | Satir ici aktor damgasi (ADR-0041 §8) — ⚠️ bir **denetim izi degildir**                      |
| `created_at`         | `timestamptz NOT NULL` |                                                                                              |
| `updated_at`         | `timestamptz NOT NULL` | ⚠️ **VAR** — ve bu, §2'nin dogrudan sonucu (ADR-0045'in tam TERSI)                           |

Kisitlar: `campaigns_name_not_blank` · `campaigns_status_valid` ·
`campaigns_dates_ordered CHECK (ends_on IS NULL OR ends_on >= starts_on)` ·
`campaigns_result_note_not_blank` · `campaigns_updated_after_created`.

⚠️ **`updated_at` KOLONU BIR KARARDIR, BIR ALISKANLIK DEGIL.** ADR-0045 onu
**bilerek koymamisti** (_"guncellenmeyen bir satirin guncellenme zamani da
olmaz; kolonu koymak olmayan bir yolun VAR OLDUGUNU ima ederdi"_). Burada yol
**gercekten var** (§2), yani kolon da var. Iki modulun ayni kolonda ters karar
vermesi bir tutarsizlik degil, ⚠️ **ayni olcutun iki farkli cevabidir**.

⚠️ **TEKILLIK KISITI YOKTUR** — ADR-0045'in denetiminin ucuncu bulgusunun ayni
sekli: **ayni ad iki kez kullanilabilir** ("Instagram kampanyasi" her ay
tekrarlanabilir) ve ikisi de gercektir. Bir `UNIQUE(tenant_id, name)`, gercek
bir olguyu **reddederdi**. ⚠️ Dolayisiyla bu modulde de **409 diye bir cevap
yoktur**.

#### 1.3 ⚠️ CHUNK TABLOSU YOK — birlesik olcut, DORDUNCU kez

> **Birlesik kural** (ADR-0035 §3 + ADR-0037 §3 + ADR-0040 §1 + ADR-0045 §1.2):
> _chunk tablosu, metnin ust sinirini kullanici degil **verinin kendisi**
> belirliyorsa acilir._

Bir kampanya sonuc notunun ust sinirini **biz** belirliyoruz ve
`TARGET_CHUNK_CHARS`a **esitliyoruz** — `MAX_SERVICE_NOTE_CHARS`,
`MAX_INTERACTION_BODY_CHARS`, `MAX_FEEDBACK_COMMENT_CHARS` ile **birebir ayni
desen**. Parcalayici her zaman tek parca uretirdi; ikinci tablo yalnizca bir
**join maliyeti** olurdu.

⚠️ **YENI BIR SAYI ICAT EDILMEZ.** Sinir `TARGET_CHUNK_CHARS`ten **turetilir**;
ayri bir sabit yazilsaydi ve chunking bir gun degisseydi, karar **sessizce**
gecersizlesirdi.

Sinir asilirsa **422** doner — ⚠️ **sessiz kirpma yok** (ADR-0035 §3, altinci
kez): kirpsaydik kullanici yazdiginin yarisini kaybettigini **fark etmezdi**.

#### 1.4 `channel` serbest metindir — ADR-0045'in AYNI karari, ikinci kez

_"Hangi kanaldan"_ sorusunun cevabi tenant'a gore degisir (Instagram, e-posta,
Google Ads, fuar, kapida el ilani). Bir enum ilk musteride yanlis olurdu; bir
tenant-tanimli sozluk (`finance.categories` deseni) ise **bir kolonluk etiket
icin ikinci bir CRUD yuzeyi** demekti.

⚠️ **Bedeli AYNEN devralinir ve tekrar yazilir:** `"instagram"` ile
`"Instagram"` **iki ayri deger** olur (ADR-0039'un `kg`/`Kg` varyanti, **ucuncu
kez**) ve **kanala gore gruplama guvenilmezdir**. Kanal v1'de bir **etikettir**,
bir boyut degil — ve ekranda bir **oneri listesi de yoktur** (ADR-0045'in
kapanis denetiminin kaydettigi ayni eksik, ikinci kez).

#### 1.5 ⚠️ TARIHLER `date` — `timestamptz` DEGIL

Randevu `timestamptz` kullanir cunku bir randevu bir **andir**. Bir kampanyanin
**saati yoktur**: "1–15 Eylul" bir gun araligidir.

⚠️ **`timestamptz` secmek, olmayan bir bilgiyi UYDURMAK olurdu:** gun basi
hangi saat dilimine gore hesaplanacakti? ADR-0035'in yazili siniri
(_"tenant bazli saat dilimi YOK"_) o gun bu module **sizardi** ve
"kampanya 1 Eylul'de basladi" iddiasi kullanicinin bulundugu yere gore
**degisirdi**. `date` bu soruyu **sormaz**.

⚠️ **`ends_on` NULLABLE ve `null` GERCEK BIR DURUMDUR:** surekli yayindaki bir
Google Ads kampanyasinin bitisi yoktur. Zorunlu kilmak, kullaniciyi
**uydurma bir tarih** yazmaya iterdi — ADR-0033'un _"sahte Genel projesi"_
dersi, ⚠️ **dorduncu kez** (ADR-0043 `platform_user_id`, ADR-0045
`crm_contact_id`).

#### 1.6 ⚠️ `status` SABIT ENUM — `draft` / `active` / `done`

Randevu'nun (`scheduled`/`completed`/`cancelled`/`no_show`) ve Projeler'in ayni
karari. Gerekce, `channel`in **tam tersidir** ve ikisinin yan yana durmasi
kasitlidir:

| Alan      | Sekil         | Neden                                                                                                               |
| --------- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `channel` | Serbest metin | Degerler **tenant'a gore degisir**; bizim bilemeyecegimiz bir liste                                                 |
| `status`  | ⚠️ Sabit enum | ⚠️ Degerler **is mantigini surer** (hangi kampanya "aktif" sayilir); serbest birakmak kodu **sorgulanamaz** kilardi |

⚠️ **Enum UYGULAMADA VE VERITABANINDA BIRDEN yazilir** ve senkron kalmak
zorundadir (`appointments_status_valid` ile ayni karar): CHECK, uygulamayi
**atlayan** yollari da baglar.

⚠️ **`cancelled` YOKTUR ve bu bilincli:** iptal edilen bir kampanya
**yapilmamis** bir kampanyadir — kaydi silinir. Dorduncu bir durum, "bitti" ile
"hic olmadi"yi ayni listede tutar ve ⚠️ ileride bir sayim hesaplandiginda
**sessizce yanlis** olurdu. Silme yolu **acik** (§2), yani telafi hazir.

---

### 2. ⚠️ TAM DUZENLENEBILIR — HER DURUMDA, `done` DAHIL

Projede degistirilebilirligin dorduncu sekli degil, ⚠️ **birincisinin
tekrari**dir (`finance.transactions`) — ama bu kez **gerekcesiyle** secilerek.

| Modul                              |      Guncelleme       |     Silme     | Olcut                                       |
| ---------------------------------- | :-------------------: | :-----------: | ------------------------------------------- |
| `finance.transactions` (0034)      |          ✅           |      ✅       | Yanlis tutar duzeltilebilmeli               |
| `inventory.movements` (0039)       |          ❌           |      ❌       | ⚠️ Bugunku miktar ondan **TURETILIYOR**     |
| `suppliers.interactions` (0040)    |          ❌           |      ❌       | Bir gorusme olduktan sonra "degismis" olmaz |
| `invoicing.sales_documents` (0041) | ⚠️ `draft` sonrasi ❌ | ⚠️ `draft` ❌ | Belge **sirketten cikti** (snapshot)        |
| `feedback.responses` (0045)        |          ❌           |      ✅       | Ucuncu kisinin beyani + KVKK                |
| **`marketing.campaigns`**          |         ⚠️ ✅         |     ⚠️ ✅     | ⚠️ **Uc olcut de "hayir" diyor** (§2.1)     |

#### 2.1 ⚠️ Uc olcut sirayla uygulaniyor ve UCU DE "hayir" diyor

| #   | Olcut                                               | Kaynak        | Kampanya'da                                                                                                                        |
| --- | --------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Bugunku bir sayi bu kayitlardan TURETILIYOR mu?** | ADR-0039 §3   | ⚠️ **HAYIR.** ROI, donusum ve butce **kapsam disi** (§10). Turetilen tek sey ekrandaki sayimlardir ve onlar **gostergedir**.       |
| 2   | **Kayit SIRKETTEN CIKTI mi?**                       | ADR-0041 §2   | ⚠️ **HAYIR.** v1'de **gonderim mekanizmasi yoktur** (§10) — kayit, gonderilen seyin kendisi degil, onun hakkindaki **notumuzdur**. |
| 3   | **Kayit BASKA BIRININ SOZU mu?**                    | ADR-0045 §2.1 | ⚠️ **HAYIR.** Bir kampanya notu bastan sona **sirketin kendi is verisidir** — Geri Bildirim'in tam tersi.                          |

#### 2.2 ⚠️ VE ASIL GEREKCE: KILITLEMEK, DURUMU YALAN SOYLETIRDI

_"Bitmis kampanya degismez"_ sezgisel olarak makul gorunur. ⚠️ **Ama bir
kampanyanin SONUC NOTU, tanimi geregi kampanya BITTIKTEN SONRA yazilir.**

`done` durumu yazmayi kilitleseydi kullanicinin onunde iki yol kalirdi:

- kampanyayi **yapay olarak `active` tutmak** — ⚠️ yani **durumun yalan
  soylemesi**, ya da
- sonucu **hic yazmamak** — modulun var olma sebebinin kaybi.

⚠️ Bu, ADR-0033'un _"sahte Genel projesi"_ dersinin **en net sekli**: bir kisit,
kullaniciyi **yanlis veri girmeye** itiyorsa kisit yanlistir.

> ⚠️ **SONUC: `status` BIR ETIKETTIR, BIR KILIT DEGIL.** Kampanyanin nerede
> oldugunu **soyler**, ne yapilabilecegini **belirlemez**. Bu cumle koda da
> gecer: durum gecisleri icin bir **durum makinesi YOKTUR** — `draft`tan
> dogrudan `done`a gecmek gecerlidir (bitmis bir kampanyayi geriye donuk
> kaydetmek gercek bir ihtiyactir).

#### 2.3 Silme — ve `RESTRICT` diye bir sey YOK

Silme **acik** (`campaign:delete`, dar). Ⓐ Hicbir tablo `campaigns`a **isaret
etmiyor**, yani bir FK cascade sorusu **hic dogmuyor**; Ⓑ vektor **satirin
kendi kolonunda** yasiyor, yani ⚠️ **ikinci bir temizlik yolu GEREKMIYOR**
(ADR-0045'in kapanis denetiminin canli olarak kanitladigi ayni sey) — chunk
tablosu acilsaydi bu cascade **yazilmak zorunda kalirdi**.

⚠️ **Nesne deposu (R2) yuzeyi YOKTUR** — silinen bir kampanyanin arkasinda
temizlenecek ikinci bir varlik yok.

#### 2.4 ⚠️ `platform/audit` DEGERLENDIRILDI ve KULLANILMIYOR

⚠️ **Bu modul, `platform/audit` acildiktan SONRA yazilan ILK TAM
DUZENLENEBILIR modul**, yani soru **gercek**: _"bu kampanyanin sonucunu kim
degistirdi"_ sorulabilir olmali mi?

**Cevap: v1'de HAYIR** — ve olcut yaziliyor:

> ⚠️ **Denetim izi, degistirilmesi BIR BASKASINI ETKILEYEN alanlar icindir.**
> ADR-0043'un denetledigi alanlar bir insanin **haklarina** dokunur (unvan,
> yonetici, ucret). Bir kampanya notunu duzeltmek **hicbir kisinin** hakkini,
> hicbir mali kaydi ve hicbir turetilmis rakami degistirmez.

Ikinci gerekce **aracin kendi siniridir**: `platform.audit_log` **deger
saklamaz**, yalnizca **alan adi**. _"sonuc notu degisti"_ satiri, bu modulde
kimsenin uzerine islem yapamayacagi bir bilgidir — ⚠️ ve ROADMAP §8.5 o tabloyu
zaten _"listenin en hizli buyuyen kalemi"_ diye isaretliyor. Uzerine deger
tasimayan satirlar eklemek, **borcu buyutup fayda uretmemek** olurdu.

Pratik soru `created_by_user_id` + `updated_at` **satir ici damgasiyla**
cevaplaniyor (ADR-0041 §8 deseni) — ⚠️ ve bu bir **denetim izi degildir**:
son durumu soyler, "ne oldu"yu **sirasiyla anlatmaz**.

⚠️ **Bu, borcun kapandigi anlamina GELMEZ:** `platform/audit`in tek tuketicisi
hala **IK**tir; Finans/Stok/Tedarikci'nin _"bu tutari kim degistirdi"_ sorulari
**cevapsizdir**. ⚠️ Bir `campaign.budget` alani geldigi gun (§10) bu cevap
**yeniden sorulmalidir** — para, olcutun birinci maddesini degistirir.

---

### 3. ⚠️ TEK katkici — ANLAMSAL. Uc yapisal aday; BIRI liyakatli

#### 3.1 Anlamsal katkici: `campaign-notes`

| Alan               | Deger                                                            |
| ------------------ | ---------------------------------------------------------------- |
| `source`           | `campaign-notes`                                                 |
| `contributionKind` | `'semantic'`                                                     |
| `permission`       | `campaign:read`                                                  |
| Girdi              | `marketing.campaigns.embedding` — ⚠️ **satir basina tek vektor** |

Anlatisal icerik **vardir** ve ROADMAP'in kapsam notunun tarif ettigi sey tam
olarak budur: _"Anlatisal veri — CRM'in embedding desenini yeniden kullanir."_
**Onuncu anlamsal kaynak.**

⚠️ **VEKTOR YALNIZCA `result_note` VARSA URETILIR** — ADR-0045 §1.4'un ayni
karari, ve gerekcesi ADR-0034 §6.1'in **havuz kirlenmesi** kuralidir (**ucuncu
kez**): adi ve tarihi olan ama sonucu yazilmamis on kampanya,
_"Eylul kampanyasi / Ekim kampanyasi / Kasim kampanyasi"_ gibi **neredeyse
ozdes kisa vektorler** uretirdi — `Ocak kirasi / Subat kirasi`nin **birebir
ayni sekli**.

⚠️ **DURUST BEDELI (§3.6'da olculur):** sonucu yazilmamis bir kampanyanin
`POST /ask` havuzunda **hicbir sesi yoktur** — yani ⚠️ **SUREN bir kampanya
AI'a gorunmez**. Bu, Kalem A'nin en guclu karsi-argumanidir ve gizlenmiyor.

#### 3.2 ⚠️ ADR-0036 / ADR-0042 ESIK KONTROLU — dort soru (SABIT MADDE)

CLAUDE.md'nin kalici dersi geregi bu madde **atlanmaz** ve cevap "hayir" olsa
bile yazilir. ⚠️ **Bu, kontrolun ARACIN VARLIGINDA yapildigi ILK seferdir.**

| #   | Soru                                                                  | Cevap                                                                                                                                                               |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Bu modul **yapisal** bir katkici ekliyor mu?                          | ⚠️ **v1'de HAYIR** — ama _"bakildi ve yoktu"_ **degil**: uc aday bakildi, ⚠️ **ikisi reddedildi, biri LIYAKATLI cikti** (§3.3)                                      |
| 2   | Satir donduren yapisal kaynak sayisi kaca cikiyor?                    | ⚠️ **BILINMIYOR — ve artik OLCULEBILIR.** Kayitli **6 → 6** (v1). ⚠️ Tek olcum (ADR-0046) **bos bir tenant'ta** alindi ve `0` dedi; bu sayi T2 icin **gecersizdir** |
| 3   | ADR-0042 §3'un **T2** esigini (`2K/3` — `K=8` icin **6**) geciyor mu? | ⚠️ **v1'de HAYIR.** Eklenseydi kayitli **7** olurdu; ⚠️ ama **satir donduren** sayi hala **olculmedi** — ve liyakatli aday **kosullu sessizdir** (§3.4)             |
| 4   | Geciyorsa ne yapilir?                                                 | ⚠️ **Bu bir PLATFORM kararidir**; modul ADR'si tek basina veremez. Sira: **arac (✅) → olcum (❌) → ADR-0036/0042 revizyonu → katkici**                             |

#### 3.3 ⚠️ UC ADAY — dort test

**Aday 1: `campaign-performance`** _("hedefe ulasmayan kampanya")_ —
⚠️ **REDDEDILDI ve testlere HIC GIRMEDI.** v1'de **HEDEF diye bir alan
yoktur** (ROI, donusum, butce ve tiklama sayisi hepsi kapsam disi — §10).
Hesaplanacak bir sey olmadan bir "performans" katkicisi, olmayan bir veriden
**uydurma bir yargi** uretirdi. ⚠️ ADR-0040'in birinci adayinin (_"tedarikci
performansi"_) **birebir ayni gerekcesi**: siparis/teslimat yokken performans
bir **sayim** bile olamaz.

**Aday 2: `campaign-schedule`** _("yaklasan bitis / takvimde bitmis ama hala
aktif")_ — ⚠️ **REDDEDILDI**, ama testlerden dusup degil, **olculmus bir emsal**
yuzunden:

| #   | Olcut                            | Sonuc                                                                                                                                          |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Haber mi, sayim mi?              | ⚠️ **KISMEN.** Alarm bandi haberdir; ⚠️ **saglikli bant _"3 aktif kampanya"_ = SAYIM** ve IK'nin reddedilen _"12 aktif calisan"_ adayiyla ayni |
| 2   | Fiil mi, katalog mu?             | ✅ Gecer (tarihli olay)                                                                                                                        |
| 3   | Seyrek mi?                       | ⚠️ **Gecer** — ama saglikli bantta **her cagrida satir dondururdu**, yani T2 acisindan **kesin bir yedinci**                                   |
| 4   | Ayni haberi anlamsal tasiyor mu? | ✅ Gecer (tarihler hicbir notta yazmaz)                                                                                                        |

⚠️ **BELIRLEYICI OLAN OLCUM:** `appointment-schedule` **birebir ayni sekildir**
(tarih penceresine dayali yapisal ozet) ve ADR-0035'ten beri **dort denetimde**
havuza giremedi ya da _"yazili beklenen kaybeden"_ olarak kaydedildi. ⚠️ Ayni
sekli ikinci kez eklemek, **T2'yi tetikleyip karsiliginda buyuk ihtimalle
duyulmayacak** bir ses eklemek olurdu.

**Aday 3: `campaign-gap`** _("bitmis ama sonuc notu YAZILMAMIS kampanya")_ —
⚠️ **DORT TESTI DE GECIYOR. LIYAKATLI.**

| #   | Olcut                                   | Kaynak                          | Sonuc                                                                                                                                              |
| --- | --------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **HABER MI, SAYIM MI?**                 | ADR-0043                        | ✅ **GECIYOR — ve en guclu bicimde.** ⚠️ Bosluk yoksa **HIC KONUSMAZ** (§3.4). Bugune kadarki hicbir yapisal katkicinin yapmadigi sey              |
| 2   | **FIIL mi, KATALOG mu?**                | ADR-0040 §3                     | ✅ **GECIYOR.** _"Kampanya 15 Eylul'de bitti"_ tarihli bir olaydir; bosluk o olaydan **turetilir**                                                 |
| 3   | **SEYREK mi?**                          | ADR-0043 §5.2                   | ✅ **GECIYOR** — ⚠️ ama **ters yonden**: seyrek oldugu icin degil, **sifir donebildigi icin**                                                      |
| 4   | ⚠️ **AYNI HABERI ANLAMSAL TASIYOR MU?** | ⚠️ **ADR-0045 §3.2'nin OLCUTU** | ✅ **GECIYOR — ve MANTIKEN BASKA TURLU GECEMEZ.** ⚠️ Haber, metnin **YOKLUGUDUR**; sonuc notu olmayan bir kampanyanin **vektoru de yoktur** (§3.1) |

> ⚠️ **DORDUNCU OLCUT BURADA ADR-0045'IN TAM AYNASIDIR — ve bu simetri kayda
> deger.** Geri Bildirim'de yapisal ozet, anlamsal katkicinin **zayif bir
> ozeti** olurdu (musterinin kendi cumlesi zaten havuzdaydi). Burada tam tersi:
> yapisal katkici, anlamsal katkicinin ⚠️ **YAPISAL OLARAK ULASAMADIGI**
> kayitlardan bahseder. Ikisi ayni havuzda **hicbir zaman ayni seyi
> soyleyemez** — ortusme kumesi **BOSTUR**.

#### 3.4 ⚠️ YENI GOZLEM: "KOSULLU SESSIZ" BIR YAPISAL KAYNAK — ve T2

ADR-0046'nin `empty` / `returned` ayriminin **ilk mimari sonucu** burada
gorunuyor ve yaziya geciriliyor:

| Katkici                          | Saglikli tenant'ta           | T2'ye katkisi                 |
| -------------------------------- | ---------------------------- | ----------------------------- |
| `crm-pipeline`                   | _"3 saglikli firsat"_ (0,75) | ⚠️ **Her zaman** sayilir      |
| `feedback-satisfaction` (askida) | _"ortalama 4,2"_ (0,75)      | ⚠️ **Her zaman** sayilir      |
| ⚠️ **`campaign-gap`**            | ⚠️ **SIFIR SATIR**           | ⚠️ **Yalnizca bosluk VARKEN** |

⚠️ **T2 _"satir donduren"_ kaynaklari sayar, kayitli olanlari degil**
(ADR-0042 §3). Yani `campaign-gap` T2'yi **her tenant'ta degil**, yalnizca
kapatilmamis kampanyasi olan tenant'larda **kosullu olarak** tetikler.

> ⚠️ **BU BIR MUAFIYET DEGILDIR — VE OYLE OKUNMAMALIDIR.** T2'nin cumlesi
> _"gectiginde"_dir, _"her zaman gectiginde"_ degil. Kosullu sessizlik esigi
> **kaldirmaz**, yalnizca **ne siklikta atesledigini** degistirir. ⚠️ Bir
> katkiciyi "cogu zaman sessiz" diye esikten muaf tutmak, tam olarak
> ADR-0036'nin korktugu **sessiz asma** olurdu.
>
> ⚠️ Yine de kayda degerdir, cunku **tasarim yonu verir**: yeni yapisal
> katkicilar, saglikli durumda **konusmayacak** sekilde tasarlanirsa havuz daha
> az kalabalik olur. Bu gozlem ADR-0036/0042'nin revizyonuna (**0048 adayi**)
> bir **girdidir**; bu ADR onu **kullanmaz**.

#### 3.5 ⚠️ KARAR: v1'de EKLENMIYOR — REDDEDILMIYOR, KOSULLU ERTELENIYOR

`campaign-gap` liyakatlidir. Yine de v1'e konmuyor ve gerekce **tek cumleyle**:

> ⚠️ Arac artik **var** (ADR-0046), ama ⚠️ **olculecek VERI yok** — tek olcum
> bos bir tenant'ta alindi ve `0` dedi. **Bir esik, onu okuyacak SAYI
> uretilmeden gecilmez.**

**Ertelemenin yazili ON KOSULLARI — sirayla:**

| #   | On kosul                                                                                                                  | Durum                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | `retrieval.select` gozlemlenebilirlik satiri yazilir                                                                      | ✅ **TAMAM** (ADR-0046, 2026-08-25)                                    |
| 2   | ⚠️ **On bir modulde veri olan bir tenant'ta OLCUM yapilir** ve satir donduren yapisal kaynak sayisi **ilk kez** ogrenilir | ❌ **ACIK** — ⚠️ **bu modulun kapanis denetimi (madde 8–9) + Kalem B** |
| 3   | ⚠️ **ADR-0036/0042 yeniden acilir** — ayri bir platform ADR'si (**0048 adayi**)                                           | ❌ Acik                                                                |
| 4   | **Ancak ondan sonra** `campaign-gap` **ve** `feedback-satisfaction` yazilir                                               | ❌ Acik                                                                |

⚠️ **IKI ASKIDAKI ADAY ARTIK AYNI KAPIYA BAKIYOR.** ADR-0045'in
`feedback-satisfaction`i ve bu ADR'nin `campaign-gap`i ayni olcumu bekliyor —
yani 2. adim, **bir degil iki modul kararini** birden acar. ⚠️ Bu, Kalem B'nin
oncelik gerekcesidir.

⚠️ **Sira tersine cevrilemez** (ADR-0041 §4.3 · ADR-0045 §3.4).

#### 3.6 ⚠️ Bunun DURUST BEDELI

- ⚠️ **SUREN BIR KAMPANYA `/ask`TE GORUNMEZ.** Sonuc notu bittikten sonra
  yazilir; yani modulun `POST /ask`e katkisi **gecmise doniktur**.
  _"Su an hangi kampanyalarim var"_ sorusu **sorulamaz**.
- ⚠️ **Sonucu yazilmamis kampanyalarin HICBIR SESI YOKTUR** — ve bu, tam olarak
  `campaign-gap`'in bahsedecegi kumedir. Kume `/ask`te **gorunmez**, ekranda
  **gorunur** (§9).
- **Kampanya sayisi, kanal dagilimi ve takvim `/ask`ten SORULAMAZ.**
- ⚠️ Bu bedeller §3.5'in tetikleyicisi ateslenene kadar **acik kalir** ve
  kapanis denetiminde **olculur** (madde 10).

#### 3.7 ⚠️ `/ask` izin filtresi YINE tetiklenmiyor — ONUNCU kez

Tek katkicinin kapisi `campaign:read` ve **dort rol de** onu tasiyor (§5).
Filtrenin tek gercek tetikcisi hala **Finans**tir. ⚠️ **`company:read`siz
kullanici senaryosu** da degismiyor — bu modul o satira da dokunmuyor
(⚠️ `crm_company_id`nin ad cozumu `company:read`e baglidir ve dort rol de onu
tasir; yani kapi **yine kuruluyor, yine tetiklenmiyor**).

---

### 4. Vektor basligi — ve BAYATLAMA PENCERESI

Embed edilen satir, ADR-0035 §6.1'in sabit etiket desenidir:

```
[Kampanya · 2026-09-01 → 2026-09-15 · Instagram] Sonbahar indirimi — 40 form geldi, en cok pazar gunu donus aldik.
```

Bitisi olmayan kampanyada `→ suruyor` yazilir; kanal yoksa alan **hic yazilmaz**
(bos bir `·` ayraci, modele **anlamsiz bir isaret** verirdi).

#### 4.1 ⚠️ `status` VEKTORE GIRMEZ

Baslik, kampanyanin **NE OLDUGUNU** tasir; **NEREDE OLDUGUNU** degil.

Uc gerekce: Ⓐ durum, satirin **en sik degisen** alanidir ve her gecis bir
saglayici cagrisi ve bir bayatlama penceresi acardi; Ⓑ _"hangi kampanyalar
bitti"_ sorusu **yapisal bir filtredir** (ekranda, tek tikla), anlamsal bir
arama degil; Ⓒ ADR-0045 puani basliga **koymustu** ama ⚠️ o puan
**degistirilemezdi** — burada durum **degisir**, yani ayni karar **ayni sonucu
vermez**.

#### 4.2 ⚠️ GOMULEN BIR ALAN DEGISINCE VEKTOR AYNI ISTEKTE YENILENIR

⚠️ **Bayatlama penceresi burada YOK — ama ADR-0045'tekinden FARKLI bir
sebeple.** Orada baslik bilesenleri **degistirilemezdi**; burada
**degistirilebilir**, ama hepsi **satirin kendi kolonlarindadir**
(ADR-0039'un Stok'ta verdigi karar, ikinci kez) — yani `PATCH` vektoru **ayni
islemde** yenileyebilir. `suppliers.interactions`in tuzagi (ad **baska
tabloda**, 200 gorusme = 200 embedding cagrisi, oran sinirinin istegi
**ortasindan** kesmesi) burada **hic dogmuyor**.

**Kural, olculebilir ve test edilebilir bicimde:**

| `PATCH` neyi degistirdi                                    | Yeniden gomme | Oran siniri  |
| ---------------------------------------------------------- | :-----------: | :----------: |
| `name` · `channel` · `starts_on`/`ends_on` · `result_note` |  ⚠️ **EVET**  | ⚠️ **Sayar** |
| `status` · `crm_company_id`                                | ❌ **HAYIR**  |  ❌ Saymaz   |

⚠️ **Kosulsuz yeniden gomme REDDEDILDI:** durum gecisi (`draft→active→done`)
her kampanyada en az iki `PATCH` demektir ve ⚠️ hicbiri **metni degistirmez** —
para harcayan ama **hicbir sey degistirmeyen** cagrilar olurdu
(`marketing_embedding` adinin kendi gerekcesi: _"cagri para harciyorsa
sayilir"_).

> ### ⚠️ 4.2.1 BASARISIZ YENIDEN GOMME VEKTORU `NULL`'A CEKER — projede ILK
>
> Yeniden gomme cokerse (`EmbeddingFailedError`) **satir KAYDEDILIR** (yazilan
> metin kaybolmaz — ADR-0035'in _"kayit SILINMEZ"_ karari) ama
> ⚠️ **`embedding` kolonu `NULL`'A CEKILIR** ve cevap **502 +
> `DisclosableProblem`** doner.
>
> **Gerekce, hatanin sekli:**
>
> | Secim                        | Yanlis oldugunda                                                                                                                                                                              |
> | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | ⚠️ **Eski vektoru BIRAKMAK** | ⚠️ Satir **bayat ama DOLU** gorunur: `reindex`in `NULL` arayan sorgusu onu **bulamaz**, ekran "aranabilir" der, `/ask` **eski icerikle** cevap verir. Hata **SESSIZDIR** ve kimse fark etmez. |
> | **`NULL`'a cekmek**          | Kayit **aranamaz** olur — ama bu **GORUNUR**: `reindex` onu bulur, ekran ADR-0037'nin `chunkCount: 0` ("Aranamiyor") rozetiyle **soyler**.                                                    |
>
> ⚠️ **Ikinci bir kolon (`embedding_stale_at`) REDDEDILDI**: turetilebilir bir
> durumu kaliciya yazmak, projede **on ucuncu kez** reddedilen seydir — ve bir
> tazeleme yolu unutulunca hata yine **sessiz** olurdu.
>
> ⚠️ **Kisa bir ARAMA GERILEMESI penceresi ACIKCA KABUL EDILIYOR**: onarilana
> kadar o kampanya anlamsal aramada **yoktur**. Yanlis cevap vermektense
> **hic cevap vermemek** secildi.

⚠️ **Kisi/sirket adi BASLIGA KONULMAZ** — ADR-0045 §4'un iki gerekcesi aynen
gecerli (ad `crm.companies`ta yasar → bayatlar; ad okumak **izin kapili** bir
dizin ister ve `ContributeInput` **rol tasimaz**).

---

### 5. Izinler — ⚠️ `write` VAR, ve bu §2'nin izin adindaki GORUNUMU

ADR-0025'in `resource:action` modeli, **onikinci** kez.

| Permission        | owner | admin | member | viewer |
| ----------------- | :---: | :---: | :----: | :----: |
| `campaign:read`   |  ✅   |  ✅   |   ✅   |   ✅   |
| `campaign:write`  |  ✅   |  ✅   |   ✅   |   ❌   |
| `campaign:delete` |  ✅   |  ✅   |   ❌   |   ❌   |

⚠️ **`write`, `create` DEGIL — ve ADR-0045'in yanina konuldugunda ayrim
GORUNUR HALE GELIYOR:**

| Ad       | Anlami                  | Bu projedeki ornekler                                                           |
| -------- | ----------------------- | ------------------------------------------------------------------------------- |
| `create` | ⚠️ **yalnizca olustur** | `feedback:create` · `interaction:create` · `commentary:create` · `note:create`  |
| `write`  | olustur **VE guncelle** | `employee:write` · `supplier:write` · `stock_item:write` · **`campaign:write`** |

> ⚠️ **Iki modul, iki ad, tek karar.** ADR-0045 `create` sectigi icin bir
> `PATCH` ucu yazilsa bile guard **403** verirdi. Burada `write` seciliyor
> cunku guncelleme **gercekten var** (§2). ⚠️ Yani izin adi, degistirilebilirlik
> kararinin **ilk katmanidir** — bir uslup tercihi degil.

⚠️ **KATALOG GENIS** (ADR-0034 §7'nin olcutu, **onbirinci** kez): _"kampanya
PAYLASILAN bir is gercegidir."_ Satista calisan bir `member`, hangi kampanyanin
yayinda oldugunu bilmek **zorundadir** — dar bir katalog, modulu onu kullanmasi
gereken herkese kapatirdi. ⚠️ Finans'in dar kataloguyla ayni sinifta
**degildir**: kampanya kaydinda ucret, maliyet ya da kisisel veri **yoktur**
(§10 — butce kapsam disi).

⚠️ **`delete` DAR:** silme **geri alinamaz** ve bir kampanyanin gecmisini
tumuyle kaldirir; ADR-0045 ve ADR-0043'un ayni olcutu — _"gunluk is degil, bir
yonetim islemidir."_

⚠️ **AD CAKISMASI YOK ve bu ONCEDEN TARANDI:** `campaign`, `marketing`,
`channel` — ucuyle de cakisma yok. ADR-0045 §5 bunu **ismen ongormustu**;
ADR-0039'un `stock_item` nitelemesi burada **gerekmiyor**.

---

### 6. Cross-modul referans ve DAG — ⚠️ KANIT, IDDIA DEGIL

#### 6.1 TEK kenar, SIFIR yeni satir — DORDUNCU kez

`crm_company_id` icin gereken dizin (`CompanyDirectory.findNames(ids, role)`)
**zaten var**: Projeler yazdi ([ADR-0033](0033-projects-module.md) §2), Finans
ve Belge kullandi. ⚠️ **`crm.public.ts` tek satir degismez** —
[ADR-0037](0037-belge-sozlesme-yonetimi.md) §4.1'in kurali (_"yeni TALIP →
dosya degismez; yeni KAYNAK TURU → sahibi modul kendi dizinini yazar"_)
**dorduncu kez** talip tarafindan dogrulaniyor.

Uc parcali desen aynen: **FK yok** (Mutlak Kural 5) · ad **denormalize
edilmez**, her okumada cozulur · okuma **`company:read` iznine baglidir**
(kapi arayuzun **icinde**). Sarkan `crm_company_id` **tolere edilir** — projede
**besinci** sarkan isaretci.

⚠️ **Bu, cross-modul icin AYRI BIR SLICE gerektirmez** (ADR-0037'nin olculebilir
sonucu, ucuncu kez).

#### 6.2 ⚠️ HEDEF KITLE BIR SEGMENT DEGILDIR — ve CRM'de segment YOKTUR

Bir kampanyanin dogal alani _"kime"_dir ve dogal cevabi bir **KUMEdir**
("Istanbul'daki mevcut musteriler", "son 6 ayda alim yapmayanlar").

⚠️ **Bugun bu kume ISARET EDILEMEZ:** CRM'de `segment`, `tag` ya da `list`
diye bir kavram **yoktur** (kod tarandi). `crm.segments` acmak **CRM'in
isidir** — Mutlak Kural 1 ve ADR-0039'un dersi (_"kenari SAHIP modul yazar,
talip degil"_).

**Uc secenek degerlendirildi:**

| Secenek                                     | Karar                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crm.segments` acmak                        | ⚠️ **REDDEDILDI** — baska bir modulun semasina dokunmak; ayri bir ADR ve ayri bir modul isi                                                                                                                                                                                                                                                                                               |
| `target_audience text NULL` (serbest metin) | ⚠️ **REDDEDILDI** — ⚠️ ADR-0045'in **dorduncu olcutu bir KOLONA uygulaniyor**: ayni cumle zaten `result_note`ta yazilabilir ve orada **EMBED EDILIR**, yani **aranabilir**. Ayri bir kolon ise ne sorgulanabilir (serbest metin, `google`/`Google` sorunu) ne aranabilir (embed edilmez) olurdu — ⚠️ **hicbir sey kazandirmayan bir alan**, ustelik `channel`in bedelini ikinci kez oder. |
| ⚠️ **`crm_company_id uuid NULL`**           | ✅ **KABUL** — ama ⚠️ **HEDEF KITLE DEGIL** (asagida)                                                                                                                                                                                                                                                                                                                                     |

⚠️ **`crm_company_id`NIN ANLAMI DAR VE YAZILI:** _"bu kampanya TEK bir hesaba
ozeldi"_ (ortak etkinlik, bayiye ozel kampanya, tek musteri icin hazirlanmis
teklif kampanyasi). ⚠️ **Bir hedef kitle degildir ve arayuzde de oyle
adlandirilmaz** — bir kolonun adiyla anlaminin ayrismasi, semada **sessiz bir
yalandir**.

⚠️ **`null` YAYGIN DURUMDUR** — kampanyalarin cogu bir hesaba degil, bir
**kitleye** gider. Zorunlu olsaydi kullanici **sahte CRM sirketleri** acardi ve
⚠️ bedeli bu modulde kalmazdi: **CRM'in musteri listesi kirlenirdi**
(ADR-0045 §6.2'nin birebir ayni dersi).

#### 6.3 DAG kaniti

Bugunku **is-modulu** kenarlari (kaynak: `*.public.ts` import'lari):

| #   | Kenar             | #   | Kenar                 |
| --- | ----------------- | --- | --------------------- |
| 1   | Projeler → CRM    | 6   | Belge → Projeler      |
| 2   | Finans → CRM      | 7   | Teklif/Fatura → CRM   |
| 3   | Finans → Projeler | 8   | Geri Bildirim → CRM   |
| 4   | Randevu → CRM     | 9   | ⚠️ **Kampanya → CRM** |
| 5   | Belge → CRM       |     |                       |

**Kenar sayisi SEKIZDEN DOKUZA cikar.** Dongusuzluk **iddia edilmiyor,
gosteriliyor**:

- **CRM bir KOK DUGUMDUR** — `crm/` altinda baska hicbir is modulunun
  `public.ts`ine import **yoktur** (yalnizca `platform/authz` ve
  `platform/context`; ikisi de platform).
- **Kampanya bir YAPRAKTIR** — ⚠️ `marketing.public.ts` **ACILMAZ**
  (ADR-0035'in kurali: _talip yokken dizin yazilmaz_). Modulden **cikan tek
  kenar** CRM'edir; **giren kenar yoktur**.
- Bir yaprak dugumden bir kok dugume cikan tek yonlu kenar **dongu kuramaz**.

Katmanlar: **0** — CRM · Stok · Tedarikci · IK (kokler); **1** — Projeler;
**2** — Finans · Randevu · Belge · Teklif/Fatura · Geri Bildirim · **Kampanya**.

#### 6.4 ⚠️ GERI BILDIRIM'E (10. MODUL) KENAR — ADR-0045'IN BIRAKTIGI SORU

[ADR-0045](0045-musteri-geri-bildirim-modulu.md) §10 bu soruyu **ismen bu
belgeye** birakti:

> _"Kampanyaya (11. modul) otomatik baglanti — hedef sema mevcut degil. Kenari
> SAHIP modul yazar: kampanya geldiginde `feedback.public.ts` degil,
> **Kampanya'nin kendi ADR'si** karar verir."_

⚠️ **CEVAP: v1'de KENAR YOK.** Uc gerekce:

1. ⚠️ **YON BELIRSIZ.** _"Bu geri bildirim hangi kampanyadan geldi"_ **Geri
   Bildirim'in** sorusudur (`responses.campaign_id`); _"kampanyam ne kadar
   memnuniyet uretti"_ **Kampanya'nin** sorusudur. ⚠️ **Ikisi ayni anda
   yazilirsa DONGU olur** — Tenant ↔ Identity tuzagi, cozumu `forwardRef`
   degil **ucuncu bir modul**du.
2. ⚠️ **`feedback.public.ts` YOKTUR ve acilmamasi BIR KARARDI.** ADR-0045 §6.3
   onu bilerek kapali tuttu, cunku ⚠️ **DAG kanitini MEKANIK kilan sey oydu**
   (_"Geri Bildirim bir YAPRAKTIR"_). Acmak, o kaniti bir **iddiaya** cevirirdi.
3. **Fiil yok.** v1'de kampanya bir **gonderim** yapmaz (§10), yani bir geri
   bildirimin bir kampanyadan **geldigini** soyleyecek mekanik bir bag da
   yoktur — baglanti kullanicinin **beyani** olurdu.

⚠️ **Istenirse SIRA yazilidir:** (1) once `campaign_id`nin **hangi modulun
alani** oldugu karara baglanir, (2) sahip modul kendi `public.ts`ini yazar,
(3) ⚠️ **DAG yeniden kanitlanir**. Bu **ayri bir ADR**dir.

---

### 7. Exception filter — uc AI hata tipi; ⚠️ IKISI TETIKLENEBILIR

CLAUDE.md'nin kalici standardi, **onikinci** kez:
`MarketingDomainExceptionFilter`in `@Catch(...)` listesi —
`MarketingDomainError` + `EmbeddingFailedError` + `RateLimitExceededError` +
`CompletionFailedError`.

| Tip                      | Tetiklenebilir mi | Davranis                                                                                                     |
| ------------------------ | :---------------: | ------------------------------------------------------------------------------------------------------------ |
| `EmbeddingFailedError`   |    ⚠️ **EVET**    | **502 + `DisclosableProblem`** — ⚠️ kayit **SILINMEZ**; `PATCH` yolunda vektor **`NULL`'a cekilir** (§4.2.1) |
| `RateLimitExceededError` |    ⚠️ **EVET**    | **429** — ⚠️ isaret **TASIMAZ** (maske yalnizca 5xx'e uygulanir)                                             |
| `CompletionFailedError`  |       HAYIR       | Olu kod; modulde `LLMPort` cagrisi yok. Bedeller **simetrik degil** — yine de yazilir                        |

⚠️ **Sonuc notu OLMAYAN kampanya embedding uretmez**, yani `POST /campaigns`
notsuz gonderildiginde saglayici cokse bile **201** doner (Randevu · Stok · Geri
Bildirim'in ayni davranisi, **dorduncu kez**) — ve kapanis denetiminde **oyle
sinanir**.

⚠️ **Eslenmemis domain kodunun 500'u MASKELI KALIR** ve bir test onu kilitler.
⚠️ **`StorageFailedError` / `PdfPort` hatalari YAZILMAZ** — kapsam **AI hata
tipleridir, hepsi degil**.

---

### 8. Oran siniri ve `reindex`

- **Oran siniri:** `platform.rate_limits`, eylem adi **`marketing_embedding`**
  (`feedback_embedding` / `suppliers_embedding` deseni). ⚠️ Sayac **kayit degil
  EMBEDDING** sayar.

| Yol                                                        | Sayar mi |
| ---------------------------------------------------------- | :------: |
| Sonuc notlu `POST /campaigns`                              |    ✅    |
| ⚠️ Sonuc notsuz `POST /campaigns`                          |    ❌    |
| ⚠️ Gomulen bir alani degistiren `PATCH` (§4.2)             |    ✅    |
| ⚠️ Yalnizca `status` / `crm_company_id` degistiren `PATCH` |    ❌    |
| `DELETE` · okuma                                           |    ❌    |

⚠️ **`PATCH`in sayaci tuketmesi, Geri Bildirim'den AYRILDIGIMIZ NOKTADIR** —
orada guncelleme **yoktu**. Sayilmasaydi, kotasi dolmus bir tenant sinirsiz
yeniden gomme yaptirabilirdi: ⚠️ **sinirin arkasindan dolasan bir yol.**

- **`POST /campaigns/reindex`:** ilk gunden. Isi **iki katlidir** ve
  ADR-0045'ten farkli: Ⓐ ilk gomme sirasinda basarisiz olan kayitlar,
  Ⓑ ⚠️ **`PATCH` sirasinda `NULL`'a cekilenler** (§4.2.1). Cevap
  `{ reindexed, failed }` doner (ADR-0035 deseni).

---

### 9. Frontend: ODA — koridorda ONIKINCI kapi

[ADR-0038](0038-oda-tasarim-sistemi.md)'in ODA sistemi, **onbirinci** kez
tuketici.

**Renk:** `#7665a6` (koyu `#ae9de2`) — ⚠️ **`module-colors.css`te ZATEN
`marketing` adiyla ayrilmis** (§1.1). Bir tercih degil, ROADMAP §3.5 sirasina
gore olculmus paletin ilgili blogu.

> ⚠️ **MOR BAND — VE BUGUN IKI KAPI, YARIN UC.** `hr` (#896096) ·
> **`marketing` (#7665a6)** · `loyalty` (#9a5a84, 12. modulle gelecek).
> Yesil bandin **dortlusunden** kucuk, ama kural **aynen baglayicidir**:
> ⚠️ **renk hicbir yerde TEK ayirt edici olmaz.** Kapilar farkli ikon, farkli
> etiket ("Ekip" / **"Kampanyalar"**) ve `aria-current` tasir. Kapanis
> denetiminde **ikon/etiket ayrimi acikca kontrol edilir**.

**Oda:** tek dikey kaydirmada duvar + tezgah.

| Bolge      | Ne                                                                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Duvar**  | Kahraman rakam: **bugun aktif kampanya sayisi**. Uydular: son 30 gunde biten · ⚠️ **sonucu yazilmamis** (§9.1) · ⚠️ **aranamayan kayit sayisi** (sonuc notu yok / vektor yok, §9.2) |
| **Tezgah** | Liste: ad · durum · tarih araligi · kanal · sirket (cozulebiliyorsa) · sonuc notu ozeti. Filtre: **durum** (taslak / aktif / bitti)                                                 |

⚠️ **KAHRAMAN RAKAM BIR SAYIDIR, BIR ORTALAMA DEGIL** — ADR-0034'un para birimi
ve ADR-0039'un birim kurali burada **tetiklenmez** (toplanacak bir buyukluk
yok), ADR-0045'in _"N olmadan ortalama gosterilmez"_ kurali da **gecerli
degildir**. ⚠️ `N = 0` iken rakam yerine **bos durum** gosterilir
(_"Henuz kampanya yok"_) — `0` yazmak dogru olurdu ama bos bir odada bir sifir,
bir **haber gibi** okunur.

#### 9.1 ⚠️ DUVARDAKI "SONUCU YAZILMAMIS" SAYISI BIR KATKICI DEGILDIR

⚠️ **Bu ayrim ONCEDEN yaziya geciriliyor** — ADR-0045'in kapanis denetimi ayni
seyi **sonradan** kesfetmek zorunda kalmisti (_"`GET /feedback/summary` BIR
KATKICI DEGILDIR"_).

Ekrandaki uydu, `campaign-gap` adayinin (§3.3) sayacagi **ayni kumeyi** sayar.
Ama:

|                         | Ekran uydusu           | `campaign-gap` (askida) |
| ----------------------- | ---------------------- | ----------------------- |
| Nereye gider            | ⚠️ **Yalnizca EKRANA** | `POST /ask` havuzuna    |
| Taban yuvasi tuketir mi | ❌                     | ✅                      |
| T2'yi etkiler mi        | ❌                     | ⚠️ ✅                   |

> ⚠️ **Kaydedilmeseydi ileride birisi _"zaten ozet var"_ diye yapisal katkiciyi
> BEDAVA sanabilirdi.** Ayni sayilari uretmek, ayni maliyeti tasimak demek
> degildir.

#### 9.2 ⚠️ Uydulardan biri MODULUN KENDI SINIRINI GORUNUR KILAR

"Aranamayan kayit sayisi" (sonuc notu olmayan **ve** §4.2.1'de vektoru `NULL`'a
cekilen kampanyalar), §3.6'nin bedelinin ekrandaki karsiligidir — Belge'nin
`chunkCount: 0` ("Aranamiyor") rozetiyle ve Geri Bildirim'in "yorumsuz kayit"
uydusuyla **ayni desen, ucuncu kez**. ⚠️ Onarim (`reindex`) **acikca
onerilir**.

⚠️ **AI'IN SESI BU MODULDE GORUNMEZ ve bu dogrudur** — modul ici AI yuzeyi yok.
Renk sinavi bu yuzden **"kabuk boyanmiyor mu"** olarak yapilir:
`/app/marketing` altindaki her sey mor, ⚠️ **kabuk ve `--ai-accent` terracotta**
kalmali; `app-shell.tsx`e **dokuzuncu kez dokunulmaz**.

**Koridorda onikinci kapi** — dogrudan **CANLI**; `SOON` dizisi bos kalmaya
devam eder ve bolumun kosullu render'i (`SOON.length === 0`) hala gecerlidir.

---

### 10. Kapsam disi (bugun yapilmiyor)

| Kalem                                                | Neden bugun yok                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚠️ **Otomatik e-posta / SMS GONDERIMI**              | ⚠️ Bir **zamanlama ve teslimat** sorusudur (Queue karari + sablon + abonelikten cikma + teslimat raporu), bir veri modeli sorusu degil. Randevu'nun **hatirlatma** ve Anket'in **gonderim** ertelemesiyle **ayni sinif** ve **ayni engele** baglidir.                                                       |
| ⚠️ **ROI / donusum / hedef hesaplama**               | ⚠️ Girdi **yok**: donusumu olcmek icin kampanya ile bir **satis olayi** arasinda mekanik bir bag gerekir (UTM, link token'i, kupon kodu) ve ucu de ayri birer karardir. ⚠️ Uydurma bir "basari" rakami, yapisal katkiciyi da **yalanci** yapardi (§3.3 Aday 1).                                             |
| ⚠️ **Butce / maliyet alani**                         | ⚠️ Para bu projede **Finans'ta yasar** (`finance.transactions` = gerceklesmis nakit hareketi). Buraya bir `budget` kolonu koymak **ikinci bir para yuzeyi** acar (para birimi sorusu — ADR-0034'un kurali) ve derhal ROI'yi davet eder. ⚠️ Geldigi gun §2.4'un `platform/audit` karari **yeniden sorulur**. |
| **A/B test**                                         | Bir **deney tasarimidir** (varyant, dagitim, istatistiksel anlamlilik); v1'de kampanya bir **kayittir**, bir deney degil                                                                                                                                                                                    |
| ⚠️ **Geri Bildirim'e (10. modul) otomatik baglanti** | §6.4 — ⚠️ **yon belirsiz** (dongu riski) ve `feedback.public.ts`in **kapali olmasi bir karardi**. Ayri bir ADR                                                                                                                                                                                              |
| ⚠️ **Hedef kitle / segment varligi**                 | §6.2 — `crm.segments` **CRM'in isidir**; talip yazmaz, **sahip** yazar                                                                                                                                                                                                                                      |
| **Kampanya sablonlari / tekrarlayan kampanya**       | Bir **is akisidir**; v1'de kampanya kopyalanmaz, yeniden yazilir                                                                                                                                                                                                                                            |
| **UTM / link takibi**                                | Bir **olcum altyapisidir** (kisa link, tiklama sayaci, bot filtresi) — ROI ile ayni engele bagli                                                                                                                                                                                                            |
| **Yapisal katkici** (`campaign-gap`)                 | ⚠️ §3.5 — **reddedilmedi, KOSULLU ERTELENDI**; dort on kosul yazili                                                                                                                                                                                                                                         |
| **Alan bazli izin / kampanya bazli gizlilik**        | ABAC, backlog (ROADMAP §1.1)                                                                                                                                                                                                                                                                                |
| **Klasik metin aramasi (FTS)**                       | ADR-0011, **onbirinci** kez acik                                                                                                                                                                                                                                                                            |

---

## Gerekce

**Neden bu modul, ROADMAP'in dedigi gibi "CRM'in embedding deseninin tekrari"
ama ADR'si kisa DEGIL.** Sema gercekten ucuz: tek tablo, tek katkici, hazir
dizin, hazir RLS sablonu, hazir izin modeli. ⚠️ Pahali olan tek sey, bu modulun
**esik kontrolunu ARACIN VARLIGINDA yapan ilk modul** olmasidir — ve o kontrol,
"bakildi ve yoktu" ile bitmedi: **liyakatli bir aday** cikti.

**Neden aday yine eklenmiyor.** ADR-0045'te engel _"olcecek arac yok"_ idi ve
ADR-0046 onu kaldirdi. Bugun engel **bir adim ilerledi**: arac var, **olculecek
veri yok**. ⚠️ Bu ayrimi kaydetmemek, ilerlemeyi gorunmez kilar ve ayni
ertelemeyi **ayni gerekceyle** ucuncu kez yazma riski dogurur. ⚠️ Ilerleme
gercektir: engel artik bir **muhendislik** eksigi degil, bir **denetim ortami**
eksigidir ve cozumu somuttur (Kalem B).

**Neden `campaign-gap` adayi, `campaign-schedule`den daha iyi.** Ikisi de dort
testin cogunu geciyor; farki **olculmus bir emsal** belirledi.
`appointment-schedule` birebir ayni sekildir ve **dort denetimde** havuza
giremedi. ⚠️ Ayni sekli ikinci kez eklemek, bir esigi tetikleyip karsiliginda
duyulmayacak bir ses eklemek olurdu. `campaign-gap` ise anlamsal katkicinin
**yapisal olarak ulasamadigi** kayitlardan bahseder — ortusme kumesi **bostur**.

**Neden kampanya tam duzenlenebilir.** Uc olcut de "hayir" dedi (§2.1), ama
karari veren sey dorduncusuydu: `done`da kilitlemek, kullaniciyi ya **durumu
yalan soyletmeye** ya **sonucu hic yazmamaya** iterdi. ⚠️ Bir kisit, kullaniciyi
yanlis veri girmeye itiyorsa kisit yanlistir — ADR-0033'un _"sahte Genel
projesi"_ dersinin en net sekli.

**Neden basarisiz yeniden gomme vektoru siliyor.** Bayat bir vektor **dolu
gorunur**: `reindex`in sorgusu onu bulamaz, ekran "aranabilir" der ve `/ask`
**eski icerikle** cevap verir — hata **sessizdir**. `NULL` ise **gorunur**:
onarim yolu onu bulur, ekran soyler. ⚠️ Projede defalarca verilen ayni tercih:
gurultulu bir yanlislik, sessiz bir yanlisliktan iyidir.

---

## Sonuclari

**Olumlu**

- Onikinci sema **tek tablo** ile aciliyor; chunk tablosu, yapisal katkici,
  `public.ts` ve cross-modul slice'i **gerekmiyor** — soyutlamanin onbirinci
  sinavi.
- ⚠️ **Esik kontrolu ILK KEZ kor degil**: arac var, sorulan sorunun cevabinin
  **nereden gelecegi** yazili.
- ⚠️ **Iki askidaki yapisal aday ayni kapiya bakiyor** (`feedback-satisfaction`
  - `campaign-gap`), yani bir sonraki olcum **iki modul kararini** birden acar.
- ⚠️ **Vektor tasiyan onuncu tablo**, retention listesine **girmeden** aciliyor
  (asagida) — iki listenin ilk kez ayristigi yer.
- ADR-0043 Slice 1c'nin kolon bazli grant tuzagi **hic dogmuyor**: satir
  **tamamen** guncellenebilir oldugu icin `REVOKE UPDATE` / `GRANT UPDATE
(embedding)` deseni **gerekmez**.
- ⚠️ Cross-modul referans **dorduncu kez** talip tarafindan, **sifir satir**
  degisiklikle dogrulaniyor.

**Olumsuz / bedeli**

- ⚠️ **SUREN BIR KAMPANYA `/ask`TE GORUNMEZ** (§3.6) — modulun en buyuk
  islevsel bedeli ve Kalem A'nin en guclu karsi-argumani.
- ⚠️ **Sonucu yazilmamis kampanyalar `/ask`te SESSIZDIR** — ve tam olarak bu
  kume, askiya alinan katkicinin bahsedecegi kumedir.
- ⚠️ **"Kampanyam ise yaradi mi" SORULAMAZ** — ne ekranda ne `/ask`te; ROI
  kapsam disi ve girdisi yok. ⚠️ **Kullanicinin en cok soracagi sey budur.**
- ⚠️ **Gonderim yok** — modul kampanyayi **kaydeder**, **yapmaz**. Ikinci en cok
  sorulacak eksik.
- ⚠️ **Kanala gore gruplama guvenilmez** (`instagram`/`Instagram`) — serbest
  metnin bedeli, ucuncu kez.
- ⚠️ **Basarisiz yeniden gomme kisa bir ARAMA GERILEMESI penceresi acar**
  (§4.2.1) — bilincli ve gorunur.
- **Fan-out ONBESTEN ONALTIYA** cikar (anlamsal **9 → 10**; yapisal **6'da
  kalir**). ⚠️ **Anlamsal tarafta on kaynak bes serbest yuva icin yarisir** ve
  ADR-0042'nin son tetikleyicisi (_"anlamsal tarafta sifir alan kaynak sayisi
  besi gectiginde"_) **bir adim daha yaklasir**.
- ⚠️ **RETENTION YIRMI UCTE KALIR** ve bu bir atlama **degil**, ROADMAP §8.5'in
  kendi olcutunun sonucudur: _"borcu doguran sey satirin ZAMANLA
  COGALMASIDIR."_ Bir tenant yilda birkac kampanya girer — `crm.companies` ve
  `crm.contacts` listede olmadigi gibi `marketing.campaigns` de **girmez**.
  ⚠️ Bu tam olarak ADR-0040'in kapanis denetiminin **duzeltmek zorunda kaldigi
  hatadir** (retention "yirmi" yazilmisti, dogrusu "onsekiz"); burada **once**
  uygulaniyor. ⚠️ **Vektor tasiyan tablo sayisi DOKUZDAN ONA cikar** — ikisi
  ayni sey **degildir**.

---

## Degerlendirilen alternatifler

| Alternatif                                                   | Neden secilmedi                                                                                                                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ⚠️ **`campaign-gap`i v1'de eklemek**                         | ⚠️ T2'yi **kosullu** tetikler ve T2'nin girdisi **hala olculmedi** (§3.5). Arac var, **veri yok**. **Reddedilmedi — kosullu ertelendi.**                                                                           |
| **`campaign-schedule` eklemek**                              | §3.3 Aday 2 — `appointment-schedule` **birebir ayni sekildir** ve dort denetimde havuza giremedi; saglikli bandi bir **sayimdir**.                                                                                 |
| **`campaign-performance` eklemek**                           | §3.3 Aday 1 — **hedef diye bir alan yok**; olmayan veriden **uydurma bir yargi** uretirdi (ADR-0040'in birinci adayinin ayni gerekcesi).                                                                           |
| ⚠️ **Kampanyayi `done`da KILITLEMEK** (Teklif/Fatura deseni) | ⚠️ §2.2 — sonuc notu **bittikten sonra** yazilir; kilit, kullaniciyi durumu **yalan soyletmeye** iterdi. Ayrica belge **sirketten cikmiyor** (§2.1 olcut 2).                                                       |
| **Kaydi degistirilemez yapmak** (Stok/Tedarikci deseni)      | §2.1 — bugunku hicbir sayi bu kayitlardan **turetilmiyor** ve kayit **baskasinin sozu degil**; ucu de "hayir" dedi.                                                                                                |
| ⚠️ **`target_audience` serbest metin kolonu**                | ⚠️ §6.2 — ADR-0045'in **dorduncu olcutu bir KOLONA uygulandi**: ayni cumle `result_note`ta **embed edilir ve aranabilir**; ayri kolon ne sorgulanabilir ne aranabilir olurdu.                                      |
| **`crm.segments` acmak**                                     | §6.2 — **CRM'in isidir** (Mutlak Kural 1); kenari **sahip modul** yazar.                                                                                                                                           |
| **`crm_company_id`yi ZORUNLU yapmak**                        | ⚠️ §6.2 — kullanici **sahte CRM sirketleri** acardi ve ⚠️ bedeli **CRM'in musteri listesinde** kalirdi. ADR-0045 §6.2'nin birebir ayni dersi.                                                                      |
| ⚠️ **`status`u vektore koymak**                              | §4.1 — en sik degisen alan; her gecis bir saglayici cagrisi ve bir bayatlama penceresi acardi. Durum sorusu **yapisal bir filtredir**.                                                                             |
| ⚠️ **`PATCH`te KOSULSUZ yeniden gomme**                      | §4.2 — durum gecisleri metni degistirmez; **para harcayan ama hicbir sey degistirmeyen** cagrilar olurdu.                                                                                                          |
| ⚠️ **Bayat vektoru OLDUGU GIBI birakmak**                    | §4.2.1 — satir **dolu gorunur**, `reindex` bulamaz, `/ask` **eski icerikle** cevap verir. Hata **sessizdir**.                                                                                                      |
| **`embedding_stale_at` kolonu eklemek**                      | §4.2.1 — turetilebilir durumu kaliciya yazmak; **on ucuncu kez** reddedildi.                                                                                                                                       |
| **Sonuc notu OLMAYAN kampanyalari da embed etmek**           | ⚠️ §3.1 — _"Eylul kampanyasi / Ekim kampanyasi"_ neredeyse **ozdes kisa vektorler** uretirdi: ADR-0034 §6.1'in `Ocak kirasi / Subat kirasi` kirlenmesi, **ucuncu kez**.                                            |
| **Chunk tablosu acmak**                                      | §1.3 — ust siniri **biz** belirliyoruz; parcalayici her zaman tek parca uretirdi.                                                                                                                                  |
| **`status`u serbest metin yapmak**                           | §1.6 — durum **is mantigini surer**; serbest birakmak kodu **sorgulanamaz** kilardi.                                                                                                                               |
| **`cancelled` durumu eklemek**                               | §1.6 — iptal edilen kampanya **yapilmamis** kampanyadir; dorduncu durum "bitti" ile "hic olmadi"yi ayni listede tutar. Silme yolu **acik**.                                                                        |
| **Tarihleri `timestamptz` yapmak**                           | §1.5 — kampanyanin **saati yoktur**; ADR-0035'in "tenant bazli saat dilimi yok" siniri buraya **sizardi**.                                                                                                         |
| **`UNIQUE(tenant_id, name)`**                                | §1.2 — ayni ad her ay tekrarlanabilir; tekillik **gercek bir olguyu reddederdi** (ADR-0045'in denetim bulgusu).                                                                                                    |
| ⚠️ **`platform/audit`i bu modulde kullanmak**                | §2.4 — denetim izi **bir baskasini etkileyen** alanlar icindir; ayrica `audit_log` **deger saklamaz** ve _"sonuc notu degisti"_ uzerine islem yapilamaz bir bilgidir. ⚠️ `budget` geldigi gun **yeniden sorulur**. |
| **`marketing.public.ts` acmak**                              | ⚠️ §6.3 — **talip yokken dizin yazilmaz**; acilmamasi DAG kanitini **mekanik** kiliyor.                                                                                                                            |
| **Geri Bildirim'e kenar cekmek**                             | §6.4 — ⚠️ **yon belirsiz** (dongu riski) ve `feedback.public.ts`in kapali olmasi **bir karardi**. Ayri bir ADR.                                                                                                    |
| **Modul anahtarini `campaign` yapmak**                       | §1.1 — palet **`marketing`** adiyla ayrilmis; anahtar ile rota ayrisirsa `data-module` **sessizce** tutmaz (ADR-0035'in `booking` dersi).                                                                          |

---

## Bilinen sinirlar

- ⚠️ **YAPISAL KATKICI YOK** — modul `POST /ask` havuzunda yalnizca **anlamsal**
  yarisir ve ADR-0036'nin taban garantisinden **yararlanmaz**. ⚠️ Geri
  Bildirim'in ayni durumu, **ikinci kez askida**.
- ⚠️ **SUREN bir kampanya ve sonucu yazilmamis kampanya `/ask`te SESSIZDIR**
  (§3.6).
- ⚠️ **"Kampanyam ise yaradi mi" sorulamaz** — ROI, donusum, tiklama ve butce
  **hicbiri yok** (§10). **En cok istenecek eksik budur.**
- ⚠️ **Gonderim yok** — modul kampanyayi **kaydeder**, gondermez; hatirlatma da
  yok (Queue karari; Randevu ve Anket'le **ayni engel**).
- ⚠️ **Hedef kitle YAPISAL DEGILDIR** — `crm_company_id` bir **hesap
  isaretcisidir**, bir kitle degil (§6.2). _"Kime gonderdik"_ sorusu ancak
  sonuc notunda yaziyorsa **anlamsal aramayla** bulunur.
- ⚠️ **Kanala gore gruplama guvenilmez** (`instagram`/`Instagram`) ve
  ⚠️ **oneri listesi de yoktur** (ADR-0045'in ayni eksigi, ikinci kez).
- ⚠️ **Sarkan `crm_company_id` temizlenmez** — **besinci** sarkan isaretci; CRM
  hala domain event yayinlamiyor, karar acikca **ertelenmis** durumda.
- ⚠️ **Sirket adi vektorde YOK** (§4.2) — _"Acme icin ne yapmistik"_ sorusu
  anlamsal aramayla **bulunmaz**; ad yalnizca **okuma aninda** cozulur.
- ⚠️ **Basarisiz yeniden gomme bir ARAMA GERILEMESI penceresi acar** — kayit
  onarilana kadar anlamsal aramada **yoktur** (gorunur ve onarilabilir).
- ⚠️ **Kim degistirdi sorulamaz** — `platform/audit` bu modulde **bilerek
  kullanilmiyor** (§2.4); tek tuketici hala **IK**tir.
- ⚠️ **Kampanya silinince gecmisi TUMUYLE gider** — arsiv/yumusak silme yok;
  telafi, `done` durumunun bir **kilit degil etiket** olmasidir (§2.2).
- ⚠️ **Durum gecis kurali YOKTUR** — `draft`tan dogrudan `done`a gecilebilir
  (gecmise donuk kayit gercek bir ihtiyactir) ve ⚠️ geri de donulebilir.
- ⚠️ **Tarih araligi CAKISMASI ENGELLENMEZ** — ayni gunlerde iki kampanya
  yazilabilir (Randevu'nun ve IK izninin ayni siniri, **ucuncu kez**).
- **Iyimser eszamanlilik yok** — ⚠️ ve burada **gercekten gecerlidir**: satirin
  **her alani** guncellenebilir, yani son yazan kazanir.
- **`embedding`de model/surum bilgisi yok** · **arama yalnizca anlamsal**
  (ADR-0011, **onbirinci** kez).
- ⚠️ **`marketing.campaigns` RETENTION LISTESINE GIRMEZ** — gerekce
  § Sonuclari'nda; ⚠️ ama **vektor tasir**, yani iki liste **ayrismaya devam
  eder**.

---

## Uygulama plani (slice'lar)

| Slice | Ne                                                                                                                                                                                                                                                                                        | Migration               | Durum |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----- |
| **0** | **ADR-0047** (bu belge) — ⚠️ **IKI PO ONAYI** (A: yapisal katkici askida · B: denetim tenant'i / tohumlama)                                                                                                                                                                               | —                       | ⏳    |
| **1** | **Backend (TEK slice):** `marketing` semasi + tek tablo + **FORCE RLS** + CRUD (⚠️ `PATCH` dahil) + kosullu embedding + ⚠️ **kosullu yeniden gomme + `NULL`'a cekme** + `reindex` + oran siniri + izin katalogu + exception filter + **TEK anlamsal katkici** + cross-modul (sifir satir) | `0038_marketing_schema` | ⏳    |
| **2** | **Frontend + HAFIF kapanis denetimi:** liste + DETAY (ODA, ortak duvar), `marketing` rengi, koridorda onikinci kapi + ⚠️ `GET /campaigns/summary`                                                                                                                                         | —                       | ⏳    |

**Cross-modul slice'i YOK ve bu bir atlama degil** — degistirilecek bir
`public.ts` yok (§6.1).

⚠️ **YENI MIGRATION EKLEME KONTROL LISTESI (CLAUDE.md kalici dersi) — dordu de:**

1. `0038_marketing_schema.sql` **ve** `.down.sql` yazilir.
2. ⚠️ `drizzle/meta/_journal.json`a giris eklenir (`idx` sirali, `when`
   **artan**, `tag` dosya adiyla birebir) — atlanirsa `db:migrate`
   **"basarili" der ve hicbir sey uygulamaz**.
3. ⚠️ `database.integration.spec`in **geri alma listesine** eklenir (en yeniden
   eskiye).
4. **Kanit adimi:** tablonun **varligini** iddia eden bir entegrasyon testi —
   sayi saymak yetmez, sayac da journal'a baglidir ve **ayni yalani** soyler.

⚠️ **Slice 1 migration TASIR**, yani push prod'a dagitim tetikler ve
`preDeployCommand` migration uygular. **Product Owner'a push'tan once acikca
haber verilir.** Uygulanmis migration: **38 → 39**.

---

## Kapanis denetimi (Slice 2) — **HAFIF seviye**

| #   | Madde                                                                                                                                                                                                                                                                                 | Zorunlu |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-----: |
| 1   | `git status` temiz · `pnpm verify` **cikis kodu 0** (⚠️ ciktiyi grep'lemek yasak — DEVELOPMENT_RULES 5.4)                                                                                                                                                                             |   ⏳    |
| 2   | Rol turu: viewer **okur, yazamaz (403)** · member **yazar VE guncelller, silemez (403)** · owner siler **(204)** · kimliksiz **401**                                                                                                                                                  |   ⏳    |
| 3   | ⚠️ **DUZENLENEBILIRLIK CANLI:** `done` durumundaki bir kampanyanin `result_note`u **guncellenebiliyor (200)** — §2.2'nin karari gercekten calisiyor mu                                                                                                                                |   ⏳    |
| 4   | Dogrulama kapilari: bos ad **422** · `ends_on < starts_on` **422** · gecersiz `status` **422** · `TARGET_CHUNK_CHARS + 1` karakter **422** ve ⚠️ **hicbir kayit kirpilmadi**                                                                                                          |   ⏳    |
| 5   | Embedding yolu: notlu kayitta gecersiz `OPENAI_API_KEY` → **502 + acik govde**, ⚠️ **kayit SILINMEDI**; notsuz kayit **201**; `reindex` **200** + `failed: 1` → sonra **0**                                                                                                           |   ⏳    |
| 6   | ⚠️ **§4.2.1 SINAVI:** gecerli vektoru olan bir kayitta `name` degistirilir + saglayici bozuk → **502**, ⚠️ **`embedding` `NULL` OLDU**, `reindex` onu **buldu** ve onardi                                                                                                             |   ⏳    |
| 7   | ⚠️ **§4.2 SAYAC SINAVI:** yalnizca `status` degistiren `PATCH` oran sinirini **tuketmiyor**; `result_note` degistiren `PATCH` **tuketiyor**; 429 sinirinda **notsuz kayit yine 201**                                                                                                  |   ⏳    |
| 8   | ⚠️ **ADR-0036 OLCUMU — ADR-0042 §4 protokolu, ADR-0046'NIN ARACIYLA:** uc farkli soru; `grep retrieval.select` ile (a) giren kaynaklar, (b) ⚠️ **her yapisal kaynagin `rowCount`u**, (c) ⚠️ **giren/girmeyen parcalarin skoru**. ⚠️ **UCUNCU KEZ "olculemedi" YAZILMAMALI** — Kalem B |   ⏳    |
| 9   | ⚠️ **T2'NIN GIRDISI KAYDEDILIR:** `status="returned" && kind="structural"` satir sayisi **kac?** ⚠️ Bu sayi §3.5'in **2. on kosulunun** ta kendisidir ve ⚠️ **iki askidaki adayi** (`campaign-gap` + `feedback-satisfaction`) ilgilendirir                                            |   ⏳    |
| 10  | ⚠️ **§3.6'NIN BEDELI OLCULUR:** sonuc notlu bir kampanya `/ask`e **giriyor**; ayni tenant'ta **notsuz** bir kampanya **hicbir cevapta gorunmuyor**                                                                                                                                    |   ⏳    |
| 11  | Fan-out **N=16** olcumu (15 → 16, anlamsal); darbogazin hala `LLMPort.complete` oldugu **kaydedilir**                                                                                                                                                                                 |   ⏳    |
| 12  | Renk turu acik **ve** koyu temada; `/app/marketing` mor, ⚠️ **kabuk ve `--ai-accent` terracotta**; `app-shell.tsx` `git diff` **bos**                                                                                                                                                 |   ⏳    |
| 13  | ⚠️ **MOR BAND SINAVI** (§9): `hr` ve `marketing` kapilarinin **ikon ve etiketleri** gercekten farkli mi; aktif kapi `aria-current` tasiyor mu                                                                                                                                         |   ⏳    |
| 14  | ODA sinavi (ADR-0038): duvar **gercekten ortak**; ⚠️ **`N = 0` iken bos durum gosteriliyor, `0` DEGIL** (§9)                                                                                                                                                                          |   ⏳    |
| 15  | Rota golgelemesi (ADR-0040'in dersi): `/campaigns/reindex` ile `/campaigns/:id` cakismiyor — gercek isteklerle (`reindex` **200**, `<UUID>` **200**, `not-a-uuid` **422**)                                                                                                            |   ⏳    |
| 16  | Cross-modul: sirket yeniden adlandirildi → ad **aninda** yansiyor; ⚠️ `git diff -- crm.public.ts` **BOS**; silinen sirketin id'si **sarkiyor ve ekran patlamiyor**                                                                                                                    |   ⏳    |
| 17  | Belge sinavi: ROADMAP §3.5 (satir 11) guncellendi mi; ⚠️ §8.5 **YIRMI UCTE KALDI** mi (retention girmedi) ama **vektor sayisi ONA** cikti mi; ⚠️ ADR-0045 §10'un Kampanya sorusu **cevaplandi** mi (§6.4)                                                                             |   ⏳    |

**Bilincli yapilmayacaklar (HAFIF seviye kurali):** sifirdan kurulum ❌ · iki
tenant'la tam RLS izolasyon turu ❌.

⚠️ **Prod dogrulamasi ZORUNLUDUR** — Slice 1 migration tasir. Kontroller:
health **200** · uygulanmis migration **38 → 39** · `marketing.campaigns`
**RLS + FORCE** · uc dar rol `marketing` semasina **kor** ·
`GET /api/v1/campaigns` **401**.

---

## ⚠️ HAFIF kapanis denetimi — **yapildi, 2026-08-26**

Yedi maddenin yedisi de kosuldu. ⚠️ **Denetim sirasinda GERCEK BIR KUSUR
BULUNMADI** — ama uygulama sirasinda IKI kusur bulunmustu ve ikisi de kapandi
(asagida).

| #   | Madde                                                               | Sonuc                                                                    |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | `git status` temiz · `pnpm verify` **cikis kodu 0**                 | ✅ api **2207** birim · web **588** birim                                |
| 2   | Uclarin rol turu — 200/401/403/422, ⚠️ **409 YOK**                  | ✅ hepsi dogru (asagida)                                                 |
| 3   | Renk turu — acik **ve** koyu tema, kabuk terracotta kaliyor mu      | ✅ **gercek tarayicida OLCULDU** (asagida)                               |
| 4   | ⚠️ Bosluk gostergesi — bitmis+notsuz kampanya gercekten isaretli mi | ✅ sunucu **3**, ekran **3**; gorsel olarak da dogrulandi                |
| 5   | ⚠️ Basarisiz reindex — vektor `NULL`'a cekiliyor mu                 | ✅ **canli istekle kanitlandi** (asagida)                                |
| 6   | Fan-out olcumu (18 katkici)                                         | ✅ pay **~228 ms (%3,5)**; darbogaz **sekizinci kez** `LLMPort.complete` |
| 7   | Bilinen sinirlar guncellendi (ADR + CLAUDE.md + ROADMAP §8.5)       | ✅                                                                       |

### ✅ Madde 2 — uclarin turu, ve ⚠️ 409'UN YOKLUGU KANITLANDI

| Istek                                               | Beklenen | Alinan  |
| --------------------------------------------------- | :------: | :-----: |
| Kimliksiz `GET /campaigns`                          |   401    | **401** |
| `owner` `GET /campaigns` · `GET /campaigns/summary` |   200    | **200** |
| `member` `POST /campaigns` (`campaign:write` VAR)   |   201    | **201** |
| `member` `DELETE` (`campaign:delete` YOK)           |   403    | **403** |
| Bos ad · ters tarih · `2026-02-31` · `cancelled`    |   422    | **422** |
| 1251 karakter sonuc notu                            |   422    | **422** |

⚠️ **AYNI AD IKI KEZ YAZILDI VE IKISI DE 201 DONDU** — §1.2'nin karari canli
olarak dogrulandi: tekillik kisiti YOKTUR cunku ayni ad her ay tekrarlanabilir
ve ikisi de GERCEKTIR. ⚠️ Bu modulde **409 diye bir cevap yoktur** ve bu bir
eksik degil, bir karardir.

⚠️ **`done` DURUMUNDA `PATCH` -> 200** ve sonuc notu gercekten degisti. §2.2'nin
en onemli iddiasi buydu: kilit olsaydi kullanici kampanyayi yapay olarak
`active` tutardi, yani **durum yalan soylerdi**.

### ✅ Madde 3 — renk turu GERCEK TARAYICIDA olculdu

`data-module` IKI dugume birden duser (koridor kapisi + oda sarmalayici);
ikisi de `marketing` ve **kabuk her iki temada da terracotta kaldi**:

| Token                             | Acik tema             | Koyu tema             |
| --------------------------------- | --------------------- | --------------------- |
| Modul `--accent` / `--ink`        | `#7665a6` / `#655493` | `#ae9de2` / `#bfaef4` |
| **Kabuk** `--accent`              | `#b25628`             | `#e8935a`             |
| ⚠️ **`--ai-accent`** (oda ICINDE) | `#b25628`             | `#e8935a`             |

⚠️ **Ucuncu satir kritiktir:** oda sarmalayicisinin ICINDE olculdu ve modulun
rengiyle DEGISMEDI — yani modul AI'in sesini EZMIYOR. `app-shell.tsx` `git
diff` **BOS** (dokuzuncu kez dokunulmadi); `module-colors.css` `git diff` de
**BOS** — palet ilk gunden dogru adla yaziliydi.

⚠️ **MOR BAND SINAVI:** `hr` ("Ekip", 3 path, yuvarlak govdeler) ve `marketing`
("Kampanyalar", 2 path, koseli megafon konisi) FARKLI ETIKET ve FARKLI IKON
tasiyor; aktif kapi `aria-current="page"` aliyor. Renk hicbir yerde tek ayirt
edici degil.

### ✅ Madde 4 — bosluk gostergesi, IKI TARAFTAN dogrulandi

`GET /campaigns/summary` -> `missingResultCount: 3`; ayni veriyle ekranin
isaretleyecegi kayit sayisi da **3**. ⚠️ Isaretlenenler arasinda _"Agustos
sosyal medya"_ var — `status = active` ama bitisi **gecmis**, yani §3.3'un
**ikinci dali** (kapatilmadan birakilmis kampanya) gercekten calisiyor.

⚠️ Gorsel olarak da dogrulandi: kartta **"◌ Sonucu yazilmadi"** rozeti, yaninda
"Yayinda" durumu. Sonuc notu OLAN kartlar isaretsiz.

### ✅ Madde 5 — `NULL`'A CEKME CANLI KANITLANDI (§4.2.1)

Vektoru olan bir kayitta (`vector_dims = 1536`) saglayici bozuldu ve gomulen
bir alan (`resultNote`) degistirildi:

| Kontrol                                       | Sonuc                                                |
| --------------------------------------------- | ---------------------------------------------------- |
| Cevap                                         | **502** + acik govde (`DisclosableProblem`)          |
| ⚠️ Yazilan METIN                              | ⚠️ **KAYDEDILDI** (kaybolmadi)                       |
| ⚠️ `embedding`                                | ⚠️ **`NULL`** — bayat DEGIL                          |
| `reindex` onu buluyor mu                      | ✅ (`embedding IS NULL AND result_note IS NOT NULL`) |
| Saglayici duzelince `POST /campaigns/reindex` | ✅ `{"repaired":1,"failed":0}` -> vektor **1536**    |

⚠️ **Bu, §4.2.1'in tek gerekcesinin canli kanitidir:** bayat bir vektor DOLU
gorunurdu, `reindex` onu BULAMAZDI ve `/ask` ESKI ICERIKLE cevap verirdi — hata
SESSIZ olurdu.

### ✅ Madde 6 — fan-out N=18

| Olcu                     | Deger                                |
| ------------------------ | ------------------------------------ |
| Toplam katkici           | **18** (10 anlamsal + 8 yapisal)     |
| `candidateCount`         | 60 -> `selectedCount` 8              |
| `campaign-notes`         | `returned`, 4 satir, **1 yuva**      |
| `campaign-gap`           | `returned`, 4 satir, **1 yuva**      |
| `degradedSources`        | **YOK**                              |
| Toplam sure (3 soru ort) | ~6455 ms                             |
| `complete`               | 5840 ms (`promptTokens` ort **777**) |
| `embed`                  | 387 ms                               |
| ⚠️ **Fan-out payi**      | ⚠️ **~228 ms (%3,5)**                |

⚠️ Darbogaz **sekizinci olcumdur** ayni yerde: `LLMPort.complete`.

### ⚠️ Uygulama sirasinda bulunan IKI KUSUR — ikisi de kapandi

1. ⚠️ **`marketing.campaigns` icin `GRANT` YAZILMAMISTI.** `0000_init`in
   `ALTER DEFAULT PRIVILEGES` satiri **yalnizca `platform` semasi** icindir
   (ADR-0043 Slice 1b'nin bulgusu) — uygulama rolu tabloyu goremedi ve **uc
   katkici birden** (`campaign-notes`, `campaign-gap`,
   `feedback-satisfaction`) sessizce `degraded` dondu. ⚠️ Kusur ancak
   `retrieval.select` satiri okundugunda gorundu. **CLAUDE.md'nin migration
   kontrol listesine DORDUNCU madde olarak eklendi.**
2. ⚠️ **`sql<Date | null>` BIR IDDIADIR, BIR DONUSUM DEGIL.** Drizzle ham bir
   `max(timestamptz)` ifadesini ESLEMEZ; surucu DIZE dondurur ve
   `feedback-satisfaction` `moment.getTime is not a function` ile cokuyordu.
   ⚠️ Birim testleri bunu goremezdi (hepsi gercek `Date` besliyordu). Koruma
   **tip sistemine** baglandi: cevirici kaldirilirsa DERLEME KIRILIR.

---

## Kampanya kapanirken bilinen sinirlar — **Slice 2 EKLERI**

Asagidaki liste yukaridaki § Bilinen sinirlar'i **degistirmez, GENISLETIR**:

- ⚠️ **DUVAR ILE LISTE AYRI ISTEKLERDIR** — bir kayit eklendiginde ikisi de
  tazelenir, ama BASKA BIR KULLANICI ayni anda kayit girerse duvar bir sonraki
  tazelemeye kadar eskidir (canli guncelleme YOK). ADR-0045'in ayni siniri.
- ⚠️ **OZET HATASI SESSIZDIR** — `GET /campaigns/summary` cokerse duvar iskelet
  olarak kalir ve kullanici bir hata mesaji GORMEZ (liste calismaya devam
  eder). Bilincli: calisan bir listeyi bir toplama sorgusu yuzunden gizlemek
  daha kotuydu.
- ⚠️ **DURUM FILTRESI OZETI ETKILEMEZ** — duvar TUM tenant'i ozetler. Kullanici
  "Taslak" filtresindeyken duvarda yine genel sayilari gorur; bu KASITLIDIR ama
  ilk bakista sasirtabilir (ADR-0045'in puan bandi filtresiyle ayni sinif).
- ~~⚠️ **BOSLUK TANIMI IKI YERDE YAZILI**~~ ✅ **KAPANDI (2026-08-26).**
  Denetimde su sinir kaydedilmisti: _"sunucuda `gapSnapshot`, arayuzde
  `hasResultGap`; ikisi senkron kalmak zorundadir, ayrisirsa ekran bir sey
  der `/ask` baska bir sey sayar ve fark SESSIZ olur."_
  ⚠️ Risk bir testle degil, **tanimi TEKILLESTIREREK** kapatildi:
  - Arayuzdeki `hasResultGap` **SILINDI**; ekran artik sunucunun turettigi
    `resultGap` bayragini okuyor (`Campaign` sozlesmesinde).
  - Sunucuda tek bir SQL ifadesi (`resultGapExpression`) var ve **UC
    tuketici** onu paylasiyor: `campaign-gap` katkicisi · duvarin
    `missingResultCount`u · satir bayragi.
  - ⚠️ Bayrak `RETURNING` ile **ayni islemde** doner — ikinci bir `SELECT`
    yok ve istemci tarafinda hicbir hesap yok.
  - ⚠️ `resultGap` `CampaignState`e **girmedi**: saklanan degil TURETILEN bir
    degerdir (`companyName` ile ayni sinif) ve entity'nin onu tasidigini ima
    etmek yanlis olurdu.
  - Bir entegrasyon testi (`marketing-gap-definition.integration.spec.ts`) uc
    tuketiciyi AYNI VERIYLE kosturup **sayilarin ve KIMLIKLERIN** esit
    oldugunu dogruluyor; yuklem bilerek ayristirildiginda **uc test kirmizi
    yaniyor**.
- ⚠️ **TARIH GIRDISI `<input type="date">`** — tarayicinin yerel takvimini
  kullanir. Kampanyanin saati olmadigi icin (§1.5) saat dilimi sorunu DOGMAZ,
  ama tarih BICIMI tarayici diline gore degisir.
- ⚠️ **DETAY SAYFASINDA IYIMSER ESZAMANLILIK YOK** — iki kullanici ayni
  kampanyayi ayni anda duzenlerse SON YAZAN KAZANIR ve digeri uyari ALMAZ.
  ⚠️ Bu modulde etkisi digerlerinden BUYUK: satirin her alani guncellenebilir.
- ⚠️ **LISTEDE SONUC NOTU KIRPILIR** (`line-clamp-2`) — tam metin yalnizca
  detayda gorunur. Kirpma GORSELDIR, veri kaybi degildir.
- ⚠️ **`reindex` ICIN ARAYUZ DUGMESI YOK** — uc vardir ama ekrandan cagrilamaz.
  Bir kampanyanin vektoru `NULL`'a cekildiginde kullanici bunu "Aranamayan"
  uydusunda GORUR ama ONARAMAZ. ⚠️ Tedarikci'nin onarim dugmesinin karsiligi
  burada YAZILMADI.

---

## Bu karar ne zaman yeniden gozden gecirilir?

- ⚠️ **Kapanis denetiminin 9. maddesi bir SAYI urettiginde:** §3.5'in 2. on
  kosulu karsilanir ve ⚠️ **ADR-0036/0042'nin revizyonu (0048 adayi)** yazilir.
  O ADR **iki** askidaki adayi birden ele alir (`campaign-gap` +
  `feedback-satisfaction`) ve §3.4'un _"kosullu sessiz kaynak"_ gozlemini
  **girdi olarak** okur.
- ⚠️ **Ucuncu kez "olculemedi" yazilirsa:** bu artik bir eksiklik degil bir
  **surec arizasidir** ve Kalem B **bir sonraki platform isi** olur.
- ⚠️ **ROI / donusum / butce istendiginde:** ⚠️ **once mekanik bag** karara
  baglanir (UTM · kupon · link token'i), sonra alan. ⚠️ Butce geldigi gun
  §2.4'un `platform/audit` karari **yeniden sorulur** — para, olcutun birinci
  maddesini degistirir.
- ⚠️ **Gonderim istendiginde:** Queue/teslimat karari (ROADMAP §2.3 ·
  ADR-0030 §2.1) — ⚠️ Randevu'nun hatirlatmasi ve Anket'in gonderimiyle **ayni
  engel**; ucu birlikte karara baglanmalidir.
- ⚠️ **Hedef kitle / segment istendiginde:** `crm.segments` **CRM'in ADR'sinde**
  acilir; bu ADR o gun **genisletilmez** (§6.2).
- ⚠️ **Geri Bildirim ↔ Kampanya bagi istendiginde:** once **yon**, sonra
  `public.ts`, sonra ⚠️ **DAG yeniden kanitlanir** — ayri bir ADR (§6.4).
- ⚠️ **`result_note` disinda ikinci bir anlatisal alan istendiginde** (ornegin
  bir "brief"): chunk tablosu sorusu **yeniden sorulur** — birlesik kural
  (§1.3) o gun farkli cevap verebilir.
- **Faz 6'nin KVKK denetiminde** (ROADMAP §8.2): ⚠️ kampanya kaydi bugun
  **kisisel veri tasimaz** (hedef kitle bir kume degil, sirket isaretcisi bir
  id'dir) — ⚠️ ama bir **alici listesi** eklendigi gun bu **degisir** ve kayit
  `feedback.responses` ile **ayni sinifa** girer.
