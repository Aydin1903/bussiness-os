# 0043 — Faz 5 / Modul 9: IK / Personel

- **Durum:** Onerildi — ⚠️ **UC KALEM PRODUCT OWNER ONAYI BEKLIYOR**
- **Tarih:** 2026-08-24
- **Karar veren:** Product Owner
- **Faz:** 5

## Baglam

Faz 5'in ilk **sekiz** modulu kapandi ve prod'da canli: CRM
([ADR-0031](0031-crm-module.md) + [ADR-0032](0032-company-summary.md)) ·
Projeler ([ADR-0033](0033-projects-module.md)) · Finans
([ADR-0034](0034-finance-module.md)) · Randevu/Rezervasyon
([ADR-0035](0035-randevu-rezervasyon-modulu.md)) · Belge/Sozlesme
([ADR-0037](0037-belge-sozlesme-yonetimi.md)) · Stok/Envanter
([ADR-0039](0039-stok-envanter-modulu.md)) · Tedarikci
([ADR-0040](0040-tedarikci-yonetimi-modulu.md)) · Teklif/Fatura
([ADR-0041](0041-teklif-fatura-modulu.md)). Platform seviyesinde uc is kalici
standarttir: [ADR-0036](0036-context-retrieval-kota.md) (havuzun yapisal taban
kisiti), [ADR-0042](0042-retrieval-taban-revizyonu.md) (o kisitin olcumle
sinanmasi ve yeni tetikleyicileri) ve [ADR-0038](0038-oda-tasarim-sistemi.md)
(ODA tasarim sistemi).

ROADMAP §3.5'in **dokuzuncu** sirasi **IK / Personel**'dir. **Onuncu sema.**

### ⚠️ ROADMAP §3.5'IN KAPSAM NOTU BU ADR ILE DEGISIYOR — ve bu bir SUREC KALEMIDIR

ROADMAP §3.5 bu modul icin bir **sinir** yazmisti:

> _"IK/Personel **yalnizca** ekip listesi, rol ve iletisim bilgisi tutar.
> **Maas, bordro ve saglik verisi kapsam disidir** ve 'sonra ekleriz' diye
> planlanmamistir. (...) Genisletme talebi geldiginde **ayri bir ADR** ister."_

**Product Owner karari (2026-08-24): sinirin bilesenleri AYRISIYOR.**

| Bilesen           | ROADMAP §3.5 | Bu ADR                                                          |
| ----------------- | ------------ | --------------------------------------------------------------- |
| **Saglik verisi** | Kapsam disi  | ⚠️ **KAPSAM DISI — gerekcesi GUCLENDIRILEREK korunuyor** (§3)   |
| **Maas**          | Kapsam disi  | ⚠️ **KAPSAMA GIRIYOR — AI'dan mekanik olarak izole** (§4)       |
| **Bordro**        | Kapsam disi  | **KAPSAM DISI** (§11) — maas TUTMAK, bordro HESAPLAMAK degildir |

⚠️ **Bu ADR, ROADMAP'in kendi istedigi "ayri ADR"dir.** Ama bir kalem
**durustlukle kaydedilmelidir**, cunku ROADMAP ayni paragrafta sunu da yaziyor:

> _"Bu kapsam genislemesi §8.2'deki KVKK kontrol noktasindan **once yapilamaz**
> ve yapilirsa o kontrol noktasini **gecersiz kilar**."_

**Bu cumle ile bugunku karar CELISIYOR ve celiski gizlenmiyor.** §4.3 celiskinin
nasil cozuldugunu yaziyor — ozetle: kontrol noktasi kaldirilmiyor, **onkosula
donusturuluyor**. ⚠️ ROADMAP §3.5 ve §8.2 bu ADR kabul edilirse **guncellenmek
zorundadir**; kalem C olarak onaya sunuluyor.

### Zemin: dokuzuncu modul, neredeyse tamamen TUKETICI

| Ne                          | Tedarikci'de           | Teklif/Fatura'da            | **IK'da**                                           |
| --------------------------- | ---------------------- | --------------------------- | --------------------------------------------------- |
| `EmbeddingPort` / `LLMPort` | `shared/`'dan hazir    | ⚠️ **HIC KULLANILMADI**     | ⚠️ **HIC KULLANILMIYOR** (§5)                       |
| Chunk tablosu               | Reddedildi             | Yok (vektor yok)            | **Yok (vektor yok)**                                |
| Oran siniri                 | Bir satir deklarasyon  | ⚠️ **YOK**                  | ⚠️ **YOK**                                          |
| RLS sablonu                 | MT §12.2'den hazir     | MT §12.2'den hazir          | **MT §12.2'den hazir**                              |
| Retrieval ucu               | TEK katkici (anlamsal) | TEK katkici (yapisal)       | ⚠️ **SIFIR KATKICI — Faz 5'te ILK** (§5)            |
| Izin modeli                 | Sekizinci kez (genis)  | Dokuzuncu kez (genis)       | ⚠️ **ILK KEZ ayni modulde GENIS + DAR** (§7)        |
| Cross-modul referans        | HIC YOK                | TEK kenar, sifir yeni satir | ⚠️ **Sifir yeni satir — ve IS MODULU kenari DEGIL** |
| Denetim izi                 | Borc acik              | Kucultulerek ertelendi      | ⚠️ **ERTELENEMEZ — `platform/audit` aciliyor** (§6) |
| ODA                         | Ilk gunden             | Ilk gunden                  | **Ilk gunden**                                      |

**Gercekten yeni ALTI karar var** ve ucu digerlerinden agirdir:

1. ⚠️ **CALISAN kaydi, platformun UYELIK kaydi DEGILDIR** — ayri tablo,
   opsiyonel bag. Projede **ilk kez** "ayni sey gibi gorunen iki kayit"
   sorusudur (§2).
2. ⚠️ **SAGLIK VERISI YOK — bir asama degil bir SINIR** (§3).
3. ⚠️ **MAAS VAR, ama AI'dan MEKANIK olarak izole** (§4).
4. ⚠️ **HIC KATKICI YOK** — `/ask` havuzuna hic dokunmayan ilk is modulu (§5).
5. ⚠️ **`platform/audit` ACILIYOR** — ucuncu erteleme yapilmiyor (§6).
6. ⚠️ **Izin katalogu ILK KEZ ayni modulde hem GENIS hem DAR** (§7).

---

## ⚠️ PRODUCT OWNER ONAYINA SUNULAN UC KALEM

Bu ADR uygulanmadan once **uc ayri onay** gerekiyor. Ucu de ayri ayri
reddedilebilir; reddedilirse ADR'nin geri kalani ayakta kalir.

### Kalem A — ⚠️ `platform/audit` aciliyor (PLATFORM KARARI)

**Bu bir modul karari DEGILDIR.** `platform/audit` ARCHITECTURE §6.2'de yazili
bir platform moduludur ("Degismez denetim kaydi") ve acildigi gun **butun
modullerin** kullanabilecegi bir mekanizma olur. Bir is modulunun ADR'si boyle
bir karari **tek basina veremez** — ADR-0042'nin cumlesi burada da gecerlidir:

> _"Bir platform karari, onu degistirmesi gereken **veriye sahip olmadan**
> revize edilmez."_

⚠️ Fark su: **burada veri var.** Borc uc kez ertelendi (ADR-0034 → ADR-0039 /
ADR-0040 → ADR-0041) ve ADR-0041 §8.3 dorduncusunun bir **karar** olacagini
acikca yazdi. §6 oneriyi, kapsamini ve **reddedilme secenegini** ayrintisiyla
veriyor.

**Onay verilirse:** Slice 1 `platform/audit`i acar (migration `0032`). ⚠️ Bu,
Mutlak Kural 1'e **bilincli bir istisnadir** — tek is icinde bir platform
modulu ve bir is modulu birlikte acilir. Emsali vardir: ADR-0031'in isinde
Context Engine platforma yukselmisti.

**Onay verilmezse:** §6.9'un geri dusus plani uygulanir ve borc **dorduncu kez**
ertelenmis olur. ⚠️ O gun kaydedilecek cumle "erteledik" degil **"IK modulunde
DE erteledik"**tir — ve KVKK'nin veri isleme kaydi yukumlulugu bu modulde
teoriden cikip **gercek** olur.

### Kalem B — ⚠️ Maas verisi kapsama giriyor

ROADMAP §3.5'in yazili sinirini degistirir. §4 gerekceyi, izolasyonun **uc
katmanini** ve **Faz 6 KVKK denetiminin onkosul haline getirilmesini** yaziyor.

### Kalem C — ⚠️ ROADMAP §3.5 ve §8.2 guncellenir

A ve B onaylanirsa ROADMAP'in iki paragrafi **yanlis** hale gelir. Belgeyi
oldugu gibi birakmak, ADR-0040'in kapanis denetiminin buldugu turden bir
**belge hatasi** uretir. ⚠️ Fark su: ADR-0040'inki borcu **oldugundan buyuk**
gosteriyordu; bu, bir sinirin **hala yururlukte oldugunu** gosterirdi — yani
daha tehlikelidir. Guncelleme metni § Uygulama planinda.

---

## Karar

### 1. Yeni `hr` semasi — IKI tablo

Onuncu sema. ⚠️ **Anahtar `hr`**: sema, modul klasoru, rota (`/app/hr`) ve
`data-module` **ayni kelime** (ADR-0035'in `booking` → `appointments` dersi,
dokuzuncu kez uygulaniyor).

#### 1.1 `hr.employees` — calisanin KENDISI

| Kolon                | Tip             | Not                                                  |
| -------------------- | --------------- | ---------------------------------------------------- |
| `id`                 | `uuid` PK       | UUIDv7 (`shared/uuid-v7`)                            |
| `tenant_id`          | `uuid` NOT NULL | RLS ekseni                                           |
| `full_name`          | `text` NOT NULL | ⚠️ Tek alan — `first_name`/`last_name` DEGIL (§1.6)  |
| `job_title`          | `text` NULL     | ⚠️ Serbest metin. ⚠️ **`role` DEGIL** (§1.3)         |
| `work_email`         | `text` NULL     | ⚠️ **IS** e-postasi (§3.5)                           |
| `work_phone`         | `text` NULL     | ⚠️ **IS** telefonu (§3.5)                            |
| `employment_status`  | `text` NOT NULL | `active` \| `ended` — CHECK ile                      |
| `started_on`         | `date` NULL     | Ise baslama                                          |
| `ended_on`           | `date` NULL     | `status = 'ended'` ise NOT NULL (CHECK)              |
| `platform_user_id`   | `uuid` NULL     | ⚠️ Opsiyonel bag — **FK YOK** (Mutlak Kural 5), §2.5 |
| `created_by_user_id` | `uuid` NOT NULL | Sekiz modulde de var                                 |
| `created_at`         | `timestamptz`   |                                                      |
| `updated_at`         | `timestamptz`   |                                                      |

