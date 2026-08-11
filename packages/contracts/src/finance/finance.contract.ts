import { z } from 'zod';

/**
 * Finans modülü uçları — api ↔ web paylaşılan şemaları (ADR-0034).
 *
 * ============================================================================
 * ⚠️ PARA `string`TİR VE ÖYLE KALIR
 * ============================================================================
 * Backend `numeric(14,2)` kullanıyor ve sürücü onu dize döndürüyor; bu şema da
 * `z.string()` diyor. `z.coerce.number()` yazmak, `money.ts`'in baştan sona
 * kaçındığı yuvarlama hatasını tam da ekranın gösterdiği yerde geri getirirdi.
 *
 * Ekranda toplama YAPILMAZ: her toplam sunucudan gelir (`GET /finance/summary`).
 *
 * ============================================================================
 * TARİHLER: İKİ FARKLI TİP, İKİ FARKLI BİÇİM (CRM/Projeler ile aynı kural)
 * ============================================================================
 * `createdAt`/`updatedAt` bir ANDIR — UTC ISO-8601.
 * `occurredOn` bir TAKVİM GÜNÜDÜR (PG `date`) — `YYYY-MM-DD`, saati yoktur ve
 * dilim dönüşümüne SOKULMAZ.
 *
 * ============================================================================
 * `companyName` / `projectName` NULLABLE VE ÜÇ ANLAMA GELİR
 * ============================================================================
 * Kayıt bağlı değildir, hedef silinmiştir (ADR-0034 §4.2), ya da çağıran ilgili
 * izni taşımıyordur. Sunucu üçünü AYIRT ETMEZ ve istemci de etmemelidir.
 */

/** Backend `finance.dto.ts` ile aynı sınırlar. */
const MAX_CATEGORY_NAME = 120;
const MAX_DESCRIPTION = 2000;
const MAX_BODY = 20_000;

/** ISO takvim günü (`YYYY-MM-DD`) — saat YOK. */
const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biçiminde olmalı');

/** Sayfalı liste zarfı — CRM/Projeler ile AYNI desen. */
function listEnvelope<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  });
}

/* ========================================================================== */
/* Yön                                                                        */
/* ========================================================================== */

export const financeDirectionSchema = z.enum(['income', 'expense']);

/**
 * Ekranda gösterilecek Türkçe karşılıklar.
 *
 * ⚠️ Veri modeli İNGİLİZCE, arayüz TÜRKÇE — `PROJECT_STATUS_LABELS` ile aynı
 * ayrım.
 */
export const DIRECTION_LABELS: Readonly<Record<FinanceDirection, string>> = {
  income: 'Gelir',
  expense: 'Gider',
};

/* ========================================================================== */
/* Kategoriler                                                                */
/* ========================================================================== */

export const financeCategorySchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  name: z.string(),
  direction: financeDirectionSchema,
  isArchived: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const createFinanceCategorySchema = z.object({
  name: z.string().trim().min(1, 'Kategori adı boş olamaz').max(MAX_CATEGORY_NAME),
  /**
   * ⚠️ ZORUNLU ve varsayılanı YOK. Yanlış tahmin edilen bir yön, kayıt
   * bağlandıktan sonra DEĞİŞTİRİLEMEZ (bileşik FK) — kullanıcıya sormak,
   * sessizce tahmin etmekten ucuzdur.
   */
  direction: financeDirectionSchema,
});

/**
 * ⚠️ `direction` BURADA YOKTUR ve olmayacak (ADR-0034 §3c). Kullanımdaki bir
 * kategorinin yönünü değiştirmek bileşik FK tarafından reddedilir; kullanımda
 * DEĞİLKEN izin vermek aynı ucu bazen 200 bazen 409 döndüren yarım çalışan bir
 * sözleşme yapardı. Sunucu gövdede görürse 422 döner — sessizce yok saymaz.
 */
export const updateFinanceCategorySchema = z
  .object({
    name: z.string().trim().min(1, 'Kategori adı boş olamaz').max(MAX_CATEGORY_NAME),
    isArchived: z.boolean(),
  })
  .partial();

export const financeCategoryListResponseSchema = listEnvelope(financeCategorySchema);

/* ========================================================================== */
/* İşlemler                                                                   */
/* ========================================================================== */

/** Tutar: sunucu KANONİK dize döner (`"1500.50"`). */
const amount = z.string();

export const financeTransactionSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  direction: financeDirectionSchema,
  amount,
  currency: z.string(),
  occurredOn: calendarDay,
  description: z.string().nullable(),
  categoryId: z.uuid().nullable(),
  companyId: z.uuid().nullable(),
  projectId: z.uuid().nullable(),
  createdByUserId: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** Liste satırı — çözülmüş adlarla. `null` üç anlama gelir (dosya başı). */
export const financeTransactionRowSchema = financeTransactionSchema.extend({
  categoryName: z.string().nullable(),
  companyName: z.string().nullable(),
  projectName: z.string().nullable(),
});

