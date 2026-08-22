import { z } from 'zod';

import { MAX_DOCUMENT_NOTES_CHARS } from '../domain/sales-document.entity';
import {
  MAX_LINE_DESCRIPTION_CHARS,
  MAX_LINE_UNIT_CHARS,
} from '../domain/sales-document-line.entity';

/**
 * Teklif / Fatura istek govdeleri (DEVELOPMENT_RULES 2.3: her dis veri Zod ile
 * dogrulanir).
 *
 * `tenantId` HICBIR govdede YOKTUR: dogrulanmis token'dan gelir
 * (DEVELOPMENT_RULES 4.5).
 *
 * ⚠️ Ust sinirlar DOMAINDEN gelir, burada ICAT EDILMEZ. Cift kontrol
 * bilinclidir: Zod ISTEMCIYE hizli ve alan adiyla cevap verir, domain ise
 * HTTP'yi ATLAYAN her yolu baglar. Ikisi AYNI sabiti okur.
 */

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const MAX_CUSTOMER_NAME = 200;

/**
 * TAKVIM GUNU — `finance.dto.ts` / `suppliers.dto.ts` ile ayni.
 *
 * ⚠️ Zod yalnizca KALIBI dogrular; `2026-02-31` bu kalibi GECER. Gercek bir gun
 * olup olmadigi DOMAINDE kontrol edilir (`assertCalendarDay`) — kontrol
 * edilmeseydi deger veritabanina kadar gider ve kullanici 422 yerine 500
 * alirdi.
 */
const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biciminde olmali');

/**
 * ⚠️ PARA VE MIKTAR `string` YA DA `number` KABUL EDER — ve dogrulama DOMAINDE.
 *
 * `money.ts`in gerekcesi aynen gecerli: JSON'da ondalik tip YOKTUR ve
 * istemciler tutari cogu zaman sayi olarak gonderir; tumuyle reddetmek her naif
 * istemciyi kirardi.
 *
 * ⚠️ Zod burada BICIM DOGRULAMAZ (ondalik hane sayisi, isaret, aralik):
 * o kurallarin TEK kaynagi `document-money.ts`tir. Ikinci bir kalip yazmak,
 * senkron kalmasi gereken ikinci bir kural kaynagi acardi.
 */
const decimalInput = z.union([z.string().trim().min(1), z.number()]);

// ============================================================================
// Satir kalemleri
// ============================================================================

const lineSchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(1, 'Satir aciklamasi bos olamaz')
      .max(MAX_LINE_DESCRIPTION_CHARS),
    /** ⚠️ POZITIF olmali — kontrol domainde (`normalizeQuantity`). */
    quantity: decimalInput,
    unit: z.string().trim().max(MAX_LINE_UNIT_CHARS).nullish(),
    /** ⚠️ NEGATIF OLABILIR: iskonto satiri (ADR-0041 §1.7). */
    unitPrice: decimalInput,
    /**
     * ⚠️ Bir SAYIDIR, bir kural degil (§1.8). Verilmezse `0` — vergisiz bir
     * satir mesrudur ve varsayilanin `0` olmasi, oran yazmayi UNUTAN bir
     * istemcinin belgeye rastgele bir vergi eklemesini onler.
     */
    taxRate: decimalInput.optional(),
  })
  .strict();

/**
 * ⚠️ `position` GOVDEDE YOKTUR ve bu bilincli: sira ISTEKTEKI SIRADAN gelir.
 * Istemciye birakilsaydi iki satir ayni sirayi tasiyabilir ya da bosluk
 * birakabilirdi — belgede aciklanamaz bir numaralandirma.
 */
const linesSchema = z.array(lineSchema);

// ============================================================================
// Belge — ORTAK govde
// ============================================================================

const documentFieldsShape = {
  /**
   * ⚠️ BELGEYE BASILAN AD (§1.5) — dizinden COZULMEZ.
   *
   * Zorunludur ve `companyId` opsiyoneldir: CRM'de kayitli olmayan bir
   * musteriye teklif yazmak MESRUDUR. Tersini yapmak (adi `companyId`den
   * turetmek) gecmis belgeleri GERIYE DONUK degistirirdi.
   */
  customerName: z.string().trim().min(1, 'Musteri adi bos olamaz').max(MAX_CUSTOMER_NAME),

  /** ⚠️ CIPLAK id — FK YOK, ad dizinden OKUMA ANINDA cozulur (§7.1). */
  companyId: z.uuid('companyId gecerli bir UUID olmali').nullish(),
  contactId: z.uuid('contactId gecerli bir UUID olmali').nullish(),

  issuedOn: calendarDay,

  /** ⚠️ Sekil dogrulanir, KOD LISTESI dogrulanmaz (ADR-0034'un ayni karari). */
  currency: z.string().trim().length(3),

  /** ⚠️ EMBED EDILMEZ (§5): cogunlukla MATBU kosul metni. */
  notes: z.string().trim().max(MAX_DOCUMENT_NOTES_CHARS).nullish(),
};

