import { z } from 'zod';

/**
 * CRM istek govdeleri (DEVELOPMENT_RULES 2.3: her dis veri Zod ile dogrulanir).
 *
 * `tenantId` HICBIR govdede YOKTUR: dogrulanmis token'dan gelir
 * (DEVELOPMENT_RULES 4.5).
 */

const MAX_NAME = 300;
const MAX_SHORT = 200;

/** Opsiyonel metin: verilmeyebilir (`undefined`) ya da TEMIZLENEBILIR (`null`). */
const optionalText = (max: number) => z.string().trim().max(max).nullish();

export const createCompanySchema = z
  .object({
    name: z.string().trim().min(1, 'Sirket adi bos olamaz').max(MAX_NAME),
    industry: optionalText(MAX_SHORT),
    email: optionalText(MAX_SHORT),
    phone: optionalText(MAX_SHORT),
    website: optionalText(MAX_SHORT),
  })
  .strict();

/**
 * KISMI guncelleme.
 *
 * `PUT` DEGIL `PATCH`: alanlarin cogu nullable ve `PUT` her istekte tam govde
 * ister — unutulan bir alan SESSIZCE `null`'lanirdi.
 *
 * En az bir alan zorunlu: bos bir `PATCH` govdesi anlamsizdir ve bir istemci
 * hatasini sessizce 200'e cevirirdi.
 */
export const updateCompanySchema = createCompanySchema
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'En az bir alan gonderilmelidir',
  });

export const createContactSchema = z
  .object({
    companyId: z.uuid('companyId gecerli bir UUID olmali'),
    fullName: z.string().trim().min(1, 'Kisi adi bos olamaz').max(MAX_NAME),
    title: optionalText(MAX_SHORT),
    email: optionalText(MAX_SHORT),
    phone: optionalText(MAX_SHORT),
  })
  .strict();

/**
 * `companyId` BURADA YOKTUR: kisiyi baska sirkete tasimak bir TASIMA
 * islemidir, kismi guncelleme degil (bkz. `Contact` sinif yorumu).
 */
export const updateContactSchema = createContactSchema
  .omit({ companyId: true })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'En az bir alan gonderilmelidir',
  });

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export const listQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const listContactsQuerySchema = listQuerySchema.extend({
  companyId: z.uuid().optional(),
});

export const idParamSchema = z.object({ id: z.uuid('Gecerli bir UUID olmali') }).strict();

export type CreateCompanyBody = z.infer<typeof createCompanySchema>;
export type UpdateCompanyBody = z.infer<typeof updateCompanySchema>;
export type CreateContactBody = z.infer<typeof createContactSchema>;
export type UpdateContactBody = z.infer<typeof updateContactSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;
