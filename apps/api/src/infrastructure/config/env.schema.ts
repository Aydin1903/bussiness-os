import { z } from 'zod';

/**
 * Ortam degiskenlerinin tek dogruluk kaynagi.
 *
 * DEVELOPMENT_RULES 2.3: sisteme giren HER dis veri Zod ile dogrulanir.
 * Ortam degiskenleri de dis veridir — process.env tamami `string | undefined`
 * tipindedir ve TypeScript burada hicbir guvence vermez.
 *
 * Dogrulama uygulama acilisinda yapilir ve basarisiz olursa surec BASLAMAZ.
 * Yarim yapilandirilmis calisan bir uygulama, hic acilmayandan tehlikelidir:
 * hatayi deploy aninda degil, ilk musteri istegi geldiginde gosterir.
 */

/**
 * "true"/"false" metnini boolean'a cevirir.
 *
 * z.coerce.boolean() burada KULLANILAMAZ: Boolean("false") === true oldugu icin
 * ozelligi kapatmak isteyen herkes yanlislikla acmis olur.
 */
const booleanFromEnv = z.enum(['true', 'false']).transform((value) => value === 'true');

const postgresUrl = z
  .url()
  .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
    message: 'DATABASE_URL postgres:// veya postgresql:// ile baslamalidir',
  });

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  /** Health cevabinda ve loglarda raporlanir. */
  APP_VERSION: z.string().min(1).default('0.1.0'),

  /**
   * Uygulama runtime'i businessos_app rolu ile baglanir (ARCHITECTURE 3.3).
   * Migration'lar ayri bir URL ve businessos_owner rolu kullanir.
   */
  DATABASE_URL: postgresUrl,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).default(5_000),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_PRETTY: booleanFromEnv.default(false),

  /** Virgulle ayrilmis origin listesi. Bos ise CORS kapalidir. */
  CORS_ORIGINS: z.string().default(''),

  /**
   * Varsayilan KAPALI (fail-closed).
   *
   * API yuzeyini kimlik dogrulamasiz ifsa etmek gereksiz bir kesif yuzeyidir.
   * Varsayilanin acik olmasi, ortam degiskeni unutulan HER ortami — production
   * dahil — ifsa eder. Kapali varsayilanda ise en fazla gelistiricinin dokumani
   * gormemesi olur: yanlis gittiginde bedeli kucuk olan yon budur.
   *
   * Gelistirmede acikca .env icinde acilir.
   */
  SWAGGER_ENABLED: booleanFromEnv.default(false),

  // --- Identity: JWT imzalama (ADR-0020) ------------------------------------
  //
  // VARSAYILAN YOKTUR ve olamaz: ozel anahtar bir SIRDIR: varsayilani olan bir
  // sir, o degiskeni unutan HER ortamda ayni (ve herkesce bilinen) sirdir.
  // Eksikse surec BASLAMAZ — fail closed.

  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),

  /** Aktif imzalama anahtarinin kid'i; JWT basliginda tasinir (rotasyon icin). */
  JWT_SIGNING_KID: z.string().min(1),

  /**
   * base64(PKCS#8 PEM) — Ed25519 OZEL anahtari. Yalnizca Identity tutar.
   *
   * base64: PEM cok satirlidir ve `.env` dosyalarinda satir sonlari guvenilir
   * tasinmaz. Tek satirlik base64 bu sorunu ortadan kaldirir.
   */
  JWT_PRIVATE_KEY: z.string().min(1),

  /** base64(SPKI PEM) — imzalayan anahtarin acik esi; dogrulama icin. */
  JWT_PUBLIC_KEY: z.string().min(1),

  // --- Identity: dogrulama kodu pepper'i (ADR-0019) -------------------------
  //
  // Veritabaninda OLMAYAN sunucu sirri: sizan bir veritabani tek basina kodlari
  // dogrulamaya yetmez. AUTH_ARCHITECTURE Ek A/U3: Faz 3'te `.env`, kalici
  // cozum secret manager (Faz 7).
  VERIFICATION_CODE_PEPPER: z.string().min(16),

  // --- Identity outbox tuketicisi (ADR-0006) --------------------------------
  //
  // Varsayilan ACIK — Swagger'in tersi, ve bilincli olarak.
  //
  // Bu bir ifsa yuzeyi degil, TESLIMAT yoludur: kapali oldugunda hicbir sey
  // patlamaz, kullanicilar yalnizca dogrulama kodlarini hic almaz ve sorun
  // "kayit calismiyor" diye gorunur. Bir ortam degiskenini unutmanin bedeli
  // burada sessiz teslimatsizliktir; o yuzden yanlis gittiginde bedeli kucuk
  // olan yon ACIK olandir.
  //
  // Testlerde ACIKCA kapatilir (test/integration/support/identity-env.ts):
  // arka planda calisan bir zamanlayici, testleri belirsiz hale getirir.
  OUTBOX_RELAY_ENABLED: booleanFromEnv.default(true),

  /** Iki tur arasi bekleme. Kisa tutulur: kod 15 dakika omurludur. */
  OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().min(100).max(600_000).default(5_000),

  /**
   * Tek turda islenecek en fazla kayit.
   *
   * Kilit tur boyunca tutulur (bkz. PublishIdentityEventsUseCase); buyuk batch
   * kilit suresini uzatir ve diger instance'lari bosa dondurur.
   */
  OUTBOX_RELAY_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(20),

  // --- E-posta saglayicisi (ARCHITECTURE 9.3) -------------------------------
  //
  // Varsayilan `console`: gelistirici makinesinde e-posta GONDERILMEZ, icerik
  // loglanir. Varsayilanin `resend` olmasi, anahtari olmayan her ortamda acilis
  // hatasi uretirdi; ayrica kazara gercek e-posta gondermek, gondermemekten
  // pahalidir.
  //
  // Uretimde `console` REDDEDILIR (asagidaki superRefine): o adapter dogrulama
  // kodunu loglar ve bu bir P1 ihlalidir.
  EMAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),

  /** Resend API anahtari — SIRDIR, varsayilani yoktur. */
  RESEND_API_KEY: z.string().optional(),

  /** Gonderen adresi. Resend'de dogrulanmis alan adina ait olmalidir. */
  EMAIL_FROM: z.string().optional(),

  // --- Embedding saglayicisi (ADR-0029 §3, ADR-0030 §1.3) -------------------
  //
  // `EmailPort` ile AYNI desen: saglayici secimi bir ORTAM karari, kod karari
  // degil. `fake` varsayilandir cunku her gelistirici makinesinde ve CI'da
  // OpenAI anahtari bulunmaz — varsayilanin `openai` olmasi, anahtari olmayan
  // her ortamda acilis hatasi uretirdi.
  //
  // ⚠️ Uretimde `fake` REDDEDILIR (asagidaki superRefine): sahte embedding bir
  // sir sizdirmaz ama urunu SESSIZCE islevsiz kilar — arama calisiyor gorunur,
  // sonuclari anlamsizdir. Sessizce yanlis calismak, acilista patlamaktan
  // kotudur (`EMAIL_PROVIDER=console` yasagiyla ayni ilke).
  EMBEDDING_PROVIDER: z.enum(['fake', 'openai']).default('fake'),

  /** OpenAI API anahtari — SIRDIR, varsayilani yoktur. */
  OPENAI_API_KEY: z.string().optional(),

  /**
   * Embedding modeli. Varsayilan `text-embedding-3-small`: cikti boyutu 1536'dir
   * ve `knowledge.note_chunks.embedding` kolonu (migration 0011) TAM olarak bu
   * boyuta gore tanimlidir. Modeli degistirmek kolonu ve TUM saklanan
   * vektorleri yeniden uretmeyi gerektirir (ADR-0029 "Bilinen sinirlar").
   */
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

  // --- Sohbet/completion saglayicisi (ADR-0029 §3, ADR-0030 §1.3) ----------
  //
  // `EmbeddingPort`'tan AYRI yapilandirilir cunku AYRI bir port'tur ve pratikte
  // AYRI bir saglayiciya cozulur: chat DeepSeek'te, embedding OpenAI'da
  // (DeepSeek'in embeddings uc noktasi YOK — canli testle olculdu).
  //
  // `fake` varsayilandir: her gelistirici makinesinde ve CI'da anahtar bulunmaz.
  // Uretimde REDDEDILIR (asagidaki superRefine) — bkz. EMBEDDING_PROVIDER notu.
  LLM_PROVIDER: z.enum(['fake', 'deepseek']).default('fake'),

  /** DeepSeek API anahtari — SIRDIR, varsayilani yoktur. */
  DEEPSEEK_API_KEY: z.string().optional(),

  /**
   * Sohbet modeli. `deepseek-chat` ve `deepseek-reasoner` 2026-07-24'te emekliye
   * ayrildi; gecerli modeller `deepseek-v4-flash` ve `deepseek-v4-pro`
   * (`GET /models` ile dogrulandi).
   */
  LLM_MODEL: z.string().default('deepseek-v4-flash'),

  // --- Knowledge retrieval ayarlari (ADR-0029 §4, ADR-0030 §1.2) ----------
  //
  // ADR-0030 §1.2 acikca "bu sayi ADR'de SABITLENMEZ" der: token butcesine gore
  // ayarlanabilir olmalidir. Bu yuzden kodda sabit DEGIL, config'tedir.

  /** `/ask` sorgusunda cekilecek en yakin parca sayisi (ADR-0029 §4). */
  KNOWLEDGE_RETRIEVAL_LIMIT: z.coerce.number().int().min(1).max(50).default(8),

  /**
   * Sistem promptuna eklenecek gecmis MESAJ sayisi (cift degil, tekil mesaj).
   * Varsayilan 8 = 4 mesaj cifti (ADR-0030 §1.2'nin "3-4 cift" araligi).
   */
  KNOWLEDGE_HISTORY_MESSAGES: z.coerce.number().int().min(0).max(50).default(8),

  /**
   * Not listesinde donen onizlemenin karakter sayisi.
   *
   * Kodda sabit DEGIL: "ne kadari yeterli" bir urun karari ve ekran
   * degistikce degisir. Ust sinir var — onizlemeyi buyutmek, kirpmanin var
   * olma sebebini (megabaytlik yanitlar) geri getirebilir.
   */
  KNOWLEDGE_NOTE_PREVIEW_LENGTH: z.coerce.number().int().min(40).max(2_000).default(280),

  /**
   * Tek `POST /knowledge/reindex` cagrisinda onarilacak EN FAZLA not.
   *
   * ⚠️ Asil frendir. Oran siniri ISTEK SAYISINI baglar, TOKEN harcamasini
   * degil; 10 notluk bir onarim onlarca embedding cagrisi olabilir. Buyutmek,
   * tek istekte harcanabilecek parayi buyutmek demektir.
   */
  KNOWLEDGE_REINDEX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(10),

  // --- Oran siniri (ADR-0029 §5) -----------------------------------------
  //
  // Amac MALIYET KONTROLU. Iki eylem AYRI kovadir: `/ask` butcesini bitirmek
  // not eklemeyi engellemez.
  //
  // ⚠️ Bu sinirlar ISTEK SAYISINI baglar, TOKEN HARCAMASINI degil. Tek bir
  // devasa not, 60 kucuk nottan pahaliya patlayabilir ve sayac bunu gormez
  // (ADR-0029 §5 bilinen sinir).

  /**
   * Saatte soru sayisi / kullanici (ADR-0029 §5 onerisi: 30).
   *
   * Bu bir BUTCEDIR: insan gercekten 30'a yaklasabilir, cunku `/ask` tekrar
   * tekrar yapilan bir eylemdir.
   */
  KNOWLEDGE_ASK_RATE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(30),

  /**
   * Saatte not sayisi / kullanici.
   *
   * Bu bir SIGORTADIR, butce degil: bir insan saatte 60 anlamli not yazamaz;
   * o rakama ancak bir istemci retry hatasi ya da script ulasir. Daha yuksek
   * olmasi "not daha ucuz" demek DEGILDIR — 20 parcali bir not 20 embedding
   * cagrisidir, tek bir `/ask`'tan pahalidir.
   */
  KNOWLEDGE_NOTES_RATE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(60),

  // --- CRM (ADR-0031 Slice 6) ----------------------------------------------

  /**
   * Saatte gorusme sayisi / kullanici.
   *
   * `create_note` ile AYNI deger ve AYNI tur: SIGORTA, butce degil. Bir insan
   * saatte 60 anlamli gorusme yazamaz; o rakama ancak bir istemci retry
   * hatasi ya da script ulasir.
   *
   * AYRI KOVA (ADR-0031 §4.2): Knowledge not payini bitirmis bir kullanicinin
   * gorusme kaydedememesi anlamsiz olurdu. Yeniden indeksleme bu kovayi
   * PAYLASIR — ayri bir kova onarimi butcesiz bir yan kapiya cevirirdi.
   */
  CRM_INTERACTIONS_RATE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(60),

  /**
   * Tek `POST /crm/reindex` cagrisinda onarilacak EN FAZLA gorusme.
   *
   * ⚠️ ASIL FRENDIR. Oran siniri istek SAYISINI baglar, TOKEN harcamasini
   * degil; 10 gorusmelik bir onarim onlarca embedding cagrisi olabilir.
   */
  CRM_REINDEX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(10),

  /**
   * Bir firsat asamada kac gun bekleyince DURGUN sayilir (ADR-0033 Slice 6).
   *
   * ============================================================================
   * SUNUCUDA BIR KARSILIGI ARTIK VAR — ve bu bir DEGISIKLIK
   * ============================================================================
   * `apps/web/src/lib/config/crm.ts` bu esikleri "yalnizca UYARI esikleri, is
   * kurali DEGIL; bu yuzden sunucuda karsiliklari yoktur ve OLMAMALIDIR" diye
   * yaziyordu. O cumle yapisal katkici skoru riske gore verilmeye baslayinca
   * YANLIS hale geldi: esik artik AI'in gordugu siralamayi etkiliyor, yani bir
   * gosterim tercihi olmaktan cikti.
   *
   * ⚠️ VARSAYILAN, WEB TARAFIYLA AYNIDIR (21) — boylece kutudan ciktigi gibi
   * iki taraf ayni seyi "durgun" sayar. Biri degistirilip digeri
   * degistirilmezse ekran "34 gundur bekliyor" diye uyarirken AI o firsati
   * sakin gorebilir; ayrisma SESSIZDIR.
   */
  CRM_STALE_STAGE_DAYS: z.coerce.number().int().min(1).max(365).default(21),

  /**
   * Saatte ilerleme notu sayisi / kullanici (ADR-0033 §9).
   *
   * `CRM_INTERACTIONS_RATE_LIMIT` ile AYNI deger ve AYNI tur: SIGORTA, butce
   * degil. AYRI KOVA — gunun musteri gorusmelerini girmis bir kullanicinin
   * proje ilerlemesini yazamamasi anlamsiz olurdu (ADR-0029 §5'in "iki eylem
   * AYRI KOVADIR" karari, ucuncu kez).
   *
   * Yeniden indeksleme bu kovayi PAYLASIR.
   */
  PROJECTS_NOTES_RATE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(60),

  /**
   * Tek `POST /projects/reindex` cagrisinda onarilacak EN FAZLA not.
   *
   * ⚠️ ASIL FRENDIR. Oran siniri istek SAYISINI baglar, TOKEN harcamasini
   * degil; 10 notluk bir onarim onlarca embedding cagrisi olabilir.
   */
  PROJECTS_REINDEX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(10),

  /**
   * Saatlik FINANSAL YORUM payi, kullanici + tenant basina (ADR-0034 §9).
   *
   * ⚠️ AYRI BIR KOVA — `PROJECTS_NOTES_RATE_LIMIT`/`CRM_...` ile paylasilmaz.
   * Bunlar FARKLI IS AKISLARIDIR: gunun proje notlarini girmis bir kullanicinin
   * ay sonu finans yorumunu yazamamasi anlamsiz olurdu (ADR-0029 §5'in "iki
   * eylem AYRI KOVADIR" karari, DORDUNCU kez).
   *
   * Varsayilan Projeler'inkinden DUSUK: bir donem yorumu gunde onlarca kez
   * yazilan bir sey degildir; ilerleme notu ise akan bir gunluktur.
   *
   * Yeniden indeksleme bu kovayi PAYLASIR.
   */
  FINANCE_COMMENTARIES_RATE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(30),

  /**
   * Tek `POST /finance/reindex` cagrisinda onarilacak EN FAZLA yorum.
   *
   * ⚠️ ASIL FRENDIR. Oran siniri istek SAYISINI baglar, TOKEN harcamasini
   * degil; 10 yorumluk bir onarim onlarca embedding cagrisi olabilir.
   */
  FINANCE_REINDEX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(10),

  /**
   * Randevu notu icin SAATLIK embedding payi (ADR-0035 §9).
   *
   * ⚠️ SAYAC RANDEVU SAYMAZ, EMBEDDING SAYAR. Notsuz bir randevu bu paydan
   * HIC dusmez (`appointments.rate-limits.ts`); yalnizca gercekten vektor
   * uretilen yollar sayilir — not yazma, notu degistirme ve `reindex`.
   *
   * Varsayilan Finans'inkinden YUKSEK: randevu notu akan bir gunluktur (gunun
   * her randevusuna bir satir yazilabilir), donem yorumu ise seyrektir.
   *
   * Yeniden indeksleme bu kovayi PAYLASIR.
   */
  APPOINTMENTS_EMBEDDING_RATE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(60),

  /**
   * Tek `POST /appointments/reindex` cagrisinda onarilacak EN FAZLA randevu.
   *
   * ⚠️ ASIL FRENDIR. Oran siniri istek SAYISINI baglar, TOKEN harcamasini
   * degil.
   *
   * Varsayilan Finans'inkinden YUKSEK cunku bu modulde kayit basina EN FAZLA
   * BIR embedding cagrisi vardir (chunking yok — ADR-0035 §3); Finans'ta bir
   * yorum onlarca cagri uretebilir.
   */
  APPOINTMENTS_REINDEX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),

  /**
   * "Gelmedi orani" alarm esigi (0..1) — ADR-0035 §6.2.
   *
   * Son 30 gunde SONUCLANMIS randevularin (tamamlanan + gelmeyen) bu orandan
   * fazlasina gelinmemisse yapisal katkici EN YUKSEK skoru (0.95) verir.
   *
   * ============================================================================
   * ⚠️ BU BIR GOSTERIM TERCIHI DEGIL — AI'IN GORDUGU SIRALAMAYI ETKILER
   * ============================================================================
   * `CRM_STALE_STAGE_DAYS`in ogrettigi ders BASTAN uygulaniyor. Orada web
   * tarafindaki esik once "sunucuda karsiligi yoktur ve OLMAMALIDIR" diye
   * yazilmisti; yapisal katkici skoru riske gore vermeye baslayinca o cumle
   * YANLIS hale geldi ve duzeltilmek zorunda kalindi.
   *
   * ⚠️ BUGUN WEB TARAFINDA KARSILIGI YOKTUR — randevu arayuzu Slice 5'te
   * yazilacak. O gun bir esik gosterilirse (ornegin "gelmedi orani yuksek"
   * rozeti) `NEXT_PUBLIC_APPOINTMENTS_NO_SHOW_ALERT_RATE` acilmali ve
   * VARSAYILANI BUNUNLA AYNI olmalidir. Ayrisirlarsa hata SESSIZDIR: ekran
   * "yuksek" der, AI takvimi sakin gorur.
   */
  APPOINTMENTS_NO_SHOW_ALERT_RATE: z.coerce.number().min(0).max(1).default(0.2),

  /**
   * Bir proje kac gun hareketsiz kalinca DURGUN sayilir (ADR-0033 §6.1).
   *
   * ============================================================================
   * NEDEN CONFIG — CRM'in sabitlerinden FARKLI
   * ============================================================================
   * `CrmPipelineContributor` limit ve skorunu sabit tutar; onlar TASARIM
   * kararidir. Durgunluk esigi ise ISIN TEMPOSUNA baglidir: iki haftalik sprint
   * yapan bir ajansta 14 gun alarmdir, uzun soluklu bir insaat projesinde
   * normaldir. Tenant bazli olmasi ideal olurdu; bugun kurulum bazli.
   *
   * ⚠️ Hareket TURETILIR (proje damgalari + son gorev + son not); bu deger
   * yalnizca esigi belirler, saklanan bir alani degil.
   */
  PROJECTS_STALE_DAYS: z.coerce.number().int().min(1).max(365).default(14),

  /**
   * Saatlik musteri ozeti URETME payi (ADR-0032 §2).
   *
   * `CRM_INTERACTIONS_RATE_LIMIT`ten AYRI kova: bu `LLMPort.complete`tir
   * (completion), digeri `EmbeddingPort.embed`. Farkli fiyat, farkli is akisi.
   *
   * Varsayilan gorusme payindan (60) belirgin DUSUK: ozet, gun icinde onlarca
   * kez yapilan bir KAYIT eylemi degil, musteriyi aramadan once yapilan bir
   * HAZIRLIK eylemidir. Ustelik israf freni sayesinde tekrarlanan cagrilarin
   * cogu modele hic ulasmaz — bu pay yalnizca GERCEKTEN degisen kaynaklar icin
   * harcanir.
   */
  CRM_SUMMARY_RATE_LIMIT: z.coerce.number().int().min(1).max(1_000).default(20),

  /**
   * Ozete girecek EN FAZLA gorusme — token tavaninin BIRINCI freni.
   *
   * Yuz gorusmesi olan bir musteri icin hepsini gondermek tek cagriyi
   * onlarca kat pahalilastirirdi. Yirmi gorusme, "nerede kaldik" sorusunu
   * cevaplamaya fazlasiyla yeter; daha eskisi zaten ozetin kendisinde degil
   * gorusme akisinda okunur.
   */
  CRM_SUMMARY_CONTEXT_INTERACTIONS: z.coerce.number().int().min(1).max(200).default(20),

  /**
   * Tek bir gorusmeden alinacak EN FAZLA karakter — IKINCI fren.
   *
   * Sayi sinirinin tek basina yetmedigi durum: yirmi gorusmeden biri on bin
   * karakterlik bir toplanti dokumu olabilir. Iki fren birlikte, en kotu
   * durumda bile baglami ONGORULEBILIR bir buyuklukte tutar.
   */
  CRM_SUMMARY_CHARS_PER_INTERACTION: z.coerce.number().int().min(200).max(20_000).default(1_500),

  // --- Gunluk rapor worker'i (ADR-0030 §2) --------------------------------

  /**
   * Kapali olmasi VARSAYILAN degildir — outbox relay ile ayni felsefe: bir
   * arka plan sureci "unutuldugu icin" degil, "bilerek" kapali olmalidir.
   */
  DAILY_REPORT_ENABLED: z.coerce.boolean().default(true),

  /**
   * Worker'in NE SIKLIKTA baktigi — raporun URETILME SAATI DEGIL.
   *
   * Saat `DAILY_REPORT_HOUR_UTC`'dedir. Bu aralik yalnizca "vadesi gelen var
   * mi" sorgusunun sikligidir; kisa olmasi zararsizdir (bos tur tek bir indeks
   * sorgusudur) ve worker'in yeniden baslatildigi gun raporun kacirilmamasini
   * saglar.
   */
  DAILY_REPORT_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(5 * 60_000),

  /** Tek turda uretilecek en fazla rapor. Her biri bir LLM cagrisidir. */
  DAILY_REPORT_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(10),

  /**
   * Raporlarin vadesinin geldigi SABIT UTC saati (ADR-0030 §2.3).
   *
   * Tenant bazli saat dilimi KAPSAM DISI. Bu saatten once o gunun raporu
   * uretilmez — aksi halde "gunluk" rapor, gunun yalnizca ilk saatlerini
   * ozetlerdi.
   */
  DAILY_REPORT_HOUR_UTC: z.coerce.number().int().min(0).max(23).default(6),

  /** Ozetlenecek pencere (ADR-0030 §2.2: son 24 saat). */
  DAILY_REPORT_WINDOW_HOURS: z.coerce.number().int().min(1).max(168).default(24),

  // ==========================================================================
  // NESNE DEPOSU (ADR-0009 · ADR-0037 §5)
  // ==========================================================================
  /**
   * Nesne deposu saglayicisi.
   *
   * ⚠️ `s3` ADI SAGLAYICIYI DEGIL PROTOKOLU soyler. Production **Cloudflare
   * R2**, lokal/CI **MinIO** — ikisi de ayni S3 API'sini konusur ve AYNI
   * adapter'i kullanir. Fark yalnizca `STORAGE_ENDPOINT` +
   * `STORAGE_FORCE_PATH_STYLE`tir. Degiskenin adi `r2` olsaydi, ADR-0009'un
   * onlemek icin var oldugu sey olurdu: saglayici seciminin yapilandirmaya
   * ismiyle kazinmasi.
   *
   * ⚠️ Uretimde `memory` REDDEDILIR (asagidaki superRefine).
   */
  STORAGE_PROVIDER: z.enum(['s3', 'memory']).default('memory'),

  /** S3-uyumlu uc nokta. MinIO: `http://localhost:9000`; R2: hesap uc noktasi. */
  STORAGE_ENDPOINT: z.string().min(1).optional(),

  /**
   * Bolge. R2 icin anlamsizdir ama SDK bir deger ISTER; `auto` R2'nin kendi
   * onerdigi degerdir ve MinIO da onu kabul eder.
   */
  STORAGE_REGION: z.string().min(1).default('auto'),

  STORAGE_BUCKET: z.string().min(1).optional(),
  STORAGE_ACCESS_KEY_ID: z.string().min(1).optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1).optional(),

  /**
   * Path-style adresleme (`<host>/<bucket>`).
   *
   * MinIO'nun varsayilan lokal kurulumunda `true` OLMALIDIR: sanal-host
   * adresleme (`<bucket>.localhost`) DNS geregi cozulmez. R2 ikisini de
   * destekler, dolayisiyla `true` birakmak da calisir.
   */
  STORAGE_FORCE_PATH_STYLE: z.coerce.boolean().default(true),

  // ==========================================================================
  // BELGE / SOZLESME (ADR-0037 §6, §10)
  // ==========================================================================
  /**
   * Belge icin SAATLIK embedding payi (ADR-0037 §10).
   *
   * ============================================================================
   * ⚠️ VARSAYILAN BILEREK KUCUK — VE BU MODULDE ILK KEZ GEREKLI
   * ============================================================================
   * Oran siniri ISTEK sayar, TOKEN harcamasini degil (ADR-0029 §5'ten beri
   * yazili bilinen sinir). Bugune kadar bu sinir YANILTICI DEGILDI: onceki dort
   * modulde bir istek BIR embedding cagrisi uretiyordu, yani sayac ile maliyet
   * arasindaki oran SABITTI.
   *
   * BURADA DEGIL. Bir belge = N parca = N embedding cagrisi ve N, 300'e kadar
   * cikabilir (`DOCUMENTS_MAX_CHUNKS`). Randevu'nunkiyle ayni kova (60) bu
   * modulde onlarca KAT maliyete izin verirdi.
   *
   * ⚠️ Asil fren yine de bu degil `DOCUMENTS_MAX_CHUNKS`tir: kova istekleri
   * sayar, parca siniri her istegin USTUNU kapatir.
   */
  DOCUMENTS_EMBEDDING_RATE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(10),

  /**
   * Tek `POST /documents/reindex` cagrisinda onarilacak EN FAZLA belge.
   *
   * Varsayilan Randevu'nunkinden (25) COK DUSUK ve sebep aynidir: orada bir
   * kayit bir embedding cagrisiydi, burada bir kayit onlarca. Bes belgelik bir
   * parti, en kotu durumda 1500 cagri demektir.
   */
  DOCUMENTS_REINDEX_BATCH_SIZE: z.coerce.number().int().min(1).max(50).default(5),

  /**
   * Kabul edilen EN BUYUK dosya (bayt) — ADR-0037 §6.1.
   *
   * ⚠️ Bu bir R2 siniri DEGIL, SUNUCU BELLEGI siniridir: dosya, MIME tespiti ve
   * metin cikarimi icin bellege alinir (§5.3'un sirasi geregi cikarim
   * YUKLEMEDEN once yapilir — reddedilen hicbir dosya depoya girmez).
   *
   * 20 MB ~ birkac yuz sayfalik bir PDF; v1'in hedefi budur. Asilirsa **413**.
   */
  DOCUMENTS_MAX_FILE_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(200 * 1024 * 1024)
    .default(20 * 1024 * 1024),

  /**
   * Bir belgeden uretilebilecek EN FAZLA parca (ADR-0037 §6.1).
   *
   * ⚠️ ASIL MALIYET FRENIDIR. Sinirsiz birakmak, tek bir yuklemenin dakikalarca
   * suren ve sinirsiz maliyet ureten bir istege donusmesi demekti.
   *
   * 300 parca ~ 375.000 karakter (`TARGET_CHUNK_CHARS` = 1250) ~ 150 sayfa.
   * Asilirsa **422** ve KAYIT ACILMAZ — dosya R2'ye de YAZILMAZ.
   */
  DOCUMENTS_MAX_CHUNKS: z.coerce.number().int().min(1).max(2000).default(300),

  /**
   * Kalem notu icin SAATLIK embedding payi (ADR-0039 §5).
   *
   * ⚠️ SAYAC NE KALEM NE HAREKET SAYAR, EMBEDDING SAYAR — ve bu modulde ayrim
   * EN KESKIN: bu modulun EN SIK islemi HAREKET YAZMAKTIR ve bir hareket
   * HICBIR SEY HARCAMAZ. Bir depo gorevlisi gunde yuzlerce hareket yazar, tek
   * kurus AI maliyeti uretmez (`inventory.rate-limits.ts`).
   *
   * Sayilan yollar: notlu kalem acmak, notu YA DA AD/SKU'yu degistirmek
   * (baglam basligi degistigi icin vektor yeniden uretilir — ADR-0039 §6.2) ve
   * `reindex`.
   *
   * Varsayilan RANDEVU SINIFINDA (60), Belge sinifinda (10) DEGIL: chunking
   * yok, yani kayit basina EN FAZLA BIR embedding cagrisi var. Belge'de bir
   * dosya 300 cagriya kadar cikabiliyordu ve kucuk kova onun icindi.
   *
   * Yeniden indeksleme bu kovayi PAYLASIR.
   */
  INVENTORY_EMBEDDING_RATE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(60),

  /**
   * Tek `POST /inventory/items/reindex` cagrisinda onarilacak EN FAZLA kalem.
   *
   * ⚠️ ASIL FRENDIR. Oran siniri istek SAYISINI baglar, TOKEN harcamasini
   * degil. Randevu'nunkiyle ayni deger (25) ve ayni gerekce: kayit basina en
   * fazla bir cagri.
   */
  INVENTORY_REINDEX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),

  /**
   * "Esige YAKIN" carpani (ADR-0039 §6.1).
   *
   * Miktar `esik * bu carpan` degerinin altina dustugunde yapisal katkici
   * 0.90 (dikkat) verir; esigin kendisinin altina dustugunde 0.95 (alarm).
   * `1.0` yazmak "yaklasma bandi yok" demektir ve mesrudur.
   *
   * ============================================================================
   * ⚠️ BU BIR GOSTERIM TERCIHI DEGIL — AI'IN GORDUGU SIRALAMAYI ETKILER
   * ============================================================================
   * `CRM_STALE_STAGE_DAYS` / `STALE_STAGE_DAYS` ayrismasinin UCUNCU tekrari.
   * ⚠️ BUGUN WEB TARAFINDA KARSILIGI YOKTUR — stok arayuzu Slice 2'de
   * yazilacak. O gun bir "azaliyor" rozeti gosterilirse
   * `NEXT_PUBLIC_INVENTORY_NEAR_THRESHOLD_RATIO` acilmali ve VARSAYILANI
   * BUNUNLA AYNI olmalidir. Ayrisirlarsa hata SESSIZDIR: ekran "yaklasti" der,
   * katkici saglikli sayip 0.75 verir.
   */
  INVENTORY_NEAR_THRESHOLD_RATIO: z.coerce.number().min(1).max(10).default(1.25),

  /**
   * Tedarikci gorusmesi EMBEDDING'i icin saatlik pay (ADR-0040 §6).
   *
   * ⚠️ Ad `SUPPLIERS_EMBEDDING_...`, `SUPPLIERS_INTERACTION_...` DEGIL: sayac
   * GORUSME degil EMBEDDING sayar. Tedarikci olusturmak, kisi eklemek ve bir
   * tedarikciyi yeniden adlandirmak paydan DUSMEZ — hicbiri saglayiciya
   * gitmez. ⚠️ Yeniden adlandirma bu modulde bedava DEGILDIR ama bedeli ANINDA
   * degil, `reindex` calistiginda odenir (ad AYRI SATIRDA yasar — ADR-0039'un
   * "bayatlama penceresi yok" kazanci burada YOKTUR).
   *
   * Varsayilan RANDEVU/STOK SINIFINDA (60), Belge sinifinda (10) DEGIL:
   * chunking yok (§2.2), yani kayit basina EN FAZLA BIR embedding cagrisi var.
   *
   * Yeniden indeksleme bu kovayi PAYLASIR — ayri bir kova, onarimi BUTCESIZ
   * BIR YAN KAPIYA cevirirdi (ADR-0029'un gerekcesi, ALTINCI kez).
   */
  SUPPLIERS_EMBEDDING_RATE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(60),

  /**
   * Tek `POST /suppliers/reindex` cagrisinda islenecek EN FAZLA gorusme.
   *
   * ⚠️ ASIL FRENDIR. Oran siniri istek SAYISINI baglar, TOKEN harcamasini
   * degil. Randevu ve Stok ile ayni deger (25) ve ayni gerekce: kayit basina en
   * fazla bir cagri.
   *
   * ⚠️ BU MODULDE ONARIMIN IKI ISI VAR (ADR-0040 §6): eksik vektoru uretmek VE
   * baslikta denormalize edilmis BAYAT TEDARIKCI ADINI tazelemek. Ikincisi
   * Stok'ta YOKTU (ad ayni satirdaydi), burada VAR.
   */
  SUPPLIERS_REINDEX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),

  /**
   * Bir belgenin EN FAZLA satir sayisi (ADR-0041 §1).
   *
   * ⚠️ Bir GIRDI kuralidir, veri butunlugu kurali degil: uretilen PDF sayfa
   * sayisiyla dogru orantili buyur ve tek istekte sinirsiz satir kabul etmek,
   * bir istegin sunucu bellegini ve yanit suresini SINIRSIZ buyutmesine izin
   * vermek olurdu. ADR-0037'nin `DOCUMENTS_MAX_CHUNKS` siniriyla ayni sinif.
   *
   * ⚠️ SESSIZ KIRPMA YASAK: fazlasi atilmaz, istek 422 ile REDDEDILIR.
   *
   * 200 satir, bir teklif/fatura icin cok genistir (tipik belge 5-20 satir) ama
   * sinirsiz degildir.
   */
  INVOICING_MAX_LINES: z.coerce.number().int().min(1).max(1000).default(200),

  /**
   * Bir teklifin "cevapsiz bekliyor" sayilmasi icin gecmesi gereken GUN
   * (ADR-0041 §4.1).
   *
   * ⚠️ WEB'DE AYNI ESIGI GOSTEREN BIR SABIT VARSA IKISI SENKRON KALMAK
   * ZORUNDADIR — `CRM_STALE_STAGE_DAYS` / `STALE_STAGE_DAYS` ayrismasinin
   * DORDUNCU tekrari. Ayrisirlarsa hata SESSIZDIR: ekran "bekliyor" der,
   * yapisal katkici 0.75 (saglikli) verir.
   *
   * ⚠️ ORAN SINIRI DEGILDIR ve bu modulde oran siniri YOKTUR (§5): embedding
   * uretilmiyor, yani sayilacak bir sey yok.
   */
  INVOICING_STALE_QUOTE_DAYS: z.coerce.number().int().min(1).max(365).default(14),

  /**
   * Geri bildirim YORUMU icin saatlik EMBEDDING payi (ADR-0045 §8).
   *
   * ⚠️ Ad `FEEDBACK_EMBEDDING_...`, `FEEDBACK_RESPONSE_...` DEGIL: sayac GERI
   * BILDIRIM degil EMBEDDING sayar. Kural, ADR-0035'ten beri ayni:
   * **cagri para harciyorsa sayilir, harcamiyorsa sayilmaz.**
   *
   * ⚠️ SAYAC KOSULLU — VE BU, TEDARIKCI'DEN AYRILDIGIMIZ YER:
   * `SUPPLIERS_EMBEDDING_RATE_LIMIT` kosulsuzdu cunku gorusme metni
   * ZORUNLUYDU. Burada yorum OPSIYONELDIR (§1.4) ve YORUMSUZ bir kayit
   * saglayiciya HIC GITMEZ — payi da DUSMEZ.
   *
   * ⚠️ Kosulsuz olsaydi bedel bu modulde DAHA AGIR olurdu: QR kodla YALNIZCA
   * PUAN toplayan bir isletme HICBIR embedding uretmedigi halde saatte 60
   * kayitla SINIRLANIRDI — ve sebebini HIC ogrenemezdi.
   *
   * Varsayilan RANDEVU/STOK/TEDARIKCI SINIFINDA (60), Belge sinifinda (10)
   * DEGIL: chunking yok (§1.2), yani kayit basina EN FAZLA BIR embedding
   * cagrisi var.
   *
   * Yeniden indeksleme bu kovayi PAYLASIR — ayri bir kova, onarimi BUTCESIZ
   * BIR YAN KAPIYA cevirirdi (ADR-0029'un gerekcesi, YEDINCI kez).
   */
  FEEDBACK_EMBEDDING_RATE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(60),

  /**
   * Tek `POST /feedback/reindex` cagrisinda islenecek EN FAZLA kayit.
   *
   * ⚠️ ASIL FRENDIR. Oran siniri istek SAYISINI baglar, TOKEN harcamasini
   * degil. Randevu, Stok ve Tedarikci ile ayni deger (25) ve ayni gerekce:
   * kayit basina en fazla bir cagri.
   *
   * ⚠️ BU MODULDE ONARIMIN TEK ISI VAR (ADR-0045 §8) — Tedarikci'de IKI isi
   * vardi. Ikincisi (BAYAT baslik tazeleme) burada YOKTUR cunku basligin uc
   * bileseni de (tarih · puan · kanal) DEGISTIRILEMEZ (§2): bu modulde
   * BAYATLAMA PENCERESI YOK.
   */
  FEEDBACK_REINDEX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),

  /**
   * Kampanya modulunun saatlik EMBEDDING payi (ADR-0047 §8).
   *
   * ⚠️ Ad `MARKETING_EMBEDDING_...`, `MARKETING_CAMPAIGN_...` DEGIL: sayac
   * KAYIT degil CAGRI sayar. Sonuc notsuz bir kampanya saglayiciya HIC
   * GITMEZ ve paydan DUSMEZ.
   *
   * ⚠️ `PATCH` DE SAYAR ve bu, Geri Bildirim'den AYRILDIGIMIZ NOKTADIR:
   * orada guncelleme YOKTU. Sayilmasaydi, kotasi dolmus bir tenant sinirsiz
   * yeniden gomme yaptirabilirdi — SINIRIN ARKASINDAN DOLASAN BIR YOL.
   */
  MARKETING_EMBEDDING_RATE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(60),

  /**
   * Tek `POST /campaigns/reindex` cagrisinda islenecek EN FAZLA kayit.
   *
   * ⚠️ ASIL FRENDIR (oran siniri istek SAYISINI baglar, token harcamasini
   * degil). Dokuz onceki modulle ayni deger ve ayni gerekce: chunk tablosu
   * YOK, yani kayit basina EN FAZLA BIR cagri.
   *
   * ⚠️ BU MODULDE ONARIMIN IKI ISI VAR (ADR-0047 §8) — Geri Bildirim'de TEK
   * isi vardi: (a) ilk gomme sirasinda cokenler, (b) GUNCELLEME sirasinda
   * vektoru NULL'a cekilenler (§4.2.1).
   */
  MARKETING_REINDEX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),
});

