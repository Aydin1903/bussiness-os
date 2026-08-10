import { z } from 'zod';

/**
 * Projeler modülü uçları — api ↔ web paylaşılan şemaları (ADR-0033).
 *
 * ============================================================================
 * BU ŞEMALAR BACKEND `projects.dto.ts` + entity `*State`'LERİNİ YANSITIR
 * ============================================================================
 * `crm.contract.ts` ile aynı desen ve aynı gerekçe: backend kendi Zod
 * şemalarıyla DOĞRULAR, buradakiler istemcinin istek gövdesini şekillendirmesi
 * ve YANITI çalışma zamanında doğrulaması içindir. Ayrışırlarsa `apiFetch`'in
 * `schema.parse`'ı ayrışmayı ilk çağrıda yakalar — sessizce yanlış çizilen bir
 * ekran yerine görünür bir hata.
 *
 * ============================================================================
 * TARİHLER: İKİ FARKLI TİP, İKİ FARKLI BİÇİM (CRM ile aynı kural)
 * ============================================================================
 * `createdAt`/`updatedAt`/`statusChangedAt` bir ANDIR — UTC ISO-8601.
 * `startedOn`/`dueOn` bir TAKVİM GÜNÜDÜR (PG `date`) — `YYYY-MM-DD`, saati
 * yoktur ve dilim dönüşümüne SOKULMAZ.
 *
 * ============================================================================
 * `companyName` NULLABLE VE ÜÇ ANLAMA GELİR
 * ============================================================================
 * Proje iç projedir (`companyId === null`), şirket silinmiştir (ADR-0033 §2d),
 * ya da çağıran `company:read` taşımıyordur (§2c). Sunucu üçünü AYIRT ETMEZ ve
 * istemci de etmemelidir — ayırmak bir şirketin var olduğunu sızdırırdı.
 */

/** Backend `projects.dto.ts` ile aynı sınırlar. */
const MAX_NAME = 300;
const MAX_TITLE = 300;
const MAX_DESCRIPTION = 4000;
const MAX_BODY = 20_000;

/** ISO takvim günü (`YYYY-MM-DD`) — saat YOK. */
const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-MM-DD biçiminde olmalı');

/** Sayfalı liste zarfı — CRM ile AYNI desen. */
function listEnvelope<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  });
}

/* ========================================================================== */
/* Projeler                                                                    */
/* ========================================================================== */

export const projectStatusSchema = z.enum(['planning', 'in_progress', 'completed', 'cancelled']);

/**
 * Ekranda gösterilecek Türkçe karşılıklar.
 *
 * ⚠️ Veri modeli İNGİLİZCE, arayüz TÜRKÇE — `OPPORTUNITY_STAGE_LABELS` ile
 * aynı ayrım ve aynı gerekçe (`chrome.tsx`'in "dükkâncı testi" notu).
 */
export const PROJECT_STATUS_LABELS: Readonly<Record<ProjectStatus, string>> = {
  planning: 'Planlanıyor',
  in_progress: 'Devam Ediyor',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
};

/** Kapanmış durumlar — "açık işler" görünümleri bunları DIŞLAR. */
export const CLOSED_PROJECT_STATUSES: readonly ProjectStatus[] = ['completed', 'cancelled'];

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: projectStatusSchema,
  description: z.string().nullable(),
  companyId: z.string().nullable(),
  startedOn: z.string().nullable(),
  dueOn: z.string().nullable(),
  statusChangedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Tek proje ucu (`GET /projects/:id`) şirket ADINI da taşır. */
export const projectDetailSchema = projectSchema.extend({
  companyName: z.string().nullable(),
});

/**
 * Liste satırı — proje + GÖREV SAYAÇLARI + şirket adı.
 *
 * Sayaçlar TÜRETİLİR, kolonda saklanmaz: bir görev silindiğinde ya da durumu
 * değiştiğinde kendiliğinden düzelirler.
 */
export const projectListRowSchema = projectDetailSchema.extend({
  openTaskCount: z.number().int().nonnegative(),
  overdueTaskCount: z.number().int().nonnegative(),
});

