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
