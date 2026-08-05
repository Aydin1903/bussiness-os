/** DI token'i. */
export const AI_USAGE_RECORDER = Symbol('AI_USAGE_RECORDER');

/** Hangi port cagrildi. `LLMPort.complete` / `EmbeddingPort.embed`. */
export type AiOperation = 'complete' | 'embed';

export type AiOutcome = 'ok' | 'error';

/**
 * Saglayicinin bildirdigi token harcamasi.
 *
 * Her alan `null` OLABILIR ve bu NORMALDIR: cagri hata verdiyse usage yoktur,
 * ve saglayicilar farkli alanlar dondurur (OpenAI embeddings `completion_tokens`
 * bildirmez — uretilen bir metin yoktur). `null`, "sifir" DEGIL "bilinmiyor"
 * demektir; ikisini karistirmak toplamlari sessizce yanlis yapardi.
 */
export interface AiTokenUsage {
  readonly prompt: number | null;
  readonly completion: number | null;
  readonly total: number | null;
}

/**
 * Tek bir AI saglayici cagrisinin kaydi.
 *
 * ============================================================================
 * ICERIK TASINMAZ — YALNIZCA OLCU
 * ============================================================================
 * Burada soru metni, cevap metni, prompt ya da embed edilen icerik ARANMAZ ve
 * EKLENMEMELIDIR. Hepsi kullanici verisidir; adapter'lar bunlari hata
 * mesajlarina bile koymuyor (bkz. `OpenAiEmbeddingAdapter`). Bir gozlemlenebilirlik
 * kaydinin onlari log'a tasimasi, o disiplini arka kapidan bozardi.
 *
 * Tasinan sey yalnizca SAYILARDIR: kim, hangi modelden, kac token, ne kadar
 * surede, basarili mi.
 * ============================================================================
 */
export interface AiCallRecord {
  readonly operation: AiOperation;
  /** `openai` · `deepseek` · `fake` — adapter kendini boyle tanitir. */
  readonly provider: string;
  readonly model: string;
  /**
   * Cagriyi yapan modul (`knowledge`, ileride `crm`).
   *
   * Adapter'a KURULUS aninda verilir, cunku adapter bugun modul basina
   * saglaniyor. Adapter'lar `infrastructure/ai/` altinda PAYLASILAN birer
   * saglayiciya donustugunde (ADR-0031 Slice 1) bu atif yolu yeniden ele
   * alinmalidir — bkz. `logging-ai-usage-recorder.ts`.
   */
  readonly caller: string;
  readonly outcome: AiOutcome;
  readonly durationMs: number;
  readonly usage: AiTokenUsage;
}

/**
 * AI saglayici cagrilarinin maliyet kaydini tutar (ROADMAP §8.1).
 *
 * ============================================================================
 * NEDEN PORT IMZALARI DEGISMEDI
 * ============================================================================
 * Token harcamasi yalnizca saglayicinin ham yanitinda gorunur; `LLMPort` ise
 * `Promise<string>`, `EmbeddingPort` `Promise<number[]>` doner. Kaydi disaridan
 * saran bir decorator token sayisini GOREMEZDI.
 *
 * Iki yol vardi: (a) port imzalarina `usage` eklemek, (b) adapter'in gordugu
 * usage'i bir sink'e bildirmesi. (a) secilmedi — ADR-0029 §3'un "bilerek
 * minimal" port yuzeyi kararini gozlemlenebilirlik ugruna degistirmek, kuyrugun
 * kopegi sallamasi olurdu. Bu port (b)'dir: `LLMPort` ve `EmbeddingPort`
 * imzalari DEGISMEDI.
 * ============================================================================
 *
 * ============================================================================
 * `void` DONER VE ASLA FIRLATMAZ
 * ============================================================================
 * Kayit tutmak, kaydedilen isin BASARISINI etkilememelidir: log yazamamak
 * yuzunden kullanicinin sorusu cevapsiz kalamaz. Implementasyonlar hatayi
 * kendi icinde yutar; cagiran `await` etmez.
 * ============================================================================
 */
export interface AiUsageRecorder {
  record(call: AiCallRecord): void;
}
