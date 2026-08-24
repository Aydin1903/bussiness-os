# 0044 — IK v2: izin takibi, ucret duzeltme ve zenginlestirilmis calisan kaydi

- **Durum:** Kabul edildi (Product Owner: _"en optimum sekilde yap"_)
- **Tarih:** 2026-08-24
- **Karar veren:** Product Owner
- **Faz:** 5

## Baglam

[ADR-0043](0043-ik-personel-modulu.md) uc slice'ta uygulandi ve ekranlar
calisir hale geldi. Product Owner ekranlari gordukten sonra kapsami REDDETTI:

> _"ucreti duzenleme bolumunu aktif et, izin gunleri vs yok sacma sapan
> moduller olmus hicbir detay yok bir ik cinin ve patronun ihtiyaclarini goz
> onune alarak tekrardan duzenle"_

**Elestiri hakli ve bu ADR onu kabul ederek basliyor.** ADR-0043 §11 izin
takibini, organizasyon semasini ve zengin ozluk alanlarini _"v2"_ diye
ertelemisti; v2 bugundur.

⚠️ **Ama uc talebin ikisi ADR-0043'un BILINCLI kararlarini tersine cevirmek
ISTIYOR ve biri HUKUKI SINIRA dokunuyor.** Bu ADR'nin isi, talebi karsilarken
o iki kararin GEREKCESINI kaybetmemektir:

| Talep              | ADR-0043'te                                            | Bu ADR'de                                                   |
| ------------------ | ------------------------------------------------------ | ----------------------------------------------------------- |
| Ucret duzenleme    | §1.2 defter EKLEME-YALNIZ; §6.2 degistirilemezlik = iz | ⚠️ **DUZELTME KAYDI** ile karsilanir — defter bozulmaz (§1) |
| Izin gunleri       | §11 kapsam disi                                        | ⚠️ **GIRIYOR — ama SEBEP ALANI YOK** (§2)                   |
| "Hicbir detay yok" | §3.5 dar alan kumesi                                   | **Bes yeni alan**, her biri ayni olcutten gecirildi (§3)    |

**Onbirinci sema acilmiyor** — `hr` semasina bir tablo eklenir ve bes kolon
gelir. Migration `0036`.

---

## Karar

### 1. ⚠️ UCRET DUZELTME — "DUZENLEME" DEGIL, DUZELTME KAYDI

**Karar: `compensation_effective_unique` kisiti KALDIRILIR. Ayni yururluk
tarihine ikinci bir kayit yazmak MESRU hale gelir ve bir DUZELTMEDIR.**
Guncel ucret `(effective_from DESC, recorded_at DESC)` ile cozulur.

#### 1.1 Gercek sikayet neydi

Ucret zaten degistirilebiliyordu (yeni yururluk tarihiyle yeni kayit).
Yapilamayan sey **ayni gune yanlis girilen bir tutari duzeltmekti** — o istek
`409` aliyordu. Yani sikayet "degistiremiyorum" degil, **"yazdigim hatayi
duzeltemiyorum"**di ve bu gercek bir kullanilabilirlik acigidir.

#### 1.2 ⚠️ NEDEN YERINDE DUZENLEME (UPDATE/DELETE) DEGIL

ADR-0043 §6.2 su sozu vermisti ve `platform/audit`in maas tarafina HIC
baglanmamasinin gerekcesi oydu:

> _"Maasi kim, ne zaman degistirdi sorusunun cevabi `hr.compensation_records`in
> KENDISIDIR: her degisiklik yeni bir satirdir ve satir `recorded_by_user_id` +
> `recorded_at` tasir."_

