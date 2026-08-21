import { z } from 'zod';

import { MAX_INTERACTION_BODY_CHARS } from '../domain/supplier-interaction.entity';
import { MAX_PAYMENT_TERMS_CHARS } from '../domain/supplier.entity';

/**
 * Tedarikci istek govdeleri (DEVELOPMENT_RULES 2.3: her dis veri Zod ile
 * dogrulanir).
 *
 * `tenantId` HICBIR govdede YOKTUR: dogrulanmis token'dan gelir
 * (DEVELOPMENT_RULES 4.5).
 */

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/**
 * ⚠️ VARSAYILAN 20, Randevu'nun 50'si DEGIL.
 *
 * Randevu 50 secmisti cunku birincil tuketicisi HAFTALIK TAKVIM GRIDIYDI ve
 * dolu bir haftada 20 satir yetmiyordu. Burada birincil tuketici duz bir LISTE
 * EKRANIDIR (CRM / Projeler / Finans ile ayni sinif) ve 20 satir bir sayfayi
 * doldurur.
 */

/**
 * TAKVIM GUNU — `finance.dto.ts`in `calendarDay`i ile ayni.
 *
 * ⚠️ Zod yalnizca KALIBI dogrular; `2026-02-31` bu kalibi GECER. Gercek bir gun
 * olup olmadigi DOMAINDE kontrol edilir (`assertCalendarDay`) — kontrol
 * edilmeseydi deger veritabanina kadar gider ve kullanici 422 yerine 500
 * alirdi.
 *
 * ⚠️ `z.iso.datetime()` DEGIL: bir tedarikci gorusmesinin SAATI anlamli bir
 * boyut degildir (Randevu'nun ADR-0035 §2c karari BURADA GECERSIZDIR — orada
 * saat kaydin KENDISIYDI).
 */
const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biciminde olmali');

/** Serbest metin alanlarinin ortak ust siniri — bir GIRDI kurali. */
const MAX_SHORT_TEXT = 200;
const shortText = z.string().trim().max(MAX_SHORT_TEXT);

/** Adres tek satirlik degildir; ayri ve daha genis bir sinir. */
const MAX_ADDRESS = 500;

// ============================================================================
// Tedarikci
// ============================================================================

const supplierFieldsShape = {
  /**
   * ⚠️ TEKIL DEGILDIR (§1.1): iki ayri sube, iki ayri sozlesme ya da ayni adi
   * tasiyan iki firma MESRUDUR. Tekillik `taxNumber`da zorlanir.
   */
  name: z.string().trim().min(1, 'Tedarikci adi bos olamaz').max(MAX_SHORT_TEXT),

  /**
   * ⚠️ TEKILLIK KUCUK/BUYUK HARFTEN BAGIMSIZDIR ve VERITABANINDA zorlanir
   * (`UNIQUE (tenant_id, lower(tax_number))`). Burada yalnizca SEKIL
   * dogrulanir.
   *
   * ⚠️ BICIM DOGRULANMAZ (10 hane / 11 hane / harf icerir mi): vergi numarasi
   * bicimi ULKEYE GORE DEGISIR ve bir SaaS urunu icin tek bir kalip yazmak,
   * yurt disi tedarikcisi olan bir tenant'i KILITLERDI. `finance.currency`nin
   * "yalnizca sekil (`^[A-Z]{3}$`), kod listesi DOGRULANMAZ" karariyla ayni
   * sinif.
   *
   * `null` MESRUDUR: kucuk bir isletme tedarikcisinin vergi numarasini
   * bilmeyebilir.
   */
  taxNumber: shortText.nullish(),

  /** `crm.companies.industry`nin karsiligi — serbest metin, hicbir sey zorlamaz. */
  category: shortText.nullish(),

  /**
   * ⚠️ `z.email()` KULLANILMIYOR ve bu bilincli: bir tedarikcinin genel
   * e-postasi "info@x.com; satis@x.com" gibi IKI ADRES olabilir ve `Identity`
   * modulunun aksine bu alan HICBIR ZAMAN bir gonderim hedefi degildir —
   * yalnizca OKUNUR. Katı dogrulama, gercek bir veriyi REDDETME riskini
   * hicbir kazanc karsiliginda alirdi. `crm.companies.email` ile ayni karar.
   */
  email: shortText.nullish(),
  phone: shortText.nullish(),
  website: shortText.nullish(),
  address: z.string().trim().max(MAX_ADDRESS).nullish(),

  /**
   * ⚠️ SERBEST METIN (§1.2) — ve ust sinir DOMAINDEN gelir
   * (`MAX_PAYMENT_TERMS_CHARS`), burada ICAT EDILMEZ.
   *
   * ⚠️ Cift kontrol bilinclidir: Zod ISTEMCIYE hizli ve alan adiyla cevap
   * verir, domain ise HTTP'yi ATLAYAN her yolu baglar. Ikisi AYNI sabiti okur.
   */
  paymentTerms: z.string().trim().max(MAX_PAYMENT_TERMS_CHARS).nullish(),
};

export const createSupplierSchema = z.object(supplierFieldsShape).strict();

/**
 * KISMI guncelleme.
 *
 * ⚠️ `null` GONDERMEK ALANI TEMIZLER, `undefined` DOKUNMAZ. `name` haric —
 * adsiz bir tedarikci olamaz, bu yuzden o `nullable` DEGIL.
 *
 * En az bir alan zorunlu: bos bir `PATCH` govdesi anlamsizdir ve bir istemci
 * hatasini sessizce 200'e cevirirdi.
 */
