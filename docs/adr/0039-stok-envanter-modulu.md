# 0039 — Faz 5 / Modul 6: Stok / Envanter

- **Durum:** Onerildi
- **Tarih:** 2026-08-19
- **Karar veren:** Product Owner
- **Faz:** 5

> **Not.** Bu ADR yalnizca **karari** yazar; kod yazilmadi. Uygulama, asagidaki
> slice planina gore ayri ayri onaylanarak ilerler (CLAUDE.md Calisma Akisi).

## Baglam

Faz 5'in ilk **bes** modulu kapandi ve prod'da canli: CRM
([ADR-0031](0031-crm-module.md) + [ADR-0032](0032-company-summary.md)) ·
Projeler ([ADR-0033](0033-projects-module.md)) · Finans
([ADR-0034](0034-finance-module.md)) · Randevu/Rezervasyon
([ADR-0035](0035-randevu-rezervasyon-modulu.md)) · Belge/Sozlesme
([ADR-0037](0037-belge-sozlesme-yonetimi.md)). Platform seviyesinde iki is daha
kapandi: [ADR-0036](0036-context-retrieval-kota.md) (havuzun yapisal taban
kisiti) ve [ADR-0038](0038-oda-tasarim-sistemi.md) (ODA tasarim sistemi).

ROADMAP §3.5'in **altinci** sirasi **Stok / Envanter**'dir: _"Urun · miktar ·
hareket"_. **Yedinci sema.**

Zemin bes modulde sinandi; bu ADR ondan cogunlukla **yalnizca tuketici** olarak
yararlanir:

| Ne                       | Randevu'da              | Belge'de                    | Stok'ta                                      |
| ------------------------ | ----------------------- | --------------------------- | -------------------------------------------- |
| `EmbeddingPort`          | `shared/`'dan hazir     | `shared/`'dan hazir         | **`shared/`'dan hazir**                      |
| Chunk tablosu deseni     | **Reddedildi** (§3)     | **Geri dondu** (§3)         | **Yine REDDEDILIYOR** (§5)                   |
| Oran siniri              | Bir satir deklarasyon   | Bir satir deklarasyon       | **Bir satir deklarasyon**                    |
| Retrieval ucu            | Iki katkici             | TEK katkici                 | **Iki katkici** (§6, §7)                     |
| RLS + `FORCE` sablonu    | Dorduncu kez            | Besinci kez                 | **Altinci kez**                              |
| Kaynak bazli izin modeli | Dorduncu kez (genis)    | Besinci kez (genis)         | **Altinci kez (genis — §8)**                 |
| Cross-modul referans     | YENI bir dizin yazdi    | Iki hedef, sifir yeni dizin | ⚠️ **HIC YOK — v1'de sifir kenar** (§9)      |
| Modul imza rengi         | Iki satir + yeniden ad  | Iki satir                   | **Iki satir** (palet zaten olculmus)         |
| Oda tasarim sistemi      | —                       | —                           | ⚠️ **ILK KEZ ILK GUNDEN ODA** (§11)          |
| Havuz taban kisiti       | ADR-0036'yi **dogurdu** | ADR-0036'nin ilk sinavi     | ⚠️ **ADR-0036'nin ESIGINE 1 KALIYOR** (§7.2) |

Bu modul "altinci kez ayni sey" **degildir**. Gercekten yeni **dort** soru var:

1. ⚠️ **Modulun MERKEZI SAYISI turetilecek mi, saklanacak mi.** (§2) Bugune
   kadar "turetme" karari hep **ucuz** taraftan verildi: `ends_at` ayni satirin
   iki kolonundan, `last_activity_at` bir `MAX()`'tan. Stok miktari ise
   **baska bir tablonun tamamindan** turetilir ve **her listede, her `/ask`
   cagrisinda** okunur. Yani projenin sekiz kez verdigi karar ilk kez **gercek
   bir bedelle** sinaniyor.
2. ⚠️ **"Duzeltme" bir YON DEGILDIR.** (§3) Giris ve cikis bir aritmetik
   ekseni tanimlar; "duzeltme" ise bir **sebep**tir. Ucunu tek bir kolona
   koymak, ADR-0034 §5'in acikca reddettigi **isaretli miktar** tuzagini geri
   getirirdi.
3. ⚠️ **Miktarlar birimleri yuzunden TOPLANAMAZ.** (§4) ADR-0034 farkli para
   birimlerini toplamayi tip seviyesinde yasaklamisti; burada ayni sekil
   **kalem bazinda** karsimiza cikiyor — 3 kg un ile 12 adet vidanin toplami
   diye bir sey yoktur. Modulde **"toplam stok" diye bir rakam bulunmayacak**.
4. ⚠️ **Defter DEGISTIRILEMEZ — ve bu, ADR-0034'ten bilincli bir SAPMADIR.**
   (§3.3) Finans islemi duzeltilebilir; envanter hareketi duzeltilemez.
   Sebebi §2'nin dogrudan sonucudur: bugunku miktar **gecmisin tamamindan**
   turetiliyorsa, gecmisi degistirmek **bugunu sessizce yeniden yazar**.

> ⚠️ **Bu ADR'nin cizdigi sinir bir SAYIM sinirdir.** Stok v1 bir kalemin
> **ne kadar oldugunu, nasil o kadar oldugunu ve azaldigini** bilir.
> Depo/lokasyon, barkod, parti/son kullanma takibi, maliyet ve stok
> degerlemesi, rezervasyon, otomatik siparis **kapsam disidir** (§12). Bu bir
> asama degil bir **sinirdir**; genisletme talebi ayri bir ADR ister —
> ADR-0034'un muhasebe siniri, ADR-0035'in takvim siniri ve ADR-0037'nin arsiv
> siniriyla ayni disiplin.

---

## Karar

### 1. Yeni `inventory` semasi — iki tablo

**Yedinci sema** (`knowledge`, `crm`, `projects`, `finance`, `appointments`,
`documents`, `inventory`). Mutlak Kural 5: her modul kendi semasina sahiptir.

| Tablo                 | Ne tutar                                                                 |
| --------------------- | ------------------------------------------------------------------------ |
| `inventory.items`     | Kalem tanimi — ad · SKU · birim · esik · **opsiyonel kisa not + vektor** |
| `inventory.movements` | **Degistirilemez defter** — her giris/cikis/duzeltme AYRI bir satir      |

