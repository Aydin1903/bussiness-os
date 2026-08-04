import {
  createNoteResponseSchema,
  dailyReportResponseSchema,
  notesExistResponseSchema,
  type CreateNoteRequest,
  type CreateNoteResponse,
  type DailyReportResponse,
  type NotesExistResponse,
} from '@business-os/contracts';

import { apiFetch } from './client';

/**
 * Knowledge modülü uçları — hepsi TENANT-SCOPED (ADR-0029).
 *
 * `tenants.ts`'ten farkı budur: oradaki uçlar tenant SEÇİLMEDEN çağrılır ve
 * kimlik token'ını elle taşır. Buradakiler seçimden sonradır, dolayısıyla
 * `apiFetch`'in varsayılanı (memory'deki access token) doğrudur ve `bearer`
 * geçilmez.
 */

/**
 * `POST /knowledge/notes` — kurumsal hafızaya not ekler.
 *
 * Yanıt beklenir (`201`), çünkü indeksleme aynı istekte SENKRON tamamlanır
 * (ADR-0029 §4): dönen `chunkCount`, notun aranabilir olduğunun kanıtıdır.
 */
export function createNote(body: CreateNoteRequest): Promise<CreateNoteResponse> {
  return apiFetch('/knowledge/notes', createNoteResponseSchema, { body });
}

/**
 * `GET /knowledge/notes/exists` — onboarding tetikleme koşulu (ADR-0030 §3).
 *
 * Tenant'ın hiç notu yoksa wizard gösterilir. Sayı DEĞİL boolean döner: sorulan
 * tek şey "hiç mi yok".
 */
export function notesExist(): Promise<NotesExistResponse> {
  return apiFetch('/knowledge/notes/exists', notesExistResponseSchema);
}

/**
 * `GET /knowledge/daily-report` — en son üretilmiş günlük rapor (ADR-0030 §2.2).
 *
 * `report: null` bir HATA DEĞİL, normal durumdur: yeni bir tenant'ın henüz
 * raporu yoktur. Uç bu yüzden 404 değil 200 döner ve istemci de bunu boş durum
 * olarak gösterir, hata olarak değil.
 */
export function fetchDailyReport(): Promise<DailyReportResponse> {
  return apiFetch('/knowledge/daily-report', dailyReportResponseSchema);
}
