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
