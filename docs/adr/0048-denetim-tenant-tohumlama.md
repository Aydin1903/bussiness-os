# 0048 — Denetim tenant'i ve tohumlama araci: `seed:audit-tenant`

- **Durum:** ⚠️ **KABUL EDILDI ve UYGULANDI** (2026-08-25; PLATFORM/ARAC karari)
- **Tarih:** 2026-08-25
- **Karar veren:** Product Owner
- **Faz:** 5 (platform tooling — bir modul ADR'si DEGIL)

## Baglam

[ADR-0046](0046-retrieval-gozlemlenebilirlik.md) `retrieval.select` satirini
yazdi ve [ADR-0042](0042-retrieval-taban-revizyonu.md) §4'un olcum protokolu
**ilk kez uygulanabilir** hale geldi. Ama ADR-0046'nin uretebildigi tek olcum
**bos bir tenant'ta** alindi:

> _"T2'nin girdisi ILK KEZ OLCULDU: kayitli yapisal kaynak **6**, satir
> donduren **0**, bos donen **6**."_ — ADR-0046 § Uygulandi

⚠️ **Bu sayi T2 hakkinda hicbir sey soylemez.** Alti yapisal kaynagin
konusacak verisi yoktu; `empty` donmeleri katkicilarin **calistigini** degil,
tenant'in **bos oldugunu** gosterir. ADR-0046 bu sinirini kendisi yazdi:

> _"Anlamli bir dagilim olcumu icin **on bir modulun hepsinde veri olan** bir
> denetim tenant'i gerekir ve boyle bir tohumlama araci da **yoktur**."_

### ⚠️ IKI MODUL KARARI BU ARACI BEKLIYOR

| ADR                                                   | Askidaki aday           | Engel                                   |
| ----------------------------------------------------- | ----------------------- | --------------------------------------- |
| [ADR-0045](0045-musteri-geri-bildirim-modulu.md) §3.4 | `feedback-satisfaction` | Olcecek **arac** yoktu → ADR-0046 cozdu |
| [ADR-0047](0047-kampanya-pazarlama-modulu.md) §3.5    | `campaign-gap`          | ⚠️ Olculecek **veri** yok → **bu ADR**  |

ADR-0047 §PO Kalem B bunu ismen istedi ve ⚠️ **ucuncu kez _"olculemedi"_
yazilmasinin bir surec arizasi olacagini** kaydetti (ADR-0043 · ADR-0045 iki
kapanis denetimini eksik biraktilar).

> ⚠️ **Bu ADR hicbir retrieval karari VERMEZ.** ADR-0046 "olcen aleti" kurdu;
> bu belge **olculecek numuneyi** kurar. Tabani degistirmez, rerank acmaz, iki
> askidaki katkiciyi onaylamaz. ⚠️ Ama ureettigi VERI, o kararlarin girdisidir
> ve § Olcum'de kayitlidir.

---

## Karar

### 1. ⚠️ BIR SEED BETIGI — MIGRATION DEGIL

`apps/api/scripts/seed-audit-tenant.mts`, `pnpm seed:audit-tenant`.

Ayrim pazarlik disidir ve dort somut sonucu vardir:

|                              | Migration | ⚠️ **Bu betik**                     |
| ---------------------------- | --------- | ----------------------------------- |
| `drizzle/meta/_journal.json` | Girer     | ⚠️ **GIRMEZ**                       |
| Prod `preDeployCommand`      | Kosar     | ⚠️ **KOSMAZ**                       |
| `pnpm verify`                | —         | ⚠️ **PARCASI DEGIL**                |
| Semaya dokunur mu            | Evet      | ⚠️ **HAYIR — yalnizca satir yazar** |

⚠️ **Test verisi bir semaya ait degildir.** Bir migration olarak yazilsaydi
prod'a **kacinilmaz olarak** giderdi: Railway'in `preDeployCommand`i her
push'ta `db:migrate` kosar (CLAUDE.md, "Railway prod CANLI"). Bir denetim
tenant'inin — ve ozellikle **bilinen parolali kullanicisinin** — prod'a gitmesi
bir veri kirliligi degil, bir **guvenlik olayi** olurdu.

### 2. ⚠️ BETIK PROD'DA CALISMAYI REDDEDER — IKI KAPI

Betik `audit-owner@business-os.local` ve `audit-member@business-os.local`
kullanicilarini **bilinen bir parolayla** yaratir. Bu yerel bir kolayliktir ve
uretimde bir aciktir; dolayisiyla kapilar koda yazildi, niyete birakilmadi:

| #   | Kapi                                                                       | Asilabilir mi                            |
| --- | -------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | `NODE_ENV=production` → **CALISMAZ**                                       | ⚠️ **HAYIR** — bilerek kosulsuz          |
| 2   | Hedef host yerel degil (`localhost`/`127.0.0.1`/`::1`/`db`) → **CALISMAZ** | `SEED_ALLOW_REMOTE_HOST=1` ile (CI icin) |

⚠️ **Neden IKI kapi:** `NODE_ENV` tek basina yetmez. Bir gelistiricinin
makinesinde `NODE_ENV=development` iken **uzak** bir veritabanina isaret eden
bir `DATABASE_MIGRATION_URL` bulunabilir (bir hata ayiklama oturumundan kalan).
Ikinci kapi tam olarak o senaryoyu yakalar. ⚠️ Ikinci kapi asilsa bile
**birincisi durur**.

### 3. ⚠️ IDEMPOTENT = SIL-VE-YENIDEN-YAZ, "VARSA ATLA" DEGIL

Her calisma once **tenant'in kendi** satirlarini siler, sonra yeniden yazar.

⚠️ `ON CONFLICT DO NOTHING` YETMEZDI ve sebebi §4'tur: tarihler `now()`a
**goreli** uretilir. "Varsa atla" davranisinda uc ay once tohumlanmis bir
tenant **bayat tarihlerle** kalirdi — betik calisir, cikis kodu 0 verir, hicbir
sey hata vermez, ama ⚠️ **hicbir alarm bandi tetiklenmez ve olcum "her sey
saglikli" der.** Hata **sessiz** olurdu.

⚠️ **Silme sirasi keyfi degil, UC KISIT tarafindan dayatiliyor** ve ucu de
domain'in kendi kararlaridir:

1. `inventory.movements → items` ve `finance.transactions → categories`
   **`RESTRICT`** — cocuk once silinir.
2. `invoicing.sales_documents.converted_from_id` **kendine `RESTRICT`** — once
   faturalar, sonra teklifler.
3. ⚠️ `sales_document_lines` uzerindeki **`assert_document_editable` trigger'i**
   (ADR-0041 §2'nin ucuncu katmani) `draft` olmayan bir belgenin satirina
   dokunmayi reddeder. ⚠️ **Ama trigger'in kendi yorumu bu durumu ONGORMUS**
   (_"ebeveyn yoksa izin ver — `ON DELETE CASCADE` ile ebeveyn once silinir"_),
   yani **ebeveyni silmek yeterlidir** ve satirlar tek tek silinmeye
   **calisilmaz**.

⚠️ **Ayni trigger YAZMA sirasini da dayatir:** her belge once `draft` acilir,
satirlari yazilir, **sonra** durumu `sent`/`accepted`e cekilir.
⚠️ Bu bir "gecici cozum" degil, **aracin domain kuralina UYMASIDIR** — kural
atlanabilseydi zaten kural olmazdi.

⚠️ **`platform.audit_log` BILEREK silinmez:** `audit_log_append_only` trigger'i
tablo sahibini de baglar (ADR-0043 §4) ve bir denetim izini bir **tohumlama
betiginin** silememesi dogrudur.

### 4. ⚠️ TARIHLER `now()`A GORELI — SABIT TARIH YAZILMAZ

Butun tarihler `at(offsetDays)` / `day(offsetDays)` ile uretilir.

Gerekce, projede uc kez kaydedilmis ayni tuzaktir (`today.ts`,
`context-contributors.integration.spec`): bugun alarm bandini tetikleyen sabit
bir tarih **uc ay sonra tetiklemez**. Araci ise yaramaz hale getiren sey bir
hata degil, **takvimdir**.

### 5. ⚠️ RLS BYPASS EDILMEZ — betik uygulamayla AYNI kapidan gecer

Baglanti `DATABASE_MIGRATION_URL` (yani `businessos_owner`) ile kurulur.
⚠️ **O rol `rolbypassrls = false` tasir** ve is tablolari `FORCE RLS`tir —
dolayisiyla betik her transaction'da `app.current_tenant_id`yi **SET etmek
zorundadir**.

⚠️ Bu bir zahmet degil bir **guvence**dir: tohumlama betigi, tenant
izolasyonunu **delemez**. Bir yazim hatasi baska bir tenant'in verisini
silemez, cunku RLS politikasi onu zaten gormez.

### 6. ⚠️ IKI ROL, TEK TENANT — ve bu OLCUMUN gerekliligi

| Kullanici                        | Rol      | Ne uretir                                                   |
| -------------------------------- | -------- | ----------------------------------------------------------- |
| `audit-owner@business-os.local`  | `owner`  | On bes katkicinin **hepsi** cagrilir → `returned` / `empty` |
| `audit-member@business-os.local` | `member` | ⚠️ `cashflow:read` **YOK** → `forbidden` durumu da gozlenir |

ADR-0034'un dar Finans katalogu sayesinde ADR-0046'nin **dort durumunun ucu**
tek bir tohumlamayla uretilebilir hale gelir. (`degraded` icin bir saglayici
cokusu gerekir; o bilerek tohumlanmaz.)

### 7. ⚠️ EMBEDDING VARSAYILAN OLARAK KAPALI

`pnpm seed:audit-tenant` embedding **uretmez**; `-- --with-embeddings` uretir
(OpenAI `text-embedding-3-small`, 27 metin).

Gerekce: aracin **asil isi** — yapisal kaynaklarin `returned` donmesi —
embedding **gerektirmez**, cunku yapisal katkicilar veritabanini dogrudan
sorgular. Arac bir API anahtari olmadan da calismalidir.

⚠️ **Bedeli acikca yazilir ve betik onu her calismada basar:** bayraksiz
calistirmada anlamsal kaynaklar `empty` doner ve dagilim **yarim** olculur.

⚠️ Chunk tablolarinda `embedding` **`NOT NULL`**tur, yani bayraksiz calismada
o satirlar **hic yazilmaz** — yarim bir vektor uydurmak yerine kayit
**yoktur**.

### 8. ⚠️ ARGON2 PARAMETRELERI KOPYALANIR — ve gerekce OLCEREK DUZELTILDI

Betik ADR-0017'nin dort parametresini **kendi icinde tasir**.

⚠️ **ILK TASARIM BUNUN TERSIYDI ve gerekcesi YANLISTI.** Sabit once `src/`ten
import edilmisti; yazili gerekce _"ayrisirlarsa giris SESSIZCE kirilir"_ idi.
Uygulama sirasinda o iddia **sinandi ve cokti**:

1. ⚠️ **Argon2 bir PHC dizesi uretir ve parametreleri (`m`, `t`, `p`) dizenin
   ICINDE tasir.** `argon2Verify` dogrularken yapilandirilmis degil
   **hash'teki** parametreleri kullanir — yani farkli bir parametreyle
   uretilmis hash de **sorunsuz dogrulanir**.
2. ⚠️ **`LoginUseCase` zaten `needsRehash` kontrolu yapiyor** ve gerekiyorsa
   parolayi **ilk giriste seffafca yeniden hash'liyor**
   (`login.use-case.ts` §6.3).

> ⚠️ Yani ayrismanin en kotu sonucu, denetim kullanicisinin ilk girisinde
> **bir kez** yeniden hash'lenmesidir. **Sessiz bir kirilma degil, kendi
> kendini onaran bir sapma.**

⚠️ **Buna karsilik import'un bedeli GERCEK CIKTI:** `.ts` uzantili bir import
`allowImportingTsExtensions` ister, o bayrak `noEmit` ister ve ⚠️ **ayni
tsconfig ile kosan `nest build` EMIT EDER** — yani bayrak **uretim
derlemesini bozardi**. `pnpm verify` bunu **TS5097 ile yakaladi**.

> ⚠️ **Kayda geciyor cunku takas terse dondu:** bir uretim derlemesini bir
> gelistirme betigi ugruna riske atmak yanlis olurdu. ⚠️ Tek dogruluk kaynagi
> yine de `argon2-parameters.ts`tir; kopya ayrisirsa **kendini** yanlislar.

⚠️ **Ikinci fayda:** `scripts/ → src/` diye bir bagimlilik **hic dogmadi**.
Tohumlama betigi bir uygulama katmani degildir ve `pg` disinda uygulama
koduna **hicbir bagi yoktur**.

---

## ⚠️ OLCUM — ADR-0042 §4'un protokolu ILK KEZ GERCEK VERIYLE kosuldu

**Kosum:** `pnpm seed:audit-tenant -- --with-embeddings` → API (`LOG_PRETTY=false`)
→ `owner` token'i ile **uc farkli soru** → `grep retrieval.select`.

Gercek saglayicilar (OpenAI embedding + DeepSeek completion), `K = 8`,
`structuralFloor = 3`, `candidateCount = 51`.

### 8.1 Dagilim — uc soruda da AYNI

`rows/sel` = katkicinin dondurdugu satir / cevaba giren parca.
`[Y]` = yapisal.

| Kaynak                         | S1        | S2        | S3        |
| ------------------------------ | --------- | --------- | --------- |
| `knowledge`                    | 3 / 1     | 3 / 1     | 3 / 1     |
| `crm-interactions`             | 4 / 1     | 4 / 1     | 4 / 1     |
| **[Y] `crm-pipeline`**         | 3 / 1     | 3 / 1     | 3 / 1     |
| **[Y] `inventory-stock`**      | 5 / 1     | 5 / 1     | 5 / 1     |
| `inventory-notes`              | 2 / 1     | 2 / 1     | 2 / 1     |
| `supplier-interactions`        | 3 / 1     | 3 / 1     | 3 / 1     |
| **[Y] `invoicing-pipeline`**   | 5 / 1     | 5 / 1     | 5 / 1     |
| **[Y] `appointment-schedule`** | 4 / **0** | 4 / **0** | 4 / **0** |
| `appointment-notes`            | 3 / 1     | 3 / 1     | 3 / 1     |
| `feedback-comments`            | 4 / 0     | 4 / 0     | 4 / 0     |
| `project-notes`                | 3 / 0     | 3 / 0     | 3 / 0     |
| **[Y] `project-status`**       | 5 / **0** | 5 / **0** | 5 / **0** |
| `documents`                    | 2 / 0     | 2 / 0     | 2 / 0     |
| `finance-commentaries`         | 3 / 0     | 3 / 0     | 3 / 0     |
| **[Y] `finance-cashflow`**     | 2 / **0** | 2 / **0** | 2 / **0** |

**On bes katkicinin on besi de `returned`** — `empty` ve `degraded` **yok**.

### 8.2 ⚠️ T2'NIN GIRDISI: **6** — ESIGE TAM OTURUYOR

> **T2** (ADR-0042 §3): _"**Satir donduren** yapisal kaynak sayisi `2K/3`'u
> **gectiginde**"_ — `K = 8` icin esik **6**.

| Olcu                                 | Deger                         |
| ------------------------------------ | ----------------------------- |
| Kayitli yapisal kaynak               | 6                             |
| ⚠️ **Satir donduren** yapisal kaynak | ⚠️ **6** (uc soruda da)       |
| T2 esigi (`2K/3`)                    | 6                             |
| **T2 atesledi mi**                   | ⚠️ **HAYIR — 6 > 6 degildir** |

⚠️ **AMA ESIK TAM SINIRDA VE BUNUN SOMUT SONUCU VAR:** satir donduren **yedinci**
bir yapisal kaynak T2'yi **atesler**. Askidaki iki adayin **ikisi de** boyle bir
kaynaktir:

- `feedback-satisfaction` — ADR-0045 §3.3'un kendi tespiti: _"saglikli durumda
  da bir satir dondururdu (0,75 bandi)"_ → ⚠️ **kesin bir yedinci**.
- `campaign-gap` — ADR-0047 §3.4'un _"kosullu sessiz"_ adayi: yalnizca
  kapatilmamis kampanya **varken** satir doner → ⚠️ **kosullu bir yedinci**.

> ⚠️ **ADR-0047 §3.4'un uyarisi DOGRULANDI:** kosullu sessizlik esigi
> **kaldirmaz**, yalnizca ne siklikta ateslendigini degistirir. Bu tenant'ta
> `campaign-gap` satir dondururdu ve T2 **atesleyecekti**.

### 8.3 ⚠️⚠️ T1 ATESLEDI — ve ADR-0042 bunun "gerceklesmedigini" yazmisti

> **T1** (ADR-0042 §3): _"Bir yapisal kaynak **ALARM bandinda (0.95)** uc farkli
> soruda da giremiyorsa."_ ADR-0042 bunu olcmus ve **gerceklesmedi** diye
> kaydetmisti (`invoicing-pipeline` 0.95'e cikinca girmisti).

⚠️ **Bu olcumde UC KAYNAK icin gerceklesti:**

| Kaynak                 | En iyi skor | Uc soruda da yuva | Skorlar                   |
| ---------------------- | :---------: | :---------------: | ------------------------- |
| `appointment-schedule` |  **0.95**   |     ⚠️ **0**      | 0.95 × 4 (dordu de alarm) |
| `project-status`       |  **0.95**   |     ⚠️ **0**      | 0.95 × 4 + 0.75           |
| `finance-cashflow`     |  **0.95**   |     ⚠️ **0**      | 0.95 × 2                  |

ADR-0042'nin kendi cumlesi geregi: _"Gerceklestigi gun **taban buyuklugu ya da
skor merdiveni YANLISTIR** ve ikisinden biri degismek zorundadir."_

⚠️ **Bu ADR o karari VERMEZ** — bir tooling ADR'si bir retrieval kararini
veremez. Bulgu, ADR-0036/0042 revizyonuna (**0049 adayi**) **girdi olarak**
devredilir.

### 8.4 ⚠️⚠️ ADR-0042'NIN CEVAPLAYAMADAN KAPANDIGI SORU CEVAPLANDI

> ADR-0042 § Verinin soylemedigi: _"band ici siralamanin **liyakatli mi** yoksa
> **kararli-siralama** mi oldugu bilinmiyor."_

⚠️ **CEVAP: KARARLI-SIRALAMA. Liyakat DEGIL.**

Kanit mekaniktir, yorum degil:

1. Alti yapisal kaynagin **altisinin da** en iyi skoru **tam olarak 0.95** —
   yani tepe noktasinda **alti yonlu bir beraberlik** var.
2. `selectFragments` beraberligi `Array.prototype.sort` ile bozar ve
   ⚠️ **o sort ES2019'dan beri KARARLIDIR** — yani esit skorlu adaylar
   **katkici KAYIT SIRASINI** korur (fonksiyonun kendi yorumu bunu yaziyor).
3. Kazanan uc kaynak — `crm-pipeline`, `inventory-stock`, `invoicing-pipeline` —
   ⚠️ **kayit sirasindaki ILK UC yapisal kaynaktir**; kaybeden uclu ise **son
   uctur**.

> ⚠️ **Somut anlami:** bugun bir yapisal kaynagin havuza girip girmemesini
> belirleyen sey, alarm bandinda esitlik oldugunda, **modulun ne kadar acil bir
> haber tasidigi degil `app.module.ts`te KACINCI SIRADA kaydedildigidir.**
> Bu, ADR-0036'nin taban kisitinin **amaclamadigi** bir davranistir ve
> 0049'un cevaplamasi gereken asil sorudur.

⚠️ **Skor merdiveninin kendisi de bir girdi:** 0.95/0.90/0.75 uc basamakli bir
merdivendir ve alti kaynagin ayni anda alarm bandinda olmasi beraberligi
**kacinilmaz** kilar. Daha ince bir merdiven (ya da kaynak ici bir aciliyet
skoru) beraberligi liyakatle bozardi.

### 8.5 ⚠️ `forbidden` DURUMU DA URETILDI — ve CAGIRANA SIZMADI

§6'nin iki rollu tasarimi olculdu. `member` rolunun ayni tenant'a sordugu
dorduncu cagride:

| Olcu                                      | Deger                                           |
| ----------------------------------------- | ----------------------------------------------- |
| `retrieval.select` yapisal `returned`     | **5** (owner'da 6)                              |
| ⚠️ `retrieval.select` yapisal `forbidden` | ⚠️ **1** (`finance-cashflow`, `rowCount: null`) |
| API cevabinda finans kaynagi              | ⚠️ **YOK**                                      |
| API cevabinda `degradedSources`           | ⚠️ **`[]`**                                     |

⚠️ **ADR-0046 §4.2 ve ADR-0031 §5.3 birlikte dogrulandi:** elenen kaynak
**loga yazildi**, **cagirana sizmadi** — `degradedSources` bos kaldi, yani
`member` gormedigi bir kaynagin **varligini** ogrenemedi.

⚠️ Ayrica T2'nin girdisinin **role bagli** oldugu gorunur oldu: ayni tenant,
ayni veri, farkli rol → **6 yerine 5**. Bir esik tartismasinin hangi rolle
olculdugu **kaydedilmek zorundadir**.

### 8.6 ⚠️ BU OLCUMUN DURUST SINIRI: TENANT BILEREK "ALARM DOLU"

⚠️ **Onemli ve gizlenmiyor:** is emri tenant'i acikca alarm uretecek sekilde
tarif etti (durgun firsatlar · negatif nakit akisi · geciken gorevler · yuksek
gelmedi orani · esik alti kalemler) ve betik bunu **yerine getirdi**. Yani
alti yapisal kaynagin **ayni anda** alarm bandinda olmasi tenant'in bir
ozelligidir, **gercek bir sirketin tipik hali degildir.**

Bunun iki sonucu var ve ikisi de kayda geciyor:

- ✅ Olcum, tabanin **CEKISME altindaki** davranisini gosterir — ve zaten
  ADR-0036'nin var olma sebebi cekismedir. §8.4'un bulgusu **cekismeye ozgu
  degildir**: beraberlik oldugu her yerde ayni mekanizma isler.
- ⚠️ Ama §8.3'un T1 bulgusu **"her tenant'ta boyle"** diye okunmamalidir. Sakin
  bir tenant'ta alti kaynak alarm bandinda olmaz ve eleme baska turlu calisir.
  ⚠️ **0049 bir de SAKIN tenant olcmelidir**; bu betik bugun yalnizca alarm
  senaryosunu uretiyor (§ Bilinen sinirlar).

---

## Gerekce

**Neden bir arac, neden elle tohumlama degil.** Iki kapanis denetimi (ADR-0043,
ADR-0045) olcumu **yapamadan** kapandi ve ucuncusu (ADR-0047) kesin olarak
carpacakti. Elle tohumlama her denetimde yeniden yazilir, her yazimda farkli
cikar ve ⚠️ **iki olcum karsilastirilamaz** hale gelir. Bir esik tartismasinin
girdisi, tekrar uretilebilir olmak zorundadir.

**Neden dogrudan SQL, neden HTTP API uzerinden degil.** Uc somut engel:
(a) HTTP tohumlama sunucunun **ayakta olmasini** gerektirir, yani arac bir
sunucu yasam dongusune baglanir; (b) `platform.rate_limits` **saatlik kova**
tutar ve ~30 anlatisal kayit yazmak sayaci tuketip tohumlamayi kendi
oran sinirina carpitirdi; (c) yapisal kaynaklarin ihtiyac duydugu **gecmis
tarihli** kayitlar (40 gun once asama degistirmis bir firsat, 12 gun gecikmis
bir gorev) API'den **yazilamaz** — dogrulama onlari bugune sabitler.

**Neden sil-ve-yeniden-yaz.** §3 — "varsa atla" davranisinda arac zamanla
**sessizce** ise yaramaz hale gelirdi. Bir teshis aracinin en kotu hatasi,
calistigini soyleyip yanlis olcmesidir.

**Neden bu ADR hicbir retrieval karari vermiyor.** ADR-0042'nin ilkesi
_"bir platform karari, onu degistirmesi gereken veriye sahip olmadan revize
edilmez"_ idi. ⚠️ Simetrigi de dogrudur: **veriyi ureten arac, o veriyle
verilecek karari kendisi veremez.** §8'in uc bulgusu (T2 sinirda, T1 atesledi,
band ici eleme liyakat degil) ADR-0049'un girdisidir.

---

## Sonuclari

**Olumlu**

- ⚠️ **ADR-0042 §4'un protokolu ILK KEZ gercek veriyle kosuldu** — uc denetimde
  ust uste yazilan _"olculemedi"_ kaydi **kirildi**.
- ⚠️ **Iki askidaki modul karari artik veriyle konusulabilir**
  (`feedback-satisfaction` · `campaign-gap`) — ikisi de T2'yi **atesleyecek**
  (§8.2).
- ⚠️ **ADR-0042'nin cevaplayamadan kapandigi soru CEVAPLANDI** (§8.4) ve
  ⚠️ **T1 ilk kez atesledi** (§8.3).
- Olcum **tekrar uretilebilir**: ayni komut, ayni tenant, ayni dagilim.
- Denetim tenant'i yalnizca `/ask` icin degil **ekranlar icin de** kullanilir —
  on bir modulun odalari artik dolu veriyle gezilebilir (renk turu, ODA sinavi,
  bos-durum kontrolleri).
- Hicbir migration yazilmadi, hicbir semaya dokunulmadi, `AskResult` sekli
  **degismedi**.

**Olumsuz / bedeli**

- ⚠️ **Bilinen parolali iki kullanici uretiliyor.** Iki kapi (§2) bunu yerelde
  tutar, ama ⚠️ **kapilar koddadir ve kod degisebilir** — bu satir, gozden
  gecirenlerin bakmasi gereken yeri isaret eder.
- ⚠️ **Argon2 parametreleri IKI YERDE yaziyor** (§8). Ayrismanin bedeli
  olculdu ve kucuk (ilk giriste bir kez yeniden hash), ama sifir degil; tek
  dogruluk kaynagi `argon2-parameters.ts`tir.
- ⚠️ **Tohumlanan veri UYDURMADIR** — gercek bir sirketin dagilimini temsil
  etmez (§8.6).
- ⚠️ **`--with-embeddings` PARA HARCAR** (27 embedding cagrisi) ve varsayilan
  olarak kapalidir; kapaliyken dagilim **yarim** olculur.
- Repoda bir betik daha var: `apps/api/scripts/` artik uc dosya
  (`db-preflight`, `rollback`, `seed-audit-tenant`).

---

## Degerlendirilen alternatifler

| Alternatif                                              | Neden secilmedi                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚠️ **Bir migration olarak yazmak**                      | §1 — Railway'in `preDeployCommand`i her push'ta migration kosar; denetim tenant'i ve **bilinen parolali kullanicisi** prod'a **kacinilmaz olarak** giderdi.                                                                                                                                                                              |
| **HTTP API uzerinden tohumlamak**                       | § Gerekce — sunucu bagimliligi · `platform.rate_limits` sayacini tuketmesi · ⚠️ **gecmis tarihli kayitlarin API'den yazilamamasi** (dogrulama onlari bugune sabitler).                                                                                                                                                                   |
| **Nest uygulama baglamini acip use case'leri cagirmak** | Ayni oran siniri ve ayni tarih engeli; ustelik tohumlama araci uygulamanin **derlenmis** olmasina baglanirdi.                                                                                                                                                                                                                            |
| **`ON CONFLICT DO NOTHING` ile idempotentlik**          | ⚠️ §3 — goreli tarihler bayatlar, betik calisir, cikis kodu 0 verir ve **hicbir alarm tetiklenmez**. Hata **sessiz** olurdu.                                                                                                                                                                                                             |
| **Sabit (hardcoded) tarihler**                          | §4 — bugun tetikleyen tarih uc ay sonra tetiklemez; projede uc kez kaydedilmis tuzak.                                                                                                                                                                                                                                                    |
| **`TRUNCATE` ile temizlik**                             | ⚠️ `TRUNCATE` **tenant filtresi kabul etmez** — baska tenant'larin verisini de silerdi. Testler bunu yapabilir (izole container), bir gelistirici veritabani **yapamaz**.                                                                                                                                                                |
| **RLS'i bypass eden bir rolle baglanmak**               | §5 — `businessos_rls_reader` bypass tasir ama tohumlama betigine vermek, izolasyonu **delebilen** bir arac uretirdi. Bir yazim hatasi baska tenant'i silebilirdi.                                                                                                                                                                        |
| ⚠️ **Argon2 parametrelerini `src/`ten IMPORT etmek**    | ⚠️ **Once secildi, sonra GERI ALINDI** (§8): `.ts` uzantili import `allowImportingTsExtensions` ister, o da `noEmit` ister — ve ayni tsconfig ile kosan **`nest build` EMIT EDER**. `pnpm verify` bunu TS5097 ile yakaladi. Kopyanin bedeli ise olculdu ve kucuk: PHC parametreleri hash'in icindedir, `needsRehash` ilk giriste onarir. |
| **Embedding'i varsayilan ACIK yapmak**                  | §7 — arac API anahtari olmadan da calismalidir; asil isi (yapisal `returned`) embedding gerektirmez.                                                                                                                                                                                                                                     |
| **Vektorleri sahte (rastgele) uretmek**                 | ⚠️ Anlamsal siralama **anlamsiz** olurdu ve §8.1'in anlamsal satirlari **yaniltici** cikardi — olculen sey benzerlik degil gurultu olurdu.                                                                                                                                                                                               |
| **Nesne deposuna (R2/MinIO) gercek dosya yazmak**       | Tohumlamayi **ikinci bir dis sisteme** bagimli kilardi. `documents.contributor` yalnizca `document_chunks`i okur; indirme yolunun 404 vermesi kabul edilmis bir sinirdir.                                                                                                                                                                |

---

## Bilinen sinirlar

- ⚠️ **TENANT "ALARM DOLU"DUR — sakin senaryo URETILMIYOR** (§8.6). Alti yapisal
  kaynagin ayni anda alarm bandinda olmasi bir **tasarim tercihidir**.
  ⚠️ **0049 bir de sakin tenant olcmelidir**; bugun bunun icin bir bayrak
  (`--calm`) **yoktur**.
- ⚠️ **UC SORUDA DA AYNI DAGILIM CIKTI** ve bu, secimin soruya duyarsiz oldugunu
  **kanitlamaz**: yapisal skorlar zaten sabittir, anlamsal taraf ise kucuk bir
  korpusta (27 metin) **kararli** siralanir. ⚠️ Buyuk bir korpusta anlamsal
  siralama degisebilir; bu tenant onu **olcemez**.
- ⚠️ **Belge indirme yolu 404 verir** — nesne deposuna dosya yazilmaz. Ekran
  gezilirken bu bir kusur gibi gorunur; degildir.
- ⚠️ **`hr.compensation_records` BILEREK tohumlanmaz** — maasi bir tohumlama
  betigine koymak, ADR-0043'un uc katmanli izolasyonunu zayiflatan gereksiz bir
  yuzey olurdu. IK'nin `/ask` havuzunda zaten **sifir katkicisi** var.
- ⚠️ **`degraded` durumu uretilmez** — bir saglayici cokusu gerekir ve bilerek
  tohumlanmaz. ADR-0046'nin dort durumundan **ucu** gozlenebilir.
- ⚠️ **Kampanya (11.) ve Sadakat (12.) modulleri YOK** — semalari henuz
  acilmadi. `campaign-gap` olculdugu gun betige bir bolum daha eklenmelidir.
- ⚠️ **Betik `apps/api` dizininden kosar** (`.env` oradan okunur) — `pnpm`
  script'i bunu halleder, elle `node` cagrisi **yanlis dizinden** sessizce
  bos bir ortamla calisabilir.
- ⚠️ **Tenant `platform.outbox`a event YAZMAZ** — kayitlar dogrudan SQL ile
  aciliyor, yani domain event'leri **uretilmez**. Outbox davranisini sinamak
  icin bu tenant **kullanilamaz**.
- **Yeni bir env degiskeni ve yeni bir migration YOKTUR.**

---

## Bu karar ne zaman yeniden gozden gecirilir?

- ⚠️ **ADR-0036/0042 revizyonu (0049 adayi) yazildiginda:** §8'in uc bulgusu
  (T2 sinirda · **T1 atesledi** · band ici eleme **liyakat degil kayit sirasi**)
  o ADR'nin girdisidir. ⚠️ O gun bir de **sakin tenant** olculmelidir.
- ⚠️ **11. ve 12. modul acildiginda:** betige `marketing` ve `loyalty` bolumleri
  eklenir; aksi halde "on bir modulde veri var" iddiasi **bayatlar**.
- ⚠️ **Bir katkici eklendiginde/cikarildiginda:** dagilim tablosu (§8.1)
  degisir ve **eski olcumle karsilastirilamaz**. Kapanis denetimleri olcumu
  **katkici sayisiyla birlikte** kaydetmelidir.
- ⚠️ **Betik prod'a yaklastirilmak istendiginde** (ornegin bir demo ortami):
  §2'nin iki kapisi **yeniden okunmalidir** ve bilinen parola **tek basina**
  yeterli bir engel degildir — o gun gereken sey rastgele parola + disariya
  yazma olurdu.
- ⚠️ **ADR-0017'nin parametreleri degistiginde:** betikteki kopya elle
  guncellenmelidir. Unutulursa denetim kullanicisi ilk giriste bir kez yeniden
  hash'lenir ve baska bir sey olmaz (§8) — ama kopya yine de bayat kalir.
- ⚠️ **Betigin uygulama koduna bir bagi olmasi gerektiginde:** o gun betik bir
  uygulama katmanina donusuyor demektir; ya `scripts/` icin ayri bir tsconfig
  acilir ya da is bir modulun icine tasinir.
