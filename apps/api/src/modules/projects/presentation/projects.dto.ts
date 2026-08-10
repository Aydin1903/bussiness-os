import { z } from 'zod';

import { PROJECT_STATUSES } from '../domain/project.entity';
import { TASK_STATUSES } from '../domain/task.entity';

/**
 * Projeler istek govdeleri (DEVELOPMENT_RULES 2.3: her dis veri Zod ile
 * dogrulanir).
 *
 * `tenantId` HICBIR govdede YOKTUR: dogrulanmis token'dan gelir
 * (DEVELOPMENT_RULES 4.5).
 *
 * ⚠️ `companyId` SLICE 4'TE KABUL EDILMEYE BASLADI (ADR-0033 §2). Kolon
 * `0020`'de acilmisti ama API'nin kabul etmesi `crm.public.ts` gelene kadar
 * bilerek ertelenmisti: dogrulanamayan bir cross-modul isaretciyi kabul etmek
 * ILK GUNDEN sarkan satir uretmek olurdu. Artik yazma aninda GORUNURLUK
 * dogrulanabiliyor.
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
    /**
     * Cross-modul YUMUSAK referans (ADR-0033 §2).
     *
     * `null` = IC PROJE (musteriye bagli degil) ve mesru bir durumdur.
     * Verilen id yazma aninda GORUNURLUK acisindan dogrulanir; goremedigin bir
     * sirkete proje baglayamazsin.
     */
    companyId: z.uuid('companyId gecerli bir UUID olmali').nullish(),
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

// --- Gorevler (ADR-0033 §3, §4) -------------------------------------------

const MAX_TITLE = 300;

export const taskStatusSchema = z.enum(TASK_STATUSES);

export const createTaskSchema = z
  .object({
    /**
     * OPSIYONEL ve bu, modulun karakteristik kararidir (ADR-0033 §3):
     * verilmezse gorev "Yapilacaklar" kutusuna duser. `crm.contacts`in zorunlu
     * `companyId`'sinden bilincli sapma.
     */
    projectId: z.uuid('projectId gecerli bir UUID olmali').nullish(),
    title: z.string().trim().min(1, 'Gorev basligi bos olamaz').max(MAX_TITLE),
    /** Verilmezse `todo` — her gorev yapilacaklardan baslar. */
    status: taskStatusSchema.default('todo'),
    dueOn: calendarDay,
    /** `null` = ATANMAMIS. Verilen id, tenant'in aktif uyesi olmak zorundadir. */
    assigneeUserId: z.uuid('assigneeUserId gecerli bir UUID olmali').nullish(),
  })
  .strict();

/**
 * `projectId` BURADA YOKTUR: gorevi baska projeye tasimak bir TASIMA
 * islemidir, kismi guncelleme degil (`Contact`/`Opportunity` ile ayni karar).
 * Sessizce izin vermek, bir `PATCH`in gorevin CASCADE kaderini degistirmesi
 * demekti.
 */
export const updateTaskSchema = createTaskSchema
  .omit({ projectId: true })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'En az bir alan gonderilmelidir',
  });

/**
 * Gorev listesi filtreleri.
 *
 * ⚠️ `projectId` ve `withoutProject` BIRLIKTE gonderilemez: ikisi celisen iki
 * soru sorar ("su projenin gorevleri" vs "projesiz gorevler") ve sessizce
 * birini secmek, istemci hatasini 200'e cevirirdi. Alternatif olan sihirli
 * dize (`projectId=none`) tipi `string`e genisletir ve UUID dogrulamasini
 * kaybettirirdi.
 */
export const listTasksQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
    status: taskStatusSchema.optional(),
    projectId: z.uuid().optional(),
    /** `true` = YALNIZCA projesiz gorevler ("Yapilacaklar" kutusu). */
    withoutProject: z.stringbool().optional(),
    assigneeUserId: z.uuid().optional(),
    /** `true` = yalnizca gecikmisler (`dueOn < bugun`, `done` haric). */
    overdue: z.stringbool().optional(),
  })
  .strict()
  .refine((query) => !(query.projectId !== undefined && query.withoutProject === true), {
    message: 'projectId ile withoutProject birlikte kullanilamaz',
  });

export type CreateTaskBody = z.infer<typeof createTaskSchema>;
export type UpdateTaskBody = z.infer<typeof updateTaskSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

// --- Ilerleme notlari (ADR-0033 §1, §6) -----------------------------------

const MAX_BODY = 20_000;

export const createProgressNoteSchema = z
  .object({
    /**
     * ZORUNLU — `tasks.projectId`den FARKLI.
     *
     * Her ilerleme notu bir projeye aittir (dogal hiyerarsi). Bunun bilincli
     * bedeli: PROJESIZ gorevler not tasiyamaz (ADR-0033 §3).
     */
    projectId: z.uuid('projectId gecerli bir UUID olmali'),
    /** OPSIYONEL daraltma; verilirse gorev AYNI projede olmak zorunda. */
    taskId: z.uuid('taskId gecerli bir UUID olmali').nullish(),
    body: z.string().trim().min(1, 'Ilerleme notu bos olamaz').max(MAX_BODY),
  })
  .strict();

/**
 * ⚠️ `updateProgressNoteSchema` YOK ve olmayacak: notlar EKLEME-YALNIZDIR
 * (ADR-0033 §11, `crm.interactions` ile ayni sinir). Izin katalogu da bunu
 * yansitir — `progress_note:create`, `write` DEGIL.
 */
export const listProgressNotesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
    projectId: z.uuid().optional(),
    taskId: z.uuid().optional(),
  })
  .strict();

export type CreateProgressNoteBody = z.infer<typeof createProgressNoteSchema>;
export type ListProgressNotesQuery = z.infer<typeof listProgressNotesQuerySchema>;