export const createFinanceTransactionSchema = z.object({
  direction: financeDirectionSchema,
  /**
   * Sunucu `string | number` kabul eder; istemci DAİMA dize gönderir —
   * `<input>` zaten dize verir ve sayıya çevirmek bir tur yuvarlama riski
   * eklerdi.
   */
  amount: z.string().trim().min(1, 'Tutar boş olamaz'),
  currency: z.string().trim().min(1, 'Para birimi boş olamaz'),
  occurredOn: calendarDay,
  description: z.string().trim().max(MAX_DESCRIPTION).nullish(),
  categoryId: z.uuid().nullish(),
  companyId: z.uuid().nullish(),
  projectId: z.uuid().nullish(),
});

export const updateFinanceTransactionSchema = createFinanceTransactionSchema.partial();

export const financeTransactionListResponseSchema = listEnvelope(financeTransactionRowSchema);

/* ========================================================================== */
/* Nakit akışı özeti                                                          */
/* ========================================================================== */

export const cashflowCategoryTotalSchema = z.object({
  categoryId: z.uuid().nullable(),
  /** `null` = KATEGORİSİZ; gizlenmez, ekranda açıkça yazılır (§3d). */
  categoryName: z.string().nullable(),
  direction: financeDirectionSchema,
  total: amount,
});

export const cashflowCurrencySummarySchema = z.object({
  currency: z.string(),
  income: amount,
  expense: amount,
  /** NEGATİF olabilir ve bu normaldir. */
  net: amount,
  /** ⚠️ `null` = İSTENMEDİ, boş dizi = İSTENDİ AMA KAYIT YOK. */
  categories: z.array(cashflowCategoryTotalSchema).nullable(),
});

/**
 * ⚠️ `currencies` BİR LİSTEDİR ve tek bir "net" alanı YOKTUR — bilinçli.
 *
 * 2000 TRY ile 2000 USD'yi toplayan bir sayı, kullanıcının GÖREMEYECEĞİ bir
 * yanlış olurdu (ADR-0034 §5.1). Şema bu kararı TİP SEVİYESİNDE korur: tek bir
 * toplam çizmek isteyen bir ekran, önce bu şemayı değiştirmek zorunda kalır.
 */
export const cashflowSummarySchema = z.object({
  from: calendarDay.nullable(),
  to: calendarDay.nullable(),
  currencies: z.array(cashflowCurrencySummarySchema),
});

/* ========================================================================== */
/* Finansal yorumlar                                                          */
/* ========================================================================== */

export const financeCommentarySchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  authorUserId: z.uuid(),
  occurredOn: calendarDay,
  body: z.string(),
  createdAt: z.iso.datetime(),
});

export const createFinanceCommentarySchema = z.object({
  /** Verilmezse sunucu BUGÜNE düşürür. */
  occurredOn: calendarDay.nullish(),
  body: z.string().trim().min(1, 'Finansal yorum boş olamaz').max(MAX_BODY),
});

/**
 * `chunkCount: 0` ise yorum ARANABİLİR DEĞİLDİR — `502` ile birlikte gelen
 * "kaydedildi ancak indekslenemedi" durumunun sessiz hâli.
 */
export const createFinanceCommentaryResponseSchema = z.object({
  commentaryId: z.uuid(),
  chunkCount: z.number().int().nonnegative(),
});

export const financeCommentaryListResponseSchema = listEnvelope(financeCommentarySchema);

export const unindexedCommentariesResponseSchema = z.object({
  count: z.number().int().nonnegative(),
});

export const reindexCommentariesResponseSchema = z.object({
  repaired: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

/* ========================================================================== */
/* Tipler                                                                     */
/* ========================================================================== */

export type FinanceDirection = z.infer<typeof financeDirectionSchema>;
export type FinanceCategory = z.infer<typeof financeCategorySchema>;
export type CreateFinanceCategoryRequest = z.infer<typeof createFinanceCategorySchema>;
export type UpdateFinanceCategoryRequest = z.infer<typeof updateFinanceCategorySchema>;
export type FinanceCategoryListResponse = z.infer<typeof financeCategoryListResponseSchema>;

export type FinanceTransaction = z.infer<typeof financeTransactionSchema>;
export type FinanceTransactionRow = z.infer<typeof financeTransactionRowSchema>;
export type CreateFinanceTransactionRequest = z.infer<typeof createFinanceTransactionSchema>;
export type UpdateFinanceTransactionRequest = z.infer<typeof updateFinanceTransactionSchema>;
export type FinanceTransactionListResponse = z.infer<typeof financeTransactionListResponseSchema>;

export type CashflowCategoryTotal = z.infer<typeof cashflowCategoryTotalSchema>;
export type CashflowCurrencySummary = z.infer<typeof cashflowCurrencySummarySchema>;
export type CashflowSummary = z.infer<typeof cashflowSummarySchema>;

export type FinanceCommentary = z.infer<typeof financeCommentarySchema>;
export type CreateFinanceCommentaryRequest = z.infer<typeof createFinanceCommentarySchema>;
export type CreateFinanceCommentaryResponse = z.infer<typeof createFinanceCommentaryResponseSchema>;
export type FinanceCommentaryListResponse = z.infer<typeof financeCommentaryListResponseSchema>;
export type UnindexedCommentariesResponse = z.infer<typeof unindexedCommentariesResponseSchema>;
export type ReindexCommentariesResponse = z.infer<typeof reindexCommentariesResponseSchema>;
