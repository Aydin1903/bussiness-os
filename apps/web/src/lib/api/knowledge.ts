import {
  createNoteResponseSchema,
  notesExistResponseSchema,
  type CreateNoteRequest,
  type CreateNoteResponse,
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
