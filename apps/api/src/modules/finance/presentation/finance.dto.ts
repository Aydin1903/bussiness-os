import { z } from 'zod';

import { FINANCE_DIRECTIONS } from '../domain/category.entity';

/**
 * Finans istek govdeleri (DEVELOPMENT_RULES 2.3: her dis veri Zod ile
 * dogrulanir).
 *
 * `tenantId` HICBIR govdede YOKTUR: dogrulanmis token'dan gelir
 * (DEVELOPMENT_RULES 4.5).
 */

const MAX_NAME = 120;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export const directionSchema = z.enum(FINANCE_DIRECTIONS);

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(1, 'Kategori adi bos olamaz').max(MAX_NAME),
    /**
     * ZORUNLU ve varsayilani YOK.
     *
     * `status: 'planning'` gibi bir varsayilan burada YANLIS olurdu: hangi
     * yonun "dogal baslangic" oldugu diye bir sey yoktur ve yanlis tahmin
     * edilen bir yon, `0024`'ten sonra DEGISTIRILEMEZ (bilesik FK). Kullaniciya
     * sormak, sessizce tahmin etmekten ucuzdur.
     */
    direction: directionSchema,
  })
  .strict();

/**
 * KISMI guncelleme.
 *
 * ⚠️ `direction` BURADA YOKTUR ve olmayacak (ADR-0034 §3c, `Category` sinif
 * yorumu). Kullanimdaki bir kategorinin yonunu degistirmek `0024`'un bilesik
 * FK'si tarafindan zaten reddedilir; kullanimda DEGILKEN izin vermek ayni ucu
 * bazen 200 bazen 409 donduren YARIM CALISAN bir sozlesme yapardi.
 *
 * `isArchived` BURADADIR ve bu ucun asil degeridir: silmenin dogru
 * alternatifi arsivlemektir (§3e).
 *
 * En az bir alan zorunlu: bos bir `PATCH` govdesi anlamsizdir ve bir istemci
 * hatasini sessizce 200'e cevirirdi.
 */
export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1, 'Kategori adi bos olamaz').max(MAX_NAME),
    isArchived: z.boolean(),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'En az bir alan gonderilmelidir',
  });

export const listCategoriesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
    /** Verilmezse IKI yon de. */
    direction: directionSchema.optional(),
    /**
     * Varsayilan `false`: listenin birincil tuketicisi "yeni kayitta hangi
     * kategoriyi secebilirim" sorusudur ve arsivlenmisler oraya girmemelidir.
     * Arsiv yonetimi ekrani `true` gonderir.
     */
    includeArchived: z.stringbool().default(false),
  })
  .strict();

export const idParamSchema = z.object({ id: z.uuid('Gecersiz id') }).strict();

export type CreateCategoryBody = z.infer<typeof createCategorySchema>;
export type UpdateCategoryBody = z.infer<typeof updateCategorySchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;

// --- Islemler (ADR-0034 §2) ------------------------------------------------

const MAX_DESCRIPTION = 2000;

/**
 * ISO takvim gunu (`YYYY-MM-DD`). Saat YOK — tip `date` (ADR-0034 §2e).
 *
 * ⚠️ Zod yalnizca KALIBI dogrular. `2026-02-31` bu kalibi GECER ve gercek bir
 * gun olup olmadigi domain'de (`transaction.entity.ts`) kontrol edilir —
 * kontrol edilmeseydi PostgreSQL onu reddeder ve kullanici 422 yerine 500
 * alirdi.
 */
const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biciminde olmali');

/**
 * Tutar: DIZE ya da SAYI.
 *
 * ============================================================================
 * NEDEN IKISI DE KABUL EDILIYOR
 * ============================================================================
 * JSON'da ondalik tip yoktur; istemciler tutari cogu zaman sayi olarak
 * gonderir ve sayiyi tumuyle reddetmek her naif istemciyi kirardi. Guvenli
 * olmasinin sebebi ARALIKTIR: `numeric(14,2)`in tavani ~1e12, IEEE754'un tam
 * temsil sinirinin (~9e15) cok altinda (gerekce `money.ts`).
 *
 * ⚠️ Zod BURADA yalnizca TIPI daraltir; kural (pozitif, en fazla 2 ondalik,
 * 12 tam sayi hanesi) `money.ts`'te TEK yerde yasar. Iki yerde yazilsaydi biri
 * degistiginde digeri sessizce ayrisirdi — ve ayrisan sey bir PARA KURALI
 * olurdu.
 */
