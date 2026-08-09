import { z } from 'zod';

import { PROJECT_STATUSES } from '../domain/project.entity';

/**
 * Projeler istek govdeleri (DEVELOPMENT_RULES 2.3: her dis veri Zod ile
 * dogrulanir).
 *
 * `tenantId` HICBIR govdede YOKTUR: dogrulanmis token'dan gelir
 * (DEVELOPMENT_RULES 4.5).
 *
 * ⚠️ `companyId` DE HICBIR GOVDEDE YOK — ve bu ayri bir karardir (ADR-0033 §2):
 * kolon `0020`'de aciliyor ama API'nin kabul etmesi Slice 4'e birakildi, cunku
 * dogrulama ve adin cozulmesi icin gereken `crm.public.ts` orada yaziliyor.
 */

const MAX_NAME = 300;
const MAX_DESCRIPTION = 4000;

/** Opsiyonel metin: verilmeyebilir (`undefined`) ya da TEMIZLENEBILIR (`null`). */
const optionalText = (max: number) => z.string().trim().max(max).nullish();

/** ISO takvim gunu (`YYYY-MM-DD`). Saat YOK — tip `date` (ADR-0033 §5). */
const calendarDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-MM-DD biciminde olmali')
  .nullish();

export const projectStatusSchema = z.enum(PROJECT_STATUSES);

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1, 'Proje adi bos olamaz').max(MAX_NAME),
    /** Verilmezse `planning` — her proje planlamadan baslar. */
    status: projectStatusSchema.default('planning'),
    description: optionalText(MAX_DESCRIPTION),
    startedOn: calendarDay,
    dueOn: calendarDay,
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
export const updateProjectSchema = createProjectSchema
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'En az bir alan gonderilmelidir',
  });

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export const listProjectsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
    /** Verilmezse TUM durumlar. Coklu durum filtresi v1'de yok. */
    status: projectStatusSchema.optional(),
  })
  .strict();

export const idParamSchema = z.object({ id: z.uuid('Gecersiz id') }).strict();

export type CreateProjectBody = z.infer<typeof createProjectSchema>;
export type UpdateProjectBody = z.infer<typeof updateProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
