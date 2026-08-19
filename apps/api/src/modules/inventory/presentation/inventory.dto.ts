import { z } from 'zod';

import {
  MAX_ITEM_NAME_CHARS,
  MAX_ITEM_NOTE_CHARS,
  MAX_ITEM_SKU_CHARS,
  MAX_ITEM_UNIT_CHARS,
} from '../domain/stock-item.entity';
import { MAX_MOVEMENT_NOTE_CHARS, MOVEMENT_DIRECTIONS } from '../domain/stock-movement.entity';

/**
 * Stok istek govdeleri (DEVELOPMENT_RULES 2.3: her dis veri Zod ile dogrulanir).
 *
 * `tenantId` HICBIR govdede YOKTUR: dogrulanmis token'dan gelir
 * (DEVELOPMENT_RULES 4.5).
 */

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

/**
 * MIKTAR — dize VE sayi kabul edilir (ADR-0039 §4.2).
 *
 * ============================================================================
 * ⚠️ `money.ts`IN GEREKCESI BIREBIR GECERLI
 * ============================================================================
 * JSON'da ondalik tip YOKTUR; istemciler miktari cogu zaman sayi olarak
 * gonderir ve sayiyi tumuyle reddetmek her naif istemciyi kirardi.
 *
 * Guvenli olmasinin sebebi ARALIKTIR: `numeric(14,3)`un en buyuk degeri
 * ~1e11 ve bu, IEEE754'un tam temsil edebildigi aralikin (2^53 ~ 9e15) COK
 * ALTINDADIR.
 *
 * ⚠️ KANONIKLESTIRME BURADA YAPILMAZ, DOMAINDE yapilir (`normalizeQuantity`).
 * Zod yalnizca TIPI gecirir; kalip ve aralik kontrolu tek yerde (domainde)
 * yasar ki HTTP'yi ATLAYAN yollar da baglansin.
 */
const quantityInput = z.union([z.string().trim().min(1), z.number()]);

/**
 * ISO 8601 AN.
 *
 * ⚠️ `z.iso.datetime()` OFFSET ISTER (`Z` ya da `+03:00`); ofsetsiz bir dize
 * REDDEDILIR ve bu KASITLIDIR — ofsetsiz `2026-08-20T14:30` sunucunun yerel
 * saatine gore yorumlanirdi, yani ayni istek iki farkli sunucuda IKI FARKLI ANI
 * kaydederdi ve fark SESSIZ olurdu (`appointments.dto.ts`in ayni karari).
 */
const instant = z.iso.datetime({ offset: true, message: 'Zaman ISO 8601 (ofsetli) olmali' });

export const movementDirectionSchema = z.enum(MOVEMENT_DIRECTIONS);

const nameSchema = z.string().trim().min(1, 'Ad bos olamaz').max(MAX_ITEM_NAME_CHARS);

/**
 * ⚠️ BIRIM KISA — ve bu bir bicim tercihi DEGIL.
 *
 * `unit` serbest metindir (§4) ama YAPISAL KATKININ HER SATIRINDA gonderilir
 * (`"Vida M8: 4 adet (esik 20)"`). Uzun bir birim, her soruda token harcayan bir
 * aciklama alanina donusurdu.
 */
const unitSchema = z.string().trim().min(1, 'Birim bos olamaz').max(MAX_ITEM_UNIT_CHARS);

const skuSchema = z.string().trim().min(1).max(MAX_ITEM_SKU_CHARS);

/**
 * ⚠️ Kalem notunun ust siniri DOMAINDEN gelir, burada ICAT EDILMEZ.
 *
 * Kaynagi `shared/chunking.ts`in tek parca hedefidir: bu modulde chunking
 * YOKTUR (§5), dolayisiyla notun TAMAMI bir parcanin buyuklugunde kalmak
 * zorundadir. Cift kontrol bilinclidir: Zod ISTEMCIYE hizli ve alan adiyla cevap
 * verir, domain ise HTTP'yi ATLAYAN her yolu baglar. SESSIZ KIRPMA YOK.
 */
const itemNoteSchema = z.string().trim().max(MAX_ITEM_NOTE_CHARS);

export const createStockItemSchema = z
  .object({
    name: nameSchema,
    sku: skuSchema.nullish(),
    unit: unitSchema,
    /**
     * ⚠️ `null` ile `0` FARKLI SEYLERDIR (§6.1): `null` = izleme yok, `0` =
     * tukendiginde haber ver. Ikisi de gecerli girdidir ve biri digerinin
     * yerine gecmez.
     */
    minQuantity: quantityInput.nullish(),
    note: itemNoteSchema.nullish(),
  })
  .strict();

/**
 * KISMI guncelleme.
 *
 * ⚠️ `archived` BURADA — ayri bir `POST /archive` ucu ACILMADI. Gerekce: bu bir
 * DURUM GECISI degil, bir ALAN degisimidir ve geri alinabilir (arsivden cikarmak
 * mesrudur). Ayri bir uc, "arsivden cikar" icin IKINCI bir uc daha gerektirirdi.
 *
 * En az bir alan zorunlu: bos bir `PATCH` govdesi anlamsizdir ve bir istemci
 * hatasini sessizce 200'e cevirirdi.
 */