export const envSchema = baseEnvSchema.superRefine((env, ctx) => {
  // Kural basina bir fonksiyon: `superRefine` govdesi buyudukce okunamaz hale
  // gelir ve her yeni saglayici onu biraz daha uzatir. Kurallar ayri
  // fonksiyonlarda durunca, eklenen bir saglayici MEVCUT kurallari okumayi
  // gerektirmez.
  requireResendCredentials(env, ctx);
  requireOpenAiCredentials(env, ctx);
  requireDeepSeekCredentials(env, ctx);
  forbidConsoleEmailInProduction(env, ctx);
  forbidFakeProvidersInProduction(env, ctx);
  requireS3StorageCredentials(env, ctx);
  forbidMemoryStorageInProduction(env, ctx);
});

/** Zod'un `superRefine` baglami — kurallarin ortak imzasi. */
type RefinementContext = z.RefinementCtx;

/** Ham (henuz cikarilmamis) env; kurallar yalnizca okudugu alanlari bilir. */
type RawEnv = z.infer<typeof baseEnvSchema>;

/**
 * `resend` secildiyse kimlik bilgileri ZORUNLUDUR. Eksikse surec BASLAMAZ:
 * anahtarsiz bir Resend adapter'i her gonderimde 401 alir ve kayitlari olu
 * mektuba dusururdu — yani sessizce degil, GURULTULU ama GEC fark edilirdi.
 */
