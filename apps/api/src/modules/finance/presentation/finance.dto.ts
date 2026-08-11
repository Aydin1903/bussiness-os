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