export const updateStockItemSchema = z
  .object({
    name: nameSchema,
    /** ⚠️ `null` = SKU'yu KALDIR; `undefined` = dokunma. */
    sku: skuSchema.nullable(),
    unit: unitSchema,
    /** ⚠️ `null` = ESIGI KALDIR (izleme yok). `0` gondermek AYNI SEY DEGILDIR. */
    minQuantity: quantityInput.nullable(),
    /** ⚠️ `null` = NOTU SIL — ve vektoru de siler (§5). */
    note: itemNoteSchema.nullable(),
    /** `true` = arsivle, `false` = arsivden cikar. */
    archived: z.boolean(),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'En az bir alan gonderilmelidir',
  });

/**
 * HAREKET govdesi (ADR-0039 §3).
 *
 * ⚠️ `isCorrection` GOVDEDE YOKTUR ve bu KASITLIDIR: `true` degerini uretebilen
 * TEK yol fiziksel sayimdir (`POST /inventory/counts`). Istemcinin bu bayragi
 * gondermesine izin verilseydi "fire/kayip" toplami, kullanicinin isaretledigi
 * KEYFI satirlarin toplamina donerdi ve olcu anlamini yitirirdi.
 */
export const createMovementSchema = z
  .object({
    itemId: z.uuid('itemId gecerli bir UUID olmali'),
    direction: movementDirectionSchema,
    /** ⚠️ HER ZAMAN POZITIF; isaret `direction`dadir (§3.1). */
    quantity: quantityInput,
    /**
     * ⚠️ OPSIYONEL ve varsayilani SUNUCU SAATIDIR — `createdAt` ile AYNI SEY
     * DEGIL: bir hareket dun aksam olmus, bugun girilmis olabilir.
     */
    occurredAt: instant.optional(),
    note: z.string().trim().max(MAX_MOVEMENT_NOTE_CHARS).nullish(),
  })
  .strict();

/**
 * FIZIKSEL SAYIM govdesi (ADR-0039 §3.2).
 *
 * ============================================================================
 * ⚠️ KULLANICI SAYDIGINI YAZAR — DELTA'YI GONDERMEZ
 * ============================================================================
 * Govdede `delta` diye bir alan YOKTUR ve olmayacaktir. Istemci mevcut miktari
 * bir onceki istekte okumustur; arada baska bir hareket yazildiysa istemcinin
 * hesapladigi delta YANLIS olur ve hata SESSIZDIR — sayim, duzeltmesi gereken
 * farki YENIDEN URETIR.
 *
 * Sunucu farki KILIT ALTINDA hesaplar (`SELECT ... FOR UPDATE`).
 *
 * ⚠️ `occurredAt` DE YOKTUR: sayim "simdi" yapilan bir olcumdur. Gecmise
 * tarihlenmis bir sayim, aradaki hareketlerle birlikte anlamsizdir.
 */
export const createCountSchema = z
  .object({
    itemId: z.uuid('itemId gecerli bir UUID olmali'),
    /** ⚠️ SAYILAN MUTLAK MIKTAR. Negatif olamaz — fiziksel bir olcumdur. */
    countedQuantity: quantityInput,
    note: z.string().trim().max(MAX_MOVEMENT_NOTE_CHARS).nullish(),
  })
  .strict();

export const listItemsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
    /** Varsayilan `false`: arsivlenmis kalem gunluk listede GURULTUDUR. */
    includeArchived: z.coerce.boolean().default(false),
    /** ⚠️ Bu filtre index KULLANAMAZ (`HAVING`) — kayitli bir bedel. */
    lowStockOnly: z.coerce.boolean().default(false),
    /**
     * ⚠️ ARAMA SUNUCUDA. ADR-0035'in "kisi filtresi ISTEMCIDE" bilinen sinirini
     * bu modul TEKRARLAMIYOR: envanterde kalem sayisi sayfa sinirini kolayca
     * asar ve istemci tarafi arama YALNIZCA GORUNEN SAYFAYA uygulanirdi —
     * kullanici "yok" sanip AYNI KALEMI IKINCI KEZ acardi ve stok ikiye
     * bolunurdu (§1.1'in onlemeye calistigi seyin ta kendisi).
     */
    search: z.string().trim().min(1).max(MAX_ITEM_NAME_CHARS).optional(),
  })
  .strict();

export const listMovementsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
    itemId: z.uuid('itemId gecerli bir UUID olmali').optional(),
  })
  .strict();

export const idParamSchema = z.object({ id: z.uuid('Gecersiz id') }).strict();

export type CreateStockItemBody = z.infer<typeof createStockItemSchema>;
export type UpdateStockItemBody = z.infer<typeof updateStockItemSchema>;
export type CreateMovementBody = z.infer<typeof createMovementSchema>;
export type CreateCountBody = z.infer<typeof createCountSchema>;
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;
export type ListMovementsQuery = z.infer<typeof listMovementsQuerySchema>;
