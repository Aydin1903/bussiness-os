import { z } from 'zod';

/**
 * Teklif / Fatura uçları — api ↔ web paylaşılan şemaları (ADR-0041).
 *
 * ============================================================================
 * ⚠️ BU DOSYADA OLMAYAN DÖRT ŞEY — ve dördü de birer KARAR
 * ============================================================================
 *   1. **`total` / `lineTotal` ALANI YOK** (§1.3). Toplamlar sunucuda
 *      TÜRETİLİR (`computeDocumentTotals`) ve `totals` altında AYRI gelir —
 *      hiçbir kolonda saklanmaz. Buraya bir `total` alanı eklemek, ekranın
 *      onu kaynak sanmasına ve bir gün kolona dönmesine giden ilk adımdır.
 *   2. **`stockItemId` YOK** (§7.3). Satır kalemi SERBEST METİNDİR: bağlantının
 *      doğal beklentisi stok düşülmesidir ve o, bu modülün envanterin
 *      doğruluğundan sorumlu olması demektir.
 *   3. **`embedding` / `reindex` YOK** (§5). Bu, Faz 5'te vektör taşımayan İLK
 *      iş modülü: bir teklif kalemi yüzlerce neredeyse özdeş kısa vektör
 *      üretirdi ve K=8'lik havuzu kirletirdi (ADR-0034 §6.1).
 *   4. **`patchLine` / `deleteLine` YOK** (§2). Kalemler BÜTÜN olarak
 *      değiştirilir: değiştirilebilirliğin tek kapısı BELGENİN DURUMUDUR ve
 *      satır bazlı bir yol o kapıyı ATLAYAN ikinci bir yol açardı.
 */

/** ISO-8601 an (ofsetli). */
const instant = z.iso.datetime({ offset: true });

/**
 * TAKVİM GÜNÜ — `YYYY-MM-DD`.
 *
 * ⚠️ `instant` DEĞİL: bir belgenin SAATİ anlamlı bir boyut değildir. Projede
 * beşinci kez aynı karar; tenant bazlı saat dilimi sorusunu tümüyle ortadan
 * kaldırır.
 */
const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * ⚠️ PARA VE MİKTAR DİZEDİR, `number` DEĞİL.
 *
 * Sunucu `numeric` kolonları `string` olarak döner ve arayüz de öyle tutar
 * (`money.ts` / `quantity.ts` kararı, üçüncü kez). Bir kez `number`a
 * çevrilse yuvarlama hatası KALICI olurdu ve çıktısı bir PARA RAKAMIDIR;
 * rakamlara itiraz edilmez.
 */
const decimalString = z.string();

/** Belge başına EN FAZLA satır — sunucudaki `INVOICING_MAX_LINES` ile aynı. */
export const MAX_DOCUMENT_LINES = 200;

export const MAX_DOCUMENT_NOTES_CHARS = 2000;
export const MAX_LINE_DESCRIPTION_CHARS = 500;
export const MAX_LINE_UNIT_CHARS = 40;
export const MAX_CUSTOMER_NAME_CHARS = 200;

/**
 * ⚠️ İKİ BELGE TÜRÜ, TEK ŞEKİL (§1.1).
 *
 * Sunucuda tek tablo + `kind`; burada tek şema + `kind`. Ama UÇLAR AYRIDIR
 * (`/invoicing/quotes`, `/invoicing/invoices`) ve İZİNLER de ayrıdır
 * (`quote:*` / `invoice:*`).
 */
export const salesDocumentKindSchema = z.enum(['quote', 'invoice']);
export type SalesDocumentKind = z.infer<typeof salesDocumentKindSchema>;

/**
 * ⚠️ GEÇERLİ DURUM KÜMESİ `kind`'A BAĞLIDIR ve bunu VERİTABANI zorlar
 * (`sales_documents_status_valid`).
 *
 * Şema burada birleşik kümeyi tanır — ayırmak, iki durum makinesini ÜÇÜNCÜ
 * kez (domain + veritabanı + burada) yazmak olurdu. Arayüz hangi geçişin
 * mümkün olduğunu `kind` + `status` çiftinden okur.
 */
export const salesDocumentStatusSchema = z.enum([
  'draft',
  'sent',
  'accepted',
  'rejected',
  'issued',
  'cancelled',
]);
export type SalesDocumentStatus = z.infer<typeof salesDocumentStatusSchema>;