Ikisi de `tenant_id` tasir, ikisinde de `ENABLE ROW LEVEL SECURITY` +
`FORCE ROW LEVEL SECURITY` (MT §12.2 sablonu, **altinci kez**).
`movements.item_id → items.id ON DELETE CASCADE`; ⚠️ ayni sema icinde oldugu
icin bu **mesru bir FK**dir (Mutlak Kural 5 **cross-schema** FK'yi yasaklar).

```
inventory.items
  id                 uuid PK
  tenant_id          uuid NOT NULL -> platform.tenants (RESTRICT)
  name               text NOT NULL
  sku                text NULL
  unit               text NOT NULL              -- §4
  min_quantity       numeric(14,3) NULL         -- §6.1: NULL = alarm YOK
  note               text NULL                  -- §5
  embedding          vector(1536) NULL          -- §5
  archived_at        timestamptz NULL           -- §3.4
  created_by_user_id uuid NOT NULL
  created_at / updated_at

inventory.movements
  id                 uuid PK
  tenant_id          uuid NOT NULL -> platform.tenants (RESTRICT)
  item_id            uuid NOT NULL -> inventory.items (CASCADE)
  direction          text NOT NULL CHECK (direction IN ('in','out'))   -- §3
  quantity           numeric(14,3) NOT NULL CHECK (quantity > 0)       -- §3
  is_correction      boolean NOT NULL DEFAULT false                    -- §3.2
  occurred_at        timestamptz NOT NULL
  note               text NULL                  -- serbest metin, EMBED EDILMEZ
  created_by_user_id uuid NOT NULL
  created_at
```

⚠️ **`movements`de `updated_at` YOKTUR** ve bu bir unutma degil, §3.3'un
dogrudan sonucudur: guncellenmeyen bir satirin guncellenme zamani olmaz. Kolonu
koymak, ileride birinin "demek ki guncellenebiliyor" diye okuyacagi **sessiz
bir davet** olurdu.

#### 1.1 SKU tekilligi KUCUK/BUYUK HARFTEN BAGIMSIZDIR

`UNIQUE (tenant_id, lower(sku)) WHERE sku IS NOT NULL`.

- **Nullable**, cunku kucuk bir isletme SKU kullanmayabilir; zorunlu olsaydi
  kullanici `1`, `2`, `3` yazardi ve alan **anlamsizlasirdi**.
- ⚠️ **Kucuk/buyuk harf duyarsiz**, cunku `ABC-1` ile `abc-1`'in iki AYRI kalem
  olmasi tam olarak bu projenin reddettigi turden bir hatadir: ekran calisir,
  iki satir yan yana durur ve **stok ikiye bolunur**. Hata sessizdir; yalnizca
  "neden hep eksik cikiyoruz" sorusuyla fark edilir.

---

### 2. ⚠️ MEVCUT MIKTAR TURETILIR — `items`te miktar kolonu YOKTUR

**Karar: `quantity_on_hand` diye bir kolon ACILMAZ. Mevcut miktar her okumada
`SUM(giris) - SUM(cikis)` ile SQL'de hesaplanir.**

Bu, projede **dokuzuncu** kez verilen ayni karardir (`last_activity_at`'in
reddi · `finance.balances`'in reddi · `ends_at`'in reddi ·
`daily_report_runs.status`'un reddi · durgunlugun turetilmesi · nakit akisi
ozetinin turetilmesi …). Ama **bu sefer bedava degil**, ve karar ancak bedeli
acikca konusulursa gecerlidir.

#### 2.1 Iki secenek, durustce

| Olcut                  | **Kolon** (`items.quantity_on_hand`)                                     | **Turetme** (`SUM` over `movements`)                   |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------ |
| Okuma maliyeti         | ✅ Tek satir, indexlenebilir                                             | ❌ Kalem basina toplama; `movements` sinirsiz buyur    |
| Esik altini filtreleme | ✅ `WHERE quantity <= min_quantity` index kullanir                       | ❌ `HAVING` — once toplanir, sonra elenir              |
| Dogruluk               | ❌ **Iki dogruluk kaynagi** — hareket yazip kolonu guncellemeyen bir yol | ✅ **Tek dogruluk kaynagi** — defter                   |
| Hata **sekli**         | ⚠️ **SESSIZ ve YANLIS**: ekran bir sayi gosterir, sayi dogru gorunur     | ⚠️ **GURULTULU ve YAVAS**: sorgu yavaslar, olculebilir |
| Es zamanlilik          | ❌ Ayni kaleme iki hareket, satir uzerinde kilitlenir / yaris uretir     | ✅ Iki `INSERT` **hic carpismaz**                      |
| Geri alinabilirlik     | ❌ Kolonla baslanip deftere gecilirse **gecmis geri uretilemez**         | ✅ Turetmeden onbellege gecmek her zaman mumkun        |

#### 2.2 Karari veren uc arguman

**(a) HATANIN SEKLI.** Bu modulun tek isi **sayinin dogru olmasidir**. Kolon
secildiginde bozulma bicimi sudur: bir yazma yolu kolonu guncellemeyi unutur,
ekran **yanlis ama makul gorunen** bir sayi gosterir ve kimse fark etmez — ta
ki fiziksel sayimda tutmayana kadar. Turetme secildiginde en kotu bozulma
**yavasliktir**; yavaslik olculebilir, profillenebilir ve **kendini soyler**.
Projenin tekrar tekrar verdigi karar tam olarak budur: _"iki kolon senkron
kalmali"_ bir risk degil, **zamanla kesinlesen bir borctur**.

**(b) OLCULMUS DARBOGAZ BASKA YERDE.** Bu modulun ekleyecegi maliyet, her
`POST /ask`te bir `GROUP BY` demektir. ADR-0037'nin kapanis denetimi fan-out
payini **N=10'da ≤315 ms (%6)** olctu ve darbogazin `LLMPort.complete`
(4458 ms) oldugunu gosterdi. Yuz kalem ve on binlerce hareketli bir tenant'ta
tek bir toplama sorgusu bu butcenin icinde **kaybolur**. Olculmemis bir
performans korkusu icin **olculmus** bir dogruluk garantisinden vazgecmek,
ROADMAP §1.1'in izin cache'i icin yazdigi gerekcenin aynisiyla yanlistir:
_"bugun cache eklemek, olmayan bir darbogazi optimize etmektir."_

**(c) YON TEK.** Turetmeden onbellege gecmek her zaman mumkundur (bir
`quantity_on_hand` kolonu **sonradan** eklenip defterden doldurulabilir). Tersi
mumkun degildir: kolonla baslanip sonra deftere gecilirse **hicbir zaman
yazilmamis hareket gecmisi geri uretilemez** ve o gunku bakiye elle bir
"acilis" satirina donusturulmak zorunda kalir. ADR-0035 §3'un ayni cumlesi:
_"ucuz olan yonde durmak dogrudur."_

#### 2.3 ⚠️ `duration_minutes` GEREKCESI BURADA DA GECERLI — AMA AYNI DEGIL

Soru dogrudan soruldugu icin cevabi da acikca yazilir.

ADR-0035 §2d'de `ends_at` reddedilmisti ve gerekce **maliyetsizdi**: bitis
zamani **ayni satirin iki kolonundan** turetiliyor, yani turetmenin bedeli
sifir. Burada bedel sifir **degildir** — turetme baska bir tabloyu, potansiyel
olarak tamamini tarar.

Yani `ends_at`'in gerekcesi (_"iki kolon senkron kalmali"_) burada **gecerli
ama yeterli degildir**; tek basina dayanilsaydi karar **ucuz bir analoji**
olurdu. Karari tasiyan asil emsal **ADR-0034'un `finance.balances` reddidir**:
orada da toplama SQL'de yapilir, orada da kaynak sinirsiz buyuyen bir defterdir
(`finance.transactions`), ve orada da alternatif bir "bakiye kolonu" idi.
Finans uc modul boyunca bu kararla yasadi ve **bir kez bile geri donulmedi**.

⚠️ Fark yine de kayda geciriliyor: Finans'in ozeti **donem bazinda** okunur
(ay/ceyrek), Stok'unki **her listede** okunur. Yani bu, turetme kararinin
**en sicak** uygulamasidir ve olcum § Kapanis denetimi listesinde **zorunlu bir
maddedir**.

#### 2.4 Index'ler bu karara hizmet eder

```sql
CREATE INDEX ON inventory.movements (tenant_id, item_id);
CREATE INDEX ON inventory.movements (tenant_id, occurred_at DESC);
```

Ilki toplamanin, ikincisi hareket defteri listesinin sorgusudur. ⚠️ Bir
`quantity` **materialized view**'i ya da trigger ile bakim yapilan bir tablo
**acilmaz**: ikisi de kolonun sessiz hatasini baska bir yere tasir, ortadan
kaldirmaz.

---

### 3. ⚠️ "DUZELTME" UCUNCU BIR YON DEGILDIR

**Karar: `direction` YALNIZCA `'in'` veya `'out'` olur ve `quantity` HER ZAMAN
POZITIFTIR. "Duzeltme" bir yon degil, bir hareketin `is_correction = true`
isaretidir.**

#### 3.1 Neden uc degerli bir `kind` REDDEDILDI

Ilk akla gelen sekil `kind IN ('in','out','adjustment')`'dir ve **calismaz**:
`adjustment` tek basina miktarin **hangi yone** gittigini soylemez. Iki cikis
yolu var ve ikisi de kotu:

| Cikis yolu                                                 | Neden reddedildi                                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quantity`i **isaretli** yapmak (`-3` yazilabilir)         | ⚠️ **ADR-0034 §5'in ACIKCA reddettigi sey.** Isaret koymayi unutan tek bir yazma yolu, cikisi giris gibi toplar ve hata **sessizdir**. Finans'ta gideri gelir gibi toplamakti; burada cikisi giris gibi toplamak. **Ayni tuzak, ikinci modulde.** |
| `direction`i `adjustment` satirlarinda **NULLable** yapmak | Kolon satir bazinda **farkli anlamlar** tasirdi; `SUM(CASE WHEN direction='in' …)` ifadesi NULL satirlari **sessizce atlardi** ve miktar eksik cikardi.                                                                                           |

Secilen sekil ucuncusudur ve iki bilgi **ayri iki kolonda** yasar:

```
direction      -> ARITMETIK ekseni   ('in' | 'out')   NOT NULL, CHECK'li
is_correction  -> SEBEP              (true | false)   NOT NULL, DEFAULT false
```

Boylece toplama **her zaman ayni tek ifadedir** ve hicbir satir istisna
degildir:

```sql
COALESCE(SUM(CASE WHEN direction = 'in' THEN quantity ELSE -quantity END), 0)
```

⚠️ **`is_correction` bir susleme sanilmasin:** bir isletme icin "gercek akis"
ile "sayimda ortaya cikan fark" **farkli seylerdir**. Ikincisinin toplami
**fire/kayip** demektir ve tek bir kolonla sorulabilir olmasi degerlidir. Tek
degerde birlestirmek, ADR-0035 §2b'nin `no_show`/`cancelled` ayrimini yok
etmekle ayni siniftan bir kayip olurdu.

#### 3.2 Fiziksel sayim: kullanici SAYDIGINI yazar, DELTA'yi SUNUCU hesaplar

`POST /api/v1/inventory/counts` govdesi `{ itemId, countedQuantity, note? }`
alir. Sunucu **tek bir transaction icinde**:

1. Kalem satirini `SELECT … FOR UPDATE` ile kilitler (kalem satiri, kendi
   defterinin **kilit capasidir**),
2. mevcut miktari turetir (§2),
3. farki hesaplar: `delta = countedQuantity - mevcut`,
4. `delta > 0` ise `in`, `delta < 0` ise `out` yonunde **`is_correction = true`**
   bir hareket yazar.

⚠️ **Delta'yi istemciye hesaplatmak YASAK.** Istemci mevcut miktari bir onceki
istekte okumustur; arada baska bir hareket yazildiysa duzeltme **yanlis
miktarda** olur ve hata **sessizdir** — sayim, duzeltmesi gereken farki
**yeniden uretir**. Bu, modulun kilit gerektiren **tek** yeridir ve gerekcesi
budur.

⚠️ **`delta = 0` ise HICBIR SATIR YAZILMAZ.** `quantity > 0` kisiti sifirlik
bir hareketi zaten reddeder; ayrica "akis olmadi" bilgisini bir akis satirina
yazmak **yalan** olurdu. Uc `{ adjusted: false }` doner. **Bedeli § Bilinen sinirlar'da
kayitlidir**: "sayim yapildi ve tuttu" bilgisi hicbir yerde kalmaz.

#### 3.3 ⚠️ DEFTER DEGISTIRILEMEZ — ADR-0034'ten BILINCLI SAPMA

**Karar: bir hareket olusturulduktan sonra GUNCELLENEMEZ ve SILINEMEZ.
`stock_movement:delete` diye bir izin ACILMAZ.**

ADR-0034 bunun tersini yapmisti ve gerekcesi kayitliydi: _"yanlis tutar
duzeltilebilmeli — engellemek kullaniciyi telafi kayitlari yazmaya iterdi."_
Burada **tam tersi** karar veriliyor ve fark §2'den dogar:

| Modul      | Merkezdeki sayi                     | Bir gecmis satiri degistirilirse                                                                    |
| ---------- | ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Finans** | Her islem **kendi basina** bir olgu | O islemin degeri duzelir. Ozet zaten her seferinde yeniden toplanir.                                |
| **Stok**   | **Bugunku miktar** — TURETILMIS     | ⚠️ **Bugunku miktar da SESSIZCE degisir** ve "nasil bu hale geldik" sorusu cevaplanamaz hale gelir. |

Yani defterin degistirilebilir olmasi, §2'nin turetme kararini **anlamsiz**
kilardi: tek dogruluk kaynagi olmanin degeri, o kaynagin **gecmise donuk
sabit** olmasindadir. Telafi yolu zaten var ve **kullanicinin zaten yaptigi
sey**: ters yonde bir hareket yazmak (§3.2'nin sayim akisi bunu otomatik
yapar).

⚠️ Kabul edilen bedel: 10 yerine 100 yazan bir kullanici 90'lik bir `out`
hareketi yazmak zorundadir ve defterde **iki satir** kalir. Bu bir kusur degil,
**muhasebe disiplinidir**: olan biteni gizlemek yerine gostermek.

#### 3.4 Kalem SILINEMEZ, ARSIVLENIR — hareketi varsa

`DELETE /inventory/items/:id` yalnizca **hic hareketi olmayan** bir kalemde
basarilidir (yanlis acilmis bir kaydi temizlemek mesrudur). Hareketi varsa
**409** ve `StockItemHasMovementsError` doner; dogru yol `archived_at`
isaretlemektir.

Bu, ADR-0034'un `CategoryInUseError` deseninin **ikinci uygulamasidir**.
Silmeye izin verilseydi `ON DELETE CASCADE` tum defteri gotururdu — yani §3.3'te
degistirilemez ilan edilen defter, **tek bir `DELETE` ile yok edilebilirdi**.
Iki karar ancak birlikte tutar.

⚠️ **Arsivlenmis kalem yapisal katkiciya GIRMEZ** (§6.1): arsivlenmis bir
kalemin stogunun azalmasi **haber degildir**.

---

### 4. Birim SERBEST METINDIR — ve miktarlar TOPLANMAZ

**Karar: `unit text NOT NULL`, uzunluk siniri 16 karakter. Kodda enum YOK,
tenant sozlugu de YOK.**

Ucuncu kez ayni soru, ucuncu kez **farkli** cevap — ve olcut her seferinde
ayni: _kolon bir KISIT tasiyor mu?_

| Emsal                      | Sekil              | Cunku                                                                             |
| -------------------------- | ------------------ | --------------------------------------------------------------------------------- |
| `appointments.status`      | **Kodda enum**     | Dort deger her sektorde ayni sey demek; yapisal katkici anlamlarina **guveniyor** |
| `finance.categories`       | **Tenant sozlugu** | ⚠️ Kategori bir **KISIT tasiyor**: yon bilesik FK ile ondan zorlaniyor            |
| `documents.tags`           | **Serbest metin**  | Hicbir sey zorlamiyor, yalnizca etiketliyor                                       |
| **`inventory.items.unit`** | **Serbest metin**  | **Hicbir sey zorlamiyor** — birim ne filtrelenir ne toplanir, yalnizca **okunur** |

Birim bir tenant sozlugu olsaydi bir tablo, bir FK, bir "kullanimda" hatasi ve
bir yonetim ekrani gerekirdi — **tasidigi tek kisit icin: hicbiri.** Kodda enum
olsaydi bir firin (kg, cuval), bir hirdavatci (adet, metre) ve bir laboratuvar
(ml, mikrolitre) ayni listeye sigmazdi; ADR-0034'un kategori icin verdigi
gerekcenin aynisi.

⚠️ **Kabul edilen bedel:** `kg`, `Kg` ve `kilogram` ayni tenant'ta yan yana
yasayabilir. Cozumu bir tablo degil, **arayuzde o tenant'in daha once yazdigi
birimleri oneren bir liste**dir (§11). Bu bir veri butunlugu sorunu degil, bir
yazim rahatligi sorunudur — cunku birim **hicbir sorgunun boyutu degildir**.

#### 4.1 ⚠️ "TOPLAM STOK" DIYE BIR RAKAM YOK — ADR-0034'un para birimi kurali

3 kg un ile 12 adet vidanin toplami **yoktur**. Bu, ADR-0034'un _"farkli para
birimleri TOPLANMAZ ve `cashflowSummarySchema` bunu TIP SEVIYESINDE korur"_
kararinin **ayni sekli**, ikinci kez.

Sonuclari somut ve baglayici:

- Odanin kahraman rakami **"toplam stok" OLAMAZ** (§11): kahraman rakam
  **esik altindaki kalem sayisidir** — birimsiz, toplanabilir, anlamli.
- Yapisal katki miktarlari **her zaman birimiyle birlikte** yazar
  (`"Vida M8: 4 adet (esik 20)"`), ciplak sayi olarak degil.
- Hicbir uc, hicbir DTO **birden fazla kalemin miktarini toplayan** bir alan
  dondurmez.

#### 4.2 Miktar `numeric`tir ve JS'te STRING kalir

`numeric(14,3)` — cunku kg/litre kesirlidir; `integer` secmek "yarim kilo un"u
temsil edilemez kilardi ve kullanici grama gecmek zorunda kalirdi.

⚠️ **Miktar hicbir noktada JavaScript `number`ina cevrilmez** — ADR-0034'un
para icin verdigi kararin birebir aynisi. `numeric` sunucudan kanonik bir dize
olarak gelir ve oyle kalir; `Number`a cevirmek `0.1 + 0.2` sinifindan bir kayma
uretirdi ve hata **sessiz** olurdu. Binlik ayraci ADR-0038 §6.10'un kapattigi
mekanizmayla, **dizeyi bozmadan** goruntuleme katmaninda eklenir.

---

### 5. ⚠️ CHUNK TABLOSU YOK — ADR-0035'in deseni, ADR-0037'nin degil

**Karar: kalem notu DOGRUDAN `inventory.items.embedding` kolonuna gomulur.
`inventory.item_note_chunks` diye bir tablo ACILMAZ.**

Bu, iki emsal arasinda bir **secimdir** ve ikisi de acikca gerekcelendirilmisti:

| Emsal                     | Karar                 | Olcut                                                                                             |
| ------------------------- | --------------------- | ------------------------------------------------------------------------------------------------- |
| **ADR-0035 §3** (Randevu) | Chunk tablosu **YOK** | Metnin ust sinirini **BIZ** belirliyoruz — `service_note` siniri `TARGET_CHUNK_CHARS`'a esitlendi |
| **ADR-0037 §3** (Belge)   | Chunk tablosu **VAR** | Metnin ust sinirini **DOSYA** belirliyor — 40 sayfalik bir sozlesme gelebilir                     |

Iki ADR'nin birlikte urettigi kural ADR-0037'de yazildi:
_"chunk tablosu, metnin ust sinirini kullanici degil **verinin kendisi**
belirliyorsa acilir."_

**Stok notu birinci gruptadir.** Notun tanimi Product Owner tarafindan verildi:
_"parti no X, tedarikci Y"_ — yani bir kalemin **kimlik notu**, bir anlati
degil. Ust sinirini **biz** koyariz (`TARGET_CHUNK_CHARS` ile ayni buyukluk
sinifi) ve parcalayici bu sinirin altinda **her zaman tek parca** uretirdi;
ikinci tablo yalnizca bir `JOIN` maliyeti, ikinci bir RLS politikasi, ikinci
bir `tenant_id` denormalizasyonu ve retention listesinde ikinci bir satir
olurdu.

⚠️ **Bedeli ADR-0035 §3d ile birebir aynidir ve aynen ustlenilir: sinir
SUNUCUDA zorlanir ve asilirsa 422 doner. SESSIZ KIRPMA YASAK.** Kirpsaydi
kullanici notunun yarisinin arandigini **hic ogrenemezdi**.

⚠️ `embedding IS NULL` bu modulde de **mesru bir durumdur** — notsuz kalem
**cok yaygin** olacaktir (bir vidanin notu olmaz). Ayni kolon, iki
transaction'li akisin uretebildigi "gomulememis" halini de tasir ve **ayni
onarim yolu** (`POST /inventory/reindex`) ikisini birden kapatir.

> **Geri alinabilir ve yon tektir:** ileride gercekten uzun kalem notlari
> gorulurse `item_note_chunks` **eklenebilir**. Tersi mumkun degildir.

---

### 6. Iki katkici

ADR-0031 §5.4'un deseni **altinci** kez:

| Katkici           | Kaynak                | Nasil calisir                              | Izin              | `contributionKind` |
| ----------------- | --------------------- | ------------------------------------------ | ----------------- | ------------------ |
| `inventory-stock` | `items` + `movements` | **Yapisal** — deterministik SQL, SINIRLI   | `stock_item:read` | `'structural'`     |
| `inventory-items` | `items.embedding`     | Anlamsal — pgvector, **tek satir vektoru** | `stock_item:read` | `'semantic'`       |

⚠️ **`contributionKind` ZORUNLU bir alandir** (ADR-0036 §5): unutulursa
**derleme hatasidir**, sessiz bir kayip degil. Bu modul o alanin yazildigi
**ilk yeni modul**dur — yani ADR-0036'nin "unutuldugunda derleme hatasi"
iddiasinin ilk gercek sinavi.

#### 6.1 Yapisal katkici: RISKE GORE skor — duz 0.95 YASAK

ADR-0034/0035'in politikasi **ilk gunden** uygulanir:

```
esik ALTINDA veya NEGATIF kalem var                            -> 0.95   (gercek alarm)
esige YAKIN kalem var (miktar <= esik * INVENTORY_NEAR_RATIO)  -> 0.90   (dikkat)
saglikli / esik tanimlanmamis                                  -> 0.75   (bilgi)
```

- `min_quantity IS NULL` → o kalem **hicbir zaman alarm uretmez**. NULL ile 0
  **farkli seylerdir ve ikisi de anlamlidir**: NULL "bu kalemi izleme", 0 ise
  "tukendiginde haber ver". Esigi zorunlu kilsaydik kullanici 0 yazardi ve
  "izlenmiyor" hali **yapilandirilmis gibi gorunurdu**.
- ⚠️ **Hicbir kalem yoksa katkici `[]` DONER.** ADR-0036 §2 tabani "gercekten
  satir donduren" yapisal kaynaklarla sinirlar; bos bir envanter icin yuva
  ayirmak havuzu **bos** yuvalarla harcamak olurdu.
- ⚠️ `INVENTORY_NEAR_RATIO` bir **sabittir** ve **web'de bir karsiligi olursa
  ikisi senkron kalmak zorundadir** — `CRM_STALE_STAGE_DAYS` / `STALE_STAGE_DAYS`
  ayrismasinin **ucuncu** tekrari. Ayrisirlarsa hata sessizdir: ekran "yaklasti"
  der, katkici 0.75 verir.

Katkinin icerigi **sabit ve kucuk** tutulur: esik altindaki/negatif kalemlerin
sayisi ve en kritik birkac tanesi (**ad + miktar + birim + esik**, §4.1) +
donem ozeti (kalem sayisi · son 7 gunun giris/cikis hareket sayisi). Bedeli
acikca: her soruda gonderilir, yani soru stokla ilgisiz olsa bile birkac yuz
token maliyeti vardir — ve bu maliyet artik **besinci** kez ekleniyor.

⚠️ **NEGATIF miktar en yuksek seviyede raporlanir** (§10): negatif stok fiziksel
olarak imkansizdir, yani **kaydin kendisi tutarsizdir** ve kullanicinin bunu
ogrenmesi "esik altinda"dan daha aciledir.

#### 6.2 Anlamsal katkici: baglam basligi — ve BAYATLAMA PENCERESI ILK KEZ KAPALI

Gomulen metin ciplak `note` degildir; onune **baglam basligi** konur — projede
**besinci** kez ayni karar:

```
[Stok · VDA-M8 · Vida M8 galvaniz] parti no 2026-04, tedarikci Yildiz Civata
```

Uc parca: **sabit etiket** + **SKU (varsa)** + **kalem adi**.

⚠️ **Bu, basliga giren denormalize adin ILK KEZ AYNI SATIRDA yasadigi
moduldur** — ve sonucu onemlidir:

| Modul    | Baslikta ne var       | Ad nerede yasiyor            | Bayatlama                                                                                                                       |
| -------- | --------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| CRM      | Sirket adi            | `crm.companies` (ayri satir) | Yeniden adlandirmada **bayatlar**, `reindex` ile duzelir                                                                        |
| Projeler | Proje adi             | `projects.projects`          | Ayni                                                                                                                            |
| Randevu  | CRM kisisinin adi     | ⚠️ **BASKA SEMADA**          | Ayni — ve modul degisimden **haberdar bile degil**                                                                              |
| **Stok** | **Kalemin KENDI adi** | ⚠️ **AYNI SATIR**            | ✅ **Bayatlama penceresi YOK** — yeniden adlandirma zaten bu satirin `PATCH`idir ve **ayni islemde embedding YENIDEN URETILIR** |

Yani ad degisimi bu modulde bir "sonradan onarim" isi degil, **yazma yolunun
kendisidir**. `POST /inventory/reindex` yine **ilk gunden** vardir ama artik tek
bir isi kaldi: **gomulememis** notlari onarmak
(`WHERE note IS NOT NULL AND embedding IS NULL`).

⚠️ Basliga **yalnizca bir ad** girer (ADR-0033'un kurali): SKU bir addir ama
**ayni satirin** kolonudur, yani ikinci bir bayatlama yuzeyi acmaz.

---

### 7. ⚠️ Katkici sayisi ONIKIYE cikiyor — ADR-0036'nin esigine BIR kaliyor

#### 7.1 Sayilar

| Olcu                      | Belge sonrasi     | **Stok sonrasi**              |
| ------------------------- | ----------------- | ----------------------------- |
| Anlamsal kaynak           | 6                 | **7** (`inventory-items`)     |
| Yapisal kaynak            | 4                 | **5** (`inventory-stock`)     |
| Toplam katkici (fan-out)  | 10                | **12**                        |
| Global top-K              | 8                 | **8 — DEGISMEDI**             |
| Yapisal taban `ceil(K/3)` | 3                 | **3 — DEGISMEDI**             |
| Serbest yuva              | 5 (6 kaynak icin) | **5 — ama 7 kaynak arasinda** |

#### 7.2 ⚠️ ADR-0036'nin YENIDEN GOZDEN GECIRME ESIGINE BIR KALDI

ADR-0036 kendi tetikleyicisini yazmisti:

> _"**Yapisal kaynak sayisi tabanin iki katini gectiginde** (bugun 4, esik 6):
> o noktada kaynaklarin yarisindan fazlasi garanti disinda kalir ve 'genislik'
> vaadi anlamini yitirmeye baslar."_

Bu modul yapisal kaynak sayisini **4 → 5** yapiyor. **Esik (6) ASILMIYOR** ama
**bir adim kaliyor** ve bu acikca kaydediliyor:

> ⚠️ **7. modul (Tedarikci Yonetimi) bir yapisal katkici eklerse esik ASILIR ve
> ADR-0036 yeniden acilmak ZORUNDADIR.** O modulun ADR'si bu satiri okumak
> zorundadir; okunmazsa taban sessizce anlamini yitirir — bes yapisal kaynaktan
> ucu her cevapta duyulur, alti kaynaktan ucu ise **yarisindan azi** demektir.

Ayrica **taban artik gercekten yarisiyor**: bes yapisal kaynak, uc garanti yuva
icin siralanacak. ADR-0036'nin _"dordunculuk garantisi YOK"_ siniri artik
**besincilik** olarak okunmalidir — ve disarida kalanlarin **iki** olmasi
bekleniyor.

⚠️ **Anlamsal tarafta baski da artiyor:** bes serbest yuva icin artik **yedi**
kaynak yarisiyor. ADR-0037 §8.2 bir anlamsal kaynagin sifir almasinin **yazili
beklenti** oldugunu kaydetmisti; bu modulden sonra ayni sey **iki** kaynak icin
gecerli olabilir. Yine bir kusur degil, **liyakattir** (ADR-0036 §Bilinen
sinirlar).

⚠️ **Bu ADR ADR-0036'yi DEGISTIRMEZ.** Taban 3 kalir, formul degismez, hicbir
katkicinin skorlama mantigina dokunulmaz. Degisen tek sey havuzun
**kalabaliligidir** ve olcum § Kapanis denetimi listesinde **zorunlu bir maddedir**.

---

### 8. Izinler — katalog GENIS, adlar NITELENMIS

ADR-0025'in `resource:action` modeli, **altinci** kez.

| Permission             | owner | admin | member | viewer |
| ---------------------- | :---: | :---: | :----: | :----: |
| `stock_item:read`      |  ✅   |  ✅   |   ✅   |   ✅   |
| `stock_item:write`     |  ✅   |  ✅   |   ✅   |   ❌   |
| `stock_item:delete`    |  ✅   |  ✅   |   ❌   |   ❌   |
| `stock_movement:read`  |  ✅   |  ✅   |   ✅   |   ✅   |
| `stock_movement:write` |  ✅   |  ✅   |   ✅   |   ❌   |

#### 8.1 Neden GENIS

ADR-0034 §7'nin kendi olcutu aynen tutuyor: _"musteri listesi ve gorev listesi
PAYLASILAN is gercekleridir, sirketin nakit akisi degildir."_

**Stok seviyesi paylasilan bir operasyonel gercektir** — hatta bu listedeki en
operasyoneli. Depodan malzeme alan, siparis hazirlayan, uretim yapan kisi **tam
olarak** `member` rolundeki kisidir; onun "kac tane kaldi"yi gorememesi modulun
**var olus sebebini** ortadan kaldirir. Finans'in dar katalogu buraya
uygulansaydi modul, onu kullanmasi gereken herkese **kapali** olurdu.

⚠️ Belge'nin (ADR-0037) _"dar katalog yanlis bir guvenlik hissi verirdi"_
argumani burada **gecerli degildir** ve bu fark kayda geciyor: stok verisi kalem
bazinda hassasiyet tasimaz — bir vidanin adedi ile bir baska vidanin adedi
**ayni siniftan** bilgidir. Yani burada genis katalog bir **taviz degil, dogru
sekildir**.

⚠️ **Yan etki: bu modul de `POST /ask` izin filtresini TETIKLEMEZ.** Iki
katkicinin da kapisi `stock_item:read` ve dort rol de onu tasiyor. Filtrenin tek
gercek tetikcisi **hala Finans**tir (`cashflow:read` / `commentary:read`).

#### 8.2 ⚠️ Ad `item` DEGIL `stock_item` — ve gerekcesi ZATEN YAZILI

ADR-0037 `document`i **nitelemedi** ve gerekcesini soyle yazdi:

> _"`finance_category` nitelenmisti cunku bir baska modulun 'kategori'si olmasi
> COK MUHTEMELDI (**Stok/Envanter**)."_

Ayni test `item` icin uygulaniyor ve **sonuc tersine cikiyor**: "item" projedeki
en cok talip olan kelimedir. **8. modul (Teklif/Fatura)** tanimi geregi
**fatura satiri = line item** kavramini getirecek; `item:read` o gun ya yeniden
adlandirilmak zorunda kalir (**breaking change**) ya da iki modul tek kelimeyi
paylasir.

Bu yuzden kaynak adlari **bugunden nitelenir**: `stock_item`, `stock_movement`.
⚠️ Sema ve rota adi `inventory` kalir (`/api/v1/inventory/...`,
`data-module="inventory"`) — nitelenen sey **izin kaynagidir**, modul degil.

⚠️ `stock_movement:delete` **yoktur ve olmayacaktir** — §3.3'un dogrudan sonucu.
Bir izni acmamak, sonradan kapatmaktan kolaydir.

---

### 9. ⚠️ CROSS-MODUL REFERANS v1'DE YOK — sifir yeni kenar

**Karar: `inventory` semasi HICBIR baska modulun kaydina isaret etmez ve hicbir
modulun `public.ts`'ine dokunmaz.**

Bu, CRM'den bu yana **bagimlilik grafigine hicbir kenar eklemeyen ilk is
modulu**dur. Grafik **alti kenarda** kalir ve **hala DAG**tir:

```
katman 0: CRM · INVENTORY (yeni — cikan kenari YOK)
katman 1: Projeler -> CRM
katman 2: Finans -> CRM, Projeler   Randevu -> CRM   Belge -> CRM, Projeler
```

**Iki aday degerlendirildi ve ikisi de v2'ye birakildi:**

| Aday                                        | Neden bugun DEGIL                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tedarikci baglantisi** (`supplier_id`)    | ⚠️ **Tedarikci modulu HENUZ YOK** (ROADMAP §3.5'te 7. sirada). Dogrulanamayan bir isaretciyi kabul etmek **ADR-0033 Slice 1'in ogrettigi hatanin ta kendisidir**: ilk gunden sarkan satir uretirdi ve dogrulayacak dizin **yazilamazdi** cunku hedef sema mevcut degil.                                 |
| **Projeye malzeme tuketimi** (`project_id`) | Yon sorusu **gercekten acik**: proje mi kendi malzemelerini listeler, malzeme mi kendi projelerini? Ilki `Projeler -> Stok`, ikincisi `Stok -> Projeler` kenari demektir ve ikisi **ayni anda** yazilirsa **DONGU** olur (Tenant ↔ Identity tuzagi). Bu, tek satirlik bir kolon degil bir **karardir**. |

#### 9.1 ⚠️ 7. MODUL ICIN ILERI NOT — dizini STOK yazacak

ADR-0037 §4.1'in netlestirdigi kural: _"yeni TALIP → dosya degismez; yeni KAYNAK
TURU → sahibi modul kendi dizinini yazar."_

Tedarikci modulu bir kalemi gostermek isteyecek (ROADMAP §3.6: _"Tedarikci →
Stok"_). Kalem **yeni bir kaynak turudur**, yani:

> ⚠️ O gun **`inventory.public.ts` yazilir ve onu YAZAN modul STOK'tur** —
> `StockItemDirectory.findNames(ids, role)`, izin kapisi (`stock_item:read`)
> **arayuzun icinde**. Sozlesme sekli **dorduncu kez** ayni; genellestirme yine
> yapilmaz (ADR-0034 §4.1'in reddi).

Bu satir bugunden yaziliyor cunku o isin **hangi modulun ADR'sine ait oldugu**
sonradan tartisilirsa yanlis yere dusebilir.

---

### 10. Exception filter — DORT hata tipi, hepsi ILK GUNDEN

**Karar: `InventoryDomainExceptionFilter` `@Catch(...)` listesi BASTAN yazilir.**

ADR-0035 §8'in genellenmis kurali dogrudan uygulanir: bir hata tipi _"bugun
tetiklenemez"_ diye ertelenirse, tetiklenebildigi gun **ham 500** doner ve kusur
**sessizdir**.

| Hata                         | HTTP | `DisclosableProblem` | Ne zaman                                                                |
| ---------------------------- | ---- | -------------------- | ----------------------------------------------------------------------- |
| `EmbeddingFailedError`       | 502  | ✅ **EVET**          | Notlu kalem yazilirken saglayici coker — kayit **acilir**, not gomulmez |
| `RateLimitExceededError`     | 429  | ❌ (4xx zaten gecer) | `Retry-After` ile                                                       |
| `StockItemHasMovementsError` | 409  | ❌                   | Hareketi olan kalem silinmeye calisilir (§3.4)                          |
| `StockItemNotFoundError`     | 404  | ❌                   | —                                                                       |

⚠️ **`CompletionFailedError` YOKTUR** cunku bu modulde **modul ici AI yuzeyi
yok** (ADR-0033'un Projeler icin verdigi ayni karar). Bir "stok ozeti" eklendigi
gun bu satir **yeniden baglayici** olur.

⚠️ **`StorageFailedError` YOKTUR** — bu modul dosya saklamaz.

⚠️ Eslenmemis domain kodunun 500'u **maskeli kalir** ve bunu **bir test
kilitler** — o test olmasaydi, maskenin tumuyle kalktigi bir regresyonda diger
testler de yesil yanardi (ADR-0035'in bes modulluk dersinin altinci uygulamasi).

---

### 11. Frontend: ODA — ilk gunden, yarim gecis YOK

⚠️ **Bu, ADR-0038'in ODA sisteminde SIFIRDAN dogan ilk moduldur.** Onceki bes
modulun ekranlari `ModuleHeader`/`ModuleBody` doneminde yazilip odaya
**cevrildi**; burada donusturulecek bir sey yok.

#### 11.1 Renk: iki satir, kalibrasyon GEREKMIYOR

`module-colors.css` bu modulun paletini **zaten olculmus** olarak tasiyor:

```
[data-module='inventory']  acik #876b1c (ink #785c00) · koyu #c2a45a (ink #d3b56b)
```

Dosyanin kendi notu bu rengi **acikca acikliyor**: _"TURUNCU BANDI YASAK.
Terracottanin cevresinde ±35°'lik koridor bos. **Stok'un hardali bandin en
yakin komsusu ve bilincli olarak sariya cekildi.**"_ Yani renk, modulu yazan
kisinin secebilecegi bir sey degildir ve **secilmemistir**; OKLCH kalibrasyonu
FRONTEND §4.8'de zaten yapilmistir.

Yapilacak is **iki satirdir**: layout'ta `data-module="inventory"` + koridorda
(`sidebar`) satirin `LIVE` olmasi. ⚠️ `data-module` unutulursa hata
**SESSIZDIR**: ekran calisir, terracotta kalir, lint yakalamaz — § Kapanis denetimi'nin renk
turu maddesi bunun icindir.

#### 11.2 Iki rota, TEK duvar — ADR-0038 §6.5'in dogrudan uygulamasi

| Rota                       | Duvar (**ORTAK**)                                       | Tezgah                                             |
| -------------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| `/app/inventory`           | Esik altindaki kalem sayisi + delta + asistanin cumlesi | **Kalem listesi** — miktar · birim · esik isareti  |
| `/app/inventory/movements` | ⚠️ **AYNI DUVAR**                                       | **Hareket defteri** — tarih · yon · miktar · sebep |

⚠️ **Duvar kopyalanmaz, paylasilan bir bilesendir** (`inventory-wall.tsx`) —
ADR-0038 §6.5'in `finance-wall.tsx` icin yazdigi kuralin aynisi. Iki rota **ayni
soruyu** cevapliyor (_"stok durumu ne"_); farkli soru olsaydi duvar da farkli
olurdu (§6.5'in `/finance/categories` istisnasi).

**Kahraman rakam "toplam stok" DEGILDIR** (§4.1) — birimler toplanamaz.
Kahraman: **esik altindaki kalem sayisi**. Uydular: toplam kalem sayisi · son 7
gunun giris/cikis hareket sayisi · negatif miktarli kalem sayisi (varsa).

#### 11.3 Bu modulun tek gercek yeni arayuz sorusu: HAREKET YAZMA

Hareket yazmak **en sik tekrarlanan** eylemdir ve her seferinde tam form acmak
yanlistir. Karar: kalem satirindan **satir ici hizli giris** (miktar + yon),
ayrintili form (tarih, not) ikincil.

⚠️ **Fiziksel sayim AYRI bir akistir ve oyle gorunmelidir** (§3.2): kullanici
**saydigi sayiyi** yazar, farki **sunucu** hesaplar. Arayuzde "duzeltme" ile
"giris/cikis" ayni dugmeye baglanirsa kullanici sayim sonucunu bir cikis olarak
yazmaya calisir ve **fark yerine mutlak degeri** girer — hata sessiz olur ve
stogu **tamamen** bozar.

⚠️ **Yeni kutuphane YOK** (ADR-0035 §7'nin takvim reddi / `recharts` reddi):
grafik gerekiyorsa ADR-0038 §6.7'nin mevcut cizimleri kullanilir.

---

### 12. Kapsam disi (bugun yapilmiyor)

**Stok siniri** — bunlar "sonra ekleriz" degil, **v1'in tanimi disidir**:

- **Barkod / QR** — ⚠️ bir **cihaz/kamera yuzeyi** sorusudur, bir veri modeli
  sorusu degil. `sku` alani hazirdir; okuyucu geldigi gun tabloda hicbir sey
  degismez.
- **Coklu depo / lokasyon** — ⚠️ **veri modelini degistirir**: miktar `(kalem)`
  basina degil `(kalem, lokasyon)` basina turetilir ve **transfer** denen ucuncu
  bir hareket sekli dogar (tek islemde bir cikis + bir giris). Sonradan
  eklenebilir ama **ucuz degildir**; bugun eklemek, olmayan bir ihtiyaci
  tasarlamaktir.
- **Otomatik siparis verme** — ⚠️ Tedarikci modulunu **ve** bir zamanlayici
  karari (ROADMAP §2.3'un hala verilmemis **Queue** karari) ister.
- **Tedarikci baglantisi** (§9) · **Projeye malzeme tuketimi** (§9).
- **Maliyet ve stok degerlemesi** (birim maliyet, FIFO/ortalama, stok degeri) —
  ⚠️ **en cok istenecek ve en tehlikeli olan**. Bir "stok degeri" rakami
  **muhasebe** rakamidir; bu modulde uretilirse Finans'in disinda **ikinci bir
  mali gerceklik** dogar ve `Stok -> Finans` kenari kacinilmaz olur. Ayri ADR.
- **Parti / seri no ve son kullanma takibi** — ⚠️ **acikca soylenmesi sart**:
  Product Owner'in ornek notu _"parti no X"_ idi ve o **serbest metindir,
  yapisal bir boyut degildir**. Yani _"bu ay hangi partilerin son kullanma
  tarihi doluyor"_ sorusu v1'de **sorulamaz**; not yalnizca anlamsal aramaya
  girer. Gercek parti takibi, miktarin `(kalem, parti)` basina turetilmesi
  demektir — coklu lokasyonla **ayni siniftan** bir model degisikligi.
- **Rezervasyon / tahsis** ("bu 10 adet su siparise ayrildi") — "eldeki" ile
  "kullanilabilir" arasinda **ikinci bir miktar kavrami** dogurur.
- **Birim cevrimi** (koli ↔ adet, kg ↔ gram) — §4'un serbest metin karari bunu
  tanimi geregi disarida birakir.
- **Degisiklik denetim izi** — ADR-0034'un borcu; tetikleyici degismedi
  (8. modul). ⚠️ Bu modulde borcun bir kismi **kendiliginden** kapaniyor:
  hareket defteri degistirilemez oldugu icin (§3.3) **miktarin nasil o hale
  geldigi her zaman sorulabilir**. Kapanmayan kisim: bir kalemin **esiginin veya
  adinin** kim tarafindan degistirildigi.

---

## Gerekce

**Neden bu modul ROADMAP §3.5'te 6. sirada dogru duruyor.** Stok, kendisinden
sonraki iki modulun (**7. Tedarikci**, **8. Teklif/Fatura**) isaret edecegi bir
kaynaktir. Once yazilmasi, o iki modulun kendi paralel "urun" kavramlarini
kurmasini engeller — ROADMAP'in `8 → 3` bagimliligi icin verdigi ayni gerekce.

**Neden turetme (§2) bu ADR'nin merkezi karari.** Modulun urettigi butun deger
tek bir sayidadir. O sayinin **iki yerde** yasamasi, projenin dokuz kez
reddettigi seydir; ve reddetmenin bedeli ilk kez gercekten olculebilir oldugunda
karar **degismiyor** — cunku olculmus darbogaz (`LLMPort.complete`, ~4.5 s)
yaninda bir `GROUP BY` gorunmez, ama yanlis bir stok rakami **isletmeyi
durdurur**.

**Neden defter degistirilemez (§3.3), Finans'ta degistirilebilirken.** Iki karar
celismiyor; ayni olcut iki farkli cevap veriyor — tipki ADR-0035 §3 ile
ADR-0037 §3'un chunk tablosu icin verdigi iki zit cevabin ayni olcutten gelmesi
gibi. Olcut sudur: **bugunku gercek gecmis kayitlardan TURETILIYOR mu?** Finans'ta
hayir (her islem kendi basina bir olgu), Stok'ta evet.

**Neden cross-modul referans yok (§9).** Bu modul, desenin **olgunlugunun**
kaniti: bes modul boyunca her yeni modul en az bir kenar ekledi ve her seferinde
bunun bir slice'i oldu. Burada gercekten gerekmiyor ve **gerekmediginde
eklememek** desenin kendisi kadar onemlidir — ADR-0037'nin _"cross-modul icin
ayri bir slice GEREKMEDI"_ ozgurlugunun bir adim otesi: kenarin kendisi de
gerekmedi.

---

## Sonuclari

**Olumlu**

- Modulun merkezi sayisi **tek bir dogruluk kaynagindan** gelir; senkron kalmasi
  gereken ikinci bir kolon **yoktur**.
- Es zamanli hareketler **birbiriyle carpismaz** — projenin bes modulde kayitli
  _"iyimser es zamanlilik yok, son yazan kazanir"_ siniri bu modulun **en onemli
  sayisi icin gecerli degildir**.
- Defter degistirilemez oldugu icin _"miktar nasil bu hale geldi"_ sorusu **her
  zaman** cevaplanabilir — `platform/audit` borcunun bir kismi bu modulde
  kendiliginden kapanir.
- Bagimlilik grafigine **hicbir kenar eklenmez**; grafik alti kenarda kalir.
- Renk, oran siniri, RLS sablonu, izin modeli, katkici deseni, exception filter
  deseni: **altisi da hazir geliyor**. ADR'nin degeri kisaliginda degil, **yeni
  karar sayisinin dortte kalmasindadir** — zeminin ise yaradiginin olcusu budur.

**Olumsuz / bedeli**

- ⚠️ **Miktar sorgusu bu modulun en sicak yoludur** ve `movements` sinirsiz
  buyur. Bugun index'lerle yeterli; **olcum § Kapanis denetimi'nde zorunludur** ve bir gun
  onbellek gerekirse yon aciktir (§2.2c).
- ⚠️ **Esik altini filtrelemek index kullanamaz** (`HAVING`): once toplanir,
  sonra elenir. Kalem sayisi sinirli oldugu icin (bir tenant'in kalem sayisi
  hareket sayisi gibi buyumez) kabul edilebilir.
- ⚠️ **Havuz daha da kalabaliklasti** (§7): yedi anlamsal kaynak bes serbest
  yuva icin yarisiyor ve ADR-0036'nin yeniden gozden gecirme esigine **bir
  kaldi**.
- **Duzeltilmis bir hata defterde IKI SATIR birakir** (§3.3) — okumasi ilk
  bakista kafa karistirici.
- **Birim serbest metin oldugu icin yazim varyantlari olusabilir** (§4).
- Fan-out **N=12**'ye cikti; her `/ask` iki katkici daha cagiriyor.

---

## Degerlendirilen alternatifler

| Alternatif                                                           | Neden secilmedi                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`items.quantity_on_hand` kolonu** (hareketle birlikte guncellenir) | Ikinci dogruluk kaynagi. Hata **sessiz ve yanlis** (§2.2a); es zamanli hareketler satir uzerinde yarisir; ve yon **geri alinamaz** (§2.2c). Projenin dokuz kez verdigi kararla celisir.                                                                             |
| **Trigger ile bakim yapilan miktar kolonu**                          | Sessiz hatayi ortadan kaldirmaz, **yerini degistirir**: bu sefer trigger ile defter arasinda senkron kalmasi gereken bir sey olur ve trigger mantigi migration'larda **gorunmez** bir is mantigina donusur.                                                         |
| **Materialized view**                                                | Tazeleme zamani yeni bir soru dogurur ve **bayat okuma** uretir. Bir tazelemenin unutulmasi tam olarak reddedilen sessiz hatadir (`last_activity_at` dersinin ayni sekli).                                                                                          |
| **Uc degerli `kind IN ('in','out','adjustment')`**                   | `adjustment` yonu **soylemez**; ya isaretli miktar (**ADR-0034 §5'in acikca reddettigi**) ya da NULLable `direction` gerektirir. Ikisi de sessiz hata uretir (§3.1).                                                                                                |
| **Hareketlerin duzenlenebilir/silinebilir olmasi** (Finans gibi)     | Bugunku miktari **turetilmis** kilan karari (§2) anlamsizlastirirdi: gecmisi degistirmek bugunu sessizce yeniden yazar. Telafi yolu zaten var (ters hareket / sayim).                                                                                               |
| **Birim icin tenant sozlugu** (Finans kategorisi gibi)               | Kategori bir **KISIT tasiyordu** (yon, bilesik FK ile zorlaniyordu); birim **hicbir sey zorlamaz**. Tablo + FK + "kullanimda" hatasi + yonetim ekrani, sifir kisit icin odenirdi (§4).                                                                              |
| **Birim icin kodda enum**                                            | Firin (kg, cuval) · hirdavatci (adet, metre) · laboratuvar (ml) ayni listeye sigmaz — ADR-0034'un kategori icin verdigi ayni gerekce.                                                                                                                               |
| **`item_note_chunks` tablosu** (Belge gibi)                          | Notun ust sinirini **BIZ** koyuyoruz; parcalayici her zaman tek parca uretirdi (§5). ADR-0035 §3'un tam olarak ayni durumu.                                                                                                                                         |
| **Negatif stogu ENGELLEMEK** (cikis > mevcut ise 422)                | Isletmeyi **yalan soylemeye** iter (satis kaydini girip irsaliyeyi bekleyen kullanici). Ayrica her cikis hareketinde kilit gerektirir — sicak yolu serilestirirdi. ADR-0035 §2e'nin ayni karari: **v1 kayit tutar, kural koymaz**; negatiflik §6.1'de **alarm**dir. |
| **Kalem silmeye izin vermek** (CASCADE ile defter de gitsin)         | §3.3'te degistirilemez ilan edilen defter, tek bir `DELETE` ile yok edilebilirdi. `CategoryInUseError` deseni ikinci kez uygulandi (§3.4).                                                                                                                          |
| **Izin adi `item:*`**                                                | ⚠️ 8. modul (Teklif/Fatura) **line item** kavramini getirecek; ad ya breaking change ile degisirdi ya da iki modul tek kelimeyi paylasirdi. ADR-0037'nin `finance_category` icin yazdigi gerekce **birebir** (§8.2).                                                |
| **v1'de Projeler'e malzeme tuketimi baglantisi**                     | Yon sorusu gercekten acik ve yanlis yon **DONGU** kurar (§9). Kolon degil **karar** gerektirir.                                                                                                                                                                     |
| **v1'de tedarikci baglantisi**                                       | Hedef sema **mevcut degil**; dogrulanamayan isaretci ADR-0033 Slice 1'in acikca ogrettigi hatadir (§9).                                                                                                                                                             |

---

## Bilinen sinirlar

- ⚠️ **Miktar sorgusu `movements` buyudukce yavaslar.** Bugun index'lerle
  yeterli; **olculmemis** bir sinir degil, **olculecek** bir sinirdir (§ Kapanis denetimi).
  Onbellege gecis yolu aciktir ve tek yonludur.
- ⚠️ **"Sayim yapildi ve tuttu" bilgisi HICBIR YERDE kalmaz** (§3.2): fark
  sifirsa satir yazilmaz. Bir sayim gunlugu v2'dir.
- ⚠️ **Negatif stok mumkundur.** Kayit tutulur, engellenmez; §6.1'de en yuksek
  alarm seviyesinde raporlanir. Duzeltmesi fiziksel sayimdir.
- ⚠️ **Parti/seri no ve son kullanma tarihi YAPISAL DEGIL** (§12): notta
  yazilabilir, **sorgulanamaz**.
- ⚠️ **Depo/lokasyon yok** — tek bir havuz varsayilir. Iki deposu olan bir
  isletme icin miktar **dogru ama yetersizdir**.
- ⚠️ **Birim varyantlari olusabilir** (`kg` / `Kg` / `kilogram`) ve **birimler
  arasi toplama yoktur** (§4.1) — "toplam stok" diye bir rakam bilincli olarak
  **yoktur**.
- ⚠️ **Kalemin adinin/esiginin kim tarafindan degistirildigi sorulamaz** —
  `platform/audit` borcu (8. modul). Hareket tarafinda bu borc **yok** (§3.3).
- ⚠️ **`stock_item:read` tasiyan herkes TUM kalemleri gorur** — belge bazli
  gizliligin (ADR-0037) stok karsiligi; burada zararsiz kabul edildi (§8.1).
- ⚠️ **ADR-0036'nin yeniden gozden gecirme esigine BIR KALDI** (yapisal kaynak
  5, esik 6) — §7.2. **7. modulun ADR'si bunu okumak zorundadir.**
- ⚠️ **Iki anlamsal kaynagin sifir alabilmesi BEKLENEN sonuctur** (§7.2) —
  ADR-0036'nin yazili beklentisi, bir kusur degil.
- **Iyimser es zamanlilik yok** — kalem **tanimi** icin altinci kez ayni sinir.
  ⚠️ Miktar icin **gecerli degildir** (§ Sonuclari).
- **`embedding`de model/surum bilgisi yok** · **arama yalnizca anlamsal**
  (ADR-0011, yedinci kez) — ikisi de ayni sinirin tekrari.
- ⚠️ **Retention borcu ONBESTEN ONYEDIYE cikar** ve **yeni bir sekil** getirir:
  bkz. asagidaki RETENTION basligi.

### ⚠️ RETENTION: bu tablo SILINIRSE BUGUNKU SAYI DEGISIR

ROADMAP §8.5'in listesi **onbesten onyediye** cikar (`inventory.items` +
`inventory.movements`); vektor tasiyan tablo sayisi **altidan YEDIYE** cikar
(`items.embedding` satir icinde — `appointments.appointments` ile ayni sinif,
chunk tablosu yok).

⚠️ **Ama bu kalem listedeki DIGERLERINDEN YAPISAL OLARAK FARKLIDIR** ve bu fark
kaydedilmezse ileride gercek bir veri kaybi uretir:

| Liste kalemi                    | Eski satirlari silmek ne kaybettirir                 |
| ------------------------------- | ---------------------------------------------------- |
| `messages`, `login_attempts`, … | **Gecmisi** — bugunku hicbir sayi degismez           |
| `documents.documents`           | Gecmisi **+ R2'de bir nesne** (ADR-0037'nin yenisi)  |
| ⚠️ **`inventory.movements`**    | ⚠️ **BUGUNKU MIKTARI** — turetme kaynagini gotururdu |

> **Baglayici kural:** `inventory.movements` **kirpilamaz**, once kirpilan
> donemin bakiyesini tasiyan bir **acilis hareketi** (`is_correction = true`)
> yazilmadikca. Retention karari verilirken bu kalem **ayri ele alinmalidir**;
> "hepsine N gun" kurali burada **sessizce yanlis stok** uretir.
>
> ⚠️ `finance.transactions` listeye _"silinmez"_ diye girmisti (TTK). Buradaki
> gerekce **hukuki degil aritmetiktir** ve ikisi karistirilmamalidir.

---

## Uygulama plani (slice'lar)

> **Surec (5. modulden itibaren gecerli):** ADR / Backend (**tek slice**) /
> [cross-modul dokunusu **yalnizca gerekiyorsa** izole slice] / Frontend +
> kapanis denetimi.

| Slice | Ne                                                                                                                                                                                                                        | Migration               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **0** | **Bu ADR** — karar, kapsam, sinirlar                                                                                                                                                                                      | —                       |
| **1** | **Backend (TEK slice):** `inventory` semasi + `items` + `movements` + turetilmis miktar + sayim/duzeltme akisi + arsivleme + not/embedding + `reindex` + oran siniri + izin katalogu + exception filter + **iki katkici** | `0029_inventory_schema` |
| **2** | **Frontend + HAFIF kapanis denetimi:** iki rota (ODA, ortak duvar), satir ici hareket girisi, sayim akisi, `inventory` rengi, koridorda `LIVE` + § Kapanis denetimi listesi                                               | —                       |

**Cross-modul slice'i YOK ve bu bir atlama degil** — §9'un dogrudan sonucu:
degistirilecek bir `public.ts` **yoktur**, cunku hicbir kenar eklenmiyor.

**Backend neden TEK slice.** ADR-0037 backend'i ikiye bolmustu ve gerekcesi
**iki ayri risk sinifiydi** (nesne deposu tutarliligi + AI hatti); ikisi de
burada **yok**. Kalan tek yeni risk sinifi turetilmis miktar + sayim yarisidir
ve o, **ayni transaction'in** icinde yasar — ikiye bolmek onu **ortasindan
bolerdi**.

> ⚠️ **BIR MIGRATION PROD'A GIDER.** `feature/tenant-multi-tenancy-core`'a
> yapilan her push Railway'de `db:preflight && db:migrate` calistirir
> (CLAUDE.md). **Slice 1'in push'undan once ayrica haber verilir.**

> ⚠️ **YENI MIGRATION EKLEME KONTROL LISTESI (CLAUDE.md — zorunlu, uc adim):**
>
> 1. `0029_inventory_schema.sql` **ve** `.down.sql` yazilir.
> 2. ⚠️ **`drizzle/meta/_journal.json`'a giris eklenir** — atlanirsa
>    `pnpm db:migrate` _"applied successfully"_ yazar, cikis kodu 0 verir ve
>    **hicbir sey uygulamaz**. ADR-0037'de gercekten yasandi.
> 3. ⚠️ **`database.integration.spec`'in geri alma listesine eklenir** — en
>    yeniden eskiye. (Tek migration oldugu icin ADR-0037'nin `0028 → 0027`
>    sirasi tuzagi burada yok.)
>
> **Kanit adimi:** iki tablonun **varligini** iddia eden bir entegrasyon testi
> (`inventory-schema.integration.spec`) — sayi saymak yetmez, sayac da journal'a
> baglidir ve ayni yalani soyler.

---

## Kapanis denetimi (Slice 2) — **HAFIF seviye**

> **Surec kurali (Product Owner, 2026-08-10):** kapanis denetimleri **iki
> seviyelidir**. Her modul sonunda **HAFIF**, **AGIR** yalnizca birkac modulde
> bir ve seviyeyi Product Owner belirtir. Stok **HAFIF** ile kapanir.

**Yapilacaklar:**

- [ ] `git status` temiz · `pnpm verify` **cikis koduna** bakilarak yesil
      (DEVELOPMENT_RULES 5.4 — cikti `grep`'lenmez)
- [ ] **Uclarin rol turu** — gercek isteklerle: owner 201/200, kimliksiz
      **401**, `viewer` okur ama yazamaz **403**, `member` yazar ama kalem
      **silemez** **403**
- [ ] ⚠️ **TURETME SINAVI** (§2): bir kaleme N hareket yazilir, miktar dogru
      hesaplanir; sonra **hareket sayisi buyutulerek** liste ucunun suresi
      olculur ve kayda gecer. Bu ADR'nin merkezi karari, **olculmeden kapanmaz**.
- [ ] ⚠️ **SAYIM YARISI SINAVI** (§3.2): sayim istegi ile es zamanli bir cikis
      hareketi; duzeltmenin **kilit altinda** dogru delta uretmesi
- [ ] ⚠️ **NEGATIF STOK** (§6.1): mevcuttan fazla cikis yazilir → **kabul
      edilir**, listede negatif gorunur, yapisal katki **0.95** verir
- [ ] ⚠️ **DEFTER DEGISTIRILEMEZLIGI** (§3.3): hareket icin `PATCH`/`DELETE` ucu
      **yok** (404), hareketi olan kalem silinince **409**
- [ ] **Sinir kapilari**: nota karakter siniri asilir → **422** ve **hicbir
      kayit kirpilmaz** · `quantity = 0` → **422** · ayni SKU farkli
      buyuk/kucuk harfle → **409** (§1.1)
- [ ] **Oran siniri** asildiginda **429** (`Retry-After` ile) · gecersiz
      `OPENAI_API_KEY` ile notlu kalem → **502** ve govde **`DisclosableProblem`
      ile acik** (§10) · notsuz kalem **201** · kayit **silinmez**
- [ ] **Renk turu**: `/app/inventory` **ve** `/app/inventory/movements`
      `#876b1c` gosteriyor mu — acik **ve** koyu temada; koridorun rozeti ve
      `--ai-accent` **terracotta** kaliyor mu (§11.1)
- [ ] ⚠️ **ODA sinavi** (§11.2): iki rotanin duvari **AYNI bilesenden** mi
      geliyor (kopya degil), kahraman rakam **"toplam stok" DEGIL** mi
- [ ] ⚠️ **ADR-0036 DAGILIM OLCUMU — ZORUNLU** (§7): **on iki katkici** doluyken
      uc farkli soruda kaynak dagilimi. Olculecek iki sey: (a) en az **uc AYRI
      yapisal ses** cevapta mi (taban `ceil(8/3) = 3`), (b) `inventory-stock`
      sistematik olarak **elenip elenmedigi** — ve elenen yapisal kaynak
      sayisinin **ikiye** ciktigi (bes kaynak, uc yuva)
- [ ] **Fan-out N=12 olcumu** — ADR-0037'nin N=10 olcumuyle (≤315 ms, %6)
      karsilastirilir; darbogazin hala `LLMPort.complete` oldugu dogrulanir
- [ ] **Bilinen sinirlar listesi** bu ADR'ye ve CLAUDE.md'ye islenir · ROADMAP
      §8.5 **onyediye** cikarilir (RETENTION basligindaki **baglayici kural** ile birlikte) ·
      §3.5 tablosunda Stok/Envanter ⏳ → ✅

**Bilincli YAPILMAYACAKLAR** (hafif denetim kurali, kayda gecer): sifirdan
kurulum ❌ · iki tenant'la tam RLS izolasyon turu ❌.

---

## Bu karar ne zaman yeniden gozden gecirilir?

- ⚠️ **7. modul (Tedarikci) bir YAPISAL katkici eklerse** — ADR-0036'nin esigi
  (6) asilir ve **o ADR yeniden acilmak zorundadir** (§7.2).
- **Miktar sorgusu olculebilir bir darbogaz haline gelirse** — §2.2c'nin acik
  biraktigi yon: `quantity_on_hand` bir **onbellek** olarak eklenir, dogruluk
  kaynagi **defter kalir**.
- **Coklu depo/lokasyon talebi geldiginde** — miktar `(kalem, lokasyon)` basina
  turetilir ve **transfer** ucuncu bir hareket sekli dogurur. Bu ADR'nin §2 ve
  §3'unu **dogrudan** etkiler.
- **Parti/son kullanma takibi talebi geldiginde** — ayni siniftan model
  degisikligi; §5'in "not serbest metindir" karari **yeniden sorulur**.
- **Maliyet/degerleme talebi geldiginde** — ⚠️ `Stok -> Finans` kenari ve
  **ikinci bir mali gerceklik** riski; ayri ADR (§12).
- **Bir kullanici stok verisini rol bazinda gizlemek isterse** — §8.1'in "genis
  katalog dogru sekildir" iddiasi duser ve ABAC/ACL borcu (ROADMAP §1.1) bu
  modul icin de tetiklenir.