function requireResendCredentials(env: RawEnv, ctx: RefinementContext): void {
  if (env.EMAIL_PROVIDER !== 'resend') {
    return;
  }

  if (isBlank(env.RESEND_API_KEY)) {
    ctx.addIssue({
      code: 'custom',
      path: ['RESEND_API_KEY'],
      message: 'EMAIL_PROVIDER=resend secildiginde RESEND_API_KEY zorunludur.',
    });
  }
  if (isBlank(env.EMAIL_FROM)) {
    ctx.addIssue({
      code: 'custom',
      path: ['EMAIL_FROM'],
      message: 'EMAIL_PROVIDER=resend secildiginde EMAIL_FROM zorunludur.',
    });
  }
}

/**
 * `openai` secildiyse anahtar ZORUNLUDUR. Eksikse surec BASLAMAZ: anahtarsiz bir
 * adapter ilk not kaydedilene kadar SESSIZ kalir, sonra 401 ile patlar — yani
 * hata, kullanicinin veri girdigi ana ertelenir.
 */
function requireOpenAiCredentials(env: RawEnv, ctx: RefinementContext): void {
  if (env.EMBEDDING_PROVIDER === 'openai' && isBlank(env.OPENAI_API_KEY)) {
    ctx.addIssue({
      code: 'custom',
      path: ['OPENAI_API_KEY'],
      message: 'EMBEDDING_PROVIDER=openai secildiginde OPENAI_API_KEY zorunludur.',
    });
  }
}

