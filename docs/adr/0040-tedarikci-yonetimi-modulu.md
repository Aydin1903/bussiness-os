# 0040 — Faz 5 / Modul 7: Tedarikci Yonetimi

- **Durum:** Kabul edildi — **UYGULANDI ve KAPANDI** (2026-08-22)
- **Tarih:** 2026-08-21
- **Karar veren:** Product Owner
- **Faz:** 5

## Baglam

Faz 5'in ilk **alti** modulu kapandi ve prod'da canli: CRM
([ADR-0031](0031-crm-module.md) + [ADR-0032](0032-company-summary.md)) ·
Projeler ([ADR-0033](0033-projects-module.md)) · Finans
([ADR-0034](0034-finance-module.md)) · Randevu/Rezervasyon
([ADR-0035](0035-randevu-rezervasyon-modulu.md)) · Belge/Sozlesme
([ADR-0037](0037-belge-sozlesme-yonetimi.md)) · Stok/Envanter
([ADR-0039](0039-stok-envanter-modulu.md)). Platform seviyesinde iki is daha
kapandi ve ikisi de kalici standarttir:
[ADR-0036](0036-context-retrieval-kota.md) (havuzun yapisal taban kisiti) ve
[ADR-0038](0038-oda-tasarim-sistemi.md) (ODA tasarim sistemi).

ROADMAP §3.5'in **yedinci** sirasi **Tedarikci Yonetimi**'dir ve o listedeki
kapsam notu bu ADR'nin **en baglayici cumlesidir**:

> _"**CRM deseninin ucuz tekrari** — ayni sekil, ters yon (satin alma)."_

ROADMAP §3.5 ayrica sirayi gerekcelendirirken sunu yaziyor:

> _"**7 → 1.** Tedarikci Yonetimi bilincli olarak **ucuz** konumlandirildi:
> CRM'in sirket/kisi/etkilesim sekli neredeyse birebir tekrar eder. Bu siradaki
> tek 'maliyeti dusuk oldugu icin burada' kalemidir — CRM deseni oturmadan one
> alinirsa ucuzlugu kaybolur."_

**Sekizinci sema.** Zemin alti modulde sinandi; bu modul ondan neredeyse
**yalnizca tuketici** olarak yararlanir:

| Ne                       | Belge'de                    | Stok'ta                         | **Tedarikci'de**                          |
| ------------------------ | --------------------------- | ------------------------------- | ----------------------------------------- |
| `EmbeddingPort`          | `shared/`'dan hazir         | `shared/`'dan hazir             | **`shared/`'dan hazir**                   |
| Chunk tablosu deseni     | **Geri dondu**              | **Reddedildi**                  | **Reddedildi** (§2.2)                     |
| Oran siniri              | Bir satir deklarasyon       | Bir satir deklarasyon           | **Bir satir deklarasyon**                 |
| Retrieval ucu            | TEK katkici                 | Iki katkici                     | ⚠️ **TEK katkici — ve bu bir KARAR** (§3) |
| RLS + `FORCE` sablonu    | Besinci kez                 | Altinci kez                     | **Yedinci kez**                           |
| Kaynak bazli izin modeli | Besinci kez (genis)         | Altinci kez (genis, nitelenmis) | **Yedinci kez (genis, nitelenmis — §5)**  |
| Cross-modul referans     | Iki hedef, sifir yeni dizin | HIC YOK — aday yoktu            | ⚠️ **HIC YOK — ama ADAY VAR** (§4)        |
| Modul imza rengi         | Iki satir                   | Iki satir                       | **Iki satir** (palet zaten olculmus)      |
| Oda tasarim sistemi      | Cevrildi                    | Ilk gunden ODA                  | **Ikinci kez ilk gunden ODA**             |
| Havuz taban kisiti       | ADR-0036'nin ilk sinavi     | ⚠️ Esige **BIR KALDI**          | ⚠️ **ESIGE DOKUNULMUYOR — bilincli** (§3) |

