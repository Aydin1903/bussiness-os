import {
  askKnowledgeResponseSchema,
  createNoteResponseSchema,
  dailyReportResponseSchema,
  noteListResponseSchema,
  notesExistResponseSchema,
  reindexNotesResponseSchema,
  unindexedNotesResponseSchema,
  type AskKnowledgeRequest,
  type AskKnowledgeResponse,
  type CreateNoteRequest,
  type CreateNoteResponse,
  type DailyReportResponse,
  type NoteListResponse,
  type NotesExistResponse,
  type ReindexNotesResponse,
  type UnindexedNotesResponse,
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

/**
 * `POST /ask` — kurumsal hafızaya soru sorar (ADR-0029 §4, ADR-0031 §5.2).
 *
 * Uç `knowledge` altından çıktı: artık tüm modüllerin katkısını birleştiren
 * bir **platform** ucudur.
 *
 * `conversationId` OPSİYONELDİR: verilmezse sunucu yeni bir konuşma açar ve
 * id'sini yanıtta döner. İstemci sonraki soruda o id'yi göndererek konuşmayı
 * sürdürür (ADR-0030 §1.2) — geçmişi istemci TAŞIMAZ, yalnızca id'yi taşır.
 */
export function askKnowledge(body: AskKnowledgeRequest): Promise<AskKnowledgeResponse> {
  return apiFetch('/ask', askKnowledgeResponseSchema, { body });
}

/**
 * `GET /knowledge/notes` — notları sayfalı listeler, EN YENİ ÖNCE.
 *
 * ⚠️ `items[].preview` TAM METİN DEĞİLDİR; `bodyLength` ile kırpılıp
 * kırpılmadığı anlaşılır (ADR-0029 bilinen sınır).
 */
export function listNotes(params: { limit: number; offset: number }): Promise<NoteListResponse> {
  const query = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  });

  return apiFetch(`/knowledge/notes?${query.toString()}`, noteListResponseSchema);
}

/**
 * `GET /knowledge/notes/unindexed` — kaç not ARANAMAZ durumda (ADR-0029).
 *
 * Embedding çökerse not kaydedilir ama chunk'sız kalır ve AI onu hiç bulamaz.
 * Bu sayı olmadan kullanıcı, bir notunun neden bulunamadığını anlayamaz.
 */
export function countUnindexedNotes(): Promise<UnindexedNotesResponse> {
  return apiFetch('/knowledge/notes/unindexed', unindexedNotesResponseSchema);
}

/**
 * `POST /knowledge/reindex` — chunk'sız notları onarır.
 *
 * Tek çağrı sunucudaki batch boyutu kadar not onarır; `remaining > 0` ise
 * çağrı tekrarlanabilir. PARA harcar (embedding çağrıları) ve not oluşturmayla
 * AYNI oran sınırı kovasını kullanır.
 */
export function reindexNotes(): Promise<ReindexNotesResponse> {
  return apiFetch('/knowledge/reindex', reindexNotesResponseSchema, { method: 'POST' });
}
