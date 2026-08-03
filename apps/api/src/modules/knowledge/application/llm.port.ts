/** DI token'i. */
export const LLM_PORT = Symbol('LLM_PORT');

/** Bir konusma turu. `system` YOKTUR — sistem promptu ayri bir parametredir. */
export interface LlmMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface CompleteInput {
  /** Modelin davranis kurallari. Is mantiginin parcasi (`knowledge-prompt.ts`). */
  readonly systemPrompt: string;
  /** Kullanicinin SU ANKI sorusu. */
  readonly userMessage: string;
  /** Getirilen KANIT — chunk metinleri. Sirali degil, alaka skoruna gore. */
  readonly context: readonly string[];
  /** Onceki DIYALOG turleri (ADR-0030 §1.3). Kronolojik, rol atfi yapisal. */
  readonly history?: readonly LlmMessage[];
}

/**
 * Metinden metin ureten saglayici-bagimsiz port (ADR-0007, ADR-0029 §3,
 * ADR-0030 §1.3).
 *
 * ============================================================================
 * NEDEN `EmbeddingPort`'TAN AYRI
 * ============================================================================
 * ADR-0030 §1.3 port yuzeyini ikiye boldu ve gerekce ILK GUNDEN dogru cikti:
 * DeepSeek'in embeddings uc noktasi YOKTUR (canli API testiyle olculdu), chat
 * ise DeepSeek'tedir. Iki port GERCEKTEN iki farkli saglayiciya cozuluyor.
 *
 * Ayrica yasam dongusu farkli: embedding SAKLANAN, surumlu veridir (model
 * degisince tumu yeniden uretilir); completion durumsuz bir cagridir.
 * ============================================================================
 *
 * ============================================================================
 * `context` ILE `history` NEDEN AYRI PARAMETRE
 * ============================================================================
 * ADR-0030 §1.3'un karari: `context` getirilen KANITTIR (sirasiz, kaynaga
 * atfedilebilir), `history` DIYALOGDUR (sirali, rol atfi tasiyan). Tek diziye
 * koymak rolleri string'e gomeyi zorunlu kilardi — geri donusu olmayan bir
 * kayip — ve token butcesinde "en eski mesaj" ile "en dusuk skorlu chunk"
 * ayirt edilemezdi.
 * ============================================================================
 *
 * BILEREK MINIMAL: streaming yok, function-calling yok, `thinking`/
 * `reasoning_effort` gibi saglayiciya ozgu hicbir parametre YOK — onlar
 * adapter'da kalir (ADR-0029 §3.1).
 */
export interface LLMPort {
  complete(input: CompleteInput): Promise<string>;
}

/**
 * Completion uretilemedi.
 *
 * `EmbeddingFailedError` ile ayni desen: adapter'in her hatasi TEK bir domain
 * hatasina cevrilir ve presentation onu `502`'ye dondurur — istek gecerliydi,
 * DIS SAGLAYICI cevap veremedi.
 */
export class CompletionFailedError extends Error {
  readonly code = 'COMPLETION_FAILED';

  constructor(reason: string) {
    super(`Cevap uretilemedi: ${reason}`);
    this.name = 'CompletionFailedError';
  }
}