/**
 * ⚠️ `validUntil` YALNIZCA TEKLIF govdesinde, `dueOn` YALNIZCA FATURA
 * govdesinde.
 *
 * Ortak bir govde yazip ikisini de opsiyonel birakmak daha kisa olurdu ve
 * REDDEDILDI: `.strict()` sayesinde faturaya `validUntil` gonderen bir istemci
 * 422 alir ve HATASINI OGRENIR. Ortak govdede sessizce dusurulurdu — domain
 * zaten dusuruyor, ama istemcinin bunu OGRENMESI daha iyidir.
 */
export const createQuoteSchema = z
  .object({
    ...documentFieldsShape,
    validUntil: calendarDay.nullish(),
    lines: linesSchema,
  })
  .strict();

export const createInvoiceSchema = z
  .object({
    ...documentFieldsShape,
    dueOn: calendarDay.nullish(),
    lines: linesSchema,
  })
  .strict();

/**
 * KISMI guncelleme.
 *
 * ⚠️ `null` GONDERMEK ALANI TEMIZLER, `undefined` DOKUNMAZ. `customerName`,
 * `issuedOn` ve `currency` haric — adsiz, tarihsiz ya da para birimsiz bir
 * belge olamaz, bu yuzden onlar `nullable` DEGIL.
 *
 * ⚠️ `lines` VERILIRSE SATIRLAR BUTUN OLARAK DEGISIR. Kismi bir satir
 * guncellemesi (tek satiri degistir) YOKTUR: degistirilebilirligin tek kapisi
 * BELGENIN DURUMUDUR (§2) ve satir bazli bir yol o kapiyi ATLAYAN ikinci bir
 * yol acardi.
 */
const updateShape = {
  customerName: documentFieldsShape.customerName,
  companyId: z.uuid('companyId gecerli bir UUID olmali').nullable(),
  contactId: z.uuid('contactId gecerli bir UUID olmali').nullable(),
  issuedOn: calendarDay,
  currency: documentFieldsShape.currency,
  notes: z.string().trim().max(MAX_DOCUMENT_NOTES_CHARS).nullable(),
  lines: linesSchema,
};

export const updateQuoteSchema = z
  .object({ ...updateShape, validUntil: calendarDay.nullable() })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'En az bir alan gonderilmelidir',
  });

export const updateInvoiceSchema = z
  .object({ ...updateShape, dueOn: calendarDay.nullable() })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'En az bir alan gonderilmelidir',
  });

// ============================================================================
// Durum gecisleri
// ============================================================================

/**
 * ⚠️ `outcome` ZORUNLU ve IKI DEGERLI. Ayri iki uc (`/accept`, `/reject`)
 * yazilabilirdi; tek uc secildi cunku ikisi AYNI GECISTIR (`sent` -> sonuc) ve
 * ayni aktor damgasini yazar (§8.2).
 */
export const decideQuoteSchema = z.object({ outcome: z.enum(['accepted', 'rejected']) }).strict();

export const listQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
    /**
     * ⚠️ Gecerli kume TURE BAGLIDIR ve burada TUMU kabul edilir; eslesmeyen bir
     * durum (teklife `issued`) yalnizca BOS LISTE dondurur.
     *
     * Reddetmek daha "dogru" gorunurdu ama iki durum kumesini DTO katmaninda
     * IKINCI KEZ yazmak demekti — kumelerin tek kaynagi
     * `sales-document.entity.ts`tir ve veritabani kisiti onu ZORLAR.
     */
    status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'issued', 'cancelled']).optional(),
  })
  .strict();

export const idParamSchema = z.object({ id: z.uuid('Gecersiz id') }).strict();

export type CreateQuoteBody = z.infer<typeof createQuoteSchema>;
export type CreateInvoiceBody = z.infer<typeof createInvoiceSchema>;
export type UpdateQuoteBody = z.infer<typeof updateQuoteSchema>;
export type UpdateInvoiceBody = z.infer<typeof updateInvoiceSchema>;
export type DecideQuoteBody = z.infer<typeof decideQuoteSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type LineBody = z.infer<typeof lineSchema>;
