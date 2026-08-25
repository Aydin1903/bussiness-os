# 0045 — Faz 5 / Modul 10: Musteri Geri Bildirimi / Anket

- **Durum:** Onerildi — ⚠️ **IKI KALEM PRODUCT OWNER ONAYI BEKLIYOR**
- **Tarih:** 2026-08-25
- **Karar veren:** Product Owner
- **Faz:** 5

> ### ⚠️ NUMARA NOTU — bu ADR neden 0045, 0044 DEGIL
>
> Is emri bu belgeyi **ADR-0044** olarak istedi. O numara **alinmis**:
> [ADR-0044](0044-ik-v2-izin-ve-zenginlestirilmis-calisan-kaydi.md) IK v2'dir
> (kabul edildi, 2026-08-24) ve ROADMAP §3.5 ile CLAUDE.md ondan **numarasiyla**
> bahsediyor. Yayinlanmis bir ADR numarasi kaydirilmaz; yeni kararlar serinin
> devamindan numara alir. Uzerine yazmak, iki belgeyi ayni adla anan **dort ayri
> referansi** sessizce yanlislastirirdi.

## Baglam

Faz 5'in ilk **dokuz** modulu kapandi ve prod'da canli: CRM
([ADR-0031](0031-crm-module.md) + [ADR-0032](0032-company-summary.md)) ·
Projeler ([ADR-0033](0033-projects-module.md)) ·
Finans ([ADR-0034](0034-finance-module.md)) ·
Randevu/Rezervasyon ([ADR-0035](0035-randevu-rezervasyon-modulu.md)) ·
Belge/Sozlesme ([ADR-0037](0037-belge-sozlesme-yonetimi.md)) ·
Stok/Envanter ([ADR-0039](0039-stok-envanter-modulu.md)) ·
Tedarikci ([ADR-0040](0040-tedarikci-yonetimi-modulu.md)) ·
Teklif/Fatura ([ADR-0041](0041-teklif-fatura-modulu.md)) ·
IK/Personel ([ADR-0043](0043-ik-personel-modulu.md) +
[ADR-0044](0044-ik-v2-izin-ve-zenginlestirilmis-calisan-kaydi.md)).

Platform seviyesinde uc is kalici standarttir:
[ADR-0036](0036-context-retrieval-kota.md) (havuzun yapisal taban kisiti),
[ADR-0042](0042-retrieval-taban-revizyonu.md) (o kisitin olcumle sinanmasi ve
**yeni tetikleyicileri**) ve [ADR-0038](0038-oda-tasarim-sistemi.md) (ODA).

ROADMAP §3.5'in **onuncu** sirasi **Musteri Geri Bildirimi / Anket**tir; kapsam
notu tek kelimeyle yazilmis: _"Yanit toplama"_. **Onbirinci sema.**

### ⚠️ BU MODUL SIRADAKI DOKUZDAN FARKLI BIR YERDE DURUYOR

Sekiz modul boyunca esik kontrolu ya **kapaliydi** ya da **bir kez** asildi.
Bu modul, ADR-0043'un **ismen ongordugu** moduldur:

> _"Onuncu modul (Musteri Geri Bildirimi / Anket) bir yapisal katkici adayi
> tasiyor ('cevaplanmamis anket', 'dusen memnuniyet') ve o gun T2 **ates
> alabilir**."_ — [ADR-0043](0043-ik-personel-modulu.md) §5.3

Yani bu ADR'nin en agir maddesi §3'tur ve ⚠️ **o madde bir modul karari
degildir**: yapisal katkici eklemek bugun **dogrudan bir PLATFORM esigini**
tetikler. §3.4 bunun nasil ele alindigini yaziyor.

### Zemin: onuncu modul, buyuk olcude TUKETICI

| Ne                          | Tedarikci'de           | Teklif/Fatura'da            | IK'da                   | **Geri Bildirim'de**                                    |
| --------------------------- | ---------------------- | --------------------------- | ----------------------- | ------------------------------------------------------- |
| `EmbeddingPort` / `LLMPort` | `shared/`'dan hazir    | HIC KULLANILMADI            | HIC KULLANILMADI        | ⚠️ **`EmbeddingPort` KULLANILIYOR** (`LLMPort` hayir)   |
| Chunk tablosu               | Reddedildi             | Yok (vektor yok)            | Yok (vektor yok)        | ⚠️ **Reddedildi** — iki emsalin ortak olcutuyle (§1.2)  |
| Oran siniri                 | Bir satir deklarasyon  | YOK                         | YOK                     | **VAR** (embedding uretiyor — §8)                       |
| RLS sablonu                 | MT §12.2'den hazir     | MT §12.2'den hazir          | MT §12.2'den hazir      | **MT §12.2'den hazir**                                  |
| Retrieval ucu               | TEK katkici (anlamsal) | TEK katkici (yapisal)       | ⚠️ **SIFIR katkici**    | ⚠️ **TEK katkici (anlamsal)** — yapisal ADAY **askida** |
| Izin modeli                 | Sekizinci kez          | Dokuzuncu kez               | Genis + dar bir arada   | ⚠️ **`write` YOK, `create` VAR** (§5)                   |
| Cross-modul referans        | HIC YOK                | TEK kenar, sifir yeni satir | Sifir (platform kenari) | **TEK kenar, sifir yeni satir** (ucuncu kez)            |
| Degistirilebilirlik         | Ekleme-yalniz          | `draft` sonrasi kapali      | Ucret: duzeltme kaydi   | ⚠️ **YENI SEKIL: degistirilemez ama SILINEBILIR** (§2)  |
| ODA                         | Ilk gunden             | Ilk gunden                  | Ilk gunden              | **Ilk gunden**                                          |

**Gercekten yeni DORT karar var** ve biri digerlerinden agirdir:

1. ⚠️ **YAPISAL KATKICI ADAYI GERCEKTEN GUCLU — ve tam olarak bu yuzden bu ADR
   onu TEK BASINA EKLEYEMEZ** (§3). Tedarikci ve IK'daki alti adaydan farkli:
   orada _"bakildi ve yoktu"_ denebiliyordu, burada **var**.
2. ⚠️ **DEGISTIRILEMEZ AMA SILINEBILIR** — projede ucuncu bir degistirilebilirlik
   sekli (§2). Stok'un defteri silinemez de; Randevu'nun kaydi degistirilebilir
   de. Bu ikisinin arasinda ve gerekcesi **KVKK'dir**, kolaylik degil.
3. ⚠️ **KAYIT BIR UCUNCU KISININ BEYANIDIR** — projede ilk kez saklanan sey
   kullanicinin kendi is verisi degil, **bir baskasinin sozudur** (§2.1).
4. ⚠️ **VEKTOR BASLIGINDA BAYATLAYAN HICBIR SEY YOK** — ADR-0035'in
   `staleAfterRename` borcunun **hic dogmadigi** ilk anlamsal modul (§4).

---

## ⚠️ PRODUCT OWNER ONAYINA SUNULAN IKI KALEM

Ikisi de ayri ayri karara baglanabilir; biri reddedilirse digeri ayakta kalir.

### Kalem A — ⚠️ Yapisal katkici v1'de EKLENMIYOR (ama REDDEDILMIYOR)

§3.2'nin dort testinden **ucu geciyor**: aday gercek bir haber degeri tasiyor.
Yine de v1'e **konmuyor**, cunku eklemek
[ADR-0042](0042-retrieval-taban-revizyonu.md) §3'un **T2** esigini tetikler ve
⚠️ **T2'nin girdisi bugun OLCULEMIYOR** (§3.3).

- **Onay verilirse** (onerilen): Slice 1 **tek anlamsal katkici** ile yazilir;
  yapisal aday §3.4'un yazili tetikleyicisiyle askida kalir.
- **Onay verilmezse** ("katkiciyi simdi ekle"): ⚠️ **implementasyona
  GECILMEZ.** Once ADR-0036/0042 yeniden acilir ve **ayri bir platform ADR'si**
  (0046 adayi) yazilir. ADR-0041 §4.3'un sirasi tersine cevrilemez:
  _"once olcum, sonra karar."_

### Kalem B — ⚠️ `retrieval.select` gozlemlenebilirlik satiri (PLATFORM borcu)

ADR-0043'un kapanis denetimi ADR-0042 §4'un yeni olcum protokolunu
**uygulayamadi** ve bunu bir **platform borcu** olarak kaydetti (gecici
enstrumantasyon, `@nestjs/config`in Zod semasi bilinmeyen env anahtarlarini
eledigi icin calismadi). Kalem A'nin gelecekteki cozumu **bu borca bagimlidir**:
olcemedigimiz bir esik hakkinda karar veremeyiz.

