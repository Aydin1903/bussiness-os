import { Injectable } from '@nestjs/common';

import { EmbeddingFailedError, type EmbeddingPort } from '../application/embedding.port';

/** OpenAI embeddings uc noktasi — canli testle dogrulandi (ADR-0029). */
const OPENAI_EMBEDDINGS_ENDPOINT = 'https://api.openai.com/v1/embeddings';

/**
 * Ag cagrisi ust siniri. Sinirsiz bekleyen bir istek, HTTP istegini ve
 * kullaniciyi belirsiz sure asili birakir. `ResendEmailAdapter` ile ayni deger.
 */
const REQUEST_TIMEOUT_MS = 10_000;

export interface OpenAiEmbeddingOptions {
  readonly apiKey: string;
  /** Varsayilan `text-embedding-3-small` (1536 boyut). Config'ten gelir. */
  readonly model: string;
}

/**
 * Yanit govdesinden `data[0].embedding` degerini GUVENLE cikarir.
 *
 * `as` ile zorlamak (DEVELOPMENT_RULES 2.3) bozuk bir yaniti "gecerli
 * embedding" gibi gosterirdi; her adim tip yuklemiyle daraltilir.
 */
function readEmbeddingField(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
    return undefined;
  }

  const { data } = payload;
  if (!Array.isArray(data)) {
    return undefined;
  }

  const first: unknown = data[0];
  if (typeof first !== 'object' || first === null || !('embedding' in first)) {
    return undefined;
  }

  return first.embedding;
}

/**
 * `EmbeddingPort`'un OpenAI implementasyonu (ADR-0029 §3, ADR-0030 §1.3).
 *
 * ============================================================================
 * NEDEN SDK DEGIL `fetch`
 * ============================================================================
 * Ihtiyacimiz olan yuzey TEK bir `POST /v1/embeddings` cagrisidir. Node 24'te
 * `fetch` global; `openai` paketini eklemek, ucuncu parti bir surum akisini
 * kalici olarak ustlenmek demekti — hem de yalnizca bir uc nokta icin.
 * `ResendEmailAdapter`'da verilen ayni karar, ayni gerekce.
 * ============================================================================
 *
 * ============================================================================
 * BU ADAPTER SAGLAYICIYA OZGU HER SEYI ICERIDE TUTAR
 * ============================================================================
 * Model adi, uc nokta, `Authorization` basligi, yanit bicimi — hicbiri
 * `EmbeddingPort`'ta gorunmez. ADR-0007'nin kabul testi budur: baska bir
 * saglayiciya gecmek YALNIZCA yeni bir adapter yazmayi gerektirmeli.
 * ============================================================================
 */
@Injectable()
export class OpenAiEmbeddingAdapter implements EmbeddingPort {
  constructor(private readonly options: OpenAiEmbeddingOptions) {}

  async embed(text: string): Promise<number[]> {
    const response = await this.#post(text);

    if (!response.ok) {
      // Govde teshis icin okunur ama SIR TASIMAZ: yalnizca saglayicinin durum
      // kodu ve mesaji. Gonderilen metin ASLA hataya konmaz — not icerigi
      // kullanici verisidir ve log'a girmemelidir.
      throw new EmbeddingFailedError(
        `OpenAI ${String(response.status)}: ${await safeErrorText(response)}`,
      );
    }

    return extractEmbedding(await safeJson(response));
  }

  async #post(text: string): Promise<Response> {
    try {
      return await fetch(OPENAI_EMBEDDINGS_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({ model: this.options.model, input: text }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Ag hatasi / zaman asimi. `fetch` bunlari `TypeError` veya
      // `TimeoutError` olarak firlatir; ikisi de ayni sonuca varir.
      throw new EmbeddingFailedError(error instanceof Error ? error.message : String(error));
    }
  }
}

/**
 * Yanittan vektoru cikarir ve BICIMINI dogrular.
 *
 * Boyut kontrolu burada YAPILMAZ — o `NoteChunk.create`'in isidir ve orada
 * domain hatasi olarak dogru baglamla firlar.
 */
function extractEmbedding(payload: unknown): number[] {
  const embedding = readEmbeddingField(payload);

  if (!Array.isArray(embedding)) {
    throw new EmbeddingFailedError('OpenAI yaniti bir embedding dizisi icermiyor.');
  }
  if (!embedding.every((value): value is number => typeof value === 'number')) {
    throw new EmbeddingFailedError('OpenAI embedding dizisi sayi olmayan deger iceriyor.');
  }

  return embedding;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new EmbeddingFailedError('OpenAI yaniti JSON olarak okunamadi.');
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
