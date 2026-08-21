import { z } from 'zod';

/**
 * Tedarikçi Yönetimi uçları — api ↔ web paylaşılan şemaları (ADR-0040).
 *
 * ============================================================================
 * ⚠️ BU DOSYADA OLMAYAN ÜÇ ŞEY — ve üçü de birer KARAR
 * ============================================================================
 *   1. **AŞAMA / FIRSAT / TAHMİNİ DEĞER YOK** (§2.1). CRM'in `opportunity`
 *      şeması buraya kopyalanmadı: bir satış hattının var olma sebebi
 *      BELİRSİZ BİR GELİRİN asamalar boyunca ilerlemesidir; satın almada
 *      belirsizlik tedarikçide değil SİPARİŞTEDİR ve sipariş kapsam dışı.
 *      ⚠️ Buraya bir `stage` alanı eklemek, ADR-0036'nın eşiğini de birlikte
 *      getirir (yapısal katkıcı doğar).
 *   2. **ÖDEME KOŞULLARININ YAPISAL KARŞILIĞI YOK** (§1.2). `netDays` /
 *      `discountPercent` gibi alanlar YOKTUR: `paymentTerms` SERBEST METİNDİR
 *      ve hiçbir kısıt taşımaz. Doğrudan sonucu: vade SORGULANAMAZ.
 *   3. **`updateInteraction` / `deleteInteraction` YOK** — görüşme günlüğü
 *      EKLEME-YALNIZDIR (§1). Sunucuda uç yok, izin yok, entity'de metot yok;
 *      burada da şema yok. Olmayan bir şema yanlışlıkla kullanılamaz.
 */

/**
 * ⚠️ GÖRÜŞME METNİNİN SERT SINIRI — TEK KAYNAK BURASIDIR.
 *
 * Sunucu bunu `supplier-interaction.entity.ts`te `TARGET_CHUNK_CHARS`tan
 * türetir (bu modülde chunking YOKTUR — ADR-0040 §2.2). Arayüzün de aynı
 * sayıyı bilmesi gerekiyor: canlı karakter sayacı ve submit engeli ona
 * dayanıyor. İki tarafta ayrı yazılsaydı biri değiştiğinde diğeri SESSİZCE
 * ayrışırdı — kullanıcı formda "1250/1250, tamam" görür, sunucu 422 döner ve
 * sebebini anlayamazdı.
 *
 * `MAX_ITEM_NOTE_CHARS` ile aynı sayı ve aynı gerekçe, ikinci kez.
 */
export const MAX_INTERACTION_BODY_CHARS = 1250;

export const MAX_SUPPLIER_NAME_CHARS = 200;

/**
 * ⚠️ ÖDEME KOŞULLARI 200 KARAKTER — bir CÜMLE, bir PARAGRAF değil.
 *
 * Sınırsız bırakmak alanı ikinci bir serbest not alanına çevirirdi; oysa bu
 * modülün anlatısal yüzeyi GÖRÜŞME GÜNLÜĞÜDÜR ve ödeme koşulları EMBED
 * EDİLMEZ.
 */
export const MAX_PAYMENT_TERMS_CHARS = 200;

export const MAX_SUPPLIER_SHORT_TEXT_CHARS = 200;
export const MAX_SUPPLIER_ADDRESS_CHARS = 500;

/** ISO-8601 an (ofsetli). */
const instant = z.iso.datetime({ offset: true });

/**
 * TAKVİM GÜNÜ — `YYYY-MM-DD`.
 *
 * ⚠️ `instant` DEĞİL: bir tedarikçi görüşmesinin SAATİ anlamlı bir boyut
 * değildir. Randevu (ADR-0035 §2c) tersini seçmişti çünkü orada saat kaydın
 * KENDİSİYDİ; burada `crm.interactions.occurred_on` ile aynı sınıftayız.
 *
 * ⚠️ Kalıp gerçek bir günü GARANTİ ETMEZ (`2026-02-31` bunu geçer). Doğrulama
 * sunucudadır; burada kalıp yalnızca erken ve alan adıyla geri bildirim için.
 */
const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biçiminde olmalı');

// ============================================================================
// Tedarikçi
// ============================================================================