Bu modul gercekten **ucuzdur** ve ADR'nin kisaligi bunun olcusudur
(ADR-0033'un kendi cumlesi: _"ADR'nin kisalmasi mimarinin ise yaradiginin
olcusudur"_). Yine de gercekten yeni **dort** soru var:

1. ⚠️ **"Ucuz tekrar" NEYI kopyalar, neyi kopyalamaz.** (§2) Ucuzluk **kod
   kopyalamak** degildir; ucuzluk **verilecek karar sayisinin az olmasidir**.
   Bu ayrim somut bir sonuc uretiyor: CRM'in `interaction_chunks` tablosu bu
   modulde **acilmiyor** — cunku o tablo bir **emsal degil**, chunk olcutu
   (ADR-0035 §3 + ADR-0037 §3) yazilmadan once alinmis bir **miras**tir.
2. ⚠️ **YAPISAL KATKICI EKLENMIYOR — ve bu, ADR-0036'nin ESIGINE DOKUNMAMA
   KARARIDIR.** (§3) ADR-0039 §7.2 bu satiri **bu ADR'ye adresleyerek** yazdi:
   _"7. modul bir yapisal katkici eklerse esik ASILIR ve ADR-0036 yeniden
   acilmak ZORUNDADIR."_ Satir okundu; asagida uc aday tek tek degerlendirildi
   ve ucu de reddedildi. **Esik asilmiyor, ADR-0036 acilmiyor.**
3. ⚠️ **Cross-modul referans yine yok — ama bu sefer bir ADAY REDDEDILIYOR.**
   (§4) Stok'ta kenar yoktu cunku **hedef sema mevcut degildi**. Burada hedef
   **var** (`inventory`), ROADMAP §3.6 kenari acikca sayiyor
   (_"Tedarikci → Stok"_) ve ADR-0039 §9.1 dizini **kimin yazacagini** bile
   yazmisti. Yani bu, bir bosluk degil **bir hayirdir** ve gerekcesi yazilmak
   zorundadir.
4. ⚠️ **Izin adi cakismasi ILK KEZ GERCEK.** (§5) ADR-0039 §8.2 cakismayi
   **ongorerek** nitelemisti (`item` → `stock_item`, 8. modulun _line item_'i
   icin). Burada ongoru yok: `contact` ve `interaction` **CRM tarafindan zaten
   alinmis** adlardir. Nitelemek bir tedbir degil, bir **zorunluluktur**.

> ⚠️ **Bu ADR'nin cizdigi sinir bir KAYIT sinirdir.** Tedarikci v1 **kimden
> alindigini, kime sorulacagini, ne konusuldugunu ve hangi kosullarla
> calisildigini** bilir. Satin alma siparisi, tedarikci degerlendirme/puanlama,
> teslimat takibi, fiyat listesi ve Stok'a otomatik baglanti **kapsam
> disidir** (§9). Bu bir asama degil bir **sinirdir**; genisletme talebi ayri
> bir ADR ister — ADR-0034'un muhasebe siniri, ADR-0035'in takvim siniri,
> ADR-0037'nin arsiv siniri ve ADR-0039'un sayim siniriyla **ayni disiplin**.

---

## Karar

### 1. Yeni `suppliers` semasi — uc tablo

**Sekizinci sema** (`knowledge`, `crm`, `projects`, `finance`, `appointments`,
`documents`, `inventory`, `suppliers`). Mutlak Kural 5: her modul kendi
semasina sahiptir.

| Tablo                    | Ne tutar                                                                      | CRM karsiligi      |
| ------------------------ | ----------------------------------------------------------------------------- | ------------------ |
| `suppliers.suppliers`    | Tedarikci firmasi — ad · vergi no · kategori · iletisim · **odeme kosullari** | `crm.companies`    |
| `suppliers.contacts`     | Tedarikcideki **kisi** — ad · unvan · e-posta · telefon                       | `crm.contacts`     |
| `suppliers.interactions` | Gorusme gunlugu — **ekleme-yalniz**, satir ici vektor                         | `crm.interactions` |

Ucu de `tenant_id` tasir, ucunde de `ENABLE ROW LEVEL SECURITY` +
`FORCE ROW LEVEL SECURITY` (MT §12.2 sablonu, **yedinci kez**). Tum FK'lar
**sema icidir** — Mutlak Kural 5 yalnizca **cross-schema** FK'yi yasaklar.

```
suppliers.suppliers
  id                 uuid PK
  tenant_id          uuid NOT NULL -> platform.tenants (RESTRICT)
  name               text NOT NULL
  tax_number         text NULL              -- §1.1
  category           text NULL              -- serbest metin; crm.companies.industry'nin aynisi
  email              text NULL
  phone              text NULL
  website            text NULL
  address            text NULL
  payment_terms      text NULL              -- §1.2 SERBEST METIN
  created_by_user_id uuid NOT NULL
  created_at / updated_at

suppliers.contacts
  id                 uuid PK
  tenant_id          uuid NOT NULL -> platform.tenants (RESTRICT)
  supplier_id        uuid NOT NULL -> suppliers.suppliers (CASCADE)
  full_name          text NOT NULL
  title              text NULL
  email              text NULL
  phone              text NULL
  created_at / updated_at

suppliers.interactions
  id                 uuid PK
  tenant_id          uuid NOT NULL -> platform.tenants (RESTRICT)
  author_user_id     uuid NOT NULL
  supplier_id        uuid NOT NULL -> suppliers.suppliers (CASCADE)      -- §1.3
  contact_id         uuid NULL     -> suppliers.contacts (SET NULL)      -- §1.3
  occurred_on        date NOT NULL
  body               text NOT NULL          -- §2.2: ust sinir SUNUCUDA zorlanir
  embedding          vector(1536) NULL      -- §2.2: satir ici, chunk tablosu YOK
  created_at
```

⚠️ **`interactions`de `updated_at` YOKTUR** ve bu ADR-0031 §6'nin
`interaction:create` kararinin dogrudan sonucudur: gorusme gunlugu
**ekleme-yalniz**dir. Kolonu koymak, ADR-0039 §1'in `movements` icin yazdigi
ayni **sessiz davet** olurdu — ileride birinin _"demek ki guncellenebiliyor"_
diye okuyacagi bir satir.

⚠️ **Bu, degistirilemez bir DEFTER DEGILDIR** (ADR-0039 §3.3) ve iki durum
karistirilmamalidir: envanter hareketi degistirilemez cunku **bugunku sayi
ondan turetilir**; buradaki gorusme gunlugu yalnizca **guncellenmiyor**, cunku
bir gorusme olduktan sonra "degismis" olmaz. Turetilen hicbir sayi yok, yani
korunacak bir aritmetik de yok.

#### 1.1 Vergi numarasi tekilligi — SKU deseninin IKINCI uygulamasi

`UNIQUE (tenant_id, lower(tax_number)) WHERE tax_number IS NOT NULL`.

ADR-0039 §1.1'in SKU icin yazdigi sekil **birebir** tekrar eder ve gerekcesi de
aynidir:

- **Nullable**, cunku kucuk bir isletme tedarikcisinin vergi numarasini
  bilmeyebilir; zorunlu olsaydi kullanici `-` yazardi ve alan
  **anlamsizlasirdi**.
- ⚠️ **Kucuk/buyuk harften bagimsiz**, cunku ayni tuzel kisi icin **iki satir**
  acilmasi tam olarak bu projenin reddettigi turden bir hatadir: ekran calisir,
  iki tedarikci yan yana durur ve **gorusme gecmisi ikiye bolunur**. Hata
  sessizdir; AI'in hafizasi da ikiye bolunur — yani modulun **var olus sebebi**
  bozulur.

⚠️ **`name` tekil DEGILDIR** ve bu bilinclidir: iki ayri sube, iki ayri
sozlesme ya da ayni adi tasiyan iki firma mesrudur. Tekillik **kimlik tasiyan**
alanda zorlanir, ad alaninda degil — `crm.companies.name`in de tekil olmamasiyla
ayni karar.

#### 1.2 `payment_terms` SERBEST METINDIR — ADR-0039 §4'un olcutu, ucuncu kez

**Karar: `payment_terms text NULL`, uzunluk siniri 200 karakter. Kodda enum
YOK, tenant sozlugu YOK, yapisal vade alani YOK.**

Olcut ADR-0039 §4'ten aynen aliniyor: _kolon bir **KISIT** tasiyor mu?_

| Emsal                         | Sekil              | Cunku                                                          |
| ----------------------------- | ------------------ | -------------------------------------------------------------- |
| `finance.categories`          | **Tenant sozlugu** | Kategori bir **KISIT tasiyor** — yon bilesik FK ile zorlaniyor |
| `appointments.status`         | **Kodda enum**     | Dort deger her sektorde ayni sey demek                         |
| `inventory.items.unit`        | **Serbest metin**  | Hicbir sey zorlamiyor — ne filtrelenir ne toplanir             |
| **`suppliers.payment_terms`** | **Serbest metin**  | **Hicbir sey zorlamiyor** — yalnizca **okunur**                |

_"60 gun vadeli, 10 gun icinde odemede %2 iskonto"_ bir insan cumlesidir. Onu
yapisal hale getirmek (`net_days integer`, `discount_percent numeric`,
`discount_days integer`) uc kolon, uc dogrulama ve bir hesaplama kurali
gerektirirdi — **tasidigi tek kisit icin: hicbiri.** Hicbir sorgu vadeye gore
filtrelemiyor, hicbir uc onu tarih aritmetigine sokmuyor.

⚠️ **Ve bu, §3.2'nin "odeme vadesi yaklasan tedarikciler" yapisal adayini
dogrudan olduren karardir:** serbest metinden vade **cikarilamaz**. Cikarmaya
calismak (regex ile "60 gun" aramak) tam olarak bu projenin reddettigi sessiz
hata makinesi olurdu — _"60 is gunu"_ ile _"60 gun"_ arasindaki farki bir regex
bilmez ve ekran **makul gorunen yanlis bir tarih** gosterir.

⚠️ **Kabul edilen bedel:** _"60 gun"_, _"60 gun vade"_ ve _"net 60"_ ayni
tenant'ta yan yana yasayabilir. Cozumu bir tablo degil, **arayuzde o tenant'in
daha once yazdigi kosullari oneren bir liste**dir (§8) — ADR-0039 §4'un birim
icin verdigi ayni telafi. Bu bir veri butunlugu sorunu degil, bir yazim
rahatligi sorunudur.

#### 1.3 FK yonleri CRM'den birebir alinir

- `interactions.supplier_id` **NOT NULL** — ADR-0031 §1.1'in gerekcesi aynen
  gecerli: _"gorusme tanimi geregi bir sirketle yapilir."_ Bir tedarikciye
  bagli olmayan gorusme, bu modulun degil Knowledge'in kaydidir.
- `interactions.contact_id` **nullable + `ON DELETE SET NULL`** — CRM'in
  `opportunities.contact_id` ile ayni kural. ⚠️ Gerekce onemli: bir **kisinin**
  silinmesi, **konusulanin kaydini** silmemelidir. `CASCADE` olsaydi ayrilan bir
  satin alma sorumlusunun silinmesi, o tedarikciyle ilgili tum kurumsal hafizayi
  goturur ve hata **sessiz** olurdu.
- `suppliers` silindiginde `contacts` → `interactions` **`CASCADE` ile birlikte
  gider.** Zincir sema icidir, yani veritabani tarafindan garanti edilir —
  ADR-0031 §7'nin **yedinci** uygulamasi ve ayni kanit: vektor bu semada
  oldugu icin silinen bir tedarikci **AI'in hafizasindan da silinir**. ROADMAP
  §8.2'nin KVKK kontrol noktasina da bir girdidir.

⚠️ **Arsivleme (`archived_at`) v1'de YOKTUR** ve bu ADR-0039'dan bilincli bir
sapmadir. Stok'ta arsivleme **zorunluydu** cunku silme, degistirilemez ilan
edilen defteri goturuyordu; burada gotureceegi bir defter yok. Bir tedarikciye
**isaret eden hicbir modul de yok** (§4), yani silme bugun sarkan satir
uretmez. ⚠️ **8. modul (Teklif/Fatura) bir satin alma faturasini bir
tedarikciye bagladigi gun bu karar duser** ve `StockItemHasMovementsError`
deseni burada da uygulanir — bkz. § Bu karar ne zaman yeniden gozden gecirilir.

---

### 2. ⚠️ "UCUZ TEKRAR" NEYI KOPYALAR, NEYI KOPYALAMAZ

ROADMAP'in "ucuz" nitelemesi bir **kod kopyalama** talimati degildir. Ucuzluk,
bu ADR'de **verilmesi gereken karar sayisinin** az olmasidir. Ayrim somuttur:

| Kopyalanan (karar gerektirmeyen)                       | Kopyalanmayan (karar gerektiren)           |
| ------------------------------------------------------ | ------------------------------------------ |
| Sirket/kisi/gorusme uclusu ve FK yonleri (§1)          | ⚠️ **Firsat + pipeline** (§2.1)            |
| RLS + `FORCE` sablonu · oran siniri · exception filter | ⚠️ **`interaction_chunks` tablosu** (§2.2) |
| Kaynak bazli izin modeli (§5) · ODA duzeni (§8)        | ⚠️ **Yapisal katkici** (§3)                |
| Baglam basligi deseni (§6)                             | ⚠️ **Cross-modul referans** (§4)           |

#### 2.1 Firsat ve pipeline YOK — "ters yon" tam olarak bunu soyluyor

**Karar: `suppliers.opportunities` diye bir tablo ACILMAZ. Asama (`stage`),
tahmini deger ve takip tarihi kavramlari bu modulde YOKTUR.**

ROADMAP'in _"ayni sekil, **ters yon** (satin alma)"_ ifadesindeki asil bilgi
buradadir. Bir satis hattinin (pipeline) var olma sebebi, **belirsiz bir
gelirin asamalar boyunca ilerlemesidir**: bir firsat kazanilir ya da
kaybedilir, ve _"hangi asamada kac TL var"_ gercek bir sorudur.

Satin alma tarafinda bu belirsizlik **yoktur**: bir tedarikciyle ya calisirsin
ya calismazsin. Belirsizlik tasiyan sey tedarikcinin kendisi degil,
**siparistir** — ve siparis **kapsam disidir** (§9). Yani pipeline'i buraya
kopyalamak, hicbir sorunun cevabi olmayan bes asamali bir sozluk uretirdi.

⚠️ Bu, ayni zamanda §3'un yapisal katkici kararinin **kokudur**: CRM'in yapisal
katkicisi (`crm-pipeline`) tam olarak bu tablodan besleniyordu. Tablo yoksa
katkici da yoktur.

#### 2.2 Chunk tablosu YOK — CRM'in chunk tablosu bir EMSAL degil, bir MIRAS

**Karar: gorusme metni DOGRUDAN `suppliers.interactions.embedding` kolonuna
gomulur. `suppliers.interaction_chunks` diye bir tablo ACILMAZ.**

Bu, ADR'nin en kolay atlanabilecek noktasidir: CRM'i "ucuza tekrar etmek" onun
`interaction_chunks` tablosunu da tekrar etmek gibi gorunur. **Gorunuse
uyulmuyor**, cunku olcut CRM'den **sonra** yazildi:

| Emsal                     | Karar                 | Olcut                                                     |
| ------------------------- | --------------------- | --------------------------------------------------------- |
| **ADR-0031** (CRM)        | Chunk tablosu **VAR** | ⚠️ **Olcut henuz yoktu** — Knowledge'in deseni kopyalandi |
| **ADR-0035 §3** (Randevu) | Chunk tablosu **YOK** | Metnin ust sinirini **BIZ** belirliyoruz                  |
| **ADR-0037 §3** (Belge)   | Chunk tablosu **VAR** | Metnin ust sinirini **DOSYA** belirliyor                  |
| **ADR-0039 §5** (Stok)    | Chunk tablosu **YOK** | Metnin ust sinirini **BIZ** belirliyoruz                  |
| **Tedarikci**             | **YOK**               | **Metnin ust sinirini BIZ belirliyoruz**                  |

Iki ADR'nin birlikte urettigi kural ADR-0037'de yazildi:
_"chunk tablosu, metnin ust sinirini kullanici degil **verinin kendisi**
belirliyorsa acilir."_

**Tedarikci gorusmesi birinci gruptadir.** Metin bir forma yazilir; ust
sinirini biz koyariz (`TARGET_CHUNK_CHARS` ile ayni buyukluk sinifi) ve
parcalayici bu sinirin altinda **her zaman tek parca** uretirdi. Ikinci tablo
yalnizca bir `JOIN` maliyeti, ikinci bir RLS politikasi, ikinci bir `tenant_id`
denormalizasyonu ve retention listesinde ikinci bir satir olurdu.

⚠️ **Bedeli ADR-0035 §3d ve ADR-0039 §5 ile birebir aynidir ve aynen
ustlenilir: sinir SUNUCUDA zorlanir ve asilirsa 422 doner. SESSIZ KIRPMA
YASAK.** Kirpsaydi kullanici, notunun yarisinin **hic aranmadigini**
ogrenemezdi.

⚠️ **Kabul edilen bedel acikca yazilir:** yapistirilan uzun bir e-posta zinciri
**sigmaz** ve kullanici onu kisaltmak zorunda kalir. Dogru cozum, uzun metni
sessizce parcalamak degil, **dosyayi Belge modulune yuklemektir** (§9) — o
modul tam olarak bunun icin, ve olcutun karsi tarafinda duruyor.

> **Geri alinabilir ve yon tektir:** ileride gercekten uzun gorusme kayitlari
> gorulurse `interaction_chunks` **eklenebilir**. Tersi mumkun degildir.

⚠️ **CRM'in chunk tablosuna DOKUNULMAZ** (Mutlak Kural 1). Bu ADR CRM'i
degistirmiyor, yalnizca onu **kopyalamiyor**.

---

### 3. ⚠️ TEK KATKICI — YALNIZCA ANLAMSAL

**Karar: bu modul `supplier-interactions` adinda TEK bir anlamsal katkici
kaydeder. YAPISAL KATKICI EKLENMEZ.**

| Katkici                 | Kaynak                             | `contributionKind` | Nasil calisir              | Izin                        |
| ----------------------- | ---------------------------------- | ------------------ | -------------------------- | --------------------------- |
| `supplier-interactions` | `suppliers.interactions.embedding` | **`'semantic'`**   | pgvector benzerlik sorgusu | `supplier_interaction:read` |

`contributionKind` **zorunlu bir alandir** (ADR-0036 §5): unutulursa **derleme
hatasidir**, sessiz bir kayip degil.

#### 3.1 ⚠️ BU, ADR-0036'NIN ESIGINE DOKUNMAMA KARARIDIR

ADR-0039 §7.2 bu satiri **dogrudan bu ADR'ye adresleyerek** yazdi:

> _"⚠️ **7. modul (Tedarikci Yonetimi) bir yapisal katkici eklerse esik ASILIR
> ve ADR-0036 yeniden acilmak ZORUNDADIR.** O modulun ADR'si bu satiri okumak
> zorundadir; okunmazsa taban sessizce anlamini yitirir."_

**Satir okundu.** Sayilar:

| Olcu                      | Stok sonrasi (bugun) | **Tedarikci sonrasi**           |
| ------------------------- | -------------------- | ------------------------------- |
| Anlamsal kaynak           | 7                    | **8** (`supplier-interactions`) |
| **Yapisal kaynak**        | **5**                | ⚠️ **5 — DEGISMIYOR**           |
| ADR-0036 esigi            | 6                    | **6 — ASILMIYOR**               |
| Toplam katkici (fan-out)  | 12                   | **13**                          |
| Global top-K              | 8                    | **8 — degismedi**               |
| Yapisal taban `ceil(K/3)` | 3                    | **3 — degismedi**               |
| Serbest yuva              | 5 (7 kaynak icin)    | **5 — ama 8 kaynak arasinda**   |

⚠️ **ADR-0036 YENIDEN ACILMIYOR ve bu bir atlama degil, bir SONUCTUR.** Yapisal
kaynak sayisi **5'te kaldigi** icin ADR-0036'nin kendi tetikleyici kosulu
olusmuyor. Eger asagidaki uc adaydan biri kabul edilseydi karar **tersine
donerdi**: o durumda once ADR-0036 yeniden acilmali, sonra bu modul
yazilmaliydi — cunku ADR-0036'nin kendi gerekcesi bunu yaziyor
(_"duzeltme, altinci kaynagin da tasindigi bir regresyon isine doner"_).

#### 3.2 Uc yapisal aday degerlendirildi — ucu de REDDEDILDI

Karar "yazmadik" degil, **"bakildi ve yoktu"**dur. ADR-0037 §8'in ayni
disiplini:

| Aday                                          | Neyden turetilirdi              | Neden REDDEDILDI                                                                                                                                                                                                                                                                                        |
| --------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"Tedarikci performansi / gecikme riski"**   | Siparis + teslim tarihi         | ⚠️ **Ikisi de v1'de YOK** (§9). Katkicinin **hesaplayacak hicbir seyi olmazdi**; gerceklestirilebilir tek hali _"12 tedarikciniz var"_ gibi bir **sayim** olurdu. ADR-0037 §8'in cumlesi birebir gecerli: _"bir sayim, bir hafiza degil. AI'a hicbir sey ogretmez."_                                    |
| **"Durgun tedarikci"** (N gundur gorusulmedi) | `interactions.occurred_on` MAX  | ⚠️ **Turetilebilir ama HABER DEGIL.** Durgun bir **firsat** kayip gelirdir; durgun bir **tedarikci** normaldir — ihtiyac olunca aranir. Yilda bir kez calisilan bir tedarikci 364 gun "durgun" gorunur ve katkici her soruda **gurultu** uretir. ⚠️ Ustelik bu gurultu bir **taban yuvasi ISGAL EDER**. |
| **"Odeme vadesi yaklasan"**                   | `payment_terms` (serbest metin) | ⚠️ **Cikarilamaz** (§1.2). Serbest metinden vade **tahmin etmek** bir sessiz hata makinesidir; ustelik vade bir **faturaya** baglidir ve fatura 8. modulun isidir. Dogru yapildiginda ayrica bir **hatirlatma** (Queue karari) sorusudur — ADR-0037'nin "suresi dolan sozlesme" adayiyla ayni sekil.    |

⚠️ **Uydurma bir yapisal katkici yazmak, ADR-0036'nin taban kisitindan haksiz
bir yuva calmak olurdu** — taban yapisal kaynaklara **garanti** verdigi icin,
"yapisal" etiketi bir **imtiyazdir** (ADR-0037 §8). Bu modulde imtiyazi hak
eden bir durum yok.

⚠️ **Ve bu ADR'de bedel ilk kez CIFT TARAFLIDIR:** uydurma bir katkici yalnizca
kendi degersiz satirini iceri sokmaz, ayni zamanda **esigi asarak ADR-0036'yi
yeniden acilmak zorunda birakirdi**. Yani bedeli bir satir kod degil, bir
**platform karari**dir.

#### 3.3 ⚠️ Bu bir ERTELEME degil, bugunun DOGRU cevabidir

Bir "tedarikci performansi" katkicisi **istenirse** o gun sirasi sudur ve
**degistirilemez**:

1. Once **siparis ve teslimat** modeli karara baglanir (ayri ADR — §9),
2. sonra **ADR-0036 yeniden acilir** (yapisal kaynak 5 → 6, esik asilir),
3. **ancak ondan sonra** katkici yazilir.

Ters sirada yapilirsa taban **sessizce** anlamini yitirir: alti yapisal
kaynagin ucu her cevapta duyulur, yani **yarisindan azi** — ADR-0036'nin
"genislik" vaadi tam olarak bu noktada okunamaz hale gelir ve **hicbir test
kirmizi yanmaz.**

---

### 4. ⚠️ CROSS-MODUL REFERANS v1'DE YOK — ve bu sefer bir ADAY reddediliyor

**Karar: `suppliers` semasi hicbir baska modulun kaydina isaret etmez ve hicbir
modulun `public.ts`'ine dokunmaz. `inventory.public.ts` BU ISTE YAZILMAZ.**

Bagimlilik grafigi **alti kenarda** kalir ve **hala DAG**tir:

```
katman 0: CRM · INVENTORY · SUPPLIERS (yeni — cikan kenari YOK)
katman 1: Projeler -> CRM
katman 2: Finans -> CRM, Projeler   Randevu -> CRM   Belge -> CRM, Projeler
```

⚠️ **Bu, Stok'un durumundan FARKLIDIR ve fark kaydedilmelidir.** ADR-0039 §9'da
kenar yoktu cunku **hedef sema mevcut degildi** — bir tedarikci tablosu henuz
yazilmamisti ve dogrulanamayan bir isaretciyi kabul etmek ADR-0033 Slice 1'in
ogrettigi hata olurdu. Burada boyle bir mazeret **yok**: `inventory` semasi
canli, ROADMAP §3.6 kenari acikca sayiyor (_"Tedarikci → Stok"_) ve ADR-0039
§9.1 dizini **kimin yazacagini** bile yazmis durumda. Yani bu bir bosluk degil,
**bir hayirdir.**

#### 4.1 `Tedarikci → Stok` neden BUGUN degil

Uc gerekce, en agirdan hafife:

**(a) Baglantinin bir FIILI yok.** _"Bu tedarikci su kalemi saglar"_ bir **olgu
degil bir katalogdur**; bir seyin oldugunu degil, **olabilecegini** soyler.
Olgu ancak bir **siparis** ya da bir **giris hareketi** ile dogar ve ikisi de
bu modulun disinda (§9). Bugun eklenirse tek okuyucusu bir liste ekrani olan
bir tablo acilir — ve o tablonun dogru olup olmadigini **hicbir sey
denetlemez**.

**(b) Sekil, bugune kadarki cross-modul deseninin sekli DEGIL.** Bes modulde de
desen ayniydi: **tek bir nullable `uuid` kolon** + dizinden ad cozumu. Burada
gereken sey bir **N:N ara tablosu** (`supplier_items`) olurdu ve bu, sarkan
isaretci sorununu **catallar**: silinen tek bir kalem, N satirda sarkar. Yeni
bir sekil, yeni bir karardir — tek satirlik bir kolon degil.

**(c) Gercek talep henuz yok.** ROADMAP §3.6 kenari **8. modulun** ihtiyaci
olarak sayiyor (satin alma / fatura). Bugun eklemek, olmayan bir ihtiyaci
tasarlamaktir — ADR-0039 §12'nin coklu depo icin verdigi ayni gerekce.

⚠️ **Ters yon (`Stok → Tedarikci`, yani `items.supplier_id`) de ACILMAZ.**
ADR-0039 §9 onu zaten v2'ye birakmisti ve gerekcesi (_"hedef sema mevcut
degil"_) bugun ortadan kalkti — ama Mutlak Kural 1 geregi **bu is Stok'a
dokunmaz**. O kolonun acilip acilmayacagi **Stok'un karari**dir ve ayri bir
istir.

#### 4.2 ⚠️ O gun geldiginde dizini STOK yazar — ADR-0039 §9.1 zaten karara bagladi

ADR-0037 §4.1'in kurali: _"yeni TALIP → dosya degismez; yeni KAYNAK TURU →
sahibi modul kendi dizinini yazar."_ Kalem **yeni bir kaynak turudur**, yani:

> ⚠️ O gun **`inventory.public.ts` yazilir ve onu YAZAN modul STOK'tur** —
> `StockItemDirectory.findNames(ids, role)`, izin kapisi (`stock_item:read`)
> **arayuzun icinde**. Bu satir ADR-0039 §9.1'de **zaten yazilidir**; burada
> yalnizca **teyit ediliyor**, yeniden karara baglanmiyor.

⚠️ Ayrica **`suppliers.public.ts` de bu iste YAZILMAZ.** Ayni kural ters
yonden: bugun bir tedarikciyi gostermek isteyen **hicbir modul yok**. Ilk talip
geldiginde (muhtemelen 8. modul) dizini **Tedarikci yazar** — talip degil sahip.

---

### 5. Izinler — katalog GENIS, adlar NITELENMIS

ADR-0025'in `resource:action` modeli, **yedinci** kez. `supplier:read` bir
_kaynak_ iznidir; `suppliers:read` bir **modul** izni olurdu ve modeli bozardi
(ADR-0031 §6).

| Permission                    | owner | admin | member | viewer |
| ----------------------------- | :---: | :---: | :----: | :----: |
| `supplier:read`               |  ✅   |  ✅   |   ✅   |   ✅   |
| `supplier:write`              |  ✅   |  ✅   |   ✅   |   ❌   |
| `supplier:delete`             |  ✅   |  ✅   |   ❌   |   ❌   |
| `supplier_contact:read`       |  ✅   |  ✅   |   ✅   |   ✅   |
| `supplier_contact:write`      |  ✅   |  ✅   |   ✅   |   ❌   |
| `supplier_contact:delete`     |  ✅   |  ✅   |   ❌   |   ❌   |
| `supplier_interaction:read`   |  ✅   |  ✅   |   ✅   |   ✅   |
| `supplier_interaction:create` |  ✅   |  ✅   |   ✅   |   ❌   |

⚠️ **`supplier_interaction` neden `create`, `write` degil:** ADR-0031 §6'nin
gerekcesi birebir — gorusmeler **ekleme-yalniz** bir gunluktur; guncelleme ve
silme v1'de yoktur, dolayisiyla **var olmayan bir fiili deklare etmek** yanlis
olurdu (§1'in `updated_at` karariyla ayni satirdan cikiyor).

⚠️ **`supplier_interaction:delete` YOKTUR.** Bir izni acmamak, sonradan
kapatmaktan kolaydir (ADR-0039 §8.2).

> ### ✅ DORDUNCU KATMAN EKLENDI (2026-08-24, migration `0034`)
>
> Ekleme-yalnizligin dayanagi buraya kadar tumuyle UYGULAMA seviyesindeydi
> (`update` metodu yok + izin yok). **`businessos_app`ten `UPDATE, DELETE`
> acikca geri alindi** (savunma derinligi, PO karari; ADR-0039 §3.3 ile ayni
> is). ⚠️ Duz bir `REVOKE UPDATE` `setInteractionEmbedding`i — yani hem
> olusturma sonrasi vektor yazimini hem `POST /suppliers/reindex`i — SESSIZCE
> kirardi; bu yuzden yetki KOLON SEVIYESINDE verildi:
> `GRANT UPDATE (embedding)`. Sonuc talep edilenden **gucludur**: gorusmenin
> ICERIGI (`body`, `occurred_on`, `contact_id`) veritabani seviyesinde
> degistirilemez, degisebilen tek sey TURETILMIS vektordur.
> ⚠️ §1.3'un FK eylemleri (`CASCADE` / `SET NULL`) KIRILMADI — olculdu:
> RI trigger'lari referencing tablonun sahibi olarak kosar.

#### 5.1 ⚠️ Ad `contact` DEGIL `supplier_contact` — ve cakisma bu kez GERCEK

ADR-0039 §8.2 `item` → `stock_item` nitelemesini **ongoruye** dayandirmisti:
_"8. modul line item kavramini getirecek."_ Burada ongoruye gerek yok:

> **`contact:read` ve `interaction:read` CRM tarafindan ZATEN kullaniliyor**
> (ADR-0031 §6).

Nitelemeseydik iki secenekten biri olurdu ve ikisi de kotu:

| Secenek                               | Neden kabul edilemez                                                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CRM ile ayni izni PAYLASMAK**       | ⚠️ **Sessiz bir yetki genislemesi**: bir kullaniciya musteri kisilerini gorme yetkisi verildiginde **tedarikci kisilerini de** gormus olurdu. Iki farkli is gercegi tek bir stringle yonetilemez. |
| **CRM'in iznini yeniden adlandirmak** | ⚠️ **Breaking change** ve Mutlak Kural 1 ihlali — calisan bir modulun izin kataloguna dokunmak.                                                                                                   |

⚠️ Nitelenen sey **izin kaynagidir, modul degil**: sema ve rota `suppliers`
kalir (`/api/v1/suppliers/...`, `data-module="suppliers"`) — ADR-0039'un
`inventory` icin verdigi ayni ayrim.

⚠️ **`supplier` niteliksizdir ve dogrudur:** baska hicbir modulun "tedarikci"si
olmayacaktir. Nitelemek, tasimadigi bir belirsizligi ima ederdi.

#### 5.2 Neden GENIS katalog

ADR-0034 §7'nin olcutu aynen tutuyor: _"musteri listesi ve gorev listesi
PAYLASILAN is gercekleridir, sirketin nakit akisi degildir."_

**Kimden mal aldigi bir sirketin paylasilan operasyonel gercegidir.** Malzeme
siparisi veren, teslimati karsilayan, bir kaleme ihtiyac duyunca kimi
arayacagini bilmesi gereken kisi **tam olarak `member` rolundeki kisidir**. Dar
bir katalog modulu, onu kullanmasi gereken herkese kapatirdi.

⚠️ **Bir istisna kayda geciriliyor: `payment_terms` ticari hassasiyet
tasiyabilir** (_"bize 90 gun veriyor"_). Yine de v1'de **alan bazli gizlilik
YOKTUR** ve gerekce ADR-0031 §6'nin `estimated_value` icin yazdigi ile aynidir:
alan bazli izin **ABAC**tir ve backlog'tadir (ROADMAP §1.1). Kaba hali
(_"tedarikci hattini hic gormesin"_) bugun **tek satirlik** bir degisiklikle
ifade edilebilir, cunku `supplier:read` ayri bir izindir.

⚠️ **Yan etki: bu modul de `POST /ask` izin filtresini TETIKLEMEZ.** Tek
katkicinin kapisi `supplier_interaction:read` ve dort rol de onu tasiyor.
Filtrenin tek gercek tetikcisi **hala Finans**tir (`cashflow:read` /
`commentary:read`) — CRM, Projeler, Randevu, Belge ve Stok'tan sonra
**altinci** kez ayni kayit.

---

### 6. Anlamsal katkici ve baglam basligi

Gomulen metin ciplak `body` degildir; onune **baglam basligi** konur — projede
**altinci** kez ayni karar:

```
[Tedarikci · 2026-08-21 · Yildiz Civata] fiyat listesi guncellendi, M8 vidada %6 zam...
```

Uc parca: **sabit etiket** + **tarih** + **tedarikci adi**. ADR-0035 §6.2'nin
sekliyle birebir.

⚠️ **Baslikta yalnizca BIR ad vardir** (ADR-0033'un kurali): tedarikcinin adi.
Kisinin adi **girmez** — ikinci bir bayatlama yuzeyi acardi ve `contact_id`
zaten `SET NULL` olabilen bir alan (§1.3).

⚠️ **Bayatlama penceresi VARDIR ve ADR-0039'dan farklidir.** Stok'ta ad **ayni
satirda** yasiyordu, yani yeniden adlandirma embedding'i **ayni islemde**
yeniliyordu. Burada ad `suppliers.suppliers`ta, vektor
`suppliers.interactions`ta — yani bir tedarikci yeniden adlandirildiginda **tum
gorusmelerinin vektoru bayatlar**. Bu, CRM/Projeler/Randevu ile **ayni sinif**
bir sinirdir ve telafisi aynidir: **`POST /suppliers/reindex` ILK GUNDEN
vardir.**

`reindex` iki isi birden kapatir (ADR-0039 §6.2'nin ayni cumlesi): **bayat**
vektorleri ve **gomulememis** kayitlari (`WHERE embedding IS NULL`).

⚠️ `embedding IS NULL` bu modulde de **mesru bir durumdur**: iki
transaction'li akisin uretebildigi "gomulememis" hali (§7'nin
`EmbeddingFailedError` yolu). Kayit **acilir**, arama disinda kalir, `reindex`
onarir.

**Oran siniri** `platform.rate_limits` uzerinden, **bir satir deklarasyon**
(ADR-0031 §4.2). ⚠️ Sayac **embedding** sayar, kayit degil — yani tedarikci
olusturmak ve kisi eklemek **hicbir sey harcamaz** (ADR-0039'un kapanis
denetiminde olculen davranisin aynisi).

---

### 7. Exception filter — DORT AI/domain hata tipi, hepsi ILK GUNDEN

**Karar: `SuppliersDomainExceptionFilter`in `@Catch(...)` listesi BASTAN
yazilir.**

CLAUDE.md'nin kalici kurali (_"AI hata tipleri her modulde bastan"_) dogrudan
uygulanir; **modul modul yeniden tartisilmaz**.

| Hata                      | HTTP | `DisclosableProblem` | Ne zaman                                                                  |
| ------------------------- | ---- | -------------------- | ------------------------------------------------------------------------- |
| `EmbeddingFailedError`    | 502  | ✅ **EVET**          | Gorusme yazilirken saglayici coker — kayit **acilir**, metin gomulmez     |
| `CompletionFailedError`   | 502  | ✅ **EVET**          | ⚠️ **Bugun tetiklenemez** — modul ici AI yuzeyi yok. **Yine de yazilir.** |
| `RateLimitExceededError`  | 429  | ❌ (4xx zaten gecer) | `Retry-After` ile                                                         |
| `DuplicateTaxNumberError` | 409  | ❌                   | Ayni vergi numarasi (kucuk/buyuk harften bagimsiz — §1.1)                 |
| `SupplierNotFoundError`   | 404  | ❌                   | —                                                                         |

⚠️ **`StorageFailedError` YOKTUR** — ADR-0039 §10.2'nin kurali: _"AI hata
tipleri her modulde bastan yazilir; alan bazli hata tipleri (depolama gibi)
yalnizca o alani kullanan modulde yazilir."_ Bu modul `StoragePort`u
kullanmiyor ve kullanmayacak; satiri koymak olu kod degil **yaniltici** olurdu.
Dosya isi Belge modulunun isidir (§9).

⚠️ **`StockItemHasMovementsError` benzeri bir "kullanimda" hatasi da YOKTUR** —
bugun bir tedarikciye isaret eden hicbir kayit yok (§4). ⚠️ 8. modul bunu
degistirdigi gun eklenir; **bugun eklemek**, var olmayan bir iliskiyi ima
ederdi.

⚠️ Eslenmemis domain kodunun 500'u **maskeli kalir** ve bunu **bir test
kilitler** — o test olmasaydi, maskenin tumuyle kalktigi bir regresyonda diger
testler de yesil yanardi (ADR-0035'in bes modulluk dersinin **yedinci**
uygulamasi).

---

### 8. Frontend: ODA — ilk gunden

⚠️ **ADR-0038'in ODA sisteminde sifirdan dogan IKINCI moduldur** (ilki Stok).
Donusturulecek bir sey yok.

#### 8.1 Renk: iki satir, kalibrasyon GEREKMIYOR

`module-colors.css` bu modulun paletini **zaten olculmus** olarak tasiyor:

```
[data-module='suppliers']  acik #5c6cab (ink #4c5b98) · koyu #92a5e8 (ink #a3b6fa)
```

⚠️ Dosyanin **kendi secim kurali** bu rengi acikliyor:
_"**AKRABA MODULLER KOMSU HUE ALIR.** Tedarikci, CRM'in yaninda (ROADMAP §3.5:
'CRM deseninin ucuz tekrari')."_ Yani renk, ROADMAP'in konumlandirmasini
**gorsel olarak soyluyor**: CRM'in cividi (#3173af) ile komsu bir mor-mavi.
Renk secilmez, **zaten secilmistir**.

Yapilacak is **iki satirdir**: layout'ta `data-module="suppliers"` + koridorda
(`sidebar`) satirin `LIVE` olmasi. ⚠️ `data-module` unutulursa hata
**SESSIZDIR**: ekran calisir, terracotta kalir, lint yakalamaz.

⚠️ **Renk tek ayirt edici olmamalidir** (renk korlugu): CRM ile Tedarikci
**komsu hue** aldigi icin bu kural burada **ozellikle** gecerlidir. Aktif kapi
ayrica kalin yazi ve `aria-current="page"` tasir.

#### 8.2 Iki rota + detay, TEK duvar — ADR-0038 §6.5

| Rota                          | Duvar (**ORTAK**)                              | Tezgah                                       |
| ----------------------------- | ---------------------------------------------- | -------------------------------------------- |
| `/app/suppliers`              | Tedarikci sayisi + uydular + asistanin cumlesi | **Tedarikci listesi**                        |
| `/app/suppliers/interactions` | ⚠️ **AYNI DUVAR**                              | **Gorusme akisi** — tarih · tedarikci · ozet |
| `/app/suppliers/<id>`         | ⚠️ **YOK** (detay sayfasinin duvari olmaz)     | Tedarikci + kisiler + gorusme gecmisi        |

⚠️ **Duvar kopyalanmaz, paylasilan bir bilesendir** (`suppliers-wall.tsx`) —
ADR-0038 §6.5'in `finance-wall.tsx` / `inventory-wall.tsx` icin yazdigi kural.
Iki rota **ayni soruyu** cevapliyor (_"tedarikci iliskilerimiz ne durumda"_).

**Kahraman rakam: toplam tedarikci sayisi.** Uydular: son 30 gunde gorusulen
tedarikci sayisi · kayitli kisi sayisi · hic gorusme kaydi olmayan tedarikci
sayisi.

⚠️ **"Durgun tedarikci" bir UYDU DEGILDIR** — §3.2'nin reddettigi ayni
gerekceyle: durgunluk bu modulde **haber degildir** ve onu duvara koymak,
yapisal katkicinin reddedilme gerekcesiyle **celisirdi**.

⚠️ **Yeni kutuphane YOK** (ADR-0035 §7 / ADR-0039 §11.3).

---

### 9. Kapsam disi (bugun yapilmiyor)

**Tedarikci siniri** — bunlar "sonra ekleriz" degil, **v1'in tanimi disidir**:

- **Satin alma siparisi (PO)** — ⚠️ **en cok istenecek olan.** Bir siparis bir
  **durum makinesi** (taslak → gonderildi → kismi teslim → kapandi), bir
  **satir kalemi** kavrami ve Stok'a bir **kenar** getirir. Ucu de ayri
  kararlardir; ustelik "satir kalemi" tam olarak ADR-0039 §8.2'nin `item`
  adini niteleme gerekcesidir. **Ayri ADR.**
- **Tedarikci degerlendirme / puanlama** — ⚠️ bir puan **veriden turetilmezse
  bir fikirdir**; turetilecek veri (teslim tarihi, gecikme, iade) siparis
  olmadan **yoktur**. Once siparis, sonra puan.
- **Stok'a otomatik baglanti** (§4) · **fiyat listesi / birim maliyet** —
  ⚠️ ikincisi ADR-0039 §12'nin _"maliyet ve stok degerlemesi"_ kalemiyle **ayni
  tehlikeyi** tasir: bir maliyet rakami **muhasebe rakamidir** ve burada
  uretilirse Finans'in disinda **ikinci bir mali gerceklik** dogar.
- **Otomatik siparis verme** — Queue karari (ROADMAP §2.3) verilmeden
  yapilamaz; ADR-0039 §12'nin ayni kalemi.
- **Sozlesme ve belge saklama** — ⚠️ **Belge modulunun isidir** (ADR-0037) ve
  orasi zaten `contactId`/`projectId` bagliyor. Burada ikinci bir dosya yuzeyi
  acmak, ADR-0037'nin **tek arsiv** kararini bolerdi.
- **Cok para birimli fiyatlandirma** — ADR-0034'un kur cevrimi siniri; burada
  toplanacak bir rakam bile yok.
- **Tedarikci portali / dis erisim** — ⚠️ tenant disi kimlik demektir; Faz 5'in
  **tamamen** disinda.
- **Degisiklik denetim izi** — `platform/audit` borcu, tetikleyici degismedi
  (8. modul). ⚠️ Burada borc **tam olarak gecerlidir**: bir tedarikcinin odeme
  kosullarini kimin degistirdigi **sorulamaz** — ve bu, ADR-0039'un aksine
  kendiliginden kapanmaz (degistirilemez bir defter yok).

---

## Gerekce

**Neden bu modul ROADMAP §3.5'te 7. sirada dogru duruyor.** ROADMAP'in kendi
cumlesi: _"CRM deseni oturmadan one alinirsa ucuzlugu kaybolur."_ Desen alti
modulde oturdu, ve bu ADR'nin **kisaligi** onun olcusudur: sema sekli, RLS,
izin modeli, oran siniri, katkici deseni, exception filter, ODA duzeni ve renk
— **sekizi de hazir geliyor**.

**Neden "ucuz" kod kopyalamak degil (§2).** Bir modulun ucuz olmasi, ondan
**once alinmis kararlarin** onu tasimasi demektir. CRM'in chunk tablosunu
kopyalamak "ucuz" gorunurdu ama olcut (ADR-0035 §3 + ADR-0037 §3) CRM'den
**sonra** yazildi; eski bir kodu emsal saymak, olcutu **ilk sinandigi yerde**
terk etmek olurdu.

**Neden yapisal katkici yok (§3) — bu ADR'nin merkezi karari.** ADR-0039 §7.2
bu ADR'ye acik bir soru birakti ve cevabin sekli onemli: **"eklemedik" degil,
"bakildi ve yoktu"**. Uc aday da ya var olmayan bir veriden turetilecekti, ya
haber olmayan bir seyi haber sayacakti, ya da serbest metinden **tahmin**
uretecekti. Ucu de ADR-0036'nin taban imtiyazindan bir yuva calardi — ve
bugunku bedel bir satir kod degil, **bir platform kararinin yeniden acilmasi**
olurdu.

**Neden cross-modul kenari yok (§4).** Bu modul, desenin olgunlugunun
**ikinci** kaniti: Stok'ta kenar yoktu cunku hedef yoktu; burada hedef **var**
ve kenar yine eklenmiyor. _"Gerekmediginde eklememek"_ ile _"eklenemediginde
eklememek"_ arasindaki fark, bir desenin gercekten karar uretip uretmediginin
olcusudur.

---

## Sonuclari

**Olumlu**

- ADR-0036'nin esigi **asilmiyor**; taban kisiti anlamini koruyor ve bir
  platform karari **yeniden acilmak zorunda kalmiyor**.
- Bagimlilik grafigine **hicbir kenar eklenmiyor**; grafik alti kenarda kaliyor
  ve **DAG** kaliyor.
- Silinen bir tedarikci **AI'in hafizasindan da siliniyor** (§1.3 cascade) —
  ADR-0031 §7'nin yedinci uygulamasi, KVKK "silme hakki" icin veritabani
  seviyesinde kanit.
- Izin cakismasi **ilk gunden** cozulmus oluyor; CRM'in katalogunda **tek satir
  degismiyor**.
- Bir tablo (chunk) ve bir katkici (yapisal) **acilmadigi** icin retention
  listesi ve fan-out beklenenden **az** buyuyor.
- Renk, RLS sablonu, izin modeli, oran siniri, katkici deseni, exception filter
  deseni, ODA duzeni: **hepsi hazir geliyor.**

**Olumsuz / bedeli**

- ⚠️ **Fan-out N=13'e cikiyor** ve **sekiz anlamsal kaynak bes serbest yuva
  icin yarisiyor.** ADR-0039 §7.2 iki anlamsal kaynagin sifir alabilecegini
  yazili beklenti saymisti; bu modulden sonra **uc** kaynak icin gecerli
  olabilir. Kusur degil **liyakattir** (ADR-0036 § Bilinen sinirlar) — ama
  olcum § Kapanis denetimi'nde **zorunludur**.
- ⚠️ **Uzun bir gorusme metni SIGMAZ** (§2.2) — 422 doner, sessiz kirpma yok.
  Kullanici metni kisaltmak ya da dosyayi Belge modulune yuklemek zorunda.
- ⚠️ **Tedarikci yeniden adlandirildiginda tum gorusme vektorleri bayatlar**
  (§6) — Stok'ta olmayan bir sinir, CRM/Projeler/Randevu ile ayni sinif.
  Telafi `reindex`.
- ⚠️ **Odeme kosullari sorgulanamaz** (§1.2): _"vadesi 60 gunden uzun olan
  tedarikciler"_ sorusu v1'de **sorulamaz**; metin yalnizca anlamsal aramaya
  girer.
- ⚠️ **Odeme kosullarini kimin degistirdigi sorulamaz** — `platform/audit`
  borcu burada **kendiliginden kapanmiyor**.
- **Bir migration prod'a gider** (`0030`).

---

## Degerlendirilen alternatifler

| Alternatif                                                          | Neden secilmedi                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Yapisal katkici eklemek** ("tedarikci performansi")               | ⚠️ Turetecek **veri yok** (siparis/teslimat kapsam disi); gerceklestirilebilir tek hali bir **sayim** olurdu. Ustelik ADR-0036'nin esigini (6) **asar** ve o karari yeniden acilmak zorunda birakirdi. Bedel bir satir kod degil, bir **platform karari**dir (§3.2). |
| **Yapisal katkici eklemek** ("durgun tedarikci")                    | Turetilebilir **ama haber degil**: durgun bir tedarikci normaldir (ihtiyac olunca aranir). Her soruda gurultu uretir ve **bir taban yuvasi isgal eder** (§3.2).                                                                                                      |
| **Yapisal katkici eklemek** ("odeme vadesi yaklasan")               | `payment_terms` **serbest metindir** (§1.2); vadeyi regex ile cikarmak **sessiz hata makinesidir**. Ayrica vade bir **faturaya** baglidir (8. modul) ve dogru yapildiginda bir **hatirlatma** (Queue karari) sorusudur.                                              |
| **CRM'i genisletmek** (`companies.type = 'customer' \| 'supplier'`) | ⚠️ **Mutlak Kural 1 ve 5 ihlali.** Calisan bir modulun semasini degistirirdi; izin modeli tek kaynakta birlesir ve "musteriyi gorebilen tedarikciyi de gorur" **sessiz yetki genislemesi** dogar. Ayrica ADR-0031 §1.1'in polimorfizm reddiyle ayni sinif.           |
| **`interaction_chunks` tablosu** (CRM gibi)                         | Metnin ust sinirini **BIZ** koyuyoruz; parcalayici her zaman tek parca uretirdi. CRM'in tablosu bir **emsal degil**, olcut yazilmadan onceki bir **miras**tir (§2.2).                                                                                                |
| **Firsat/pipeline tablosu** (CRM gibi)                              | Belirsizlik tedarikcide degil **siparistedir** ve siparis kapsam disidir. Hicbir sorunun cevabi olmayan bes asamali bir sozluk uretirdi (§2.1).                                                                                                                      |
| **`payment_terms`i yapisal alanlara bolmek**                        | Uc kolon + uc dogrulama + bir hesaplama kurali, **sifir kisit** icin odenirdi. ADR-0039'un birim icin verdigi ayni gerekce (§1.2).                                                                                                                                   |
| **v1'de `supplier_items` (N:N) baglantisi**                         | Baglantinin bir **fiili yok** (katalog, olgu degil); sekil bugune kadarki cross-modul deseninin **sekli degil** (tek kolon degil ara tablo) ve sarkan isaretciyi **catallar**. Gercek talep 8. modulden gelecek (§4.1).                                              |
| **v1'de `archived_at`**                                             | Silme bugun **hicbir seyi goturmez** (isaret eden modul yok) ve degistirilemez bir defter de yok. ADR-0039'da arsivleme **zorunluydu**, burada degil (§1). 8. modul bunu degistirir.                                                                                 |
| **Tek `supplier:*` izni** (kisiler ve gorusmeler dahil)             | `crm:read`in reddiyle ayni gerekce (ADR-0031 §6): bu bir **modul izni** olurdu. Ayrica _"gorusme kaydi ekleyebilir"_ ile _"tedarikciyi silebilir"_ farkli yetkilerdir ve bedeli tek bir string.                                                                      |
| **Dar izin katalogu** (Finans gibi)                                 | Kimden mal alindigi **paylasilan bir operasyonel gercektir**; siparis veren kisi tam olarak `member`dir. Dar katalog modulu, onu kullanmasi gereken herkese kapatirdi (§5.2).                                                                                        |
| **Nitelenmemis `contact` / `interaction` izinleri**                 | ⚠️ **CRM'de ZATEN ALINMIS.** Paylasmak sessiz bir yetki genislemesi, yeniden adlandirmak **breaking change** olurdu (§5.1).                                                                                                                                          |

---

## Bilinen sinirlar

- ⚠️ **Yapisal katkici YOK** (§3) — bu modul `POST /ask` havuzunda **yalnizca
  anlamsal** yarisir ve ADR-0036'nin taban garantisinden **yararlanmaz**. Bu bir
  kusur degil, §3.2'nin dogrudan sonucudur.
- ⚠️ **Sekiz anlamsal kaynak bes serbest yuva icin yarisiyor** — uc kaynagin
  sifir almasi **beklenen** sonuctur (ADR-0036 § Bilinen sinirlar: anlamsal
  kaynaklar arasinda taban yoktur, eleme **liyakattir**).
- ⚠️ **Odeme kosullari sorgulanamaz** (§1.2) — serbest metin; yalnizca anlamsal
  aramaya girer.
- ⚠️ **Tedarikci ↔ kalem baglantisi YOK** (§4) — _"bu vidayi kimden aliyoruz"_
  sorusu v1'de **yapisal olarak** sorulamaz; yalnizca bir gorusme notunda
  yaziyorsa anlamsal aramayla bulunur.
- ⚠️ **Siparis, teslimat, gecikme ve puan YOK** (§9) — yani _"hangi tedarikci
  gecikiyor"_ sorusu **sorulamaz**. Bu, en cok istenecek eksiktir.
- ⚠️ **Yeniden adlandirma vektorleri bayatlatir** (§6) — telafi `reindex`, ilk
  gunden var.
- ⚠️ **Uzun gorusme metni 422 doner** (§2.2) — sessiz kirpma yok, bedel
  kullanicidadir.
- ⚠️ **Odeme kosullarinin kim tarafindan degistirildigi sorulamaz** —
  `platform/audit` borcu (8. modul); ADR-0039'un aksine **kendiliginden
  kapanmaz**.
- ⚠️ **`supplier:read` tasiyan herkes TUM tedarikcileri ve odeme kosullarini
  gorur** (§5.2) — alan bazli gizlilik ABAC'tir, backlog'ta.
- **Iyimser es zamanlilik yok** — son yazan kazanir; **yedinci** kez ayni sinir.
- **`embedding`de model/surum bilgisi yok** · **arama yalnizca anlamsal**
  (ADR-0011, **sekizinci** kez).
- ⚠️ **Retention ONYEDIDEN ONSEKIZE cikar** — YALNIZCA
  `suppliers.interactions`. Vektor tasiyan tablo sayisi **yediden SEKIZE**
  cikar (`interactions.embedding` satir icinde — `appointments.appointments` ve
  `inventory.items` ile ayni sinif).
  > ⚠️ **BU SAYI KAPANIS DENETIMINDE DUZELTILDI.** ADR ilk yazildiginda
  > "ONYEDIDEN YIRMIYE" diyordu ve UC tabloyu birden sayiyordu. Denetim
  > ROADMAP §8.5'in KENDI OLCUTUNU okudu — _"borcu doguran sey satirin ZAMANLA
  > COGALMASIDIR"_ — ve listede `crm.companies` ile `crm.contacts`in
  > BULUNMADIGINI gordu. `suppliers.suppliers` ve `suppliers.contacts` onlarla
  > ayni siniftir: isletmenin tedarikci sayisiyla sinirlidir, zamanla
  > cogalmaz ve vektor tasimaz. Listeye girmeleri, borcu OLDUGUNDAN BUYUK
  > gosterirdi.
  > ⚠️ **ADR-0039'un `movements` uyarisi burada GECERLI DEGILDIR**: bu tablonun
  > eski satirlarini silmek **gecmisi** kaybettirir, **bugunku hicbir sayiyi**
  > degistirmez. Iki sekil karistirilmamalidir.

---

## Uygulama plani (slice'lar)

> **Surec (5. modulden itibaren gecerli):** ADR / Backend (**tek slice**) /
> [cross-modul dokunusu **yalnizca gerekiyorsa** izole slice] / Frontend +
> kapanis denetimi.

| Slice | Ne                                                                                                                                                                                                   | Migration               |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **0** | ✅ **Bu ADR** — karar, kapsam, sinirlar                                                                                                                                                              | —                       |
| **1** | ✅ **Backend (TEK slice):** `suppliers` semasi + uc tablo + tedarikci/kisi CRUD + gorusme (ekleme-yalniz) + embedding + `reindex` + oran siniri + izin katalogu + exception filter + **TEK katkici** | `0030_suppliers_schema` |
| **2** | ✅ **Frontend + HAFIF kapanis denetimi:** iki rota + detay (ODA, ortak duvar), `suppliers` rengi, koridorda `LIVE` + § Kapanis denetimi listesi                                                      | —                       |

**Cross-modul slice'i YOK ve bu bir atlama degil** — §4'un dogrudan sonucu:
degistirilecek bir `public.ts` **yoktur**, cunku hicbir kenar eklenmiyor.

**Backend neden TEK slice.** ADR-0037 backend'i ikiye bolmustu ve gerekcesi
**iki ayri risk sinifiydi** (nesne deposu tutarliligi + AI hatti); ikisi de
burada yok. ADR-0039'da bolunmeyi engelleyen sey turetilmis miktar + sayim
yarisiydi; burada **o bile yok** — modulde turetilen tek bir sayi bulunmuyor.
Bu, Faz 5'in **en dusuk riskli** backend slice'idir.

> ⚠️ **BIR MIGRATION PROD'A GIDER.** `feature/tenant-multi-tenancy-core`'a
> yapilan her push Railway'de `db:preflight && db:migrate` calistirir
> (CLAUDE.md). **Slice 1'in push'undan once ayrica haber verilir.**

> ⚠️ **YENI MIGRATION EKLEME KONTROL LISTESI (CLAUDE.md — zorunlu, uc adim):**
>
> 1. `0030_suppliers_schema.sql` **ve** `.down.sql` yazilir.
> 2. ⚠️ **`drizzle/meta/_journal.json`'a giris eklenir** (`idx: 30`, `when`
>    artan, `tag` dosya adiyla birebir) — atlanirsa `pnpm db:migrate`
>    _"applied successfully"_ yazar, cikis kodu 0 verir ve **hicbir sey
>    uygulamaz**. ADR-0037'de gercekten yasandi.
> 3. ⚠️ **`database.integration.spec`'in geri alma listesine eklenir** — en
>    yeniden eskiye (`0030` → `0029`).
>
> **Kanit adimi:** uc tablonun **varligini** iddia eden bir entegrasyon testi
> (`suppliers-schema.integration.spec`) — sayi saymak yetmez, sayac da
> journal'a baglidir ve **ayni yalani soyler**.

---

## Kapanis denetimi (Slice 2) — **HAFIF seviye**

> **Surec kurali (Product Owner, 2026-08-10):** kapanis denetimleri **iki
> seviyelidir**. Her modul sonunda **HAFIF**, **AGIR** yalnizca birkac modulde
> bir.

- [ ] `git status` temiz · `pnpm verify` **cikis kodu 0**
- [ ] **Uclarin gercek istek turu** — 401/201/200/403/404/409/422/429
- [ ] **Rol turu** (uc gercek kullanici): viewer okur **yazamaz**, member yazar
      **silemez**
- [ ] ⚠️ **§5.1 sinavi**: CRM'in `contact:*` / `interaction:*` izinleri **tek
      satir degismedi**; `supplier_contact` tasimayan bir kullanici tedarikci
      kisilerini **goremiyor** ama CRM kisilerini **gorebiliyor**
- [ ] ⚠️ **§2.2 sinavi**: sinir ustu gorusme metni **422**, ve **hicbir kayit
      kirpilmadi**
- [ ] ⚠️ **§6 sinavi**: tedarikci yeniden adlandirilir → `reindex` → vektor
      **degisti** (ADR-0035'in md5 olcumu)
- [ ] ⚠️ **§7 sinavi**: `@Catch` **bes** tip, `StorageFailedError` **yok**,
      eslenmemis domain kodu **maskeli**
- [ ] ⚠️ **ADR-0036 ZORUNLU OLCUM**: **on uc** katkici dolu, uc farkli soru.
      Beklenti: **yapisal ses sayisi yine 3** (`ceil(8/3)`) ve
      **`supplier-interactions` anlamsal olarak liyakatle yarisiyor**
- [ ] **Fan-out N=13 olcumu** — ADR-0039'un N=12 olcumuyle (136 ms, %2) ayni
      bantta mi
- [ ] **Renk turu** acik **ve** koyu temada, gercek tarayicida — ⚠️ CRM ile
      **komsu hue** oldugu icin ikisi yan yana ayirt edilebiliyor mu
- [ ] ⚠️ **ODA sinavi**: duvar **gercekten ortak** (kopyalanmis degil), detay
      sayfasinin duvari **yok**
- [ ] Bilinen sinirlar ADR + CLAUDE.md + ROADMAP §8.5'e islendi

**Bilincli yapilmayanlar** (hafif denetim kurali, kayda gecer): sifirdan kurulum
❌ · iki tenant'la tam RLS izolasyon turu ❌ (entegrasyon testi kapsiyor).
⚠️ **Prod dogrulamasi ZORUNLUDUR** — Slice 1 bir migration tasiyor (ADR-0035'in
`82c8ad3` deseni: health 200 + migration sayisi **iki bagimsiz kanitla**).

---

## Bu karar ne zaman yeniden gozden gecirilir?

- ⚠️ **Satin alma siparisi (PO) istendiginde** — §9'un en buyuk kalemi. O gun
  sirasiyla: (1) siparis/teslimat ayri ADR, (2) **ADR-0036 yeniden acilir**
  (yapisal kaynak 5 → 6, esik asilir), (3) yapisal katkici yazilir. **Sira
  degistirilemez** (§3.3).
- ⚠️ **8. modul (Teklif/Fatura) bir tedarikciye isaret ettiginde** — §1'in
  "arsivleme yok" karari **duser**: silme sarkan satir uretmeye baslar ve
  `StockItemHasMovementsError` deseni burada da uygulanir.
- ⚠️ **`Tedarikci → Stok` kenari gerektiginde** — dizini **STOK yazar**
  (ADR-0039 §9.1, §4.2). Sekil bir N:N ara tablosudur ve bugune kadarki
  cross-modul deseninden **farklidir**; ayri bir karar ister.
- **Bir tenant odeme kosullarini rol bazinda gizlemek isterse** — §5.2'nin
  "genis katalog dogru sekildir" iddiasi duser ve alan bazli izin (ABAC) borcu
  (ROADMAP §1.1) bu modul icin de tetiklenir.
- **Gercekten uzun gorusme kayitlari gorulurse** — §2.2'nin chunk reddi yeniden
  sorulur; yon tektir (`interaction_chunks` **eklenebilir**, tersi degil).
- **Tedarikci portali / dis erisim gundeme gelirse** — tenant disi kimlik
  demektir ve Faz 5'in tamamen disindadir; ayri bir mimari karar.

---

## Kapanis denetimi (Slice 2) — **HAFIF seviye** · YAPILDI 2026-08-22

> **Surec kurali (Product Owner, 2026-08-10):** kapanis denetimleri **iki
> seviyelidir**. Her modul sonunda **HAFIF**, **AGIR** yalnizca birkac modulde
> bir. Tedarikci **HAFIF** ile kapandi.

**Sekiz maddenin sekizi de kosuldu.**

- [x] `git status` temiz · `pnpm verify` **cikis kodu 0**
- [x] **Uclarin gercek istek turu** — 401/201/200/403/409/422
- [x] **Renk turu** acik **ve** koyu temada, gercek tarayicida
- [x] ⚠️ **§5.1 sinavi**: CRM katalogu **tek satir degismedi**
- [x] ⚠️ **Rota golgelemesi sinavi**: sabit yollar `:id` tarafindan golgelenmiyor
- [x] ⚠️ **ADR-0036 gozlemi**: sekiz anlamsal kaynak bes serbest yuva icin
      yarisiyor (taban olcumu bu modulde ZORUNLU DEGIL — yapisal katkici yok)
- [x] **Fan-out N=13 olcumu**
- [x] Bilinen sinirlar ADR + CLAUDE.md + ROADMAP §8.5'e islendi

### ⚠️ Denetim BIR BELGE HATASI buldu ve duzeltildi

**ADR'nin retention sayisi YANLISTI: "ONYEDIDEN YIRMIYE" diyordu, dogrusu
ONSEKIZ.**

ADR uc tabloyu birden sayiyordu. Denetim ROADMAP §8.5'in KENDI OLCUTUNU okudu —
_"borcu doguran sey satirin ZAMANLA COGALMASIDIR"_ — ve listede `crm.companies`
ile `crm.contacts`in **bulunmadigini** gordu. `suppliers.suppliers` ve
`suppliers.contacts` onlarla ayni siniftir: isletmenin tedarikci sayisiyla
sinirlidir, zamanla cogalmaz ve vektor tasimaz.

⚠️ Bu bir kod kusuru degil, **borcu OLDUGUNDAN BUYUK gosteren bir belge
hatasiydi** — ve tam olarak bu yuzden onemli: retention karari verilirken o
liste tek dayanaktir.

### Uclarin turu — gercek isteklerle

| Kontrol                                      | Sonuc                                        |
| -------------------------------------------- | -------------------------------------------- |
| Kimliksiz `GET /suppliers` · `/interactions` | **401** · **401**                            |
| Tedarikci olustur (owner)                    | **201**                                      |
| ⚠️ Ayni vergi no KUCUK HARFLE                | **409** — mesaj harf duyarsizligini SOYLUYOR |
| Kisi ekle · gorusme yaz                      | **201** · **201**                            |
| Takvimde olmayan gun (`2026-02-31`)          | **422** — ham 500 DEGIL                      |
| 1251 karakterlik gorusme metni               | **422** — sessiz kirpma yok                  |
| Govdede `stage` alani                        | **422** — `.strict()`                        |
| `GET /suppliers/not-a-uuid`                  | **422**                                      |

**Rol turu** (uc gercek kullanici, uc gercek rol):

| Rol        | `GET /suppliers` | `POST /suppliers` | `POST /interactions` | `DELETE /suppliers/:id` |
| ---------- | :--------------: | :---------------: | :------------------: | :---------------------: |
| owner      |       200        |        201        |         201          |           200           |
| **member** |       200        |        201        |         201          |         **403**         |
| **viewer** |       200        |      **403**      |       **403**        |         **403**         |

⚠️ Dort rolun dordu de OKUR — katalog GENIS (§5.2) ve bu, Finans'in dar
katalogunun bilincli karsitidir.

### ⚠️ ROTA GOLGELEMESI SINAVI — bu modulun EN SESSIZ riski

Golgelenseydi `contacts` bir UUID sanilir ve **422** donerdi: ekran calisir,
hicbir test kirmizi yanmaz.

| Istek                                 | Sonuc                               |
| ------------------------------------- | ----------------------------------- |
| `GET /suppliers/contacts?supplierId=` | **200** (1 kisi)                    |
| `GET /suppliers/interactions`         | **200** (total: 1)                  |
| `POST /suppliers/reindex`             | **200** `{"repaired":0,"failed":0}` |
| `GET /suppliers/<UUID>`               | **200** — sabit yollar onu KIRMADI  |
| `GET /suppliers/not-a-uuid`           | **422** — ayirt edici               |

### ⚠️ §5.1 SINAVI — CRM KATALOGUNA DOKUNULMADI

AYNI token iki modulu birden gezdi ve iki uc FARKLI izinlerden gecti:

| Uc                        | Izin                    | Sonuc   |
| ------------------------- | ----------------------- | ------- |
| `GET /crm/contacts`       | `contact:read`          | **200** |
| `GET /suppliers/contacts` | `supplier_contact:read` | **200** |
| `GET /crm/companies`      | `company:read`          | **200** |

Kod tarafi kanit: CRM `contact:{read,write,delete}`, Tedarikci
`supplier_contact:{read,write,delete}` — **ayri kataloglar**.
`git diff HEAD -- crm.permissions.ts` **BOS**.

### ⚠️ ADR-0036 GOZLEMI — ON UC KATKICI, UC ANLAMSAL KAYNAK SIFIR ALDI

⚠️ **Taban olcumu bu modulde ZORUNLU DEGILDI** (yapisal katkici eklenmedi), ama
sekiz anlamsal kaynagin bes serbest yuva icin nasil yaristigi ADR'nin yazili
sinirdir ve gozlendi.

On uc katkicinin **hepsi beslendi**. Uc farkli soruda dagilim **AYNI** cikti:

| Kaynak                      | Tur         | Satir |
| --------------------------- | ----------- | :---: |
| `knowledge`                 | anlamsal    |   1   |
| `crm-interactions`          | anlamsal    |   1   |
| `appointment-notes`         | anlamsal    |   1   |
| `inventory-notes`           | anlamsal    |   1   |
| **`supplier-interactions`** | anlamsal    | **1** |
| `crm-pipeline`              | **YAPISAL** |   1   |
| `finance-cashflow`          | **YAPISAL** |   1   |
| `inventory-stock`           | **YAPISAL** |   1   |
| **TOPLAM**                  |             | **8** |

`degradedSources: []` — disarida kalanlar **bozulmadi, ELENDI**.

✅ **TABAN CALISIYOR:** uc soruda da tam **UC AYRI YAPISAL SES** = `ceil(8/3)`.
✅ **YENI MODUL ICERIDE:** `supplier-interactions` uc soruda da girdi.

⚠️ **UC ANLAMSAL KAYNAK SIFIR ALDI** (`project-notes`, `finance-commentaries`,
`documents`) — ve bu, ADR-0039 §7.2'nin **YAZILI BEKLENTISIDIR**: anlamsal
kaynaklar arasinda TABAN YOKTUR, eleme LIYAKATTIR. Bir kusur degildir.

⚠️ Yapisal tarafta da iki kaynak disarida kaldi (`project-status`,
`appointment-schedule`) — ADR-0036'nin "besincilik garantisi yok" siniri.

### Fan-out N=13 olcumu — gercek saglayicilarla

| Olcum |  Toplam |  embed | complete | **FAN-OUT + diger** | Pay |
| :---: | ------: | -----: | -------: | ------------------: | --: |
|   1   | 5004 ms | 242 ms |  4657 ms |          **105 ms** |  %2 |
|   2   | 5070 ms | 278 ms |  4712 ms |           **80 ms** |  %2 |
|   3   | 6229 ms | 242 ms |  5928 ms |           **59 ms** |  %1 |

**Ortalama toplam 5434 ms · ortalama fan-out 81 ms (%1-2) · darbogaz
`LLMPort.complete` ~5099 ms — DEGISMEDI.**

⚠️ ADR-0039'un N=12 olcumu (136 ms, %2) ve ADR-0037'nin N=10 olcumu (≤315 ms,
%6) ile **ayni bantta**; bir katkici daha eklemek olculebilir bir gecikme
getirmedi. Darbogaz **alti olcumdur** ayni yerde.

### Renk turu — gercek tarayicida, iki temada

| Olcum                         | Acik (sistem) | Koyu (`data-theme=dark`) |
| ----------------------------- | ------------- | ------------------------ |
| Modul `--accent`              | **#5c6cab**   | **#92a5e8**              |
| Modul `--ink`                 | **#4c5b98**   | **#a3b6fa**              |
| ⚠️ Oda icinde `--ai-accent`   | **#b25628**   | **#e8935a**              |
| ⚠️ Koridor (kabuk) `--accent` | **#b25628**   | **#e8935a**              |
| "Tedarikci" kapisinin rengi   | #5c6cab       | #92a5e8                  |
| ⚠️ "Musteriler" kapisi (CRM)  | #3173af       | #6bacec                  |

⚠️ Ikisi de `module-colors.css`in **olculmus** degerleriyle birebir ayni; renk
uretilmedi. **Kabuk ve AI'in sesi terracotta kaldi** — `app-shell.tsx`e
**YEDINCI kez dokunulmadi**.

⚠️ **KOMSU HUE SINAVI:** Tedarikci (#5c6cab) ile CRM (#3173af) koridorda yan
yana duruyor ve `module-colors.css`in secim kurali 2 bunu ISTIYOR ("akraba
moduller komsu hue alir"). Bedeli renk korlugu altinda yakinlasmalaridir; bu
yuzden iki kapi FARKLI IKON, FARKLI ETIKET tasiyor ve aktif kapi
`aria-current="page"` tasiyor — ucu de dogrulandi.

### ⚠️ ODA sinavi (ADR-0038 §6.5) — duvar GERCEKTEN ortak

| Rota                          | Duvar      | Kahraman | Aktif sekme  | Tezgah          |
| ----------------------------- | ---------- | :------: | ------------ | --------------- |
| `/app/suppliers`              | var        |  **3**   | Tedarikciler | TEDARIKCILER    |
| `/app/suppliers/interactions` | **AYNI**   |  **3**   | Gorusmeler   | GORUSMELER      |
| `/app/suppliers/<id>`         | ⚠️ **YOK** |    —     | ⚠️ **YOK**   | FIRMA + KISILER |

Kahraman rakam **toplam tedarikci sayisi**; ⚠️ **"durgun tedarikci" diye bir
uydu YOK** (§3.2 ile celisirdi) ve bir birim testi bunu kilitliyor.

Detayin duvari ve sekme seridi yok — _"ozetlenecek bir durum degil, tek bir
kayit var"_.

⚠️ **Gorusme kartlarinda SIFIR buton** (gercek tarayicida olculdu):
ekleme-yalnizlik arayuzde de tutuyor. Ekran sebebini yaziyor: _"sonradan
duzenlenemez ve silinemez — yanlis bir kayit varsa dogrusu yeni bir kayit
olarak yazilir."_

### ⚠️ Odeme kosullari AYRISTIRILMADI — gercek ekranda dogrulandi

Detay sayfasinda `45 gun vadeli` **oldugu gibi** basildi: bir "45 gun" rozeti,
bir vade tarihi ya da renklendirme YOK. §1.2'nin ve §3.2'nin arayuz tarafindaki
karsiligi budur — sunucuda reddedilen yapisal alani arayuzden geri getirmek
olurdu.

**Bilincli YAPILMAYANLAR** (hafif denetim kurali, kayda gecer): sifirdan kurulum
❌ · iki tenant'la tam RLS izolasyon turu ❌ (entegrasyon testi kapsiyor) ·
**prod dogrulamasi ❌ — bu slice migration TASIMAZ**.
