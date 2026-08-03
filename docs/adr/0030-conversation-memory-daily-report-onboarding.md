# 0030 — Faz 4 genisleme: Konusma hafizasi, gunluk rapor, onboarding

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-02
- **Karar veren:** Product Owner
- **Faz:** 4

## Baglam

[ADR-0029](0029-knowledge-module-ai-context-engine.md) Faz 4'un kapsamini
**bilincli dar** tutmustu: manuel metin girisi + serbest soru-cevap. Product
Owner karariyla uc ozellik daha Faz 4'e dahil edildi:

1. **Konusma hafizasi** — `/knowledge/ask` bugun her soruyu sifirdan ele aliyor;
   ardisik sorular birbirini bilmiyor.
2. **Gunluk rapor** — tenant'ta son 24 saatte eklenen notlarin AI ozeti.
3. **Onboarding** — ilk kullanicidan yapilandirilmis baglam toplamak.

Bu ADR uculunu de tanimlar. ADR-0029'un veri modeli, chunking, RLS sablonu ve
port disiplini **aynen gecerlidir**; burada yalnizca UZERINE eklenenler vardir.

Ucu de tek bir ADR'de cunku ikisi ayni altyapiyi paylasiyor (konusma hafizasi ve
gunluk rapor `LLMPort.complete()`'i kullanir) ve ucuncusu (onboarding) var olan
not olusturma akisinin uzerine oturur — ayri ADR'ler yapay bir bolme olurdu.

## Karar

### 1. Konusma hafizasi (v1 — bilincli sinirli)

#### 1.1 Veri modeli

`knowledge` semasinda, RLS `ENABLE` + `FORCE` (MT §12.2 standart sablonu —
ADR-0029'un `notes`/`note_chunks`'i ile BIREBIR ayni desen).

| Tablo | Kolonlar |
| ----- | -------- |
| `knowledge.conversations` | `id`, `tenant_id`, `user_id`, `created_at` |
| `knowledge.messages` | `id`, `tenant_id` (denormalize), `conversation_id` (FK), `role`, `content`, `created_at` |

`messages.tenant_id` denormalizasyonu `note_chunks` ile AYNI gerekcedir: RLS
politikasi JOIN'siz calisabilsin.

#### 1.2 `/knowledge/ask` degisikligi

`conversation_id` **opsiyonel** olarak kabul edilir. Verilmezse yeni bir
conversation acilir ve id'si yanitta doner.

Retrieval'a ek olarak, o conversation'daki **SON BIRKAC MESAJ CIFTI** sistem
promptuna eklenir — **tumu DEGIL**. Baslangic degeri **3-4 mesaj cifti**, config
uzerinden token butcesine gore ayarlanabilir. Bu sayi ADR'de SABITLENMEZ.

#### 1.3 `LLMPort.complete()` imzasi GENISLETILIR

ADR-0029 §3'teki imza, opsiyonel bir `history` parametresi kazanir:

```
LLMPort.complete({
  systemPrompt,
  userMessage,
  context: string[],
  history?: readonly { role: 'user' | 'assistant', content: string }[]
}): Promise<string>
```

Konusma gecmisi `context: string[]` dizisine **EKLENMEZ**; ayri bir parametredir.
`EmbeddingPort` degismez.

### 2. Gunluk rapor (uygulama ici bildirim, v1)

#### 2.1 Queue karari: **PostgreSQL tabanli zamanlanmis gorev** — BullMQ/Redis DEGIL

ROADMAP'in acik kalemi olan **Queue**, bu isle karara baglandi:

| | Karar |
| --- | --- |
| Mekanizma | `knowledge.daily_report_runs` tablosu + `TenantOutboxRelay` deseninde worker |
| Es zamanlilik | `FOR UPDATE SKIP LOCKED` (outbox tuketicisiyle ayni) |
| Hata yolu | `attempt_count` + `last_error` + ustel backoff + dead-letter (migration `0009` deseni) |
| Idempotency anahtari | **`(tenant_id, report_date)`** — unique |