Yerinde duzenlemeye izin vermek bu cevabi **yok eder** — ve o gun maasi
`platform/audit`e baglamak ZORUNLU hale gelirdi, yani §4.2'nin izolasyonunu
delen bir kopya daha dogardi (§6.5'in tam olarak reddettigi sey).

Duzeltme kaydi ayni kullanici deneyimini verir, geçmisi KAYBETMEZ:

|                        | Yerinde duzenleme | ⚠️ Duzeltme kaydi (SECILEN)          |
| ---------------------- | ----------------- | ------------------------------------ |
| Kullanici ne gorur     | Tutar duzeldi     | Tutar duzeldi                        |
| Gecmis                 | ⚠️ **KAYBOLUR**   | Durur — "duzeltildi" olarak isaretli |
| "Kim ne zaman"         | ⚠️ **CEVAPSIZ**   | Her iki satirda da damga var         |
| `platform/audit` borcu | ⚠️ **ACILIR**     | Acilmaz                              |

⚠️ Bu, ADR-0039'un **"duzeltilmis bir hata defterde IKI SATIR birakir"**
muhasebe disiplininin ikinci uygulamasidir: _olan biteni gizlemek yerine
gostermek._

#### 1.3 ⚠️ KALDIRILAN KISITIN KORUDUGU SEY BASKA YERDE KORUNUYOR

`compensation_effective_unique`in gerekcesi suydu: _"bugunku maas sorusunun
IKI CEVABI olurdu ve kazanani KARARLI SIRALAMA belirlerdi."_

Kisit kalkiyor ama **belirsizlik dogmuyor**, cunku siralama artik KARARLI
DEGIL ANLAMLI: `recorded_at DESC` — yani **en son yazilan kazanir**, ki bir
duzeltmenin tanimi budur. `id` ucuncu anahtar olarak kalir (ayni milisaniye).

⚠️ Uygulama katmani da degismez: `update` metodu YOK, `compensation:delete`
izni YOK, veritabani yetkisi YOK (`GRANT SELECT, INSERT`). **Defter hala
EKLEME-YALNIZDIR** — degisen tek sey, ayni gune ikinci bir EKLEMENIN mesru
sayilmasi.

#### 1.4 Arayuz sozlesmesi

`GET /hr/employees/:id/compensation` her kaydin `supersededAt` alanini doner:
`null` degilse o satir daha sonra yazilmis bir kayitla **duzeltilmistir**.
⚠️ Alan TURETILIR (kolon YOK): ayni `effective_from` icin daha yeni bir
`recorded_at` varsa doludur. Onbirinci kez ayni karar.

---

### 2. ⚠️ IZIN TAKIBI — GIRIYOR, AMA SEBEP ALANI YOK

**Karar: `hr.leave_requests` tablosu acilir. ⚠️ SERBEST "SEBEP" ALANI YOKTUR
ve izin turleri arasinda "hastalik/raporlu" YOKTUR.**

#### 2.1 ⚠️ BU, ADR-0043 §3'UN SINIRININ TASIYICISIDIR — SUS DEGIL

Bir izin kaydinin en dogal alani "sebep"tir ve oraya **ILK YAZILACAK SEY
"RAPORLU"DUR**. ADR-0043 §3 saglik verisini KVKK m.6 ozel nitelikli veri
rejimi geregi KESIN OLARAK disarida tutmustu; serbest not alani da tam bu
yuzden hic acilmamisti.

Bir "sebep" alani, o sinirin **arka kapisidir**: sinir yerinde gorunur,
kullanici onu ihlal eder ve hata SESSIZDIR — hicbir test kirmizi yanmaz.

⚠️ **Ayni sebeple izin turu numaralandirmasinda `sick` / `raporlu` YOKTUR.**
Bir izin turu olarak "hastalik" secmek, o satiri KVKK m.6 kapsaminda bir
SAGLIK VERISI yapardi — serbest metin olmasa bile. Tur listesi bilincli olarak
saglik ima etmeyen kalemlerden olusur:

| Tur              | Anlami                          |
| ---------------- | ------------------------------- |
| `annual`         | Yillik ucretli izin             |
| `unpaid`         | Ucretsiz izin                   |
| `excuse`         | Mazeret izni                    |
| `administrative` | Idari izin / resmi tatil telafi |

⚠️ **Bunun DURUST BEDELI:** bir isletme raporlu gunleri bu modulde takip
EDEMEZ. Dogru cevap "mazeret" diye yazmak DEGILDIR (o da veriyi orada tutar);
dogru cevap, saglik verisi rejiminin ADR-0043 §3.4'un uc onkosulu
saglandiginda AYRI bir ADR ile acilmasidir. Bu sinir **arayuzde de yazilir**.

#### 2.2 ⚠️ HAK EDIS BIR MEVZUAT KURALI DEGIL, BIR SAYIDIR

**Karar: yillik izin hak edisi `hr.employees.annual_leave_days` kolonunda
tutulur ve IK TARAFINDAN GIRILIR. Sistem kidemden hak edis HESAPLAMAZ.**

Turkiye'de hak edis kidemle degisir (14/20/26 gun) ama bu **ulkeye ozel
mevzuattir** ve ulke degisince bastan yazilir. ADR-0041'in e-fatura gerekcesi
ve ADR-0043 §11'in bordro gerekcesi ile **birebir ayni**: global bir urunun
cekirdegine mevzuat konulmaz.

⚠️ Sistem carpar ve cikarir, KURAL BILMEZ (ADR-0041 §7'nin `tax_rate`
karariyla ayni cumle).

#### 2.3 ⚠️ BAKIYE TURETILIR — KOLON YOK

`kalan = annual_leave_days − (onaylanmis `annual` izinlerin gun toplami)`

Projede **onbirinci** kez ayni karar. Gerekce degismedi ve hatanin seklidir:
kolonda bozulma _sessiz ve makul gorunen yanlis bir sayi_ ("3 gun izniniz
kaldi" — oysa 8), turetmede _olculebilir yavaslik_.

⚠️ Yalnizca `annual` bakiyeden duser: ucretsiz izin bir HAK ETIS TUKETMEZ,
mazeret izni de oyle. Bu ayrim `type` kolonunda yasar, ayri bir bayrakta
degil.

#### 2.4 Onay akisi — SATIR ICI AKTOR DAMGASI

`pending` → `approved` | `rejected`. Karar veren ve zamani satirin kendi
kolonlarindadir (`decided_by_user_id`, `decided_at`).

⚠️ Bu bir DENETIM IZI DEGILDIR ve oyle adlandirilmaz — ADR-0041 §8.2'nin ayni
ayrimi: _bir olay gunlugu "ne oldu"yu sirasiyla anlatir, damga yalnizca SON
DURUMU soyler._ Burada yeterlidir cunku cevaplanacak soru tektir: **"bu izni
kim onayladi"**.

⚠️ `platform.audit_log`a BAGLANMAZ. Gerekce §1.2'nin aynisi: cevap zaten
satirin uzerinde.

#### 2.5 Gun sayisi — TAKVIM GUNU, IS GUNU DEGIL

`days` kolonu YOKTUR; `starts_on`/`ends_on` arasindaki gun sayisi TURETILIR.

⚠️ **IS GUNU HESABI YAPILMAZ** ve bu bir eksik degil bir sinirdir: resmi
tatiller **ulkeye ozel mevzuattir** (§2.2'nin ayni gerekcesi) ve hafta sonu
tanimi bile evrensel degildir. Sistem takvim gunu sayar; isletme "5 gun izin"
derken ne kastettigini kendi bilir.

#### 2.6 ⚠️ IKINCI ROTA ACILIYOR — VE GEREKCESI UCRETINKININ TERSI

ADR-0043 §10 _"IK odasinin TEK calisma yuzeyi vardir"_ diyordu ve gerekcesi
**UCRETE OZGUYDU**: ucret defteri ayri bir rota olsaydi `compensation:read`
tasimayan kullanici icin _"var ama giremiyorum"_ diyen bir sekme kalirdi.
⚠️ **O gerekce hala gecerlidir ve ucret defteri hala calisanin DETAYININ bir
bolumudur** — degisen bir sey yok.

Izin icin durum **tersidir** ve iki sebeple:

1. **`leave:read` DORT ROLE de aciktir** — sekme kimseye kapali kapi
   gostermez, yani §4.2'nin itirazi burada dogmaz.
2. ⚠️ **IK'cinin gunluk sorusu calisan listesinden CEVAPLANAMAZ.** _"Onay
   bekleyen izin var mi"_ demek icin her calisani tek tek acmak gerekirdi. Bir
   yuzeyin var olma sebebi tam olarak budur.

⚠️ **Varsayilan filtre `pending`dir**, "hepsi" degil: arsiv gorunumunde
bekleyen tek bir talep, onaylanmis yuzlerce kaydin arasinda **kaybolurdu** ve
hata SESSIZ olurdu — kimse reddedilmez, sadece kimse cevaplanmaz.

⚠️ Sidebar'a **ikinci bir satir EKLENMEDI**: iki rota bir modulun iki
gorunumudur, iki modul degil (`ProjectTabs`/`CrmTabs` ile ayni karar).
⚠️ Ekranin **duvari YOKTUR** — ADR-0038'in _"duvar ORTAKTIR, tezgah degisir"_
kurali: ikinci bir duvar ayni sayilari IKI KEZ ceker ve aralarinda gecici
tutarsizlik uretirdi.

---

### 3. CALISAN KAYDI ZENGINLESIYOR — BES ALAN

Her biri ADR-0043 §3.5'in olcutunden gecirildi: **"bir alan, v1'in bir
ozelliginin CALISMASI icin gerekli degilse yazilmaz."**

| Alan                  | Neyi calistiriyor                                            |
| --------------------- | ------------------------------------------------------------ |
| `department`          | Ekip bazli filtre + patronun "hangi ekip ne kadar" sorusu    |
| `manager_employee_id` | ⚠️ "Kime bagli" — organizasyon gorunumunun tasiyicisi        |
| `employment_type`     | `full_time`/`part_time`/`contract`/`intern` — kadro gorunumu |
| `work_mode`           | `office`/`remote`/`hybrid` — IK'nin en cok sorulan alani     |
| `contract_ends_on`    | ⚠️ **Yaklasan sozlesme bitisleri** — patronun alarm kalemi   |
| `annual_leave_days`   | §2.2 — hak edis                                              |

⚠️ **KIDEM KOLON DEGILDIR**, `started_on`dan turetilir (onbirinci kararin
ikizi).

⚠️ **HALA YAZILMAYANLAR** (ADR-0043 §3.5 aynen yururlukte): TC kimlik no ·
dogum tarihi · ev adresi · ozel telefon · acil durum kisisi · medeni hal ·
saglik/engellilik/kan grubu · din · sendika. Talep "detay" idi, **"her sey"
degil** — ve KVKK veri minimizasyonu olcutu degismedi.

#### 3.1 ⚠️ `manager_employee_id` — KENDINE REFERANS, DONGU KONTROLU YOK

Kolon `hr.employees`e `ON DELETE SET NULL` ile baglidir: bir yonetici
silinirse astlari yetim kalmaz, yalnizca baglantisiz kalir.

⚠️ **DONGU (A→B→A) VERITABANINDA ENGELLENMEZ** ve bu bilinclidir: bir dongu
kontrolu ozyinelemeli sorgu ister ve her yazmada calisirdi. Bunun yerine
OKUMA tarafi dayanikli yazilir (derinlik siniri) ve arayuz zinciri sinirli
gosterir. ⚠️ Bilinen sinir olarak kaydedildi.

---

### 4. ⚠️ ADR-0036 / ADR-0042 ESIK KONTROLU — SABIT MADDE

CLAUDE.md'nin kalici dersi geregi bu madde ATLANMAZ ve cevap "hayir" olsa bile
YAZILIR.

| #   | Soru                                                       | Cevap                                                                    |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | Bu is **yapisal** bir katkici ekliyor mu?                  | ⚠️ **HAYIR** — iki aday degerlendirildi, ikisi de reddedildi (§4.1)      |
| 2   | Satir donduren yapisal kaynak sayisi kaca cikiyor?         | **6 → 6.** Degismiyor.                                                   |
| 3   | ADR-0042 §3'un **T2** esigini (`2K/3` = **6**) geciyor mu? | ⚠️ **HAYIR** — eklenmedigi icin kapali kaliyor.                          |
| 4   | Geciyorsa ne yapilir?                                      | Gecmiyor. ⚠️ Ama bu is, esigi ates almaya EN YAKIN getiren istir — §4.1. |

#### 4.1 ⚠️ IKI GERCEK ADAY DEGERLENDIRILDI VE IKISI DE REDDEDILDI

ADR-0043 §5.2'de uc aday reddedilmisti ve ucu de **KATALOG** oldugu icin
("sayim, haber degil"). ⚠️ **Bu ADR ile durum DEGISTI**: izin ve sozlesme
bitisi TARIHLI, DURUMU OLAN, GERCEKTEN HABER olan verilerdir. Yani ADR-0043'un
reddi burada AYNEN TEKRARLANAMAZ.

| Aday                         | Neden GERCEK bir aday                      | Neden yine de REDDEDILDI                                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| _"Bugun izinde olanlar"_     | Tarihli, durumu olan, operasyonel bir olgu | ⚠️ **T2 HEMEN ATESLERDI** (6 → 7) ve ADR-0042'nin kendi kurali _"katkici eklenir, taban degistirilmez, revizyon CANLI OLCUMDEN SONRA"_ der. ⚠️ **O olcum BUGUN ALINAMIYOR** (§4.2) — yani karar VERISIZ verilirdi. |
| _"Yaklasan sozlesme bitisi"_ | Gercek bir alarm; patronun kalemi          | Ayni T2 gerekcesi + ⚠️ **§4.3**: IK verisinin `/ask` yoluna girmesi, ADR-0043 §4.2'nin UCUNCU izolasyon katmanini (katkici yoklugu) delerdi.                                                                       |

#### 4.2 ⚠️ OLCUM ARACI BUGUN CALISMIYOR — VE BU BIR PLATFORM BORCUDUR

ADR-0043 Slice 3'un kapanis denetiminde ADR-0042 §4'un ZORUNLU olcumu
(**satir sayisi + skor**) alinmaya calisildi ve **ALINAMADI**: `@nestjs/config`
Zod semasi bilinmeyen env anahtarlarini ELIYOR, yani gecici bir bayrak
`process.env` uzerinden gecmiyor.

⚠️ Sonucu su: **ADR-0042 §4 her modulun kapanis denetiminde bu olcumu zorunlu
kildi, ama olcumu MUMKUN KILAN mekanizma yok.** Kalici bir `retrieval.select`
debug satiri gerekiyor ve bu bir PLATFORM isidir — ADR-0044'un kapsami
disinda, acik borc olarak kaydedildi.

#### 4.3 ⚠️ IK'NIN `/ask`E HICBIR KATKISI OLMAMASI BIR GUVENLIK OZELLIGIDIR

ADR-0043 §4.2'nin ucuncu izolasyon katmani **katkici yokluguydu**: maasin
`/ask` yoluna sizmasi icin once BIR KATKICI YAZILMASI gerekir, yani hata
SESSIZ OLAMAZ. Bir izin katkicisi eklemek o katmani teknik olarak delmez
(izin ≠ maas) ama **kapiyi acar**: ayni modulde bir katkici varken ikincisini
eklemek bir dosya degisikligidir, sifirdan yazmak bir KARARDIR.

**Sonuc: IK v2'de de SIFIR KATKICI.** Bu, `POST /ask` havuzuna hic dokunmayan
tek is modulu olma durumunu KORUR.

---

### 5. Izinler — sema

`hr.leave_requests`: `id` · `tenant_id` · `employee_id` (FK → employees,
`ON DELETE CASCADE`) · `type` · `starts_on` · `ends_on` · `status` ·
`requested_by_user_id` · `requested_at` · `decided_by_user_id` · `decided_at`.

⚠️ **`ON DELETE CASCADE` — `RESTRICT` DEGIL** ve bu, ucret defterinden
BILINCLI SAPMADIR: ucret gecmisi silinirse §6.2'nin denetim cevabi kaybolur;
bir izin kaydinin silinen bir calisandan sonra yasamasi ise anlamsizdir.
⚠️ Ama sonucu kayda geciyor: **ucret kaydi olan calisan hala silinemez**
(RESTRICT), yani pratikte izinler de korunur.

⚠️ **`days` kolonu YOK** (§2.5) · **`reason` kolonu YOK** (§2.1) ·
**`sick` turu YOK** (§2.1).

Kisitlar: `ends_on >= starts_on` · `status` uclusu · ⚠️ **karar tutarliligi**
(`status='pending'` ise `decided_*` NULL, degilse NOT NULL) —
`employees_ended_on_consistency` ile ayni sekil.

⚠️ **CAKISMA KONTROLU YOK**: ayni calisan icin ust uste binen iki izin
yazilabilir. ADR-0035'in randevu carpismasi karariyla ayni sinif — gorunur
kilinir, engellenmez.

---

### 6. Izinler — izin katalogu

| Permission      | owner | admin | member | viewer |
| --------------- | :---: | :---: | :----: | :----: |
| `leave:read`    |  ✅   |  ✅   |   ✅   |   ✅   |
| `leave:request` |  ✅   |  ✅   |   ✅   |   ❌   |
| `leave:decide`  |  ✅   |  ✅   |   ❌   |   ❌   |

⚠️ **`leave:request` GENIS ve bu, `employee:write`ten BILINCLI AYRILMADIR.**
ADR-0043 §7.1 `employee:write`i dar tutmustu: _"bir meslektasin kaydini
degistirmek kimsenin gunluk isi degildir."_ ⚠️ Ama **kendi izinini istemek
tam olarak herkesin isidir** — dar olsaydi modul, izin sisteminin var olma
sebebini karsilamazdi.

⚠️ **`leave:decide` DAR**: onaylamak bir YONETIM islemidir.

⚠️ **`leave:delete` YOKTUR**: reddedilen bir izin `rejected` olur, silinmez —
ADR-0043 §1.4'un "ayrilan calisan silinmez, isaretlenir" karariyla ayni sekil.

⚠️ Ad cakismasi kontrolu (BESINCI kez): `leave` kelimesi hicbir modul
tarafindan alinmamis.

⚠️ **`/ask` izin filtresini YINE tetiklemez** — katkici yok (§4.3).
Filtrenin tek gercek tetikcisi hala Finans'tir; **dokuzuncu** kez ayni kayit.

---

### 7. Kapsam disi (bu ADR'de de yapilmiyor)

| Kalem                             | Neden                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| ⚠️ **Saglik verisi / raporlu**    | ADR-0043 §3 aynen yururlukte; §3.4'un uc onkosulu saglanmadan ACILMAZ                                       |
| **Bordro / puantaj / SGK**        | Ulkeye ozel mevzuat (§2.2'nin ayni gerekcesi)                                                               |
| **Is gunu / resmi tatil takvimi** | §2.5 — ulkeye ozel                                                                                          |
| **Performans degerlendirme**      | Anlatisal + hassas; ayri bir karar                                                                          |
| **Ise alim / aday takibi**        | Ayri modul                                                                                                  |
| **Ozluk dosyasi (belge eki)**     | ADR-0037'nin belge bazli gizlilik sinirI hala acik (ABAC backlog'ta)                                        |
| **Calisan self-servis**           | ⚠️ `leave:request` genis oldugu icin CAZIP hale geldi ama "yalnizca KENDI izinini gorur" bir ABAC kuralidir |
| **Organizasyon semasi cizimi**    | `manager_employee_id` veriyi tasir; gorsel sema ayri bir istir                                              |

---

## Gerekce

**Neden ucret duzenleme "duzenleme" degil.** Cunku ADR-0043 §6.2'nin sozu —
_"maasi kim ne zaman degistirdi sorusunun cevabi defterin kendisidir"_ —
`platform/audit`i maas tarafina baglamamanin TEK gerekcesiydi. Yerinde
duzenleme o cevabi yok eder ve borcu geri getirir. Duzeltme kaydi ayni
kullanici deneyimini verir, hicbir sey kaybetmez.

**Neden izin var ama sebep yok.** Cunku sinir bir cumle degil bir YUZEYDIR:
ADR-0043 §3 saglik verisini disarida tutarken serbest not alanini da
acmamisti — sinir konup yanina bos bir kutu birakmak, onu KULLANICIYA IHLAL
ETTIRMEKTIR. Bir izin "sebep" alani o kutunun ta kendisidir.

**Neden hala sifir katkici.** Cunku bu ADR ilk kez GERCEK bir yapisal aday
uretti ("bugun izinde olanlar") ve tam da bu yuzden karar VERI GEREKTIRIYOR —
T2 hemen atesler ve ADR-0042 _"bir platform karari, onu degistirmesi gereken
veriye sahip olmadan revize edilmez"_ diyor. ⚠️ O veriyi uretecek olcum araci
bugun CALISMIYOR (§4.2). Veri gelmeden eklemek, ADR-0042'nin kendi disiplinini
ilk sinavinda bozmak olurdu.

---

## Sonuclari

**Olumlu**

- IK modulu bir IK'cinin gunluk isini karsilar hale geliyor: izin talebi,
  onay, bakiye, ekip/yonetici/calisma sekli, sozlesme bitisi.
- ⚠️ Ucret duzeltilebiliyor ve **gecmis kaybolmuyor** — denetim cevabi
  yerinde kaliyor, `platform/audit` borcu acilmiyor.
- ⚠️ Saglik verisi siniri **guclenerek** korunuyor: artik yalnizca "yazmadik"
  degil, izin turu numaralandirmasinda ve sema kolonlarinda **yeri yok**.
- `POST /ask` havuzuna hic dokunmayan tek is modulu olma durumu KORUNUYOR.

**Olumsuz / bedeli**

- ⚠️ **Raporlu gunler bu modulde takip EDILEMEZ** — en cok istenecek eksik
  budur ve arayuzde acikca yazilir.
- ⚠️ **Hak edis elle girilir**; kidemden otomatik hesaplanmaz.
- ⚠️ **Is gunu hesabi yok** — takvim gunu sayilir.
- ⚠️ **Yonetici zincirinde dongu veritabaninda engellenmez** (§3.1).
- ⚠️ **Izin cakismasi engellenmez** (§5).
- ⚠️ **`compensation_effective_unique` kalkiyor** — bir kisit gevsiyor.
  Telafi: siralama artik `recorded_at` ile ANLAMLI, kararli-siralamaya
  bagimli degil.
- ⚠️ **ADR-0042 §4'un olcum araci ACIK BORC** (§4.2) — bir sonraki modulun
  kapanis denetimi de ayni duvara carpar.
- ⚠️ Retention: `hr.leave_requests` listeye girer — **yirmiiki → yirmiuc**.

---

## Bu karar ne zaman yeniden gozden gecirilir?

- ⚠️ **Olcum araci calisir hale geldiginde** (§4.2): "bugun izinde olanlar"
  yapisal katkicisi YENIDEN degerlendirilir ve o gun T2 atesler — sira
  degistirilemez (once olcum, sonra karar).
- ⚠️ **Saglik verisi talebi geldiginde**: ADR-0043 §3.4'un uc onkosulu
  saglanir, ayri bir ADR yazilir. Bu ADR o gun degistirilmez.
- **Self-servis istendiginde**: ABAC gerekir (ROADMAP §1.1).
- **Ikinci bir ulke geldiginde**: hak edis ve resmi tatil kararlari (§2.2,
  §2.5) yeniden okunur — ikisi de bilincli olarak mevzuat DISINDA birakildi.