/**
 * `deepseek` secildiyse anahtar ZORUNLUDUR — `requireOpenAiCredentials` ile ayni
 * gerekce: anahtarsiz bir adapter ilk soru sorulana kadar SESSIZ kalir, sonra
 * 401 ile patlar.
 */
function requireDeepSeekCredentials(env: RawEnv, ctx: RefinementContext): void {
  if (env.LLM_PROVIDER === 'deepseek' && isBlank(env.DEEPSEEK_API_KEY)) {
    ctx.addIssue({
      code: 'custom',
      path: ['DEEPSEEK_API_KEY'],
      message: 'LLM_PROVIDER=deepseek secildiginde DEEPSEEK_API_KEY zorunludur.',
    });
  }
}

/**
 * Uretimde konsol adapter'i YASAK: dogrulama kodunu loglar (P1).
 *
 * Bunu wiring'e birakmak, hatanin ilk e-posta gonderilene kadar gizli kalmasi
 * demekti; acilista reddetmek onu ANINDA gorunur kilar.
 *
 * AI saglayicilari icin ayni yasak `forbidFakeProvidersInProduction`'dadir;
 * gerekcesi farklidir (sir degil, SESSIZ islevsizlik) ama sonuc aynidir.
 */
function forbidConsoleEmailInProduction(env: RawEnv, ctx: RefinementContext): void {
  if (env.NODE_ENV === 'production' && env.EMAIL_PROVIDER === 'console') {
    ctx.addIssue({
      code: 'custom',
      path: ['EMAIL_PROVIDER'],
      message:
        'Uretimde EMAIL_PROVIDER=console kullanilamaz: konsol adapter i ' +
        'dogrulama kodlarini loglar (P1). EMAIL_PROVIDER=resend olmalidir.',
    });
  }
}

