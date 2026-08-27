# 0051 — Faz 5 / Modul 12: Sadakat Programi

- **Durum:** ⚠️ **Slice 0-1 UYGULANDI** (2026-08-27) — Slice 2 (frontend + kapanis denetimi) bekliyor
- **Tarih:** 2026-08-26
- **Karar veren:** Product Owner
- **Faz:** 5 (⚠️ **SON modul** — bu modul kapaninca Faz 5 TAMAMEN biter)

> ### ⚠️ ONCE SONUC: BU MODUL `POST /ask` HAVUZUNA HIC DOKUNMAZ
>
> Ne anlamsal ne yapisal katkici var. Fan-out **18'de kalir**, yapisal kaynak
> **8'de**, T2 durumu **degismez**.
>
> ⚠️ **Ama bu, IK'nin (ADR-0043) sifirindan FARKLI bir seydir ve oyle
> yazilmalidir:** IK'da sifir bir **guvenlik ozelligiydi** (maas modele
> gitmesin diye once sema, sonra API, sonra izin degismeli). Burada sifir
> ⚠️ **bir SINIRDIR**: v1'de bu modulun kurumsal hafizaya soyleyecek **hicbir
> seyi yoktur** — verisi sayisal ve tekrarlidir, yapisal "haber"inin girdisi
> ise **kapsam disinda** birakilmistir (§3).
>
> ⚠️ Bu, CLAUDE.md'nin kurucu kisitiyla (_"modiller urun degildir, hafizadir"_)
> **gerilim halindedir** ve gizlenmiyor — §PO Kalem A tam olarak bunu onaya
> sunuyor.

---

## Baglam

Faz 5'in ilk **on bir** modulu kapandi ve prod'da canli: CRM
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
Musteri Geri Bildirimi ([ADR-0045](0045-musteri-geri-bildirim-modulu.md)) ·
Kampanya/Pazarlama ([ADR-0047](0047-kampanya-pazarlama-modulu.md)).

Platform seviyesinde retrieval **uc kez** derinlemesine revize edildi
([ADR-0036](0036-context-retrieval-kota.md) ·
[ADR-0042](0042-retrieval-taban-revizyonu.md) ·
[ADR-0050](0050-retrieval-taban-buyukluk-revizyonu.md)) ve uc arac/mekanizma
eklendi ([ADR-0046](0046-retrieval-gozlemlenebilirlik.md) `retrieval.select` ·
[ADR-0048](0048-denetim-tenant-tohumlama.md) denetim tenant'i ·
[ADR-0049](0049-yapisal-esitlik-kirma.md) adil eleme).

ROADMAP §3.5'in **onikinci ve son** sirasi **Sadakat Programi**dir; kapsam notu
iki kelime: _"Puan · kademe"_. ⚠️ **Kademe (tier) bu ADR'de v2'ye
BIRAKILIYOR** — bu bir ROADMAP sapmasidir, gerekcesi §10.1'de ve onayi
§PO Kalem B'dedir.

### ⚠️ BU MODULUN YENI SORUSU: T2 ARTIK BIR ENGEL DEGIL — PEKI SIMDI OLCUT NE?

ADR-0045 ve ADR-0047 yapisal adaylarini **kosullu erteledi** ve ikisinin de
gerekcesi bir **esikti**: T2'nin girdisi olculemiyordu. ADR-0048 numuneyi,
ADR-0049 adil elemeyi, ADR-0050 da olcumu getirdi — ve ⚠️ ADR-0050 esigin
anlamini **degistirdi**:

> _"⚠️ Bir tetikleyici her zaman atesliyorsa, artik bir tetikleyici degildir.
> T2 bundan sonra HER modulde ateslenecek (12. modul gelince yapisal kaynak 9
> olabilir) ve her seferinde bu ADR'nin sonucuna varilacak."_ — ADR-0050 §Karar 4

⚠️ **Yani bu modul, "T2 tetiklenir" gerekcesini KULLANAMAYAN ilk moduldur.**
ADR-0050 bunu ismen bu belgeye birakti:

> _"⚠️ **12. modul (Sadakat) bir yapisal katkici eklerse:** yapisal kaynak 9
> olur, kapsama %37,5 → **%33**'e duser. ⚠️ O gun soru "tabani buyutelim mi"
> degil, ⚠️ **"bu kaynak gercekten yapisal mi"** olmalidir (ADR-0040'in uc
> adayi reddetme disiplini)."_ — ADR-0050 §Bu karar ne zaman yeniden gozden gecirilir

> ⚠️ **Bu ADR o talimati harfiyen uyguluyor:** §3'te uc aday, dort testle,
> tek tek ele aliniyor ve **T2 hicbirinin reddinde gerekce olarak
> KULLANILMIYOR**.

### Zemin: onikinci modul, tamamen TUKETICI — ve ILK KEZ HICBIR SEY TUKETMIYOR

| Ne                          | Teklif/Fatura'da (8)   | IK'da (9)                    | Kampanya'da (11)               | **Sadakat'ta (12)**                                  |
| --------------------------- | ---------------------- | ---------------------------- | ------------------------------ | ---------------------------------------------------- |
| `EmbeddingPort` / `LLMPort` | HIC KULLANILMADI       | HIC KULLANILMADI             | `EmbeddingPort` kullaniliyor   | ⚠️ **HIC KULLANILMIYOR** (ucuncu kez)                |
| Vektor / chunk / `reindex`  | YOK                    | YOK                          | Satir ici vektor               | ⚠️ **YOK** — ucuncu vektorsuz is modulu              |
| Oran siniri                 | YOK                    | YOK                          | KOSULLU (`PATCH` de sayar)     | ⚠️ **YOK** (embedding cagrisi yok)                   |
| RLS sablonu                 | MT §12.2'den hazir     | MT §12.2'den hazir           | MT §12.2'den hazir             | **MT §12.2'den hazir**                               |
| Retrieval ucu               | TEK katkici (yapisal)  | ⚠️ **SIFIR**                 | IKI katkici                    | ⚠️ **SIFIR** — ikinci kez, **farkli sebeple**        |
| Izin modeli                 | Dokuzuncu kez          | Onuncu kez                   | Onikinci kez                   | **Onucuncu kez**                                     |
| Cross-modul referans        | TEK kenar, sifir satir | YOK                          | TEK kenar, sifir satir         | ⚠️ **TEK kenar, sifir satir — ama ZORUNLU** (§6)     |
| Degistirilebilirlik         | `draft` sonrasi kapali | Ucret: ekleme-yalniz         | TAM duzenlenebilir             | ⚠️ **DEFTER degistirilemez, HESAP silinebilir** (§2) |
| `platform/audit`            | Ertelendi              | ⚠️ **ACILDI** (tek tuketici) | Degerlendirildi, kullanilmiyor | ⚠️ **Degerlendirildi, kullanilmiyor — YENI gerekce** |
| Kahraman rakam              | Bir SAYI               | Bir SAYI                     | Bir SAYI                       | ⚠️ **Bir TOPLAM** — projede ILK (§9)                 |
| ODA                         | Ilk gunden             | Ilk gunden                   | Ilk gunden                     | **Ilk gunden**                                       |

**Gercekten yeni BES karar var:**

1. ⚠️ **CROSS-MODUL ISARETCISI ILK KEZ ZORUNLU** (§6.1). Bugune kadarki bes
   isaretcinin **besi de** nullable'di ve gerekce hep ayniydi: _"zorunlu
   olsaydi kullanici sahte kayit acardi."_ ⚠️ **Burada ayni ders TERS
   ISLIYOR** — zorunluluk sahte kayit degil, **gercek CRM kaydi** uretir.
2. ⚠️ **BAKIYENIN NEGATIF OLAMAMASININ VERITABANI GARANTISI YOKTUR** (§4).
   Projede ilk kez bir degismez (invariant) **ne turetilebilir ne
   `CHECK`lenebilir**: satirlar arasi bir kosul. Tek dayanak **tek bir kod
   yolu + satir kilidi** — ve bu ADR onu bir guvence gibi degil, bir **sinir**
   gibi yaziyor.
3. ⚠️ **DEFTER DEGISTIRILEMEZ AMA HESAP SILINEBILIR** (§2). Projede
   degistirilebilirligin **besinci sekli**: satir bazinda `inventory.movements`
   kadar kati, kayit bazinda `feedback.responses` kadar acik — ve ikisi ayni
   tabloda.
4. ⚠️ **YAPISAL KATKICI REDDEDILMIYOR, TANIMLANAMIYOR** (§3). Uc adayin ucu de
   dusuyor ama en guclusunun (`loyalty-expiry`) dusme sebebi bir **degerlendirme**
   degil bir **yokluktur**: puan sona ermesi kapsam disi, yani hesaplanacak
   girdi **yok**. ⚠️ Tetikleyici bu yuzden kesindir: **girdi geldigi gun aday
   dort testi de gecer** ve karar yeniden verilir.
5. ⚠️ **PUANLAR TOPLANIR — ADR-0034 ve ADR-0039'un kurallari ILK KEZ
   TETIKLENMIYOR** (§9.1). Para birimi yok, birim varyanti yok: bir tenant'in
   programinda **tek bir birim** vardir ("puan"). Bu yuzden odanin kahraman
   rakami projede **ilk kez anlamli bir TOPLAM**dir.

---

## ⚠️ PRODUCT OWNER ONAYINA SUNULAN UC KALEM

Ucu de ayri ayri karara baglanabilir; biri reddedilirse digerleri ayakta kalir.

### Kalem A — ⚠️ SIFIR katkici: Faz 5, `POST /ask`e katkisi olmayan bir modulle KAPANIYOR

§3 uc adayi dort testle eledi ve modul kurumsal hafizaya **hicbir sey**
katmiyor. ⚠️ Bu, CLAUDE.md'nin kurucu cumlesiyle gerilimdedir
(_"her modulun var olus sebebi akilli ajanlara baglam ve hafiza saglamaktir"_),
dolayisiyla **sessizce gecilmemelidir**.

