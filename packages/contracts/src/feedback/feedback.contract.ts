import { z } from 'zod';

/**
 * Musteri Geri Bildirimi / Anket uclari — api ↔ web paylasilan semalari
 * (ADR-0045).
 *
 * ============================================================================
 * ⚠️ BU DOSYADA OLMAYAN UC SEY — ve ucu de birer KARAR
 * ============================================================================
 *   1. **`updateFeedbackRequestSchema` YOK** (§2). Kayit GUNCELLENMEZ: bir geri
 *      bildirim BIZIM SOZUMUZ DEGIL, bir UCUNCU KISININ beyanidir. Sunucuda uc
 *      yok, izin yok (`create`, `write` DEGIL), entity'de metot yok,
 *      veritabaninda yetki yok; burada da sema yok. ⚠️ Olmayan bir sema
 *      yanlislikla kullanilamaz.
 *   2. **`scale` ALANI YOK** (§1.3). Olcek SABITTIR (1..5). NPS bir sayi degil
 *      bir METODOLOJIDIR (0..10 + promoter/detractor) ve ayni tabloya
 *      karistirilsaydi `rating`in ANLAMI satirdan satira degisir, ortalama
 *      SESSIZCE YANLIS olurdu.
 *   3. **BIR "DURUM" / "ETIKET" / "COZULDU MU" ALANI YOK.** Modul TOPLAR,
 *      yonetmez: cevap verme ve kapatma bir IS AKISIDIR (durum makinesi,
 *      atama, SLA) ve v1'de kapsam disidir (§10).
 */

/**
 * ⚠️ YORUMUN SERT SINIRI — TEK KAYNAK BURASIDIR.
 *
 * Sunucu bunu `feedback-response.entity.ts`te `TARGET_CHUNK_CHARS`tan turetir
 * (bu modulde chunking YOKTUR — ADR-0045 §1.2). Arayuzun de ayni sayiyi bilmesi
 * gerekiyor: canli karakter sayaci ve submit engeli ona dayaniyor. Iki tarafta
 * ayri yazilsaydi biri degistiginde digeri SESSIZCE ayrisirdi — kullanici
 * formda "1250/1250, tamam" gorur, sunucu 422 doner ve sebebini anlayamazdi.
 *
 * `MAX_INTERACTION_BODY_CHARS` ile ayni sayi ve ayni gerekce, UCUNCU kez.
 */
export const MAX_FEEDBACK_COMMENT_CHARS = 1250;

/**
 * ⚠️ KANAL ETIKETI 80 KARAKTER — bir ETIKET, bir cumle degil.
 *
 * Genis birakmak alani ikinci bir serbest not alanina cevirirdi; oysa modulun
 * anlatisal yuzeyi YORUMDUR.
 */
export const MAX_FEEDBACK_CHANNEL_CHARS = 80;

export const MIN_RATING = 1;
export const MAX_RATING = 5;

/**
 * ⚠️ "DUSUK PUAN" ESIGI — BU DEGERE KADAR (DAHIL).
 *
 * ============================================================================
 * ⚠️ NEDEN BURADA, NEDEN ENV'DE DEGIL
 * ============================================================================
 * `INVENTORY_NEAR_THRESHOLD_RATIO` bir env degiskeniydi cunku "azaliyor" esigi
 * ISLETMEYE GORE degisir (bir depo icin 1.25, baskasi icin 2). Burada oyle
 * DEGIL: olcek SABITTIR (1..5, §1.3), dolayisiyla _"dusuk = 1 veya 2"_ bir
 * TERCIH degil OLCEGIN OZELLIGIDIR.
 *
 * ⚠️ Ve TEK YERDE yasamasi sart: sunucu bu sayiyi sayar, arayuz onunla etiket
 * yazar. Iki tarafta ayri yazilsaydi ekran "≤2 puan" der, sunucu baska bir sayi
 * sayardi ve fark SESSIZ olurdu — `CRM_STALE_STAGE_DAYS` / `STALE_STAGE_DAYS`
 * ayrismasinin BESINCI tekrari.
 *
 * ⚠️ BU BIR RISK MERDIVENI DEGILDIR. ADR §3'un reddettigi yapisal katkicinin
 * skor bandlari (0.95/0.90/0.75) HALA YOKTUR ve bu sabit onlari getirmez.
 */
export const LOW_RATING_MAX = 2;

/** ISO-8601 an (ofsetli). */
const instant = z.iso.datetime({ offset: true });

// ============================================================================
// Geri bildirim kaydi
// ============================================================================

