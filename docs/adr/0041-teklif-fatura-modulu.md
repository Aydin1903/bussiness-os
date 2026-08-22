# 0041 — Faz 5 / Modul 8: Teklif / Fatura Olusturma

- **Durum:** Onerildi — ⚠️ **IKI KALEM PRODUCT OWNER ONAYI BEKLIYOR** (§4.3 ve §8)
- **Tarih:** 2026-08-22
- **Karar veren:** Product Owner
- **Faz:** 5

## Baglam

Faz 5'in ilk **yedi** modulu kapandi ve prod'da canli: CRM
([ADR-0031](0031-crm-module.md) + [ADR-0032](0032-company-summary.md)) ·
Projeler ([ADR-0033](0033-projects-module.md)) · Finans
([ADR-0034](0034-finance-module.md)) · Randevu/Rezervasyon
([ADR-0035](0035-randevu-rezervasyon-modulu.md)) · Belge/Sozlesme
([ADR-0037](0037-belge-sozlesme-yonetimi.md)) · Stok/Envanter
([ADR-0039](0039-stok-envanter-modulu.md)) · Tedarikci
([ADR-0040](0040-tedarikci-yonetimi-modulu.md)). Platform seviyesinde iki
karar daha kalici standarttir: [ADR-0036](0036-context-retrieval-kota.md)
(havuzun yapisal taban kisiti) ve [ADR-0038](0038-oda-tasarim-sistemi.md)
(ODA tasarim sistemi).

ROADMAP §3.5'in **sekizinci** sirasi **Teklif / Fatura Olusturma**'dir ve o
listedeki kapsam notu kisadir ama bir bagimlilik tasir:

> _"**Finans uzantisi** — 3'e bagimli, ondan once gelemez."_

ROADMAP §3.5 gerekcesini de yaziyor:

> _"**8 → 3.** Teklif/Fatura, Finans'in veri modeli uzerine oturur. Finans'tan
> once yazilirsa kendi paralel gelir modelini kurar ve sonra goc eder."_

**Dokuzuncu sema.** Zemin yedi modulde sinandi:

| Ne                       | Stok'ta                  | Tedarikci'de                | **Teklif/Fatura'da**                               |
| ------------------------ | ------------------------ | --------------------------- | -------------------------------------------------- |
| RLS + `FORCE` sablonu    | Altinci kez              | Yedinci kez                 | **Sekizinci kez**                                  |
| Kaynak bazli izin modeli | Genis, nitelenmis        | Genis, nitelenmis           | **Genis, NITELIKSIZ — ve dogru** (§9)              |
| `EmbeddingPort`          | `shared/`'dan hazir      | `shared/`'dan hazir         | ⚠️ **HIC KULLANILMIYOR** (§5)                      |
| Chunk tablosu            | Reddedildi               | Reddedildi                  | ⚠️ **Soru bile dogmuyor** (§5)                     |
| Oran siniri              | Bir satir deklarasyon    | Bir satir deklarasyon       | ⚠️ **YOK — sayacak embedding yok** (§5)            |
| Retrieval katkicisi      | Iki (anlamsal + yapisal) | TEK (anlamsal)              | ⚠️ **TEK — ve YAPISAL** (§4)                       |
| Havuz taban kisiti       | Esige **bir kaldi**      | Esige **dokunulmadi**       | ⚠️ **ESIK ASILIYOR — PO onayi** (§4.3)             |
| Cross-modul referans     | Kenar YOK — aday yoktu   | Kenar YOK — aday reddedildi | **TEK yeni kenar (CRM)** (§7)                      |
| `StoragePort`            | Kullanilmiyor            | Kullanilmiyor               | ⚠️ **Yine kullanilmiyor — ve bu bir HAYIR** (§6.3) |
| Yeni port                | Yok                      | Yok                         | ⚠️ **`PdfPort` — ADR-0009'dan beri ILK** (§6)      |
| Modul imza rengi         | Iki satir                | Iki satir                   | **Iki satir** (palet zaten olculmus)               |
| Oda tasarim sistemi      | Ilk gunden ODA           | Ikinci kez ilk gunden ODA   | **Ucuncu kez ilk gunden ODA**                      |

**Bu modul ucuz DEGILDIR** ve ADR'nin uzunlugu bunun olcusudur (ADR-0040'in
kisaligi tersinin olcusuydu). Gercekten yeni **yedi** soru var:

1. ⚠️ **Iki belge turu, tek sekil — sema karari.** (§1) Teklif ve fatura
   taslagi ayni govdeyi (baslik + kalemler + musteri) paylasir ama ayni
   **soruyu** cevaplamaz. Tek tablo + `kind` mi, iki tablo mi?
2. ⚠️ **YASAL E-FATURA YOK — ve bu bir asama degil bir SINIRDIR.** (§12)
   Resmi e-fatura, ulkeye ozel bir entegrasyon (imza, mukellef sorgusu,
   zarf/paket formati, saklama yukumlulugu) demektir ve **global bir urun icin
   gerceklestirilebilir degildir**. Bu modulun urettigi fatura bir **PDF
   belgesidir**, bir mali belge degil.
3. ⚠️ **PDF yeni bir PORT gerektiriyor** (§6) — ADR-0009'dan (`StoragePort`) bu
   yana `shared/`'a eklenen **ilk yeni port**. Ustelik ikinci bir soruyu da
   birlikte getiriyor: uretilen PDF **saklanacak mi**?
4. ⚠️ **ADR-0036'NIN ESIGI ASILIYOR.** (§4.3) Bu modulun yapisal katkicisi
   yapisal kaynak sayisini **5 → 6** yapiyor ve ADR-0036 kendi yeniden gozden
   gecirme esigini tam olarak oraya koymustu. **Product Owner onayi gerekir.**
5. ⚠️ **`platform/audit` borcu TETIKLENDI.** (§8) ADR-0034 §8 tetikleyiciyi
   **bu modul** olarak yazmisti. Degerlendirildi; oneri "ac" degil
   **"kucult ve ertele"** — ve bu da **Product Owner onayi** ister.
6. ⚠️ **`inventory.public.ts` adayi degerlendirildi ve REDDEDILDI.** (§7.3)
   ADR-0039 §9.1 dizini kimin yazacagini yazmisti; talip **bu modul** olabilirdi.
7. ⚠️ **Izin adi cakismasi IKINCI kez gercek — ama beklenen yerde DEGIL.**
   (§9.1) ADR-0039 §8.2 `item` → `stock_item` nitelemesini **bu modulun
   getirecegi _line item_** icin yapmisti. Cakisma **o kelimede olmadi**:
   `document` adi Belge modulu tarafindan alinmis durumda ve satir kalemi
   **bir izin kaynagi bile degil**.

> ⚠️ **Bu ADR'nin cizdigi sinir bir BELGE siniridir.** Teklif/Fatura v1
> **musteriye gonderilen bir kagit uretir**: kim, ne, kac adet, ne fiyata,
> hangi kosulla. Tahsilat, kismi odeme, vade takibi, tekrarlayan fatura,
> yasal e-fatura ve muhasebe entegrasyonu **kapsam disidir** (§12) —
> ADR-0034'un muhasebe siniri, ADR-0035'in takvim siniri, ADR-0037'nin arsiv
> siniri, ADR-0039'un sayim siniri ve ADR-0040'in satin alma siniriyla **ayni
> disiplin**.

---

## ⚠️ PRODUCT OWNER ONAYI BEKLEYEN IKI KALEM

Bu ADR'nin geri kalani mimari bir oneridir. Asagidaki ikisi **platform
seviyesinde** karardir ve Claude bunlari tek basina veremez (CLAUDE.md
"Danisilmasi Zorunlu Konular"):

| #     | Kalem                                  | Bu ADR'nin onerisi                                                                                                                                                                                                                    | Neden PO karari                                                                                                                                          |
| ----- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | **ADR-0036'nin esigi asiliyor** (§4.3) | Yapisal katkici **eklensin**; ADR-0036 **bu iste degistirilmesin**; yeniden gozden gecirme, bu modulun kapanis denetimindeki **canli dagilim olcumunden SONRA** ayri bir ADR (**0042 adayi**) olarak yapilsin                          | ADR-0036 bir **platform** karari; esigi asmak, bir modul ADR'sinin tek basina alabilecegi karar degil (ADR-0039 §7.2 bunu acikca yazdi)                   |
| **B** | **`platform/audit` acilsin mi** (§8)   | **ACILMASIN.** Borc, uc mekanizmayla **kucultulerek** ertelensin: (1) gonderilmis belge degistirilemez, (2) durum gecisleri **satir ici aktor damgasi** tasir, (3) faturaya donusturme yeni kayit uretir                               | `platform/audit` **tum modulleri** ilgilendiren yeni bir platform bilesenidir; ADR-0034 §8 tetikleyiciyi bu modul olarak yazdi, yani "sessizce erteleme" secenegi **yok** |