export const updateSupplierSchema = z
  .object({
    name: supplierFieldsShape.name,
    taxNumber: shortText.nullable(),
    category: shortText.nullable(),
    email: shortText.nullable(),
    phone: shortText.nullable(),
    website: shortText.nullable(),
    address: z.string().trim().max(MAX_ADDRESS).nullable(),
    paymentTerms: z.string().trim().max(MAX_PAYMENT_TERMS_CHARS).nullable(),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'En az bir alan gonderilmelidir',
  });

export const listSuppliersQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
    /**
     * ⚠️ Ad ve vergi numarasi uzerinde ALT DIZE aramasi — ANLAMSAL ARAMA DEGIL
     * (ADR-0011, SEKIZINCI kez). Anlamsal arama `POST /ask`in isidir; bu bir
     * liste filtresidir ve oyle adlandirildi (`search`, `q` degil).
     */
    search: z.string().trim().min(1).max(MAX_SHORT_TEXT).optional(),
  })
  .strict();

// ============================================================================
// Kisi
// ============================================================================

const contactFieldsShape = {
  fullName: z.string().trim().min(1, 'Kisi adi bos olamaz').max(MAX_SHORT_TEXT),
  title: shortText.nullish(),
  email: shortText.nullish(),
  phone: shortText.nullish(),
};

export const createSupplierContactSchema = z
  .object({
    /**
     * ⚠️ GOVDEDE, rotada DEGIL. Rota `POST /suppliers/contacts` — nested bir
     * `POST /suppliers/:supplierId/contacts` secilseydi `GET /suppliers/:id`
     * ile ayni derinlikte iki farkli parametre adi olusurdu ve rota siralamasi
     * bir DIKKAT MESELESINE donerdi (gerekce `supplier.controller.ts`te).
     */
    supplierId: z.uuid('supplierId gecerli bir UUID olmali'),
    ...contactFieldsShape,
  })
  .strict();

export const updateSupplierContactSchema = z
  .object({
    fullName: contactFieldsShape.fullName,
    title: shortText.nullable(),
    email: shortText.nullable(),
    phone: shortText.nullable(),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'En az bir alan gonderilmelidir',
  });

export const supplierIdQuerySchema = z
  .object({ supplierId: z.uuid('supplierId gecerli bir UUID olmali') })
  .strict();

// ============================================================================
// Gorusme gunlugu
// ============================================================================

export const createSupplierInteractionSchema = z
  .object({
    supplierId: z.uuid('supplierId gecerli bir UUID olmali'),
    /**
     * ⚠️ Kisi, BAGLI OLDUGU TEDARIKCININ kisisi olmak ZORUNDA — kontrol use
     * case'tedir (`#assertContactBelongsToSupplier`). Sema ici bir FK bunu
     * YAKALAMAZ: FK yalnizca "boyle bir kisi var mi" der, "bu tedarikcinin mi"
     * demez.
     *
     * `null` MESRUDUR: bir gorusme bir kisiye bagli olmak ZORUNDA degildir
     * (santral, genel e-posta, ilk temas).
     */
    contactId: z.uuid('contactId gecerli bir UUID olmali').nullish(),
    occurredOn: calendarDay,
    /**
     * ⚠️ UST SINIR DOMAINDEN GELIR (`MAX_INTERACTION_BODY_CHARS`), burada ICAT
     * EDILMEZ. Kaynagi `shared/chunking.ts`in TEK PARCA hedefidir: bu modulde
     * chunking YOKTUR (§2.2), dolayisiyla metnin TAMAMI bir parcanin
     * buyuklugunde kalmak zorundadir.
     *
     * ⚠️ SINIR ASILIRSA 422 — SESSIZ KIRPMA YOK. Zod burada da reddeder, domain
     * de reddeder; ikisi AYNI sabiti okur.
     *
     * ⚠️ `nullish()` DEGIL: metin ZORUNLUDUR. Randevu'nun `serviceNote`u ve
     * Stok'un `note`u opsiyoneldi ("notsuz randevu cok yaygin"); metinsiz bir
     * GORUSME KAYDI diye bir sey yoktur.
     */
    body: z.string().trim().min(1, 'Gorusme metni bos olamaz').max(MAX_INTERACTION_BODY_CHARS),
  })
  .strict();

export const listSupplierInteractionsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
    supplierId: z.uuid('supplierId gecerli bir UUID olmali').optional(),
  })
  .strict();

/**
 * `POST /suppliers/reindex` govdesi.
 *
 * ⚠️ `supplierId` OPSIYONELDIR ve ikisi FARKLI IS yapar (§6):
 *
 *   yok     -> VEKTORSUZ gorusmeleri gomer (saglayici cokmesinden kalanlar)
 *   verildi -> o tedarikcinin gorusmelerini YENIDEN gomer (BAYAT BASLIK
 *              onarimi — ad degistiginde)
 *
 * ⚠️ Ikisini birlestirmek ("her cagride her seyi yenile") tek bir istekle
 * SINIRSIZ embedding cagrisi demek olurdu.
 */
export const reindexSuppliersSchema = z
  .object({ supplierId: z.uuid('supplierId gecerli bir UUID olmali').optional() })
  .strict();

export const idParamSchema = z.object({ id: z.uuid('Gecersiz id') }).strict();

export type CreateSupplierBody = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierBody = z.infer<typeof updateSupplierSchema>;
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
export type CreateSupplierContactBody = z.infer<typeof createSupplierContactSchema>;
export type UpdateSupplierContactBody = z.infer<typeof updateSupplierContactSchema>;
export type SupplierIdQuery = z.infer<typeof supplierIdQuerySchema>;
export type CreateSupplierInteractionBody = z.infer<typeof createSupplierInteractionSchema>;
export type ListSupplierInteractionsQuery = z.infer<typeof listSupplierInteractionsQuerySchema>;
export type ReindexSuppliersBody = z.infer<typeof reindexSuppliersSchema>;