Ayri bir mesaj kuyrugu teknolojisi (BullMQ, Redis) **KURULMAZ**.

#### 2.2 Rapor icerigi ve teslimat

- **Icerik:** o tenant'ta son 24 saatte eklenen notlarin kisa AI ozeti.
  `LLMPort.complete()` kullanir; **embedding GEREKMEZ** (`EmbeddingPort` bu akista
  hic cagrilmaz).
- **Teslimat:** YALNIZCA uygulama ici — dashboard karti. **E-posta YOK.**
- **Kayit:** `daily_report_runs` satirinin KENDISI kayittir; dashboard en son
  raporu okur. Ayri bir `notifications` tablosu **kurulmaz**.

#### 2.3 Zamanlama

**Sabit UTC saati**, config'ten gelir. Tenant bazli saat dilimi kapsam disi.

#### 2.4 Besinci dar rol: `businessos_report_worker`

Zamanlayici "hangi tenant'larin raporu eksik" sorusunu sormak zorundadir — bu
**tenant'lar ARASI** bir okumadir ve tenant context'i yoktur. `FORCE RLS` altinda
`businessos_app` bunu yapamaz; outbox tuketicisiyle (MT §12.4.2) BIREBIR ayni
problem sinifidir.

Cozum, [ADR-0028](0028-my-memberships-query.md) / MT §12.4.4 deseninin ucuncu
tekrari: `NOLOGIN` + `BYPASSRLS` tasiyan **dar bir rol**, `SECURITY DEFINER`
fonksiyonlarin sahibi, ve sinirlarini DOGRUDAN dogrulayan bir **Constraint 2
esdegeri** entegrasyon testi.

`businessos_outbox_relay` **YENIDEN KULLANILMAZ**: onun sozlesmesi "yalnizca
`platform.outbox`" der ve bu bir testle kanitlanir; yetki eklemek o testi ve
ADR-0028'in sozlesmesini kirardi.

> ### KURAL — ertelenemez
>
> **Bu desen, bir sonraki ihtiyacta (ALTINCI dar rol) GENELLESTIRILMEK
> ZORUNDADIR. Ertelenemez.**
>
> Bu bir oneri degil, KESIN KURALDIR. Besinci rolle birlikte "her arka plan
> sureci icin ayri dar rol" artik bir EGILIMDIR; altincida genel bir arka plan
> calisani modeli (tek rol + kapsamli fonksiyon envanteri, veya rol yerine
> baska bir asim mekanizmasi) tasarlanacak ve mevcut roller ona goc ettirilecektir.
> Altinci rolu "bir kere daha ayni deseni tekrarlayalim" diyerek eklemek bu
> kurali ihlal eder.

### 3. Onboarding (yalnizca frontend)

Ilk kez giris yapan kullaniciya **TEK TEK, sohbet tarzi** 7 soru sorulur —
soru-cevap-soru-cevap akisi, hepsi bir arada bir form DEGIL:

1. Sirketiniz ne is yapiyor?
2. Kac kisilik bir ekipsiniz?
3. Hangi sektordesiniz?
4. Su an en cok zaman harcadiginiz is sureci ne?
5. En buyuk rakipleriniz kim?
6. Su an hangi araclari kullaniyorsunuz?
7. Bu urunden beklentiniz ne?

- Her soru **"Atla"** ile gecilebilir.
- Son soruda kapanis mesaji gosterilir: *"istediginiz zaman daha fazla not
  ekleyebilirsiniz, sistem kullandikca sizi daha iyi taniyacak"*.
- **Cevaplar 7 AYRI not olur** (atlanmayanlar): **baslik = soru, govde = cevap**.
  Tek birlesik not DEGIL.