/**
 * Uretimde SAHTE AI saglayicilari YASAK.
 *
 * ============================================================================
 * NEDEN — `console` e-posta yasagindan FARKLI bir gerekce, AYNI sonuc
 * ============================================================================
 * `EMAIL_PROVIDER=console` bir SIR SIZDIRDIGI icin yasak (dogrulama kodunu
 * loglar, P1). Sahte AI saglayicilari sir sizdirmaz — daha sinsi bir sey
 * yaparlar: urunu SESSIZCE islevsiz kilarlar.
 *
 * `EMBEDDING_PROVIDER=fake` ile arama CALISIYOR gorunur; her istek 200 doner,
 * chunk'lar yazilir, sorgu sonuc uretir — ama sonuclar ANLAMSIZDIR cunku
 * vektorler hash'ten uretilmistir. `LLM_PROVIDER=fake` ile her soru "[sahte
 * cevap] ..." doner.
 *
 * Hicbiri hata uretmez. Yani yanlis yapilandirilmis bir uretim ortami,
 * kullanici sikayet edene kadar SAGLIKLI gorunur. Acilista patlamak, aylarca
 * sessizce yanlis calismaktan iyidir (fail closed).
 *
 * Uyari loglamak yeterli DEGILDIR: acilis loglari kimsenin bakmadigi yerdir.
 * ============================================================================
 */
