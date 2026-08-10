# 0033 — Faz 5 / Modul 2: Projeler modulu

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-10
- **Karar veren:** Product Owner
- **Faz:** 5

## Baglam

Faz 5'in ilk modulu (CRM, [ADR-0031](0031-crm-module.md) + [ADR-0032](0032-company-summary.md))
kapandi ve prod'a cikti. ROADMAP §3.5'in ikinci sirasi **Projeler**'dir:
_"Is · teslimat · zaman — CLAUDE.md'nin yurutme hafizasi"_.

**Bu ADR'nin isi ADR-0031'inkinden kucuktur ve bu bilinclidir.** ADR-0031 yalnizca
bir modul tanimlamiyordu; Faz 4'un Knowledge icinde birikmis platform kodunu
disari tasiyordu (port'lar → `shared/`, adapter'lar → `infrastructure/ai/`,
oran siniri ve konusma tablolari → `platform`, retrieval ucu →
`platform/context`). O is **bir kez** yapildi. Projeler o zeminin uzerine oturur:

| Ne                          | CRM'de                            | Projeler'de                       |
| --------------------------- | --------------------------------- | --------------------------------- |
| `EmbeddingPort` / `LLMPort` | Knowledge'dan tasindi             | **`shared/`'dan hazir gelir**     |
| `chunking`                  | Knowledge'dan tasindi             | **`shared/`'dan hazir gelir**     |
| Oran siniri                 | `platform.rate_limits`'e tasindi  | **Bir satir deklarasyon**         |
| Retrieval ucu               | `platform/context` kuruldu        | **Iki katkici kaydedilir**        |
| RLS + `FORCE` sablonu       | MT §12.2'den uygulandi            | Ayni sablon, ucuncu kez           |
| Kaynak bazli izin modeli    | ADR-0025'ten ilk kez uygulandi    | Ayni model, ikinci kez            |
| Modul imza rengi            | Mekanizma kuruldu (FRONTEND §4.8) | **Iki satir** (palet + attribute) |

Yani bu ADR'nin cevaplamasi gereken **gercekten yeni** soru sayisi dorttur ve
hepsi asagida ayri basliklarla ele aliniyor:

1. **Bir modul, baska bir modulun kaydina nasil isaret eder?** (§2) Proje
   opsiyonel olarak bir CRM sirketine baglanir — ama cross-schema FK **yasaktir**
   (Mutlak Kural 5). CRM'de bu sorun **hic dogmadi**: CRM hicbir modulun verisine
   isaret etmiyordu. Projeler, bunu isteyen **ilk modul**dur ve verilecek cevap
   kalan **on modulu de baglar**.
2. **Gorev bir projeye ait olmak ZORUNDA mi?** (§3) ADR-0031 §1.1 ayni sorunun
   CRM'deki halini `interactions.company_id NOT NULL` diye cevaplamisti. Buradaki
   cevap **farklidir** ve farkin gerekcesi yazilmalidir.
3. **Gorev kime atanir — bir kisiye mi, birden fazlasina mi?** (§4)
4. **Yapisal katkici "durgunlugu" nereden bilir?** (§6.2) CRM'in
   `stage_changed_at` cozumu burada dogrudan uygulanamaz.

Geri kalan her sey **kanitlanmis desenin tekrari**dir ve bu ADR'de kisa gecilir.

> ⚠️ **ROADMAP §3.5'teki "zaman" kelimesinin okunusu — KARARA BAGLANDI.** Bu ADR
> onu **son tarih / takvim** olarak okur (gorevin `due_on`'u, projenin
> `started_on` / `due_on`'u). **Zaman TAKIBI** (timesheet, "bu ise 3.5 saat
> harcadim") kapsam disidir (§11). Iki okuma farkli buyuklukte iki modul uretir;
> ayrim Product Owner tarafindan **acikca onaylandi** (2026-08-10).
>
> Ayni onayla iki karar daha kayda gecti: **Projeler → CRM tek yonlu
> bagimliligi** (§2) ve **uc migration'in prod'a gidecegi** (§ Uygulama plani —
> her push oncesi ayrica haber verilir, sonrasinda prod dogrulanir).

## Karar

### 1. Yeni `projects` semasi

Mutlak Kural 5 geregi Projeler kendi semasina sahiptir. Tum tablolar RLS
`ENABLE` + `FORCE` tasir (MT §12.2 standart sablonu),
`tenant_id uuid NOT NULL REFERENCES platform.tenants(id)` icerir, bilesik
index'lerde `tenant_id` **daima ilk kolondur** ve unique kisitlar tenant-scoped'tir
(MT §12.3). **Bu paragrafta yeni bir karar yoktur** — `crm` semasinin birebir
aynisi, ucuncu kez.

| Tablo                           | Kolonlar                                                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `projects.projects`             | `id`, `tenant_id`, `name`, `status`, `description` (nullable), `company_id` (**FK YOK** — §2), `started_on` (`date`, nullable), `due_on` (`date`, nullable), `status_changed_at`, `created_at`, `updated_at` |
| `projects.tasks`                | `id`, `tenant_id`, `project_id` (FK, **sema ici**, **NULLABLE** — §3), `title`, `status`, `due_on` (`date`, nullable), `assignee_user_id` (**FK YOK** — §4), `created_at`, `updated_at`                      |
| `projects.progress_notes`       | `id`, `tenant_id`, `author_user_id`, `project_id` (FK, **NOT NULL**), `task_id` (FK, nullable), `body`, `created_at`                                                                                         |
| `projects.progress_note_chunks` | `id`, `tenant_id` (denormalize), `progress_note_id` (FK), `chunk_index`, `content`, `embedding vector(1536)`, `created_at`                                                                                   |

Notlar — hepsi ADR-0031 §1'in tekrari:

- `progress_note_chunks.tenant_id` denormalizasyonu `note_chunks` /
  `interaction_chunks` ile **birebir ayni** gerekcedir: RLS politikasi JOIN'siz
  calissin.
- `embedding` uzerinde **HNSW**, `vector_cosine_ops`.
- `UNIQUE (progress_note_id, chunk_index)` — yeniden uretimi idempotent kilar.
- `progress_notes` **EKLEME-YALNIZ** bir gunluktur: guncelleme/silme yoktur
  (`crm.interactions` ve `knowledge.notes` ile ayni sinir).

#### 1.1 Tablo neden `notes` degil `progress_notes`

`knowledge.notes` zaten var. Ikinci bir `notes` tablosu, sema nitelemesi kodda
her zaman bulunsa da **insan konusmasinda** ("not tablosu sisti", "notlari
sildim") ve ROADMAP §8.5'in retention listesinde belirsizlik uretir.

Desen zaten CRM'de kuruldu: CRM gorusme kayitlarina `crm.notes` demedi,
**`crm.interactions`** dedi. **Her modul kendi kelimesini alir.** Projeler'in
kelimesi `progress_notes`'tur (arayuzde "Ilerleme notu").

`updates` degerlendirildi ve elendi: `UPDATE` SQL'de ayrilmis bir sozcuktur ve
tirnaksiz tanimlayici olarak kullanilamaz.

### 2. Proje → CRM sirketi: YUMUSAK referans (FK yok), izinle kapili okuma

**Karar: `projects.projects.company_id uuid NULL` tasir, uzerinde FOREIGN KEY
YOKTUR; sirket ADI CRM'in public interface'inden okunur ve bu okuma
`company:read` iznine BAGLIDIR; okuyan her yol, sirketin BULUNAMAMASINA
dayanikli yazilir.**

Bu, bu ADR'nin en onemli karari ve **kalan on modulu de baglar** (Teklif/Fatura
→ Finans, Tedarikci → CRM, Stok → Tedarikci...). Uc parcasi var ve ucu de ayri
bir isi yapar:

**(a) FK yok — cunku yazilamaz.** `crm.companies` baska bir semadir; Mutlak
Kural 5 cross-schema FK'yi yasaklar (tek istisna MT §12.3'un
`platform.tenants` referansidir). Bu bir tercih degil, kisittir.