⚠️ **Ucuncu bir secenek yoktur:** ikisinin de yazili durup uygulanmamasi, en
kotu haldir (ROADMAP §2.4'un kendi cumlesi: _"bir kapi kosulunun sessizce
asilmasi, kosulun hic yazilmamis olmasindan kotudur"_).

---

## Karar

### 1. Yeni `invoicing` semasi — TEK belge tablosu + `kind`

**Dokuzuncu sema** (`knowledge`, `crm`, `projects`, `finance`, `appointments`,
`documents`, `inventory`, `suppliers`, `invoicing`). Mutlak Kural 5: her modul
kendi semasina sahiptir.

| Tablo                            | Ne tutar                                                          |
| -------------------------------- | ----------------------------------------------------------------- |
| `invoicing.sales_documents`      | Teklif **ve** fatura taslagi — baslik, musteri, durum, tarihler   |
| `invoicing.sales_document_lines` | Belgenin satir kalemleri — aciklama · miktar · birim fiyat · vergi |
| `invoicing.number_sequences`     | Tenant + tur basina belge numarasi sayaci — **tek satir, ebedi**  |

Ucu de `tenant_id` tasir, ucunde de `ENABLE ROW LEVEL SECURITY` +
`FORCE ROW LEVEL SECURITY` (MT §12.2 sablonu, **sekizinci kez**). Tum FK'lar
**sema icidir** — Mutlak Kural 5 yalnizca **cross-schema** FK'yi yasaklar.

> ⚠️ **Tablo adi neden `sales_documents`, `documents` degil.** `invoicing.documents`
> sema-nitelenmis oldugu icin **yasaldi** ama `documents.documents` ile yan
> yana okundugunda iki farkli kavrami ayni kelimeyle adlandirirdi. Bu, §9.1'in
> izin tarafinda reddettigi belirsizligin sema tarafindaki **aynisi** olurdu.

```
invoicing.sales_documents
  id                    uuid PK
  tenant_id             uuid NOT NULL -> platform.tenants (RESTRICT)
  kind                  text NOT NULL          -- 'quote' | 'invoice'   (§1.1)
  number                text NULL              -- §1.6: gonderim/kesim aninda uretilir
  status                text NOT NULL          -- §1.2: CHECK, kind'a BAGLI
  company_id            uuid NULL              -- CRM sirketi; FK YOK (§7.1)
  contact_id            uuid NULL              -- CRM kisisi;  FK YOK (§7.1)
  customer_name         text NOT NULL          -- ⚠️ §1.5: BELGEYE BASILAN ad
  issued_on             date NOT NULL          -- takvim gunu (§1.4)
  valid_until           date NULL              -- YALNIZCA quote (CHECK)
  due_on                date NULL              -- YALNIZCA invoice (CHECK)
  currency              text NOT NULL          -- ^[A-Z]{3}$ (§1.4)
  notes                 text NULL              -- serbest metin; EMBED EDILMEZ (§5)
  converted_from_id     uuid NULL -> invoicing.sales_documents (RESTRICT)  -- §3
  created_by_user_id    uuid NOT NULL
  sent_at               timestamptz NULL       -- §8: AKTOR DAMGASI
  sent_by_user_id       uuid NULL              -- §8
  decided_at            timestamptz NULL       -- §8
  decided_by_user_id    uuid NULL              -- §8
  created_at / updated_at

invoicing.sales_document_lines
  id                    uuid PK
  tenant_id             uuid NOT NULL -> platform.tenants (RESTRICT)
  document_id           uuid NOT NULL -> invoicing.sales_documents (CASCADE)
  position              integer NOT NULL       -- UNIQUE (document_id, position)
  description           text NOT NULL          -- ⚠️ SERBEST METIN (§7.3)
  quantity              numeric(14,3) NOT NULL CHECK (quantity > 0)
  unit                  text NULL              -- serbest metin (ADR-0039 §4)
  unit_price            numeric(14,2) NOT NULL -- ⚠️ isaret KISITSIZ (§1.7)
  tax_rate              numeric(5,2) NOT NULL DEFAULT 0 CHECK (0 <= tax_rate <= 100)
  created_at

invoicing.number_sequences
  tenant_id             uuid NOT NULL -> platform.tenants (RESTRICT)
  kind                  text NOT NULL
  next_value            integer NOT NULL DEFAULT 1
  PRIMARY KEY (tenant_id, kind)
```

⚠️ **`sales_documents`te `total` KOLONU YOKTUR** (§1.3) · ⚠️ **hicbir tabloda
`embedding` kolonu YOKTUR** (§5) · ⚠️ **`lines`te `stock_item_id` YOKTUR**
(§7.3).

#### 1.1 ⚠️ TEK TABLO + `kind` — iki tablo REDDEDILDI

**Karar: teklif ve fatura taslagi AYNI tabloda yasar, `kind` kolonuyla
ayrilir.**

Emsal dogrudan **ADR-0034 §5**'tir: gelir ve gider tek `finance.transactions`
tablosunda yasar ve `direction` kolonuyla ayrilir. Ayni sekil, ikinci kez.

**Iki tablonun (`quotes` + `invoices`) bedeli sayilabilir:** iki satir tablosu,
iki durum makinesi, iki degistirilemezlik zorlamasi, iki PDF izdusumu, iki
repository ve tablolar arasi bir donusturme. Karsiliginda kazanilan sey **tek
bir seydir**: `kind` filtresini unutmanin imkansizligi.

⚠️ **O riskin sekli ADR-0034'unkinden ZAYIFTIR ve karari bu belirledi:**

| Nerede                               | Ayirici kolonu unutmak ne uretir                                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `finance.transactions` (`direction`) | ⚠️ **Sessiz ve makul gorunen YANLIS BIR SAYI** — gider gelir gibi toplanir, ekran bir rakam gosterir, hicbir sey patlamaz                      |
| `invoicing.sales_documents` (`kind`) | Fatura listesinde **teklifler gorunur** — ekranda **derhal** goze carpar, bir sayiyi bozmaz                                                    |

Yani burada yanlisin bedeli **gorunurdur**, orada **gorunmezdi**. ADR-0034 tek
tabloyu **daha tehlikeli** bir durumda secti; burada secmemek tutarsizlik
olurdu.

Uc mekanizma riski ayrica bagliyor:

- ⚠️ **Repository'de genel bir `list()` YOKTUR** — her okuma metodu turunu
  **adinda tasir** (`listQuotes`, `listInvoices`). Unutulacak bir parametre
  yok, cunku parametre yok.
- **Uc kolonun gecerliligi `kind`'a bagli CHECK ile zorlanir** (§1.2) — yani
  "faturaya `valid_until` yazmak" veritabani seviyesinde imkansizdir.
- **Bir entegrasyon testi** her iki listenin de karsi turu **hic** dondurmedigini
  iddia eder.

#### 1.2 Durum: SABIT ENUM, ve gecerli kume `kind`'a BAGLI

ADR-0035'in durum karariyla ayni gerekce: **durum kodda sabittir, tenant
tanimli bir sozluk DEGILDIR.** Bir teklifin "kabul edildi" olmasi bir goruntu
tercihi degil, sistemin **davranisini degistiren** bir gercektir (§2 ondan
sonra belgeyi dondurur, §3 ondan sonra donusturmeye izin verir). Tenant'in
tanimlayabildigi bir sozluk, uzerine **kod yazilamayan** bir sozluktur.

```sql
CHECK (
  (kind = 'quote'   AND status IN ('draft','sent','accepted','rejected')) OR
  (kind = 'invoice' AND status IN ('draft','issued','cancelled'))
)
CHECK (kind = 'quote'   OR valid_until IS NULL)
CHECK (kind = 'invoice' OR (due_on IS NULL AND converted_from_id IS NULL))
```

| Tur    | Akis                                        |
| ------ | ------------------------------------------- |
| Teklif | `draft` → `sent` → `accepted` \| `rejected` |
| Fatura | `draft` → `issued` → `cancelled`            |

⚠️ **Geri donus YOKTUR:** `sent` bir teklif `draft`'a donmez, `issued` bir
fatura `draft`'a donmez. Gerekce §2'dir: bu gecisler **belgenin disari
ciktigi** andir ve geri almak, musteride duran bir kagidi yok saymaktir.
Yanlissa cozum `rejected`/`cancelled` + **yeni belge**dir.

⚠️ **`sent` SISTEMIN BIR EYLEMI DEGIL, KULLANICININ BEYANIDIR.** Bu modul
e-posta **atmaz** (§12). `sent`, _"bu belgeyi musteriye ilettim"_ demektir ve
PDF'i indirmek kullanicinin isidir. ⚠️ Arayuz bunu **acikca yazar** — sistemin
yapmadigi bir seyi yaptigini ima etmek, bu projenin tekrarlayan reddidir.

#### 1.3 ⚠️ TOPLAMLAR TURETILIR — `total` kolonu YOKTUR

Projede **onuncu** kez ayni karar (`finance.balances`in reddi,
`inventory.items.quantity`nin reddi, `ends_at`in reddi, durgunlugun
turetilmesi...). Ara toplam, vergi ve genel toplam **her okumada kalemlerden
hesaplanir**.

Bedel ADR-0039'un olctugu bedelden **kucuktur**: orada turetme **sinirsiz
buyuyen** bir defteri tariyordu; burada bir belgenin kalem sayisi **onlarla**
sinirlidir ve `document_id` uzerinde index vardir.

⚠️ **Ama burada bir karsi-argumanin cevabi verilmelidir ve bu ADR'nin en ince
noktasidir:** _"gonderilmis bir belgenin toplami DONDURULMALIDIR — musterinin
elindeki kagitla ayni olmali."_ Dogru; ve cevap bir kolon **degil**, §2'dir:

> **Gonderilmis bir belgenin kalemleri DEGISTIRILEMEZ. Kaynak degismiyorsa
> turetilen deger de degismez.** Donduran sey bir kopya degil, **bir kisittir.**

Bir `total` kolonu eklenseydi tam tersi risk dogardi: kalem degisir, kolon
guncellenmeyi unutur ve ekran **iki farkli dogru** gosterir — projenin
tekrarlayan sessiz hatasi.

#### 1.4 Para ve tarih: ADR-0034'un sekli, bir kolon degil bir MIRAS

ROADMAP §3.5'in _"8 → 3"_ bagimliligi **burada** karsilanir ve karsiligi bir
FK degil, **alinmis kararlarin devralinmasidir**:

| Karar                                                | Kaynak         | Burada                                     |
| ---------------------------------------------------- | -------------- | ------------------------------------------ |
| Para `numeric`, `double precision` DEGIL             | ADR-0034 §2    | ✅ `numeric(14,2)`                         |
| Para birimi **belge basinadir**, satir basina degil  | yeni           | ✅ `currency` baslikta                     |
| **Kur cevrimi YOK** — farkli para birimleri toplanmaz | ADR-0034       | ✅ ozet **para birimi bazinda**            |
| Para birimi **kod listesi dogrulanmaz**, yalnizca sekil | ADR-0034     | ✅ `^[A-Z]{3}$`                            |
| Tarih **takvim gunudur** (`date`), an degil          | ADR-0034 §2    | ✅ `issued_on` · `valid_until` · `due_on`  |
| ⚠️ Isaretli tutar **YASAK** — yon kolonda tasinir    | ADR-0034 §5    | ⚠️ §1.7 — burada **yon diye bir eksen yok** |

⚠️ **Tek belgede tek para birimi** ve bu bir kisittir: iki para birimli bir
belgenin toplami **yoktur** (ADR-0034'un ayni kurali). Zorlamak yerine
kullaniciya iki belge yazdirmak, yanlis bir tek rakam uretmekten iyidir.

#### 1.5 ⚠️ `customer_name` DENORMALIZE EDILMISTIR — kuralin ISTISNASI DEGIL, SINIRI

Projede bes kez ayni karar verildi: **ad denormalize edilmez, dizinden
okunur** (ADR-0033 §2b). Burada **kolonda saklaniyor**. Sebep bir taviz degil,
kuralin kapsaminin dogru okunmasidir:

> **Denormalizasyon yasagi TURETILEBILIR bilgi icindir. Gonderilmis bir
> belgedeki ad turetilebilir DEGILDIR — o an dondurulmustur.**

Bir teklifi "Yildiz Ltd." adina gonderdiyseniz ve musteri ertesi ay unvan
degistirdiyse, **gecmis belge eski adi gostermeye devam etmelidir**. Dizinden
okunsaydi belge **geriye donuk degisirdi** — yani musterinin elindeki kagitla
sistemdeki kayit ayrisirdi ve hata **sessiz** olurdu.

⚠️ **Sonucu: ayni ekranda IKI AD gorunebilir ve bu bir kusur degildir.**
`customer_name` **belgeye basilan** addir; `company_id` uzerinden
`CompanyDirectory`den okunan ad **bugunku musteridir** (§7.1). Arayuz belgenin
adini **birincil** gosterir; baglantili musterinin bugunku adi bir yan
bilgidir.

⚠️ `customer_name` **NOT NULL**'dur ve `company_id` **NULL** olabilir: CRM'de
kayitli olmayan bir musteriye teklif yazmak mesrudur. Zorunlu kilmak,
ADR-0033'un **sahte "Genel" projesi** ve ADR-0034'un **sahte kategori**
dersinin ucuncu tekrari olurdu.

#### 1.6 Belge numarasi — sayac TABLOSU, ve `max()+1` REDDEDILDI

`number` **taslakta NULL**'dur; teklif `sent` olurken, fatura `issued` olurken
**sunucu** uretir. Format sabittir: `TKF-000123` / `FTR-000123`.

⚠️ **Turetme burada REDDEDILDI ve bu, §1.3'un tam tersi bir karardir** — cunku
olcut degil, **verinin sekli** farklidir:

| Yaklasim                        | Neden                                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `max(number) + 1` (turetme)     | ⚠️ **Silinen bir taslaktan sonra numarayi YENIDEN KULLANIR.** Iki belge zaman icinde ayni numarayi tasir; musteri ikisini de elinde tutar ve hata **disarida**, bizim goremedigimiz yerde ortaya cikar.                   |
| Sayac tablosu (**secilen**)     | Numara **bir kez** verilir ve geri alinmaz. Bosluk olusabilir (iptal edilen bir kesim) ve **bu dogrudur** — bosluk **gorunur**, tekrar **gorunmez**.                                                                      |

⚠️ **Sayac `SELECT ... FOR UPDATE` ile okunur** — ADR-0039 §3.2'nin fiziksel
sayim kilidinin **ikinci uygulamasi**. Iki es zamanli `issue` istegi ayni
numarayi alamaz; kilit **dekoratif degildir**.

⚠️ `number_sequences` retention listesine **girmez**: tenant + tur basina
**iki satir**, ebediyen. Yil numaranin **icinde yoktur** (belgenin tarihi zaten
`issued_on`dadir), yani sayac **yila gore de cogalmaz**. ADR-0040'in kapanis
denetiminin dersi burada **ilk gunden** uygulandi: borcu oldugundan buyuk
gostermemek.

#### 1.7 ⚠️ `unit_price` ISARET KISITI TASIMAZ — ve bu ADR-0034 §5'e AYKIRI DEGILDIR

`quantity > 0` zorunludur; `unit_price` **negatif olabilir**. Sebep: bir
iskonto satiri (`"Sadakat indirimi" × 1 × -500`) mesru bir belge satiridir ve
alternatifi ayri bir `discount` kolonu + ayri bir hesaplama kuralidir.

⚠️ **ADR-0034 §5'in reddettigi sey bu DEGILDIR.** Orada isaret bir **anlam
ekseni** tasiyordu (gelir mi gider mi) ve isareti unutmak kaydin **turunu**
degistiriyordu. Burada isaret yalnizca **aritmetiktir**: satirin belge
toplamina katkisi. Unutulan bir isaret yanlis bir toplam uretir — ama o toplam
**belgenin uzerinde yazilidir ve kullanici onu okur**, gizli bir ozet rakami
degildir.

#### 1.8 `tax_rate` bir SAYIDIR, bir KURAL DEGIL

Satir basina `tax_rate` alinir; ara toplam → satir bazinda vergi → genel toplam
seklinde turetilir.

⚠️ **Sistem hicbir vergi KURALI bilmez:** muafiyet, tevkifat, ulke bazli oran,
istisna kodu, vergi dairesi — hicbiri yoktur. Oran **kullanicinin yazdigi bir
sayidir**; sistem yalnizca **carpar**. ADR-0034'un _"vergi hesabi kapsam
disi"_ siniri **korunur**: burada yapilan sey vergi hesaplamak degil, bir
belgeye kullanicinin verdigi orani **basmaktir**.

Alternatif (vergisiz belge) reddedildi: KDV/VAT tasimayan bir teklif PDF'i cogu
isletmede **kullanilamaz** ve kullanici orani aciklamaya yazmak zorunda
kalirdi — yani sistem, ustune elle yazi yazilan bir kagit olurdu.

---

### 2. ⚠️ GONDERILDIKTEN SONRA DEGISTIRILEMEZ — ve bu, denetim izi borcunu KUCULTUR

**Karar: `sent` bir teklifin ve `issued` bir faturanin BASLIGI VE KALEMLERI
degistirilemez.**

Koruma **uc katmanlidir** — ADR-0039 §3.3'un sekli, ikinci kez:

| Katman           | Ne                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| **Domain**       | `SalesDocument.update()` `draft` disinda bir durumda cagrilirsa `DocumentNotEditableError` firlatir    |
| **Uc**           | `PATCH` ve `DELETE` yalnizca `draft`ta 200/204 doner; aksi halde **409**                               |
| **Veritabani**   | `sales_document_lines` uzerinde bir trigger: ebeveyn `draft` degilse `INSERT/UPDATE/DELETE` reddedilir |

⚠️ **Ucuncu katman gereklidir ve gerekcesi ADR-0039'unkiyle aynidir:** kalemler
ayri bir tablodadir, yani baslik uzerindeki bir kontrol onlari **kapsamaz**.
Tek bir yeni yazma yolu (ileride bir toplu duzenleme, bir goc betigi) kontrolu
atlarsa hata **sessiz** olur: gonderilmis bir belgenin toplami degisir ve
**kimse fark etmez**.

⚠️ **BU BIR "DEGISTIRILEMEZ DEFTER" DEGILDIR** (ADR-0039 §3.3) ve iki durum
karistirilmamalidir:

|                      | `inventory.movements`                                                                            | `invoicing.sales_documents`                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Neden degistirilemez | **Bugunku miktar ondan TURETILIR**; gecmisi degistirmek bugunu sessizce yeniden yazar             | **Belge disari cikti**; degistirmek, musterideki kagitla sistemi ayristirir     |
| Kapsam               | **Her zaman**                                                                                    | ⚠️ **Yalnizca `draft` sonrasi** — taslak serbestce duzenlenir                   |
| Kaybin sekli         | Aritmetik                                                                                        | Anlatisal / ticari                                                             |

**Yanlis bir gonderilmis belgenin dogrusu:** teklif icin `rejected` + yeni
teklif; fatura icin `cancelled` + yeni fatura. Iptal edilen satir **durur**
(silinmez) — numarasi da durur (§1.6).

---

### 3. "Faturaya donustur" — YENI KAYIT, teklif DOKUNULMAZ

**Karar: `POST /invoicing/quotes/:id/convert` yeni bir `kind='invoice'` satiri
ve kalemlerinin KOPYASINI olusturur. Teklifin kendisine tek bir kolon
yazilmaz.**

- Onkosul: teklif `accepted` olmali (`sent` yetmez — kabul edilmemis bir
  teklifi faturalamak, olmayan bir mutabakati varsaymaktir).
- Yeni fatura `draft` dogar ve **serbestce duzenlenebilir** (§2): kullanici
  kalem cikarabilir, fiyat guncelleyebilir. Product Owner'in istedigi davranis
  tam olarak budur.
- `converted_from_id` **yeni faturada** durur; ok **fatura → teklif**
  yonundedir. Tersi (teklifte bir `invoice_id`) teklifi **degistirmek** olurdu
  ve §2'yi delerdi.
- FK `ON DELETE RESTRICT`: bir faturaya kaynaklik eden teklif **silinemez**.
  Zaten `accepted` bir teklif de silinemez (§2), yani kisit ikinci bir
  dayanaktir.

⚠️ **Kalemler KOPYALANIR ve bu, §1.5'in denormalizasyon gerekcesiyle AYNI
SATIRDANDIR:** kopyalanan sey bir **adres** (baska bir kaydi gosteren isaretci)
degil, **bir belgenin icerigidir**. Referans verilseydi teklifin bir kalemi
degistiginde faturanin da degismesi gerekirdi — ama teklif zaten
degistirilemez (§2) ve **iki ayri belge** iki ayri gercegi anlatir.

⚠️ **Ikinci kez donusturme ENGELLENMEZ.** Bir teklif iki faturaya bolunebilir
(kismi teslimat) ve bu mesru bir istir; engellemek kullaniciyi ikinci faturayi
sahte bir kayit olarak acmaya iterdi. ⚠️ Bedeli kayda geciriliyor: **"bu
teklifin ne kadari faturalandi" sorusu v1'de sorulamaz** — mutabakat ve
tahsilat kapsam disidir (§12).

---

### 4. ⚠️ TEK katkici — ve o katkici YAPISAL

#### 4.1 `invoicing-pipeline` — turetilmis, deterministik, HABER

| Durum                                                                                     | Skor     | Neden                                                                                             |
| ----------------------------------------------------------------------------------------- | :------: | ------------------------------------------------------------------------------------------------- |
| `accepted` ama **faturalanmamis** teklif (hicbir fatura `converted_from_id` ile gostermiyor) | **0.95** | ⚠️ **Para masada duruyor.** Musteri kabul etti, fatura kesilmedi — kaybedilen gelirin en dogrudan sekli |
| `sent`, `valid_until` **gecmis** teklif                                                    | **0.95** | Belge oldu; cevap gelmedi ve **gelemez**                                                          |
| `sent`, `INVOICING_STALE_QUOTE_DAYS` (14) gundur cevapsiz                                  | **0.90** | Takip gerekiyor                                                                                   |
| Acik tekliflerin ozeti (sayi + para birimi bazinda tutar)                                  | **0.75** | Saglikli hat                                                                                      |

Skor merdiveni ADR-0031 §5.4 / Projeler Slice 6'nin **hizalanmis
politikasidir** (0.95 / 0.90 / 0.75) ve **duz skor verilmez**.

⚠️ **Tutarlar para birimi bazinda ayrisir** (§1.4) ve katkinin metni bunu
**acikca** yazar: tek bir konsolide rakam **uretilmez**. ADR-0039'un
_"miktarlar birimleri yuzunden toplanmaz"_ kuralinin ucuncu uygulamasi.

⚠️ **`INVOICING_STALE_QUOTE_DAYS` sunucu tarafinda tanimlidir ve arayuzde ayni
esigi gosteren bir sabit varsa IKISI SENKRON KALMALIDIR.** Bu, Projeler Slice
6'nin `CRM_STALE_STAGE_DAYS` dersidir: ayrisirlarsa hata **sessizdir** — ekran
"bekliyor" der, katkici 0.75 verir.

#### 4.2 Neden bu katkici REDDEDILEMEZ — Tedarikci'nin uc adayiyla karsilastirma

ADR-0040 §3.2 uc yapisal adayi reddetti ve **olcutu yaziya dokme** isini de o
yapti. Ayni olcut buraya uygulaniyor:

| Olcut                       | Tedarikci'nin adaylari                                     | **`invoicing-pipeline`**                                                       |
| --------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Turetilecek veri VAR MI?** | ❌ "performans" icin siparis/teslimat yoktu                | ✅ `status` · `valid_until` · `converted_from_id` — ucu de **kolon**            |
| **HABER mi?**               | ❌ "durgun tedarikci" normaldir                            | ✅ Cevapsiz teklif ve faturalanmamis kabul **anormalligin ta kendisidir**       |
| **Tahmin mi?**              | ❌ "vade" serbest metinden regex ile cikarilacakti         | ✅ Tarih aritmetigi; tahmin yok                                                |

Ucunden de gecen **ilk adaydir**. ⚠️ **Reddetmek, bu modulu AI'a hicbir sey
katmayan bir modul yapardi** — CLAUDE.md'nin kurucu kisitina (_"moduller
hafizadir"_) dogrudan aykiri. Ustelik reddin gerekcesi mimari olmazdi:
_"ADR-0036'nin sayacini bozmamak icin"_ demek, **kuyrugun kopegi sallamasidir**.

#### 4.3 ⚠️ ESIK ASILIYOR — PRODUCT OWNER ONAYI GEREKIR

| Olcu                      | Tedarikci sonrasi | **Teklif/Fatura sonrasi**            |
| ------------------------- | ----------------- | ------------------------------------ |
| Anlamsal kaynak           | 8                 | **8 — DEGISMIYOR** (§5)              |
| Yapisal kaynak            | 5                 | ⚠️ **6** (`invoicing-pipeline`)      |
| Toplam katkici (fan-out)  | 13                | **14**                               |
| Global top-K              | 8                 | **8 — degismiyor**                   |
| Yapisal taban `ceil(K/3)` | 3                 | **3 — degismiyor**                   |
| Serbest yuva              | 5 (8 kaynak icin) | **5 — hala 8 kaynak icin**           |

ADR-0036 kendi tetikleyicisini yazmisti:

> _"**Yapisal kaynak sayisi tabanin iki katini gectiginde** (bugun 4, esik 6):
> o noktada kaynaklarin yarisindan fazlasi garanti disinda kalir ve 'genislik'
> vaadi anlamini yitirmeye baslar."_

ADR-0039 §7.2 bunu **bir sonraki module adresledi**, ADR-0040 §3 esige
**bilincli olarak dokunmadi**. Simdi esik **asiliyor**: alti yapisal kaynak, uc
garanti yuva — yani **yarisindan azi** her cevapta duyuluyor.

> ⚠️ **BU ADR ADR-0036'YI DEGISTIRMEZ.** Taban `ceil(K/3)` kalir, formul
> degismez, hicbir katkicinin skorlama mantigina dokunulmaz. Bu ADR yalnizca
> **esigin asildigini KAYDEDER** ve yeniden gozden gecirmeyi ayri bir karara
> (**ADR-0042 adayi**) adresler.

**Onerilen sira ve gerekcesi — once OLCUM, sonra karar:**

1. Bu modul katkicisiyla birlikte yazilir (tek satirlik `kind: 'structural'`
   beyani; ADR-0036 §5).
2. **Kapanis denetiminde on dort katkici doluyken canli dagilim olculur** —
   ADR-0036'nin kendi bilinen siniri bunu zaten istiyordu: _"olculmus bir
   KALITE verisi olustugunda rerank tartismasi yeniden acilir."_
3. Olcum elde varken ADR-0042 yazilir.

⚠️ **Tersi (once ADR-0036'yi revize etmek) reddediliyor:** bugun elimizde alti
yapisal kaynakli **tek bir olcum yok**. Tabani `ceil(K/3)`ten `ceil(K/2)`ye
cikarmak ya da `K`yi buyutmek veri olmadan yapilirsa, ADR-0036'nin kendi
reddettigi hataya duseriz — o ADR `K`yi buyutmeyi **acikca** reddetmisti:
_"sorunu cozmez, erteler; bedeli dogrudan tokendir."_

⚠️ **Product Owner "esik asilmasin" derse** tek tutarli sonuc sudur: bu modul
`POST /ask` havuzuna **hic katilmaz** (ne yapisal ne anlamsal) — yani sekiz
modulden sonra **ilk kez** bir is modulu kurumsal hafizaya katki vermez. Bu
mesru bir karardir ama **kaydedilmesi gerekir**; sessizce yapilamaz.

---

### 5. ⚠️ ANLAMSAL KATKICI YOK — Tedarikci'nin AYNASI, ve embedding hic yok

**Karar: bu modulde `embedding` kolonu, chunk tablosu, `reindex` ucu ve oran
siniri YOKTUR.**

⚠️ **Bu, Faz 5'te vektor tasimayan ILK IS MODULUDUR.** Sekiz modulun sekizi de
bir vektor kolonu ya da bir chunk tablosu acmisti.

Gerekce dogrudan **ADR-0034 §6.1**'dir ve o karar **Finans'in degil,
`POST /ask`in** karariydi:

> _"Islem aciklamalari embed EDILMEZ. Binlerce neredeyse ozdes kisa vektor
> ('Ocak kirasi / Subat kirasi'), K=8'lik top-K havuzunu kirletir ve diger
> kaynaklarin en iyi parcalarini disari iter."_

Bir teklif kalemi tam olarak bu sekildedir: _"M8 civata · 500 adet · 12,50"_.
Yuzlerce belgede yuzlerce neredeyse ozdes kisa satir. Embed edilseydi
**dokuzuncu anlamsal kaynak** olur ve zaten **uc kaynagin sifir aldigi** bir
havuza (ADR-0040 kapanis olcumu) yalnizca **gurultu** eklerdi.

`notes` alani da embed **edilmez**: bir teklifin serbest metni cogunlukla
**standart kosul metnidir** ("fiyatlarimiz 30 gun gecerlidir") — yani tekrar
eden bir sablon. Anlatisal degil, **matbudur**.

⚠️ **Bu modul, ADR-0040'in AYNASIDIR** ve ikisi birlikte okundugunda desen
tamamlanir:

|                  | Tedarikci (ADR-0040)                          | **Teklif/Fatura (bu ADR)**            |
| ---------------- | --------------------------------------------- | ------------------------------------- |
| Anlamsal katkici | ✅ TEK                                        | ❌ **YOK**                            |
| Yapisal katkici  | ❌ YOK — turetilecek veri yoktu               | ✅ **TEK**                            |
| Sebep            | Gorusme notu **anlatisaldir**, durumu yoktur  | Belge **durumdur**, anlatisi yoktur   |

**Somut sonuclari:**

- `EmbeddingPort` bu modulde **cagrilmaz** · `POST /invoicing/reindex` **yok**
  · **oran siniri deklarasyonu yok** — sayilacak bir embedding yok
  (ADR-0039'un kapanis denetiminde olculdugu gibi: sayac **embedding** sayar,
  kayit degil).
- Retention listesine **vektor tasiyan bir tablo eklenmez**; sayi **sekizde
  kalir**.
- ⚠️ **Yine de exception filter'a `EmbeddingFailedError` ve
  `RateLimitExceededError` YAZILIR** (§10) — CLAUDE.md'nin kalici kurali
  _"modul modul yeniden tartisilmaz"_ der ve bu, kuralin **ilk kez uc AI hata
  tipinin de tetiklenemez oldugu** modulde sinanmasidir.

---

### 6. PDF: yeni bir PORT — ve nesne deposuna YAZILMAZ

#### 6.1 `PdfPort` — `shared/`'a, adapter `infrastructure/pdf/`'e

**Karar: PDF uretimi bir port arkasindadir.**

```ts
export const PDF_PORT = Symbol('PDF_PORT');

export interface PdfPort {
  /** Belge izdusumunu PDF baytlarina cevirir. */
  render(document: PdfDocumentModel): Promise<Buffer>;
}
```

Yerlesim olcutu `storage.port.ts`'in kendi yazdigi cumledir: _"yerlesim
TUKETICI SAYISIYLA degil, PORTUN NE OLDUGU ile belirlenir: saglayici
degistirilebilir bir DIS YETENEK `shared/` + `infrastructure/` ikilisine
aittir."_ PDF uretimi tam olarak boyledir — ve ikinci tuketici zaten
gorunuyor (IK'nin belge ciktilari, 9. modul).

⚠️ **Karsit ornek ayni projede duruyor ve ayrimi gorunur kilar:**
`TextExtractorPort` Belge modulunun **icinde** kalir (ADR-0037 §6.2) cunku
metin cikarimi bir platform yetenegi degildir. PDF **uretimi** ise "belgeyi
kagida basmak"tir ve modulden bagimsizdir.

⚠️ **`PdfDocumentModel` bir IZDUSUMDUR, domain entity'si DEGILDIR.** Port
`SalesDocument`i tanimaz — tanisaydi `shared/` bir is modulunu bilirdi (Mutlak
Kural 6). Icinde baslik, satirlar, toplamlar ve para birimi vardir; "teklif"
kelimesi **gecmez**. ⚠️ ADR-0035'in `week-grid` dersi, sunucu tarafinda:
bilesen kendi alanini bilmez ve bunu **bir birim testi kilitler**.

#### 6.2 Kutuphane: `pdfkit` — tarayici REDDEDILDI

| Aday                                       | Karar                                                                                                                                                                                                                                                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Headless Chrome** (puppeteer/playwright) | ⚠️ **REDDEDILDI.** API container'ina ~300 MB'lik bir tarayici koymak demektir; bellek profili istek basina yuz MB'larla olculur ve dagitim yuzeyi buyur. ADR-0035'in FullCalendar reddiyle **ayni sinif**: elde edilen sey (HTML/CSS ile dizgi) odenen bedeli tasimiyor                       |
| **`pdf-lib`**                              | Mevcut PDF'leri **degistirmek** icin guclu, sifirdan **dizgi** icin zayif (metin akisi, tablo, sayfa kirilimi elle)                                                                                                                                                                          |
| **`pdfkit`** (**secilen**)                 | Saf JS, tarayici yok, deterministik cikti, akis tabanli. Tablo/sayfa kirilimi elle yazilir — tek bir teklif sablonu icin kabul edilebilir bir istir                                                                                                                                          |

⚠️ **TURKCE KARAKTER TUZAGI — ve bu SESSIZ bir hatadir.** `pdfkit`in gomulu
standart yazi tipleri **WinAnsi (Latin-1)** kodlamasindadir ve Latin-1'de
`ğ ş İ ı Ğ Ş` **yoktur**. Bir font gomulmezse cikti sessizce bozulur: PDF
uretilir, indirilir, acilir — yalnizca musterinin adi **yanlis yazilmistir**.

> **Bu yuzden adapter bir TTF gomer** (ADR-0038'in urun sesi: Inter) ve **bir
> birim testi, Turkce karakter iceren bir belgeyi uretip ciktida o baytlarin
> bulundugunu iddia eder.** Test olmasaydi kusur ancak bir musteri
> sikayetiyle ogrenilirdi.

#### 6.3 ⚠️ URETILIR, SAKLANMAZ — `StoragePort` bu modulde KULLANILMIYOR

**Karar: PDF her istekte yeniden uretilir; R2'ye yazilmaz.**

⚠️ **Bu, kod tabaninda yazili bir ONGORUYE aykiridir — ve ongoru bir karar
degildir.** `shared/storage.port.ts` bugun sunu yaziyor:

> _"`<module>` segmenti bugun DAIMA `documents`. ADR-0009 onu duzene koydu ve
> ilk kez IKINCI bir modul `StoragePort`u kullandiginda gercekten islevsel
> olacak (**Teklif/Fatura'nin uretecegi PDF**)."_

O cumle bir **beklentiydi**, karara baglanmis bir sey degil. Olcut yine
**hatanin seklidir**:

| Secim                      | Bedeli                                                                                                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Saklamak**               | ⚠️ **Ikinci bir dogruluk kaynagi** (ADR-0037 §5'in atomiklik sorunu, bu kez gereksiz yere) + ⚠️ **yetim nesne temizligi** (ADR-0037'nin **hala acik** borcu) + her belge icin bir R2 nesnesi ve retention'a **yeni bir boyut**  |
| **Uretmek** (**secilen**)  | ⚠️ **Sablon kaymasi**: sablon degisirse eski bir belge **bugunku sablonla** yeniden uretilir ve musterinin elindekine gore farkli **gorunur**                                                                                    |

Uretmeyi guvenli kilan sey §2'dir: **gonderilmis belgenin verisi degismez**,
yani icerik her zaman aynidir. Degisebilen tek sey **sablondur** ve bugun
sablon **tektir ve sabittir**.

> ⚠️ **Bilinen sinir, tetikleyicisiyle birlikte kayda geciriliyor:** ilk sablon
> degisikligi geldigi gun **saklamaya gecilir** ve o yol **tek yonludur**
> (ADR-0039'un miktar onbellegi icin yazdigi ayni sekil). O gun `StoragePort`
> gercekten ikinci tuketicisini bulur ve `buildStorageKey`in `<module>`
> segmenti ilk kez `invoicing` olur.

⚠️ **Yan fayda:** `StorageFailedError` bu modulun filtresine **girmez** —
ADR-0040 §7'nin kurali: alan bazli hata tipleri yalnizca o alani gercekten
kullanan modulde yazilir; koymak olu kod degil **yaniltici** olurdu.

---

### 7. Cross-modul: TEK yeni kenar, ve `crm.public.ts` DEGISMEZ

#### 7.1 Musteri referansi — iki dizin de HAZIR

`company_id` ve `contact_id` **ciplak `uuid`** kolonlardir (cross-schema FK
yasak, Mutlak Kural 5); adlar `CompanyDirectory` ve `ContactDirectory`den
**calisma zamaninda** okunur ve izin kapisi (`company:read` / `contact:read`)
**arayuzun icindedir**.

> ⚠️ **`crm.public.ts` BU ISTE TEK SATIR DEGISMEZ.** Iki dizin de zaten var:
> `CompanyDirectory`yi Projeler, `ContactDirectory`yi Randevu yazdi. ADR-0037
> §4.1'in kurali (_"yeni TALIP → dosya degismez; yeni KAYNAK TURU → sahibi
> modul kendi dizinini yazar"_) **ikinci kez** talip tarafindan dogrulaniyor
> ve olculebilir sonucu ayni: **cross-modul icin ayri bir slice gerekmez.**

⚠️ **Sarkan isaretci tolere edilir** (ADR-0033 §2d, **altinci** kez): silinen
bir sirketin id'si belgede kalir. Burada bunun **bedeli yoktur** ve sebep
§1.5'tir: belgeye basilan ad **kolonda** durur, yani belge **eksiksiz okunmaya
devam eder**. Kaybolan tek sey **canli baglantidir**.

#### 7.2 ⚠️ FINANS'A KENAR YOK — "8 → 3" bir SIRA bagimliligidir, GRAFIK KENARI DEGIL

ROADMAP §3.5 _"Teklif/Fatura, Finans'in veri modeli uzerine oturur"_ diyor ve
bu cumle **kolayca yanlis okunabilir**. Bu modul `finance` semasindan **hicbir
sey okumaz**, hicbir satirina isaret etmez, `finance.public.ts` **yazilmaz**.

Devralinan sey **kod ya da satir degil, KARARLARDIR** (§1.4): para tipi, para
birimi bazinda ayrisma, kur cevriminin yoklugu, takvim gunu. ROADMAP'in
korktugu sey — _"kendi paralel gelir modelini kurar ve sonra goc eder"_ — tam
olarak bu devralmayla onlenir.

⚠️ **Kesilen bir fatura `finance.transactions`a satir YAZMAZ.** Yazsaydi
ADR-0034'un kendi siniri delinirdi: o tablo **gerceklesmis nakit
hareketidir**, tahakkuk degil. **Fatura kesmek para almak degildir.** Tahsilat
kaydi **kapsam disidir** (§12) ve geldiginde yonu belirsizdir — _"Finans mi
faturayi okur, Teklif/Fatura mi Finans'a yazar"_ — yani **ayri bir ADR** ister.
⚠️ Ikisi **ayni anda** yazilirsa **DONGU** olur (Tenant ↔ Identity tuzagi;
cozumu `forwardRef` degil ucuncu bir modul).

#### 7.3 ⚠️ Stok kalemi referansi — aday DEGERLENDIRILDI, REDDEDILDI

ADR-0039 §9.1 ve ADR-0040 §4.2 dizini kimin yazacagini yazmisti; bu modul
**talip** olabilirdi. Olmuyor: **satir kalemi v1'de SERBEST METINDIR.**

Uc gerekce, en agirdan hafife:

**(a) Baglantinin dogal beklentisi STOK DUSULMESIDIR — ve o, cok daha buyuk bir
karardir.** Bir fatura satiri bir stok kalemini gosterirse kullanicinin
bekleyecegi sey stogun dusmesidir. Ama ADR-0039 §3 defteri **degistirilemez**
ilan etti ve `movements`a yazan **her yol** once kalem satirini kilitler; bir
belgenin stok hareketi uretmesi, bu modulun **envanterin dogrulugundan
sorumlu** olmasi demektir. Bu tek bir kolon degil, **bir modulun anlaminin
genislemesidir**. Dusulme olmadan baglanti ise yalnizca bir **ad kopyalama
kolayligidir**.

**(b) Fiyat orada YOK.** ADR-0039 §12 _"maliyet ve stok degerlemesi"_ni acikca
kapsam disi birakti; `inventory.items`te birim fiyat **yoktur**. Yani dizinden
gelecek sey yalnizca **ad ve birimdir** — satirin en kolay yazilan iki alani.
Kazanc, yeni bir kenarin bedelini karsilamiyor.

**(c) ⚠️ Zorunlu kilinsaydi SAHTE KALEM uretirdi.** Bir danismanlik saati, bir
kargo bedeli ya da "ozel imalat" bir stok kalemi **degildir**. Zorunlu bir
`stock_item_id`, kullaniciyi envantere sahte satirlar acmaya iterdi —
ADR-0033'un sahte "Genel" projesi ve ADR-0034'un sahte kategorisiyle **ayni
ders, ucuncu kez**. Opsiyonel yapmak ise (a)'nin belirsizligini **cozmez**.

> ⚠️ **O gun geldiginde dizini yine STOK yazar** (ADR-0039 §9.1, ADR-0040
> §4.2 — bu ADR'de **ucuncu kez** teyit ediliyor, yeniden karara
> baglanmiyor): `StockItemDirectory.findNames(ids, role)`, izin kapisi
> (`stock_item:read`) **arayuzun icinde**.

⚠️ **`invoicing.public.ts` de bu iste YAZILMAZ:** bugun bir teklifi ya da
faturayi gostermek isteyen **hicbir modul yok**. Ilk talip geldiginde dizini
**Teklif/Fatura yazar** — talip degil sahip.

#### 7.4 Grafik: alti kenardan YEDIYE, hala DAG

```
katman 0: CRM · INVENTORY · SUPPLIERS        (cikan kenari YOK)
katman 1: Projeler  -> CRM
          INVOICING -> CRM                    (YENI — tek kenar)
katman 2: Finans  -> CRM, Projeler
          Randevu -> CRM
          Belge   -> CRM, Projeler
```

**Dongu kontrolu** (ROADMAP §3.7'nin kurali: _"yeni bir kenar eklenmeden once
dongu kontrol edilir"_): yeni kenarin hedefi **CRM**'dir ve CRM'in **cikan
hicbir kenari yoktur** — yedi modulde de degismeyen gercek. Hedefi bir kok
dugum olan kenar **dongu olusturamaz**. Grafik: **yedi kenar, DAG.**

---

### 8. ⚠️ `platform/audit` — BORC TETIKLENDI, DEGERLENDIRILDI, KUCULTULEREK ERTELENDI

ADR-0034 §8 tetikleyiciyi **bu modul** olarak yazmisti:

> _"Bu borc bugune kadar teoriktir; **Finans onu gercek yapan ilk moduldur** ve
> kapatilmasi ayri bir istir. Tetikleyici acik: Teklif/Fatura (8. modul) parayi
> disari cikaran belgeler uretecek ve o gun denetim izi **ertelenemez** hale
> gelir."_

**Satir okundu. Oneri: `platform/audit` bu iste ACILMAZ — ama borc
KUCULTULEREK ertelenir.** ⚠️ **Product Owner onayi gerekir** (kalem B).

#### 8.1 Neden acilmiyor: sorunun buyuk kismi §2 ile ORTADAN KALKIYOR

Denetim izinin cevapladigi soru _"bu tutari kim, ne zaman degistirdi"_dir.
Bu modulde:

> **Gonderilmis bir belgenin tutari DEGISMEZ** (§2, uc katmanli koruma).
> Cevaplanacak bir soru yoktur — cunku olay **olmaz**.

Bu, ADR-0039'un dersinin dogrudan uygulanmasidir: bir seyi **degistirilemez**
yapmak, "kim degistirdi" sorusunu **cevaplamaktan** ucuzdur ve **daha
guclu**dur. Genel bir denetim altyapisi kurmak, bu modulun gercekten ihtiyaci
olmayan bir soruya **platform capinda** cevap uretmek olurdu.

#### 8.2 Geriye kalan icin: SATIR ICI AKTOR DAMGASI

Degistirilemezlikle kapanmayan sey **durum gecisleridir** — ve bunlar gercek
ticari olaylardir. Cevap dort kolondur (§1):

| Soru                                          | Cevap                                        |
| --------------------------------------------- | -------------------------------------------- |
| Bu belgeyi kim olusturdu                      | `created_by_user_id` (yedi modulde de var)   |
| ⚠️ Bu teklifi kim gonderdi, ne zaman          | ⚠️ **`sent_by_user_id` · `sent_at`**         |
| ⚠️ "Kabul edildi"yi kim isaretledi, ne zaman  | ⚠️ **`decided_by_user_id` · `decided_at`**   |

⚠️ **Bu bir denetim izi DEGILDIR ve oyle adlandirilmayacaktir.** Bir olay
gunlugu degil, **satirin kendi uzerindeki dort damgadir**. Fark net olsun: bir
olay gunlugu _"ne oldu"_yu sirasiyla anlatir; damga yalnizca **son durumu**
soyler.

#### 8.3 ⚠️ ACIKTA KALAN — ertelemenin DURUST bedeli

- ⚠️ **Bir TASLAK uzerindeki duzenlemeler izlenmez.** Taslak serbestce degisir
  ve kim ne degistirdi **sorulamaz**. Kabul edilebilir bulundu: taslak henuz
  **disari cikmamistir**.
- ⚠️ **Silinen bir taslak iz birakmaz.**
- ⚠️ **ADR-0034'un kendi borcu KAPANMIYOR:** `finance.transactions`ta bir
  tutarin kim tarafindan degistirildigi **hala sorulamaz**. Bu ADR o module
  **dokunmaz** (Mutlak Kural 1) ve borcu **devralmaz**.
- ⚠️ **ADR-0039 ve ADR-0040'in borclari da acik kalir** (kalemin adini/esigini,
  tedarikcinin odeme kosullarini kimin degistirdigi).

> ⚠️ **Tetikleyici YENIDEN ADRESLENIYOR ve bu kayda gecirilmelidir.**
> ADR-0034'un tetikleyicisi bu moduldu; oneri onu **kapatmiyor, tasiyor.** Yeni
> tetikleyici olarak **iki aday** var ve ikisi de gercek:
> **9. modul (IK/Personel)** — bir calisanin rolunu ya da iletisim bilgisini
> kimin degistirdigi KVKK acisindan **erteleme toleransi olmayan** bir
> sorudur (ROADMAP §8.2) — ve **odeme/tahsilat kaydinin geldigi gun** (§12).
> ⚠️ Ucuncu kez ertelenirse borc **artik bir erteleme degil, bir karar** olur.

---

### 9. Izinler — IKI kaynak, NITELIKSIZ, katalog GENIS

ADR-0025'in `resource:action` modeli, **sekizinci** kez.

| Permission       | owner | admin | member | viewer |
| ---------------- | :---: | :---: | :----: | :----: |
| `quote:read`     |  ✅   |  ✅   |   ✅   |   ✅   |
| `quote:write`    |  ✅   |  ✅   |   ✅   |   ❌   |
| `quote:delete`   |  ✅   |  ✅   |   ❌   |   ❌   |
| `invoice:read`   |  ✅   |  ✅   |   ✅   |   ✅   |
| `invoice:write`  |  ✅   |  ✅   |   ✅   |   ❌   |
| `invoice:delete` |  ✅   |  ✅   |   ❌   |   ❌   |

⚠️ **`quote` ve `invoice` NITELIKSIZDIR ve bu dogrudur:** baska hicbir modulun
"teklif"i ya da "faturasi" olmayacaktir. Nitelemek (`sales_quote`), tasimadigi
bir belirsizligi ima ederdi — ADR-0040'in `supplier` icin verdigi ayni ayrim.

⚠️ **Tek bir `sales_document:*` kaynagi REDDEDILDI.** Iki belge turu ayni
tabloda yasar (§1.1) ama **ayni yetki degildir**: bir satis temsilcisinin
teklif yazip fatura kesmemesi mesru bir istektir ve bedeli **tek bir
stringdir**. ⚠️ Sema secimi izin secimini **belirlemez** — ucler ayri
(`/quotes`, `/invoices`), yani guard **statik** kalir; `kind` kolonuna bakan
(ABAC'a kayan) bir izin kontrolu **yoktur**.

#### 9.1 ⚠️ SATIR KALEMI BIR IZIN KAYNAGI DEGILDIR — ADR-0039'un ongorusu boyle karsilandi

ADR-0039 §8.2 `item` → `stock_item` nitelemesini **bu modul icin** yapmisti:

> _"8. modul (Teklif/Fatura) **line item** kavramini getirecek ve `item:read`
> o gun ya breaking change ile degisirdi ya da iki modul tek kelimeyi
> paylasirdi."_

**Kavram geldi; cakisma gelmedi** — cunku satir kalemi **bir kaynak degildir**:

- Bagimsiz bir yasami yoktur: belgesiz bir satir **anlamsizdir** (`CASCADE`).
- Bagimsiz bir ucu yoktur: kalemler `PATCH /quotes/:id` ile **belgenin butunu**
  olarak yazilir.
- Bagimsiz bir yetkisi yoktur: _"belgeyi gorebilen ama satirlarini
  goremeyen"_ bir rol tanimsizdir.

⚠️ **ADR-0039'un nitelemesi yine de DOGRUYDU ve geri alinmaz.** `stock_item`
adi bugun `item`den daha acik okunuyor; bir tedbirin tetiklenmemesi, tedbirin
gereksiz oldugunu **kanitlamaz**.

⚠️ **Kayda gecen ders sudur: ongoru dogru yerdeydi, ama gercek cakisma BASKA
kelimede cikti.** `document`, Belge modulu tarafindan alinmis durumda
(`document:read` · `document:write` · `document:delete`) — ve bu, §1'deki
**tablo adi** kararini da belirledi. Cakisma **ucuncu kez** gercek oldu
(ADR-0040'in `contact`/`interaction`i ikinciydi) ve uc kez de ayni sey
yapildi: **calisan modulun katalogu degistirilmedi.**

#### 9.2 Neden GENIS katalog

ADR-0034 §7'nin olcutu: _"musteri listesi ve gorev listesi PAYLASILAN is
gercekleridir, sirketin nakit akisi degildir."_

**Bir teklif yazmak satisin gunluk isidir.** Teklif hazirlayan, musteriyle
pazarlik eden ve faturayi kesen kisi **tam olarak `member` rolundeki
kisidir**. Dar bir katalog, modulu onu kullanmasi gereken herkese kapatirdi.

⚠️ **Bir istisna kayda geciriliyor:** bir teklif **fiyat ve iskonto** tasir,
yani ticari hassasiyeti `crm.opportunities.estimated_value`den **yuksektir**.
Yine de alan bazli gizlilik **ABAC**tir ve backlog'tadir (ROADMAP §1.1). Kaba
hali (_"teklifleri hic gormesin"_) bugun **tek satirlik** bir degisikliktir,
cunku `quote:read` ayri bir izindir.

⚠️ **Yan etki: bu modul de `POST /ask` izin filtresini TETIKLEMEZ.** Tek
katkicinin kapisi `quote:read` ve dort rol de onu tasiyor. Filtrenin tek
gercek tetikcisi **hala Finans**tir (`cashflow:read` / `commentary:read`) —
**yedinci** kez ayni kayit.

---

### 10. Exception filter — hepsi ILK GUNDEN

**Karar: `InvoicingDomainExceptionFilter`in `@Catch(...)` listesi BASTAN
yazilir.**

| Hata                           | HTTP | `DisclosableProblem` | Ne zaman                                                                                          |
| ------------------------------ | ---- | -------------------- | ------------------------------------------------------------------------------------------------- |
| `EmbeddingFailedError`         | 502  | ✅ **EVET**          | ⚠️ **Bugun TETIKLENEMEZ** — modulde embedding yok (§5). **Yine de yazilir.**                      |
| `CompletionFailedError`        | 502  | ✅ **EVET**          | ⚠️ **Bugun TETIKLENEMEZ** — modul ici AI yuzeyi yok. **Yine de yazilir.**                         |
| `RateLimitExceededError`       | 429  | ❌ (4xx zaten gecer) | ⚠️ **Bugun TETIKLENEMEZ** — oran siniri deklarasyonu yok (§5). **Yine de yazilir.**               |
| `PdfRenderFailedError`         | 502  | ✅ **EVET**          | PDF uretimi coker — kullanici **tekrar denemesi gerektigini** ogrenmeli                            |
| `DocumentNotEditableError`     | 409  | ❌                   | Gonderilmis/kesilmis belgeye yazma denemesi (§2)                                                   |
| `InvalidStatusTransitionError` | 409  | ❌                   | `draft`tan `accepted`e atlama gibi (§1.2)                                                          |
| `QuoteNotAcceptedError`        | 409  | ❌                   | Kabul edilmemis teklifi donusturme denemesi (§3)                                                   |
| `SalesDocumentNotFoundError`   | 404  | ❌                   | —                                                                                                  |

⚠️ **UC AI HATA TIPININ UCU DE BUGUN TETIKLENEMEZ ve bu, kuralin ilk kez BU
KADAR TAM sinanmasidir.** CLAUDE.md'nin kalici kurali acik:

> _"`EmbeddingFailedError`, `RateLimitExceededError` ve `CompletionFailedError`
> **HER** modulun exception filter'inin `@Catch(...)` listesine BASTAN eklenir —
> o modul bugun kullaniyor olsun ya da olmasin. **Bu, modul modul yeniden
> tartisilmaz.**"_

Gerekce **asimetrik bedeldir**: bugun uc satirlik olu kod; sonra eklenirse,
modul bir AI yuzeyi kazandigi gun **ham 500** doner ve kullanici tekrar
denemesi gerektigini **ogrenemez**. ⚠️ Bu modul AI yuzeyi kazanmaya en yakin
adaylardan biridir: bir _"teklif metnini yaz"_ ya da _"belgeyi ozetle"_
ozelligi, kurucu kisitin dogal sonucudur.

⚠️ **`PdfRenderFailedError` isaretlenir** ve gerekcesi ADR-0037'nin
`StorageFailedError`iyla ayni satirdandir: kullanici dogru bir istek yapti,
hata sunucudadir ve **tekrar denemek** anlamlidir. Maskelenirse ekranda
"Beklenmeyen bir hata" yazar ve kullanici belgesinin **kaydedildigini** (ama
basilamadigini) ogrenemez.

⚠️ **`StorageFailedError` YOKTUR** (§6.3) · ⚠️ **Eslenmemis domain kodunun
500'u MASKELI kalir** ve bunu **bir test kilitler** — ADR-0035'in bes modulluk
dersinin **sekizinci** uygulamasi.

---

### 11. Frontend: ODA — ilk gunden

⚠️ **ADR-0038'in ODA sisteminde sifirdan dogan UCUNCU moduldur** (Stok,
Tedarikci, Teklif/Fatura). Donusturulecek bir sey yok.

#### 11.1 Renk: iki satir, kalibrasyon GEREKMIYOR

`module-colors.css` bu modulun paletini **zaten olculmus** tasiyor:

```
[data-module='invoicing']  acik #257c6c (ink #076b5b) · koyu #64b6a4
```

Dosyanin kendi secim kurali: _"**AKRABA MODULLER KOMSU HUE ALIR.** ...
Teklif/Fatura, Finans'in yaninda ('Finans uzantisi')."_ Renk, ROADMAP'in
konumlandirmasini **gorsel olarak** soyluyor. Renk secilmez, **zaten
secilmistir**.

⚠️ **RENK KORLUGU UYARISI BU MODULDE BIRIKIYOR:** koridorda artik **iki**
komsu-hue cifti var — CRM (#3173af) / Tedarikci (#5c6cab) **ve** Finans
(#307d54) / Teklif-Fatura (#257c6c). Ikincisi birincisinden **daha yakindir**.
Bu yuzden kural bagimsizca tekrarlanir: **renk hicbir yerde tek ayirt edici
degildir** — her kapi farkli ikon ve farkli etiket tasir, aktif kapi ayrica
kalin yazi ve `aria-current="page"` tasir.

⚠️ `data-module` unutulursa hata **SESSIZDIR**: ekran calisir, terracotta
kalir, lint yakalamaz. ⚠️ `app-shell.tsx`e **sekizinci kez dokunulmaz**.

#### 11.2 Iki rota + detay, TEK duvar — ADR-0038 §6.5

| Rota                      | Duvar (**ORTAK**)                      | Tezgah                                |
| ------------------------- | -------------------------------------- | ------------------------------------- |
| `/app/invoicing`          | Kahraman + uydular + asistanin cumlesi | **Teklif listesi**                    |
| `/app/invoicing/invoices` | ⚠️ **AYNI DUVAR**                      | **Fatura listesi**                    |
| `/app/invoicing/<id>`     | ⚠️ **YOK** (detayin duvari olmaz)      | Belge + kalemler + PDF + aksiyonlar   |

Iki rota **ayni soruyu** cevapliyor: _"satis evrakimiz ne durumda"_. Duvar
**kopyalanmaz, paylasilan bir bilesendir** (`invoicing-wall.tsx`).

⚠️ **KAHRAMAN RAKAM BIR SAYIDIR, BIR TUTAR DEGIL:** "cevap bekleyen teklif
sayisi". Gerekce ADR-0039'un _"toplam stok diye bir rakam bulunmaz"_ karariyla
ayni: tutarlar **para birimi bazinda ayrisir** (§1.4) ve tek bir kahraman
rakama **toplanamaz**. Uydular: kabul edilip **faturalanmamis** teklif sayisi
(§4.1'in 0.95'i) · suresi dolmus teklif sayisi · bu ay kesilen fatura sayisi.
Tutarlar tezgahta, **para birimi etiketiyle** gosterilir.

⚠️ **Yeni kutuphane YOK** (ADR-0035 §7 / ADR-0039 §11.3 / ADR-0040 §8.2). PDF
onizlemesi tarayicinin kendi goruntuleyicisidir; bir PDF.js entegrasyonu
**eklenmez**.

⚠️ **Rota golgelemesi** (ADR-0040'in en sessiz riski): `/invoicing/invoices`
sabit bir yoldur ve `:id` yakalayicisindan **once** tanimlanir. Aksi halde
`invoices` bir UUID sanilir, **422** doner ve **hicbir test kirmizi yanmaz**.

---

### 12. Kapsam disi (bugun yapilmiyor)

**Teklif/Fatura siniri** — bunlar "sonra ekleriz" degil, **v1'in tanimi
disidir**:

- ⚠️ **YASAL E-FATURA / E-ARSIV ENTEGRASYONU — bu modulun EN BUYUK siniri.**
  Resmi bir e-fatura; ulkeye ozel bir **mukellef sorgusu**, **mali muhur /
  imza**, bir **zarf formati** (UBL-TR gibi), bir **entegrator sozlesmesi**,
  yasal **saklama suresi** ve bir **iptal/itiraz** akisi demektir. Bunlarin
  hicbiri tasarim tercihi degil **mevzuattir** ve ulke degistiginde **bastan
  yazilir**. Global bir urunun cekirdegine konulamaz.
  > ⚠️ **Sonucu acikca yaziliyor ve ARAYUZDE de yazilacaktir:** bu modulun
  > urettigi "fatura" **bir PDF belgesidir, mali belge degildir**. Belirsiz
  > birakmak, kullanicinin yasal yukumlulugunu yerine getirdigini **sanmasina**
  > yol acardi — bu ADR'nin engelledigi **en pahali sessiz hata**.
  > Ihtiyac dogdugunda cozum **ayri bir modul + ulke basina adapter**dir;
  > port deseni bunun icin hazirdir.
- ⚠️ **WORD / DOCX CIKTISI — bilincli olarak EKLENMIYOR.** Iki sablonu (PDF +
  DOCX) senkron tutmak **ikinci bir dogruluk kaynagi** demektir: bir alan
  eklenir, biri guncellenir, digeri unutulur ve hata **sessizdir** — belge
  uretilir, yalnizca **eksiktir**. Projenin tekrarlayan reddi (denormalize ad,
  `total` kolonu, `last_activity_at`) burada **sablon** kiligindadir.
  ⚠️ DOCX'in tek gercek gerekcesi _"musteri uzerinde degisiklik yapabilsin"_dir
  ve bu, **gonderilmis belgenin degistirilemezligiyle** (§2) dogrudan celisir.
  Gercek talep cikarsa **v2** ve ayri bir karar.
- **Odeme takibi / tahsilat / kismi odeme / vade hatirlatmasi** — ⚠️ **en cok
  istenecek eksik.** Yon belirsizdir (§7.2: Finans mi okur, bu modul mu yazar)
  ve hatirlatma **Queue karari** (ROADMAP §2.3) verilmeden yapilamaz.
  **Ayri ADR.**
- **Tekrarlayan (abonelik) fatura** — bir zamanlanmis is demektir; ayni Queue
  karari.
- **E-posta ile gonderim** — `EmailPort` var ama teslimat, ek dosya ve sablon
  **ayri bir istir**; v1'de `sent` kullanicinin **beyanidir** (§1.2).
- **Stok baglantisi ve stok dusulmesi** (§7.3) · **satin alma siparisi**
  (ADR-0040 §9'un kalemi) · **muhasebe entegrasyonu** (ADR-0034 §11).
- **Sablon ozellestirme** (logo, renk, alan secimi) — sablon **tektir ve
  sabittir**; ozellestirme §6.3'un saklama karariyla **birlikte** verilmelidir.
- **Onay akisi / imza** — bir is akisi motoru demektir (`Workflow`, ROADMAP
  §9.3'un acik sorusu).
- **Cok para birimli tek belge** · **kur cevrimi** — ADR-0034'un siniri (§1.4).

---

## Gerekce

**Neden bu modul ROADMAP §3.5'te 8. sirada dogru duruyor.** _"8 → 3"_
bagimliligi **karsilandi ve sekli beklenenden farkti** (§7.2): devralinan sey
bir tablo ya da bir kenar degil, **alinmis para kararlaridir**. ROADMAP'in
korktugu paralel gelir modeli tam olarak bu devralmayla onlendi.

**Neden tek tablo (§1.1).** ADR-0034 tek tabloyu **daha tehlikeli** bir
durumda (isaret unutmak = sessiz yanlis sayi) secmisti; burada ayni riskin
sekli **gorunurdur** (yanlis listede satir). Daha zayif bir riskte daha
ihtiyatli davranmak tutarsizlik olurdu.

**Neden yapisal katkici var — ve bu ADR'nin en agir karari (§4).** ADR-0040
uc adayi reddederek bir **olcut** birakti; bu modulun adayi o olcutun uc
maddesinden de gecen **ilk adaydir**. Reddetmek, bir modulu AI'a hicbir sey
katmayan bir modul yapardi — ve gerekcesi mimari degil **bir sayacin rahat
etmesi** olurdu.

**Neden ADR-0036 bu iste degistirilmiyor (§4.3).** Bir platform karari, onu
degistirmesi gereken **veriye sahip olmadan** revize edilmez. ADR-0036'nin
kendi bilinen siniri bunu yaziyordu: _"olculmus bir KALITE verisi
olustugunda"_. Bu modulun kapanis denetimi tam olarak o veriyi uretir.

**Neden PDF saklanmiyor (§6.3).** Kod tabaninda yazili bir **ongoru** vardi ve
ongoru bir karar degildir. Saklamanin bedeli iki dogruluk kaynagi + hala acik
bir yetim nesne borcudur; uretmenin bedeli **tek** ve **tetikleyicisi
bellidir** (sablon degisikligi).

**Neden `platform/audit` acilmiyor (§8).** Sorunun buyuk kismi §2 ile
**ortadan kalkiyor**: degistirilemez bir belgede "kim degistirdi" sorusu
sorulmaz. ADR-0039'un dersi ayniydi ve orada da **daha guclu** cikmisti.
Geriye kalan (durum gecisleri) dort kolonla cevaplaniyor. ⚠️ Yine de bu bir
**oneridir**; tetikleyicinin ucuncu kez ertelenmesi bir **karar** haline gelir
ve o karari Product Owner verir.

---

## Sonuclari

**Olumlu**

- ROADMAP'in _"8 → 3"_ bagimliligi karsilaniyor; paralel bir gelir modeli
  **dogmuyor**.
- Gonderilmis belge **degistirilemez** (§2) — denetim izi borcunun buyuk kismi
  bir altyapi kurmadan **ortadan kalkiyor**.
- "Faturaya donustur" gecmis teklifi **bozmuyor** (§3): iki belge, iki gercek.
- `crm.public.ts` **tek satir degismiyor** (§7.1) — cross-modul icin **ayri
  slice gerekmiyor**, ikinci kez.
- Vektor tasiyan tablo sayisi **sekizde kaliyor**; anlamsal havuza **gurultu
  eklenmiyor** (§5).
- `PdfPort` ile PDF uretimi **saglayici bagimsiz**; IK'nin belge ciktilari icin
  hazir.
- Renk, RLS sablonu, izin modeli, katkici deseni, exception filter deseni ve
  ODA duzeni: **alti da hazir geliyor**.

**Olumsuz / bedeli**

- ⚠️ **ADR-0036'nin esigi asiliyor** (§4.3) — bir platform karari **yeniden
  acilmak zorunda kaliyor**. Bu ADR'nin en agir bedeli budur.
- ⚠️ **Fan-out N=14'e cikiyor** ve **alti yapisal kaynak uc taban yuvasi icin
  yarisiyor** — her cevapta **yarisindan azi** duyulacak. Olcum § Kapanis
  denetimi'nde **zorunludur**.
- ⚠️ **Yeni bir kutuphane bagimliligi giriyor** (`pdfkit` + gomulu font) —
  projede ilk sunucu tarafi render bagimliligi.
- ⚠️ **Bir ad KOLONDA saklaniyor** (§1.5) — bes kez verilmis bir karardan
  bilincli sapma; gerekce yazili ama **okunmadan kopyalanirsa** yanlis emsal
  uretir.
- ⚠️ **`platform/audit` borcu ucuncu kez erteleniyor** ve tetikleyici yeniden
  adresleniyor (§8.3).
- ⚠️ **Retention ONSEKIZDEN YIRMIYE cikiyor** (`sales_documents` +
  `sales_document_lines`).
- **Bir migration prod'a gider** (`0031`).

---

## Degerlendirilen alternatifler

| Alternatif                                                              | Neden secilmedi                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Iki ayri tablo** (`quotes` + `invoices`)                              | Iki satir tablosu, iki durum makinesi, iki degistirilemezlik zorlamasi ve tablolar arasi donusturme; karsiliginda onlenen risk **gorunur** bir risktir (yanlis listede satir), ADR-0034'un onledigi **sessiz yanlis sayi** degil (§1.1).               |
| **`total` / `tax_total` kolonlari**                                     | Kalem degisip kolon guncellenmedigi anda **iki farkli dogru** dogar. Dondurma ihtiyaci bir kopyayla degil **bir kisitla** karsilandi (§1.3, §2).                                                                                                       |
| **Tek "belge" kavrami** (teklif durum akisiyla faturaya donusur)        | ⚠️ Teklifin kendisini **degistirirdi**; kabul edilmis teklif geriye donuk **kaybolurdu**. Product Owner'in acik talebine de aykiri (§3).                                                                                                               |
| **Musteri adini dizinden okumak** (§1.5'in reddi)                       | ⚠️ Gecmis belge **geriye donuk degisirdi**: musteri unvan degistirince arsivdeki teklif de degisir ve musterinin elindeki kagitla **ayrisir**. Hata sessizdir.                                                                                         |
| **`max(number) + 1`**                                                   | ⚠️ Silinen bir taslaktan sonra numarayi **yeniden kullanir**; iki belge zaman icinde ayni numarayi tasir ve hata **disarida** ortaya cikar (§1.6).                                                                                                     |
| **Belge numarasini taslakta uretmek**                                   | Silinen her taslak bir numara **yakar**; kullanici numaralar arasindaki bosluklari **hata sanardi**. Numara, belge disari ciktigi an anlam kazanir.                                                                                                    |
| **`sent`ten `draft`a geri donus**                                       | Musteride duran bir kagidi yok saymaktir (§1.2). Cozum `rejected`/`cancelled` + yeni belge.                                                                                                                                                            |
| **Teklif metnini / kalem aciklamalarini embed etmek**                   | ⚠️ ADR-0034 §6.1'in **birebir** ayni gerekcesi: yuzlerce neredeyse ozdes kisa vektor top-K havuzunu kirletir. Ustelik uc anlamsal kaynak zaten sifir aliyor (ADR-0040 olcumu) (§5).                                                                    |
| **Yapisal katkiciyi ERTELEMEK** (ADR-0036'yi acmamak icin)              | ⚠️ Modulu AI'a hicbir sey katmayan bir modul yapardi (kurucu kisit). Gerekce mimari degil **bir sayacin rahat etmesi** olurdu (§4.2).                                                                                                                  |
| **ADR-0036'yi BU ISTE revize etmek** (taban `ceil(K/2)` ya da buyuk `K`) | ⚠️ Alti yapisal kaynakli **tek bir olcum yok**. `K`yi buyutmeyi ADR-0036 zaten reddetmisti (_"sorunu cozmez, erteler; bedeli dogrudan tokendir"_). Once olcum, sonra karar (§4.3).                                                                     |
| **`platform/audit`i BU ISTE acmak**                                     | Sorunun buyuk kismi §2 ile **ortadan kalkiyor**; genel bir denetim altyapisi, gercekten sorulmayan bir soruya **platform capinda** cevap uretirdi. ⚠️ Yine de bu bir **PO karari** olarak isaretlendi (§8).                                            |
| **PDF'i R2'de saklamak**                                                | Ikinci dogruluk kaynagi + ADR-0037'nin **hala acik** yetim nesne borcu + retention'a yeni bir boyut. Uretmenin tek bedeli (sablon kaymasi) bilinen sinir olarak kaydedildi (§6.3).                                                                     |
| **Headless Chrome ile PDF**                                             | ~300 MB'lik bir tarayiciyi API container'ina koymak; ADR-0035'in FullCalendar reddiyle ayni sinif (§6.2).                                                                                                                                              |
| **Word / DOCX ciktisi**                                                 | ⚠️ Iki sablon = **ikinci dogruluk kaynagi**; bir alan eklenir, digeri unutulur ve hata **sessizdir**. Tek gercek gerekcesi (_"musteri degistirebilsin"_) §2 ile celisir (§12).                                                                         |
| **Yasal e-fatura entegrasyonu**                                         | Ulkeye ozel **mevzuattir**, tasarim tercihi degil; global cekirdege konulamaz. Ayri modul + ulke basina adapter (§12).                                                                                                                                 |
| **`lines.stock_item_id`** (Stok'a kenar)                                | Baglantinin dogal beklentisi **stok dusulmesidir** ve o, bu modulun envanterin dogrulugundan **sorumlu olmasi** demektir; fiyat zaten `inventory`de yok; zorunlu kilinsaydi **sahte kalem** uretirdi (§7.3).                                           |
| **Kesilen faturanin `finance.transactions`a satir yazmasi**             | ⚠️ ADR-0034'un sinirini delerdi: o tablo **gerceklesmis nakit hareketidir**. Fatura kesmek para almak degildir; ustelik yon belirsiz ve **dongu riski** var (§7.2).                                                                                    |
| **Tek `sales_document:*` izni**                                         | _"Teklif yazabilir ama fatura kesemez"_ mesru bir istektir ve bedeli **tek bir string**tir (§9).                                                                                                                                                       |
| **Satir kalemi icin ayri izin** (`line_item:*`)                         | Satirin bagimsiz bir yasami, ucu ve yetkisi **yoktur**; ADR-0039'un ongordugu cakisma **bu yuzden** gerceklesmedi (§9.1).                                                                                                                              |
| **Dar izin katalogu** (Finans gibi)                                     | Teklif yazmak satisin **gunluk isidir**; `member` tam olarak o kisidir (§9.2).                                                                                                                                                                         |

---

## Bilinen sinirlar

- ⚠️ **YASAL E-FATURA YOK** (§12) — uretilen "fatura" bir **PDF belgesidir**,
  mali belge degildir. Bu, en cok yanlis anlasilacak sinirdir ve **arayuzde de
  yazilir**.
- ⚠️ **WORD/DOCX CIKTISI YOK** (§12) — iki sablonun senkron riski; v2.
- ⚠️ **Odeme, tahsilat, kismi odeme ve vade takibi YOK** (§12) — _"bu fatura
  odendi mi"_ sorusu **sorulamaz**. Ikinci en cok istenecek eksik.
- ⚠️ **"Bu teklifin ne kadari faturalandi" sorulamaz** (§3) — ikinci kez
  donusturme serbesttir ama mutabakat yoktur.
- ⚠️ **ADR-0036'nin esigi ASILDI** (§4.3) — alti yapisal kaynak, uc taban
  yuvasi. **Iki kaynagin her cevapta disarida kalmasi beklenir** ve bu bir
  kusur degil **kapasite siniridir**; olcum kapanis denetiminde zorunludur.
- ⚠️ **Sablon TEKTIR ve ozellestirilemez** (§6.3, §12) — degistigi gun PDF
  saklamaya gecilir ve o yol **tek yonludur**.
- ⚠️ **Gecmis belgeler bugunku sablonla yeniden uretilir** (§6.3) — icerik
  aynidir (§2), **gorunum** degisebilir.
- ⚠️ **Musteri adi KOLONDA saklanir** (§1.5) — CRM'de yapilan bir yeniden
  adlandirma gecmis belgelere **yansimaz** ve bu **kasitlidir**. ⚠️ Ayni
  ekranda iki ad gorunebilir.
- ⚠️ **Belge numarasinda BOSLUK olusabilir** (§1.6) — iptal edilen bir kesim
  numarasini geri vermez. Bosluk **gorunur**, tekrar **gorunmez**.
- ⚠️ **Taslak duzenlemeleri ve taslak silmeleri iz birakmaz** (§8.3).
- ⚠️ **ADR-0034 / 0039 / 0040'in `platform/audit` borclari ACIK KALIR** (§8.3)
  — bu ADR onlari devralmaz.
- ⚠️ **Satir kalemleri stok kalemlerine bagli DEGILDIR** (§7.3) — _"bu vidayi
  hangi tekliflerde fiyatladik"_ sorusu **yapisal olarak** sorulamaz; fatura
  kesmek stogu **dusmez**.
- ⚠️ **Vergi bir KURAL degil bir SAYIDIR** (§1.8) — muafiyet, tevkifat, ulke
  bazli oran **yoktur**.
- ⚠️ **Tek belgede tek para birimi**; farkli para birimleri **toplanmaz**
  (§1.4) — kahraman rakam bu yuzden bir **sayidir**.
- ⚠️ **Iskonto ALANI yok** (§1.7) — negatif birim fiyatli bir satir olarak
  yazilir; toplam yuzdesel iskonto **hesaplanmaz**.
- ⚠️ **Belge bazli gizlilik yok** — `quote:read` tasiyan herkes **tum
  teklifleri ve fiyatlari** gorur (§9.2); alan/kayit bazli gizlilik ABAC'tir,
  backlog'ta.
- ⚠️ **E-posta ile gonderim yok** — `sent` kullanicinin **beyanidir** (§1.2).
- **Iyimser es zamanlilik yok** — son yazan kazanir; **sekizinci** kez ayni
  sinir. ⚠️ Ama gonderilmis belgede **gecerli degildir** (§2: yazma yolu
  kapali).
- ⚠️ **Arama YOK — ne anlamsal ne klasik** (§5): belgeler yalnizca yapisal
  olarak filtrelenir. ADR-0011'in FTS kalemi **dokuzuncu** kez aciktir ve bu
  modul onun **en dogal adayidir** (`description` alanlari).
- ⚠️ **Retention ONSEKIZDEN YIRMIYE cikar** — `invoicing.sales_documents` +
  `invoicing.sales_document_lines` (ikincisi `CASCADE` ile ebeveynine bagli;
  dogru retention kolu **ebeveyndir** — `conversations` dersinin **yedinci**
  uygulamasi).
  > ⚠️ **`invoicing.number_sequences` LISTEYE GIRMEZ** (§1.6): tenant + tur
  > basina **iki satir**, zamanla **cogalmaz**. ROADMAP §8.5'in kendi olcutu —
  > _"borcu doguran sey satirin ZAMANLA COGALMASIDIR"_ — ADR-0040'in kapanis
  > denetiminde ogrenildigi gibi **ilk gunden** uygulandi.
  > ⚠️ **`sales_documents` icin dogru cevap "sil" OLMAYABILIR:**
  > `finance.transactions`in ters gerekcesi (TTK — ticari kayit saklama)
  > burada **kismen** gecerlidir. Teklifler budanabilir; kesilmis faturalar
  > ticari kayittir. Ayrim **tablo basina degil BELGE TURU basinadir** ve v1
  > bunu **ayirt etmez** — ROADMAP §8.2'nin KVKK kontrol noktasina bir girdi.
  > (Belge modulunun _"tablo basina degil belge basina"_ ayriminin **ikinci**
  > ornegi.)
  > ⚠️ **Vektor tasiyan tablo sayisi SEKIZDE KALIR** (§5) — Faz 5'te bu sayiyi
  > artirmayan **ilk** modul.

---

## Uygulama plani (slice'lar)

> **Surec (5. modulden itibaren gecerli):** ADR / Backend (**tek slice**) /
> [cross-modul dokunusu **yalnizca gerekiyorsa** izole slice] / Frontend +
> kapanis denetimi.

| Slice | Ne                                                                                                                                                                                                                                                                                                     | Migration               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| **0** | **Bu ADR** — karar, kapsam, sinirlar; ⚠️ **iki PO onayi** (§4.3, §8)                                                                                                                                                                                                                                   | —                       |
| **1** | **Backend (TEK slice):** `invoicing` semasi + uc tablo + teklif/fatura CRUD + durum gecisleri + §2'nin **uc katmanli** degistirilemezligi + belge numarasi (kilitli sayac) + "faturaya donustur" + `PdfPort` + `pdfkit` adapter + izin katalogu + exception filter + **TEK yapisal katkici**             | `0031_invoicing_schema` |
| **2** | **Frontend + HAFIF kapanis denetimi:** iki rota + detay (ODA, ortak duvar), `invoicing` rengi, koridorda dokuzuncu kapi, PDF onizleme/indirme + § Kapanis denetimi listesi                                                                                                                              | —                       |

**Cross-modul slice'i YOK ve bu bir atlama degil** — §7.1'in dogrudan sonucu
(iki dizin de hazir, `crm.public.ts` degismez) ve §7.3'un sonucu (yazilacak bir
`inventory.public.ts` **yoktur**).

⚠️ **`PdfPort` Slice 1'e dahildir ve ayri bir slice DEGILDIR.** ADR-0037
`StoragePort`u backend'i **ikiye bolerek** eklemisti; gerekcesi **iki ayri risk
sinifiydi** (nesne deposu tutarliligi + AI hatti). Burada ikinci risk **yok**
(§5) ve PDF uretimi **saklama yapmadigi** icin (§6.3) tutarlilik riski de yok
— port **saf bir donusumdur**.

> ⚠️ **BIR MIGRATION PROD'A GIDER.** `feature/tenant-multi-tenancy-core`'a
> yapilan her push Railway'de `db:preflight && db:migrate` calistirir
> (CLAUDE.md). **Slice 1'in push'undan once ayrica haber verilir.**

> ⚠️ **YENI MIGRATION EKLEME KONTROL LISTESI (CLAUDE.md — zorunlu, uc adim):**
>
> 1. `0031_invoicing_schema.sql` **ve** `.down.sql` yazilir.
> 2. ⚠️ **`drizzle/meta/_journal.json`'a giris eklenir** (`idx: 31`, `when`
>    artan, `tag` dosya adiyla birebir) — atlanirsa `pnpm db:migrate`
>    _"applied successfully"_ yazar, cikis kodu 0 verir ve **hicbir sey
>    uygulamaz**. ADR-0037'de gercekten yasandi.
> 3. ⚠️ **`database.integration.spec`'in geri alma listesine eklenir** — en
>    yeniden eskiye (`0031` → `0030`), bagimli tablo ebeveyninden **once**.
>
> **Kanit adimi:** uc tablonun **varligini** iddia eden bir entegrasyon testi
> (`invoicing-schema.integration.spec`) — sayi saymak yetmez; sayac da
> journal'a baglidir ve **ayni yalani soyler**.

---

## Kapanis denetimi (Slice 2) — **HAFIF seviye**

> **Surec kurali (Product Owner, 2026-08-10):** kapanis denetimleri **iki
> seviyelidir**. Her modul sonunda **HAFIF**, **AGIR** yalnizca birkac modulde
> bir.

- [ ] `git status` temiz · `pnpm verify` **cikis kodu 0**
- [ ] **Uclarin gercek istek turu** — 401/201/200/403/404/409/422
- [ ] **Rol turu** (uc gercek kullanici): viewer okur **yazamaz**, member yazar
      **silemez**
- [ ] ⚠️ **§2 sinavi (UC KATMAN):** `sent` bir teklifte `PATCH` **409** ·
      `DELETE` **409** · ⚠️ **kalem tablosuna DOGRUDAN `UPDATE` denemesi
      veritabani seviyesinde REDDEDILIYOR** (trigger; ham SQL ile tetiklenir)
- [ ] ⚠️ **§3 sinavi:** donusturme sonrasi teklifin **tek kolonu degismedi**
      (`updated_at` dahil) ve kalemleri **birebir duruyor**; faturanin bir
      kalemi degistirildiginde teklif **etkilenmiyor**
- [ ] ⚠️ **§1.6 sinavi:** iki es zamanli `issue` **ayni numarayi almiyor**
      (kilit gercekten calisiyor) · iptal edilen numara **geri gelmiyor**
- [ ] ⚠️ **§1.3 sinavi:** toplam **turetiliyor** — `sales_documents`ta `total`
      kolonu **yok** (sema uzerinden dogrulanir)
- [ ] ⚠️ **§6.2 sinavi:** Turkce karakterli (`ğ ş İ ı`) musteri adi ve kalem
      aciklamasi tasiyan bir PDF uretiliyor ve karakterler **ciktida dogru**
- [ ] ⚠️ **§6.3 sinavi:** R2/MinIO'da **hicbir nesne olusmuyor** (PDF
      indirildikten sonra depo **bos**)
- [ ] ⚠️ **§9.1 sinavi:** `document:*` izinleri **tek satir degismedi**
      (`git diff -- documents.permissions.ts` **bos**); `quote:read` tasiyip
      `document:read` tasimayan bir kullanici Belge modulunu **goremiyor**
- [ ] ⚠️ **§10 sinavi:** `@Catch` listesi **sekiz** tip, `StorageFailedError`
      **yok**, eslenmemis domain kodu **maskeli**
- [ ] ⚠️ **ADR-0036 ZORUNLU OLCUM — BU MODULDE ESIK ASILDIGI ICIN EN AGIR
      MADDE:** **on dort** katkici dolu, **uc farkli soru**. Kaydedilecekler:
      (a) yapisal ses sayisi **hala 3 mu** (`ceil(8/3)`), (b) **hangi iki
      yapisal kaynak disarida kaliyor** ve bu **uc soruda da ayni mi**,
      (c) `invoicing-pipeline` **iceride mi**, (d) anlamsal tarafta kac kaynak
      **sifir aliyor**.
      ⚠️ **Bu olcum ADR-0042'nin (ADR-0036 revizyonu) TEK VERI GIRDISIDIR**;
      atlanirsa revizyon **veri olmadan** yapilmak zorunda kalir.
- [ ] **Fan-out N=14 olcumu** — ADR-0040'in N=13 olcumuyle (81 ms, %1–2) ayni
      bantta mi
- [ ] **Renk turu** acik **ve** koyu temada, gercek tarayicida — ⚠️ **IKI
      komsu-hue cifti** (CRM/Tedarikci **ve** Finans/Teklif-Fatura) koridorda
      yan yana ayirt edilebiliyor mu
- [ ] ⚠️ **ODA sinavi:** duvar **gercekten ortak** (kopyalanmis degil), detay
      sayfasinin duvari **yok**, kahraman rakam bir **sayi** (tutar degil)
- [ ] ⚠️ **§12 sinavi:** arayuz _"bu bir mali belge degildir"_ uyarisini
      **gercekten gosteriyor** (fatura ekraninda, gorunur yerde)
- [ ] Bilinen sinirlar ADR + CLAUDE.md + ROADMAP §8.5'e islendi (**yirmi**
      tablo; `number_sequences` **girmedi**)

**Bilincli yapilmayanlar** (hafif denetim kurali, kayda gecer): sifirdan
kurulum ❌ · iki tenant'la tam RLS izolasyon turu ❌ (entegrasyon testi
kapsiyor).
⚠️ **Prod dogrulamasi ZORUNLUDUR** — Slice 1 bir migration tasiyor (`0031`):
health 200 · migration sayisi 31 → 32 · uc tablo `RLS + FORCE` · uc dar rol
**kor** · `GET /api/v1/invoicing/quotes` **401**.

---

## Bu karar ne zaman yeniden gozden gecirilir?

- ⚠️ **HEMEN, kapanis denetiminden sonra: ADR-0036 (ADR-0042 adayi).** Esik
  asildi (§4.3); revizyon **olculmus dagilim verisiyle** yapilir. Bu, bu
  ADR'nin urettigi **tek zorunlu takip isidir**.
- **Odeme / tahsilat istendiginde:** yon karari (§7.2) — Finans mi okur, bu
  modul mu yazar. ⚠️ Ikisi ayni anda yazilirsa **dongu** olur. **Ayri ADR.**
- **Ilk sablon degisikliginde:** PDF saklamaya gecilir (§6.3) ve yol **tek
  yonludur**; `StoragePort` ikinci tuketicisini o gun bulur.
- **Yasal e-fatura istendiginde:** ayri modul + ulke basina adapter (§12).
  ⚠️ Bu ADR'nin cizdigi sinir **bir asama degil bir sinirdir**.
- **Satin alma siparisi (ADR-0040 §9) geldiginde:** `lines.stock_item_id`
  sorusu (§7.3) **iki taraftan birden** gundeme gelir ve dizini **Stok yazar**
  (ADR-0039 §9.1).
- **9. modul (IK) geldiginde:** ⚠️ `platform/audit` tetikleyicisi **yeniden
  adreslendi** (§8.3) ve orada erteleme toleransi **daha dusuktur** (KVKK,
  ROADMAP §8.2). Ucuncu erteleme bir **karar** olur.
- **Word/DOCX ya da sablon ozellestirme istendiginde:** ikisi **birlikte**
  karara baglanmalidir (§6.3, §12) — ayri ayri verilirse iki sablon kaynagi
  dogar.
- **ABAC geldiginde:** §9.2'nin fiyat gizliligi istisnasi ilk gercek talibini
  bulur (ROADMAP §1.1).