export const salesDocumentLineSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  documentId: z.uuid(),
  /** Kullanıcının verdiği SIRA — istekteki sıradan türetilir, gönderilmez. */
  position: z.number().int(),
  description: z.string(),
  quantity: decimalString,
  unit: z.string().nullable(),
  /** ⚠️ NEGATİF OLABİLİR: iskonto satırı (§1.7). */
  unitPrice: decimalString,
  /** Yüzde. ⚠️ Bir SAYIDIR, bir kural değil (§1.8). */
  taxRate: decimalString,
  createdAt: instant,
});

export type SalesDocumentLine = z.infer<typeof salesDocumentLineSchema>;

export const salesDocumentSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  kind: salesDocumentKindSchema,
  status: salesDocumentStatusSchema,
  /**
   * ⚠️ TASLAKTA `null` (§1.6) — ve arayüz bunu bir EKSİK gibi göstermez.
   *
   * Numara belge DIŞARI ÇIKTIĞI an üretilir. Taslakta üretilseydi silinen her
   * taslak bir numara YAKARDI ve kullanıcı numaralar arasındaki boşlukları
   * HATA SANARDI.
   */
  number: z.string().nullable(),
  companyId: z.uuid().nullable(),
  contactId: z.uuid().nullable(),
  /**
   * ⚠️ BELGEYE BASILAN AD — dizinden okunan "bugünkü ad" DEĞİL (§1.5).
   *
   * Gönderilmiş bir belgedeki ad O AN DONDURULMUŞTUR. Aynı ekranda iki ad
   * görünebilir ve bu bir kusur değil, ayrımın ta kendisidir.
   */
  customerName: z.string(),
  issuedOn: calendarDay,
  /** ⚠️ YALNIZCA teklif. */
  validUntil: calendarDay.nullable(),
  /** ⚠️ YALNIZCA fatura. */
  dueOn: calendarDay.nullable(),
  currency: z.string(),
  notes: z.string().nullable(),
  /** ⚠️ Ok FATURA → TEKLİF (§3). Teklifte DAİMA `null`. */
  convertedFromId: z.uuid().nullable(),
  createdByUserId: z.uuid(),
  /**
   * ⚠️ AKTÖR DAMGALARI — BİR DENETİM İZİ DEĞİLDİR (§8.2).
   *
   * `platform/audit` bu işte AÇILMADI: gönderilmiş belgenin tutarı değişmez,
   * yani "kim değiştirdi" diye bir soru yoktur. Geriye kalan DURUM
   * GEÇİŞLERİDİR ve cevabı bu dört alandır. Bir olay günlüğü "ne oldu"yu
   * sırasıyla anlatır; damga yalnızca SON DURUMU söyler.
   *
   * ⚠️ Taslak üzerindeki düzenlemeler İZLENMEZ ve bu, ertelemenin dürüst
   * bedelidir.
   */
  sentAt: instant.nullable(),
  sentByUserId: z.uuid().nullable(),
  decidedAt: instant.nullable(),
  decidedByUserId: z.uuid().nullable(),
  createdAt: instant,
  updatedAt: instant,
});

export type SalesDocument = z.infer<typeof salesDocumentSchema>;

/**
 * ⚠️ TÜRETİLMİŞ toplamlar (§1.3) — hiçbir kolonda saklanmaz.
 *
 * Satır bazında yuvarlanır, sonra toplanır: belgede BASILI satır toplamları,
 * BASILI ara toplama elde toplandığında EŞİT ÇIKAR. "Önce topla sonra
 * yuvarla" seçilseydi müşteri kağıda bakıp toplar ve farklı bir sonuç bulurdu.
 */
export const documentTotalsSchema = z.object({
  subtotal: decimalString,
  taxTotal: decimalString,
  total: decimalString,
});

export type DocumentTotals = z.infer<typeof documentTotalsSchema>;

/**
 * Tek belgenin tam görünümü.
 *
 * ⚠️ `linkedCompanyName` BUGÜNKÜ müşteri adıdır, `document.customerName` ise
 * BELGEYE BASILAN ad (§1.5). İkisi farklı olabilir ve arayüz belgeninkini
 * BİRİNCİL gösterir — kağıda basılan daima dondurulmuş olandır.
 *
 * ⚠️ `null` ÜÇ durumu birden ifade eder ve ayırt EDİLEMEZ (P2): şirket
 * silinmiş, başka tenant'ın, ya da çağıran `company:read` TAŞIMIYOR.
 */