⚠️ **Bu is bu modulun kapsaminda DEGILDIR** (Mutlak Kural 1) — burada yalnizca
**sirasi** soruluyor. Onerilen: ayri bir platform slice'i, bu modulden **once**
ya da **sonra**, ama Kalem A'nin yeniden acilmasindan **once**.

---

## Karar

### 1. Yeni `feedback` semasi — TEK tablo

Onbirinci sema. ⚠️ **Anahtar `feedback`**: sema, modul klasoru, rota
(`/app/feedback`), `data-module` ve `module-colors.css`teki palet blogu **ayni
kelime** — ADR-0035'in `booking` → `appointments` dersi, palet **ilk gunden
dogru adla** yazilmis durumda (§9).

#### 1.1 `feedback.responses`

| Kolon                | Tip                    | Not                                                                                   |
| -------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| `id`                 | `uuid` PK              |                                                                                       |
| `tenant_id`          | `uuid NOT NULL`        | RLS + **FORCE** (MT §12.2)                                                            |
| `rating`             | `smallint NOT NULL`    | ⚠️ `CHECK (rating BETWEEN 1 AND 5)` — olcek **SABIT** (§1.3)                          |
| `comment`            | `text NULL`            | ⚠️ **OPSIYONEL**; ust sinir `TARGET_CHUNK_CHARS` (§1.4)                               |
| `channel`            | `text NULL`            | Serbest metin etiketi (`"Google"`, `"telefon"`); ust sinir **80** (§1.5)              |
| `crm_contact_id`     | `uuid NULL`            | ⚠️ Cross-modul isaretci — **FK YOK**, `null` **YAYGIN DURUMDUR** (§6)                 |
| `received_at`        | `timestamptz NOT NULL` | Geri bildirimin **alindigi** an; ofsetsiz zaman **422** (ADR-0035'in dogrulama dersi) |
| `embedding`          | `vector(1536) NULL`    | ⚠️ **Satirin kendi kolonu — chunk tablosu YOK** (§1.2). Dokuzuncu vektor tablosu.     |
| `created_by_user_id` | `uuid NOT NULL`        | Satir ici aktor damgasi (ADR-0041 §8 deseni) — ⚠️ bir **denetim izi degildir**        |
| `created_at`         | `timestamptz NOT NULL` |                                                                                       |

⚠️ **`updated_at` YOK ve bu bir unutkanlik degildir** — §2'nin dogrudan sonucu:
guncellenmeyen bir satirin guncellenme zamani da olmaz. Kolonu koymak, olmayan
bir yolun **var oldugunu ima ederdi**.

#### 1.2 ⚠️ CHUNK TABLOSU YOK — iki emsalin ORTAK olcutu uygulaniyor

Projede bu soru iki kez, **birbirinin tersi** yonde cevaplandi ve ikisi birlikte
bir kural uretti:

| ADR                                               | Karar                 | Olcut                                                       |
| ------------------------------------------------- | --------------------- | ----------------------------------------------------------- |
| [ADR-0035](0035-randevu-rezervasyon-modulu.md) §3 | Chunk tablosu **YOK** | Metnin ust sinirini **BIZ** belirliyoruz (servis notu)      |
| [ADR-0037](0037-belge-sozlesme-yonetimi.md) §3    | Chunk tablosu **VAR** | Metnin ust sinirini **DOSYA** belirliyor                    |
| [ADR-0040](0040-tedarikci-yonetimi-modulu.md) §1  | Chunk tablosu **YOK** | CRM'in `interaction_chunks`'i bir **emsal degil, MIRAS**tir |

> **Birlesik kural:** _chunk tablosu, metnin ust sinirini kullanici degil
> **verinin kendisi** belirliyorsa acilir._

Bir geri bildirim yorumunun ust sinirini **biz** belirliyoruz ve
`TARGET_CHUNK_CHARS`a **esitliyoruz** (Randevu ve Tedarikci ile birebir ayni
desen: `MAX_SERVICE_NOTE_CHARS`, `MAX_INTERACTION_BODY_CHARS`). Parcalayici her
zaman tek parca uretirdi; ikinci tablo yalnizca bir **join maliyeti** olurdu.

⚠️ **YENI BIR SAYI ICAT EDILMEZ.** Sinir `TARGET_CHUNK_CHARS`tan **turetilir** —
ayri bir sabit yazilsaydi ve chunking bir gun degisseydi, karar sessizce
gecersizlesir ve tek-parca varsayimi bozulurdu.

#### 1.3 ⚠️ OLCEK SABIT 1–5 — NPS DEGIL, ve `scale` kolonu YOK

v1 tek bir olcek tanir: **1–5 tam sayi**. Uc sonucu var ve ucu de kasitli:

1. **Ortalama ANLAMLIDIR.** ADR-0034'un para birimi ve ADR-0039'un birim kurali
   (_"farkli birimler toplanmaz"_) burada **tetiklenmez**: butun puanlar ayni
   olcekte. ⚠️ Bu, Stok'un _"toplam stok diye bir rakam yoktur"_ kisitinin
   **ilk kez gecerli olmadigi** modul.
2. ⚠️ **NPS KAPSAM DISI** (§10). NPS bir sayi degil bir **metodolojidir**
   (0–10 olcek + promoter/detractor formulu). Ayni tabloya karistirilirsa
   `rating`in anlami satirdan satira degisir ve ortalama **sessizce yanlis**
   olur.
3. ⚠️ **`scale` kolonu BUGUN ACILMAZ.** "Ileride lazim olur" diye kolon acmak
   bu projede on ikinci kez reddedilen seydir. NPS geldiginde `scale` bir
   `ALTER`dir; ⚠️ ama asil is kolon degil, **gecmis verinin nasil yorumlanacagi
   karari**dir ve o bir ADR ister.

#### 1.4 Yorum OPSIYONEL — ve sessiz kirpma YOK

Puan zorunlu, yorum degil: gercekte gelen geri bildirimlerin cogu **yalnizca bir
puandir** (QR kod, tek tikla anket). Yorumu zorunlu kilmak, kullaniciyi `"-"`
yazmaya iterdi — ADR-0033'un _"sahte Genel projesi"_ dersinin ayni sekli.

Sinir asilirsa **422 doner** (ADR-0035 §3 ile birebir): kirpsaydik kullanici
yazdiginin yarisini kaybettigini **fark etmezdi**.

⚠️ **Yorumsuz kaydin bir bedeli var ve §3.5'te durustce kaydediliyor:**
embed edilecek metni yoktur, yani `POST /ask` havuzunda **hicbir sesi olmaz**.

#### 1.5 `channel` serbest metindir — ve ayristirilmaz

_"Hangi kanaldan geldi"_ sorusunun cevabi tenant'a gore degisir (Google,
Trendyol, telefon, kagit form). Bir enum ilk musteride yanlis olurdu; bir
tenant-tanimli sozluk ([ADR-0034](0034-finance-module.md) §4'un
`finance.categories`i) ise **bir kolonluk etiket icin ikinci bir CRUD yuzeyi**
demekti.

