import { z } from 'zod';

/**
 * Knowledge modülü uçları — api ↔ web paylaşılan şemaları (ADR-0029).
 *
 * ============================================================================
 * BU ŞEMALAR BACKEND `create-note.dto.ts`'i YANSITIR (mirror)
 * ============================================================================
 * Backend kendi Zod şemalarıyla doğrular; buradakiler istemcinin istek gövdesini
 * şekillendirmesi ve YANITI çalışma zamanında doğrulaması içindir (health/auth
 * deseni). İki tarafın ayrışmaması için alanlar backend ile birebir tutulur.
 *
 * `tenantId` ve `authorUserId` BURADA DA YOK: ikisi de doğrulanmış access
 * token'dan gelir, istemci gönderemez.
 * ============================================================================
 */

/** Backend ile aynı sınır: ~200 sayfalık metin, DoS önlemi. */
const MAX_BODY_LENGTH = 500_000;

export const createNoteRequestSchema = z
  .object({
    /** Opsiyonel (ADR-0029): kullanıcı hızlıca bir düşünce bırakabilmeli. */
    title: z.string().max(500, 'Başlık çok uzun').nullish(),
    body: z.string().min(1, 'Not gövdesi boş olamaz').max(MAX_BODY_LENGTH, 'Not çok uzun'),
  })
  .strict();
export type CreateNoteRequest = z.infer<typeof createNoteRequestSchema>;

/**
 * `POST /knowledge/notes` yanıtı.
 *
 * `chunkCount` istemciye indekslemenin GERÇEKLEŞTİĞİNİ söyler — not kaydedilip
 * indekslenememesi ayrı bir durumdur (502) ve o yanıt bu şemaya uymaz.
 */
export const createNoteResponseSchema = z.object({
  noteId: z.string().min(1),
  chunkCount: z.number().int().nonnegative(),
});
export type CreateNoteResponse = z.infer<typeof createNoteResponseSchema>;

/**
 * `POST /knowledge/ask` istek gövdesi (ADR-0029 §4, ADR-0030 §1.2).
 *
 * `conversationId` OPSİYONELDİR: verilmezse yeni bir konuşma açılır ve id'si
 * yanıtta döner. İstemci sonraki soruda o id'yi göndererek konuşmayı sürdürür.
 *
 * `context`/`chunkIds` YOK: hangi parçaların kullanılacağını istemci seçemez —
 * seçim retrieval'ın işidir. `systemPrompt` de yok: iş kuralıdır.
 */
export const askKnowledgeRequestSchema = z
  .object({
    question: z.string().trim().min(1, 'Soru boş olamaz').max(4_000, 'Soru çok uzun'),
    conversationId: z.uuid('conversationId geçerli bir UUID olmalı').nullish(),
  })
  .strict();
export type AskKnowledgeRequest = z.infer<typeof askKnowledgeRequestSchema>;

/**
 * `POST /knowledge/ask` yanıtı.
 *
 * `sourceNoteIds` MODELDEN gelmez — retrieval'ın döndürdüğü gerçek satırlardan
 * türetilir. Modele kaynak atfı yaptırmak, uydurma bir id'nin yanıta girmesine
 * kapı açardı.
 */
export const askKnowledgeResponseSchema = z.object({
  answer: z.string().min(1),
  sourceNoteIds: z.array(z.string()),
  conversationId: z.string().min(1),
});
export type AskKnowledgeResponse = z.infer<typeof askKnowledgeResponseSchema>;

/**
 * `GET /knowledge/notes/exists` yanıtı (ADR-0030 §3).
 *
 * Sayı DEĞİL boolean: onboarding'in tek sorduğu "hiç mi yok". Sayı dönseydi
 * istemci onu göstermeye heveslenir, backend de saymak zorunda kalırdı.
 */
export const notesExistResponseSchema = z.object({
  hasNotes: z.boolean(),
});
export type NotesExistResponse = z.infer<typeof notesExistResponseSchema>;

/**
 * `GET /knowledge/daily-report` yanıtı (ADR-0030 §2.2).
 *
 * `report: null` bir HATA DEĞİL, normal durumdur: yeni açılmış bir tenant'ın
 * henüz raporu yoktur. Bu yüzden uç 404 değil 200 döner.
 */
export const dailyReportResponseSchema = z.object({
  report: z
    .object({
      /** UTC gün (`YYYY-MM-DD`). Raporun ait olduğu gün. */
      reportDate: z.string().min(1),
      summary: z.string().min(1),
      /** ISO 8601. Raporun üretildiği an — `reportDate`'ten farklıdır. */
      generatedAt: z.string().min(1),
    })
    .nullable(),
});
export type DailyReportResponse = z.infer<typeof dailyReportResponseSchema>;

/**
 * `GET /knowledge/notes` — not listesi (sayfalı).
 *
 * ADR-0029 bu ucu bilerek boş bırakmıştı; `/app/knowledge` ekranıyla gerekli
 * oldu. Sayfalama `GET /me/memberships` ile aynı desendir (`limit`/`offset` +
 * `{ items, total, limit, offset }`) — ikinci bir sayfalama paradigması
 * eklemek, her yeni listede "hangisini kullanacağız" sorusunu doğururdu.
 */
export const noteListItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullable(),
  /**
   * Gövdenin ilk parçası — TAM METİN DEĞİL. Uzun bir not tek yanıtta
   * megabaytlarca veri olurdu; tam metin bir not detay ucunun işidir.
   */
  preview: z.string(),
  /** Tam gövdenin uzunluğu; `preview.length`'ten büyükse metin kırpılmıştır. */
  bodyLength: z.number().int().nonnegative(),
  /** ISO 8601. */
  createdAt: z.string().min(1),
});
export type NoteListItem = z.infer<typeof noteListItemSchema>;

export const noteListResponseSchema = z.object({
  items: z.array(noteListItemSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});
export type NoteListResponse = z.infer<typeof noteListResponseSchema>;

/**
 * `GET /knowledge/notes/unindexed` — kaç not ARANAMAZ durumda (ADR-0029).
 *
 * Embedding çökerse not kaydedilir ama chunk'sız kalır ve AI onu hiç bulamaz.
 * Bu sayı, o sessiz deliği arayüzde görünür kılar.
 */
export const unindexedNotesResponseSchema = z.object({
  count: z.number().int().nonnegative(),
});
export type UnindexedNotesResponse = z.infer<typeof unindexedNotesResponseSchema>;

/**
 * `POST /knowledge/reindex` yanıtı.
 *
 * `remaining` ONARIMDAN SONRAKİ durumdur: tek çağrı en fazla `batchSize` not
 * onarır, dolayısıyla istemci "bitti mi" sorusunu bu alandan yanıtlar.
 */
export const reindexNotesResponseSchema = z.object({
  repaired: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});
export type ReindexNotesResponse = z.infer<typeof reindexNotesResponseSchema>;