export const projectListResponseSchema = listEnvelope(projectListRowSchema);

export const createProjectRequestSchema = z.object({
  name: z.string().trim().min(1, 'Proje adı boş olamaz').max(MAX_NAME),
  status: projectStatusSchema.optional(),
  description: z.string().trim().max(MAX_DESCRIPTION).nullish(),
  startedOn: calendarDay.nullish(),
  dueOn: calendarDay.nullish(),
  companyId: z.string().nullish(),
});

export const updateProjectRequestSchema = createProjectRequestSchema.partial();

/* ========================================================================== */
/* Görevler                                                                    */
/* ========================================================================== */

export const taskStatusSchema = z.enum(['todo', 'in_progress', 'done']);

export const TASK_STATUS_LABELS: Readonly<Record<TaskStatus, string>> = {
  todo: 'Yapılacak',
  in_progress: 'Devam Ediyor',
  done: 'Bitti',
};

/** Kapanmış görev durumu — "açık işler" ve "gecikmiş" bunu DIŞLAR. */
export const CLOSED_TASK_STATUSES: readonly TaskStatus[] = ['done'];

export const taskSchema = z.object({
  id: z.string(),
  /** `null` = PROJESİZ görev ("Yapılacaklar" kutusu, ADR-0033 §3). */
  projectId: z.string().nullable(),
  title: z.string(),
  status: taskStatusSchema,
  dueOn: z.string().nullable(),
  /** `null` = ATANMAMIŞ — geçerli ve anlamlı bir durum. */
  assigneeUserId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const taskListResponseSchema = listEnvelope(taskSchema);

export const createTaskRequestSchema = z.object({
  projectId: z.string().nullish(),
  title: z.string().trim().min(1, 'Görev başlığı boş olamaz').max(MAX_TITLE),
  status: taskStatusSchema.optional(),
  dueOn: calendarDay.nullish(),
  assigneeUserId: z.string().nullish(),
});

/**
 * `projectId` YOK: görevi başka projeye taşımak bir TAŞIMA işlemidir, kısmi
 * güncelleme değil (backend DTO'su da onu dışarıda tutar).
 */
export const updateTaskRequestSchema = createTaskRequestSchema.omit({ projectId: true }).partial();

/* ========================================================================== */
/* İlerleme notları                                                            */
/* ========================================================================== */

export const progressNoteSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  taskId: z.string().nullable(),
  authorUserId: z.string(),
  body: z.string(),
  createdAt: z.string(),
});

export const progressNoteListResponseSchema = listEnvelope(progressNoteSchema);

export const createProgressNoteRequestSchema = z.object({
  projectId: z.string(),
  taskId: z.string().nullish(),
  body: z.string().trim().min(1, 'İlerleme notu boş olamaz').max(MAX_BODY),
});

/** Üretilen parça sayısı — `0` ise not ARANABİLİR DEĞİLDİR. */
export const createProgressNoteResponseSchema = z.object({
  progressNoteId: z.string(),
  chunkCount: z.number().int().nonnegative(),
});

export const unindexedProgressNotesResponseSchema = z.object({
  count: z.number().int().nonnegative(),
});

export const reindexProgressNotesResponseSchema = z.object({
  repaired: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ProjectDetail = z.infer<typeof projectDetailSchema>;
export type ProjectListRow = z.infer<typeof projectListRowSchema>;
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type Task = z.infer<typeof taskSchema>;
export type TaskListResponse = z.infer<typeof taskListResponseSchema>;
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>;

export type ProgressNote = z.infer<typeof progressNoteSchema>;
export type ProgressNoteListResponse = z.infer<typeof progressNoteListResponseSchema>;
export type CreateProgressNoteRequest = z.infer<typeof createProgressNoteRequestSchema>;
export type CreateProgressNoteResponse = z.infer<typeof createProgressNoteResponseSchema>;
export type UnindexedProgressNotesResponse = z.infer<typeof unindexedProgressNotesResponseSchema>;
export type ReindexProgressNotesResponse = z.infer<typeof reindexProgressNotesResponseSchema>;
