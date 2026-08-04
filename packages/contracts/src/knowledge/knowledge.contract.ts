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