function forbidFakeProvidersInProduction(env: RawEnv, ctx: RefinementContext): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }

  if (env.EMBEDDING_PROVIDER === 'fake') {
    ctx.addIssue({
      code: 'custom',
      path: ['EMBEDDING_PROVIDER'],
      message:
        'Uretimde EMBEDDING_PROVIDER=fake kullanilamaz: sahte embedding ler ' +
        'anlamsal aramayi SESSIZCE islevsiz kilar. EMBEDDING_PROVIDER=openai olmalidir.',
    });
  }

  if (env.LLM_PROVIDER === 'fake') {
    ctx.addIssue({
      code: 'custom',
      path: ['LLM_PROVIDER'],
      message:
        'Uretimde LLM_PROVIDER=fake kullanilamaz: sahte cevaplar soru-cevap ' +
        'ozelligini SESSIZCE islevsiz kilar. LLM_PROVIDER=deepseek olmalidir.',
    });
  }
}

/** `undefined` veya yalnizca bosluk. */
function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

export type Env = z.infer<typeof envSchema>;

/**
 * `s3` secildiyse uc nokta, bucket ve kimlik bilgileri ZORUNLUDUR
 * (ADR-0037 §5).
 *
 * Eksikse surec BASLAMAZ. `requireResendCredentials` ile ayni gerekce, ama
 * sonucu daha agir: kimliksiz bir S3 istemcisi HER yuklemede hata verir ve
 * ADR-0037 §5.3'un sirasi geregi bu, DB satiri acilmadan once olur — yani veri
 * kaybi olmaz ama modul TUMUYLE calismaz. Acilista patlamak, her yuklemede
 * 502 vermekten iyidir (fail closed).
 */