export const supplierSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  /**
   * ⚠️ TEKİL DEĞİLDİR (§1.1): iki ayrı şube, iki ayrı sözleşme ya da aynı adı
   * taşıyan iki firma MEŞRUDUR. Tekillik `taxNumber`da zorlanır.
   */
  name: z.string(),
  /**
   * ⚠️ Tekillik `lower(tax_number)` üzerinde ZORLANIR ve çakışma **409**
   * döner. Bunun bir arayüz sonucu var: kullanıcı "bu firma zaten kayıtlı"
   * mesajını görmeli, ham bir hata değil — aynı tüzel kişi için iki satır
   * açılması GÖRÜŞME GEÇMİŞİNİ, yani AI'ın hafızasını ikiye bölerdi.
   */
  taxNumber: z.string().nullable(),
  category: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  address: z.string().nullable(),
  /** ⚠️ SERBEST METİN — yapısal karşılığı YOKTUR (§1.2). */
  paymentTerms: z.string().nullable(),
  /** ⚠️ Yalnızca OLUŞTURANI tutar; denetim izi DEĞİLDİR (§9). */
  createdByUserId: z.string(),
  createdAt: instant,
  updatedAt: instant,
});

export type Supplier = z.infer<typeof supplierSchema>;

export const supplierListResponseSchema = z.object({
  items: z.array(supplierSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export type SupplierListResponse = z.infer<typeof supplierListResponseSchema>;

/**
 * `PATCH /suppliers/:id` cevabı.
 *
 * ============================================================================
 * ⚠️ `staleAfterRename` BİR SÜSLEME DEĞİLDİR
 * ============================================================================
 * Ad BAĞLAM BAŞLIĞINA girer (§6) ama `suppliers.suppliers`ta yaşar; vektörler
 * `suppliers.interactions`ta. Yani bir yeniden adlandırma o tedarikçinin TÜM
 * görüşme vektörlerini BAYATLATIR.
 *
 * ⚠️ Sunucu bunları `PATCH` sırasında YENİLEMEZ: 200 görüşmesi olan bir
 * tedarikçinin adını düzeltmek 200 embedding çağrısı demekti ve oran sınırı
 * isteği ORTASINDA keserdi (yarısı yeni, yarısı eski başlıklı bir vektör
 * kümesi: EN KÖTÜ HÂL).
 *
 * Bu yüzden bayrak VAR: arayüz onarımı KULLANICIYA ÖNERİR. Sessizce bayat
 * bırakmak, "arama neden bulmuyor" sorusunu cevapsız bırakırdı.
 *
 * ⚠️ Stok'ta böyle bir alan YOKTU ve olamazdı — orada ad kalemin AYNI
 * SATIRINDAYDI ve `PATCH` vektörü aynı işlemde yeniliyordu.
 */
export const supplierUpdateResultSchema = z.object({
  supplier: supplierSchema,
  staleAfterRename: z.boolean(),
});

export type SupplierUpdateResult = z.infer<typeof supplierUpdateResultSchema>;

const shortText = z.string().trim().max(MAX_SUPPLIER_SHORT_TEXT_CHARS);

export const createSupplierRequestSchema = z.object({
  name: z.string().trim().min(1).max(MAX_SUPPLIER_NAME_CHARS),
  taxNumber: shortText.optional(),
  category: shortText.optional(),
  email: shortText.optional(),
  phone: shortText.optional(),
  website: shortText.optional(),
  address: z.string().trim().max(MAX_SUPPLIER_ADDRESS_CHARS).optional(),
  paymentTerms: z.string().trim().max(MAX_PAYMENT_TERMS_CHARS).optional(),
});

export type CreateSupplierRequest = z.infer<typeof createSupplierRequestSchema>;

/**
 * KISMİ güncelleme.
 *
 * ⚠️ `null` GÖNDERMEK ALANI TEMİZLER, alanı hiç göndermemek DOKUNMAZ. `name`
 * hariç — adsız bir tedarikçi olamaz.
 */
export const updateSupplierRequestSchema = z.object({
  name: z.string().trim().min(1).max(MAX_SUPPLIER_NAME_CHARS).optional(),
  taxNumber: shortText.nullable().optional(),
  category: shortText.nullable().optional(),
  email: shortText.nullable().optional(),
  phone: shortText.nullable().optional(),
  website: shortText.nullable().optional(),
  address: z.string().trim().max(MAX_SUPPLIER_ADDRESS_CHARS).nullable().optional(),
  paymentTerms: z.string().trim().max(MAX_PAYMENT_TERMS_CHARS).nullable().optional(),
});

export type UpdateSupplierRequest = z.infer<typeof updateSupplierRequestSchema>;

// ============================================================================
// Kişi
// ============================================================================

export const supplierContactSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  /** ⚠️ DEĞİŞTİRİLEMEZ: kişi başka tedarikçiye TAŞINAMAZ (§1.3). */
  supplierId: z.uuid(),
  fullName: z.string(),
  title: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  createdAt: instant,
  updatedAt: instant,
});

export type SupplierContact = z.infer<typeof supplierContactSchema>;

/**
 * ⚠️ SAYFALAMA YOK ve cevap `total` TAŞIMAZ.
 *
 * Bir tedarikçide kişi sayısı ONLARLA ölçülür, binlerle değil. Boş bir
 * sayfalayıcı göstermek, olmayan bir kontrolü ima ederdi.
 */
export const supplierContactListResponseSchema = z.object({
  items: z.array(supplierContactSchema),
});

export type SupplierContactListResponse = z.infer<typeof supplierContactListResponseSchema>;

export const createSupplierContactRequestSchema = z.object({
  supplierId: z.uuid(),
  fullName: z.string().trim().min(1).max(MAX_SUPPLIER_SHORT_TEXT_CHARS),
  title: shortText.optional(),
  email: shortText.optional(),
  phone: shortText.optional(),
});

export type CreateSupplierContactRequest = z.infer<typeof createSupplierContactRequestSchema>;

export const updateSupplierContactRequestSchema = z.object({
  fullName: z.string().trim().min(1).max(MAX_SUPPLIER_SHORT_TEXT_CHARS).optional(),
  title: shortText.nullable().optional(),
  email: shortText.nullable().optional(),
  phone: shortText.nullable().optional(),
});

export type UpdateSupplierContactRequest = z.infer<typeof updateSupplierContactRequestSchema>;

// ============================================================================
// Görüşme günlüğü
// ============================================================================

export const supplierInteractionSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  supplierId: z.uuid(),
  /** `null` = kişiye bağlı değil YA DA kişi silindi (`ON DELETE SET NULL`). */
  contactId: z.uuid().nullable(),
  authorUserId: z.uuid(),
  occurredOn: calendarDay,
  body: z.string(),
  createdAt: instant,
  /**
   * ⚠️ `updatedAt` ALANI YOKTUR — günlük EKLEME-YALNIZDIR (§1).
   *
   * Güncellenmeyen bir satırın güncellenme zamanı olmaz. Alanı koymak,
   * ileride birinin "demek ki güncellenebiliyor" diye okuyacağı SESSİZ BİR
   * DAVET olurdu.
   */
});