export const salesDocumentViewSchema = z.object({
  document: salesDocumentSchema,
  lines: z.array(salesDocumentLineSchema),
  totals: documentTotalsSchema,
  linkedCompanyName: z.string().nullable(),
  linkedContactName: z.string().nullable(),
});

export type SalesDocumentView = z.infer<typeof salesDocumentViewSchema>;

export const salesDocumentListResponseSchema = z.object({
  items: z.array(salesDocumentSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export type SalesDocumentListResponse = z.infer<typeof salesDocumentListResponseSchema>;

// ============================================================================
// İstek gövdeleri
// ============================================================================

/**
 * ⚠️ `position` GÖNDERİLMEZ: sıra İSTEKTEKİ SIRADAN gelir.
 *
 * İstemciye bırakılsaydı iki satır aynı sırayı taşıyabilir ya da boşluk
 * bırakabilirdi — belgede açıklanamaz bir numaralandırma.
 */
export const salesDocumentLineInputSchema = z.object({
  description: z.string().trim().min(1).max(MAX_LINE_DESCRIPTION_CHARS),
  /** ⚠️ POZİTİF olmalı — kontrol sunucudadır (`normalizeQuantity`). */
  quantity: z.union([z.string().trim().min(1), z.number()]),
  unit: z.string().trim().max(MAX_LINE_UNIT_CHARS).optional(),
  /** ⚠️ NEGATİF OLABİLİR: iskonto satırı (§1.7). */
  unitPrice: z.union([z.string().trim().min(1), z.number()]),
  /** Verilmezse `0` — oran yazmayı UNUTAN bir istemci rastgele vergi eklemez. */
  taxRate: z.union([z.string().trim().min(1), z.number()]).optional(),
});

export type SalesDocumentLineInput = z.infer<typeof salesDocumentLineInputSchema>;

const documentFieldsShape = {
  customerName: z.string().trim().min(1).max(MAX_CUSTOMER_NAME_CHARS),
  companyId: z.uuid().optional(),
  contactId: z.uuid().optional(),
  issuedOn: calendarDay,
  currency: z.string().trim().length(3),
  notes: z.string().trim().max(MAX_DOCUMENT_NOTES_CHARS).optional(),
};

export const createQuoteRequestSchema = z.object({
  ...documentFieldsShape,
  validUntil: calendarDay.optional(),
  lines: z.array(salesDocumentLineInputSchema),
});

export type CreateQuoteRequest = z.infer<typeof createQuoteRequestSchema>;

export const createInvoiceRequestSchema = z.object({
  ...documentFieldsShape,
  dueOn: calendarDay.optional(),
  lines: z.array(salesDocumentLineInputSchema),
});

export type CreateInvoiceRequest = z.infer<typeof createInvoiceRequestSchema>;

/**
 * KISMİ güncelleme — YALNIZCA TASLAK (§2).
 *
 * ⚠️ `lines` VERİLİRSE SATIRLAR BÜTÜN OLARAK DEĞİŞİR. Kısmi bir satır
 * güncellemesi YOKTUR.
 */
const updateShape = {
  customerName: z.string().trim().min(1).max(MAX_CUSTOMER_NAME_CHARS).optional(),
  companyId: z.uuid().nullable().optional(),
  contactId: z.uuid().nullable().optional(),
  issuedOn: calendarDay.optional(),
  currency: z.string().trim().length(3).optional(),
  notes: z.string().trim().max(MAX_DOCUMENT_NOTES_CHARS).nullable().optional(),
  lines: z.array(salesDocumentLineInputSchema).optional(),
};

export const updateQuoteRequestSchema = z.object({
  ...updateShape,
  validUntil: calendarDay.nullable().optional(),
});

export type UpdateQuoteRequest = z.infer<typeof updateQuoteRequestSchema>;

export const updateInvoiceRequestSchema = z.object({
  ...updateShape,
  dueOn: calendarDay.nullable().optional(),
});

export type UpdateInvoiceRequest = z.infer<typeof updateInvoiceRequestSchema>;

/**
 * ⚠️ TEK UÇ, İKİ SONUÇ.
 *
 * Ayrı iki uç (`/accept`, `/reject`) yazılabilirdi; tek uç seçildi çünkü ikisi
 * AYNI GEÇİŞTİR (`sent` → sonuç) ve aynı aktör damgasını yazar (§8.2).
 */
export const decideQuoteRequestSchema = z.object({
  outcome: z.enum(['accepted', 'rejected']),
});

export type DecideQuoteRequest = z.infer<typeof decideQuoteRequestSchema>;
