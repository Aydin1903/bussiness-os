import {
  createProgressNoteResponseSchema,
  progressNoteListResponseSchema,
  projectDetailSchema,
  projectListResponseSchema,
  projectSchema,
  reindexProgressNotesResponseSchema,
  taskListResponseSchema,
  taskSchema,
  unindexedProgressNotesResponseSchema,
  type CreateProgressNoteRequest,
  type CreateProgressNoteResponse,
  type CreateProjectRequest,
  type CreateTaskRequest,
  type ProgressNoteListResponse,
  type Project,
  type ProjectDetail,
  type ProjectListResponse,
  type ProjectStatus,
  type ReindexProgressNotesResponse,
  type Task,
  type TaskListResponse,
  type TaskStatus,
  type UnindexedProgressNotesResponse,
  type UpdateProjectRequest,
  type UpdateTaskRequest,
} from '@business-os/contracts';

import { apiFetch, apiSend } from './client';

/**
 * Projeler uçları (ADR-0033).
 *
 * `crm.ts` ile aynı desen: her yanıt şemayla DOĞRULANIR, sorgu dizesi tek bir
 * yardımcıdan üretilir ve `undefined` parametreler düşürülür.
 */

/** `undefined` değerler sorguya GİRMEZ — `?status=undefined` göndermemek için. */
function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

/* ========================================================================== */
/* Projeler                                                                   */
/* ========================================================================== */

export function listProjects(params: {
  limit: number;
  offset: number;
  status?: ProjectStatus;
}): Promise<ProjectListResponse> {
  return apiFetch(`/projects?${query(params)}`, projectListResponseSchema);
}

export function getProject(id: string): Promise<ProjectDetail> {
  return apiFetch(`/projects/${id}`, projectDetailSchema);
}

export function createProject(body: CreateProjectRequest): Promise<Project> {
  return apiFetch('/projects', projectSchema, { body });
}

export function updateProject(id: string, body: UpdateProjectRequest): Promise<Project> {
  return apiFetch(`/projects/${id}`, projectSchema, { method: 'PATCH', body });
}

/**
 * ⚠️ CASCADE: görevleri ve ilerleme notlarını da götürür (ADR-0033 §8) — yani
 * AI'ın hafızasından da siler. Geri alınamaz.
 */
export function deleteProject(id: string): Promise<void> {
  return apiSend(`/projects/${id}`, { method: 'DELETE' });
}

/* ========================================================================== */
/* Görevler                                                                   */
/* ========================================================================== */

/**
 * ⚠️ `projectId` ve `withoutProject` BİRLİKTE gönderilemez — backend 422 döner.
 * İkisi çelişen iki soru sorar: "şu projenin görevleri" vs "projesiz görevler".
 */
export function listTasks(params: {
  limit: number;
  offset: number;
  status?: TaskStatus;
  projectId?: string;
  withoutProject?: boolean;
  assigneeUserId?: string;
  overdue?: boolean;
}): Promise<TaskListResponse> {
  return apiFetch(`/projects/tasks?${query(params)}`, taskListResponseSchema);
}

export function createTask(body: CreateTaskRequest): Promise<Task> {
  return apiFetch('/projects/tasks', taskSchema, { body });
}

export function updateTask(id: string, body: UpdateTaskRequest): Promise<Task> {
  return apiFetch(`/projects/tasks/${id}`, taskSchema, { method: 'PATCH', body });
}

export function deleteTask(id: string): Promise<void> {
  return apiSend(`/projects/tasks/${id}`, { method: 'DELETE' });
}

/* ========================================================================== */
/* İlerleme notları                                                           */
/* ========================================================================== */

export function listProgressNotes(params: {
  limit: number;
  offset: number;
  projectId?: string;
  taskId?: string;
}): Promise<ProgressNoteListResponse> {
  return apiFetch(`/projects/notes?${query(params)}`, progressNoteListResponseSchema);
}

/**
 * Not kaydeder ve indeksler.
 *
 * `502` ANLAMLIDIR: not KAYDEDİLDİ ama indekslenemedi — kullanıcı metni
 * yeniden yazmamalı, `reindexProgressNotes()` onarır (ADR-0029 §4).
 */
export function createProgressNote(
  body: CreateProgressNoteRequest,
): Promise<CreateProgressNoteResponse> {
  return apiFetch('/projects/notes', createProgressNoteResponseSchema, { body });
}

export function countUnindexedProgressNotes(): Promise<UnindexedProgressNotesResponse> {
  return apiFetch('/projects/notes/unindexed', unindexedProgressNotesResponseSchema);
}

export function reindexProgressNotes(): Promise<ReindexProgressNotesResponse> {
  return apiFetch('/projects/reindex', reindexProgressNotesResponseSchema, { body: {} });
}