**(b) Ad denormalize EDILMEZ, public interface'ten okunur.** `company_name`'i
`projects.projects`'e kopyalamak en ucuz yol olurdu ve **yanlistir**: sirket
adini degistiren kullanici, proje listesinde eski adi gormeye devam ederdi.
Turetilebilir bilgiyi kaliciya yazmak ikinci bir dogruluk kaynagi yaratir —
projede dort kez verilmis ayni karar (ADR-0030 §2.1 · ADR-0029 yeniden
indeksleme · ADR-0031 §3 `follow_ups` · §6.2 asagida).

Bunun icin **`crm.public.ts` yazilir** — bugun yoktur. Yuzeyi dar tutulur:

```
CrmPublic:
  findCompanyNames(ids: readonly string[]): Promise<Map<string, string>>
```

Toplu (`ids`), tek sorgu, yalnizca `id → name`. `authz.public.ts` /
`context.public.ts` ile birebir ayni disiplin: **buraya bir sey eklemeden once
sorulacak soru "bunu baska bir IS MODULU bilmek ZORUNDA mi?"**

⚠️ **Bagimlilik yonu TEK YONLUDUR: Projeler → CRM.** Tersi — CRM'in sirket
detayinda o sirketin projelerini gostermesi — **kapsam disidir** (§11) cunku
bir dongu kurardi. Bu tuzak projede bir kez yasandi (Tenant ↔ Identity) ve
cozumu `forwardRef` degil **ucuncu bir modul** oldu (`platform/session`).
Ters yon istenirse ayni cozum uygulanir; iki modulu birbirine baglamak degil.

**(c) Ad okumasi `company:read` iznine BAGLIDIR.** `project:read` tasiyip
`company:read` tasimayan bir kullanici, sirket adini **gormez** (alan bos doner;
ham `company_id` de sizdirilmez). Bu, ADR-0031 §5.3'un dersinin dogrudan
uygulanmasidir: birlesik yuzeyler, izin filtresi olmadan **yetkilendirmeyi
delen yan kapilar** haline gelir. RLS bunu yakalamaz — RLS tenant sinirini
korur, tenant ICINDEKI izin sinirini degil.

**(d) Sarkan isaretci TOLERE EDILIR, gizlenmez.** Sirket silinince `company_id`
sarkta kalir; CRM'in cascade'i baska semaya uzanamaz. Okuyan her yol bunu
**normal bir durum** olarak ele alir ("sirket kaydi silinmis"), bos bir ad ya
da 500 degil. UUID yeniden kullanilmadigi icin bu **veri bozulmasi degildir**;
sadece bayat bir isaretcidir ve her okumada tespit edilir.

**`CompanyDeleted` domain event'i v1'de YAZILMAZ** (§ Bilinen sinirlar).
Gerekce ADR-0031'in `OpportunityWon` icin verdigi gerekcenin aynisidir: bugun
temizlik islevsel bir hata onlemiyor (okuma zaten dayanikli), ve "yayinliyorum
sanip hicbir sey yayinlamayan" yuzeyi buyutmenin bedeli var. **Tetikleyici
acik:** sarkan satirlarin sayisi olculebilir hale gelince ya da ikinci bir modul
ayni referansi isteyince `CompanyDeleted` yayinlanir ve tuketicisi `company_id`'yi
`NULL`'lar.

### 3. Gorev bir projeye ait olmak ZORUNDA DEGILDIR (`project_id` NULLABLE)

**Karar: `projects.tasks.project_id` nullable'dir. `project_id IS NULL` olan
gorevler "Yapilacaklar" kutusudur.**

Bu, ADR-0031 §1.1'in `interactions.company_id NOT NULL` kararindan **bilincli
bir sapmadir** ve gerekcesi yazilmadan gecilemez:

**Ikisi ayni sorun degil.** Bir **gorusme**, tanimi geregi bir sirketle yapilir;
ebeveynsiz gorusme diye bir sey yoktur. Bir **gorev** icin bu dogru degildir —
"faturayi gonder", "domaini yenile" gercek islerdir ve hicbiri bir proje
degildir.

**NOT NULL'un bedeli burada ASIMETRIK ve modulun amacina zarar verir.** Zorunlu
kilinsaydi kullanici, tek gorevlik sahte projeler acardi ("Genel", "Diger",
"Yapilacaklar"). Bu yalnizca cirkin degil, **AI'in gordugu baglami zehirler**:
§6.2'nin "durgun projeler" sorgusu tek gorevlik sahte projelerle dolardi ve
yapisal katkici **guvenle yanlis** cevaplar uretirdi. Modulun var olma sebebi
dogru baglam uretmektir.

**Varsayilan/gizli bir proje kaydi ("Genel") ile cozmek REDDEDILDI:** bu, veriye
sizan sihirli bir satirdir; silinebilir, yeniden adlandirilabilir, ve her sorgu
onu ozel olarak elemek zorunda kalir. Mutlak Kural 9 ("hacky cozum yok").

**Bu POLIMORFIZM DEGILDIR.** ADR-0031 §1.1'in reddettigi sey uc nullable FK +
"tam olarak biri dolu" CHECK'iydi. Burada tek bir opsiyonel ebeveyn var, CHECK
yok, dallanma yok: `WHERE project_id IS NULL` yapilacaklar kutusudur,
`WHERE project_id = $1` projenin gorevleridir.

**Bedeli acikca:** projesiz gorevler **ilerleme notu tasiyamaz** (§1'de
`progress_notes.project_id NOT NULL`). Kabul edildi — bir yapilacak maddesi bir
satirdir, bir konu basligi degil. Alternatifi, notlara polimorfik ebeveyn
vermekti; ADR-0031'in reddettigi sey tam olarak odur.

### 4. Gorev TEK kisiye atanir (`assignee_user_id`, nullable)

**Karar: `assignee_user_id uuid NULL` — tek kolon, ayri `task_assignees` tablosu
YOK.**

**Neden tek.** Cok atamali bir gorevde "kim sorumlu" sorusunun cevabi bir
**listedir** ve liste, sorumluluk demek degildir. §6.2'nin yapisal katkicisinin
en degerli cumlesi _"Ayse'nin uzerinde 3 gecikmis gorev var"_ olacaktir; cok
atama bunu _"3 gecikmis gorevde Ayse'nin de adi geciyor"_a cevirir — daha az
bilgi tasiyan, daha pahali bir cumle.

**Bedeli acikca:** iki kisinin birlikte yurutulen isi tek bir gorevle temsil
edilemez; ya bolunur ya da ikinci kisi not olarak yazilir.

**Gocu kapali degil:** ileride `task_participants` eklenirse `assignee_user_id`
**sorumlu** anlamini korur ve bugunku sorgularin hicbiri degismez. Tersi dogru
degildir — join tablosuyla baslayip sonradan "asil sorumlu" secmek, var olan
satirlar icin cevapsiz bir sorudur.

**FK yoktur** — `crm.interactions.author_user_id` ile ayni desen ve ayni gerekce
(cross-schema FK yasak). Ama **yazma aninda dogrulanir**: atanan kisi, icinde
bulunulan tenant'in **aktif bir uyesi** olmak zorundadir; kontrol platformun
uyelik yuzeyi uzerinden yapilir. Dogrulanmasaydi baska bir tenant'in kullanici
id'si yazilabilirdi — veri sizintisi degil (ad zaten cozulemez) ama **cozulemeyen
bir isaretci** ureten cop veri olurdu.

`NULL` gecerli ve anlamli bir durumdur: **atanmamis gorev**.

⚠️ "Kullanici yalnizca KENDI gorevlerini gorur/atar" bir **ABAC** kuralidir ve
backlog'tadir (ROADMAP §1.1). v1'de `task:read` tasiyan herkes tenant'in tum
gorevlerini gorur.

### 5. Durumlar — kodda enum, tabloda degil; gecis KISITLANMAZ

`MembershipRole` ve `OpportunityStage` ile ayni desen (ADR-0025 §1, ADR-0031 §2).

```
ProjectStatus:  planning | in_progress | completed | cancelled
TaskStatus:     todo | in_progress | done
```

**Kisitlayici durum makinesi YOK** — `completed`'dan `in_progress`'e donmek
dahil. Gerekce ADR-0031 §2'nin birebir aynisi: gercek isde geri donus
**olagandir** (tamamlandi denen is geri acilir), ve engellemek kullaniciyi
durumu guncellememeye — yani **yazilima yalan soylemeye** — iter. Bayat durum,
bayat baglam demektir.

`projects.projects.status_changed_at` tutulur (`stage_changed_at` ile ayni
gerekce): tek kolonluk bir maliyetle _"bu proje 40 gundur 'Devam Ediyor'"_
bilgisi elde edilir. **Durum gecmisi tablosu kapsam disidir.**

Gorevlerde `status_changed_at` **tutulmaz**: gorev kisa omurludur ve
"ne kadardir bu durumda" sorusunun karsiligi gorevde `due_on`'dur.

**Tarihler `date`, `timestamptz` DEGIL** — ADR-0031 §3'un gerekcesi aynen
gecerlidir: son tarih bir **takvim kavramidir** ("Cuma'ya kadar"), bir an degil.
Bu secim tenant bazli saat dilimi sorusunu v1'de **tumuyle ortadan kaldirir**.
Bedeli: gun ici saat verilemez.

### 6. Iki katkici — anlamsal ve YAPISAL

ADR-0031 §5.4'un deseni ikinci kez, **degistirilmeden** uygulanir. Projeler iki
`RetrievalContributor` kaydeder:

| Katkici          | Kaynak                          | Nasil calisir                               |
| ---------------- | ------------------------------- | ------------------------------------------- |
| `project-notes`  | `projects.progress_note_chunks` | Anlamsal — pgvector, CRM/Knowledge ile ayni |
| `project-status` | `projects.projects` + `tasks`   | **Yapisal** — deterministik SQL, SINIRLI    |

Ikisi de cagiranin izinlerine gore elenir (§7): `project-notes` →
`progress_note:read`, `project-status` → `project:read`.

#### 6.1 Yapisal katkicinin cevapladigi uc soru

1. **Acik projeler** — durum, sorumlu gorev sayilari (toplam / bitmis /
   gecikmis), en yuksek onemli N tanesi.
2. **Gecikmis gorevler** — `due_on < CURRENT_DATE AND status <> 'done'`,
   proje ve atanan kisi ile birlikte, sinirli sayida.
3. **Durgun projeler** — asagida.

**Neden yapisal katkici gerekli.** _"Hangi isler gecikti?"_ sorusunun cevabi bir
ilerleme notunda **yazmaz**; `due_on` kolonunda yazar. Yalnizca anlatisal veriyi
gomseydik model bu soruyu bayat notlardan **tahmin ederek** cevaplardi — ve
kendinden emin sekilde yanilirdi. Bu, CRM'de verilmis ayni kararin aynisidir.