> #### ⚠️ SERBEST NOT ALANI YOK — modulun EN BILINCLI eksigi
>
> Sekiz modulun sekizinde bir `notes` / `description` alani var. Burada **yok**,
> cunku bir IK kaydindaki serbest metin alanina **ilk yazilacak sey saglik
> bilgisidir** (_"raporlu"_, _"ameliyat sonrasi yarim gun"_, _"kronik
> rahatsizligi var"_).
>
> §3'un sinirini koyup yaninda bos bir metin kutusu birakmak, siniri
> **kullaniciya ihlal ettirmek** olurdu — ve o veri sisteme girdigi an §3'un
> butun hukuki gerekcesi devreye girer, **hicbir kontrol olmadan**. ⚠️ Hata
> **sessizdir**: hicbir test kirmizi yanmaz, hicbir lint uyarmaz, ekran calisir.

⚠️ **Benzersizlik:** `UNIQUE (tenant_id, platform_user_id) WHERE
platform_user_id IS NOT NULL` — kismi indeks. Bir platform kullanicisi **en
fazla bir** calisan kaydina baglanir; olmasaydi iki calisan satiri ayni hesabi
sahiplenir ve _"bu kullanici kim"_ sorusunun **iki cevabi** olurdu.

#### 1.2 `hr.compensation_records` — EKLEME-YALNIZ ucret defteri

| Kolon                 | Tip                | Not                                                       |
| --------------------- | ------------------ | --------------------------------------------------------- |
| `id`                  | `uuid` PK          |                                                           |
| `tenant_id`           | `uuid` NOT NULL    | RLS ekseni                                                |
| `employee_id`         | `uuid` NOT NULL    | FK → `hr.employees` **ON DELETE RESTRICT** (§1.4)         |
| `amount`              | `numeric(18, 2)`   | ⚠️ ADR-0034: TS tarafinda **asla `number` degil**         |
| `currency`            | `char(3)` NOT NULL | ⚠️ Yalnizca sekil (`^[A-Z]{3}$`); kod listesi dogrulanmaz |
| `period`              | `text` NOT NULL    | `monthly` \| `hourly` \| `annual` — CHECK                 |
| `effective_from`      | `date` NOT NULL    | ⚠️ GELECEK tarihli olabilir (§1.5)                        |
| `recorded_by_user_id` | `uuid` NOT NULL    | ⚠️ Denetim izinin **maas tarafini KAPATAN** kolon (§6.2)  |
| `recorded_at`         | `timestamptz`      |                                                           |

⚠️ **`UNIQUE (employee_id, effective_from)`** — ayni calisan icin ayni gune iki
kayit yazilamaz. Olmasaydi _"bugunku maas"_ sorusunun **iki cevabi** olurdu ve
kazanani kararli siralama belirlerdi; hata **sessiz** olurdu.

> #### ⚠️ DEFTER DEGISTIRILEMEZ — ve gerekce UCUNCU KEZ FARKLI
>
> `update` metodu **yok**, `compensation:delete` izni **yok**, `DELETE` ucu
> **yok**. Projede ucuncu kez ayni sekil, ama **ucuncu bir gerekceyle**:
>
> | Modul                         | Neden degistirilemez                                                         |
> | ----------------------------- | ---------------------------------------------------------------------------- |
> | `inventory.movements`         | **Bugunku miktar** ondan turetilir; gecmisi degistirmek bugunu yeniden yazar |
> | `suppliers.interactions`      | Olmus bir gorusme "degismis" olmaz — turetilen sayi yok                      |
> | **`hr.compensation_records`** | ⚠️ **Defterin degistirilemezligi DENETIM IZININ TA KENDISIDIR** (§6.2)       |
>
> Ucuncusu yenidir: burada degistirilemezlik bir **veri butunlugu** tedbiri
> degil, bir **hesap verebilirlik** mekanizmasidir. _"Maasi kim, ne zaman
> degistirdi"_ sorusu, degisikligin **kendisi bir satir oldugu** icin
> cevaplanir — ayri bir denetim altyapisina ihtiyac duymadan.

⚠️ **NOT ALANI BURADA DA YOK.** _"Zam gerekcesi"_ mesru gorunur; ilk yazilacak
sey yine bir saglik ya da aile durumu olur (§1.1'in ayni gerekcesi).

#### 1.3 ⚠️ `job_title` — `role` KELIMESI SEMADA KULLANILMAZ

Bu projede `role` **tek bir sey** demektir: `owner` · `admin` · `member` ·
`viewer` (MT §7.5, ADR-0025). Bir IK kaydindaki "rol/unvan" ise
_"Kidemli Muhasebe Uzmani"_dir — **yetki degil, is tanimi**.

⚠️ Ikisi ayni kelimeyle adlandirilsaydi hata **sessiz ve tehlikeli** olurdu:
bir gun birisi `employees.role`'a bakip **yetki karari** verir, ya da
`memberships.role`u ekranda **"unvan"** diye gosterirdi. Ikisi de bir tip
hatasi uretmez.

→ Kolon adi **`job_title`**, arayuz etiketi **"Unvan"**, tip **serbest metin**.
Enum degil: her sirketin unvan seti farklidir. Tenant-tanimli bir sozluk
(ADR-0034 §4'un deseni) burada bir **soruyu cevaplamiyor** — yalnizca yazim
birligi saglardi; v2.

#### 1.4 Silme: `ON DELETE RESTRICT` — ve `ended` ile karistirilmamali

- Isten ayrilan calisan **silinmez**: `employment_status = 'ended'`. Kayit
  durur — gecmis ekip bilgisi kurumsal hafizadir ve bir kismi **yasal saklama**
  kapsamindadir.
- `employee:delete` **yalnizca hata duzeltmesi** icindir (yanlis acilan kayit).
  ⚠️ ADR-0041'in "silinebilen tek sey taslaktir" ayrimiyla ayni sinif.
- ⚠️ **Ucret kaydi olan calisan SILINEMEZ** (`RESTRICT` → 409). Silinebilseydi
  `CASCADE` ucret gecmisini de goturur ve §6.2'nin denetim cevabi **sessizce**
  yok olurdu. ADR-0039'un `movements → items RESTRICT`i ile ayni sekil, farkli
  gerekce: orada **bugunku sayi** korunuyordu, burada **gecmisin kendisi**.

#### 1.5 ⚠️ GUNCEL MAAS TURETILIR — kolon YOK (onuncu kez ayni karar)

`employees`te maas kolonu **yoktur**. Guncel ucret:

```
effective_from <= CURRENT_DATE olan kayitlar arasinda
effective_from DESC, ilk satir
```

Projede **onuncu** kez ayni karar (`finance.balances` reddi · `ends_at` reddi ·
`inventory.items`ta miktar kolonunun reddi · durgunlugun turetilmesi …).
Gerekce degismedi ve **hatanin seklidir**: kolonda bozulma _sessiz ve makul
gorunen yanlis bir sayi_; turetmede _olculebilir yavaslik_.

⚠️ **Bedel Stok'takinden KUCUKTUR ve olculmesine gerek yok**: bir calisanin
ucret kaydi **yilda bir-iki** artar; `inventory.movements` gibi sinirsiz
buyumez. ADR-0039'un 5000 hareketlik olcumu (4–5 ms) burada **ust sinirin cok
uzagindadir**.

⚠️ **GELECEK TARIHLI KAYIT MESRUDUR** — gelecek ayin zammi bugunden yazilir ve
`<= CURRENT_DATE` kisiti tam olarak bunun icindir. Kisit unutulursa gelecek
tarihli bir zam **bugun yururlukteymis gibi** okunur; hata **sessizdir**.

#### 1.6 `full_name` TEK ALAN

`first_name` / `last_name` ayrimi bir **kultur varsayimidir** ve global bir
urunun cekirdegine konulamaz (tek adli, uc soyadli, sirali-ters yazilan adlar).
Ayrica bu projede ad zaten tek alan olarak yasiyor (`crm.contacts`,
`suppliers.contacts`). ⚠️ Bedel: **soyada gore siralama yapilamaz**.

#### 1.7 RLS ve migration

Iki tablo da **RLS + FORCE** (MT §12.2 sablonu, onuncu kez). Migration
**`0033_hr_schema`** — tek migration.

⚠️ CLAUDE.md'nin **YENI MIGRATION EKLEME KONTROL LISTESI** uc adimiyla
uygulanir: (1) `.sql` + `.down.sql`, (2) **`_journal.json` girisi**,
(3) `database.integration.spec` geri alma listesi (bagimli tablo ebeveyninden
**once**: `compensation_records` → `employees`). Ek olarak **varlik iddiasi**
testi yazilir (`hr-schema.integration.spec`) — sayi saymak yetmez.

---

### 2. ⚠️ CALISAN ≠ UYELIK — AYRI KAYIT, opsiyonel BAG

**Soru:** `hr.employees` ile `platform.memberships` ayni sey mi?

**Karar: AYRI.** `hr.employees` kendi kaydidir; `platform_user_id` **opsiyonel,
nullable ve dogrulanan** bir bagdir. ⚠️ **Iki kayit senkron tutulmaya
CALISILMAZ.**

Bu, projede ilk kez ortaya cikan bir sorudur ve verilen cevap **onuncu modulu
degil, urunun tamamini** ilgilendirir: "kim bu sirkette calisiyor" ile "kimin
sisteme girisi var" **iki ayri sorudur**.

#### 2.1 Kumeler IKI YONDE DE ayrisiyor — ve ikisi de gercek

| Durum                                                       | Uyelik | Calisan |
| ----------------------------------------------------------- | :----: | :-----: |
| Depo gorevlisi, saha ekibi, sistemi hic kullanmayan calisan |   ❌   |   ✅    |
| Dis mali musavir, ajans, danisman, denetci                  |   ✅   |   ❌    |
| Ofis calisani                                               |   ✅   |   ✅    |
| Isten ayrilmis calisan (erisimi kesilmis, kaydi duran)      |   ❌   |   ✅    |

⚠️ **Ikisi ayni kayit olsaydi ilk iki satir TEMSIL EDILEMEZDI.** Depo
gorevlisini IK listesine sokmak icin ona bir platform hesabi acmak gerekirdi —
yani **veri modeli, sirketi lisans satin almaya zorlardi**. Dis musavire
"calisan" demek ise IK listesini **yanlis** yapardi.

#### 2.2 Yasam donguleri ayrisiyor — ve ters yonde

Bir calisan istan ayrildiginda **uyeligi derhal kesilmelidir** (guvenlik), ama
**IK kaydi durmalidir** (kurumsal hafiza + yasal saklama). Tek kayit olsaydi bu
ikisi ayni satirin ayni kolonuna baglanirdi ve biri digerini **ezerdi**:

- Uyelik silinince IK kaydi giderdi → gecmis ekip bilgisi **kaybolurdu**.
- IK kaydi durdugu icin uyelik durdurulsaydi → ayrilan calisanin **erisimi
  acik kalirdi**. ⚠️ Bu ikincisi bir **guvenlik acigidir**.

#### 2.3 ⚠️ PLATFORM ZATEN ADI VE ILETISIMI VERMIYOR — ve bu KASITLI

Bu, kararin **en somut** dayanagidir ve bir varsayim degil, koddaki bir
gercektir.

`identity.public.ts` Identity'nin disa acik **tek** yuzeyidir ve dosyanin kendi
yorumu sunu yaziyor:

> _"YALNIZCA `emailVerified` acilir. E-posta, ad, durum, parola bilgisi veya
> listeleme YOKTUR. (...) Genis bir kullanici DTO'su acmak, kimlik verisini
> modul sinirinin disina sizdiran ilk adim olurdu."_

`GET /api/v1/memberships` (Tenant modulu, `member:read`) ise sunlari doner:
`userId` · `role` · `status` · `joinedAt`. ⚠️ **Ad yok, e-posta yok, telefon
yok.**

Yani: **platformda bugun bir calisanin ADINI verebilecek hicbir yuzey yoktur.**
"Uyelikten turet" secenegi, once `identity.public.ts`i **genisletmeyi**
gerektirirdi — yani o dosyanin yazili olarak reddettigi seyi yapmayi.

⚠️ Bu tek basina belirleyicidir: IK'nin ihtiyaci **ad ve iletisim**dir; platform
onlari tanimi geregi vermez ve **vermemelidir**.

#### 2.4 ⚠️ "IKI KOLON SENKRON KALMALI" riski — projenin kendi dersi

Senkron tutma denemesi (uyelik acilinca calisan kaydi ac, ad degisince ote
tarafi guncelle) bu projenin **defalarca reddettigi** sekildir: ADR-0033 §4'un
`last_activity_at` reddi, ADR-0034 §5'in isaretli tutar reddi, ADR-0039'un
miktar kolonu reddi. Hepsinde ayni cumle:

> **Bir tazeleme yolu unutulunca hata SESSIZDIR.**

Burada sessiz hatanin sekli daha da kotudur: IK listesi **eksik bir ekip**
gosterir ya da **ayrilmis birini** calisiyor gosterir — ve bunun bir tip hatasi,
bir 500, bir kirmizi test karsiligi **yoktur**.

#### 2.5 Bagin dogrulanmasi — ve ⚠️ `tenant.public.ts` TEK SATIR DEGISMEZ

`platform_user_id` yazilirken **dogrulanir**: verilen id, **mevcut tenant'in
aktif bir uyesi** olmalidir. Degilse `EmployeeUserNotMemberError` → **422**.

⚠️ **Bunun icin YENI BIR SEY YAZILMIYOR.** Projeler modulu tam olarak bu
kontrolu zaten yapiyor (`task.use-cases.ts`, `TaskAssigneeNotMemberError`) ve
`tenant.public.ts`in `TenantAccessQuery.resolveMemberAccess`ini kullaniyor. IK
**ayni yuzeyi ayni sekilde** tuketir.

Bu, ADR-0037 §4.1'in kuralinin **ucuncu kez talip tarafindan** dogrulanmasidir:

> _"Yeni TALIP → dosya degismez; yeni KAYNAK TURU → sahibi modul kendi dizinini
> yazar."_

⚠️ **Izin kapisi burada GEREKMEZ ve bu bir istisna degil, kuralin dogru
okunmasidir.** ADR-0033'un izin kapisi (`company:read`) **ADLARI** sizdirmamak
icin vardi. `resolveMemberAccess` **hicbir ad dondurmez** — elinizde zaten olan
bir uuid icin **evet/hayir** doner. Sizacak bilgi yoktur. Ustelik bagi yazan
kisi zaten `employee:write` tasir (owner/admin) ve `member:read` de ayni iki
roldedir — kumeler **cakisiyor**.

⚠️ **Sarkan isaretci TOLERE EDILIR** — besinci kez (`crm_contact_id`,
`company_id`, `project_id`, `crm_contact_id`, simdi `platform_user_id`). Ama
**anlami burada farklidir ve daha iyidir**: uyeligi iptal edilmis bir
kullaniciya isaret eden IK kaydi bir **bozulma degil, dogru durumdur** —
ayrilan calisanin erisimi kesilmis, kaydi durmaktadir (§2.2). Okuyan her yol
buna dayanikli yazilir: bag cozulemezse ekran _"platform hesabi yok / pasif"_
der, **patlamaz**.

#### 2.6 ⚠️ IKI ROSTER UCU VAR — ve karistirilmalari yasak

| Uc                     | Soru                           | Izin            | Roller       |
| ---------------------- | ------------------------------ | --------------- | ------------ |
| `GET /v1/memberships`  | _"Kimin sisteme ERISIMI var?"_ | `member:read`   | owner, admin |
| `GET /v1/hr/employees` | _"Sirkette kim CALISIYOR?"_    | `employee:read` | dort rol de  |

⚠️ **Hicbiri digerinden turetilemez** (§2.1) ve ikisi **farkli izin
tasir** (§7.2). Bu ayrim `docs/architecture/` altina degil, iki controller'in
kendi yorumuna yazilir — okuyan kisi ikisini yan yana gormez, birini gorur.

---

### 3. ⚠️ SAGLIK VERISI YOK — bir asama degil, bir SINIR

**Kapsam disidir ve "sonra ekleriz" diye planlanmamistir.** Tartismaya
acilmaz; talep geldiginde **ayri bir ADR** ve §3.4'un onkosullari gerekir.

#### 3.1 Hukuki gerekce

Saglik verisi KVKK m.6'nin **ozel nitelikli kisisel veri** kategorisindedir.
Genel kural: ozel nitelikli veri **acik riza olmaksizin islenemez**. Saglik
verisi icin taninan istisna **dardir** ve amac + isleyen kisi bakimindan
sinirlidir — koruyucu hekimlik, tibbi teshis, tedavi ve bakim hizmetlerinin
yurutulmesi, saglik hizmetlerinin planlanmasi ve finansmani gibi amaclarla,
**sir saklama yukumlulugu altindaki kisiler veya yetkili kurum ve kuruluslar**
tarafindan.

**Genel bir IK modulu bu istisnaya girmez.** Yazilim, sir saklama
yukumlulugu altindaki bir saglik meslek mensubu degildir; amac da tibbi
degildir.

Dolayisiyla gereken sey **her calisandan acik riza** ve Kisisel Verileri Koruma
Kurulu'nun **2018/10 sayili kararindaki zorunlu ek onlemlerdir**: ayri bir
politika ve prosedur, erisen personel icin gizlilik taahhudu ve egitim,
yetkilerin kapsam/sure bazinda tanimlanmasi ve **ayri erisim kayitlari**,
elektronik ortamda **kriptografik yontemler ve ayri anahtar yonetimi**, uzaktan
erisimde **iki kademeli kimlik dogrulama**, aktarimda sifreli kanal.

#### 3.2 ⚠️ MEVZUAT 2024'TE DEGISTI — ve bu, ertelemeyi ZAYIFLATMIYOR, GUCLENDIRIYOR

Durustluk kurali geregi kaydedilir: 7499 sayili Kanun'la KVKK m.6'nin isleme
sartlari **genisletildi** ve istihdam ile **is sagligi ve guvenligi**
alanindaki yukumluluklerin yerine getirilmesi de sayildi. Yani _"saglik verisi
hicbir kosulda islenemez"_ demek **bugun dogru degildir**.

⚠️ **Ama sonuc degismiyor, hatta netlesiyor** — cunku o istisna da **belirli bir
hukuki yukumluluge** baglidir (ISG mevzuati, isyeri hekimi, ise giris/periyodik
muayene) ve o cerceve icinde **sir saklama yukumlulugu altindaki kisiler**
tarafindan islenir. **Genel amacli bir "calisan notu" alani bu tanima girmez.**
Ustelik istisna kapsaminda islense bile **2018/10'un ek onlemleri kalkmaz**.

⚠️ Ikinci bir hukuki kirilganlik kayda geciriliyor: **is iliskisinde acik
rizanin "ozgur iradeye dayandigi" tartismalidir** (bagimlilik iliskisi). Yani
"calisandan riza aliriz" cozumu, hukuken en zayif ayaktir.

⚠️ **Bu ADR hukuki mutalaa vermez.** Nihai degerlendirme ROADMAP §8.2'nin KVKK
kontrol noktasina ve hukuk danismanina aittir. Buradaki kayit **muhendislik
kararinin gerekcesidir**: elimizdeki bilgiyle bu veri **bugun sisteme
girmemelidir**.

#### 3.3 ⚠️ AI'DAN IZOLE ETMEK BU SORUNU COZMEZ

Bu, en kolay yanilgidir ve acikca reddedilir: §4'un maas icin kurdugu izolasyon
**saglik verisi icin YETMEZ**.

Sebep: 2018/10'un yukumlulukleri verinin **saklanmasina ve erisilmesine**
baglidir, **AI'a gidip gitmedigine** degil. Sifreleme, ayri erisim logu, iki
kademeli kimlik dogrulama ve ayri politika, veri veritabaninda **durdugu icin**
gerekir. AI'dan izole edilmis, sifresiz, ayri erisim logu olmayan bir saglik
alani **tam olarak ihlalin kendisidir**.

#### 3.4 v2 — ve onkosullari yazili

Saglik verisi ancak su ucu birlikte saglandiginda tartisilir:

1. ROADMAP §8.2'nin **KVKK kontrol noktasi tamamlanmis** olmali,
2. **Ayri bir ADR** yazilmali (alan bazli sifreleme, ayri erisim logu, 2FA
   zorlamasi, ayri politika — hepsi kendi kararlariyla),
3. ⚠️ Bu kalemler **bu modulun ici degil, PLATFORM isidir** (sifreleme ve 2FA
   `platform`/`infrastructure` katmanindadir) — yani "IK'ya bir kolon eklemek"
   olarak planlanamaz.

#### 3.5 ⚠️ SOMUT OLARAK NE YAZILMAYACAK

Sinir bir cumle degil, bir **liste** olarak yazilir; aksi halde "saglik verisi"
ifadesi yorumlanir:

| Yazilmaz                                                 | Neden                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Rapor, izin sebebi, saglik durumu, engellilik            | ⚠️ §3 — ozel nitelikli                                                                       |
| Kan grubu, ilac, alerji, muayene kaydi                   | ⚠️ §3 — ozel nitelikli                                                                       |
| Din, sendika uyeligi, ceza mahkumiyeti, biyometrik       | ⚠️ Diger ozel nitelikli kategoriler — ayni sinir                                             |
| **TC kimlik numarasi**                                   | Ozel nitelikli **degil**, ama kendi ek onlem rejimi var; v1'de hicbir ozelligin ihtiyaci yok |
| Ev adresi, ozel telefon, dogum tarihi, acil durum kisisi | v1'de hicbir ozelligin ihtiyaci yok; KVKK envanterini bugunden buyutur                       |
| Aile durumu, medeni hal, cocuk sayisi                    | Bordro/tesvik hesabinin girdisi — **bordro kapsam disi** (§11)                               |

⚠️ **Olcut acik: bir alan, v1'in bir ozelliginin CALISMASI icin gerekli
degilse yazilmaz.** "Ileride lazim olur" bir gerekce degildir — KVKK'nin veri
minimizasyonu ilkesiyle de dogrudan celisir.

⚠️ **`work_email` / `work_phone` adlari da bu yuzden nitelenmistir** (§1.1):
`email` denseydi arayuz bir gun kisisel e-postayi kabul ederdi ve fark
**gorulmezdi**.

---

### 4. ⚠️ MAAS KAPSAMA GIRIYOR — AI'DAN MEKANIK OLARAK IZOLE

**Karar (Product Owner, kalem B): maas alani semada olacak; hicbir
`RetrievalContributor`a baglanmayacak.** `POST /ask`e **hic gorunmeyecek**,
embedding'e ve LLM'e **hic gitmeyecek**; yalnizca veritabaninda kayit ve
yalnizca dar bir izinle okunur bir uc.

#### 4.1 Neden saglik verisinden FARKLI

| Ozellik                         | Saglik verisi                       | Maas                                  |
| ------------------------------- | ----------------------------------- | ------------------------------------- |
| KVKK m.6 ozel nitelikli listesi | ⚠️ **Icinde**                       | **Icinde DEGIL**                      |
| Isleme sarti                    | Acik riza / dar istisna             | Genel isleme sartlari (is sozlesmesi) |
| Kurul 2018/10 ek onlemleri      | ⚠️ **Zorunlu**                      | **Zorunlu degil**                     |
| Gereken guvenlik                | Alan bazli sifreleme, ayri log, 2FA | ⚠️ **Standart guvenlik yeterli**      |

Maas, is sozlesmesinin **kurucu unsurudur**; her isveren tutar, her bordro
sisteminde vardir. Hassastir — ama **hassas** ile **ozel nitelikli** ayri
kategorilerdir ve bu ADR ikisini karistirmaz.

⚠️ **Hassasiyetin karsiligi burada sifreleme degil, DAR IZIN + IZOLASYONDUR**
(§4.2, §7.1).

#### 4.2 Izolasyonun UC KATMANI — ve ucu de testle kilitlenir

Bir kural yazmak yetmez: _"katkiciya baglamayin"_ cumlesi bir yorumdur ve
yorumlar **derlenmez**.

| #   | Katman                                                                     | Neyi engeller                                                                                |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | ⚠️ **AYRI TABLO** (`compensation_records`) — `employees`te maas kolonu YOK | Bir `SELECT *`in ya da bir liste projeksiyonunun maasi **yanlislikla** tasimasini            |
| 2   | ⚠️ **AYRI IZIN** (`compensation:read`, owner + admin)                      | Calisan listesini gorebilen herkesin maasi gormesini                                         |
| 3   | ⚠️ **KATKICI YOKLUGU** (§5) — `hr` icin kayitli **hicbir** katkici yok     | Verinin `/ask` havuzuna, embedding'e ya da LLM prompt'una **herhangi bir yoldan** ulasmasini |

**Uc test bunlari kilitler:**

1. `hr.employees` liste ve detay cevabinin sozlesmesinde **maas alani yok**
   (birim testi — bir gun eklenirse **kirmizi yanar**).
2. `POST /v1/hr/employees` cevabi ve `GET` listesi `compensation:read` tasiyan
   bir kullanici icin **de** maas dondurmez — maas **yalnizca** kendi ucundan
   gelir (entegrasyon testi).
3. ⚠️ **Contributor registry testi:** `hr` onekli **hicbir kaynak kayitli
   degil** (§5.6). Bu test, izolasyonun **tek mekanik bekcisidir** — bir gun
   birisi "ekip ozeti" katkicisi eklerse test **kirmizi yanar ve bu ADR'yi
   okumaya zorlar**.

⚠️ **Liste ucunda maasa gore SIRALAMA ve FILTRELEME de YOKTUR.** Bir deger
donmese bile `?sort=salary` siralamanin kendisiyle **maas bilgisini sizdirir**
— iki istekle butun ekibin ucret siralamasi cikarilirdi. Hata **sessiz**
olurdu: hicbir alan gorunmez, bilgi yine de akar.

#### 4.3 ⚠️ FAZ 6'NIN KVKK DENETIMI BIR ONKOSULDUR — kaldirilmis degil

ROADMAP §3.5'in _"kontrol noktasindan once yapilamaz"_ cumlesi (bkz. Baglam)
ile bugunku karar celisiyor. Celiski **su sekilde cozuluyor** ve bu, kalem
B'nin ayrilmaz parcasidir:

> ⚠️ **Maas alani, GERCEK MUSTERI VERISIYLE kullanilmadan once ROADMAP §8.2'nin
> planli KVKK denetiminden GECMEK ZORUNDADIR.** Kontrol noktasi kaldirilmiyor;
> bu alan icin bir **cikis kapisina** donusuyor.

Somut kilit: ⚠️ **Faz 6'nin kapi kosuluna bir madde eklenir** — _"IK maas alani
KVKK denetiminden gecti mi?"_ Gecmediyse Faz 6 baslamaz. Denetimin bakacagi
sey yazili: isleme amaci ve hukuki sebep, erisim rejimi (§7.1), saklama suresi
(§ Bilinen sinirlar), silme hakki ile yasal saklama yukumlulugunun catismasi ve
§4.2'nin uc katmaninin **hala** ayakta oldugu.

⚠️ Bu, ROADMAP §8.2'nin kendi uyarisiyla **ayni yonde**dir: _"kontrol noktasi
veri girmeden once gerekir ve veri simdi giriyor."_

#### 4.4 Para: ADR-0034'un kurallari aynen

- `numeric` saklanir; TS tarafinda **asla `number`** olmaz. Sunucunun kanonik
  dizesi oldugu gibi yazilir (**binlik ayraci yok** — ADR-0034 §7'nin ayni
  gerekcesi).
- **Kur cevrimi yok.** Farkli para birimleri **toplanmaz**.
- ⚠️ **"Toplam maas gideri" diye bir rakam BULUNMAZ** ve iki bagimsiz sebebi
  var: (a) para birimleri toplanmaz (ADR-0034 §5 · ADR-0039 §4'un ucuncu
  tekrari), (b) o rakam bir **ozet uzerinden maas sizdirma** yoludur — uc
  kisilik bir ekipte toplam, tek tek maaslara neredeyse esittir. ⚠️ Odanin
  kahraman rakami bu yuzden **aktif calisan sayisidir** (§10).

---

### 5. ⚠️ HIC KATKICI YOK — `/ask` havuzuna dokunmayan ILK is modulu

Faz 5'in sekiz modulunun sekizi de en az bir `RetrievalContributor` kaydetti.
**IK sifir kaydeder.** Bu bir atlama degil, uc ayri gerekcenin ayni yere
cikmasidir.

#### 5.1 ANLAMSAL katkici yok — ortada anlatisal icerik YOK

Anlamsal katkicinin girdisi **anlatidir**: gorusme notu (CRM, Tedarikci),
ilerleme notu (Projeler), finansal yorum (Finans), servis notu (Randevu), belge
metni (Belge), kalem notu (Stok).

IK v1'de **hicbir anlati yoktur** ve bu §1.1'in **dogrudan sonucudur**: serbest
not alani bilincli olarak **acilmadi**. Embed edilecek metin yok; `full_name` +
`job_title` bir **kayit**tir, bir anlati degil.

⚠️ ADR-0041'in aynasi: orada da anlamsal katkici yoktu, ama sebebi farkliydi
(satir kalemleri **cok ve neredeyse ozdes** oldugu icin havuzu kirletirdi).
Burada sebep daha basit: **icerik yok**.

#### 5.2 YAPISAL katkici yok — "KATALOG, OLGU DEGIL"

Uc aday degerlendirildi, ucu de reddedildi. ⚠️ ADR-0040 §3'un yaptigi gibi
**acikca kaydediliyor**: "eklemedik" degil, **"bakildi ve yoktu"**.

| Aday                        | Ne donerdi                        | Neden reddedildi                                                                                                                                                                                         |
| --------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _"Ekip ozeti"_              | _"12 aktif calisan, 3 unvan"_     | ⚠️ Bir **SAYIM**dir, haber degil. ADR-0040'in "durgun tedarikci" reddi ile ayni: her cevapta bir **taban yuvasi isgal eder** ve soyleyecek yeni bir seyi olmaz.                                          |
| _"Yeni katilan / ayrilan"_  | _"Bu ay 1 katilim, 1 ayrilis"_    | Gercekten bir **olay**, ama **cok seyrek**: kucuk bir sirkette ayda sifir satir doner. ⚠️ Sifir donen kaynak icin taban zaten yuva ayirmaz (ADR-0036 §2 `min(...)`) — yani kazanci yok, T2 maliyeti var. |
| _"Bos unvan / eksik kayit"_ | _"3 calisanin unvani girilmemis"_ | Bir **veri kalitesi uyarisidir**, is gercegi degil. Kurumsal hafizaya degil, ekrandaki bir rozete aittir.                                                                                                |

⚠️ **Ortak olcut ADR-0040'indir:** _"baglantinin bir FIILI yok — katalog, olgu
degil."_ Bir ekip listesi tam olarak bir **katalogdur**; degistigi gun bir olay
olur, ama katalogun kendisi bir olay degildir.

#### 5.3 ⚠️ ADR-0036 / ADR-0042 ESIK KONTROLU — dort soru (SABIT MADDE)

CLAUDE.md'nin kalici dersi geregi bu madde **atlanmaz** ve cevap "hayir" olsa
bile **yazilir**.

| #   | Soru                                                                  | Cevap                                                                                                                                             |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Bu modul **yapisal** bir katkici ekliyor mu?                          | ⚠️ **HAYIR** (§5.2 — uc aday degerlendirildi, ucu de reddedildi)                                                                                  |
| 2   | Satir donduren yapisal kaynak sayisi kaca cikiyor?                    | **6 → 6.** Degismiyor. (Kayitli yapisal kaynak 6; ⚠️ **satir donduren** sayi hala **olculmedi** — ADR-0042 § Verinin soylemedigi, madde 1.)       |
| 3   | ADR-0042 §3'un **T2** esigini (`2K/3` — `K=8` icin **6**) geciyor mu? | ⚠️ **HAYIR.** T2 _"gectiginde"_ der; 6 esigin kendisidir, gecmek **7** gerektirir. Bu modul yapisal kaynak eklemedigi icin T2 **kapali kaliyor**. |
| 4   | Geciyorsa ne yapilir?                                                 | Gecmiyor. ⚠️ **Ama T2'nin ates almasi BIR KATKICI UZAKTA** — §5.4.                                                                                |

⚠️ **ADR-0042 bu sonucu ISMEN ONGORMUSTU** ve ongorusu **ters yonde**
gerceklesti:

> _"9. modul (IK) bir yapisal katkici eklerse yapisal kaynak **7** olur ve T2
> **atesler**; yani bu tartisma **bir modul sonra** yeniden acilabilir."_

Eklenmedi. ⚠️ **Bu, tartismanin kapandigi anlamina gelmez — ertelendigi
anlamina gelir**, ve erteleyen sey bir tedbir degil, IK'nin veri seklidir
(§5.2). Onuncu modul (Musteri Geri Bildirimi / Anket) bir yapisal katkici
adayi tasiyor ("cevaplanmamis anket", "dusen memnuniyet") ve o gun T2 **ates
alabilir**.

#### 5.4 ⚠️ KAPANIS DENETIMI ADR-0042 §4'UN YENI PROTOKOLUNU ILK KEZ UYGULAR

Katkici eklenmemesi, **olcumun atlanacagi** anlamina gelmez. Tam tersi: ADR-0042
§4 olcum protokolunu **degistirdi** ve bu modulun kapanis denetimi o yeni
protokolun **ILK uygulamasidir**.

Kaydedilecek uc sey (yalnizca "hangi kaynak girdi" **degil**):

1. hangi kaynaklarin cevaba girdigi,
2. ⚠️ **her yapisal kaynagin o cagrida DONDURDUGU SATIR SAYISI** — `0` ise
   kaynak elenmedi, **soyleyecek seyi yoktu**,
3. ⚠️ **giren ve girmeyen her parcanin SKORU**.

⚠️ Bunun degeri somuttur: ADR-0042 iki soruyu **cevaplayamadan** kapandi
(`project-status` ve `appointment-schedule` elendi mi yoksa bos mu dondu; band
ici siralama liyakatli mi). ⚠️ **Bu modulun denetimi, yapisal kaynak sayisini
degistirmedigi icin o iki soruyu OLCMEK ICIN IDEAL KOSULDUR** — degisken yok,
yalnizca protokol yeni.

#### 5.5 ⚠️ KURUCU KISITLA GERILIM — durustlukle kaydediliyor

CLAUDE.md'nin kurucu cumlesi nettir:

> _"Bir modul tasarlanirken sorulacak soru 'kullanici bu ekranda ne yapar'
> degil, \**'bu modul AI'a hangi baglami ve hafizayi kazandirir'\**dir."_

Ve o tablo IK'yi **"organizasyon hafizasi"** olarak sayiyor. **Sifir katkici bu
cumleyle gerilim halindedir ve bu gizlenmiyor.**

Savunma iki parcalidir:

1. ⚠️ **Havuz, hafizanin TEK kanali degildir.** `POST /ask`in top-K havuzu bir
   **retrieval** mekanizmasidir; kurumsal hafiza veritabaninda **durur** ve
   ileride farkli yollarla (dogrudan sorgu, ozet, arac cagrisi) kullanilabilir.
   Bir modulun havuzda yeri olmamasi, hafizasinin **olmadigi** anlamina gelmez.
2. ⚠️ **Ve asil savunma: KOTU BIR KATKI, KATKI DEGILDIR.** ADR-0035'in olcumu
   havuzun **dolu** oldugunu gosterdi; ADR-0042'ninki uc anlamsal kaynagin **her
   soruda sifir aldigini**. Bu doygunlukta bir **sayim** eklemek, IK'ya ses
   vermez — **baska bir modulun sesini alir**. ⚠️ Yani gerilim goruntudedir:
   bos bir katki, kurucu kisiti karsilamaz, yalnizca karsilar **gorunur**.

⚠️ **Gerilim SURELIDIR ve tetikleyicisi yazili:** IK v2 (izin/tatil takibi,
performans notu) **hem anlatisal hem olaysal** icerik getirir. O gun hem
anlamsal hem yapisal aday **gercek** olur ve §5.3'un dort sorusu **yeniden**
sorulur — muhtemelen T2 ates almis halde.

#### 5.6 ⚠️ VE UCUNCU GEREKCE: KATKICI YOKLUGU BIR GUVENLIK KATMANIDIR

§4.2'nin ucuncu katmani tam olarak budur. IK'nin havuzda **hicbir** kaynagi
olmamasi, maas verisinin `/ask` yoluna **herhangi bir sekilde** sizmasi icin
once **bir katkici yazilmasini** gerektirir — yani hata **sessiz olamaz**, bir
dosya acilmasi gerekir. ⚠️ Ve §4.2'nin uc numarali testi o dosyayi acan kisiyi
**durdurur**.

⚠️ **Yan etki (§7.4):** IK'nin katkicisi olmadigi icin `POST /ask`in izin
filtresi bu modulde de **tetiklenmez**. Filtrenin tek gercek tetikcisi **hala
Finans**tir — **sekizinci** kez ayni kayit.

---

### 6. ⚠️ `platform/audit` — UCUNCU ERTELEME YAPILMIYOR (PLATFORM KARARI, kalem A)

#### 6.1 Borcun tarihi — ve neden burada duruyor

| ADR                                                       | Ne dedi                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [ADR-0034](0034-finance-module.md) §8 (Finans)            | Borc **gercek** oldu; tetikleyici **8. modul (Teklif/Fatura)**                             |
| [ADR-0039](0039-stok-envanter-modulu.md) (Stok)           | Kalem adi/esigi tarafinda borc **acik**; hareket tarafinda **yok** (defter degistirilemez) |
| [ADR-0040](0040-tedarikci-yonetimi-modulu.md) (Tedarikci) | Odeme kosullarini kimin degistirdigi **sorulamaz**; ⚠️ "kendiliginden kapanmaz"            |
| [ADR-0041](0041-teklif-fatura-modulu.md) §8 (Teklif)      | **Kucultulerek ertelendi**; tetikleyici **9. modul (IK)** ve odeme/tahsilat gunune tasindi |

ADR-0041 §8.3'un son cumlesi:

> _"⚠️ **Ucuncu kez ertelenirse borc artik bir erteleme degil, bir KARAR
> olur.**"_

**Bu ADR o cumleyi okuyor ve ertelemiyor.** Ustelik IK'da borc yalnizca teknik
degil **hukukidir**: KVKK'nin veri isleme ve hesap verebilirlik yukumlulugu,
kisisel verinin kim tarafindan ne zaman degistirildiginin **gosterilebilmesini**
bekler. Bu, "kullanissiz olur" diye ertelenebilecek bir kalem degildir.

#### 6.2 ⚠️ MAAS TARAFI AUDIT GEREKTIRMIYOR — defter zaten cevapliyor

Once problemin **buyuyen** kismi degil, **kucultulen** kismi yazilir.

> _"Maasi kim, ne zaman degistirdi?"_ sorusunun cevabi
> **`hr.compensation_records`in kendisidir** (§1.2): her degisiklik **yeni bir
> satirdir** ve satir `recorded_by_user_id` + `recorded_at` tasir. Defter
> **ekleme-yalnizdir** — degisiklik kaydi silinemez, degistirilemez.

⚠️ Bu, ADR-0039'un dersinin **dogrudan uygulanmasidir**: bir seyi
**degistirilemez** yapmak, _"kim degistirdi"_ sorusunu **cevaplamaktan
ucuzdur ve daha gucludur**. Ve ADR-0041 §8.1'in yaptigi seyin **daha iyi**
bir versiyonudur: orada sorunun **olmamasi** saglandi (gonderilmis belge
degismez); burada sorunun **cevabi verinin kendisi**.

⚠️ **Yani en hassas alan (maas), acilacak denetim altyapisina IHTIYAC
DUYMADAN cevaplanabilir hale geliyor.** Bu, kalem A reddedilse bile ayakta
kalir.

#### 6.3 Geriye kalan: `hr.employees` DEGISEBILIR — ve satir ici damga YETMEZ

`employees` **mutable**dir ve olmalidir: unvan degisir, is telefonu degisir, ad
duzeltilir, `platform_user_id` baglanir/kopar.

ADR-0041'in cozumu (**satir ici aktor damgasi**) burada **yetmez** ve o ADR
kendi sinirini zaten yazmisti:

> _"⚠️ Bu bir denetim izi DEGILDIR ve oyle adlandirilmayacaktir. Bir olay
> gunlugu 'ne oldu'yu sirasiyla anlatir; damga yalnizca **son durumu** soyler."_

⚠️ IK'da gereken tam olarak **"ne oldu"**dur: _"Bu calisanin unvani 3 Mart'ta
kim tarafindan degistirildi?"_ Bir `updated_by` kolonu yalnizca **en son**
degistireni soyler; onceki uc degisiklik **gorunmez** ve hata **sessizdir** —
kolon dolu, cevap eksik.

#### 6.4 ONERILEN TASARIM — minimal, degismez, tenant-scoped

**`platform/audit`** modulu ve **tek tablo**: `platform.audit_log`.

| Kolon            | Tip             | Not                                                           |
| ---------------- | --------------- | ------------------------------------------------------------- |
| `id`             | `uuid` PK       | UUIDv7 — ⚠️ sirali: zaman siralamasi id ile de dogrulanabilir |
| `tenant_id`      | `uuid` NOT NULL | RLS ekseni (**FORCE RLS**)                                    |
| `occurred_at`    | `timestamptz`   | `Clock`tan                                                    |
| `actor_user_id`  | `uuid` NULL     | ⚠️ NULL = sistem/worker (sahte bir kullanici uydurulmaz)      |
| `resource_type`  | `text` NOT NULL | Ornek: `hr.employee`                                          |
| `resource_id`    | `uuid` NOT NULL | ⚠️ **Cross-schema FK YOK** (Mutlak Kural 5) — ciplak uuid     |
| `action`         | `text` NOT NULL | `created` \| `updated` \| `deleted`                           |
| `changed_fields` | `text[]` NULL   | ⚠️ **Alan ADLARI — DEGERLER DEGIL** (§6.5)                    |

**Mekanizma — platform sahiplenir, modul deklare eder** (ADR-0025 ve ADR-0031'in
ayni disiplini, ucuncu kez):

- `shared/audit.port.ts` → `AuditRecorder.record(entry)`. `shared/` **framework
  sizdirmaz**: yalnizca tip.
- Adapter `platform/audit` icinde; **hicbir is modulu** `platform.audit_log`
  tablosuna dokunmaz.
- ⚠️ **AYNI TRANSACTION'DA yazilir** (`runInCurrentTenantTransaction` icinde).
  Asenkron/outbox **reddedildi** (§6.8): kaybolabilen bir denetim kaydi,
  olmayandan **daha kotudur** — yanlis bir guven uretir.
- ⚠️ **UPDATE ve DELETE metodu YOK**; `audit:delete` izni **yok**. Tablo
  ARCHITECTURE §6.2'nin dedigi seydir: _"degismez denetim kaydi"_.
- Okuma: `GET /v1/audit?resourceType=&resourceId=` — sayfali, **`audit:read`**
  (owner + admin, §7.1).

#### 6.5 ⚠️ EN KRITIK KARAR: DEGER SAKLANMAZ, YALNIZCA ALAN ADI

Klasik denetim izi `before` / `after` degerlerini saklar. **Burada saklanmiyor.**

**Gerekce — ve §4'un butun izolasyonu buna bagli:** eski maasi audit_log'a
yazmak, maas verisini **ikinci bir tabloya kopyalamak** demektir. O zaman
§4.2'nin uc katmani da delinir: ayri tablo (kopya var), ayri izin (`audit:read`
farkli bir kapi), katkici yoklugu (audit bir gun katkici kazanabilir). ⚠️ Ayni
sey §3'un siniri icin de gecerlidir: bir gun bir alan yanlislikla hassas veri
tasirsa, deger saklayan bir audit log onu **kalici olarak cogaltir**.

⚠️ **Ve maas icin bilgi KAYBI YOKTUR**: eski deger zaten
`hr.compensation_records`ta **durur** (§6.2). Yani deger saklamak, en cok
ihtiyac duyulan alanda **gereksiz**dir.

⚠️ **DURUST BEDEL:** _"Telefon numarasi neydi?"_ ve _"Unvani ne idi?"_
**sorulamaz**. Cevaplanan sey _"3 Mart'ta X kisisi bu calisanin `job_title` ve
`work_phone` alanlarini degistirdi"_dir. Hesap verebilirlik icin yeterli,
geri alma icin degil. ⚠️ Bu karar **kosulludur**: gercek bir ihtiyac
olustugunda **alan bazinda** (hassas olmayanlar icin) deger saklamaya gecilir
ve yol **tek yonludur**.

#### 6.6 KAPSAM — bu iste YALNIZCA IK yazar

⚠️ Mekanizma acilir, **ama bu isde yalnizca `hr.employees` audit kaydi uretir.**

- **ADR-0034 (Finans), ADR-0039 (Stok), ADR-0040 (Tedarikci) borclari ACIK
  KALIR.** Bu ADR o modullere **dokunmaz** (Mutlak Kural 1) ve borclarini
  **devralmaz**.
- ⚠️ Ama nitelikleri **degisir**: bugune kadar borc _"altyapi yok"_du; bu ADR
  kabul edilirse **altyapi VAR, baglanti yok** olur — yani her biri artik
  **birkac satirlik** bir istir. ⚠️ Bu ayrim kaydedilmezse borc listesi
  oldugundan **buyuk** gorunur (ADR-0040'in kapanis denetiminin buldugu hatanin
  aynisi).
- ⚠️ ADR-0041'in **taslak duzenlemeleri** kalemi de acik kalir; tetikleyicisi
  degismedi (odeme/tahsilat gunu).

#### 6.7 Retention ve KVKK — ⚠️ audit_log YENI BIR SEKIL getiriyor

`platform.audit_log` **her degisiklikte bir satir** yazar; `messages`tan sonra
**en hizli buyuyecek** tablodur ve ROADMAP §8.5'in listesine girer.

⚠️ **Ama cozumu digerlerinin TERSI olabilir** — `finance.transactions` gibi:
denetim kaydini silmek, denetlenebilirligi **yok etmektir** ve KVKK'nin hesap
verebilirlik ilkesiyle catisir. ⚠️ Ayrica **audit_log'un kendisi kisisel veri
tasir** (kim, ne zaman) ve KVKK isleme envanterine **kendi basina** girer.

Yani retention karari bu tablo icin **iki yonlu bir catismadir** ve ROADMAP
§8.2'nin kontrol noktasina bir **girdidir**, cevabi degil.

#### 6.8 Reddedilen alternatifler

| Alternatif                                   | Neden secilmedi                                                                                                                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **IK'ya ozel `hr.employee_changes` tablosu** | Ucuz ve hizli — ⚠️ ama borc **dorduncu kez** ertelenmis olur ve **10. modul** ayni tabloyu yeniden yazar. ADR-0041'in uyardigi tam sey.                                                                                               |
| **Satir ici damga (ADR-0041'in cozumu)**     | ⚠️ **Yetmiyor** (§6.3): damga son durumu soyler, IK'da gereken **degisiklik gecmisi**dir.                                                                                                                                             |
| **Asenkron / outbox uzerinden yazma**        | ⚠️ Kaybolabilen bir denetim kaydi **olmayandan kotudur** — yanlis guven uretir. Ustelik outbox'in kendi teslimat borcu var (`platform.outbox` tuketicisi hala yok).                                                                   |
| **PostgreSQL trigger ile otomatik audit**    | Cazip (unutulamaz) — ⚠️ ama **aktor bilgisi** uygulama katmanindadir (`CurrentUserProvider`), trigger onu goremez; `SET LOCAL` ile gecirmek **ikinci bir context kanali** acardi. Ayrica deger saklamamak (§6.5) trigger'da zorlasir. |
| **Tam surumleme / temporal tablolar**        | Her tabloyu ikiye katlar, her okumayi karmasiklastirir. ⚠️ Sorulan soru _"gecmis surumu geri getir"_ degil, _"kim degistirdi"_.                                                                                                       |
| **Domain event'lerden turetmek**             | Event'ler **is olaylaridir**, denetim kaydi degil; ⚠️ ve bugun IK domain event yayinlamiyor (CRM de yayinlamiyor — sarkan isaretci kararinin sebebi).                                                                                 |

#### 6.9 ⚠️ ONAY VERILMEZSE — geri dusus plani

Kalem A reddedilirse:

1. `hr.employees` **satir ici damga** alir (`updated_by_user_id`,
   `updated_at`) — ADR-0041'in cozumu, **sinirlariyla birlikte** (§6.3).
2. ⚠️ Bilinen sinirlara **acikca** yazilir: _"bir calisanin unvanini ya da is
   telefonunu kimin degistirdigi yalnizca SON degisiklik icin bilinir; gecmis
   degisiklikler gorunmez."_
3. ⚠️ Borc **dorduncu kez** ertelenmis olur ve kaydi su cumleyle tutulur: **IK
   modulunde de ertelendi.**
4. §6.2 **ayakta kalir**: maas tarafi zaten cevaplanmis olur.

---

### 7. Izinler — ⚠️ ILK KEZ ayni modulde GENIS ve DAR kaynak bir arada

ADR-0025'in `resource:action` modeli, **onuncu** kez.

#### 7.1 Katalog

| Permission                | owner | admin | member | viewer |
| ------------------------- | :---: | :---: | :----: | :----: |
| `employee:read`           |  ✅   |  ✅   |   ✅   |   ✅   |
| `employee:write`          |  ✅   |  ✅   |   ❌   |   ❌   |
| `employee:delete`         |  ✅   |  ✅   |   ❌   |   ❌   |
| ⚠️ `compensation:read`    |  ✅   |  ✅   |   ❌   |   ❌   |
| ⚠️ `compensation:write`   |  ✅   |  ✅   |   ❌   |   ❌   |
| ⚠️ `audit:read` (kalem A) |  ✅   |  ✅   |   ❌   |   ❌   |

⚠️ **`employee:read` GENIS** — ADR-0034 §7'nin olcutu uygulanir: _"musteri
listesi ve gorev listesi PAYLASILAN is gercekleridir."_ **Bir ekip rehberi de
oyledir**: calisanlarin birbirinin unvanini ve is telefonunu bilmesi
gunluk isin ta kendisidir. Dar olsaydi modul, onu kullanmasi gereken
herkese kapali olurdu.

⚠️ **`employee:write` DAR** — ve bu, `read` ile aralarindaki en anlamli
ayrimdir: bir ekip rehberini **okumak** paylasilan bir is gercegi, bir
calisanin kaydini **degistirmek** bir **yonetim islemidir**. Teklif/Fatura'dan
bilincli sapma: orada `member` yazabiliyordu cunku teklif yazmak satisin gunluk
isidir; **bir meslektasin unvanini degistirmek kimsenin gunluk isi degildir.**

⚠️ **`compensation:*` TAM DAR — ve `read` bile owner/admin.** Finans'in
`cashflow:read`inden sonra **ikinci dar kaynak**, ama sekli **yeni**: Finans'ta
**butun modul** dardi; burada ayni modulde **genis bir kaynak ile dar bir
kaynak yan yana** duruyor. ⚠️ Bu, mekanizmanin ilk kez **kaynak granulunde**
sinanmasidir ve ADR-0041 §9'un cumlesini dogrular: _"kaba hali bugun TEK
SATIRLIK bir degisikliktir, cunku ayri bir izindir."_

⚠️ **`compensation:delete` YOK** — defter ekleme-yalnizdir (§1.2). Var olmayan
bir izin, unutulmus bir izin degildir: kataloga **yazilmadigi** icin guard onu
hicbir role vermez ve bir uc yazilsa bile **403** alir.

#### 7.2 ⚠️ `member` ALINMIS — dorduncu gercek cakisma

Bu modulun kaynagi icin en dogal kelime **`member`**di. **Alinmis:**
`member:read` Tenant modulunundur ve _"tenant uye listesi"_ demektir
(owner + admin).

Paylasmak **sessiz bir yetki karisikligi** uretirdi: `member:read` bugun
**owner + admin**, `employee:read` ise **dort rol**. Ayni izne baglansaydi ya
ekip rehberi herkese kapanir ya da **platform uyelik listesi herkese acilirdi**
— ikincisi bir **guvenlik gerilemesidir**.

⚠️ Cakisma **dorduncu kez** gercek oldu ve dorduncu kez ayni sey yapildi:
**calisan modulun katalogu DEGISTIRILMEDI.**

| #   | ADR          | Cakisan kelime            | Cozum                                           |
| --- | ------------ | ------------------------- | ----------------------------------------------- |
| 1   | ADR-0039     | `item` (ongoru)           | `stock_item` — ⚠️ cakisma hic gelmedi           |
| 2   | ADR-0040     | `contact` · `interaction` | `supplier_contact` · `supplier_interaction`     |
| 3   | ADR-0041     | `document`                | Tablo `sales_documents`, izin `quote`/`invoice` |
| 4   | **ADR-0043** | ⚠️ **`member`**           | **`employee`** — ve iki uc §2.6'da ayrilir      |

⚠️ **`employee` niteliksizdir ve dogrudur** (ADR-0041 §9'un `quote`/`invoice`
ayrimi): baska hicbir modulun "calisan"i olmayacaktir. `compensation` da
oyle — ve **`salary` yerine `compensation`** secildi cunku ilerideki prim/yan
hak kalemleri ayni kaynagin altina girer.

#### 7.3 ⚠️ `/ask` izin filtresini yine TETIKLEMEZ — sekizinci kez

`compensation:read` **dar** bir izindir, yani ilk bakista ADR-0031 §5.3'un
filtresini tetikleyecek gibi gorunur. **Tetiklemez** — cunku filtre
**katkicilar** uzerinde calisir ve IK'nin **hicbir katkicisi yoktur** (§5).

Filtrenin tek gercek tetikcisi **hala Finans**tir (`cashflow:read` /
`commentary:read`) — CRM, Projeler, Randevu, Belge, Stok, Tedarikci ve
Teklif/Fatura'dan sonra **sekizinci** kez ayni kayit.

⚠️ Ve **`company:read`'siz kullanici senaryosu** hala yok: dort rolun dordu de
o izni tasiyor (CLAUDE.md "Henuz yok" listesi). Bu modul o satiri da
**degistirmiyor**.

---

### 8. Cross-modul referans ve DAG

#### 8.1 Sifir yeni satir — ve kenar bir IS MODULU kenari DEGIL

IK tek bir dis kayda bakar: `platform_user_id`in gecerliligi. Kullandigi yuzey
`tenant.public.ts`in `TenantAccessQuery`sidir ve **tek satir degismez** (§2.5).

⚠️ **Bu kenar, bugune kadar sayilan is-modulu DAG'ina EKLENMEZ** ve gerekce
ADR-0033'un kendi yorumudur (`task.use-cases.ts`):

> _"⚠️ Bu, Projeler'in ikinci cross-modul bagimliligidir ama BIRINCISIYLE AYNI
> SINIFTA DEGIL: CRM bir IS modulu, Tenant ise **platform zincirinin ilk
> halkasi** (ARCHITECTURE §6.2). Kimlik ve uyelik zaten her modulun altinda
> duruyor."_

→ **Is modulleri arasindaki kenar sayisi YEDIDE kaliyor**, grafik hala **DAG**.
IK, CRM ve Stok gibi bir **kok dugum**dur: hicbir is moduluna bakmaz.

#### 8.2 Reddedilen adaylar — ⚠️ "bakildi ve yoktu"

| Aday                                             | Neden reddedildi                                                                                                                                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Projeler → IK** (gorev atamasi calisana)       | ⚠️ Yon **ters** olurdu ve Projeler bugun `assigneeUserId` (platform kullanicisi) kullaniyor — calisana cevirmek bir **breaking change**. Ustelik §2.1: her calisanin hesabi yok, her atanan calisan degil. Talep gelirse **Projeler'in ADR'si** yazar. |
| **IK → Finans** (maas gideri islemi yazmak)      | ⚠️ ADR-0041'in `finance.transactions` reddiyle **ayni gerekce**: o tablo **gerceklesmis nakit hareketidir**. Maas kaydi bir **sozlesme sartidir**, bir odeme degil. Otomatik yazmak, odenmemis maasi odenmis gosterirdi.                               |
| **IK → CRM** (calisan ↔ kisi eslesmesi)          | Anlamsiz: `crm.contacts` **musteri** tarafidir.                                                                                                                                                                                                        |
| **`hr.public.ts` acmak** (baskalari okusun diye) | ⚠️ ADR-0035'in kurali: **talip yokken dizin yazilmaz**. Bugun hicbir modul calisan adi istemiyor. ⚠️ Ve istese bile once §4'un izin sorusu cevaplanmalidir.                                                                                            |

⚠️ **`hr.public.ts` acilmamasinin ikinci bir degeri var:** modulun disa acik
**hicbir** yuzeyi olmamasi, maas verisinin modulun disina cikmasi icin **once
bir dosya acilmasini** gerektirir — §5.6'nin ayni mekanik korumasi.

---

### 9. Exception filter — uc AI hata tipi ILK GUNDEN

CLAUDE.md'nin kalici standardi, **onuncu** kez ve ⚠️ **ikinci kez tumuyle
tetiklenemez** bir modulde (ilki ADR-0041):

`HrDomainExceptionFilter`in `@Catch(...)` listesi: `HrDomainError` +
`EmbeddingFailedError` + `RateLimitExceededError` + `CompletionFailedError`.

⚠️ **Ucu de bugun TETIKLENEMEZ** — bu modulde embedding, oran siniri ve LLM
cagrisi **yok** (§5). Yine de yazilir; bedeller **simetrik degildir**:

| Secim          | Yanlis oldugunda bedeli                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Simdi yaz**  | Uc satirlik **olu kod**. Gorunur, ucuz, zararsiz.                                                                                                      |
| **Sonra ekle** | ⚠️ Modul bir AI yuzeyi kazandigi gun **ham 500**; kullanici "beklenmeyen hata" gorur ve tekrar denemesi gerektigini **ogrenemez**. Hata **SESSIZDIR**. |

⚠️ **`StorageFailedError` ve `PdfPort` hatalari YAZILMAZ** — kuralin kapsami
**AI hata tipleridir, hepsi degil**. Dosya saklamayan bir module depolama
hatasi koymak olu kod degil **yaniltici** olurdu.

⚠️ **Bu modul bir AI yuzeyi kazanmaya UZAK ama IMKANSIZ DEGIL:** IK v2'nin
performans notu ya da _"ekip ozetini yaz"_ ozelligi tam olarak o gundur.
⚠️ Ve o gun geldiginde **once §4.2'nin uc katmani** yeniden okunmalidir.

Bir birim testi `@Catch` kaydinin **varligini** korur (ADR-0041'in
`invoicing-domain-exception.filter.spec.ts`i ile birebir ayni desen).

⚠️ **429 isaret TASIMAZ**: maske yalnizca 5xx'e uygulanir. ⚠️ **Eslenmemis
domain kodunun 500'u MASKELI KALIR** ve bir test onu kilitler.

---

### 10. Frontend: ODA — ilk gunden, koridorda ONUNCU kapi

ADR-0038'in ODA sistemi, dokuzuncu kez tuketici olarak.

**Renk:** IK'nin imza rengi **`#896096`** (koyu `#c498d2`) — mor. Bir tercih
degil, `module-colors.css`te **ROADMAP §3.5 sirasina gore zaten ayrilmis**
degerdir. ⚠️ **Anahtar `hr`** ve palet ilk gunden dogru adla yazildi
(Randevu'daki `booking` → `appointments` yeniden adlandirmasi burada
**gerekmiyor**).

⚠️ **UCUNCU KOMSU-HUE KUMESI ve ilki UC RENKLI:** `hr` (#896096),
`marketing` (#7665a6) ve `loyalty` (#9a5a84) mor bandda **birlikte** duruyor —
CRM/Tedarikci ve Finans/Teklif ciftlerinden **bir renk daha kalabalik**. Ikisi
henuz yazilmadi, ama kural bugunden gecerlidir: **renk hicbir yerde TEK ayirt
edici olmaz**; kapilar farkli ikon, farkli etiket ve `aria-current` tasir
(`module-colors.css`in kendi uyarisi).

**Oda:** tek dikey kaydirmada **duvar + tezgah**.

| Bolge      | Ne                                                                                                                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Duvar**  | Kahraman rakam: ⚠️ **aktif calisan sayisi** (§4.4 — "toplam maas gideri" YOK). Uydular: bu ay katilan/ayrilan · unvani girilmemis kayit sayisi · ⚠️ **platform hesabi olmayan calisan sayisi** (§2.1'in gorunur hali) |
| **Tezgah** | Calisan listesi — ad · unvan · durum · hesap rozeti; filtre: aktif/ayrilmis                                                                                                                                           |

⚠️ **Duvar ORTAKTIR**; detay sayfasinin **duvari yoktur** (ADR-0038: ozetlenecek
bir durum degil, tek bir kayit var).

⚠️ **MAAS EKRANDA DA AYRIK BIR YUZEYDIR:** listede **hic gorunmez** (§4.2),
yalnizca **detay sayfasinda kendi bolumunde** — ve `compensation:read`
tasimayan rol icin bolum **hic render edilmez**. ⚠️ "Gizli ama DOM'da" bir
cozum **yasaktir**: veri istemciye hic gonderilmez, cunku uc zaten **403**
doner.

⚠️ **AI'IN SESI BU MODULDE GORUNMEZ ve bu dogrudur** — IK v1'de modul ici AI
yuzeyi yok (§5). Renk sinavi bu yuzden Projeler'deki gibi **"kabuk boyanmiyor
mu"** olarak yapilir: `/app/hr` altindaki her sey mor, **kabuk ve
`--ai-accent` terracotta** kalmali. `app-shell.tsx`e **yedinci kez
dokunulmaz**.

**Koridorda onuncu kapi** — dogrudan **CANLI** eklenir; `SOON` dizisi bos
kalmaya devam eder ve bolumun kosullu render'i (`SOON.length === 0`) hala
gecerlidir.

---

### 11. Kapsam disi (bugun yapilmiyor)

| Kalem                                   | Neden bugun yok                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚠️ **Saglik verisi**                    | §3 — bir asama degil **sinir**; v2 + ayri ADR + KVKK kontrol noktasindan **sonra**                                                                                                                                                                                                                                                                                                                                  |
| ⚠️ **Bordro / puantaj / SGK**           | Maas **tutmak** ile bordro **hesaplamak** ayri islerdir: bordro **ulkeye ozel mevzuattir** (vergi dilimi, SGK tavani, kesintiler) — ADR-0041'in e-fatura gerekcesiyle **birebir ayni**: ulke degisince bastan yazilir.                                                                                                                                                                                              |
| **Izin / tatil takibi**                 | Kendi is kurallarini getirir (hak edis, devir, yillik hesap) ve ⚠️ **anlatisal icerik** uretir — o gun §5'in katkici sorusu **yeniden** sorulur                                                                                                                                                                                                                                                                     |
| **Performans degerlendirme**            | Anlatisal + hassas; ⚠️ ayrica `POST /ask`e girmesi **ayri bir karardir** (bir performans notunun ozete karismasi istenmeyebilir)                                                                                                                                                                                                                                                                                    |
| **Organizasyon semasi / hiyerarsi**     | `manager_id` bir **kendine referans**tir ve dongu/derinlik kurallari getirir; v1'de sorulan soru "kim calisiyor"dur, "kime baglı"                                                                                                                                                                                                                                                                                   |
| **Ise alim / aday takibi (ATS)**        | Ayri bir modul; aday **calisan degildir**                                                                                                                                                                                                                                                                                                                                                                           |
| **Belge eki (sozlesme, ozluk dosyasi)** | ⚠️ ADR-0037'nin **acik sinirina** giriyor: _"belge bazli gizlilik YOK — `document:read` tasiyan herkes TUM belgeleri gorur. Hassas belge (ozluk, bordro) bu module konulmamali. **Tetikleyici: 9. modul (IK).**"_ ⚠️ **Tetikleyici geldi ve cevap: EKLENMIYOR** — belge bazli gizlilik ABAC'tir ve backlog'tadir; onu cozmeden ozluk dosyasi eklemek, ADR-0037'nin yazili uyarisini **bilerek ihlal etmek** olurdu. |
| **Calisan self-servis**                 | `platform_user_id` bagi bunun **onunu aciyor** ama v1'de yok: "kendi kaydini gorebilir" bir **ABAC** kuralidir (backlog)                                                                                                                                                                                                                                                                                            |
| **Maasa gore siralama/filtre**          | ⚠️ §4.2 — siralamanin kendisi bilgi sizdirir                                                                                                                                                                                                                                                                                                                                                                        |

---

## Gerekce

**Neden bu modul bu kadar cok "hayir" iceriyor.**

IK, Faz 5'in en cok **veri isteyen** ve en az **veri koymasi gereken** modulu.
Sekiz modulde biriken desenlerin cogu burada **tuketici** olarak kullaniliyor;
gercekten yeni olan alti kararin **dordu bir sinir ciziyor** (saglik verisi
yok, not alani yok, katkici yok, deger saklanmiyor).

Bunun sebebi cekingenlik degil, **hatalarin sekli**:

| Yanlis karar                         | Hatanin sekli                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| Saglik verisini bugun eklemek        | ⚠️ Hukuki; ve **geri alinamaz** — veri girdikten sonra "kaldirdik" demek yetmez |
| Serbest not alani birakmak           | ⚠️ **Sessiz**: kullanici sinira uyar gorunur, veri yine de girer                |
| Calisan = uyelik demek               | ⚠️ **Sessiz**: eksik ekip ya da acik kalmis erisim; hicbir test yakalamaz       |
| Maasi bir katkiciya baglamak         | ⚠️ **Sessiz ve geri alinamaz**: veri modele gider, log'a duser                  |
| Denetim izini dorduncu kez ertelemek | ⚠️ Gorunur ama **birikimli**: her modul bir sonrakini bekler                    |

**Neden maas GIRIYOR ama saglik GIRMIYOR.** Ikisi "hassas" kelimesiyle birlikte
anilir ama **hukuken ayri kategorilerdedir** (§4.1) ve gereken onlemler
**farkli buyukluktedir**: maas icin dar izin + izolasyon yeterlidir, saglik
icin **ayri bir guvenlik rejimi** gerekir ve o rejim bu modulun ici degil,
**platform isidir**.

**Neden `platform/audit` TAM BURADA aciliyor.** Uc kez ertelendi ve her
seferinde gerekce _"bu modul onu gercekten gerektirmiyor"_du. ⚠️ IK'da gerekce
**tersine dondu**: kisisel veri isleyen bir modulde _"kim degistirdi"_ sorusu
bir kolaylik degil, bir **yukumluluktur**. Ustelik borcun **en hassas kismi**
(maas) altyapiya ihtiyac duymadan cozuluyor (§6.2) — yani acilan sey **minimal
kalabiliyor**.

---

## Sonuclari

**Olumlu**

- ⚠️ **Uc kez ertelenmis bir platform borcu kapaniyor** ve mekanizma diger uc
  modulun borcunu **birkac satirlik** bir ise indiriyor (§6.6).
- ⚠️ **En hassas alan (maas) denetim altyapisina IHTIYAC DUYMADAN
  hesap verebilir** — ekleme-yalniz defter (§6.2).
- Maas verisi **uc bagimsiz katmanla** AI'dan izole ve **ucu de testle
  kilitli** (§4.2).
- ⚠️ **Saglik verisi sinirinin YAZILI ve GEREKCELI** olmasi, ileride "neden
  yok" sorusunu tartisma olmadan cevapliyor — ve §1.1 sinirin **kullaniciya
  ihlal ettirilmesini** engelliyor.
- Calisan/uyelik ayrimi, **iki yonde de gercek** olan kumeleri temsil
  edebiliyor ve platformun dar kimlik yuzeyini **genisletmiyor** (§2.3).
- ⚠️ **ADR-0042 §4'un yeni olcum protokolu ILK KEZ** uygulanacak ve degisken
  eklenmedigi icin **ideal kosulda** (§5.4).
- `tenant.public.ts` ve hicbir `public.ts` **degismiyor**; is-modulu DAG'i
  **yedi kenarda** kaliyor.

**Olumsuz / bedeli**

- ⚠️ **Modul `POST /ask`e HICBIR SEY katmiyor** ve bu, CLAUDE.md'nin kurucu
  cumlesiyle **gerilim halinde** (§5.5). Savunmasi var ama **maliyeti gercek**:
  _"ekipte kim ne yapiyor"_ sorusu bugun AI'a **sorulamaz**.
- ⚠️ **Serbest not alani yok** — kullanicilarin **ilk isteyecegi** sey budur ve
  cevap "hayir"dir. Ihtiyac gercekse dogru yer **Belge modulu degildir** (§11,
  ADR-0037'nin gizlilik siniri) — yani bugun **dogru yer yok**.
- ⚠️ **Denetim izi DEGER saklamiyor** (§6.5): _"eski unvani neydi"_ sorulamaz.
- ⚠️ **Mutlak Kural 1'e bilincli istisna**: tek iste bir platform modulu + bir
  is modulu. PO onayina baglidir ve sessiz bir yan is degildir.
- ⚠️ **ROADMAP iki yerde guncellenmek zorunda** (kalem C); guncellenmezse belge
  yururlukte olmayan bir siniri **yururluktemis gibi** gosterir.
- ⚠️ **Retention YIRMIDEN YIRMIIKIYE cikiyor** (`hr.compensation_records` +
  `platform.audit_log`) ve ikincisi ⚠️ **`messages`tan sonra en hizli
  buyuyecek** tablodur — ustelik cozumu digerlerinin **tersi** olabilir (§6.7).
- ⚠️ **Vektor tasiyan tablo sayisi SEKIZDE KALIYOR** — Faz 5'te bu sayiyi
  artirmayan **ikinci** modul, **ust uste**.
- **Faz 6'nin kapi kosuluna bir madde ekleniyor** (KVKK denetimi, §4.3) — yani
  bu karar **Faz 6'yi bir miktar geciktirebilir**.

---

## Degerlendirilen alternatifler

| Alternatif                                                | Neden secilmedi                                                                                                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Calisan = uyelik (tek kayit)**                          | ⚠️ §2.1'in dort satirindan **ikisi temsil edilemezdi**; §2.3: platform ad/iletisim **vermiyor** ve verdirmek `identity.public.ts`i genisletmeyi gerektirirdi    |
| **Calisan kaydi uyelikten TURETILIR (senkron)**           | ⚠️ §2.4 — "iki kolon senkron kalmali"; bir tazeleme yolu unutulunca hata **sessiz**                                                                             |
| **Maas `employees` tablosunda bir kolon**                 | ⚠️ §4.2 katman 1 — bir `SELECT *` ya da bir liste projeksiyonu maasi **yanlislikla** tasirdi; ayrica gecmis **kaybolurdu** ve §6.2'nin denetim cevabi olmazdi   |
| **Maas var ama guncel deger + `updated_by` (defter yok)** | ⚠️ Zam gecmisi **kaybolur** ve _"maasi kim degistirdi"_ yalnizca **son** degisiklik icin bilinir — §6.3'un aynen tekrari                                        |
| **Maasi da anlamsal/yapisal bir katkiciya baglamak**      | ⚠️ Product Owner karariyla **yasak**; ayrica §5.2: bir sayim havuzda **yer isgal eder**, ses vermez                                                             |
| **Saglik verisini "AI'dan izole" ekleyerek cozmek**       | ⚠️ §3.3 — 2018/10'un onlemleri **saklamaya ve erisime** baglidir, AI'a degil. Izole ama sifresiz bir saglik alani **ihlalin ta kendisidir**                     |
| **"Ekip ozeti" yapisal katkicisi**                        | ⚠️ §5.2 — **katalog, olgu degil**; ADR-0040'in "durgun tedarikci" reddiyle ayni. Ayrica T2'yi (ADR-0042 §3) **ateslerdi** ve tartisma **veri olmadan** acilirdi |
| **`platform/audit` yerine `hr.employee_changes`**         | ⚠️ §6.8 — borc **dorduncu kez** ertelenir, 10. modul ayni tabloyu yeniden yazar                                                                                 |
| **Audit'te `before`/`after` DEGERLERI saklamak**          | ⚠️ §6.5 — maas verisini **ikinci bir tabloya kopyalar** ve §4.2'nin uc katmanini birden deler; maas icin bilgi kaybi da **yoktur**                              |
| **`first_name` / `last_name`**                            | ⚠️ §1.6 — kultur varsayimi; projede ad zaten tek alan                                                                                                           |
| **Unvan icin tenant-tanimli sozluk (ADR-0034 deseni)**    | Deseni tekrarlamak cazip — ⚠️ ama burada bir **soruyu cevaplamiyor** (yon zorlamasi gibi bir kisit yok), yalnizca yazim birligi saglardi. v2                    |

---

## Bilinen sinirlar

- ⚠️ **SAGLIK VERISI YOK** — §3. En cok yanlis anlasilacak sinir budur ve
  **arayuzde de yazilmalidir** (bos not alani yerine bir aciklama).
- ⚠️ **SERBEST NOT ALANI YOK** — kullanicinin **ilk soracagi** eksik (§1.1).
- ⚠️ **Bordro, puantaj, izin, performans, organizasyon semasi YOK** (§11).
- ⚠️ **Modulun `POST /ask`e katkisi YOK** — _"ekipte kim ne yapiyor"_,
  _"kim musait"_ sorulari AI'a **sorulamaz** (§5).
- ⚠️ **Maasa gore siralama/filtre YOK** — siralamanin kendisi sizinti (§4.2).
- ⚠️ **"Toplam maas gideri" diye bir rakam YOK** — iki bagimsiz sebep (§4.4).
- ⚠️ **Kur cevrimi yok** · **para birimi kod listesi dogrulanmaz**
  (`^[A-Z]{3}$`) · **binlik ayraci yok** — ADR-0034'un uc siniri, ikinci kez.
- ⚠️ **`compensation:read` tasiyan herkes TUM calisanlarin maasini gorur** —
  alan/kayit bazli gizlilik **ABAC**tir, backlog'ta. Kaba hali (bir rolden
  izni almak) **tek satirliktir** (§7.1).
- ⚠️ **Calisan kendi kaydini goremez** — self-servis yok (§11).
- ⚠️ **Sarkan `platform_user_id` temizlenmez** — besinci sarkan isaretci; ama
  burada **dogru durumdur** (§2.5).
- ⚠️ **Denetim izi DEGER saklamaz** (§6.5) · **yalnizca `hr.employees`
  baglanir**; ADR-0034/0039/0040/0041'in borclari **acik kalir** (§6.6).
- ⚠️ **Iyimser eszamanlilik yok** — son yazan kazanir; **onuncu** kez ayni
  sinir. ⚠️ Maas icin **gecerli degildir**: defter ekleme-yalnizdir ve
  `UNIQUE (employee_id, effective_from)` cakismayi **veritabaninda** durdurur.
- ⚠️ **Arama yok — ne anlamsal ne klasik**: calisanlar yalnizca yapisal
  filtrelenir. ADR-0011'in FTS kalemi **onuncu** kez acik.
- ⚠️ **Isten ayrilan calisanin verisi silinmez** — KVKK'nin **silme hakki** ile
  yasal saklama yukumlulugunun catismasi **bu ADR'de cozulmuyor**; ROADMAP
  §8.2'nin kontrol noktasina **girdidir** (`finance.transactions`in TTK kalemi
  ile ayni sinif).
- ⚠️ **Retention YIRMIDEN YIRMIIKIYE cikiyor** ve `platform.audit_log`
  **yeni bir sekil** getiriyor: silmek denetlenebilirligi yok eder (§6.7).
- ⚠️ **Tenant bazli saat dilimi yok** — `date` kolonlari (`started_on`,
  `effective_from`) yerel gun kabul eder; cok bolgeli tenant'ta gun sinirinda
  kayabilir. Randevu'nun ayni siniri, ikinci kez.

---

## Uygulama plani (slice'lar)

| Slice | Ne                                                                                                                                                                                                           | Migration             | Durum |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- | ----- |
| **0** | **ADR-0043** (bu belge) — ⚠️ **UC PO ONAYI** (A: `platform/audit` · B: maas · C: ROADMAP guncellemesi)                                                                                                       | —                     | ⏳    |
| **1** | ⚠️ **PLATFORM — `platform/audit`** (kalem A onaylanirsa): `platform.audit_log` + **FORCE RLS** + `shared/audit.port.ts` + adapter + `audit:read` katalogu + `GET /v1/audit`. ⚠️ **Mutlak Kural 1 istisnasi** | `0032_platform_audit` | ⏳    |
| **2** | **Backend IK (TEK slice):** `hr` semasi + iki tablo + CRUD + ekleme-yalniz ucret defteri + `platform_user_id` dogrulamasi + izin katalogu + exception filter + ⚠️ **SIFIR katkici** + audit baglantisi       | `0033_hr_schema`      | ⏳    |
| **3** | **Frontend + HAFIF kapanis denetimi:** liste + detay (ODA, ortak duvar), `hr` rengi, koridorda onuncu kapi, ⚠️ maasin ayrik yuzeyi                                                                           | —                     | ⏳    |

**Cross-modul slice'i YOK ve bu bir atlama degil** — degistirilecek bir
`public.ts` yok (§8.1).

⚠️ **Slice 1 reddedilirse** §6.9 uygulanir ve Slice 2 satir ici damgayla yazilir.

⚠️ **Slice 1 ve 2 AYRI PUSH edilir** ve ikisi de **migration tasir** — yani
ikisi de prod'a gider (CLAUDE.md: her push prod'a dagitim tetikler ve
`preDeployCommand` migration uygular). ⚠️ **Product Owner'a her ikisinden once
acikca haber verilir.**

**Kalem C — ROADMAP guncellemesi (Slice 0'in parcasi):**

1. §3.5 tablosu, 9. satir: _"Maas ve saglik verisi YOK"_ → _"⚠️ Saglik verisi
   YOK (ADR-0043 §3); **maas VAR, AI'dan izole** (ADR-0043 §4)"_.
2. §3.5'in uyari kutusu: saglik gerekcesi **korunur ve guclendirilir**
   (§3.2'nin 7499 notu); maas cumlesi **cikarilir** ve yerine §4.3'un onkosulu
   yazilir.
3. §8.2: KVKK kontrol noktasina ⚠️ **IK maas alani** maddesi eklenir.
4. §8.5: retention listesi **yirmiden yirmiikiye** cikar (§6.7'nin notuyla).
5. §4 (Faz 6) kapi kosuluna: _"IK maas alani KVKK denetiminden gecti mi?"_

---

## Kapanis denetimi (Slice 3) — **HAFIF seviye**

ADR-0034'ten beri kullanilan HAFIF sablon; ⚠️ **iki maddesi bu modulde YENI**.

| #   | Madde                                                                                                                                                                                                                                                                                         | Zorunlu |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-----: |
| 1   | `git status` temiz · `pnpm verify` **cikis kodu 0** (⚠️ ciktiyi grep'lemek yasak — DEVELOPMENT_RULES 5.4)                                                                                                                                                                                     |   ✅    |
| 2   | Uclarin rol turu: viewer okur **yazamaz (403)**, member okur **yazamaz (403)**, ⚠️ **member ve viewer `compensation` uclarinda 403**                                                                                                                                                          |   ✅    |
| 3   | ⚠️ **MAAS IZOLASYONUNUN CANLI KANITI** — (a) `GET /hr/employees` ve detay cevabinda maas **yok** (owner ile bile), (b) contributor registry'de **`hr` onekli hicbir kaynak yok**, (c) `POST /ask` cevabinda ve `ai.call` loglarinda maas **gecmiyor**                                         |   ✅    |
| 4   | ⚠️ **DENETIM IZI CANLI** (kalem A onaylandiysa): unvan degistir → `audit_log`da satir olustu, `changed_fields` **alan adi tasiyor, DEGER TASIMIYOR**; `UPDATE`/`DELETE` denemesi **basarisiz**                                                                                                |   ✅    |
| 5   | Ucret defteri sinavi: ayni gune ikinci kayit **409/422** · ucret kaydi olan calisan silinemez **409** · gelecek tarihli kayit **bugunku maasi degistirmiyor**                                                                                                                                 |   ✅    |
| 6   | `platform_user_id` sinavi: uye olmayan uuid **422** · ayni kullaniciya ikinci calisan **409** · uyeligi iptal edilen kullanicinin kaydi **okunabiliyor** (patlamiyor)                                                                                                                         |   ✅    |
| 7   | ⚠️ **ADR-0036 OLCUMU — ADR-0042 §4'UN YENI PROTOKOLUYLE, ILK KEZ**: uc farkli soru; kaydedilen: (a) giren kaynaklar, (b) ⚠️ **her yapisal kaynagin DONDURDUGU SATIR SAYISI**, (c) ⚠️ **giren ve girmeyen parcalarin SKORU**. ⚠️ Hedef: ADR-0042'nin cevaplayamadigi **iki soruyu** cevaplamak |   ✅    |
| 8   | Fan-out **N=14** olcumu (degismedi — katkici eklenmedi); ⚠️ yine de kaydedilir ki `platform/audit`in **ayni transaction'a** ekledigi maliyet gorunsun                                                                                                                                         |   ✅    |
| 9   | Renk turu: acik **ve** koyu temada; `/app/hr` mor, ⚠️ **kabuk ve `--ai-accent` terracotta**; `app-shell.tsx` `git diff` **bos**                                                                                                                                                               |   ✅    |
| 10  | ODA sinavi (ADR-0038 §6.5): duvar **gercekten ortak**, detayin duvari **yok**; ⚠️ maas bolumu `compensation:read` olmadan **DOM'da bile yok**                                                                                                                                                 |   ✅    |
| 11  | Rota golgelemesi (ADR-0040'in dersi): `/hr/employees/:id/compensation` ile sabit yollar cakismiyor — gercek isteklerle                                                                                                                                                                        |   ✅    |
| 12  | ⚠️ **Belge sinavi:** ROADMAP §3.5 · §8.2 · §8.5 · §4 guncellendi mi (kalem C); ADR-0037'nin "tetikleyici 9. modul" satiri **cevaplandi** mi (§11)                                                                                                                                             |   ✅    |

**Bilincli yapilmayacaklar (HAFIF seviye kurali):** sifirdan kurulum ❌ · iki
tenant'la tam RLS izolasyon turu ❌.

⚠️ **Prod dogrulamasi ZORUNLUDUR** — bu modulun **iki slice'i da migration
tasir** (Randevu ve Tedarikci'de "migration yok" diye atlanmisti; burada
atlanamaz). Kontroller: health 200 · uygulanmis migration **31 → 33** · `hr`
tablolari **RLS + FORCE** · `platform.audit_log` **RLS + FORCE** · uc dar rol
`hr` semasina **kor** · `GET /api/v1/hr/employees` **401**.

---

## Bu karar ne zaman yeniden gozden gecirilir?

- ⚠️ **IK v2 geldiginde** (izin/tatil, performans notu): hem **anlatisal** hem
  **olaysal** icerik girer; §5.3'un dort sorusu **yeniden** sorulur ve
  muhtemelen **T2 atesler**. ⚠️ O gun §4.2'nin uc katmani da yeniden okunur.
- ⚠️ **Saglik verisi talebi geldiginde**: §3.4'un uc onkosulu (KVKK kontrol
  noktasi + ayri ADR + platform seviyesinde sifreleme/2FA) **once** saglanir.
  Bu ADR o gun **degistirilmez**, uzerine yeni bir ADR yazilir.
- ⚠️ **Faz 6'nin KVKK denetiminde** (§4.3): maas alani gecmezse alan
  **kaldirilir ya da rejimi degisir** — bu, kabul edilmis bir cikis kapisidir.
- ⚠️ **Denetim izinde bir DEGERIN gercekten gerektigi gun** (§6.5): karar
  **kosulludur**; alan bazinda deger saklamaya gecilir ve yol **tek yonludur**.
- ⚠️ **Bir baska modul calisan adi istediginde**: `hr.public.ts` acilir —
  ⚠️ ama **once** §4'un izin sorusu cevaplanir (`employee:read` kapisi arayuzun
  **icinde**, ADR-0033'un deseni).
- **Calisan self-servis istendiginde:** ABAC gerekir (ROADMAP §1.1); bu ADR o
  gun **genisletilmez**, ABAC karari once verilir.
- ⚠️ **Kalem A reddedilirse:** §6.9 uygulanir ve borcun **dorduncu ertelemesi**
  ADR-0041 §8.3'un cumlesiyle birlikte kaydedilir.