⚠️ Bedeli yazilidir: `"google"` ve `"Google"` **iki ayri deger** olur
(ADR-0039'un `kg`/`Kg` varyanti, ikinci kez) ve **kanala gore gruplama
guvenilmez**. Kanal v1'de bir **etikettir**, bir boyut degil.

---

### 2. ⚠️ DEGISTIRILEMEZ AMA SILINEBILIR — ucuncu bir sekil

Projede bugune kadar iki sekil vardi. Bu modul **ucuncusunu** getiriyor ve
gerekcesi kolaylik degil **hukuktur**.

| Modul                             | Guncelleme |           Silme            | Olcut                                                            |
| --------------------------------- | :--------: | :------------------------: | ---------------------------------------------------------------- |
| `finance.transactions` (ADR-0034) |     ✅     |             ✅             | Yanlis tutar duzeltilebilmeli                                    |
| `inventory.movements` (ADR-0039)  |     ❌     | ❌ (`RESTRICT` + izin yok) | ⚠️ **Bugunku miktar ondan TURETILIYOR**                          |
| `suppliers.interactions` (0040)   |     ❌     |             ❌             | Bir gorusme olduktan sonra "degismis" olmaz                      |
| **`feedback.responses`**          | ⚠️ **❌**  |         ⚠️ **✅**          | ⚠️ **Ucuncu kisinin beyani** + **KVKK silme yukumlulugu** (§2.2) |

#### 2.1 ⚠️ Neden GUNCELLEME yok — kayit BIZIM sozumuz degil

Bugune kadar sakladigimiz her sey **kullanicinin kendi is verisiydi**: yazdigi
teklif, girdigi hareket, tuttugu not. Bir geri bildirim **baska birinin
sozudur** ve calisan onu yalnizca **aktarir**.

Bir puani "duzeltmek" iki seyden biridir ve ikisi de kabul edilemez:

- musterinin soyledigini **degistirmek** — kurumsal hafizaya bir **yalan**
  yazmaktir;
- yanlis girisi **ortmek** — ⚠️ ve ortulen sey bir **turetilmis rakami**
  (ortalama, dusuk puan sayisi) sessizce yeniden yazar. ADR-0039'un olcutu
  burada **aynen gecerlidir**: _"bugunku gercek gecmis kayitlardan turetiliyor
  mu?"_ → **evet**.

#### 2.2 ⚠️ Neden SILME var — Stok'tan ayrildigi tek nokta

Silme de ortalamayi degistirir. O halde neden `inventory.movements` gibi tam
kapatilmiyor? **Uc fark var ve ucuncusu belirleyicidir:**

1. **Rakamin sinifi farkli.** Stok miktari **rafla eslesmesi gereken** bir
   sayidir; memnuniyet ortalamasi bir **gostergedir**. Birincisinde yanlislik
   yanlis siparise, ikincisinde yanlis bir izlenime yol acar.
2. **Yanlis girilen kayit bir OLGU DEGILDIR.** Bir geri bildirimi yanlislikla
   iki kez kaydeden calisanin urettigi satir, hicbir musterinin soylemedigi bir
   seydir. Onu birakmak hafizayi **zehirler**; silmek gecmisi degil **hic
   olmamis bir kaydi** kaldirir.
3. ⚠️ **VE ASIL GEREKCE — KVKK.** Bir geri bildirim, `crm_contact_id` bagi
   olmasa bile **kisisel veri icerebilir** (yorumun icinde ad, telefon, sikayet
   detayi). Veri sahibinin **silme talebi hakki** vardir (KVKK m.7 / m.11).
   ⚠️ Silme yolu olmayan bir tablo, o talebi **karsilayamaz** — ve bunu Faz
   6'nin KVKK kontrol noktasinda kesfetmek, tabloyu o gun **degistirmek**
   demekti.

> ⚠️ **Yani silme bir KOLAYLIK degil, bir YUKUMLULUKTUR.** ADR-0039'un uc
> katmanli korumasi burada **bilincli olarak uygulanmaz** ve sebebi yazilidir.

#### 2.3 Degistirilemezligin UC katmani

ADR-0039'un uc katmani ve ADR-0043 Slice 1c'nin **dorduncu katmani**, burada
**ilk gunden** ve **silme acik birakilarak** uygulanir:

| #   | Katman                                                                                             | Ne engeller                                            |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | ⚠️ **`feedback:write` DIYE BIR IZIN YOK** — katalogda `create` var (§5)                            | Bir `PATCH` ucu yazilsa bile guard **403** verir       |
| 2   | Entity'de `update`/`changeRating` **metodu yok**; repository'de `update` **yok**                   | Uygulama katmaninda yazilacak yol yok                  |
| 3   | ⚠️ **`REVOKE UPDATE` + `GRANT UPDATE (embedding)`** — ADR-0043 Slice 1c'nin **kolon bazli** deseni | Ham SQL ile bile `rating`/`comment` **degistirilemez** |

⚠️ **Ucuncu katmanin TUZAGI ONCEDEN COZULMUS OLARAK gelir.** ADR-0043'un
dorduncu katman isi, duz bir `REVOKE UPDATE`in `suppliers.interactions`in
**embedding yazan yolunu kiracagini** kesfetmisti. Burada ayni yol var
(`setResponseEmbedding` + `POST /feedback/reindex`), yani grant **ilk gunden
kolon bazli** yazilir: **tek mesru mutasyon turetilmis vektordur.**

⚠️ **`GRANT DELETE` DURUR** ve bu bir unutkanlik degil, §2.2'nin karari oldugu
icin migration'da **acik bir yorumla** yazilir.

---

### 3. ⚠️ TEK katkici — ANLAMSAL. Yapisal aday DEGERLENDIRILDI ve ASKIYA ALINDI

#### 3.1 Anlamsal katkici: `feedback-comments`

| Alan               | Deger                                                        |
| ------------------ | ------------------------------------------------------------ |
| `source`           | `feedback-comments`                                          |
| `contributionKind` | `'semantic'`                                                 |
| `permission`       | `feedback:read`                                              |
| Girdi              | `feedback.responses.embedding` — **satir basina tek vektor** |

Anlatisal icerik **vardir** ve turu bu projede yenidir: **musterinin kendi
cumlesi**. Bugune kadar havuzdaki her anlatiyi sirket **kendisi** yazmisti
(gorusme notu, ilerleme notu, finansal yorum, servis notu). ⚠️ Bu, modulun
kurucu kisita (_"modul AI'a hangi baglami kazandirir"_) verdigi cevabin ta
kendisidir: **disaridan gelen ses.**

#### 3.2 ⚠️ YAPISAL ADAY — dort test, ucu GECIYOR

**Aday:** `feedback-satisfaction` — deterministik bir ozet dondururdu:
_"Son 30 gunde 12 geri bildirim, ortalama 4,2; ⚠️ 3 dusuk puan (≤2), sonuncusu
2 gun once."_ Skor merdiveni ADR-0031/0033'un politikasiyla: dusuk puan **0,95**
· ortalama dususte **0,90** · saglikli **0,75**.

⚠️ **Bu aday, Tedarikci'nin ucu ve IK'nin ucu gibi kolayca reddedilemez.**
Dort olcut sirayla uygulaniyor:

| #   | Olcut                                                            | Kaynak                   | Sonuc                                                                                                                                      |
| --- | ---------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **HABER MI, SAYIM MI?** Bir esik asilinca mi konusuyor?          | ADR-0037/0038 · ADR-0043 | ✅ **GECIYOR.** Dusuk puan varsa alarm bandi, yoksa 0,75. IK'nin _"12 aktif calisan"_ ozeti her zaman **ayni cumleyi** kurardi; bu kurmaz. |
| 2   | **Bir FIIL var mi, yoksa KATALOG mu?**                           | ADR-0040 §3              | ✅ **GECIYOR.** _"Musteri 2 puan verdi"_ tarihli bir olaydir. Tedarikci listesi bir katalogdu; bu bir defterdir.                           |
| 3   | **SEYREK mi?** Sifir donen kaynak icin taban zaten yuva ayirmaz. | ADR-0043 §5.2            | ✅ **GECIYOR.** IK'nin _"bu ay 1 katilim"_ adayi ayda sifir satir donduruyordu; geri bildirim her musteri temasinda gelebilir.             |
| 4   | ⚠️ **AYNI HABERI SOYLEYEN BIR SES ZATEN VAR MI?**                | ⚠️ **BU ADR'NIN OLCUTU** | ⚠️ **BUYUK OLCUDE KALIYOR** — asagida.                                                                                                     |

⚠️ **Dorduncu olcut bu ADR'nin katkisidir ve neden yeni oldugu onemlidir.**
Bugune kadarki her yapisal katkicinin soyledigi sey **hicbir metinde
yazmiyordu**: _"takip gecikti"_ hicbir gorusme notunda, _"stok tukeniyor"_
hicbir kalem notunda, _"teklifin suresi doldu"_ hicbir yerde yazmaz —
kolonlardan **turetilir**.

⚠️ **Burada durum TERSTIR.** Olumsuz geri bildirimin haberi, **musterinin kendi
cumlesidir** ve o cumle zaten `feedback-comments` ile havuza girer. Yani yapisal
katkici, bu modulde anlamsal katkicinin **zayif bir ozeti** olurdu:

> _"3 dusuk puan var"_ ile _"siparisim iki hafta gecikti ve kimse donmedi"_
> arasinda hangisi bir CEO'ya daha cok sey soyler? ⚠️ Yapisal ozet, **taban
> garantisiyle** iceri girip anlamsal parcayi disari itebilir — yani modulun
> **kendi en iyi cumlesini** kendi ozeti dusurebilirdi.

⚠️ **TEK ISTISNA ve durustce kaydediliyor:** **yorumsuz** puanlar (§1.4).
Onlarin metni yoktur, yani anlamsal ses de yoktur — o kayitlar icin yapisal
katkici **tek ses** olurdu. Bu, dorduncu olcutun **tam degil buyuk olcude**
karsilandigi anlamina gelir ve adayin **reddedilmemesinin** sebebidir.

#### 3.3 ⚠️ ADR-0036 / ADR-0042 ESIK KONTROLU — dort soru (SABIT MADDE)

CLAUDE.md'nin kalici dersi geregi bu madde **atlanmaz** ve cevap "hayir" olsa
bile yazilir.

| #   | Soru                                                                  | Cevap                                                                                                                                                           |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Bu modul **yapisal** bir katkici ekliyor mu?                          | ⚠️ **v1'de HAYIR** — ama _"bakildi ve yoktu"_ **degil**, _"bakildi, VAR, ve tek basina eklenemez"_ (§3.2 / §3.4)                                                |
| 2   | Satir donduren yapisal kaynak sayisi kaca cikiyor?                    | **6 → 6** (v1). ⚠️ Eklenirse **kayitli** sayi 7 olur; ⚠️ **satir donduren** sayi **hala olculmedi**                                                             |
| 3   | ADR-0042 §3'un **T2** esigini (`2K/3` — `K=8` icin **6**) geciyor mu? | ⚠️ **v1'de HAYIR.** Eklenseydi: kayitli 7 > 6 ve katkici **saglikli tenant'ta bile satir dondururdu** (0,75 bandi) — yani T2 **atesler** sayilirdi              |
| 4   | Geciyorsa ne yapilir?                                                 | ⚠️ **Bu bir PLATFORM kararidir**; modul ADR'si tek basina veremez. ADR-0042'nin deseni: **once olcum, sonra karar** — ve ⚠️ **olcum araci bugun YOK** (Kalem B) |

⚠️ **Ucuncu sorunun cevabi bir INCELIK tasiyor ve gizlenmiyor:** T2 _"satir
donduren"_ kaynaklari sayar, kayitli olanlari degil. Bu katkici — CRM'in
pipeline'i gibi — **saglikli durumda da bir satir dondururdu** (`0,75` bandi,
_"ortalama 4,2"_), yani T2 acisindan **kesin bir yedinci** olurdu.
⚠️ Ustelik su anki altinin **kaci** satir donduruyor **bilinmiyor**: ADR-0042
§ Verinin soylemedigi maddesi ve ADR-0043'un uygulanamayan olcumu ayni boslugu
isaret ediyor.