**Sabit ve kucuk tutulur.** Bedeli acikca: her soruda gonderilir, yani soru
projelerle ilgisiz olsa bile birkac yuz token maliyeti vardir. CRM'in yapisal
katkicisi zaten ayni bedeli oduyor; **ikisi birlikte** tek `/ask` cagrisinin
sabit tabanini buyutur ve bu artik olculebilir (Slice 0.5'in `ai.call` satirlari).

#### 6.2 "Durgunluk" TURETILIR, kolona YAZILMAZ

Cazip cozum `projects.projects.last_activity_at` kolonuydu: not eklendiginde ve
gorev durumu degistiginde tazelenir. **Reddedildi.**

Turetilebilirdir:

```sql
GREATEST(
  p.created_at,
  p.status_changed_at,
  (SELECT max(created_at) FROM projects.progress_notes WHERE project_id = p.id),
  (SELECT max(updated_at) FROM projects.tasks        WHERE project_id = p.id)
)
```

Kolona yazmak **ikinci bir dogruluk kaynagi** yaratir ve iki kaynak zamanla
birbirini yalanlar — bu karar projede simdi **besinci kez** veriliyor
(`daily_report_runs.status`'un reddi · yeniden indeksleme is listesi · yetim not
tespiti · `follow_ups` tablosunun reddi). Bir tazeleme yolu unutuldugunda hata
**sessizdir**: proje canliyken "durgun" gorunur ve AI yanlis uyarir.

Tenant basina proje sayisi onlarla olculur; sorgu ucuzdur. Olculebilir bir
darbogaz cikarsa cozum kolon degil, **materialize edilmis gorunumdur** — o
zaman tazeleme yolu tektir ve unutulamaz.

`status_changed_at`'in kolon olmasiyla celiskili degildir: o bir **durum
makinesi damgasidir** (degisim aninda yazilir, baska hicbir yerden turetilemez),
`last_activity_at` ise bir **toplamadir**.

### 7. Izinler — kaynak bazli

ADR-0025'in `resource:action` modeli, ADR-0031 §6'nin dagitimiyla birebir.

| Permission             | owner | admin | member | viewer |
| ---------------------- | :---: | :---: | :----: | :----: |
| `project:read`         |  ✅   |  ✅   |   ✅   |   ✅   |
| `project:write`        |  ✅   |  ✅   |   ✅   |   ❌   |
| `project:delete`       |  ✅   |  ✅   |   ❌   |   ❌   |
| `task:read`            |  ✅   |  ✅   |   ✅   |   ✅   |
| `task:write`           |  ✅   |  ✅   |   ✅   |   ❌   |
| `task:delete`          |  ✅   |  ✅   |   ❌   |   ❌   |
| `progress_note:read`   |  ✅   |  ✅   |   ✅   |   ✅   |
| `progress_note:create` |  ✅   |  ✅   |   ✅   |   ❌   |

- **`delete` neden `write`'tan ayri** — ADR-0031 §6 ile ayni gerekce: silme geri
  alinamaz ve **AI hafizasindan da siler** (§8'deki cascade).
- **`progress_note` neden `create`, `write` degil** — ekleme-yalniz gunluk;
  `interaction:create` / `note:create` ile ayni adlandirma. Var olmayan bir
  fiili deklare etmek yanlis olurdu.
- **`task:delete` VAR, `interaction`'da yoktu** — gorevler gunluk kayit degil,
  **yasayan is kalemleridir**; yanlis acilmis bir gorev silinebilmelidir.
- **`viewer` okuma alir** — CRM'de kurulan cizgi (ADR-0031 §6), degistirilmedi.
- **Modul izni (`projects:read`) YOK** — ADR-0025'in modelini bozardi. Somut
  karsiligi: "gorevleri gorur ama proje butcelerini/notlarini gormez" gibi
  talepler tek satirla ifade edilebilir kalir.

### 8. Silme, cascade ve AI hafizasi

`projects.projects` silindiginde: `tasks` → `progress_notes` →
`progress_note_chunks` **`ON DELETE CASCADE` ile birlikte gider.** Zincir sema
icidir, yani veritabani tarafindan garanti edilir.

Projesiz gorevler (`project_id IS NULL`) cascade'e girmez; yalnizca acikca
silinir.

Bu, §2'nin (b)/(d) kararlarinin **karsit ornegidir** ve ikisi karistirilmamalidir:
**sema ICINDEKI** iliskiler FK ve cascade ile garanti edilir; **sema DISINDAKI**
iliskiler yumusak referanstir ve okuma tarafinda tolere edilir. Bir modulun
kendi verisi uzerindeki garantiden vazgecilmez.

### 9. Uclar, oran siniri ve yeniden indeksleme

| Uc                                  | Izin                   | Not                                          |
| ----------------------------------- | ---------------------- | -------------------------------------------- |
| `POST /api/v1/projects`             | `project:write`        |                                              |
| `GET /api/v1/projects`              | `project:read`         | Durum filtresi + sayfalama                   |
| `GET /api/v1/projects/:id`          | `project:read`         | Sirket adi `company:read`'e bagli (§2c)      |
| `PATCH /api/v1/projects/:id`        | `project:write`        | Durum degisince `status_changed_at`          |
| `DELETE /api/v1/projects/:id`       | `project:delete`       | Cascade (§8)                                 |
| `POST /api/v1/projects/tasks`       | `task:write`           | `projectId` opsiyonel (§3)                   |
| `GET /api/v1/projects/tasks`        | `task:read`            | `projectId` / `assignee` / gecikmis filtresi |
| `PATCH /api/v1/projects/tasks/:id`  | `task:write`           |                                              |
| `DELETE /api/v1/projects/tasks/:id` | `task:delete`          |                                              |
| `POST /api/v1/projects/notes`       | `progress_note:create` | **Embedding uretir — oran sinirli**          |
| `GET /api/v1/projects/notes`        | `progress_note:read`   |                                              |
| `POST /api/v1/projects/reindex`     | `progress_note:create` | Parcasiz notlari onarir                      |

**Oran siniri**, `platform.rate_limits` uzerinde **tek** kalem deklare eder:
`create_progress_note` (**SIGORTA** turu — para harcayan tek yazma yolu). Proje
ve gorev yazma yollari AI cagirmaz, dolayisiyla sinirlanmaz — CRM'de verilmis
ayni karar.

**Yeniden indeksleme ILK GUNDEN vardir** (ADR-0031'in ogrendigi ders). Is listesi
**turetilmistir**: `LEFT JOIN ... WHERE chunk IS NULL`. Ayri bir "onarilacaklar"
tablosu ve deneme sayaci **yoktur**.

### 10. Frontend — imza rengi ZEYTIN, AI'in sesi terracotta

Renk **uretilmez**; `module-colors.css`'te ayrilmis palet kullanilir:

```
[data-module='projects']   acik: #717325 / ink #60620c
                           koyu: #a8ac5f / ink #b9bd70
```

⚠️ **Anahtar `projects`'tir, `projeler` DEGIL.** On iki modulun hepsi Ingilizce
anahtar tasir ve `sidebar.tsx` zaten `module: 'projects'` yaziyor. Turkce olan
sey **etikettir** ("Projeler"), anahtar degil.

Iki satirlik is (FRONTEND §4.8):

1. `apps/web/src/app/app/projects/layout.tsx` → `<div data-module="projects"
style={{ display: 'contents' }}>` — CRM layout'unun birebir aynisi.
   `display: contents` **zorunludur** (kabuk → icerik `flex`/`min-h-0` zinciri).
2. `sidebar.tsx`'te "Projeler" satiri `SOON`'dan `LIVE`'a tasinir ve `href`
   alir. Satir zaten kendi `module: 'projects'`'ini tasiyor.

**AI'in sesi TERRACOTTA KALIR.** Bu modulde AI'in konustugu yer bugun yalnizca
Panel'dir (`/ask` uzerinden gelen cevaplar ve kaynak atfi) — modul agacinin
disindadir, yani otomatik olarak dogrudur. Modul icinde bir AI yuzeyi
(ADR-0032'nin musteri ozeti gibi bir "proje ozeti") **v1'de yoktur**; eklenirse
`--ai-accent` / `--ai-ink` kullanmak **zorundadir**.

⚠️ `data-module` unutulursa hata **sessizdir**: ekran calisir, yalnizca
terracotta kalir; ne lint ne tip denetimi yakalar. Kapanis denetimi listesine
(§ Kapanis denetimi) bu madde eklendi ve `sidebar.spec.tsx`'in mevcut testi
genisletilir.

Rotalar: `/app/projects` (liste) · `/app/projects/[projectId]` (detay: gorevler +
ilerleme notlari) · `/app/projects/tasks` ("Yapilacaklar" — projesiz + gecikmis).
Ekranlarin ayrintili tasarimi bu ADR'nin konusu degildir; FRONTEND §4.8'in renk
kurali ve Atolye dili baglayicidir.

### 11. Kapsam disi (bugun yapilmiyor)

Karmasik proje yonetimi ozellikleri **acikca** disaridadir:

- **Zaman takibi / timesheet** — "bu ise 3.5 saat harcadim". ROADMAP'in "zaman"
  kelimesi son tarih olarak okundu (§ Baglam uyarisi).
- **Gantt semasi ve takvim gorunumu**
- **Gorevler arasi bagimlilik** ("A bitmeden B baslamaz") — grafik, dongu
  tespiti ve kritik yol demektir; ayri bir modul buyuklugunde
- **Alt gorev hiyerarsisi** (gorevin gorevi)
- **Tekrarlayan gorevler** (her Pazartesi)
- **Kanban surukle-birak siralamasi** — `position` kolonu ve siralama
  bakimi gerektirir; durum sutunlari **gorunum** olarak yapilabilir, elle
  siralama yapilamaz
- **Bildirim / hatirlatma** (e-posta, push) — `EmailPort` var ama bildirim ayri
  bir karardir; CRM'in "Takipler" gorunumu de bildirimsizdir
- **Dosya eki** — object storage karari ROADMAP §3.5'te 5. module bagli
- **Etiket/label · ozel alanlar · proje sablonlari**
- **Kapasite / is yuku planlamasi**
- **Butce ve maliyet** — Finans moduluna ait
- **Cok atamali gorev** (§4) · **proje durum gecmisi tablosu** (§5)
- **Ilerleme notu guncelleme/silme** (ekleme-yalniz gunluk)
- **CRM'den ters yon** — sirket detayinda projelerin listelenmesi (§2, dongu)
- **Proje ozeti** (ADR-0032'nin musteri ozetinin karsiligi) — istenirse ayri ADR
- **Projeler domain event yayinlamaz** (§ Bilinen sinirlar)
- **Klasik metin aramasi** — ADR-0011'in FTS kalemi ucuncu kez gorunur olur

## Gerekce

**Neden bu modul ikinci sirada ve neden hizli bitmeli.** ROADMAP §3.5 sirayi
belirledi. Bu ADR'nin katkisi sirayi degil **maliyeti** dogrulamaktir: yukaridaki
tablo (§ Baglam) tekrar eden desenleri sayiyor ve gercekten yeni olan dort soruyu
ayiriyor. Bir modulun ADR'sinin kisalmasi, mimarinin **ise yaradiginin**
olcusudur; ADR-0031'in acikca hedefi buydu ("Ucuncu modul artik hazir bir zemine oturur").

**Neden §2 bu ADR'nin merkezi.** Cross-modul referans, on iki modullu bir
uruntte **kacinilmaz** bir sorudur ve CRM'de hic sorulmadi (CRM hicbir modulun
verisine bakmiyordu). Verilecek cevap on modulu baglar. Uc secenek vardi:

|                    | Ad'i kopyala (denormalize) | Iliski hic kurulmasin | **Yumusak referans (secilen)** |
| ------------------ | -------------------------- | --------------------- | ------------------------------ |
| Cross-schema FK    | yok                        | yok                   | yok                            |
| Ad guncel kalir    | **hayir** (bayatlar)       | —                     | **evet**                       |
| Izin sinirina uyar | hayir (ad herkese acik)    | —                     | **evet** (§2c)                 |
| Silinen sirket     | ad hayalet olarak yasar    | —                     | tespit edilir, tolere edilir   |
| Urun degeri        | var                        | **yok**               | var                            |
| Modul bagimliligi  | yok                        | yok                   | **Projeler → CRM** (tek yon)   |

Secilen secenegin tek bedeli son satirdir ve **bilincli**: bagimlilik tek
yonludur, dar bir public interface uzerindendir ve makine tarafindan zorlanir
(`import/no-restricted-paths`).

**Neden §3 CRM'den sapiyor.** Sapmanin sebebi tutarsizlik degil, **veri
tabiatinin farki**: gorusme tanimi geregi bir sirketle yapilir, gorev tanimi
geregi bir projeye ait degildir. Tutarli olmak adina NOT NULL yapmak, sahte
projeler uretir ve tam olarak modulun AI'a kazandirmasi gereken baglami bozar.
**Desen tekrari, verinin dogasini ezmeye kadar gitmez.**

## Sonuclari

**Olumlu**

- **Desen ucuncu kez uygulanir ve bu sefer ucuz.** Faz 4'te platform kodu bir
  modulun icinde birikmisti; Faz 5/CRM onu disari tasidi. Bu modul ondan
  **yalnizca tuketici** olarak yararlanir — ADR-0031'in vaadinin ilk sinavi.
- **Cross-modul referans icin bir desen kurulur** (§2) ve kalan on modul icin
  hazir olur: Teklif/Fatura → Finans, Tedarikci → Stok, hepsi ayni uc parcayi
  kullanir (FK yok · public interface · izinle kapili · dayanikli okuma).
- **Tek kurumsal hafiza uc kaynaga cikar.** CLAUDE.md'nin CEO ornegi
  ("CRM'deki musteri hareketleri, Finans'taki nakit akisi, **Projeler'deki
  teslim performansi**") ucte ikisi tamamlanir — kod degismeden, iki katkici
  kaydiyla.
- **Yurutme hafizasi** ilk kez yapisal olarak sorgulanabilir hale gelir:
  "hangi isler gecikti", "kim ne yapiyor", "hangi proje durgun".

**Olumsuz / bedeli**

- **Ilk modul→modul bagimliligi kuruluyor.** Bugune kadar hicbir is modulu
  digerini bilmiyordu; Projeler CRM'i (dar bir yuzeyden) biliyor. Yon tek ve
  yuzey dar, ama sifir degil.
- **Sarkan `company_id` mumkundur** (§2d) ve v1'de temizleyen bir mekanizma yok.
- **Yapisal katki sabit token maliyetini BUYUTUR** — artik iki modul her soruya
  sabit metin ekliyor. Olculebilir (`ai.call`) ama hala zorlanmiyor.
- **Retention borcu 8 → 10 tabloya cikar** (ROADMAP §8.5): `projects.progress_notes`
  - `projects.progress_note_chunks`. Ikincisi `vector(1536)` tasidigi icin yine
    **satir basina en pahali** siniftandir. Dogru retention kolu `progress_notes`'tur
    (chunk'lar cascade ile gider) — `conversations` denetiminde ogrenilen ders,
    ikinci kez ilk gunden uygulaniyor.
- **Projesiz gorevler ilerleme notu tasimaz** (§3) — kucuk ama gorunur bir
  tutarsizlik hissi uretir.
- **Projeler v1 bir proje yonetim araci degildir**: zaman takibi yok, bagimlilik
  yok, Gantt yok, bildirim yok. Bilincli, ama kullaniciya eksik hissettirecektir
  — CRM v1'in ayni bedeli.

## Degerlendirilen alternatifler

| Alternatif                                                | Neden secilmedi                                                                                                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`crm` semasini genisletmek** (projeler orada)           | Mutlak Kural 5; ADR-0031'in `knowledge` icin verdigi ayni cevap                                                                                                  |
| **`company_id`'ye cross-schema FK**                       | Mutlak Kural 5 — tartisma konusu degil                                                                                                                           |
| **`company_name`'i kopyalamak (denormalize)**             | Sirket yeniden adlandirilinca **bayatlar**; ikinci dogruluk kaynagi. Ayrica ad, `company:read` tasimayan kullaniciya da sizardi                                  |
| **Sirket iliskisini hic kurmamak**                        | "Bu musteri icin ne yapiyoruz" urunun en dogal sorusu; cross-modul baglam bu urunun **kendisi**                                                                  |
| **CRM'in de projeleri gostermesi (cift yon)**             | Modul dongusu. Projede bir kez yasandi (Tenant ↔ Identity) ve cozum `forwardRef` degil ucuncu bir modul oldu                                                     |
| **`project_id NOT NULL`** (her gorev bir projeye ait)     | Sahte "Genel" projeleri uretir; §6.2'nin "durgun proje" sorgusu bozulur — yani AI'in gordugu baglam zehirlenir                                                   |
| **Varsayilan/gizli "Genel" projesi**                      | Veriye sizan sihirli satir; silinebilir, yeniden adlandirilabilir, her sorgu onu elemek zorunda kalir (Mutlak Kural 9)                                           |
| **Polimorfik not ebeveyni** (proje VEYA gorev, CHECK ile) | ADR-0031 §1.1'in reddettigi sey; dogal hiyerarsi (proje NOT NULL + gorev daraltmasi) ayni isi kisitsiz yapar                                                     |
| **Cok atamali gorev** (`task_assignees` join tablosu)     | "Kim sorumlu" cevabini listeye cevirir; yapisal katkicinin en degerli cumlesini zayiflatir. Gec eklemek mumkun, geri almak degil                                 |
| **`last_activity_at` kolonu**                             | Turetilebilir bilgiyi kaliciya yazmak — projede besinci kez reddedilen ayni karar. Bir tazeleme yolu unutulunca hata **sessizdir**: canli proje "durgun" gorunur |
| **Gorevlerde `status_changed_at`**                        | Gorev kisa omurludur; "ne kadardir bu durumda" sorusunun karsiligi `due_on`'dur. Kolon basina bedel, kazanci karsilamiyor                                        |
| **Kisitlayici durum makinesi**                            | Gercek isde geri donus olagandir; engellemek kullaniciyi durumu guncellememeye iter ve AI bayat veriyle cevap verir (ADR-0031 §2)                                |
| **`due_at timestamptz`**                                  | Tenant saat dilimi sorusunu v1'e sokar (kapsam disi). Son tarih bir takvim gunudur                                                                               |
| **Ayri `projects.rate_limits`**                           | `platform.rate_limits` zaten var; ADR-0031 §4.2'nin tam olarak onledigi cogalma                                                                                  |
| **`projects:read` / `projects:write`** (modul bazli izin) | ADR-0025'in `resource:action` modelini bozar; CRM'de zaten reddedildi                                                                                            |
| **Tek katkici** (yalnizca anlamsal)                       | "Hangi isler gecikti" bir notta yazmaz, `due_on` kolonunda yazar; model bayat notlardan **tahmin ederek** ve kendinden emin sekilde yanilirdi                    |
| **Tablo adi `projects.notes`**                            | `knowledge.notes` ile insan konusmasinda ve retention listesinde karisir; CRM `crm.notes` demeyip `crm.interactions` dedi — her modul kendi kelimesini alir      |
| **Tablo adi `projects.updates`**                          | `UPDATE` SQL'de ayrilmis sozcuk; tirnaksiz tanimlayici olamaz                                                                                                    |

## Bilinen sinirlar

- **Sarkan `company_id` temizlenmez.** Sirket silinince proje isaretcisi kalir;
  okuma dayaniklidir ama satir bayattir. **Tetikleyici:** ikinci bir modul ayni
  referansi isteyince ya da sarkan satir sayisi olculunce `CompanyDeleted`
  yayinlanir. Bu, projede **ilk gercek domain event tuketicisi** olacaktir.
- **Projeler domain event YAYINLAMAZ.** Bugun tuketicisi yok; ADR-0031'in
  `OpportunityWon` icin verdigi ayni gerekce. **Tetikleyici:** Finans "proje
  tamamlandi → fatura taslagi" isteyince.
- **"Parcasiz ilerleme notu" MUMKUNDUR** — ADR-0029 §4'un iki transaction'li
  akisinin ayni sonucu. Onarim mekanizmasi ilk gunden var (`POST /projects/reindex`).
- **`progress_note_chunks`'ta model/surum kolonu YOK** — ADR-0029/0031'in ayni
  bilinen siniri.
- **Skorlar kaynaklar arasinda KALIBRE DEGIL** ve bu sorun **buyuyor**: artik
  uc anlamsal kaynak tek havuzda siralaniyor (`knowledge` · `crm-interactions` ·
  `project-notes`). ADR-0031'in "olcum verisi biriktiginde" dedigi gun
  yaklasiyor.
- **Fan-out gecikmesi en yavas katkiciya baglidir** ve N artik **5**'tir
  (2 Knowledge/CRM anlamsal + 2 yapisal + 1 yeni anlamsal). ADR-0031'in "N
  buyudukce zaman asimi butcesi gerekecek" uyarisi **bu modulde gorunur hale
  gelir**; v1'de butce eklenmiyor ama kapanis denetiminde olculur.
- **Arama yalnizca anlamsaldir** — "adinda 'migrasyon' gecen gorevler" gibi
  klasik metin aramasi yok (ADR-0011, ucuncu kez).
- **Tenant genelinde gorunurluk** — v1'de `task:read` tasiyan herkes tum
  gorevleri gorur; "yalnizca kendi ekibim" bir ABAC kuralidir (ROADMAP §1.1).

## Uygulama plani (slice'lar)

Sira, her slice'in **kendi basina calisan** bir sey birakmasina gore kuruldu.

| Slice | Ne                                                                        | Migration              |
| ----- | ------------------------------------------------------------------------- | ---------------------- |
| **1** | `projects` semasi + projeler (CRUD, durum, `status_changed_at`) + izinler | `0020_projects_schema` |
| **2** | Gorevler (projesiz dahil) + atama dogrulamasi + gecikmis filtresi         | `0021_projects_tasks`  |
| **3** | Ilerleme notlari + embedding + `reindex` + oran siniri                    | `0022_projects_notes`  |
| **4** | Iki katkici (`project-notes` · `project-status`) + `crm.public.ts` (§2b)  | —                      |
| **5** | Frontend: uc rota, `data-module="projects"`, sidebar `SOON` → `LIVE`      | —                      |
| **6** | Kapanis denetimi (asagidaki liste)                                        | —                      |

`crm.public.ts` **Slice 4'te** yazilir, Slice 1'de degil: proje detayinda sirket
adini gostermek bir okuma zenginlestirmesidir ve modulun calismasi icin sart
degildir. Boylece CRM'e dokunulan tek slice ayrik kalir (Mutlak Kural 1-2).

> ⚠️ **Uc migration prod'a gider.** `feature/tenant-multi-tenancy-core`'a
> yapilan her push Railway'de `db:preflight && db:migrate` calistirir
> (CLAUDE.md). Slice 1, 2 ve 3'un push'lari **oncesinde ayrica haber verilir**.

## Kapanis denetimi (Slice 6) — biriken kontrol listesi

Faz 5/CRM denetimi gibi **gercek isteklerle ve gercek tarayicida** yapilir.

> **YAPILDI — 2026-08-10.** Isaretler denetimin sonucudur; iki maddede metin
> duzeltildi (asagida ⚠️ ile).

- [x] **`/app/projects` ve alt rotalari ZEYTIN gosteriyor mu** — acik **ve**
      koyu temada. `data-module` unutulursa hata sessizdir.
      → Acik `--accent: #717325`, koyu `#a8ac5f`; kabugun rozeti iki temada da
      `#b25628` terracotta kaldi.
- [x] **AI'in sesi terracotta mi** — Panel'den sorulan bir projeler sorusunun
      cevabi ve kaynak atfi.
      → Modul alt agacinda `--ai-accent` iki temada da terracotta
      (`#b25628` / `#e8935a`); Panel cevabi ve takip sorulari yapisal katkiyi
      kullandi.
- [x] On iki uc gercek isteklerle (200/401/403/429), **iki tenant'la RLS
      izolasyonu**, dar rollerin sozlesmesi.
      → Tenant B, A'nin her kaydinda **404**; uc dar rolun `projects` semasina
      `USAGE` yetkisi `false`, tablo grant sayisi `0`.
- [x] **Sarkan `company_id` senaryosu elle uretilir**: sirket silinir, proje
      detayi acilir. > ⚠️ **Bu maddenin metni YANLISTI ve denetimde duzeltildi.** Ilk yazim > _"'sirket kaydi silinmis' gorunmelidir"_ diyordu; bu §2c ile **celisir**. > Uygulama `companyName: null` gelince **hicbir sey yazmaz**, cunku null'in > uc sebebi (ic proje · silinmis sirket · `company:read` yoklugu) AYIRT > EDILMEZ — "silinmis" yazmak, o kullanici icin bir sirketin var oldugunu > **sizdirirdi**. Kod dogru, liste maddesi yanlisti. > → Gercek sonuc: `DELETE /crm/companies/:id` → 204; proje **ayakta** > (HTTP 200), `companyId` sarkta, `companyName: null`, hem detayda hem > listede.
- [ ] **`company:read`'siz kullanici** proje detayinda sirket adini **gormemeli**. > ⚠️ **BUGUN URETILEMEZ** — dort rolun (owner · admin · member · viewer) > **dordu de** `company:read` tasiyor. Kapi `CompanyDirectoryQuery` icinde > vardir ve birim testi onu dogrular, ama **hicbir mevcut rol tetiklemez**. > Madde kapanmadi; tenant-configurable roller (ROADMAP §1.1) geldiginde > gercek istekle sinanabilir hale gelir.
- [x] **Fan-out gecikmesi olculur** (N=5) — zaman asimi butcesi karari icin veri.
      → Bes katkici, bes kaynak dolu, `degradedSources: []`. Toplam 2.8–6.0 s;
      `ai.call` satirlarindan cikarilinca **fan-out'un kendi payi ~70–95 ms**
      (toplam surenin %2–3'u). Darbogaz retrieval degil `LLMPort.complete`
      (2.4–5.0 s). **Zaman asimi butcesi bugun gerekmiyor**; tetikleyici bir
      katkicinin kendi basina saniyeler surmesi olur, N'in buyumesi degil
      (`Promise.all` paraleldir, maliyet en yavas katkicidir).

## Bu karar ne zaman yeniden gozden gecirilir?

- **Ucuncu modul (Finans) `company_id` benzeri bir referans isteyince:** §2'nin
  uc parcali deseni ilk kez **tekrarlanir** ve ancak o zaman desen olur;
  genellestirme (ortak bir `ExternalRef` yardimcisi) o gun degerlendirilir.
- **`CompanyDeleted`'in ikinci talibi cikinca:** olay yayinlanir ve projede ilk
  gercek domain event tuketicisi yazilir.
- **Zaman takibi talebi gelince:** ayri ADR — `tasks`'a saat kolonu eklemek
  degil, ayri bir `time_entries` tablosu ve ayri bir izin seti demektir.
- **Cok atama talebi gelince:** `task_participants`; `assignee_user_id`
  **sorumlu** anlamiyla korunur.
- **Fan-out gecikmesi olculunce (N=5):** zaman asimi butcesi ve muhtemelen
  rerank; skor kalibrasyonu o gun kapanir.
- **"Yalnizca kendi ekibimin isleri" talebi gelince:** ABAC backlog'dan cikar
  (ROADMAP §1.1, ADR-0025).