function requireS3StorageCredentials(env: RawEnv, ctx: RefinementContext): void {
  if (env.STORAGE_PROVIDER !== 's3') {
    return;
  }

  const required = [
    ['STORAGE_ENDPOINT', env.STORAGE_ENDPOINT],
    ['STORAGE_BUCKET', env.STORAGE_BUCKET],
    ['STORAGE_ACCESS_KEY_ID', env.STORAGE_ACCESS_KEY_ID],
    ['STORAGE_SECRET_ACCESS_KEY', env.STORAGE_SECRET_ACCESS_KEY],
  ] as const;

  for (const [name, value] of required) {
    if (value === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: [name],
        message: `STORAGE_PROVIDER=s3 secildi: ${name} zorunludur.`,
      });
    }
  }
}

/**
 * Uretimde `STORAGE_PROVIDER=memory` YASAK (ADR-0037 §5).
 *
 * ============================================================================
 * NEDEN — `fake` AI saglayicilarindan DAHA AGIR bir sonuc
 * ============================================================================
 * Sahte bir embedding urunu SESSIZCE islevsiz kilar; bellek ici depo ise
 * KULLANICI VERISINI KAYBEDER. Yukleme 201 doner, liste dolu gorunur, arama
 * calisir — ve ilk yeniden baslatmada her dosya YOK OLUR. Geriye, hicbir
 * nesnenin karsilik gelmedigi metadata satirlari kalir: yani tam olarak
 * ADR-0037 §5.3'un "NESNESIZ KAYIT asla" diye onlemeye calistigi durum, bu kez
 * toptan.
 *
 * Uyari loglamak yeterli DEGILDIR: acilis loglari kimsenin bakmadigi yerdir.
 */
function forbidMemoryStorageInProduction(env: RawEnv, ctx: RefinementContext): void {
  if (env.NODE_ENV === 'production' && env.STORAGE_PROVIDER === 'memory') {
    ctx.addIssue({
      code: 'custom',
      path: ['STORAGE_PROVIDER'],
      message:
        'Uretimde STORAGE_PROVIDER=memory kullanilamaz: dosyalar bellekte tutulur ve ' +
        'yeniden baslatmada KAYBOLUR. STORAGE_PROVIDER=s3 olmalidir.',
    });
  }
}
