import { Injectable } from '@nestjs/common';

import {
  CompletionFailedError,
  type CompleteInput,
  type LLMPort,
} from '../application/llm.port';

/** DeepSeek sohbet uc noktasi — canli testle dogrulandi (ADR-0029). */
const DEEPSEEK_CHAT_ENDPOINT = 'https://api.deepseek.com/chat/completions';

/**
 * Ag cagrisi ust siniri. Completion embedding'den YAVASTIR (uretilen her token
 * zaman alir), bu yuzden `OpenAiEmbeddingAdapter`'in 10 sn'sinden uzun.
 */
const REQUEST_TIMEOUT_MS = 60_000;

export interface DeepSeekLlmOptions {
  readonly apiKey: string;
  /** `deepseek-v4-flash` veya `deepseek-v4-pro`. Config'ten gelir. */
  readonly model: string;
}

/**
 * `LLMPort`'un DeepSeek implementasyonu (ADR-0029 §3, §3.1).
 *
 * ============================================================================
 * NEDEN SDK DEGIL `fetch`
 * ============================================================================
 * Ihtiyacimiz olan yuzey TEK bir `POST /chat/completions` cagrisidir. Node 24'te
 * `fetch` global. `ResendEmailAdapter` ve `OpenAiEmbeddingAdapter`'da verilen
 * ayni karar, ayni gerekce.
 * ============================================================================
 *
 * ============================================================================
 * `thinking: disabled` VARSAYILANI — ADR-0029 §3.1
 * ============================================================================
 * RAG akisinda baglam ZATEN chunk'larla veriliyor; modelin ayrica "dusunmesi"
 * cogu soru icin gereksiz bir maliyet kalemidir.
 *
 * OLCULDU (ayni trivial soru, tek fark parametre): thinking acikken 143 token,
 * kapaliyken 20 token — ~7 kat. Maliyet yalnizca ciktida degil GIRDIDE de
 * artiyor: thinking modu sunucu tarafinda ek bir sistem promptu enjekte ediyor
 * (19 -> 98 prompt token).
 *
 * Bu parametre DeepSeek'e OZGUDUR ve `LLMPort` imzasina DOKUNMAZ — port'a
 * girseydi ADR-0007'nin kabul testi kirilirdi.
 * ============================================================================
 */
@Injectable()
export class DeepSeekLlmAdapter implements LLMPort {
  constructor(private readonly options: DeepSeekLlmOptions) {}

  async complete(input: CompleteInput): Promise<string> {
    const response = await this.#post(input);

    if (!response.ok) {
      // Govde teshis icin okunur ama SIR TASIMAZ: yalnizca saglayicinin durum
      // kodu ve mesaji. Soru ve baglam (kullanici verisi) ASLA hataya konmaz.
      throw new CompletionFailedError(
        `DeepSeek ${String(response.status)}: ${await safeErrorText(response)}`,
      );
    }

    return extractContent(await safeJson(response));
  }

  async #post(input: CompleteInput): Promise<Response> {
    try {
      return await fetch(DEEPSEEK_CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: toProviderMessages(input),
          stream: false,
          // Bkz. sinif yorumu: RAG akisinda gereksiz maliyet.
          thinking: { type: 'disabled' },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Ag hatasi / zaman asimi.
      throw new CompletionFailedError(error instanceof Error ? error.message : String(error));
    }
  }
}

/**
 * Port girdisini saglayicinin `messages` dizisine cevirir.
 *
 * ============================================================================
 * BAGLAM VE GECMIS BURADA BIRLESIR — port'ta DEGIL
 * ============================================================================
 * `context` (kanit) ve `history` (diyalog) port'ta AYRI durur (ADR-0030 §1.3).
 * Onlari tek bir `messages` dizisine duzlestirmek SAGLAYICI BICIMIDIR ve bu
 * adapter'in isidir. Baska bir saglayici baglami farkli tasiyabilir (ornegin
 * ayri bir `documents` alani); o zaman YALNIZCA bu fonksiyon degisir.
 *
 * Sira: sistem promptu -> baglam -> gecmis diyalog -> su anki soru. Baglam
 * gecmisten ONCE gelir cunku "neye dayanarak cevap vereceksin" bilgisi,
 * "daha once ne konustuk" bilgisinden once kurulmalidir.
 * ============================================================================
 */
function toProviderMessages(input: CompleteInput): { role: string; content: string }[] {
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: input.systemPrompt },
  ];

  if (input.context.length > 0) {
    messages.push({ role: 'system', content: formatContext(input.context) });
  } else {
    // Bos baglam SESSIZCE gecilmez: sistem promptunun 2. kurali ("notunuz yok"
    // yonlendirmesi) ancak modelin baglamin BOS oldugunu bilmesiyle calisir.
    messages.push({ role: 'system', content: 'BAGLAM: (bu tenant icin ilgili not bulunamadi)' });
  }

  for (const message of input.history ?? []) {
    messages.push({ role: message.role, content: message.content });
  }

  messages.push({ role: 'user', content: input.userMessage });

  return messages;
}

/** Chunk'lari numaralandirir: model hangi bilginin nereden geldigini ayirt eder. */
function formatContext(context: readonly string[]): string {
  const parts = context.map((chunk, index) => `[${String(index + 1)}] ${chunk}`);
  return `BAGLAM (yalnizca bunu kullan):\n\n${parts.join('\n\n')}`;
}

/**
 * Yanittan cevabi cikarir ve BICIMINI dogrular.
 *
 * `as` ile zorlamak (DEVELOPMENT_RULES 2.3) bozuk bir yaniti gecerli
 * gosterirdi; her adim tip yuklemiyle daraltilir.
 */
function extractContent(payload: unknown): string {
  const content = readMessageContent(payload);

  if (typeof content !== 'string') {
    throw new CompletionFailedError('DeepSeek yaniti bir cevap metni icermiyor.');
  }
  if (content.trim() === '') {
    // Bos cevap "basarili" sayilamaz: istemciye bos bir balon gosterirdik.
    throw new CompletionFailedError('DeepSeek bos bir cevap dondurdu.');
  }

  return content;
}

/**
 * Tip YUKLEMI (`as` DEGIL): `as` ile zorlamak bozuk bir yaniti gecerli
 * gosterirdi (DEVELOPMENT_RULES 2.3).
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Nesneden alan okur; nesne degilse veya alan yoksa `undefined`. */
function readField(value: unknown, field: string): unknown {
  return isRecord(value) ? value[field] : undefined;
}

/** `choices[0].message.content` — her adimda tip daraltmasiyla. */
function readMessageContent(payload: unknown): unknown {
  const choices = readField(payload, 'choices');
  if (!Array.isArray(choices)) {
    return undefined;
  }

  return readField(readField(choices[0], 'message'), 'content');
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new CompletionFailedError('DeepSeek yaniti JSON olarak okunamadi.');
  }
}

/** Hata govdesi okunamazsa akis kesilmez; teshis metni yerine durum kalir. */
async function safeErrorText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 200);
  } catch {
    return '(govde okunamadi)';
  }
}
