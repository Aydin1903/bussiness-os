import { z } from 'zod';

/**
 * `POST /api/v1/knowledge/ask` istek govdesi.
 *
 * DEVELOPMENT_RULES 2.3: sisteme giren HER dis veri Zod ile dogrulanir.
 *
 * ============================================================================
 * BURADA NE YOK — ve neden
 * ============================================================================
 * - `tenantId` / `userId` YOK: ikisi de DOGRULANMIS token'dan gelir
 *   (DEVELOPMENT_RULES 4.5).
 * - `context` / `chunkIds` YOK: hangi parcalarin kullanilacagini ISTEMCI
 *   secemez — secim retrieval'in isidir. Istemciye birakmak, baska bir
 *   tenant'in parcasini baglama sokma denemesine kapi acardi (RLS zaten
 *   engellerdi ama yuzey acmanin anlami yok).
 * - `systemPrompt` YOK: is kuralidir, istemci degistiremez.
 * ============================================================================
 */

/** Uzun soru bir DoS onlemidir; anlamli bir soru bu siniri asmaz. */
const MAX_QUESTION_LENGTH = 4_000;

export const askKnowledgeSchema = z
  .object({
    question: z
      .string()
      .trim()
      .min(1, 'Soru bos olamaz')
      .max(MAX_QUESTION_LENGTH, 'Soru cok uzun'),

    /**
     * Opsiyonel (ADR-0030 §1.2). Verilmezse yeni konusma acilir.
     *
     * Bicim (UUID) burada elenir; AITLIK burada DOGRULANMAZ — baska tenant'in
     * id'si RLS yuzunden zaten bos gecmise duser ve "var olmayan" ile "baskasina
     * ait" AYIRT EDILEMEZ (P2 ile ayni ilke).
     */
    conversationId: z.uuid('conversationId gecerli bir UUID olmali').nullish(),
  })
  .strict();

export type AskKnowledgeBody = z.infer<typeof askKnowledgeSchema>;