export const feedbackResponseSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),

  /** ⚠️ 1..5 TAM SAYI — olcek sabit (§1.3). */
  rating: z.number().int().min(MIN_RATING).max(MAX_RATING),

  /**
   * ⚠️ `null` YAYGIN DURUMDUR (§1.4) — ve bedeli §3.5'te kayitli: yorumsuz bir
   * kaydin `POST /ask` havuzunda HICBIR SESI YOKTUR.
   */
  comment: z.string().nullable(),

  /** ⚠️ SERBEST METIN etiketi (§1.5) — bir BOYUT degil. */
  channel: z.string().nullable(),

  /** ⚠️ `null` YAYGIN: gercek geri bildirimlerin cogu ANONIMDIR (§6.2). */
  crmContactId: z.uuid().nullable(),

  /**
   * ⚠️ COZULMUS ad — KOLONDA SAKLANMAZ (§6.1).
   *
   * `null` UC ANLAMA gelir ve ucu de AYIRT EDILEMEZ: anonim kayit · kisi
   * silinmis · cagiranda `contact:read` YOK. Ayirt edilseydi, goremedigi bir
   * kisinin VAR OLDUGU sizardi.
   */
  contactName: z.string().nullable(),

  receivedAt: instant,
  createdByUserId: z.uuid(),
  createdAt: instant,

  /**
   * ⚠️ `updatedAt` ALANI YOKTUR — kayit GUNCELLENMEZ (§2).
   *
   * Guncellenmeyen bir satirin guncellenme zamani da olmaz. Alani koymak,
   * ileride birinin "demek ki guncellenebiliyor" diye okuyacagi SESSIZ BIR
   * DAVET olurdu.
   */
});

export type FeedbackResponse = z.infer<typeof feedbackResponseSchema>;

export const feedbackListResponseSchema = z.object({
  items: z.array(feedbackResponseSchema),
  total: z.number().int().min(0),
  limit: z.number().int().min(1),
  offset: z.number().int().min(0),
});

export type FeedbackListResponse = z.infer<typeof feedbackListResponseSchema>;

export const createFeedbackRequestSchema = z.object({
  rating: z.number().int().min(MIN_RATING).max(MAX_RATING),
  comment: z.string().max(MAX_FEEDBACK_COMMENT_CHARS).nullish(),
  channel: z.string().max(MAX_FEEDBACK_CHANNEL_CHARS).nullish(),
  crmContactId: z.uuid().nullish(),
  /**
   * ⚠️ ZORUNLU ve OFSETLI: kayit GECMISE DONUK girilebilir (dun gelen bir
   * telefon, gecen hafta doldurulmus bir kagit form). Ofsetsiz bir dize
   * sunucunun yerel saatine gore yorumlanirdi — ayni istek iki sunucuda IKI
   * FARKLI ANI kaydederdi ve fark SESSIZ olurdu.
   */
  receivedAt: instant,
});

export type CreateFeedbackRequest = z.infer<typeof createFeedbackRequestSchema>;

// ============================================================================
// Duvarin ozeti (§9)
// ============================================================================

/**
 * `GET /feedback/summary`.
 *
 * ============================================================================
 * ⚠️ `average` `string | null` — VE IKISI DE KASITLI
 * ============================================================================
 *   `string` -> yuvarlama SUNUCUDA yapilir (`round(avg, 1)`); JS'te
 *     bicimlendirmek IKI YERDE IKI FARKLI yuvarlama demekti.
 *   ⚠️ `null` -> `count = 0` iken ortalama YOKTUR ve TIP SEVIYESINDE
 *     gosterilemez (§9.1). `0` donseydi arayuz "0,0" basar ve _"cok kotu"_ ile
 *     _"hic veri yok"_ AYNI GORUNURDU — hata SESSIZ olurdu.
 *
 * ⚠️ `windowDays` ve `lowRatingMax` SUNUCUDAN doner: arayuz "son 30 gunde" ve
 * "≤2" metinlerini KENDI YAZMAZ. Yazsaydi sunucudaki degerler degistiginde
 * ekran eski sayiyi gostermeye devam ederdi.
 */
export const feedbackSummarySchema = z.object({
  average: z.string().nullable(),
  count: z.number().int().min(0),
  lowRatingCount: z.number().int().min(0),
  withoutCommentCount: z.number().int().min(0),
  windowDays: z.number().int().min(1),
  lowRatingMax: z.number().int().min(MIN_RATING).max(MAX_RATING),
});

export type FeedbackSummary = z.infer<typeof feedbackSummarySchema>;

// ============================================================================
// Onarim
// ============================================================================

/**
 * `POST /feedback/reindex`.
 *
 * ⚠️ ISTEK GOVDESI BOSTUR ve bir hedef parametresi (ADR-0040'in `supplierId`i)
 * TASIMAZ: basligin uc bileseni de (tarih · puan · kanal) DEGISTIRILEMEZ (§2),
 * yani BU MODULDE BAYATLAMA PENCERESI YOKTUR — projede ILK.
 */
export const reindexFeedbackResponseSchema = z.object({
  repaired: z.number().int().min(0),
  failed: z.number().int().min(0),
});

export type ReindexFeedbackResponse = z.infer<typeof reindexFeedbackResponseSchema>;