const amountSchema = z.union([z.string().trim().min(1), z.number()]);

export const createTransactionSchema = z
  .object({
    direction: directionSchema,
    amount: amountSchema,
    /** Uc harfli ISO 4217 kodu; buyuk harfe cevirme `money.ts`'te. */
    currency: z.string().trim().min(1),
    occurredOn: calendarDay,
    description: z.string().trim().max(MAX_DESCRIPTION).nullish(),
    /**
     * `null` = KATEGORISIZ ve mesru bir durumdur ("hizli gir, sonra
     * siniflandir"). Verilen kategori var olmali, ARSIVLENMEMIS olmali ve YONU
     * islemin yonuyle UYUSMALIDIR (ADR-0034 §3c).
     */
    categoryId: z.uuid('categoryId gecerli bir UUID olmali').nullish(),
    /**
     * ⚠️ `companyId` ve `projectId` BURADA YOK ve bu bilincli. Kolonlar
     * `0024`'te acildi ama yazma yolu SLICE 3'e birakildi: dogrulamasi ve adin
     * cozulmesi icin gereken `projects.public.ts` o slice'ta yaziliyor.
     * Dogrulanamayan bir cross-modul isaretciyi bugunden kabul etmek ILK
     * GUNDEN sarkan satir uretmek olurdu (ADR-0033 Slice 1'in ayni karari).
     *
     * `.strict()` sayesinde bugun gonderilirlerse SESSIZCE YOK SAYILMAZ, 422
     * ile reddedilirler.
     */
  })
  .strict();

/**
 * KISMI guncelleme.
 *
 * ⚠️ `direction` BURADA VAR — `updateCategorySchema`dan SAPMA ve gerekcesi
 * yazilmadan gecilemez: kategorinin yonu kalici bir SINIFLANDIRMADIR ve gecmis
 * kayitlarin anlamini geriye donuk degistirir; islemin yonu ise bir VERI
 * ALANIDIR ve yanlis girilebilir (gelir olarak girilmis bir gider).
 *
 * Degisince kategori eslesmesi YENIDEN dogrulanir — kontrol use case'tedir.
 */
export const updateTransactionSchema = createTransactionSchema
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'En az bir alan gonderilmelidir',
  });

export const listTransactionsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
    direction: directionSchema.optional(),
    categoryId: z.uuid().optional(),
    /** DAHIL sinirlar (`>=` / `<=`). */
    from: calendarDay.optional(),
    to: calendarDay.optional(),
  })
  .strict()
  .refine((query) => query.from === undefined || query.to === undefined || query.from <= query.to, {
    // `YYYY-MM-DD` biciminde sozluk sirasi takvim sirasiyla AYNIDIR; `Date`e
    // cevirmek tam olarak kacinilan saat dilimi sorusunu geri getirirdi.
    message: 'from, to dan sonra olamaz',
  });

export type CreateTransactionBody = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionBody = z.infer<typeof updateTransactionSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;

// --- Nakit akisi ozeti (ADR-0034 §5) ---------------------------------------

/**
 * ⚠️ `limit`/`offset` YOK ve bu bilincli: ozet bir LISTE degil bir
 * TOPLAMADIR. Satir sayisi tenant'in kullandigi PARA BIRIMI sayisi kadardir
 * (pratikte bir ya da iki) ve sayfalanacak bir sey yoktur. Sayfalama eklemek,
 * "ikinci sayfadaki para birimleri" gibi anlamsiz bir kavram uretirdi.
 */
export const summaryQuerySchema = z
  .object({
    /** DAHIL sinirlar. Verilmezse TUM GECMIS toplanir. */
    from: calendarDay.optional(),
    to: calendarDay.optional(),
    /**
     * Varsayilan `false`: kirilim IKINCI bir sorgu demektir ve ozet seridinin
     * ihtiyaci yoktur. Kategori ekrani `true` gonderir.
     */
    includeCategories: z.stringbool().default(false),
  })
  .strict()
  .refine((query) => query.from === undefined || query.to === undefined || query.from <= query.to, {
    message: 'from, to dan sonra olamaz',
  });

export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