> ⚠️ **ADR-0042'nin ilkesinin AYNASI:**
> _"Bir platform karari, onu degistirmesi gereken **veriye sahip olmadan**
> revize edilmez."_ → **Bir esik, onu olcecek arac yokken GECILMEZ.**

#### 3.4 ⚠️ KARAR: v1'de EKLENMIYOR — REDDEDILMIYOR, KOSULLU ERTELENIYOR

Bu, ADR-0040 §3'un _"uc aday, ucu de reddedildi"_ formatindan **bilincli olarak
farklidir** ve fark kayda geciriliyor: orada adaylar **liyakatsizdi**, burada
aday **liyakatli ama ZAMANI DEGIL**.

**Ertelemenin yazili ON KOSULLARI — sirayla:**

1. ⚠️ **`retrieval.select` gozlemlenebilirlik satiri yazilir** (Kalem B) —
   ADR-0042 §4'un istedigi uc veri (giren kaynaklar · **satir sayisi** ·
   **skor**) ancak bununla uretilebilir. Slice 0.5'in `ai.call` deseni.
2. **Bir kapanis denetiminde olcum yapilir** ve satir donduren yapisal kaynak
   sayisi **ilk kez** ogrenilir.
3. ⚠️ **ADR-0036/0042 yeniden acilir** — ayri bir platform ADR'si. O ADR
   ADR-0042'nin cevaplayamadigi iki soruyu (band ici siralama liyakatli mi;
   `project-status`/`appointment-schedule` **elendi mi bos mu dondu**) elindeki
   yeni veriyle cevaplar.
4. **Ancak ondan sonra** `feedback-satisfaction` yazilir.

⚠️ **Sira tersine cevrilemez.** Bugun eklemek, ADR-0041'in esigi asarken
yaptigi seyi (katkici eklendi, taban degistirilmedi, revizyon olcume birakildi)
**tekrarlamak gibi gorunurdu ama degildir**: ADR-0041'in isinde esik **yeni
asiliyordu** ve olcum aracina ihtiyac yoktu (kaynak sayisi elle sayilabiliyordu).
Bugun asilacak esik **davranissaldir** ve ⚠️ **elle sayilamaz**.

#### 3.5 ⚠️ Bunun DURUST BEDELI

- ⚠️ **Yorumsuz puanlarin `POST /ask` havuzunda HICBIR SESI YOKTUR.** Bir tenant
  yalnizca yildiz topluyorsa, modulun kurumsal hafizaya katkisi **sifira
  yaklasir** — modul calisir, ekran dolu olur, ama `/ask` bunu **gormez**.
  Bu, Kalem A'nin en guclu karsi-argumanidir ve gizlenmiyor.
- **Ortalama puan, dusuk puan sayisi ve trend `/ask`ten SORULAMAZ.**
  _"Musteri memnuniyetimiz nasil"_ sorusuna cevap yalnizca ilgili **yorumlarin**
  bulunmasi uzerinden gelir.
- ⚠️ Bu iki bedel §3.4'un tetikleyicisi ateslenene kadar **acik kalir** ve
  kapanis denetiminde **olculur** (denetim maddesi 8).

#### 3.6 ⚠️ `/ask` izin filtresi YINE tetiklenmiyor — DOKUZUNCU kez

Tek katkicinin kapisi `feedback:read` ve **dort rol de** onu tasiyor (§5).
Filtrenin tek gercek tetikcisi **hala Finans**tir. ⚠️ Ayrica **`company:read`siz
kullanici senaryosu** da degismiyor — bu modul o satira da dokunmuyor.

---

### 4. ⚠️ Vektor basligi — ve BAYATLAYAN HICBIR SEY YOK

Embed edilen satir, ADR-0035 §6.1'in sabit etiket desenidir:

```
[Geri bildirim · 2026-08-25 · 2/5 · Google] Siparisim iki hafta gecikti ve kimse donmedi.
```

⚠️ **PUAN BASLIGA KONUYOR ve bu kasitlidir:** _"memnuniyetsiz musteriler"_ gibi
bir soru, metninde "memnun degilim" gecmeyen ama **2/5** verilmis bir yorumu da
bulabilmelidir. Puan bir **sayidir**, ama vektorun icinde bir **isarettir**.