- **Tetikleme kosulu: tenant'in HIC notu yoksa** wizard gosterilir.
- **Yeni bir yazma uc noktasi GEREKMEZ** — var olan `POST /knowledge/notes`
  kullanilir. Bu tumuyle bir frontend wizard'idir; ayrintili tasarim bu ADR'nin
  konusu degildir.

## Gerekce

**1.3 Neden `history` AYRI parametre, `context` dizisine eklenmiyor.** Uc sebep:

| | `context` | `history` |
| --- | --- | --- |
| Ne | Getirilen **kanit** (chunk'lar) | **Diyalog** turleri |
| Sira | Alaka skoruna gore | Kronolojik, anlamli |
| Rol atfi | Yok | **Var ve yapisal** |

- **Rol bilgisi yapisaldir.** Tek diziye koymak, rolleri string'e gomeyi zorunlu
  kilar (`"Kullanici: ...", "Asistan: ..."`). Yapiyi metne gommek, sonradan
  ayristirilamayan bir kayiptir ve her adapter'in ayni gomme/cozme isini yeniden
  icat etmesini gerektirir.
- **Token butcesi yonetilemez hale gelir.** Baglam sigmadiginda "en eski mesaj
  ciftini at" ile "en dusuk skorlu chunk'i at" FARKLI kararlardir. Tek dizide bu
  ikisi ayirt edilemez.
- **Formatlama is mantigina kacar.** Rolleri metne cevirmek bir SUNUM detayidir ve
  adapter'a aittir; `context`'e ekleseydik use case bunu yapmak zorunda kalirdi.

**ADR-0007 ihlal EDILMIYOR.** `messages: [{role, content}]` DeepSeek'e ozgu bir
kavram degildir — OpenAI-uyumlu her sohbet API'sinin YERLI modelidir. Saglayiciya
ozgu olan `thinking` idi ve o adapter'da kaldi (ADR-0029 §3.1). `history`
opsiyoneldir; gunluk rapor akisi onu hic vermez ve etkilenmez.

**Reddedilen ucuncu yol:** gecmisi `systemPrompt`'a string olarak yapistirmak. En
kotusu — hem yapiyi kaybeder hem formatlamayi cagirana yukler.

**2.1 Neden BullMQ/Redis DEGIL.**

- **Olcek orantisiz.** Tenant basina gunde **BIR** is. Bunun icin Redis'e
  baglanmak, BullMQ'yu, kuyruk izlemeyi ve yeni bir operasyon yuzeyini projeye
  sokmak demektir.
- **Yan etkisi Cache kararini ZORLARDI.** Redis container'i ayakta ama uygulama
  baglanmiyor (ADR-0010; Cache hala ROADMAP'te acik bir kalem). BullMQ eklemek,
  kucuk bir ozellik icin Cache/Redis kararini **dolayli olarak vermis** olurdu.
- **Desen zaten kanitlandi.** `SKIP LOCKED` + backoff + dead-letter bu projede
  yazildi ve entegrasyon testleriyle dogrulandi. Cok-instance guvenligi bedava gelir.
- **Idempotency naif cron'dan IYIDIR.** `(tenant_id, report_date)` anahtariyla
  worker "bugunun raporu uretilmemis tenant'lari" arar. Kacirilan tick, yeniden
  baslatma ve cift instance bu modelde KENDILIGINDEN cozulur; bir cron
  tetikleyicisinde cozulmez.

> **Durust cerceve:** bu "Queue kullanmiyoruz" demek DEGILDIR — **kuyruk
> PostgreSQL'dir.** Gercek bir broker; isler cogalinca, fan-out gerekince veya
> saniye alti gecikme istenince dogru olur. O gun geldiginde bu karar yeniden
> gorusulur (bkz. son bolum).

**2.4 Neden besinci rol, mevcut rolu genisletmek yerine.** `businessos_outbox_relay`'in
darligi bir TESTLE kanitlanir (yalnizca `platform.outbox`, `INSERT`/`DELETE` yok,
baska tabloya/fonksiyona erisim yok). Ona rapor tablolarina yetki eklemek o testi
kirar ve ADR-0028'in "asim tek bir imzada toplanir" ilkesini asindirirdi. Iki
asim, iki ayri dar rol — her biri kendi testiyle.

**3 Neden 7 AYRI not.** Soru basina not, retrieval granularitesini temiz tutar
(baslik = sorunun kendisi, dolayisiyla chunk'in ne hakkinda oldugu acik) ve
kullanici ileride tek tek duzeltebilir/silebilir. Tek birlesik not, "kac kisilik
ekipsiniz" cevabini "rakipleriniz kim" cevabiyla ayni chunk'a sikistirabilirdi.

**3 Neden "hic not yoksa" tetiklemesi.** Bugun kullanici/uyelik modelinde
"onboarding tamamlandi" diye bir alan YOKTUR ve bu ADR onu eklemez. "Tenant'in
hic notu yok" kosulu, ek bir kalici alan olmadan dogru sinyali verir: onboarding
zaten ilk notlari uretmek icin vardir.

## Kapsam disi (bugun yapilmiyor)

- **E-posta bildirimi** (gunluk rapor yalnizca uygulama ici)
- **Tenant bazli zaman dilimi** (sabit UTC)
- **Konusma gecmisinin TAMAMINI hatirlama** (yalnizca son birkac mesaj cifti)
- **Rapor ozellestirme** (icerik, siklik ve bicim sabit)
- **Onboarding sorularinin tenant'a gore ozellestirilmesi** (7 soru sabit)

ADR-0029'un kapsam disi maddeleri de aynen gecerlidir (dosya eki, email
entegrasyonu, per-tenant saglayici secimi, Cache, hassas veri redaksiyonu).

## Bilinen sinirlar

- **Bir OKUMA ucu gerekecek.** ADR-0029 yalnizca `POST` uclari tanimlamisti.
  Onboarding tetiklemesi ("tenant'in hic notu var mi") ve gunluk rapor karti
  ("en son rapor") birer okuma gerektirir. Bunlar bu ADR'nin karari degildir ama
  uygulama sirasinda ortaya cikacak KACINILMAZ istir — "onboarding icin yeni uc
  nokta gerekmiyor" ifadesi YAZMA yolu icindir.
- **Konusma gecmisi ozetlenmez, KESILIR.** Son birkac mesaj ciftinin oncesi
  tumuyle unutulur; uzun bir konusmada kullanici basa donerse model hatirlamaz.
  Ozetleme (rolling summary) v1'de yoktur.
- **Rapor "son 24 saat" penceresi sabit.** Hafta sonu hic not eklenmediyse bos bir
  rapor uretilir; bos raporu atlama kurali v1'de yoktur.
- **Besinci `BYPASSRLS` yuzeyi.** Her yeni dar rol bir izolasyon deligidir; bu
  yuzden dar tutulur ve testle kanitlanir. Bkz. §2.4'teki ertelenemez kural.
- **`daily_report_runs` sinirsiz buyur.** Retention kurali yoktur — mevcut
  `login_attempts` / `verification_code_requests` borcuyla ayni sinifta yeni bir
  kalem.

## Sonuclari

**Olumlu**

- Konusma hafizasi, urunu "her soruyu sifirdan ele alan bir arama kutusu"ndan
  gercek bir asistana yaklastirir — CLAUDE.md'nin "chatbot degil dijital yonetici
  asistani" kurucu cumlesinin ilk somut adimi.
- Gunluk rapor, AI'in KULLANICI SORMADAN deger uretmesinin ilk ornegidir.
- Queue karari, projeye yeni bir operasyon yuzeyi eklemeden verildi; Redis/Cache
  karari acik ve BAGIMSIZ kalmaya devam ediyor.
- Onboarding, Context Engine'e ilk gunden gercek tenant baglami kazandirir —
  "bos sistem" problemini kod yazmadan (yalnizca frontend) cozer.

**Olumsuz / bedeli**

- **Ucuncu kez ayni RLS asim deseni.** Besinci dar rol, izolasyon modelinin
  yuzeyini yine bir miktar genisletiyor. §2.4'teki kural bunun bedelini kabul
  edip sinirini ciziyor.
- **`LLMPort` yuzeyi buyudu.** ADR-0029 "bilerek minimal" demisti; `history` ilk
  genislemedir. Opsiyonel ve saglayici-notr olmasi bedeli sinirliyor, ama
  minimallik artik mutlak degil.
- **Gunluk rapor her tenant icin gunde bir LLM cagrisi demektir** — tenant sayisi
  arttikca ongorulebilir ama SABIT bir maliyet kalemi olusur. Kullanici bu raporu
  hic okumasa bile ucreti oder.
- **Konusma tablolari hizli buyur.** Her soru-cevap iki satir; retention yok.

## Degerlendirilen alternatifler

| Alternatif | Neden secilmedi |
| ---------- | --------------- |
| Konusma gecmisini `context: string[]`'e eklemek | Rol bilgisi string'e gomulurdu (geri donusu olmayan kayip); token butcesinde "eski mesaj" ile "dusuk skorlu chunk" ayirt edilemezdi; formatlama is mantigina kacardi |
| Gecmisi `systemPrompt`'a yapistirmak | Yukaridakinin daha kotusu: yapiyi da formatlama sorumlulugunu da cagirana yukler |
| Konusmanin TAMAMINI gondermek | Token maliyeti sinirsiz buyur; uzun konusmalarda baglam penceresi tasar. v1 icin son birkac cift yeterli |
| **BullMQ + Redis** | Tenant basina gunde bir is icin orantisiz; Cache/Redis karari dolayli olarak verilmis olurdu; yeni operasyon yuzeyi |
| Naif cron (`node-cron` vb.) | Kacirilan tick, yeniden baslatma ve cok-instance sorunlarini COZMEZ; idempotency yine elle yazilirdi |
| `notifications` genel tablosu | Tek bildirim turu icin genel bildirim altyapisi — erken soyutlama |
| `businessos_outbox_relay`'i genisletmek | Constraint 2 testini ve ADR-0028 sozlesmesini kirardi |
| Onboarding cevaplarini TEK not yapmak | Farkli konulardaki cevaplar ayni chunk'a sikisirdi; retrieval granularitesi bozulurdu, kullanici tek tek duzenleyemezdi |
| Onboarding icin `users`/`memberships`'e "tamamlandi" alani | Kalici sema degisikligi; "hic not yok" kosulu ayni sinyali bedelsiz veriyor |

## Bu karar ne zaman yeniden gozden gecirilir?

- **ALTINCI dar rol ihtiyaci dogunca:** §2.4'teki kural devreye girer —
  genellestirme ERTELENEMEZ.
- **Zamanlanmis is sayisi artinca** (birden fazla is turu, fan-out, saniye alti
  gecikme ihtiyaci): gercek bir kuyruk (BullMQ vb.) yeniden degerlendirilir. O gun
  Cache/Redis karariyla BIRLIKTE verilmelidir.
- **Konusmalar uzayinca:** son birkac mesaj cifti yetersiz kalirsa rolling
  summary (gecmisin ozetlenerek tasinmasi) gundeme gelir.
- **Rapor okunmuyorsa:** gunde bir LLM cagrisinin maliyeti, kullanim verisiyle
  karsilastirilir; rapor tembel (yalnizca dashboard acildiginda) uretilebilir.
- **Tenant saat dilimi talebi gelince:** sabit UTC karari ve `report_date`
  anahtarinin tanimi birlikte degisir.
- **Onboarding tamamlanma durumu kalici olarak izlenmek istenirse:** "hic not yok"
  kosulu yetersiz kalir (kullanici tum notlarini silerse wizard tekrar cikar) ve
  kalici bir alan gerekir.