export type SupplierInteraction = z.infer<typeof supplierInteractionSchema>;

export const supplierInteractionListResponseSchema = z.object({
  items: z.array(supplierInteractionSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export type SupplierInteractionListResponse = z.infer<typeof supplierInteractionListResponseSchema>;

export const createSupplierInteractionRequestSchema = z.object({
  supplierId: z.uuid(),
  /**
   * ⚠️ Kişi, BAĞLI OLDUĞU TEDARİKÇİNİN kişisi olmak ZORUNDA — kontrol
   * sunucudadır. Şema içi bir FK bunu YAKALAMAZ: FK yalnızca "böyle bir kişi
   * var mı" der, "bu tedarikçinin mi" demez.
   */
  contactId: z.uuid().optional(),
  occurredOn: calendarDay,
  /**
   * ⚠️ ZORUNLU — Randevu'nun `serviceNote`u ve Stok'un `note`u opsiyoneldi
   * ("notsuz randevu çok yaygın", "bir vidanın notu olmaz"). Metinsiz bir
   * GÖRÜŞME KAYDI diye bir şey yoktur.
   *
   * ⚠️ Bunun oran sınırı sonucu var: bu modülde HER yazma bir embedding
   * çağrısı üretir ve pay öder. Stok'ta en sık işlem (hareket yazmak) hiçbir
   * şey harcamıyordu; burada en sık işlem HER ZAMAN harcar.
   */
  body: z.string().trim().min(1).max(MAX_INTERACTION_BODY_CHARS),
});

export type CreateSupplierInteractionRequest = z.infer<
  typeof createSupplierInteractionRequestSchema
>;

/**
 * `POST /suppliers/reindex` cevabı.
 *
 * ⚠️ Bu modülde onarımın İKİ işi vardır (§6): (1) vektörsüz görüşmeleri
 * gömmek, (2) BAYAT BAŞLIKLI vektörleri tazelemek. İkincisi Stok'ta YOKTU.
 */
export const reindexSuppliersResponseSchema = z.object({
  repaired: z.number().int(),
  failed: z.number().int(),
});

export type ReindexSuppliersResponse = z.infer<typeof reindexSuppliersResponseSchema>;