⚠️ **KISI ADI BASLIGA KONULMAZ** — ve bu, ADR-0035'ten **bilincli sapmadir**
(Belge'nin ayni karari, ikinci kez). Iki gerekce:

1. **Bayatlama.** Ad `crm.contacts`ta yasar; CRM'de bir yeniden adlandirma
   **butun** vektorleri bayatlatirdi. ADR-0040 bunun bedelini olcmustu
   (`staleAfterRename` bayragi + elle `reindex`).
2. ⚠️ **Cozulemez.** Adi okumak izin kapili bir dizin ister ve `ContributeInput`
   **rol tasimaz** (ADR-0040'in `AppointmentNotesContributor` icin kaydettigi
   sinir). Tedarikci'de ad **ayni semadaydi**, burada degil.

> ⚠️ **SONUC — projede ILK:** basligin iki bileseni de (tarih ve puan)
> **degistirilemez** (§2), yani **bu modulde BAYATLAMA PENCERESI YOKTUR.**
> `staleAfterRename` gibi bir bayrak, `reindex { supplierId }` gibi bir onarim
> ucu **gerekmez**.

⚠️ `POST /feedback/reindex` yine de **ilk gunden vardir** — ama isi farklidir:
**bayatlik onarmaz, BASARISIZ embedding'i onarir** (§8).

---

### 5. Izinler — ⚠️ `write` YOK, `create` VAR

ADR-0025'in `resource:action` modeli, **onbirinci** kez.

| Permission        | owner | admin | member | viewer |
| ----------------- | :---: | :---: | :----: | :----: |
| `feedback:read`   |  ✅   |  ✅   |   ✅   |   ✅   |
| `feedback:create` |  ✅   |  ✅   |   ✅   |   ❌   |
| `feedback:delete` |  ✅   |  ✅   |   ❌   |   ❌   |

⚠️ **`feedback:write` DIYE BIR IZIN YOK ve bu, §2'nin izin adinda GORUNUR
HALIDIR.** Projede iki ad ayri anlam tasiyor ve bu ayrim bugune kadar sessizce
tutulmustu — burada **acikca** kullaniliyor:

| Ad       | Anlami                  | Ornekler                                                                         |
| -------- | ----------------------- | -------------------------------------------------------------------------------- |
| `write`  | olustur **VE guncelle** | `employee:write`, `supplier:write`, `stock_item:write`                           |
| `create` | ⚠️ **yalnizca olustur** | `interaction:create`, `commentary:create`, `progress_note:create`, `note:create` |

`feedback:create`, **ekleme-yalniz** olan besinci kaynaktir. ⚠️ ADR-0043 §7.1'in
cumlesi burada da gecerlidir: _"var olmayan bir izin, unutulmus bir izin
degildir"_ — katalogda yazmadigi icin guard onu **hicbir role** vermez.

⚠️ **KATALOG GENIS** (ADR-0034 §7'nin olcutu, onuncu kez): _"musteri memnuniyeti
PAYLASILAN bir is gercegidir."_ Bir musterinin sikayetini gormesi gereken kisi
tam olarak `member` rolundeki kisidir; dar bir katalog modulu, onu **kullanmasi
gereken herkese** kapatirdi.

⚠️ **`delete` DAR ve gerekcesi iki katmanli:** (a) silme bir **turetilmis
rakami** degistirir (§2.2), (b) KVKK silme talebi bir **yonetim islemidir**,
gunluk is degil. ⚠️ IK'nin `employee:write` gerekcesiyle ayni sinif: _"bir
meslektasin unvanini degistirmek kimsenin gunluk isi degildir."_

⚠️ **AD CAKISMASI YOK — ve bu kez ONGORU DE YOK.** `feedback` niteliksizdir ve
dogrudur: baska hicbir modulun "geri bildirim"i olmayacaktir. ⚠️ Katalog
tarandi: `feedback`, `rating`, `response`, `survey` — **dorduyle de** cakisma
yok. ADR-0039'un `stock_item` ongorusu burada **gerekmiyor**; 11. (Kampanya) ve 12. (Sadakat) modullerin kavramlari `campaign` ve `loyalty_point`tir.

---

### 6. Cross-modul referans ve DAG — ⚠️ KANIT, IDDIA DEGIL

#### 6.1 TEK kenar, SIFIR yeni satir — ucuncu kez

`crm_contact_id` icin gereken dizin (`ContactDirectory.findNames(ids, role)`)
**zaten var**: Randevu yazdi ([ADR-0035](0035-randevu-rezervasyon-modulu.md) §2),
Belge kullandi. ⚠️ **`crm.public.ts` tek satir degismez** —
[ADR-0037](0037-belge-sozlesme-yonetimi.md) §4.1'in kurali (_"yeni TALIP → dosya
degismez; yeni KAYNAK TURU → sahibi modul kendi dizinini yazar"_) **ucuncu kez**
talip tarafindan dogrulaniyor.

Uc parcali desen aynen uygulanir: **FK yok** (Kural 5) · ad **denormalize
edilmez**, her okumada cozulur · okuma **`contact:read` iznine baglidir** (kapi
arayuzun **icinde**). Sarkan `crm_contact_id` **tolere edilir** — projede
**dorduncu** sarkan isaretci.

#### 6.2 ⚠️ `crm_contact_id` NULLABLE — ve `null` YAYGIN DURUMDUR

ADR-0033 §2'nin (`tasks.project_id`) ve ADR-0043 §2'nin (`platform_user_id`)
ayni dersi, **ucuncu kez**: gercek geri bildirimlerin cogu **anonimdir** (Google
yorumu, QR kod, kagit form).

⚠️ Zorunlu olsaydi kullanici **sahte CRM kisileri** acardi — ve bedeli bu modulde
kalmazdi: **CRM'in musteri listesi kirlenirdi**. ⚠️ Yani zorunluluk, baska bir
modulun hafizasini zehirlerdi.

#### 6.3 DAG kaniti

Bugunku **is-modulu** kenarlari (kaynak: `*.public.ts` import'lari):

| #   | Kenar             | #   | Kenar                      |
| --- | ----------------- | --- | -------------------------- |
| 1   | Projeler → CRM    | 5   | Belge → CRM                |
| 2   | Finans → CRM      | 6   | Belge → Projeler           |
| 3   | Finans → Projeler | 7   | Teklif/Fatura → CRM        |
| 4   | Randevu → CRM     | 8   | ⚠️ **Geri Bildirim → CRM** |

**Kenar sayisi YEDIDEN SEKIZE cikar.** Dongusuzluk **iddia edilmiyor,
gosteriliyor**:

- **CRM bir KOK DUGUMDUR** — `crm/` altinda baska hicbir is modulunun
  `public.ts`ine import **yoktur** (yalnizca `platform/authz` ve
  `platform/context`; ikisi de platform, is modulu degil).
- **Geri Bildirim bir YAPRAKTIR** — ⚠️ `feedback.public.ts` **ACILMAZ**
  (ADR-0035'in kurali: _talip yokken dizin yazilmaz_). Yani modulden **cikan tek
  kenar** CRM'edir ve **giren kenar yoktur**.
- Bir yaprak dugumden bir kok dugume cikan tek yonlu kenar **dongu kuramaz**.

Katmanlar: **0** — CRM · Stok · Tedarikci · IK (kokler); **1** — Projeler;
**2** — Finans · Randevu · Belge · Teklif/Fatura · **Geri Bildirim**.

⚠️ **Ters yon (CRM → Geri Bildirim) HICBIR KOSULDA yazilmaz** — Tenant ↔
Identity tuzagi (cozumu `forwardRef` degil ucuncu bir moduldu). _"Bu musterinin
son puani"_ CRM ekraninda istenirse cevap `feedback.public.ts` **degildir**;
o gun sorulacak soru **hangi modulun sahip oldugudur**.

---

### 7. Exception filter — uc AI hata tipi; ⚠️ IKISI GERCEKTEN TETIKLENEBILIR

CLAUDE.md'nin kalici standardi, **onbirinci** kez:
`FeedbackDomainExceptionFilter`in `@Catch(...)` listesi — `FeedbackDomainError` +
`EmbeddingFailedError` + `RateLimitExceededError` + `CompletionFailedError`.

⚠️ **Onceki iki modulden farki:** ADR-0041 ve ADR-0043'te ucu de
**tetiklenemezdi** (o modullerde AI yuzeyi yoktu). Burada:

| Tip                      | Tetiklenebilir mi | Davranis                                                                                             |
| ------------------------ | :---------------: | ---------------------------------------------------------------------------------------------------- |
| `EmbeddingFailedError`   |    ⚠️ **EVET**    | **502 + `DisclosableProblem`** — ⚠️ kayit **SILINMEZ**; mesaj `reindex` ile onarilabilecegini soyler |
| `RateLimitExceededError` |    ⚠️ **EVET**    | **429** — ⚠️ isaret **TASIMAZ** (maske yalnizca 5xx'e uygulanir)                                     |
| `CompletionFailedError`  |       HAYIR       | Olu kod; modulde `LLMPort` cagrisi yok. Bedeller **simetrik degil** — yine de yazilir                |

⚠️ **Yorumsuz geri bildirim embedding uretmez**, yani `POST /feedback` yorumsuz
gonderildiginde saglayici cokse bile **201** doner. Randevu'nun aynen ayni
davranisi (notlu **502**, notsuz **201**) — ve kapanis denetiminde **oyle
sinanir**.

⚠️ **Eslenmemis domain kodunun 500'u MASKELI KALIR** ve bir test onu kilitler.
⚠️ **`StorageFailedError` / `PdfPort` hatalari YAZILMAZ** — kapsam **AI hata
tipleridir, hepsi degil**.

---

### 8. Oran siniri ve `reindex`

- **Oran siniri:** `platform.rate_limits`, eylem adi `feedback_embedding`
  (Tedarikci'nin `suppliers_embedding` deseni). ⚠️ Sayac **kayit degil
  EMBEDDING** sayar — Stok'un kapanis denetiminde olculen davranis (notsuz kayit
  sayaci tuketmez) burada da **aynen** gecerlidir ve **denetimde dogrulanir**.
- **`POST /feedback/reindex`:** ilk gunden. ⚠️ Isi **bayatlik onarmak degil**
  (§4 — bayatlik yok), **basarisiz embedding'i onarmaktir**. Cevap
  `{ reindexed, failed }` doner (ADR-0035 deseni).

---

### 9. Frontend: ODA — koridorda ONBIRINCI kapi

[ADR-0038](0038-oda-tasarim-sistemi.md)'in ODA sistemi, onuncu kez tuketici.

**Renk:** `#56793e` (koyu `#8cb274`) — adacayi yesili. Bir tercih degil,
`module-colors.css`te **ROADMAP §3.5 sirasina gore zaten ayrilmis** deger.
⚠️ **Anahtar `feedback`** ve palet **ilk gunden dogru adla** yazilmis.

> ⚠️ **DORDUNCU KOMSU-HUE KUMESI — ve setin EN KALABALIGI: YESIL BANDDA DORT
> KAPI.** `projects` (#717325 zeytin) · `finance` (#307d54 yesil) ·
> `invoicing` (#257c6c yesil-teal) · **`feedback` (#56793e adacayi)**. Onceki
> kumeler cift (CRM/Tedarikci, Finans/Teklif) ya da uclu (IK/Kampanya/Sadakat)
> idi; bu **dortlu**. Kural bugunden daha da baglayicidir: **renk hicbir yerde
> TEK ayirt edici olmaz** — dort kapi farkli ikon, farkli etiket ve
> `aria-current` tasir. ⚠️ Renk koru bir kullanici icin bu dortlu, koridorun **en
> riskli bolgesidir** ve kapanis denetiminde **ikon/etiket ayrimi acikca kontrol
> edilir**.

**Oda:** tek dikey kaydirmada duvar + tezgah.

| Bolge      | Ne                                                                                                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Duvar**  | Kahraman rakam: **son 30 gunun ortalama puani** — ⚠️ **yaninda N HER ZAMAN yazilir** (§9.1). Uydular: bu ay gelen kayit · **dusuk puan (≤2) sayisi** · ⚠️ **yorumsuz kayit sayisi** (= aranamayan kayit sayisi) |
| **Tezgah** | Liste: tarih · puan · kanal · kisi (cozulebiliyorsa) · yorum ozeti. Filtre: puan bandi (dusuk / orta / yuksek)                                                                                                  |

#### 9.1 ⚠️ ORTALAMA, N OLMADAN GOSTERILMEZ

Tek kayitli bir tenant'ta _"ortalama 1,0"_ bir haber degil **gurultudur**.
Rakamin yaninda **her zaman** kac kayittan hesaplandigi yazilir; ⚠️ ve `N = 0`
iken ortalama **hic gosterilmez** — `0,0` yazmak, "cok kotu" ile "hic veri yok"u
ayni goruntuye indirir ve hata **sessizdir**.

⚠️ **Uydulardan biri MODULUN KENDI SINIRINI GORUNUR KILAR:** yorumsuz kayit
sayisi, §3.5'in bedelinin ekrandaki karsiligidir — Belge'nin `chunkCount: 0`
("Aranamiyor") rozetiyle ayni desen.

⚠️ **AI'IN SESI BU MODULDE GORUNMEZ ve bu dogrudur** — modul ici AI yuzeyi yok.
Renk sinavi bu yuzden **"kabuk boyanmiyor mu"** olarak yapilir: `/app/feedback`
altindaki her sey adacayi, **kabuk ve `--ai-accent` terracotta** kalmali;
`app-shell.tsx`e **sekizinci kez dokunulmaz**.

**Koridorda onbirinci kapi** — dogrudan **CANLI**; `SOON` dizisi bos kalmaya
devam eder ve bolumun kosullu render'i (`SOON.length === 0`) hala gecerlidir.

---

### 10. Kapsam disi (bugun yapilmiyor)

| Kalem                                           | Neden bugun yok                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ⚠️ **Anket GONDERME / toplama mekanizmasi**     | ⚠️ Bir **zamanlama ve teslimat** sorusudur (e-posta gonderimi + hatirlatma + link token'i), bir veri modeli sorusu degil. Randevu'nun **hatirlatma** ertelemesiyle **ayni sinif**. v1 yalnizca **manuel / API uzerinden** kayit girisini destekler.                                              |
| ⚠️ **Genel erisime acik anket formu**           | ⚠️ **KIMLIKSIZ bir yazma yolu** demektir ve bugune kadar projede **hic yoktur**: oran sinirlamasi, spam korumasi, token yasam dongusu ve `tenant_id`nin **token'dan** cozulmesi gerekir. Her biri ayri bir karardir; ⚠️ RLS'in `SET LOCAL` zinciri kimliksiz istekte **yeniden dusunulmelidir**. |
| **NPS hesaplama / trend analizi**               | §1.3 — NPS bir **metodolojidir**; olcek degisikligi + gecmis verinin yorumu **ayri bir ADR** ister                                                                                                                                                                                               |
| **Anket tanimi (soru seti, sablon)**            | v1'de "anket" bir **varlik degil**; `feedback.surveys` ve `responses.survey_id` v2'nin dogal buyume yoludur — bugun acmak **sarkan bir kolon** uretirdi                                                                                                                                          |
| ⚠️ **Kampanyaya (11. modul) otomatik baglanti** | Hedef sema **mevcut degil** — ADR-0039'un Stok'ta verdigi ayni cevap. ⚠️ Kenari **sahip modul** yazar: kampanya geldiginde `feedback.public.ts` degil, **Kampanya'nin kendi ADR'si** karar verir                                                                                                 |
| **Yapisal katkici** (`feedback-satisfaction`)   | ⚠️ §3.4 — **reddedilmedi, KOSULLU ERTELENDI**; uc on kosul yazili                                                                                                                                                                                                                                |
| **Puan bazli gizlilik / alan bazli izin**       | ABAC, backlog (ROADMAP §1.1)                                                                                                                                                                                                                                                                     |
| **Klasik metin aramasi (FTS)**                  | ADR-0011, **onuncu** kez acik                                                                                                                                                                                                                                                                    |
| **Geri bildirime CEVAP verme / kapatma akisi**  | Bir **is akisidir** (durum makinesi, atama, SLA); bu modul **toplar**, yonetmez                                                                                                                                                                                                                  |

---

## Gerekce

**Neden bu modulun en zor karari bir SEMA karari degil, bir PLATFORM
kacinmasidir.**

Onceki dokuz modulde esik kontrolu ya kolay bir "hayir" idi (aday yoktu) ya da
bir kerelik bir "evet" (ADR-0041). Burada aday **gercekten iyi** — ve tam olarak
bu yuzden tehlikeli: iyi bir aday, bir esigi **fark edilmeden** gecirtir.
ADR-0036 kendi esik cumlesini yazarken korktugu sey buydu ve CLAUDE.md'nin
kalici dersi bunu ucuncu bir atlamadan sonra sabit madde haline getirdi.

Karari kolaylastiran sey bir tercih degil bir **eksiklik** oldu: **T2'yi olcecek
arac yok.** Bu, ADR-0042'nin kendi ilkesinin aynasidir ve iki farkli hatanin da
onune geciyor — ne "iyi gorunuyor, ekleyelim" (olcmeden esik gecmek), ne de
"riskli, hic yapmayalim" (liyakatli bir adayi gerekcesiz reddetmek).

**Neden guncelleme yok ama silme var.** Bu, projede ilk kez **veri sahipligi**
uzerinden verilen bir karar: kayit **bizim degil**. Bir baskasinin sozunu
degistirmek hafizaya yalan yazmaktir; ama ayni sebeple — kisisel veri oldugu
icin — o sozu **silebilmek zorundayiz**. ⚠️ Iki kural celiskili gorunur;
degildir: biri **icerigi** korur, digeri **kisiyi**.

**Neden yorum opsiyonel ve bedeli acikca yaziliyor.** Zorunlu bir yorum alani,
tek tikla anket veren bir isletmeyi ya modulden uzaklastirir ya da `"-"` yazmaya
iter. Bedeli — puan-only kayitlarin `/ask`te sessiz olmasi — **§3.5'te sayilir
ve denetimde olculur**; bir sinirin kaydedilmemesi, onu ileride "calismiyor"
diye okutur.

---

## Sonuclari

**Olumlu**

- Onbirinci sema **tek tablo** ile aciliyor; chunk tablosu, yapisal katkici,
  `public.ts` ve cross-modul slice'i **gerekmiyor** — soyutlamanin onuncu sinavi.
- ⚠️ Havuza **disaridan gelen ilk ses** giriyor: bugune kadar her anlati
  sirketin **kendi** yazdigi metindi.
- ⚠️ **Bayatlama penceresi olmayan ilk anlamsal modul** — `staleAfterRename`
  turu bir borc **hic dogmuyor** (§4).
- ADR-0043 Slice 1c'nin **kolon bazli grant** dersi ilk gunden uygulaniyor;
  tuzak (embedding yazan yolun kirilmasi) **once cozulmus** oluyor.
- ⚠️ Bir platform esigi **bilerek ve yazili gerekceyle** gecilmiyor; T2 kapali
  kaliyor ve yapisal kaynak **6'da** duruyor.

**Olumsuz / bedeli**

- ⚠️ **Yorumsuz geri bildirim `/ask`te GORUNMEZ** (§3.5) — modulun en buyuk
  islevsel bedeli ve Kalem A'nin en guclu karsi-argumani.
- ⚠️ **Ortalama, trend ve dusuk puan sayisi `/ask`ten sorulamaz** — yalnizca
  ekranda gorunur.
- ⚠️ **Yanlis girilen bir puan DUZELTILEMEZ, yalnizca silinip yeniden
  girilebilir** — ve silme `owner`/`admin` iznidir, yani `member` kendi hatasini
  **tek basina duzeltemez**.
- ⚠️ **Kanal gruplamasi guvenilmez** (`google`/`Google`) — serbest metnin bedeli.
- ⚠️ **Anket gonderimi olmadan modul YARIM hissedilebilir**: kullanicinin ilk
  soracagi sey _"anketi nasil gonderecegim"_ olacaktir (Randevu'nun
  hatirlatmasiyla ayni sinif) ve cevap **Queue/teslimat kararina** baglidir.
- **Retention YIRMI IKIDEN YIRMI UCE** cikar; ⚠️ **vektor tasiyan tablo sayisi
  SEKIZDEN DOKUZA** — Faz 5'te bu sayiyi **ucuncu kez** artiran modul.

---

## Degerlendirilen alternatifler

| Alternatif                                                 | Neden secilmedi                                                                                                                                                                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚠️ **Yapisal katkiciyi v1'de eklemek**                     | ⚠️ **T2'yi tetikler ve T2'nin girdisi bugun OLCULEMIYOR** (§3.3). Bir platform esigi, onu okuyacak arac yokken gecilmez. **Reddedilmedi — kosullu ertelendi** (§3.4).                                                        |
| **Yorumu ZORUNLU yapip yapisal katkiciyi gereksiz kilmak** | Sorunu cozmez, **yerini degistirir**: kullanici `"-"` yazar ve havuza **anlamsiz vektorler** girer. ADR-0033'un "sahte Genel projesi" dersi.                                                                                 |
| **Puani `knowledge.notes`a metin olarak yazmak**           | ⚠️ ADR-0031 §1'in reddi, **besinci kez**: cross-schema FK yasak oldugu icin **silme cascade'i yazilamaz** — silinen geri bildirim AI hafizasinda **yasamaya devam ederdi**. §2.2'nin KVKK gerekcesiyle **dogrudan celisir**. |
| **Chunk tablosu acmak**                                    | §1.2 — ust siniri **biz** belirliyoruz; parcalayici her zaman tek parca uretirdi.                                                                                                                                            |
| **Kaydi TAMAMEN degistirilemez yapmak** (Stok deseni)      | ⚠️ KVKK silme talebi **karsilanamazdi** (§2.2) ve yanlis giris kalici olarak hafizayi zehirlerdi.                                                                                                                            |
| **Kaydi tam duzenlenebilir yapmak** (Finans deseni)        | ⚠️ Bir ucuncu kisinin beyanini degistirmek hafizaya **yalan yazmaktir**; ayrica ortalama gecmise donuk **sessizce** degisir (ADR-0039 §3'un olcutu).                                                                         |
| **Ucret duzeltme deseni** (ADR-0044 §1: duzeltme kaydi)    | Bir maasin "yururlukteki degeri" vardir, bir geri bildirimin **yoktur** — her satir bagimsiz bir olaydir. Duzeltme kaydi burada **ikinci bir yalan satiri** olurdu.                                                          |
| **`scale` kolonunu bugun acmak** (NPS'e hazirlik)          | §1.3 — asil is kolon degil **gecmis verinin yorumu**; spekulatif kolon, on ikinci kez reddedildi.                                                                                                                            |
| **`feedback.public.ts` acmak**                             | ⚠️ ADR-0035'in kurali: **talip yokken dizin yazilmaz**. Bugun hicbir modul puan istemiyor; ⚠️ ayrica acilmamasi §6.3'un DAG kanitini **mekanik** kiliyor.                                                                    |
| **Kampanya modulune (11) bagimlilik kurmak**               | Hedef sema **mevcut degil**; kenari **sahip modul** yazar (ADR-0039'un Stok/Tedarikci dersi).                                                                                                                                |
| **Genel erisime acik form ucu**                            | §10 — **kimliksiz yazma yolu** projede hic yok; RLS zinciri, spam ve token yasam dongusu **ayri kararlardir**.                                                                                                               |

---

## Bilinen sinirlar

- ⚠️ **YAPISAL KATKICI YOK** — modul `POST /ask` havuzunda yalnizca **anlamsal**
  yarisir ve ADR-0036'nin taban garantisinden **yararlanmaz**. ⚠️ Tedarikci'nin
  ayni siniri; fark: orada aday **reddedildi**, burada **askida**.
- ⚠️ **Yorumsuz geri bildirimin `/ask`te HICBIR SESI YOK** (§3.5).
- ⚠️ **Dokuz anlamsal kaynak bes serbest yuva icin yarisiyor** — anlamsal tarafta
  taban **yoktur**, eleme **liyakattir**. Sifir alan kaynak sayisinin **ucten
  dorde** cikmasi beklenir; ⚠️ ADR-0042'nin son tetikleyicisi (_"anlamsal
  tarafta sifir alan kaynak sayisi besi gectiginde"_) bu modulle **bir adim
  yaklasiyor**.
- ⚠️ **Ortalama az kayitla YANILTICIDIR** — telafi N'in her zaman yazilmasidir
  (§9.1), istatistiksel bir esik **degil**.
- ⚠️ **Kanala gore gruplama guvenilmez** (`google`/`Google`).
- ⚠️ **Yanlis puan duzeltilemez**; yol **sil + yeniden gir** ve silme **dar** bir
  izindir.
- ⚠️ **Sarkan `crm_contact_id` temizlenmez** — **dorduncu** sarkan isaretci; CRM
  hala domain event yayinlamiyor, karar acikca **ertelenmis** durumda.
- ⚠️ **Kisi adi vektorde YOK** (§4) — _"Ahmet Bey ne demisti"_ sorusu anlamsal
  aramayla **bulunmaz**; ad yalnizca **okuma aninda** cozulur ve listede gorunur.
- ⚠️ **Anket gonderimi, hatirlatma ve genel erisime acik form YOK** (§10) —
  **en cok istenecek eksik budur.**
- ⚠️ **NPS yok, trend yok, kampanya baglantisi yok** (§10).
- ⚠️ **Geri bildirime cevap verme / kapatma akisi yok** — modul **toplar**,
  yonetmez.
- **Iyimser eszamanlilik yok** — ⚠️ ama **buyuk olcude gecersizdir**: satirin
  degistirilebilir tek kolonu `embedding`dir (§2.3).
- **`embedding`de model/surum bilgisi yok** · **arama yalnizca anlamsal**
  (ADR-0011, **onuncu** kez).
- ⚠️ **`platform/audit` bu modulde KULLANILMIYOR** ve bu **dogrudur**: izlenecek
  bir **alan degisikligi yoktur** (§2). ⚠️ Denetim izinin tek tuketicisi hala
  **IK**tir; Finans/Stok/Tedarikci'nin borclari **acik kalir**.
- ⚠️ **Retention YIRMI IKIDEN YIRMI UCE cikar** (`feedback.responses`) ve
  ⚠️ **KVKK acisindan ozel bir kalemdir**: satir **kisisel veri icerebilir**,
  yani suresi teknik degil **hukuki** bir karardir (`hr.leave_requests` ile ayni
  sinif). ⚠️ Ustelik **silme yolu ZATEN VAR** (§2.2) — retention isi bu tabloda
  yeni bir mekanizma degil, bir **politika** ister.

---

## Uygulama plani (slice'lar)

| Slice | Ne                                                                                                                                                                                                                                                                            | Migration              | Durum |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ----- |
| **0** | **ADR-0045** (bu belge) — ⚠️ **IKI PO ONAYI** (A: yapisal katkici askida · B: `retrieval.select` borcunun sirasi)                                                                                                                                                             | —                      | ⏳    |
| **1** | **Backend (TEK slice):** `feedback` semasi + tek tablo + **FORCE RLS** + ekleme/okuma/silme + embedding + `reindex` + oran siniri + izin katalogu + exception filter + ⚠️ **REVOKE UPDATE / GRANT UPDATE (embedding)** + **TEK anlamsal katkici** + cross-modul (sifir satir) | `0037_feedback_schema` | ⏳    |
| **2** | **Frontend + HAFIF kapanis denetimi:** liste + duvar (ODA, ortak duvar), `feedback` rengi, koridorda onbirinci kapi                                                                                                                                                           | —                      | ⏳    |

**Cross-modul slice'i YOK ve bu bir atlama degil** — degistirilecek bir
`public.ts` yok (§6.1).

⚠️ **YENI MIGRATION EKLEME KONTROL LISTESI (CLAUDE.md kalici dersi) — ucu de:**

1. `0037_feedback_schema.sql` **ve** `.down.sql` yazilir.
2. ⚠️ `drizzle/meta/_journal.json`a giris eklenir (`idx` sirali, `when` **artan**,
   `tag` dosya adiyla birebir) — atlanirsa `db:migrate` **"basarili" der ve
   hicbir sey uygulamaz**.
3. ⚠️ `database.integration.spec`in **geri alma listesine** eklenir.
4. **Kanit adimi:** tablonun **varligini** iddia eden bir entegrasyon testi
   (sayi saymak yetmez — sayac da journal'a baglidir ve **ayni yalani** soyler).

⚠️ **Slice 1 migration TASIR**, yani push prod'a dagitim tetikler ve
`preDeployCommand` migration uygular. **Product Owner'a push'tan once acikca
haber verilir.** Uygulanmis migration: **37 → 38**.

---

## Kapanis denetimi (Slice 2) — **HAFIF seviye**

| #   | Madde                                                                                                                                                                                                                                       | Zorunlu |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-----: |
| 1   | `git status` temiz · `pnpm verify` **cikis kodu 0** (⚠️ ciktiyi grep'lemek yasak — DEVELOPMENT_RULES 5.4)                                                                                                                                   |   ✅    |
| 2   | Rol turu: viewer **okur, yazamaz (403)** · member **yazar, silemez (403)** · owner siler **(204/200)**                                                                                                                                      |   ✅    |
| 3   | ⚠️ **DEGISTIRILEMEZLIK CANLI:** `PATCH` ucu **yok (404/405)** · ⚠️ **ham SQL ile `UPDATE feedback.responses SET rating=...` BASARISIZ** · ayni SQL `SET embedding=...` **BASARILI**                                                         |   ✅    |
| 4   | Dogrulama kapilari: `rating=0` ve `rating=6` **422** · ofsetsiz `received_at` **422** · **1251 karakter yorum 422** ve ⚠️ **hicbir kayit kirpilmadi**                                                                                       |   ✅    |
| 5   | Embedding yolu: yorumlu kayitta gecersiz `OPENAI_API_KEY` → **502 + acik govde**, ⚠️ **kayit SILINMEDI**; yorumsuz kayit **201**; `reindex` **200** + `failed: 1` → sonra **0**                                                             |   ✅    |
| 6   | Oran siniri **429** — ⚠️ ayni anda **yorumsuz kayit 201** (sayac embedding sayiyor, kayit degil)                                                                                                                                            |   ✅    |
| 7   | ⚠️ **ADR-0036 OLCUMU — ADR-0042 §4 protokoluyle:** uc farkli soru; (a) giren kaynaklar, (b) ⚠️ **her yapisal kaynagin DONDURDUGU SATIR SAYISI**, (c) ⚠️ **giren/girmeyen parcalarin SKORU**. ⚠️ Arac yoksa **"olculemedi" diye KAYDEDILIR** |   ✅    |
| 8   | ⚠️ **§3.5'IN BEDELI OLCULUR:** yorumlu bir sikayet `/ask`e **giriyor**; ayni tenant'ta **yorumsuz** bir 1 puan **hicbir cevapta gorunmuyor**                                                                                                |   ✅    |
| 9   | Fan-out **N=15** olcumu (14 → 15, anlamsal); darbogazin hala `LLMPort.complete` oldugu **kaydedilir**                                                                                                                                       |   ✅    |
| 10  | Renk turu acik **ve** koyu temada; `/app/feedback` adacayi, ⚠️ **kabuk ve `--ai-accent` terracotta**; `app-shell.tsx` `git diff` **bos**                                                                                                    |   ✅    |
| 11  | ⚠️ **YESIL BAND DORT KAPI SINAVI** (§9): dort kapinin **ikon ve etiketleri** gercekten farkli mi; aktif kapi `aria-current` tasiyor mu                                                                                                      |   ✅    |
| 12  | ODA sinavi (ADR-0038): duvar **gercekten ortak**; ⚠️ **`N = 0` iken ortalama HIC gosterilmiyor** (§9.1)                                                                                                                                     |   ✅    |
| 13  | Rota golgelemesi (ADR-0040'in dersi): `/feedback/reindex` ile `/feedback/:id` cakismiyor — gercek isteklerle (`reindex` **200**, `<UUID>` **200**, `not-a-uuid` **422**)                                                                    |   ✅    |
| 14  | Cross-modul: kisi yeniden adlandirildi → ad **aninda** yansiyor; ⚠️ `git diff -- crm.public.ts` **BOS**; silinen kisinin id'si **sarkiyor ve ekran patlamiyor**                                                                             |   ✅    |
| 15  | Belge sinavi: ROADMAP §3.5 (satir 10) · §8.5 (yirmi uc) guncellendi mi; ⚠️ ADR-0043 §5.3'un _"T2 ates alabilir"_ ongorusu **cevaplandi** mi                                                                                                 |   ✅    |

**Bilincli yapilmayacaklar (HAFIF seviye kurali):** sifirdan kurulum ❌ · iki
tenant'la tam RLS izolasyon turu ❌.

⚠️ **Prod dogrulamasi ZORUNLUDUR** — Slice 1 migration tasir. Kontroller:
health **200** · uygulanmis migration **37 → 38** · `feedback.responses`
**RLS + FORCE** · ⚠️ `businessos_app` rolunde `can_update` **kolon bazli**
(yalnizca `embedding`) · uc dar rol `feedback` semasina **kor** ·
`GET /api/v1/feedback` **401**.

---

## Bu karar ne zaman yeniden gozden gecirilir?

- ⚠️ **`retrieval.select` gozlemlenebilirlik satiri yazildiginda** (Kalem B):
  ilk olcum yapilir, satir donduren yapisal kaynak sayisi **ilk kez ogrenilir**
  ve §3.4'un ikinci on kosulu karsilanir.
- ⚠️ **Yapisal katkici yeniden gundeme geldiginde** (§3.4): sira **tersine
  cevrilemez** — arac → olcum → **ADR-0036/0042 revizyonu (ayri platform
  ADR'si)** → ancak sonra katkici.
- ⚠️ **Anket GONDERIMI istendiginde:** Queue/teslimat karari (ROADMAP §2.3 ·
  ADR-0030 §2.1) ve ⚠️ **kimliksiz yazma yolu** birlikte karara baglanir; ikisi
  de bu ADR'yi degil **yeni bir ADR'yi** ilgilendirir.
- ⚠️ **NPS istendiginde:** olcek kolonu + **gecmis verinin yorumu** — bu ADR o
  gun **genisletilmez**, uzerine yeni bir ADR yazilir (§1.3).
- ⚠️ **Anket TANIMI (soru seti) istendiginde:** `feedback.surveys` acilir ve
  `responses.survey_id` **nullable** eklenir; ⚠️ gecmis kayitlarin `null`
  kalmasi **dogrudur** ve bir goc gerektirmez.
- ⚠️ **Faz 6'nin KVKK denetiminde** (ROADMAP §8.2): yorum alani **kisisel veri
  icerebilir** — retention suresi ve silme talebi akisi orada karara baglanir.
  §2.2 bu denetimin **girdisidir**.
- **Anlamsal tarafta sifir alan kaynak sayisi besi gectiginde:** ADR-0042'nin
  son tetikleyicisi; ⚠️ bu modul o sayiyi **bir artirmaya adaydir**.