| Secenek                                  | Sonuc                                                                                                                                                                                                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚠️ **Onay verilirse** (onerilen)         | Slice 1 **sifir katkici** ile yazilir. Modul, kurumsal hafizaya v1'de katilmaz; §3.5'in yazili tetikleyicisi (puan sona ermesi **veya** odul esigi) gelene kadar boyle kalir ve ⚠️ bu, § Bilinen sinirlar'in **ilk maddesi** olarak kayda gecer.   |
| **Onay verilmezse** ("bir katkici ekle") | ⚠️ **Once kapsam genisletilir, sonra katkici.** Sira tersine cevrilemez: bugun eklenecek her katkici ya bir **sayim** olur (test 1) ya da **olmayan bir veriden uydurma bir yargi** (ADR-0040 Aday 1 · ADR-0047 Aday 1'in birebir ayni gerekcesi). |

⚠️ **Ucuncu bir secenek YOKTUR ve bu onemlidir:** "kucuk bir sey de olsa
ekleyelim" demek, ADR-0036'nin taban garantisinden **liyakatsiz** bir yuva
almaktir — ve ADR-0050 §Karar 1'in olctugu gibi bugun yapisal taraf
**tam olarak 3 yuvadir**, yani eklenen her kaynak baska bir kaynagin sesini
kisar (kapsama %37,5 → %33).

### Kalem B — ⚠️ "KADEME" (tier) v2'ye birakiliyor: bu bir ROADMAP SAPMASIDIR

ROADMAP §3.5, 12. satirin kapsamini _"Puan · **kademe**"_ diye yaziyor. Bu ADR
**yalnizca puani** kapsiyor. ⚠️ Gerekce §10.1'de; ozeti: bir kademe sistemi bir
**kural motorudur** (esikler · degerlendirme ani · dusme politikasi · kademe
basina AYRICALIK) ve ayricaliklar **odul katalogunu** gerektirir — o da kapsam
disi. ⚠️ **Ayricaliksiz bir kademe bir ETIKETTIR**, bir program degil.

- **Onay verilirse** (onerilen): ROADMAP §3.5'in 12. satiri kapanis
  denetiminde **guncellenir** (denetim maddesi 16) ve kademe, yazili bir
  tetikleyiciyle v2'ye gecer.
- **Onay verilmezse:** ⚠️ **implementasyona GECILMEZ** — odul katalogu +
  kademe + ayricalik ayri bir ADR'dir ve bu modulun kapsamini **iki katina**
  cikarir.

### Kalem C — ⚠️ `crm_contact_id` ZORUNLU, ve bunun bedeli BASKA BIR MODULE bakiyor

§6.1 isaretciyi **NOT NULL** yapiyor. Iki sonucu var ve ikincisi bu modulun
disina tasar:

1. ⚠️ **`contact:read` fiilen bir ON KOSUL olur** — hesap acmak icin kisinin
   gorunur olmasi gerekir (§6.2). Bugun dort rolun **dordu de** bu izni
   tasiyor, yani kapi **kuruluyor ama tetiklenmiyor** (projede **onbirinci**
   kez ayni cumle).
2. ⚠️ **SARKAN ISARETCI ILK KEZ KAYDI KULLANILAMAZ KILIYOR.** Bugune kadarki
   bes sarkan isaretcinin hicbiri kaydi islevsiz yapmiyordu (silinen sirketin
   projesi hala bir projedir). ⚠️ **Sahibi silinmis bir sadakat hesabi ise
   kimin oldugu bilinmeyen bir bakiyedir** — ekranda durur, ama kullanilamaz.
   Telafi CRM'in domain event yayinlamasidir ve o karar **alti kez**
   ertelenmistir.

- **Onay verilirse** (onerilen): isaretci zorunlu kalir, sarkan durum **tolere
  edilir ve ekranda acikca soylenir** (§9.2), ve ⚠️ **CRM domain event
  borcunun onceligi bu ADR'de yaziya gecer** (§ Bilinen sinirlar).
- **Onay verilmezse** ("nullable olsun"): ⚠️ modul **kimligi olmayan
  bakiyeler** uretir — bir sadakat hesabinin sahibi yoksa, musteri geldiginde
  **bulunamaz**. Bu, modulun var olus sebebini ortadan kaldirir (§6.1).

---

## Karar

### 1. Yeni `loyalty` semasi — IKI tablo

**Onucuncu sema.** `platform` disindaki semalar: `knowledge` · `crm` ·
`projects` · `finance` · `appointments` · `documents` · `inventory` ·
`suppliers` · `invoicing` · `hr` · `feedback` · `marketing` · **`loyalty`**.

#### 1.1 Ad `loyalty` — sema · klasor · rota · `data-module` · palet AYNI KELIME

ADR-0035'in `booking` → `appointments` dersi (**besinci** kez okunuyor):
ayrisirsa `data-module` **sessizce** tutmaz — ekran calisir, terracotta kalir,
lint yakalamaz.

⚠️ **Kelime `module-colors.css`te ZATEN SECILMIS: `loyalty`**
(`#9a5a84` / koyu `#d792be`). `documents`, `feedback` ve `marketing` gibi palet
**ilk gunden dogru adla** yazilmis; ADR-0035'in yeniden adlandirma isi burada
**gerekmiyor**.

⚠️ **IZIN KAYNAKLARI ISE `loyalty_account` ve `loyalty_point`** — modul anahtari
ile izin kaynaginin ayrismasi projede **kuraldir** (§5).

#### 1.2 `loyalty.accounts` — bir musterinin PROGRAMDAKI KAYDI

| Kolon                | Tip                    | Not                                                                            |
| -------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| `id`                 | `uuid` PK              |                                                                                |
| `tenant_id`          | `uuid NOT NULL`        | RLS + **FORCE** (MT §12.2)                                                     |
| `crm_contact_id`     | ⚠️ **`uuid NOT NULL`** | ⚠️ Cross-modul isaretci — **FK YOK** (Mutlak Kural 5), ama **NOT NULL** (§6.1) |
| `created_by_user_id` | `uuid NOT NULL`        | Satir ici aktor damgasi                                                        |
| `created_at`         | `timestamptz NOT NULL` |                                                                                |

⚠️ **`updated_at` KOLONU YOKTUR** — ve bu ADR-0045'in karariyla ayni olcuttur:
_"guncellenmeyen bir satirin guncellenme zamani da olmaz; kolonu koymak olmayan
bir yolun VAR OLDUGUNU ima ederdi."_ ⚠️ Bu tablonun **guncellenebilir hicbir
alani yoktur** (§2.2), yani `PATCH` ucu de yoktur.

**Kisitlar:**

- ⚠️ `accounts_tenant_contact_unique UNIQUE (tenant_id, crm_contact_id)` —
  **bir musteriye bir hesap**.

> ⚠️ **TEKILLIK KISITI BURADA GEREKLI — VE BU, ADR-0047'NIN TAM TERSIDIR.**
> Kampanya'da `UNIQUE(tenant_id, name)` **reddedilmisti** cunku ayni ad her ay
> tekrarlanabilir ve ikisi de **gercektir**. Burada ise ayni musteriye ikinci
> bir hesap **gercek bir olgu degildir**: bakiyeyi **ikiye boler** ve hata
> ⚠️ **SESSIZDIR** — ekran calisir, iki satir yan yana durur, musteri
> puanlarinin yarisini goremez. ⚠️ ADR-0039'un `ABC-1`/`abc-1` SKU tuzaginin
> **birebir ayni sekli**; orada stok, burada bakiye bolunurdu.
>
> ⚠️ Sonucu: bu modulde **409 VARDIR** (Kampanya ve Geri Bildirim'de yoktu) ve
> govdesi mevcut hesabin id'sini **tasir** — arayuz kullaniciyi yeni bir kayda
> degil **var olan hesaba** goturur.

#### 1.3 `loyalty.point_entries` — DEGISTIRILEMEZ defter

| Kolon                | Tip                                  | Not                                                                                     |
| -------------------- | ------------------------------------ | --------------------------------------------------------------------------------------- |
| `id`                 | `uuid` PK                            |                                                                                         |
| `tenant_id`          | `uuid NOT NULL`                      | RLS + **FORCE**                                                                         |
| `account_id`         | `uuid NOT NULL`                      | ⚠️ **AYNI SEMA** → gercek FK, `ON DELETE CASCADE` (§2.3)                                |
| `direction`          | `text NOT NULL`                      | ⚠️ `CHECK (direction IN ('earn','spend'))` — aritmetik eksen (§1.4)                     |
| `points`             | ⚠️ **`integer NOT NULL`**            | ⚠️ `CHECK (points > 0)` — **HER ZAMAN POZITIF**; isaret `direction`dadir (§1.4)         |
| `note`               | `text NULL`                          | ⚠️ Bir **ETIKET**, anlatisal metin DEGIL; ust sinir **160** ve **EMBED EDILMEZ** (§3.1) |
| `occurred_at`        | `timestamptz NOT NULL DEFAULT now()` | ⚠️ Gelecege yazilamaz (**422**) — §1.6                                                  |
| `created_by_user_id` | `uuid NOT NULL`                      | ⚠️ Satir ici aktor damgasi — **burada TAM bir gecmistir** (§2.4)                        |
| `created_at`         | `timestamptz NOT NULL`               |                                                                                         |

**Indeksler:** `(tenant_id, account_id)` — bakiye sorgusunun tasiyicisi ·
`(tenant_id, occurred_at DESC)` — duvarin "son 30 gun" uydulari.

#### 1.4 ⚠️ `direction` ARITMETIK EKSENDIR — isaretli puan DEGIL

`points` **her zaman pozitiftir**; yon ayri bir kolonda yasar. Bu, ADR-0034 §5
(gelir/gider) ve ADR-0039 §3 (giris/cikis) kararlarinin **ucuncu** kez
uygulanmasidir ve gerekce degismedi:

> Isaretli bir miktar secilseydi, isaret koymayi unutan **tek** bir yazma yolu
> bir harcamayi kazanc gibi toplardi ve hata ⚠️ **SESSIZ ve MAKUL GORUNEN
> yanlis bir sayi** uretirdi.

⚠️ **`is_correction` KOLONU YOKTUR — ADR-0039'dan bilincli sapma.** Stok'ta o
bayrak vardi cunku `recordCount` yolu duzeltme satirlarini **sistem
uretiyordu** ve sistem onlari ayirt edebiliyordu. Burada her satiri bir insan
**acik bir yonle** yaziyor; bir `spend`in duzeltme mi odul mu oldugu ancak
**kullanicinin kendi hatasi hakkindaki beyanina** dayanirdi.

> ⚠️ **Duzeltme, TERS YONDE BIR SATIRDIR** — ADR-0041'in _"iskonto ALANI yok,
> negatif birim fiyatli bir satir olarak yazilir"_ karariyla **ayni sekil**.
> ⚠️ **Durust bedeli:** _"bu bir duzeltmeydi"_ bilgisi yalnizca `note`ta
> serbest metin olarak yasar ve **sorgulanamaz**; ileride "toplam kullanilan
> puan" diye bir rakam istenirse duzeltmeler ona **karisir**.

#### 1.5 ⚠️ `points` `integer` — `numeric` DEGIL

Stok `numeric(14,3)` kullanir cunku 3,5 kg gercektir. **3,5 puan degildir** —
puan **sayilir**, olculmez. ⚠️ Kesirli bir puan ilk kazandirma kuralinda
(`her 10 TL = 1 puan`) yuvarlama sorusu acardi ve o soru **v2'nin** sorusudur
(§10).

⚠️ **Ust sinir YOKTUR ve bu bir karardir:** `points <= 1000000` gibi bir kisit
**icat edilmis bir sayidir** (ADR-0047 §1.3'un _"yeni bir sayi icat edilmez"_
kurali). Bir tipo (`50` yerine `50000`) bakiyeyi sisirir — ama hata
⚠️ **GORUNURDUR**: bakiye ekranda ziplar ve telafi bir ters satirdir. Sessiz
degil, gurultulu bir yanlislik (projede defalarca verilen ayni tercih).

#### 1.6 ⚠️ `occurred_at` GELECEGE YAZILAMAZ — ve sebebi bir SORUYU ORTADAN KALDIRMAKTIR

Bakiye, tarihten **bagimsiz olarak** butun satirlarin toplamidir. Gelecege
tarihli bir `earn` yazilabilseydi, ⚠️ **bugun henuz kazanilmamis bir puan
bugunun bakiyesinde gorunurdu** ve "hangi bakiye dogru" sorusu iki farkli
cevaba sahip olurdu.

⚠️ Gecmise yazmak **serbesttir** (durust bir ihtiyac: dunku alisverisin puani
bugun girilir), gelecege yazmak **422**dir.

⚠️ **"Su tarihteki bakiye" sorusu v1'de SORULAMAZ** — turetilebilir
(`occurred_at <= X`) ama bir uc olarak **acilmiyor**; bugun bir talep yok ve
acmak, hangi tarihin (kayit mi olay mi) kastedildigini ekranda anlatmayi
gerektirirdi.

---

### 2. ⚠️ DEFTER DEGISTIRILEMEZ, HESAP SILINEBILIR — BESINCI SEKIL

| Modul                              |  Guncelleme  |                     Silme                     | Olcut                                       |
| ---------------------------------- | :----------: | :-------------------------------------------: | ------------------------------------------- |
| `finance.transactions` (0034)      |      ✅      |                      ✅                       | Yanlis tutar duzeltilebilmeli               |
| `inventory.movements` (0039)       |      ❌      |                      ❌                       | Bugunku miktar ondan **TURETILIYOR**        |
| `suppliers.interactions` (0040)    |      ❌      |                      ❌                       | Bir gorusme olduktan sonra "degismis" olmaz |
| `invoicing.sales_documents` (0041) | `draft` son. |                  `draft` ✅                   | Belge **sirketten cikti** (snapshot)        |
| `feedback.responses` (0045)        |      ❌      |                      ✅                       | Ucuncu kisinin beyani + KVKK                |
| `marketing.campaigns` (0047)       |      ✅      |                      ✅                       | Uc olcut de "hayir" dedi                    |
| **`loyalty.point_entries`**        |    ⚠️ ❌     | ⚠️ **SATIR BAZINDA ❌ · HESAPLA BIRLIKTE ✅** | ⚠️ **Iki soru, iki cevap** (§2.1)           |

#### 2.1 ⚠️ Neden SATIR silinemez ama HESAP silinebilir

Ayrimi yapan sey ADR-0039'un olcutudur — **bugunku bir sayi bu kayitlardan
turetiliyor mu?**

| Islem                          | Bakiyeye etkisi                                                                                       | Karar                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------ |
| Tek bir satiri silmek          | ⚠️ **Bakiyeyi SESSIZCE yeniden yazar** — 500 puanlik hesap bir satir silinince 200 olur, kimse bilmez | ⚠️ **YASAK** (uc katman, §2.3) |
| Tek bir satiri guncellemek     | ⚠️ Ayni sey, daha sinsi hali                                                                          | ⚠️ **YASAK**                   |
| ⚠️ **Hesabin tamamini silmek** | Bakiye **yeniden yazilmaz** — bakiyenin kendisi de **yok olur**                                       | ✅ **SERBEST**                 |

> ⚠️ **Fark bir teknik ayrinti degil, bir ANLAM farkidir.** Bir satiri silmek
> _"bu musterinin puani baska bir sayiydi"_ demektir ve yalan uretir. Hesabi
> silmek _"bu musterinin programda kaydi yok"_ demektir ve **hicbir sayiyi
> yalanlamaz**.

⚠️ **Silme yolunun VAR OLMASI ayrica bir YUKUMLULUKTUR** — ADR-0045'in KVKK
gerekcesi (m.7/m.11) burada da gecerlidir: hesap bir **kisiye baglidir** ve
silme hakki bir kolaylik degil bir zorunluluktur. ⚠️ Bu yuzden `RESTRICT`
(ADR-0039'un ucuncu katmani) burada **kullanilamazdi**: hareketi olan her hesap
silinemez olurdu ve silinemeyen bir kisisel veri kaydi bir **uyum ihlalidir**.

#### 2.2 Hesabin guncellenebilir alani YOKTUR — `PATCH` ucu de yok

`crm_contact_id` **degistirilemez** ve gerekcesi sert: onu degistirmek
⚠️ **bir bakiyeyi BASKA BIR INSANA devretmektir**. Yanlis kisiye acilmis bir
hesabin dogru cozumu **silip yeniden acmaktir** — gorunur, iz birakan ve
niyeti belli bir islem.

#### 2.3 ⚠️ Degistirilemezligin UC KATMANI (ADR-0039'un deseni, kolon bazli)

| #   | Katman            | Ne                                                                                                                    |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | **Domain**        | `PointEntry` entity'sinde `update` metodu **YOK**; repository'de tekil `deleteEntry` **YOK**                          |
| 2   | **Izin**          | ⚠️ `loyalty_point:delete` **diye bir izin YOKTUR** (`stock_movement`in ayni karari)                                   |
| 3   | ⚠️ **Veritabani** | ⚠️ `businessos_app` rolune `point_entries` uzerinde **YALNIZCA `SELECT, INSERT`** verilir — `UPDATE`/`DELETE` **YOK** |

> ⚠️ **UCUNCU KATMAN BU MODULDE BIR SORU ACIYOR VE CEVABI DENETIMDE
> KANITLANMALIDIR:** `point_entries`e `DELETE` verilmezse, hesap silindiginde
> `ON DELETE CASCADE` calisir mi?
>
> PostgreSQL'de referans butunlugu tetikleyicileri **basvurulan tablonun
> sahibinin** yetkisiyle kosar, yani cagiranin `DELETE` iznine **bakilmaz** —
> ama tablolar `FORCE RLS` oldugu icin **politika yine uygulanir** ve
> `app.current_tenant_id` transaction icinde **zaten SET edilmistir**.
>
> ⚠️ **BU BIR IDDIADIR, BIR OLCUM DEGIL.** Slice 1'de bir entegrasyon testi
> hesabi siler ve satirlarin gercekten gittigini **dogrular**; kapanis
> denetiminde ayni sey **gercek bir istekle** tekrarlanir (madde 8). ⚠️ Yanlis
> cikarsa cozum `GRANT DELETE` degil — o, ikinci katmani gevsetirdi — hesap
> silmenin **acik bir `DELETE FROM point_entries`** ile ayni transaction'da
> yapilmasi ve `GRANT DELETE`in **yalnizca** o yol icin verilmesidir.

#### 2.4 ⚠️ `platform/audit` DEGERLENDIRILDI ve KULLANILMIYOR — YENI bir gerekceyle

ADR-0047 §2.4 audit'i _"denetim izi, degistirilmesi BIR BASKASINI ETKILEYEN
alanlar icindir"_ diye elemisti. ⚠️ **Burada o olcut YETMEZ:** bir puan
bakiyesi **gercekten baskasini etkiler** (musterinin hakkidir) ve ADR-0043'un
denetledigi "ucret" alaniyla ayni sinifta gorunur.

**Elemeyi yapan sey ADR-0041'in olcutudur:**

> ⚠️ **DEGISTIRILEMEZLIK, DENETIM IZINDEN UCUZDUR.** Bir denetim izi
> _"kim degistirdi"_ sorusuna cevap verir; burada ⚠️ **degistirme diye bir
> islem YOKTUR**. Defter ekleme-yalnizdir, bakiye ondan turetilir — yani
> her satirin `created_by_user_id` damgasi **bakiyenin tam gecmisidir**.

⚠️ **VE BU, PROJEDE ILK KEZ SATIR ICI DAMGANIN BIR DENETIM IZINDEN ZAYIF
OLMADIGI YERDIR.** ADR-0041 ve ADR-0047 damgayi kullanirken acikca
_"bu bir denetim izi degildir: son durumu soyler, ne oldugunu SIRASIYLA
anlatmaz"_ yaziyordu. Ekleme-yalniz bir defterde ⚠️ **damganin kendisi
siradir**.

⚠️ **Acikta kalan TEK durum ve kaydediliyor:** **hesap silinirse** defter de
gider ve _"kim sildi"_ sorulamaz. `platform.audit_log` bugun **alan adi**
saklar, bir **silme olayi** degil — yani bu bosluk mevcut araca bir satir
eklemekle kapanmaz, aracin **seklini** degistirmek gerekir. ⚠️ Faz 6'nin KVKK
denetiminin girdisidir (§ Bilinen sinirlar).

---

### 3. ⚠️ SIFIR katkici — uc aday, dort test

#### 3.1 ANLAMSAL katkici YOK — `note` bir ETIKETTIR

Modulun tek serbest metni `point_entries.note`tur ("Eylul alisverisi",
"Dogum gunu hediyesi", "Bedava kahve"). ⚠️ **Embed EDILMEZ** ve gerekce
ADR-0034 §6.1'in **havuz kirlenmesi** kuralidir — **dorduncu** kez:

> Yuzlerce kayitta tekrar eden _"Alisveris puani / Alisveris puani / Alisveris
> puani"_, `Ocak kirasi / Subat kirasi`nin **birebir ayni seklidir**: neredeyse
> ozdes kisa vektorler K=8'lik havuzu kirletir ve **on anlamsal kaynagin** en
> iyi parcalarini disari iter.

⚠️ ADR-0037 §3'un chunk olcutu burada **hic sorulmuyor** — vektor yok, chunk
sorusu da yok.

⚠️ **Musteriye ait anlatisal not `crm.contacts`in isidir**, bu modulun degil.
Buraya bir "musteri notu" alani koymak, musteri hakkindaki bilginin
**ikinci bir doğruluk kaynagini** acardi.

#### 3.2 ⚠️ ADR-0036 / ADR-0042 / ADR-0050 ESIK KONTROLU — dort soru (SABIT MADDE)

CLAUDE.md'nin kalici dersi geregi bu madde **atlanmaz** ve cevap "hayir" olsa
bile yazilir.

| #   | Soru                                                                  | Cevap                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Bu modul **yapisal** bir katkici ekliyor mu?                          | ⚠️ **HAYIR** — ve _"bakildi ve yoktu"_ (ADR-0040'in cumlesi): **uc aday** degerlendirildi, ucu de dustu (§3.3)                                                                              |
| 2   | Satir donduren yapisal kaynak sayisi kaca cikiyor?                    | ⚠️ **8'DE KALIYOR.** Bugunku sayi **olculdu**: kayitli 8, ADR-0050'nin dort sorulu olcumunde satir donduren de **8**                                                                        |
| 3   | ADR-0042 §3'un **T2** esigini (`2K/3` — `K=8` icin **6**) geciyor mu? | ⚠️ **ZATEN GECIYOR (8 > 6) ve bu modul onu DEGISTIRMIYOR.** ADR-0050 §Karar 4: T2'nin ateslemesi artik _"bu ADR'yi oku ve degisen bir sey var mi bak"_ demektir — ⚠️ **okundu, yok**        |
| 4   | Geciyorsa ne yapilir?                                                 | ⚠️ **Bu ADR bir PLATFORM karari VERMIYOR.** Katkici eklenmediginden ADR-0050'nin butun aritmetigi **aynen gecerlidir**; taban, `K` ve rerank **yeniden tartisilmadi** (ADR-0050 §Sonuclari) |

⚠️ **ADR-0042'nin UCUNCU tetikleyicisi de kontrol edildi** (_"anlamsal tarafta
sifir alan kaynak sayisi besi gectiginde"_): bu modul **anlamsal kaynak da
eklemiyor**, yani o sayac da **10'da** kaliyor.

#### 3.3 ⚠️ UC ADAY — dort test

> **Dort test:** ① haber mi, sayim mi (ADR-0043) · ② fiil mi, katalog mu
> (ADR-0040 §3) · ③ seyrek mi (ADR-0043 §5.2) · ④ ayni haberi zaten anlamsal
> katkici tasiyor mu (ADR-0045 §3.2).

**Aday 1: `loyalty-expiry`** _("puani yakinda sona erecek musteri")_ —
⚠️ **EN GUCLU ADAY, VE TESTLERE HIC GIREMIYOR.**

⚠️ **Reddedilmiyor — TANIMLANAMIYOR.** v1'de **puan sona ermesi diye bir
kavram yoktur** (§10): `expires_at` kolonu yok, sure yok, yakma mekanizmasi
yok. Hesaplanacak girdi olmadan bir "sona eriyor" katkicisi,
⚠️ **olmayan bir veriden uydurma bir yargi** uretirdi — ADR-0040 Aday 1
(_"tedarikci performansi"_) ve ADR-0047 Aday 1 (_"kampanya performansi"_) ile
**birebir ayni gerekce**, ucuncu kez.

> ⚠️ **AMA BU ADAY OLDUGU GIBI DURUYOR VE TETIKLEYICISI YAZILI:** puan sona
> ermesi eklendigi gun aday **dort testi de gecer** — ① haberdir (tarihli,
> aciliyetli, eyleme donuk), ② bir fiildir (yakma tarihi bir olaydir),
> ③ seyrektir (yalnizca pencereye giren hesaplar), ④ ortusme kumesi **bostur**
> (bu modulun hicbir anlamsal sesi yok). ⚠️ **O gun karar YENIDEN VERILIR**
> (§ Bu karar ne zaman yeniden gozden gecirilir).

**Aday 2: `loyalty-dormant`** _("bakiyesi var ama uzun suredir hareket yok")_ —
⚠️ **REDDEDILDI, IKI TESTTEN DUSEREK.**

| #   | Olcut                            | Sonuc                                                                                                                                                                                                                                       |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Haber mi, sayim mi?              | ⚠️ **KISMEN gecer** — _"Ayse'nin 450 puani var, 7 aydir ugramadi"_ eyleme donuktur                                                                                                                                                          |
| 2   | Fiil mi, katalog mu?             | ⚠️ **DUSUYOR.** Durgunluk bir fiil **degil**, bir fiilin **YOKLUGUDUR**. ADR-0040 §3 tam olarak bu sekli reddetti: _"yilda bir calisilan tedarikci 364 gun durgun gorunur ve bir TABAN YUVASI ISGAL EDERDI"_                                |
| 3   | Seyrek mi?                       | ⚠️ **SERT DUSUYOR — ve bu belirleyici.** Bir sadakat programinda **cogunluk zaten durgundur**: musteri puanini biriktirir ve aylarca gelmez. Yani kaynak **her cagrida satir dondururdu** — ⚠️ "kosullu sessiz" degil, **kosulsuz konusan** |
| 4   | Ayni haberi anlamsal tasiyor mu? | ✅ Gecer (bu modulun anlamsal sesi yok) — ⚠️ ama **bedava gecer**, bir liyakat degil                                                                                                                                                        |

⚠️ **UCUNCU TESTIN AGIRLIGI OLCULMUS BIR ZEMINE DAYANIYOR:** ADR-0047 §3.4
_"kosullu sessiz"_ olmayi bir **tasarim erdemi** olarak kaydetti
(_"yeni yapisal katkicilar, saglikli durumda konusmayacak sekilde
tasarlanirsa havuz daha az kalabalik olur"_). `loyalty-dormant` bunun **tam
tersidir**: doygun bir havuza (ADR-0050 §Karar 1: 18 kaynak, 8 yuva, yapisal
tarafta **tam 3**) **her zaman konusan** dokuzuncu bir yapisal ses eklerdi.

**Aday 3: `loyalty-balance`** _("dolasimdaki toplam puan" / "en yuksek bakiyeli
musteriler")_ — ⚠️ **REDDEDILDI, BIRINCI TESTTEN.**

Bir **SAYIM**dir, bir haber degil. ADR-0043'un reddettigi _"12 aktif calisan"_
ve ADR-0047'nin reddettigi _"3 aktif kampanya"_ ile ayni sinif. ⚠️ **Bir
siralama da haber degildir**: "en yuksek bakiyeli bes musteri" her cagrida
ayni bes ismi doner ve hicbir seyi **degistirmez**.

⚠️ Bu rakam ekranda **vardir ve orasi dogru yerdir** (§9.1) — bir kahraman
rakam bir **gostergedir**, `POST /ask` havuzunda bir yuva hak eden bir **haber**
degil.

#### 3.4 ⚠️ EN DERIN BULGU: BU MODULDE BIR ALARMIN GIRDISI YOKTUR

Uc adayi tek tek elemek dogru ama eksik bir anlatidir. ⚠️ **Ortak sebep tek
bir cumleyle yazilabilir ve bu ADR'nin en tasinabilir ciktisidir:**

> ⚠️ **Bu projedeki her yapisal alarm ya KULLANICININ BEYAN ETTIGI BIR ESIGE ya
> da BIR TARIHE dayanir.**
>
> | Katkici                 | Alarmin girdisi                     |
> | ----------------------- | ----------------------------------- |
> | `inventory-stock`       | Kalemin **esigi** (kullanici girer) |
> | `crm-pipeline`          | Takip **tarihi**                    |
> | `project-status`        | Teslim **tarihi**                   |
> | `finance-cashflow`      | Donem **tarihi**                    |
> | `appointment-schedule`  | Randevu **tarihi**                  |
> | `invoicing-pipeline`    | Belge **tarihi** / durum            |
> | `campaign-gap`          | Bitis **tarihi** + notun yoklugu    |
> | `feedback-satisfaction` | Puan **bandi** (sabit olcek)        |
>
> ⚠️ **Sadakat v1'de IKISI DE YOKTUR:** puan sona erme **tarihi** kapsam disi,
> odul **esigi** kapsam disi. Yani eksik olan sey bir katkici degil, bir
> katkicinin **besleyecegi girdi**dir.

⚠️ **Bu, bir eksigin ITIRAFIDIR ve bir mazeret degildir:** modulun kapsami
oyle cizildi ki geriye AI'a soylenecek bir sey kalmadi. ⚠️ Kapsami genisletmek
(§10.1'in kademesi, §10'un sona ermesi) yalnizca bir ozellik eklemez —
⚠️ **modulun kurumsal hafizaya katilmasini da saglar**, ve bu, oncelik
tartismasinin girdisidir.

#### 3.5 ⚠️ Bunun DURUST BEDELI

- ⚠️ **_"Hangi musterimin puani var"_, _"kac puan dagittik"_, _"kim odul
  aldi"_ sorulari `POST /ask`ten SORULAMAZ.** Hicbiri.
- ⚠️ **Modulun tek hafiza katkisi DOLAYLIDIR:** bir kampanya notunda
  _"sadakat puanlarini iki katina cikardik"_ yaziyorsa o cumle
  `campaign-notes` uzerinden havuza girer — ⚠️ ama o, **Kampanya'nin sesidir**,
  bu modulun degil.
- ⚠️ **Fan-out **18'de kalir** ve bu Faz 5'te ikinci kez oluyor** (IK'dan
  sonra). Iki sifirin gerekceleri **ayni degildir** ve karistirilmamalidir.

#### 3.6 ⚠️ NE OLCULDU, NE OLCULEMEDI — ve neden

⚠️ **Bu ADR bir sey olcmeden yazilmadi.** Ama olculenin ne oldugu ve
**ne olmadigi** acikca ayriliyor:

| Ne                                                  | Durum                                                                                                                                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ **Bugunku katkici nufusu**                       | ⚠️ **KODLA SAYILDI** (bu ADR yazilirken): `apps/api/src/modules/**/*.contributor.ts` → **18 dosya = 10 anlamsal + 8 yapisal**. ADR-0050'nin tabanini **bagimsiz teyit eder** |
| ✅ **Bir dokuzuncu yapisal kaynagin havuza etkisi** | ⚠️ **ADR-0050'nin BUGUN alinmis olcumunden okunuyor**: yapisal pay dort soruda da **tam 3/8**, kapsama %37,5 → **%33**e duserdi                                              |
| ✅ **Seed betiginde sadakat verisi var mi**         | ⚠️ **YOK** (`grep loyalty` → 0) — ve olamaz da: sema yok                                                                                                                     |
| ❌ ⚠️ **Bir sadakat katkicisinin GERCEK dagilimi**  | ⚠️ **OLCULEMEZ — ve bu bir atlama DEGIL, bir SIRA sorunudur** (asagida)                                                                                                      |

> ⚠️ **NEDEN OLCULEMEZ:** ADR-0048'in araci bir tenant'i **var olan semalara**
> tohumlar. `loyalty` semasi **henuz yoktur**, dolayisiyla tohumlanacak satir
> da, cagirilacak katkici da, okunacak `retrieval.select` satiri da yoktur.
> ⚠️ **Betigi "genisletmek" bu sirayi degistirmez** — genisletilecek bir hedef
> tablo yok.
>
> ⚠️ **Ve olculebilseydi bile karari DEGISTIRMEZDI:** §3.3'un uc reddi de
> **dagilim** verisine degil, adayin **kendi seklinE** dayaniyor (girdi yok ·
> fiil degil · seyrek degil). ⚠️ ADR-0050'nin ayrimi burada birebir gecerlidir:
> elimizdeki sey **dagilim** verisidir, **kalite** verisi degil — ve bir adayin
> _"hak edip etmedigi"_ bir kalite sorusudur.
>
> ⚠️ **Kapanis denetiminde ne olculecek (madde 9):** katkici eklenmedigi icin
> olcum **ADR-0050'nin ayni protokolunun tekrari** olur ve beklenen sonuc
> **degisiklik yoktur** — 18 katkici, 8 yapisal, yapisal pay 3. ⚠️ Beklenenden
> **sapma cikarsa** bu, bu modulun degil **baska bir seyin** kusurudur ve
> denetim onu oyle kaydeder.

---

### 4. ⚠️ BAKIYE NEGATIFE DUSEMEZ — ve bunun VERITABANI GARANTISI YOKTUR

#### 4.1 Bakiye TURETILIR — `balance` kolonu YOKTUR

```sql
COALESCE(SUM(CASE WHEN direction = 'earn' THEN points ELSE -points END), 0)
```

Projede **on dorduncu** kez ayni karar (`quantity_on_hand`in reddi ·
`finance.balances`in reddi · `last_activity_at`in reddi · `ends_at`in reddi ·
`embedding_stale_at`in reddi …) ve gerekce yine **hatanin seklidir**:

| Secim                | Yanlis oldugunda                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **`balance` kolonu** | ⚠️ Guncellemeyi unutan bir yol **SESSIZ ve MAKUL GORUNEN** yanlis bir bakiye uretir; musteri odul alamaz ve kimse nedenini bilmez |
| ⚠️ **Turetme**       | En kotu bozulma **YAVASLIKTIR** — olculebilir ve kendini soyler                                                                   |

⚠️ **Maliyet ADR-0039'da OLCULDU ve emsal olarak devraliniyor:** 5000 hareketli
bir defterde miktar sorgusu **4–5 ms**; darbogaz `LLMPort.complete` (~4,5 s)
yaninda **gorunmez**. ⚠️ Bir sadakat defteri hesap basina Stok'un kalem basina
defterinden **daha kucuktur** (bir musteri yilda onlarca satir yazar, bir
depo kalemi binlerce). Yine de kapanis denetiminde **teyit edilir** (madde 7).

#### 4.2 ⚠️ ISTEMCI HESAPLAMAZ — ADR-0039'un fiziksel sayim karari

Kullanici **kac puan harcanacagini** yazar; **yeterli olup olmadigina sunucu
karar verir**. ⚠️ Istemciye hesaplatmak **yasaktir** ve gerekce ADR-0039 §3.2
ile birebir aynidir: istemcinin okudugu bakiye ile istegin vardigi an arasinda
bir satir girerse kontrol **yanlis** olur ve hata **sessizdir**.

#### 4.3 ⚠️ KILIT — ve HANGI DEGISMEZI koruduğu

```
1. hesap satirini kilitle          (SELECT ... FOR UPDATE)
2. bakiyeyi defterden TURET        (SUM)
3. spend ise: points <= bakiye ?   (degilse 422, HICBIR SATIR YAZILMAZ)
4. satiri yaz                      (INSERT)
```

⚠️ **BU KILIT, STOK'UNKINDEN DAHA AGIR BIR IS YAPIYOR — VE FARK KAYDA
GECMELIDIR:**

|                 | Stok (ADR-0039)                             | ⚠️ **Sadakat**                                                           |
| --------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| Negatif deger   | ⚠️ **SERBEST** — kayit tutulur, engellenmez | ⚠️ **YASAK**                                                             |
| Kilidin isi     | Sayim **delta**sini dogru hesaplamak        | ⚠️ **Bir DEGISMEZI korumak**                                             |
| Kilit atlanirsa | Sayim yanlis olur                           | ⚠️ **Iki es zamanli harcama 500 puanlik bakiyeden 600 puan cikarabilir** |

> ⚠️ **HAREKET YAZAN HER YOL kilidi alir** — `earn` dahil. Aritmetik olarak
> `earn` kilide **ihtiyac duymaz** (bakiyeyi yalnizca buyutur, yani es zamanli
> bir `spend`in kontrolu **muhafazakar** kalir). Yine de tek yol tutuluyor,
> cunku ADR-0039'un yazili dersi budur: ⚠️ _"bir yol atlarsa kilit DEKORATIF
> hale gelir."_ Iki yollu bir tasarim, bir gun ucuncu bir yol eklendiginde
> hangisinin kilit gerektirdigini **hatirlamaya** guvenirdi.

⚠️ **Kilit altinda AG CAGRISI YOKTUR** (embedding yok, LLM yok) — Stok'un ayni
kaydi, ve burada **kosulsuz dogrudur**: modulde hicbir saglayici cagrisi yok.

#### 4.4 ⚠️ DURUST OLAN: DEGISMEZIN VERITABANI GARANTISI YOKTUR

⚠️ **Bu, projede ilk kez karsilasilan bir sekildir ve gizlenmiyor.**

| Koruma turu                        | Bu degismez icin gecerli mi                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CHECK` kisiti                     | ⚠️ **HAYIR** — `CHECK` bir satiri gorur; bakiye **satirlar arasi** bir toplamdir                                                                                         |
| FK / `RESTRICT`                    | ⚠️ **HAYIR** — ilgisiz                                                                                                                                                   |
| Trigger                            | ⚠️ **Teknik olarak mumkun**, ama her `INSERT`te tam bir `SUM` kosardi ve kilidi **veritabanina gizlerdi** (ADR-0041'in trigger'inin aksine: o **sabit bir kolonu** okur) |
| ⚠️ **Tek kod yolu + satir kilidi** | ✅ **TEK DAYANAK**                                                                                                                                                       |

⚠️ **`balance` kolonu + `CHECK (balance >= 0)` degerlendirildi ve
REDDEDILDI** — ve takas acikca yazildi:

| Secim                  | Kazanc                         | ⚠️ Bedel                                                                                               |
| ---------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Kolon + `CHECK`        | Veritabani seviyesinde garanti | ⚠️ Kolon defterden **kayabilir** ve o hata **SESSIZDIR** — projenin en cok kactigi sey                 |
| ⚠️ **Turetme + kilit** | Kolon kaymasi **imkansiz**     | ⚠️ Garanti **kod yolunda** yasar; atlanirsa bakiye negatife duser — ⚠️ **ama bu GORUNURDUR** (ekranda) |

> ⚠️ **Kararin ozu yine ayni:** gurultulu bir yanlislik, sessiz bir yanlisliktan
> iyidir. ⚠️ **Ve bu bir gerekce degil bir SINIRDIR:** kilit yolu bir gun
> atlanirsa negatif bir bakiye **olusabilir**. ⚠️ Bu yuzden Slice 1'de bir
> **es zamanlilik entegrasyon testi** yazilir (iki paralel transaction, ayni
> hesap, toplami bakiyeyi asan iki harcama → biri **422**) ve kapanis
> denetiminde **canli** tekrarlanir (madde 6).

---

### 5. Izinler — IKI kaynak, ve `create`/`write` ayrimi UCUNCU kez

ADR-0025'in `resource:action` modeli, **onucuncu** kez.

| Permission                |               owner                | admin | member | viewer |
| ------------------------- | :--------------------------------: | :---: | :----: | :----: |
| `loyalty_account:read`    |                 ✅                 |  ✅   |   ✅   |   ✅   |
| `loyalty_account:create`  |                 ✅                 |  ✅   |   ✅   |   ❌   |
| `loyalty_account:delete`  |                 ✅                 |  ✅   |   ❌   |   ❌   |
| `loyalty_point:read`      |                 ✅                 |  ✅   |   ✅   |   ✅   |
| `loyalty_point:create`    |                 ✅                 |  ✅   |   ✅   |   ❌   |
| ⚠️ `loyalty_point:delete` | ⚠️ **DIYE BIR IZIN YOKTUR** (§2.3) |

#### 5.1 ⚠️ `create`, `write` DEGIL — ve bu ADR-0047'nin kuralinin UYGULANMASIDIR

ADR-0047 §5 ayrimi kurala baglamisti:

| Ad       | Anlami                  | Ornekler                                                                       |
| -------- | ----------------------- | ------------------------------------------------------------------------------ |
| `create` | ⚠️ **yalnizca olustur** | `feedback:create` · `interaction:create` · `note:create` · `commentary:create` |
| `write`  | olustur **VE guncelle** | `employee:write` · `supplier:write` · `campaign:write`                         |

⚠️ Bu modulde **guncellenebilir hicbir sey yoktur** (§2.2) → **`create`**.

> ⚠️ **BIR TUTARSIZLIK GORULDU VE BILEREK DUZELTILMEDI:**
> `stock_movement:write` de ekleme-yalniz bir defterin iznidir ve **kurala
> gore `create` olmaliydi** — ama o ad ADR-0039'da, kural ADR-0047'de
> yazildi. ⚠️ **Degistirmek bir breaking change'dir** ve bu isin kapsaminda
> **degildir** (Mutlak Kural 1/2). ⚠️ Kayda geciyor cunku kurali okuyup
> `stock_movement:write`i goren biri, kuralin **gecersiz** oldugunu
> sanabilir — gecersiz degil, **o ad kuraldan eskidir**.

#### 5.2 ⚠️ KATALOG GENIS — ve olcut ADR-0034'unkinden GECIYOR

_"Sadakat PAYLASILAN bir is gercegidir."_ Kasadaki bir `member`, musterinin
kac puani oldugunu **bilmek ve harcatmak zorundadir**; dar bir katalog modulu
**kullanmasi gereken herkese** kapatirdi (ADR-0034 §7'nin olcutu, **onikinci**
kez).

⚠️ **Finans'in ve IK'nin dar kataloglariyla ayni sinifta DEGILDIR:** bir puan
bakiyesi ucret degildir, kisisel gecmis degildir ve maliyet bilgisi tasimaz —
⚠️ **puanin para karsiligi bu modulde YOKTUR** (§10).

⚠️ **`delete` DAR:** bir hesabi silmek defteri de goturur ve **geri
alinamaz** — _"gunluk is degil, bir yonetim islemidir"_ (ADR-0043 · ADR-0045 ·
ADR-0047'nin ayni olcutu, dorduncu kez).

#### 5.3 ⚠️ AD CAKISMASI TARANDI — ve niteleme GEREKLI CIKTI

Katalog tarandi (`grep` ile **72** izin dizesi): `loyalty`, `loyalty_account`,
`loyalty_point`, `point`, `reward`, `tier` — **hicbiriyle** cakisma yok.

⚠️ **Yine de nitelenmis adlar secildi ve gerekcesi ADR-0039'un `stock_item`
karariyla aynidir — ONGORU:**

| Cıplak ad | ⚠️ Risk                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `account` | ⚠️ **Faz 6 FATURALAMA'dir** (ROADMAP §4) ve _"hesap"_ orada **kacinilmaz** bir kavramdir (abonelik hesabi / faturalama hesabi) — cakisirdi |
| `point`   | Genel bir kelime; ileride bir "puanlama" (skor) kavramiyla karisirdi                                                                       |

⚠️ ADR-0045 §5 bu adi **ismen ongormustu** (_"11. ve 12. modullerin kavramlari
`campaign` ve `loyalty_point`tir"_) ve ongoru **tuttu**.

---

### 6. Cross-modul referans ve DAG — ⚠️ ILK ZORUNLU KENAR

#### 6.1 ⚠️ `crm_contact_id` **NOT NULL** — ve "sahte kayit" dersi TERS ISLIYOR

Bugune kadarki **bes** cross-modul isaretcisinin **besi de nullable**di ve
gerekce hep ayniydi:

| Modul                   | Isaretci           | `null` gerekcesi                     |
| ----------------------- | ------------------ | ------------------------------------ |
| Projeler (0033)         | `company_id`       | Ic proje mesrudur                    |
| Randevu (0035)          | `crm_contact_id`   | Kayitsiz musteri gelir               |
| IK (0043)               | `platform_user_id` | Depo gorevlisinin hesabi yoktur      |
| Geri Bildirim (0045)    | `crm_contact_id`   | Anonim geri bildirim gercektir       |
| Kampanya (0047)         | `crm_company_id`   | Kampanyalarin cogu bir kitleye gider |
| ⚠️ **Sadakat (bu ADR)** | `crm_contact_id`   | ⚠️ **YOK — ZORUNLU**                 |

⚠️ **Zorunlulugun gerekcesi, kaydin TANIMIDIR:** bir sadakat hesabi
**bir musterinin hesabidir**. Musterisi olmayan bir bakiye, musteri geldiginde
⚠️ **BULUNAMAZ** — ve bulunamayan bir bakiye harcanamaz, yani modulun var olus
sebebi ortadan kalkar.

> ⚠️ **VE ASIL ARGUMAN: "SAHTE KAYIT" DERSI BURADA TERS ISLIYOR.**
>
> Yukaridaki bes kararin ortak korkusu suydu: _"zorunlu olsaydi kullanici
> sahte kayitlar acardi ve bedeli CRM'in musteri listesinde kalirdi"_
> (ADR-0045 §6.2 · ADR-0047 §6.2).
>
> ⚠️ **Burada acilan kayit SAHTE DEGILDIR.** Bir isletme puan verdigi kisiyi
> **zaten tanimak zorundadir** (adiyla, telefonuyla) — yoksa musteri geri
> geldiginde puanini bulamaz. ⚠️ Yani zorunluluk **uydurma veri uretmez**,
> tam tersine **gercek musteri kaydi uretir** ve CRM'i **zenginlestirir**.
>
> ⚠️ **Alternatif olcusuldu ve daha kotu cikti:** hesaba kendi `customer_name`
> alanini koymak. Bu, musteri kimliginin **ikinci bir dogruluk kaynagini**
> acardi (projede bes kez reddedilen sey) ve ⚠️ ADR-0041'in `customer_name`
> istisnasi **burada gecerli degildir**: o alan **gonderilmis bir belgede
> DONDURULMUS** bir addi; bir sadakat hesabi ise **yasayan bir iliskidir**,
> donmus degil.

⚠️ **FK YINE YOKTUR** (Mutlak Kural 5, cross-schema FK yasak). Yani:

> ⚠️ **`NOT NULL` "bir id VAR" garantisidir, "o musteri VAR" garantisi
> DEGILDIR.** Ikisi karistirilirsa, veritabani kisitina bakan biri
> referansin **saglam** oldugunu sanir. Saglam degildir — yalnizca **dolu**dur.

#### 6.2 Yazma aninda dogrulama — ve `contact:read`in ON KOSUL olmasi

Hesap acilirken kisi **gorunur olmali**: `ContactDirectory.findNames` cagrilir
ve bulunamazsa **422** (`LoyaltyContactNotFoundError`). ⚠️ Bu, Projeler'in
`#assertCompanyVisible` deseninin **aynisidir** — tek fark, orada `null`
gecerliyken burada **kontrol kosulsuzdur**.

⚠️ **Dizin uc durumu AYIRT ETTIRMEZ** (`crm.public.ts`): kisi silinmis · baska
tenant'in · cagiran `contact:read` tasimiyor. Somut sonucu:

- ✅ **Sizinti yok** — reddin sebebinden o kisinin **var oldugu** cikarilamaz.
- ⚠️ **Ama `contact:read` TASIMAYAN bir kullanici icin hata mesaji YANILTICI
  olur:** _"kisi bulunamadi"_ der, oysa dogru cevap _"gorme yetkin yok"_tur.
  ⚠️ Bugun bu **tetiklenemez** (dort rolun dordu de `contact:read` tasir) —
  yani projede **onbirinci** kez _"kapi var, tetikci yok"_. ⚠️ Bir gun dar bir
  rol tanimlanirsa, bu modul o senaryonun **ilk kurbanidir** ve mesaj
  yaniltici kalir.

⚠️ **Bu dizinin acilmasi GEREKMEZ:** `ContactDirectory`yi Randevu yazdi
(ADR-0035 §4), Geri Bildirim kullandi (ADR-0045). ⚠️ **`crm.public.ts` tek
satir degismez** — ADR-0037 §4.1'in kurali (_"yeni TALIP → dosya degismez"_)
**besinci** kez talip tarafindan dogrulaniyor ve bu, ⚠️ **cross-modul icin
ayri bir slice gerektirmedigi** anlamina gelir (dorduncu kez).

#### 6.3 DAG kaniti

Bugunku **is-modulu** kenarlari (kaynak: `*.public.ts` import'lari):

| #   | Kenar             | #   | Kenar                |
| --- | ----------------- | --- | -------------------- |
| 1   | Projeler → CRM    | 6   | Belge → Projeler     |
| 2   | Finans → CRM      | 7   | Teklif/Fatura → CRM  |
| 3   | Finans → Projeler | 8   | Geri Bildirim → CRM  |
| 4   | Randevu → CRM     | 9   | Kampanya → CRM       |
| 5   | Belge → CRM       | 10  | ⚠️ **Sadakat → CRM** |

**Kenar sayisi DOKUZDAN ONA cikar.** Dongusuzluk **iddia edilmiyor,
gosteriliyor**:

- **CRM bir KOK DUGUMDUR** — `crm/` altinda baska hicbir is modulunun
  `public.ts`ine import **yoktur** (yalnizca `platform/authz` ve
  `platform/context`; ikisi de platform).
- **Sadakat bir YAPRAKTIR** — ⚠️ `loyalty.public.ts` **ACILMAZ** (ADR-0035'in
  kurali: _talip yokken dizin yazilmaz_; ADR-0045 ve ADR-0047'nin ayni
  karari). Modulden **cikan tek kenar** CRM'edir; **giren kenar yoktur**.
- Bir yaprak dugumden bir kok dugume cikan tek yonlu kenar **dongu kuramaz**.

Katmanlar: **0** — CRM · Stok · Tedarikci · IK (kokler); **1** — Projeler;
**2** — Finans · Randevu · Belge · Teklif/Fatura · Geri Bildirim · Kampanya ·
**Sadakat**.

#### 6.4 ⚠️ FINANS'A KENAR YOK — ve bu ROADMAP'in "kademe"siyle ilgili

_"Musteri 100 TL harcadi → 10 puan"_ bir **otomatik kazandirma kuralidir** ve
girdisi Finans'tadir. ⚠️ Kenar **acilmiyor** ve gerekce ADR-0041'in Finans
kenarini reddetme gerekcesiyle **ayni sinifta**:

1. ⚠️ **YON BELIRSIZ.** _"Bu satistan kac puan dogdu"_ Sadakat'in sorusu;
   _"bu puan hangi satistan geldi"_ Finans'in sorusu. Ikisi ayni anda
   yazilirsa **dongu** olur (Tenant ↔ Identity tuzagi).
2. ⚠️ **`finance.transactions` GERCEKLESMIS NAKIT HAREKETIDIR** — bir kasa
   fisi degil. Puan kazandirmayi ona baglamak, o tablonun anlamini
   **degistirirdi**.
3. **Fiil yok.** v1'de puan **elle** yazilir; otomatik bir bag icin once
   _hangi olayin_ puan dogurdugu karara baglanmalidir (§10).

---

### 7. Exception filter — uc AI hata tipi; ⚠️ UCU DE OLU KOD

CLAUDE.md'nin kalici standardi, **onucuncu** kez: `LoyaltyDomainExceptionFilter`
`@Catch(...)` listesi — `LoyaltyDomainError` + `EmbeddingFailedError` +
`RateLimitExceededError` + `CompletionFailedError`.

| Tip                      | Tetiklenebilir mi | Not                                                 |
| ------------------------ | :---------------: | --------------------------------------------------- |
| `EmbeddingFailedError`   |   ⚠️ **HAYIR**    | Modulde embedding **yok**                           |
| `RateLimitExceededError` |   ⚠️ **HAYIR**    | Oran siniri **yok** (sayacak saglayici cagrisi yok) |
| `CompletionFailedError`  |   ⚠️ **HAYIR**    | `LLMPort` cagrisi **yok**                           |

⚠️ **UCU DE TETIKLENEMEZ — Teklif/Fatura (ADR-0041) ve IK (ADR-0043)'ten sonra
UCUNCU kez.** Kural yine de uygulaniyor ve gerekce **asimetrik bedeldir**:
simdi yazmak bir satirlik **olu koddur**; sonra unutmak, o yol ilk kez
calistigi gun **ham 500** demektir ve hata **sessizdir**.

⚠️ **`StorageFailedError` / `PdfPort` hatalari YAZILMAZ** — kapsam **AI hata
tipleridir, hepsi degil** (bu modulun bir depolama ya da PDF yuzeyi yok;
koymak olu kod degil **yaniltici** olurdu).

⚠️ **Eslenmemis domain kodunun 500'u MASKELI KALIR** ve bir test onu kilitler.

**Modul hatalari:**

| Hata                          | Kod | Ne zaman                                                 |
| ----------------------------- | :-: | -------------------------------------------------------- |
| `LoyaltyAccountNotFoundError` | 404 | Hesap yok / baska tenant'in                              |
| `LoyaltyAccountExistsError`   | 409 | ⚠️ Bu kisinin hesabi **zaten var** (§1.2)                |
| `LoyaltyContactNotFoundError` | 422 | Kisi **gorunmuyor** (§6.2)                               |
| ⚠️ `InsufficientPointsError`  | 422 | ⚠️ **Bakiye yetersiz** (§4.3) — gövde bakiyeyi **tasir** |
| `FutureEntryDateError`        | 422 | `occurredAt` gelecekte (§1.6)                            |

---

### 8. Uc noktalar

| Uc                                          | Izin                     | Not                                               |
| ------------------------------------------- | ------------------------ | ------------------------------------------------- |
| `POST /api/v1/loyalty/accounts`             | `loyalty_account:create` | `{ crmContactId }` → **201** / **409** / **422**  |
| `GET /api/v1/loyalty/accounts`              | `loyalty_account:read`   | Sayfali; bakiye + `contactName` (cozulebiliyorsa) |
| `GET /api/v1/loyalty/accounts/:id`          | `loyalty_account:read`   | Detay + bakiye                                    |
| `DELETE /api/v1/loyalty/accounts/:id`       | `loyalty_account:delete` | **204**; defter **cascade** ile gider (§2.3)      |
| `POST /api/v1/loyalty/accounts/:id/entries` | `loyalty_point:create`   | ⚠️ Kilitli yol (§4.3) — **201** / **422**         |
| `GET /api/v1/loyalty/accounts/:id/entries`  | `loyalty_point:read`     | Defter, `occurred_at DESC`, sayfali               |
| `GET /api/v1/loyalty/summary`               | `loyalty_account:read`   | Duvarin rakamlari (§9.1)                          |

⚠️ **ROTA GOLGELEMESI** (ADR-0040'in dersi): `summary` `/loyalty/` altindadir,
`/loyalty/accounts/` altinda **degil** — yani `:id` ile carpismaz. Sabit yollar
yine de `:id`den **once** tanimlanir ve kapanis denetiminde **gercek
isteklerle** sinanir (madde 12).

⚠️ **BAKIYE LISTEDE N+1 SORGU URETMEZ** ve bu bir dikkat maddesidir:
ADR-0037'nin kapanis denetimi, **projeksiyona gomulu korelasyonlu bir alt
sorgunun hata VERMEDIGINI ve her zaman 0 dondurdugunu** buldu — parcasi olan
bir belge ekranda "Aranamiyor" gorunuyordu. ⚠️ Ayni tuzak burada **daha
tehlikelidir**: sessizce `0` donen bir bakiye, musteriye _"puaniniz yok"_
demektir.

> ⚠️ **Koruma: sayfanin id'leri toplanir, TEK bir `GROUP BY` sorgusu atilir**
> (Drizzle'in sayac haritasi deseni) ve ⚠️ bir entegrasyon testi
> **SIFIRDAN FARKLI** bir bakiyenin listede dogru gorundugunu iddia eder —
> "hata vermedi" yeterli degildir.

---

### 9. Frontend: ODA — koridorda ONUCUNCU kapi

[ADR-0038](0038-oda-tasarim-sistemi.md)'in ODA sistemi, **onikinci** kez
tuketici.

**Renk:** `#9a5a84` (koyu `#d792be`) — ⚠️ `module-colors.css`te **ZATEN
`loyalty` adiyla ayrilmis** (§1.1).

> ⚠️ **MOR BAND ARTIK UC KAPI — VE BU, SETIN EN KALABALIK IKINCI BANDI.**
> `hr` (#896096) · `marketing` (#7665a6) · **`loyalty` (#9a5a84)**.
> ⚠️ `hr` ile `loyalty` **komsu hue**dur ve renk korlugu altinda
> yakinlasabilirler; kural **aynen baglayicidir**: ⚠️ **renk hicbir yerde TEK
> ayirt edici olmaz.** Uc kapi da farkli ikon, farkli etiket ("Ekip" ·
> "Kampanyalar" · **"Sadakat"**) ve `aria-current` tasir. Kapanis denetiminde
> **ucunun** ikon/etiket ayrimi acikca kontrol edilir (madde 11).

#### 9.1 ⚠️ Duvar — kahraman rakam projede ILK KEZ BIR TOPLAM

| Bolge      | Ne                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| **Duvar**  | Kahraman: ⚠️ **dolasimdaki toplam puan**. Uydular: hesap sayisi · son 30 gunde kazandirilan · son 30 gunde kullanilan |
| **Tezgah** | Liste: musteri adi (cozulebiliyorsa) · bakiye · son hareket tarihi. Detay: hesabin **defteri**                        |

⚠️ **BU RAKAM NEDEN MESRU — ve neden ADR-0034/0039'un kurallari TETIKLENMIYOR:**

| Kural                                        | Neden gecerli degil                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| ADR-0034 §5: **para birimleri toplanmaz**    | ⚠️ Puanin **para birimi yoktur**; puanin TL karsiligi bu modulde **modellenmez** (§10)         |
| ADR-0039 §4: **birimler yuzunden toplanmaz** | ⚠️ Tek bir birim vardir: **"puan"**. `kg`/`adet` ayrimi burada **yok** — birim kolonu bile yok |
| ADR-0045: **N olmadan ortalama gosterilmez** | ⚠️ Bu bir **ortalama degil**, bir toplam                                                       |

> ⚠️ **Bu rakamin ISLETME ANLAMI da vardir ve kayda deger:** dolasimdaki puan
> bir **yukumluluktur** (musterinin harcayabilecegi bir hak). ⚠️ **Ama bir
> PARA rakami degildir** ve arayuz onu para gibi bicimlendirmez — puanin
> karsiligi girilmedigi surece "12.400 puan" bir TL degeri **ifade etmez**.

⚠️ `N = 0` iken rakam yerine **bos durum** gosterilir (_"Henuz sadakat hesabi
yok"_) — ADR-0047 §9'un kurali: bos bir odada bir `0`, bir **haber gibi**
okunur.

#### 9.2 ⚠️ Adi cozulemeyen hesap — EKRANDA ACIKCA SOYLENIR

ADR-0035 · ADR-0045 · ADR-0047'de sarkan bir isaretcinin karsiligi
_"ad gosterilmez, uydurulmaz"_ idi ve **bu yeterliydi**, cunku ad bir
**suslemeydi**.

⚠️ **Burada yetmez:** adi olmayan bir sadakat hesabi **kullanilamaz** (§PO
Kalem C). Bu yuzden ekran bir adim daha atar:

- Ad `null` gelirse satir **listeden dusmez** — dusseydi bakiye **gorunmez
  olurdu** ve dolasimdaki toplam ile liste **tutmazdi**.
- ⚠️ Satir **acikca isaretlenir** (_"Musteri kaydi bulunamadi"_) ve
  ⚠️ **"silinmis" denmez** — o kelime, silinmis bir kaydin **bir zamanlar var
  oldugunu** sizdirir (ADR-0035'in yazili karari).
- Duvarin **hesap sayisi** bu satirlari **sayar** (bakiye gercek, hak gercek).

---

### 10. Kapsam disi (bugun yapilmiyor)

| Kalem                                          | Neden bugun yok                                                                                                                                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ⚠️ **Otomatik puan kazandirma kurallari**      | ⚠️ Bir **kural motorudur** ve girdisi **Finans'tadir** (§6.4) — yon belirsiz (dongu riski), `finance.transactions` gerceklesmis nakit hareketidir ve anlamini degistirirdi. **Ayri bir ADR.**                                                                                  |
| ⚠️ **Odul katalogu / redemption UI**           | ⚠️ Bir **katalog + stok + teslim** sorusudur (odul nedir, kac puan, kac adet kaldi, kim teslim etti). v1'de harcama **serbest bir sayidir** ve ne verildigi `note`ta yazar.                                                                                                    |
| ⚠️ **Kademe / tier (ROADMAP §3.5'te YAZILI)**  | ⚠️ **§10.1** — bir kural motoru, ve ayricaliklari **odul katalogunu** gerektirir. ⚠️ **ROADMAP SAPMASI** ve onayi §PO Kalem B'dedir.                                                                                                                                           |
| ⚠️ **Puan sona ermesi (expiry)**               | ⚠️ Bir **zamanlama** sorusudur: puanin yanmasi icin bir islemin **kimse istemeden** kosmasi gerekir (Queue karari). Randevu'nun hatirlatmasi · Anket'in gonderimi · Kampanya'nin gonderimiyle **ayni engel**, ⚠️ **dorduncu kez**. ⚠️ Bu, §3.3 Aday 1'in **tetikleyicisidir**. |
| ⚠️ **Puanin PARA karsiligi**                   | ⚠️ `1 puan = X TL` bir **para** kararidir ve para bu projede **Finans'ta yasar** (ADR-0047'nin `budget` gerekcesi). Buraya koymak **ikinci bir para yuzeyi** acar (para birimi sorusu — ADR-0034).                                                                             |
| **Musteriye gorunur yuzey** (kart, QR, portal) | Bir **kimlik dogrulama** sorusudur: musteri bir kullanici degildir. Ayri bir modul.                                                                                                                                                                                            |
| **Puan transferi / hediye etme**               | Iki hesap arasinda atomik bir islem + kotuye kullanim sorulari (limit, geri alma). v1'de **yok**.                                                                                                                                                                              |
| **Kampanya ↔ Sadakat bagi**                    | ⚠️ ADR-0047 §6.4'un ayni sekli: **yon belirsiz** ve `marketing.public.ts` **acilmadi** (bu bir karardi). Ayri bir ADR.                                                                                                                                                         |
| **Alan bazli izin / hesap bazli gizlilik**     | ABAC, backlog (ROADMAP §1.1)                                                                                                                                                                                                                                                   |
| **Klasik metin aramasi (FTS)**                 | ADR-0011, **onikinci** kez acik                                                                                                                                                                                                                                                |
| ⚠️ **Yapisal katkici**                         | ⚠️ §3.3 — **reddedilmedi, TANIMLANAMADI**; tetikleyicisi yazili                                                                                                                                                                                                                |

#### 10.1 ⚠️ Kademe (tier) neden v2 — ve ROADMAP'ten sapma

ROADMAP §3.5, 12. satiri _"Puan · **kademe**"_ diye yaziyor. Sapma acikca
kaydediliyor ve gerekce **uc katmanlidir**:

1. ⚠️ **Kademe bir KURAL MOTORUDUR, bir kolon degil.** Esikler tenant'a gore
   degisir (yani `finance.categories` deseninde **ikinci bir CRUD yuzeyi**),
   degerlendirme **ne zaman** kosar (her okumada mi, gecede bir mi → Queue),
   ve **dusme** politikasi ayri bir karardir (bir kez Altin olan hep Altin mi).
2. ⚠️ **AYRICALIKSIZ BIR KADEME BIR ETIKETTIR.** Kademenin var olma sebebi
   musteriye bir **fayda** vermektir (daha hizli puan, ozel odul); ikisi de
   kapsam disi (kazandirma kurali · odul katalogu). ⚠️ Yani bugun eklenirse
   modul, musteriye _"Altin uyesiniz"_ der ve **hicbir sey vermez**.
3. ⚠️ **Kademe TURETILEBILIR ve o yuzden ERTELENEBILIR.** Bakiye/kazanim
   uzerinden hesaplanir, yani ⚠️ **bugun kaydedilmeyen bir veri yoktur** —
   defter tamdir. ADR-0033'un kurali: _"sonradan eklemek mumkun, geri almak
   degil."_ ⚠️ Erteleme **hicbir veri kaybettirmiyor** ve karari **tersine
   cevrilebilir** birakiyor.

---

## Gerekce

**Neden bu modul, ROADMAP'in en kisa kapsam notuna sahip olmasina ragmen kisa
bir ADR degil.** Sema gercekten ucuz: iki tablo, sifir katkici, sifir vektor,
hazir dizin, hazir RLS sablonu, hazir izin modeli. ⚠️ Pahali olan iki sey var
ve ikisi de **ilk**: bir cross-modul isaretcisinin **zorunlu** olmasi (§6.1) ve
bir degismezin ⚠️ **veritabani garantisi olmadan** yasamasi (§4.4). Ucuncu
pahali sey ise bir **yokluktur**: modulun kurumsal hafizaya hicbir sey
katmamasi (§3) — ve o yokluk, projenin kurucu kisitiyla gerilimde oldugu icin
**gerekcelendirilmek zorundadir**, sessizce gecilemez.

**Neden yapisal katkici yok — ve neden bu "reddettik" DEGIL.** ADR-0040 uc
adayi **degerlendirip** reddetti; ADR-0047 ucunu degerlendirdi ve biri
**liyakatli** cikti. Burada durum ucuncu bir sekildir: ⚠️ en guclu aday
(`loyalty-expiry`) **degerlendirilemedi** cunku girdisi **yok**. Bu ayrim
onemlidir, cunku tetikleyicinin ne oldugunu **kesinlestirir**: bir gun "acaba
bir katkici ekleyelim mi" diye sorulmayacak — ⚠️ **puan sona ermesi (ya da bir
odul esigi) eklendigi gun aday dort testi de gecer ve karar YENIDEN VERILIR.**

**Neden T2 bu ADR'de bir gerekce olarak kullanilmadi.** ADR-0050 §Karar 4
_"her zaman atesleyen bir tetikleyici artik tetikleyici degildir"_ dedi ve
T2'nin anlamini _"bu ADR'yi oku ve degisen bir sey var mi bak"_a cevirdi.
⚠️ Okundu; degisen bir sey yok cunku bu modul havuza **dokunmuyor**. ⚠️ Uc
adayin ucu de **kendi seklinden** dustu — havuzun doygunlugundan degil.

**Neden `crm_contact_id` zorunlu.** Bes modulde ayni dersin (_"zorunluluk sahte
kayit uretir"_) tersine ciktigi ilk yer burasi: puan verilen kisi **zaten
taninmak zorundadir**, yani zorunluluk **gercek** veri uretir. ⚠️ Ve zorunlu
olmasaydi modul kimligi olmayan bakiyeler uretirdi — musteri geldiginde
bulunamayan bir bakiye, **hic olmamis bir bakiyedir**.

**Neden defter degistirilemez ama hesap silinebilir.** Olcut ADR-0039'unkidir
ve iki soru **farkli** cevap verir: bir satiri silmek bugunku bakiyeyi
**sessizce yeniden yazar** (yalan uretir); hesabi silmek bakiyeyi yeniden
yazmaz, **yok eder** (hicbir sayiyi yalanlamaz). ⚠️ Ve silme yolunun var
olmasi bir kolaylik degil bir **yukumluluktur** — hesap bir kisiye baglidir.

**Neden `balance` kolonu yok, kabul edilen bedelle birlikte.** Kolon,
veritabani seviyesinde bir garanti verirdi — ama **defterden kayabilirdi** ve
o hata **sessiz** olurdu. Turetme, garantiyi **kod yoluna** tasir ve bozulmasi
**gorunur** olur (negatif bakiye ekranda durur). ⚠️ Projede defalarca verilen
ayni tercih: **gurultulu bir yanlislik, sessiz bir yanlisliktan iyidir.**

---

## Sonuclari

**Olumlu**

- ⚠️ **Onucuncu sema iki tablo ile aciliyor**; katkici, vektor, chunk, oran
  siniri, `reindex`, `public.ts` ve cross-modul slice'i **gerekmiyor** —
  soyutlamanin **onikinci** sinavi ve en ucuz gecen.
- ⚠️ **Esik kontrolu "T2 tetiklenir" refleksi OLMADAN yapildi** — ADR-0050'nin
  §Karar 4'unun ilk uygulamasi.
- ⚠️ **Bir katkicinin reddi ilk kez bir KAPSAM kararina baglandi** (§3.4):
  eksik olan sey katkici degil, onun **girdisi**.
- ⚠️ **Cross-modul referans besinci kez talip tarafindan, SIFIR satir
  degisiklikle** dogrulaniyor — ve ilk kez **zorunlu** bir isaretciyle.
- ⚠️ **Satir ici aktor damgasi ilk kez bir denetim izinden ZAYIF DEGIL**
  (§2.4) — ekleme-yalniz defterde damga **siradir**.
- Faz 5'in **son** modulu; kapaninca ⚠️ **Faz 6 (Faturalama) kapisi acilir**
  (ROADMAP §4).

**Olumsuz / bedeli**

- ⚠️ **`POST /ask`E SIFIR KATKI** — bu modulun hicbir verisi kurumsal hafizaya
  girmez. IK'nin sifiri bir **guvenlik ozelligiydi**; bu bir **sinirdir**.
- ⚠️ **BAKIYENIN NEGATIF OLMAMASININ VERITABANI GARANTISI YOKTUR** (§4.4) —
  tek dayanak bir kod yolu ve bir satir kilidi.
- ⚠️ **SAHIBI SILINMIS BIR HESAP KULLANILAMAZ** (§9.2) — altinci sarkan
  isaretci ve **ilk kez kaydi islevsiz kilan**.
- ⚠️ **"Puanim ne ise yarar" SORULAMAZ** — odul katalogu, kademe ve puanin
  para karsiligi **hicbiri yok**. ⚠️ **Kullanicinin en cok soracagi sey budur.**
- ⚠️ **Otomatik kazandirma yok** — her puan **elle** girilir; kasada her satisin
  ardindan ikinci bir islem demektir. ⚠️ **Ikinci en cok istenecek eksik.**
- ⚠️ **RETENTION YIRMI UCTEN YIRMI DORDE cikar** — yalnizca
  `loyalty.point_entries`. ⚠️ **Ve listedeki IKINCI "silmek gecmisi degil
  BUGUNKU SAYIYI degistirir" kalemidir** (`inventory.movements`ten sonra) —
  saklama suresi kararinda bu iki kalem **ayni ozel muameleyi** gorur.
  ⚠️ `loyalty.accounts` listeye **girmez** (musteri sayisiyla artar, zamanla
  degil — `crm.contacts` gibi).
- ⚠️ **VEKTOR TASIYAN TABLO SAYISI ONDA KALIR** — Faz 5'te bu sayiyi
  artirmayan **ucuncu** modul (Teklif/Fatura · IK · Sadakat).
- **Fan-out 18'de kalir**; ADR-0042'nin ucuncu tetikleyicisi (anlamsal tarafta
  sifir alan kaynak sayisi) de **degismez**.

---

## Degerlendirilen alternatifler

| Alternatif                                                           | Neden secilmedi                                                                                                                                                                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ⚠️ **`loyalty-expiry` katkicisini eklemek**                          | §3.3 Aday 1 — ⚠️ **girdi YOK** (puan sona ermesi kapsam disi); olmayan veriden **uydurma bir yargi** uretirdi. ⚠️ **Reddedilmedi — tanimlanamadi**; tetikleyicisi yazili.                                                      |
| ⚠️ **`loyalty-dormant` katkicisini eklemek**                         | §3.3 Aday 2 — durgunluk bir **fiil degil, fiilin yoklugudur** (ADR-0040'in reddettigi sekil) ve ⚠️ **seyrek DEGILDIR**: bir sadakat programinda cogunluk durgundur, kaynak **her cagrida** konusurdu.                          |
| **`loyalty-balance` katkicisini eklemek**                            | §3.3 Aday 3 — bir **SAYIM**dir; _"12 aktif calisan"_ ve _"3 aktif kampanya"_ ile ayni sinif. Ekranda **vardir** ve orasi dogru yerdir.                                                                                         |
| ⚠️ **Anlamsal katkici (`note`u embed etmek)**                        | §3.1 — _"Alisveris puani"_ yuzlerce kez tekrar eder; `Ocak kirasi / Subat kirasi` kirlenmesi (**dorduncu** kez).                                                                                                               |
| ⚠️ **`balance` kolonu + `CHECK (balance >= 0)`**                     | ⚠️ §4.4 — **en cazip alternatif**: tek gercek veritabani garantisi. Reddedildi cunku kolon defterden **kayabilir** ve o hata **SESSIZDIR**; turetmenin bozulmasi ise **gorunur**. ⚠️ On dorduncu kez ayni karar.               |
| **Negatif bakiyeye izin vermek** (Stok'un karari)                    | §4 — Stok'ta negatif stok **gercek bir durumdur** (mal fiziksel olarak eksik cikar); negatif puan **gercek degildir**: verilmemis bir hakki harcamak demektir ve isletme onu **karsilamak zorunda kalirdi**.                   |
| ⚠️ **Bakiye kontrolunu istemciye birakmak**                          | §4.2 — istemcinin okudugu bakiye ile istegin vardigi an arasinda bir satir girerse kontrol **yanlis** olur ve hata **sessizdir** (ADR-0039'un fiziksel sayim karari).                                                          |
| ⚠️ **Tek bir puan satirini silinebilir/duzeltilebilir yapmak**       | §2.1 — bakiyeyi **sessizce yeniden yazar**. Duzeltme **ters yonde bir satirdir** (ADR-0041'in iskonto karari).                                                                                                                 |
| **Hesap silmeyi `RESTRICT` ile engellemek** (Stok'un ucuncu katmani) | ⚠️ §2.1 — hareketi olan her hesap **silinemez** olurdu ve silinemeyen bir kisisel veri kaydi bir **uyum ihlalidir** (KVKK m.7/m.11).                                                                                           |
| ⚠️ **`is_correction` kolonu eklemek** (ADR-0039'un deseni)           | §1.4 — Stok'ta bayragi **sistem** koyuyordu (`recordCount` yolu); burada her satiri insan yaziyor ve bayrak **kullanicinin kendi hatasi hakkindaki beyanina** dayanirdi. ⚠️ Bedeli yazildi: "bu bir duzeltmeydi" sorgulanamaz. |
| ⚠️ **`crm_contact_id`yi NULLABLE yapmak** (bes modulun karari)       | ⚠️ §6.1 — kimligi olmayan bir bakiye **bulunamaz**, yani harcanamaz. ⚠️ "Sahte kayit" dersi burada **ters isler**: zorunluluk gercek CRM kaydi uretir.                                                                         |
| ⚠️ **Hesaba `customer_name` kolonu koymak** (ADR-0041'in deseni)     | ⚠️ §6.1 — ADR-0041'in istisnasi **gonderilmis, DONDURULMUS** bir belge icindi. Bir sadakat hesabi **yasayan bir iliskidir**; ad kopyalanirsa yeniden adlandirmada **bayatlar** ve musteri kimliginin ikinci kaynagi olurdu.    |
| **Hesabi ilk puanda OTOMATIK acmak** (upsert)                        | Kolayligin bedeli: yanlis yazilmis bir `contactId` **hayalet bir hesap** yaratirdi ve `POST /entries` sessizce **ikinci bir kaynak** olustururdu. Hesap **acikca** acilir (Stok'un "once kalem, sonra hareket" deseni).        |
| ⚠️ **`UNIQUE(tenant_id, crm_contact_id)` KOYMAMAK**                  | §1.2 — ikinci bir hesap bakiyeyi **ikiye boler** ve hata **sessizdir** (ADR-0039'un `ABC-1`/`abc-1` tuzagi). ⚠️ ADR-0047'nin `UNIQUE(name)` reddinin **tam tersi** — orada tekrar gercekti, burada degil.                      |
| **`points`i `numeric` yapmak**                                       | §1.5 — puan **sayilir**, olculmez; kesirli puan bir yuvarlama sorusu acar ve o soru v2'nindir.                                                                                                                                 |
| **`points`e ust sinir koymak**                                       | §1.5 — **icat edilmis bir sayi** olurdu; tipo hatasi **gorunurdur** ve telafi bir ters satirdir.                                                                                                                               |
| ⚠️ **Kademe (tier) sistemini v1'e koymak** (ROADMAP'in kapsam notu)  | ⚠️ §10.1 — bir **kural motorudur** ve ayricaliklari **odul katalogunu** gerektirir; ayricaliksiz kademe bir **etikettir**. ⚠️ **Turetilebilir oldugu icin ertelemek hicbir veri kaybettirmez.**                                |
| **Otomatik kazandirma kurallarini v1'e koymak**                      | §6.4 · §10 — girdisi **Finans'tadir**, yon belirsizdir (**dongu riski**) ve `finance.transactions`in anlamini degistirirdi.                                                                                                    |
| ⚠️ **`platform/audit`i bu modulde kullanmak**                        | §2.4 — **degistirme diye bir islem yok**; ekleme-yalniz bir defterde satir ici damga **siradir**. ⚠️ Acikta kalan tek durum (hesap silme) aracin **seklini** degistirmeyi gerektirir, bir satir eklemeyi degil.                |
| **`loyalty.public.ts` acmak**                                        | §6.3 — **talip yokken dizin yazilmaz**; acilmamasi DAG kanitini **mekanik** kiliyor (ADR-0045 · ADR-0047'nin ayni karari).                                                                                                     |
| ⚠️ **`point_entries`e `GRANT DELETE` vermek**                        | §2.3 — ucuncu katmani gevsetirdi. ⚠️ Cascade'in calistigi **iddia edilmiyor, testle kanitlaniyor**; calismazsa cozum acik bir `DELETE` yolu ve **yalnizca ona** verilen bir yetkidir.                                          |
| **Izin adlarini ciplak birakmak** (`account`, `point`)               | §5.3 — ⚠️ **Faz 6 FATURALAMA'dir** ve _"hesap"_ orada kacinilmazdir; ADR-0039'un `stock_item` ongorusunun ayni sekli.                                                                                                          |
| **`loyalty_account:write`** (`create` yerine)                        | §5.1 — guncellenebilir alan **yok**; ADR-0047 §5'in kurali `write`i "olustur VE guncelle" diye tanimladi.                                                                                                                      |

---

## Bilinen sinirlar

- ⚠️ **`POST /ask`E SIFIR KATKI** — _"hangi musterimin puani var"_,
  _"bu ay kac puan dagittik"_ sorulari **sorulamaz**. Modul kurumsal hafizaya
  v1'de **katilmaz** (§3).
- ⚠️ **BAKIYENIN NEGATIF OLAMAMASI BIR VERITABANI KISITI DEGILDIR** — tek
  dayanak `SELECT ... FOR UPDATE` ile korunan **tek bir kod yolu** (§4.4).
  ⚠️ Bir gun ikinci bir yazma yolu eklenirse ve kilidi almazsa, degismez
  **sessizce** delinir; koruma bir **es zamanlilik testidir**.
- ⚠️ **SAHIBI SILINMIS HESAP KULLANILAMAZ** — altinci sarkan isaretci ve
  ⚠️ **ilk kez kaydi islevsiz kilan**. CRM hala domain event yayinlamiyor;
  ⚠️ bu ADR o borcun **onceligini yukseltir** ama **kapatmaz** (Mutlak Kural 1).
- ⚠️ **PUANIN PARA KARSILIGI YOKTUR** — "12.400 puan" bir TL degeri ifade
  etmez; dolasimdaki toplam bir **yukumluluk gostergesidir**, bir mali rakam
  degil.
- ⚠️ **ODUL KATALOGU YOK** — harcama **serbest bir sayidir**; ne verildigi
  yalnizca `note`ta yazar ve **sorgulanamaz**.
- ⚠️ **KADEME YOK** (ROADMAP §3.5 kapsam notundan sapma, §10.1) —
  ⚠️ **turetilebilir oldugu icin hicbir veri kaybi yoktur.**
- ⚠️ **PUAN SONA ERMEZ** — bakiye sonsuza kadar durur; bir isletme icin bu
  bir **yukumluluk birikimidir**. ⚠️ Queue karari (Randevu · Anket · Kampanya
  ile **ayni engel**, dorduncu kez).
- ⚠️ **OTOMATIK KAZANDIRMA YOK** — her puan elle girilir.
- ⚠️ **"BU BIR DUZELTMEYDI" SORGULANAMAZ** (§1.4) — duzeltme ters yonde bir
  satirdir ve `note` disinda bir isareti yoktur; ileride "toplam kullanilan
  puan" istenirse duzeltmeler ona **karisir**.
- ⚠️ **"SU TARIHTEKI BAKIYE" SORULAMAZ** (§1.6) — turetilebilir ama bir uc
  olarak acilmadi.
- ⚠️ **HESAP SILINIRSE KIM SILDIGI SORULAMAZ** (§2.4) — `platform.audit_log`
  **alan adi** saklar, bir **silme olayi** degil. Faz 6 KVKK denetiminin
  girdisi.
- ⚠️ **`contact:read` TASIMAYAN KULLANICIYA HATA MESAJI YANILTICI** (§6.2) —
  _"kisi bulunamadi"_ der. Bugun **tetiklenemez** (dort rol de tasir).
- ⚠️ **`loyalty_account:read` TASIYAN HERKES TUM BAKIYELERI GORUR** — hesap
  bazli gizlilik ABAC'tir, backlog'ta.
- ⚠️ **BAKIYE DEFTER BUYUDUKCE YAVASLAR** — ADR-0039'un emsali (5000 satirda
  4–5 ms) devralindi; onbellege gecis yolu acik ve **tek yonlu**.
- ⚠️ **PUAN TRANSFERI YOK** · **musteriye gorunur yuzey yok** (kart/QR/portal)
  · **kampanya ↔ sadakat bagi yok**.
- **Iyimser eszamanlilik yok** — ⚠️ ama bu modulde **buyuk olcude gecersizdir**:
  hesabin guncellenebilir alani yok, defter degistirilemez. ⚠️ Gecerli oldugu
  tek yer harcama yaridir ve orasi **kilitle** korunuyor.
- **Arama yalnizca musteri adi uzerinden** (dizin araciligiyla) —
  ⚠️ **anlamsal arama YOK** (modulun vektoru yok) ve **FTS yok** (ADR-0011,
  **onikinci** kez).
- ⚠️ **RETENTION YIRMI UCTEN YIRMI DORDE cikar**; ⚠️ **vektor tasiyan tablo
  sayisi ONDA KALIR** — iki liste **ayrismaya devam eder** (ADR-0047'nin
  kurali).

---

## Uygulama plani (slice'lar)

| Slice | Ne                                                                                                                                                                                                                                                                                            | Migration             | Durum |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ----- |
| **0** | **ADR-0051** (bu belge) — ⚠️ **UC PO ONAYI** (A: sifir katkici · B: kademe v2'ye / ROADMAP sapmasi · C: `crm_contact_id` zorunlu)                                                                                                                                                             | —                     | ✅    |
| **1** | **Backend (TEK slice):** `loyalty` semasi + iki tablo + **FORCE RLS** + hesap CRUD (⚠️ `PATCH` **yok**) + ⚠️ **kilitli defter yazma yolu** + turetilmis bakiye (toplu `GROUP BY`) + `summary` + izin katalogu + exception filter + cross-modul dogrulama (sifir satir) + ⚠️ **SIFIR katkici** | `0039_loyalty_schema` | ✅    |
| **2** | **Frontend + HAFIF kapanis denetimi:** liste + DETAY (ODA, ortak duvar), `loyalty` rengi, koridorda **onucuncu kapi**                                                                                                                                                                         | —                     | ⏳    |

**Cross-modul slice'i YOK ve bu bir atlama degil** — degistirilecek bir
`public.ts` yok (§6.2).

⚠️ **Slice 1'de MUTLAKA yazilacak UC TEST** (her biri bir ADR maddesini
kilitler):

1. ⚠️ **Es zamanlilik:** iki paralel transaction, ayni hesap, toplami bakiyeyi
   asan iki `spend` → biri **422**, bakiye **negatife dusmedi** (§4.4).
2. ⚠️ **Cascade + GRANT:** hesap silinir, `point_entries` satirlari
   **gercekten gitti** — `businessos_app` rolunde `DELETE` yetkisi **yokken**
   (§2.3).
3. ⚠️ **Bakiye projeksiyonu:** listede **SIFIRDAN FARKLI** bir bakiye dogru
   gorunuyor — ADR-0037'nin _"korelasyonlu alt sorgu her zaman 0 dondurdu"_
   kusuru (§8).

⚠️ **YENI MIGRATION EKLEME KONTROL LISTESI (CLAUDE.md kalici dersi) — DORDU DE:**

1. `0039_loyalty_schema.sql` **ve** `.down.sql` yazilir.
2. ⚠️ `drizzle/meta/_journal.json`a giris eklenir (`idx: 39`, `when`
   **artan**, `tag` dosya adiyla birebir) — atlanirsa `db:migrate`
   **"basarili" der ve hicbir sey uygulamaz**.
3. ⚠️ `database.integration.spec`in **geri alma listesine** eklenir (en
   yeniden eskiye; ⚠️ `point_entries` **`accounts`tan ONCE**).
4. ⚠️ **YENI SEMA → `GRANT` ACIKCA DEKLARE EDILIR** (ADR-0047'nin denetiminin
   **canli olarak** yasadigi kusur; `0000_init`in `ALTER DEFAULT PRIVILEGES`i
   **yalnizca `platform`** icindir). ⚠️ **Fiil listesi bu modulun
   degistirilebilirlik kararini yansitir, kopyalanmaz:**

   ```sql
   GRANT USAGE ON SCHEMA loyalty TO businessos_app;
   GRANT SELECT, INSERT, DELETE ON loyalty.accounts      TO businessos_app;  -- ⚠️ UPDATE YOK (§2.2)
   GRANT SELECT, INSERT         ON loyalty.point_entries TO businessos_app;  -- ⚠️ UPDATE ve DELETE YOK (§2.3)
   ```

**Kanit adimi:** iki tablonun **varligini** iddia eden bir entegrasyon testi —
sayi saymak yetmez, `drizzle.__drizzle_migrations` sayaci da journal'a baglidir
ve **ayni yalani** soyler.

⚠️ **Slice 1 migration TASIR**, yani push prod'a dagitim tetikler ve
`preDeployCommand` migration uygular. **Product Owner'a push'tan once acikca
haber verilir.** Uygulanmis migration: **39 → 40**.

---

## ⚠️ Slice 1 UYGULANDI — ve IKI KARAR OLCUMLE DEGISTI (2026-08-27)

Backend yazildi (`0039_loyalty_schema`), uc zorunlu testin ucu de kosuldu ve
gecti. ⚠️ **Ama iki yazili karar, gercek bir PostgreSQL'de sinandiginda
DEGISMEK ZORUNDA KALDI.** Ikisi de asagida duruyor; eski metinler
**silinmedi** — bu bolum onlarin uzerine yaziyor.

### ✅ §2.3'un CASCADE IDDIASI — **KANITLANDI**

ADR §2.3 su cumleyi kurmus ve _"bu bir IDDIADIR, bir OLCUM DEGIL"_ diye acikca
isaretlemisti:

> _"`point_entries`e `DELETE` verilmezse, hesap silindiginde
> `ON DELETE CASCADE` calisir mi? Beklenen cevap EVET'tir."_

⚠️ **Olculdu ve DOGRU cikti.** `businessos_app` rolunun `point_entries`
uzerinde `can_delete = false` oldugu **ayni testte dogrulanmis** haldeyken hesap
silindi ve defter satirlari **gercekten gitti** (sayim `businessos_owner` ile,
RLS'siz yapildi ki uygulama rolunun goremedigi bir kalinti da yakalansin).
⚠️ Yani ADR'de yazili yedek cozume (**acik `DELETE FROM point_entries`**)
**GEREK KALMADI**.

### ⚠️ 1. DEGISEN KARAR: FK **BILESIK** oldu — RI denetimi RLS'i ATLIYOR

**Yazili olan:** `account_id uuid NOT NULL REFERENCES loyalty.accounts (id)`.

⚠️ **Olculen:** bir entegrasyon testi (_"BASKA TENANT IN hesabina hareket
YAZILAMAZ"_) **KIRMIZI YANDI** — tenant A, tenant B'nin hesabina isaret eden bir
defter satiri **yazabiliyordu**.

> ⚠️ **SEBEP — ve bu, projede ILK KEZ kayda geciyor:** PostgreSQL'de referans
> butunlugu denetimi **RLS'i ATLAR** (RI sorgusu satir guvenligi devre disi
> kosar). Yani FK, cagiranin **GOREMEDIGI** bir satiri bulur ve kabul eder.
> RLS'in `WITH CHECK`i yalnizca satirin **KENDI** `tenant_id`sini baglar —
> ⚠️ **ISARET ETTIGI SATIRI DEGIL.**

⚠️ **Kusur HTTP'den ERISILEBILIR DEGILDI** ve bu durustce yaziliyor:
`lockAccountById` RLS'e tabidir ve gorunmeyen hesap icin **404** doner. Yani
uygulama katmani zaten guvenliydi. Yine de kapatildi — bu projede savunma
**KATMANLIDIR** ve bir gun ikinci bir yazma yolu eklenirse tek koruma
"hatirlamak" olurdu.

**Cozum ADR-0034'un deseninin AYNISIDIR** (`finance.transactions`in bilesik
FK'si, ikinci kez): `tenant_id` bilesigin parcasi olur.

⚠️ On kosulu `accounts_tenant_id_unique UNIQUE (tenant_id, id)`dir ve
**gereksiz gorunur** (`id` zaten PK) — ADR-0034'un
`categories_id_direction_unique` kisitiyla **birebir ayni durum**, ve orada
oldugu gibi burada da bir test onun **varligini** koruyor.

### ⚠️ 2. DEGISEN KARAR: `accounts` uzerinde **`GRANT UPDATE` VAR** — ama bir TRIGGER onu bagliyor

**Yazili olan** (Slice 1'in GRANT listesi):

> ~~`loyalty.accounts -> SELECT, INSERT, DELETE` ⚠️ **UPDATE YOK** (§2.2)~~

⚠️ **Olculen: bu, MODULU CALISMAZ HALE GETIRIYORDU.** HTTP testinde **her** puan
hareketi **500** dondu: _permission denied for table accounts ... FOR UPDATE_.

> ⚠️ **SEBEP:** `SELECT ... FOR UPDATE` bir **SATIR KILIDIDIR** ve kilitlemek
> tanim geregi _"bu satiri degistirebilirim"_ demektir. PostgreSQL kilitlenen
> tablo icin `ACL_SELECT_FOR_UPDATE` ister ve o, kaynak kodda **acikca
> `ACL_UPDATE`e esittir**. ⚠️ **Yani kilit, `UPDATE` yetkisi olmadan ALINAMAZ**
> — ve bu modulde kilit, bakiyenin negatife dusmemesinin **TEK** dayanagidir
> (§4.4).

⚠️ **Iki secenek vardi ve ikincisi secildi:**

| Secenek                                            | Neden / neden degil                                                                                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advisory kilit (`pg_advisory_xact_lock`)           | Yetki istemez — ama kilit **satira degil bir HASH'e** baglanir, `inventory`nin deseninden ayrisir ve okuyanin ikinci bir mekanizmayi ogrenmesini gerektirir.                    |
| ⚠️ **`GRANT UPDATE` + REDDEDEN TRIGGER** (secildi) | ⚠️ Korumayi **ZAYIFLATMAZ, GUCLENDIRIR**: bir `GRANT`in yoklugu yalnizca **uygulama rolunu** baglar; bir trigger **TABLO SAHIBINI DE** baglar (ADR-0043'un deseni, ikinci kez). |

⚠️ **Ve `DELETE` kapsam disidir** — `audit_log_append_only`den ayrildigimiz
nokta: orada trigger `UPDATE OR DELETE` yakalar (denetim izi silinemez); burada
silme **mesrudur ve bir YUKUMLULUKTUR** (KVKK m.7/m.11, §2.1).

⚠️ **Net sonuc:** `accounts` artik `businessos_owner` icin **de**
degistirilemezdir — yani §2.2'nin garantisi ADR'de yazilandan **daha
gucludur**; degisen sey **mekanizmadir**, karar degil.

### ⚠️ 3. UC ZORUNLU TESTIN SONUCU

| #   | Test                                                               | Sonuc                                                                                                  |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 1   | ⚠️ **Es zamanlilik** — 500 puana **6 paralel** 100 puanlik harcama | ✅ **TAM 5'i gecti, 1'i 422**; bakiye **0** — ikinci, bagimsiz bir SQL sayimiyla da dogrulandi         |
| 2   | ⚠️ **Cascade + GRANT** (§2.3'un iddiasi)                           | ✅ **IDDIA DOGRU** — `can_delete = false` iken cascade calisti; yedek cozume gerek kalmadi             |
| 3   | ⚠️ **Sifirdan farkli bakiye projeksiyonu** (ADR-0037'nin kusuru)   | ✅ `300 + 45 - 120 = 225` listede **dogru**; iki hesabin bakiyesi **birbirine sizmadi**; duvar = liste |

⚠️ **Es zamanlilik testinin iddiasi "en fazla bes" DEGIL "TAM BES"tir** — kilit
seri hale getirdigi icin sonuc **deterministiktir**; `<= 5` yazmak, hicbirinin
gecmedigi bozuk bir implementasyonu da yesil yakardi.

### ⚠️ 4. BULUNAN AMA **BU ISIN KAPSAMINDA OLMAYAN** BIR KIRMIZI TEST

`context-contributors.integration.spec.ts` **kirmizi** ve ⚠️ **bu slice'tan ONCE
de kirmiziydi** — kanit, HEAD'de acilan temiz bir worktree'de sayildi:

| Iddia (test)       | ⚠️ HEAD'deki gercek |
| ------------------ | ------------------- |
| `structural` **6** | ⚠️ **8**            |
| `semantic` **9**   | ⚠️ **10**           |
| toplam **15**      | ⚠️ **18**           |

⚠️ Test, **ADR-0050 ONCESI** bir dunyada yazildi (_"biri
`feedback-satisfaction`i eklerse bu test KIRMIZI YANAR"_) ve o gun geldi:
ADR-0047 + ADR-0050 ile yapisal kaynak **8**'e cikti. ⚠️ **Bu modul sifir
katkici ekler, yani sayilara DOKUNMAZ.**

✅ **PRODUCT OWNER TALIMATIYLA DUZELTILDI** (2026-08-27, ayni commit):
`structural` **8** · `semantic` **10** · toplam **18**. ⚠️ Bu **yeni bir
platform karari DEGILDIR** — ADR-0047 + ADR-0050'nin **zaten onaylanmis**
sonucudur; testin **gercege yetismesidir**.

⚠️ **Testin KENDI YAZILI ONGORUSU gerceklesmisti** (_"biri
`feedback-satisfaction`i eklerse bu test KIRMIZI YANAR — ve kirmizi yanmasi
DOGRUDUR: o gun once `retrieval.select`, sonra olcum, sonra AYRI BIR PLATFORM
ADR'si gerekir"_) ve ⚠️ **sira TERSINE CEVRILMEDI** — ucu de yapildi:
ADR-0046 (arac) → ADR-0048 (olcum) → ADR-0050 (platform ADR'si).

⚠️ Eski beklenti (`6/9/15`) test dosyasinda **kayitli birakildi** ki neyin
degistigi gorulsun, ve testin ANLAMI yeniden yazildi: artik _"T2 ateslemesin"_
demiyor — ⚠️ **havuzun BILESIMININ SESSIZCE DEGISMEDIGINI** soyluyor: bir modul
yeni bir katkici eklerse yine kirmizi yanar ve yine **dogru** yanar, cunku
yapisal tarafta yuva payi **tam 3**tur (ADR-0050 §Karar 1).
---

## Kapanis denetimi (Slice 2) — **HAFIF seviye**

| #   | Madde                                                                                                                                                                                                                                                                          | Zorunlu |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :-----: |
| 1   | `git status` temiz · `pnpm verify` **cikis kodu 0** (⚠️ ciktiyi grep'lemek yasak — DEVELOPMENT_RULES 5.4)                                                                                                                                                                      |   ⏳    |
| 2   | Rol turu: viewer **okur, hesap acamaz (403)** · member **hesap acar ve puan yazar, silemez (403)** · owner **siler (204)** · kimliksiz **401**                                                                                                                                 |   ⏳    |
| 3   | ⚠️ **TEKILLIK CANLI:** ayni kisiye ikinci hesap → **409** ve govde **mevcut hesabin id'sini tasiyor** (§1.2)                                                                                                                                                                   |   ⏳    |
| 4   | Dogrulama kapilari: `points = 0` **422** · negatif `points` **422** · gecersiz `direction` **422** · gelecege tarihli `occurredAt` **422** · 161 karakter `note` **422**                                                                                                       |   ⏳    |
| 5   | ⚠️ **YETERSIZ BAKIYE CANLI:** 100 puanlik hesaptan 150 harcama → **422**, ⚠️ **hicbir satir yazilmadi** ve bakiye **degismedi**                                                                                                                                                |   ⏳    |
| 6   | ⚠️ **§4.4 SINAVI — ES ZAMANLILIK:** ayni hesaba iki paralel harcama (toplami bakiyeyi asan) → biri **201**, biri **422**; ⚠️ **bakiye negatife DUSMEDI**                                                                                                                       |   ⏳    |
| 7   | ⚠️ **§4.1 OLCUMU:** 5000 satirlik bir defterde bakiye sorgusu **kac ms**? ADR-0039'un emsaliyle (4–5 ms) **ayni bantta mi**                                                                                                                                                    |   ⏳    |
| 8   | ⚠️ **§2.3 SINAVI — CASCADE + GRANT:** `businessos_app` `point_entries` uzerinde `can_delete = false` iken hesap silinir; ⚠️ **satirlar gercekten gitti mi** (ham SQL sayimiyla)                                                                                                |   ⏳    |
| 9   | ⚠️ **ADR-0036/0042/0050 OLCUMU (ADR-0046'nin araciyla):** uc soru; `grep retrieval.select` → giren kaynaklar · her yapisal kaynagin `rowCount`u · giren/girmeyen skorlar. ⚠️ **BEKLENEN: DEGISIKLIK YOK** (18 katkici · 8 yapisal · yapisal pay 3). Sapma varsa **kaydedilir** |   ⏳    |
| 10  | Fan-out **N=18** olcumu (⚠️ **degismedi**); darbogazin hala `LLMPort.complete` oldugu **kaydedilir** (dokuzuncu olcum)                                                                                                                                                         |   ⏳    |
| 11  | ⚠️ **MOR BAND SINAVI — UC KAPI** (§9): `hr` · `marketing` · `loyalty` kapilarinin **ikon ve etiketleri** gercekten farkli mi; aktif kapi `aria-current` tasiyor mu                                                                                                             |   ⏳    |
| 12  | Rota golgelemesi (ADR-0040'in dersi): `/loyalty/summary` ile `/loyalty/accounts/:id` cakismiyor — gercek isteklerle (`summary` **200**, `<UUID>` **200**, `not-a-uuid` **422**)                                                                                                |   ⏳    |
| 13  | Cross-modul: kisi yeniden adlandirildi → ad **aninda** yansiyor; ⚠️ `git diff -- crm.public.ts` **BOS**; ⚠️ **silinen kisinin hesabi listede DURUYOR ve "Musteri kaydi bulunamadi" diyor** (§9.2)                                                                              |   ⏳    |
| 14  | Renk turu acik **ve** koyu temada; `/app/loyalty` mor, ⚠️ **kabuk ve `--ai-accent` terracotta**; `app-shell.tsx` `git diff` **bos** (onuncu kez)                                                                                                                               |   ⏳    |
| 15  | ODA sinavi (ADR-0038): duvar **gercekten ortak**; ⚠️ **`N = 0` iken bos durum gosteriliyor, `0` DEGIL** (§9.1)                                                                                                                                                                 |   ⏳    |
| 16  | ⚠️ **BELGE SINAVI:** ROADMAP §3.5 (satir 12) guncellendi mi ve ⚠️ **kademe sapmasi yazildi mi** (§10.1) · §8.5 **YIRMI DORDE** cikti mi (`loyalty.point_entries`) ama **vektor sayisi ONDA** kaldi mi · CLAUDE.md "Mevcut Durum" ⚠️ **Faz 5'in KAPANDIGINI** soyluyor mu       |   ⏳    |

**Bilincli yapilmayacaklar (HAFIF seviye kurali):** sifirdan kurulum ❌ · iki
tenant'la tam RLS izolasyon turu ❌.

⚠️ **Prod dogrulamasi ZORUNLUDUR** — Slice 1 migration tasir. Kontroller:
health **200** · uygulanmis migration **39 → 40** · `loyalty.accounts` ve
`loyalty.point_entries` **RLS + FORCE** · ⚠️ `businessos_app`in
`point_entries` uzerinde `can_update` ve `can_delete` **false** ·
uc dar rol `loyalty` semasina **kor** · `GET /api/v1/loyalty/accounts` **401**.

> ⚠️ **BU DENETIM AYNI ZAMANDA FAZ 5'IN KAPANIS DENETIMIDIR** — on iki modulun
> sonuncusu. ⚠️ Faz 6'nin (Faturalama) kapi kosulu ROADMAP §4'te
> _"on iki modulun TAMAMI"_ diye yazilidir ve bu denetim onu karsilar. ⚠️ Faz 6
> **acilmadan once** ROADMAP §8.2'nin KVKK kontrol noktasi ve §8.5'in retention
> karari **hala aciktir** — bu ADR onlari kapatmaz, ⚠️ **yalnizca ikisini de
> BIR KALEM daha buyutur**.

---

## Bu karar ne zaman yeniden gozden gecirilir?

- ⚠️ **PUAN SONA ERMESI (expiry) EKLENDIGINDE — bu, listedeki EN GUCLU
  tetikleyicidir.** §3.3 Aday 1 (`loyalty-expiry`) o gun **dort testi de
  gecer** ve ⚠️ **yapisal katkici karari YENIDEN VERILIR**. Sira: (1) Queue
  karari, (2) `expires_at` ve yakma mekanizmasi, (3) ⚠️ **ancak ondan sonra**
  katkici. ⚠️ O gun yapisal kaynak **9** olur ve kapsama %37,5 → %33'e duser —
  ADR-0050 bunu **ismen ongordu** ve _"tabani buyutelim mi"_ sorusunun
  sorulmamasi gerektigini yazdi.
- ⚠️ **ODUL KATALOGU EKLENDIGINDE:** bir odul esigi, ⚠️ **bu modulun ilk
  KULLANICI BEYANLI esigi** olur (§3.4) — yani ikinci bir yapisal aday dogar
  (_"odule bir adim kalan musteri"_) ve ayni sira uygulanir.
- ⚠️ **KADEME (tier) istendiginde:** §10.1 — once **odul katalogu ve
  ayricalik**, sonra kademe. ⚠️ Kademe turetilebilir oldugu icin bugune kadarki
  defter **yeterlidir**; bir veri gocu **gerekmez**.
- ⚠️ **PUANIN PARA KARSILIGI istendiginde:** ⚠️ **para bu projede Finans'ta
  yasar.** Buraya bir `point_value` koymak **ikinci bir para yuzeyi** acar ve
  para birimi sorusunu (ADR-0034) davet eder. ⚠️ Ayrica o gun §2.4'un
  `platform/audit` karari **yeniden sorulur** — para, olcutun birinci maddesini
  degistirir (ADR-0047'nin `budget` icin yazdigi ayni cumle).
- ⚠️ **OTOMATIK KAZANDIRMA istendiginde:** once **YON** karara baglanir
  (Sadakat mi Finans'i okur, Finans mi Sadakat'a yazar), sonra `public.ts`,
  sonra ⚠️ **DAG yeniden kanitlanir** — ayri bir ADR (§6.4).
- ⚠️ **CRM DOMAIN EVENT YAYINLAMAYA BASLADIGINDA:** §9.2'nin _"Musteri kaydi
  bulunamadi"_ satiri bir **temizlik** yoluna donusebilir. ⚠️ Ama karar
  basit degildir: silinen bir musterinin **bakiyesi ne olur**? Sessizce silmek,
  bir hakki iz birakmadan yok etmektir — ⚠️ **bu, kendi basina bir karardir.**
- ⚠️ **NEGATIF BAKIYE PROD'DA GORULURSE:** §4.4'un siniri **gerceklesmis**
  demektir. Cozum `balance` kolonu **degildir** (o, sessiz kaymayi geri
  getirir); once **hangi yolun kilidi atladigi** bulunur.
- **Bir sadakat defteri yuz binlerce satira ulastiginda:** §4.1'in turetme
  karari onbellege gecebilir — ⚠️ **yon tek yonludur** ve gecis, defteri
  **bozmadan** yapilir.
