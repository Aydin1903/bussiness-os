import { afterEach, describe, expect, it, vi } from 'vitest';

import { type AiCallRecord } from '../../../shared/ai-usage-recorder.port';
import { EmbeddingFailedError } from '../application/embedding.port';
import { OpenAiEmbeddingAdapter } from './openai-embedding.adapter';

/** Kayit cagrilarini toplayan sahte recorder — testler icinde incelenebilir. */
function recordingRecorder() {
  const calls: AiCallRecord[] = [];
  return { calls, record: (call: AiCallRecord): void => void calls.push(call) };
}

const OPTIONS = {
  apiKey: 'sk-test',
  model: 'text-embedding-3-small',
  recorder: { record: (): void => undefined },
  caller: 'knowledge',
};

interface FetchResult {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}

/** Global `fetch`'i degistirir; gercek ag cagrisi YAPILMAZ. */
function stubFetch(impl: () => FetchResult | Promise<FetchResult>) {
  const fn = vi.fn<(url: string, init?: RequestInit) => FetchResult | Promise<FetchResult>>(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Gonderilen JSON govdeyi ayristirir. `body` daima bir string'dir (JSON.stringify). */
function sentBody(fetchMock: ReturnType<typeof stubFetch>): { model: string; input: string } {
  const init = fetchMock.mock.calls[0]?.[1];
  const body = init?.body;
  if (typeof body !== 'string') {
    throw new TypeError('Istek govdesi string degil.');
  }
  return JSON.parse(body) as { model: string; input: string };
}

function okResponse(embedding: unknown): FetchResult {
  return { ok: true, status: 200, json: () => Promise.resolve({ data: [{ embedding }] }) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenAiEmbeddingAdapter — istek bicimi', () => {
  it('dogru uc noktaya POST atar', async () => {
    const fetchMock = stubFetch(() => okResponse([0.1, 0.2]));

    await new OpenAiEmbeddingAdapter(OPTIONS).embed('metin');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/embeddings');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('API anahtarini Bearer olarak gonderir', async () => {
    const fetchMock = stubFetch(() => okResponse([0.1]));

    await new OpenAiEmbeddingAdapter(OPTIONS).embed('metin');

    const headers = fetchMock.mock.calls[0]?.[1]?.headers;
    expect(headers).toMatchObject({ authorization: 'Bearer sk-test' });
  });

  it('model ve metni govdede gonderir', async () => {
    const fetchMock = stubFetch(() => okResponse([0.1]));

    await new OpenAiEmbeddingAdapter(OPTIONS).embed('merhaba');

    expect(sentBody(fetchMock)).toEqual({ model: 'text-embedding-3-small', input: 'merhaba' });
  });

  it('yapilandirilan modeli kullanir (sabit DEGIL)', async () => {
    const fetchMock = stubFetch(() => okResponse([0.1]));

    await new OpenAiEmbeddingAdapter({ ...OPTIONS, model: 'text-embedding-3-large' }).embed('m');

    expect(sentBody(fetchMock).model).toBe('text-embedding-3-large');
  });
});

describe('OpenAiEmbeddingAdapter — basarili yanit', () => {
  it('vektoru cikarir', async () => {
    stubFetch(() => okResponse([0.1, 0.2, 0.3]));

    expect(await new OpenAiEmbeddingAdapter(OPTIONS).embed('metin')).toEqual([0.1, 0.2, 0.3]);
  });

  it('BOYUT dogrulamasi YAPMAZ — o NoteChunk in isi', async () => {
    // Adapter'in isi tasimaktir; boyut bir DOMAIN kuralidir ve orada dogru
    // baglamla (hangi chunk) firlar.
    stubFetch(() => okResponse([0.1]));

    expect(await new OpenAiEmbeddingAdapter(OPTIONS).embed('metin')).toHaveLength(1);
  });
});

describe('OpenAiEmbeddingAdapter — hata siniflandirmasi', () => {
  it('HTTP hatasi EmbeddingFailedError e cevrilir', async () => {
    stubFetch(() => ({ ok: false, status: 429, text: () => Promise.resolve('rate limited') }));

    await expect(new OpenAiEmbeddingAdapter(OPTIONS).embed('m')).rejects.toThrow(
      EmbeddingFailedError,
    );
  });

  it('hata mesaji durum kodunu tasir (teshis)', async () => {
    stubFetch(() => ({ ok: false, status: 401, text: () => Promise.resolve('invalid key') }));

    await expect(new OpenAiEmbeddingAdapter(OPTIONS).embed('m')).rejects.toThrow(/OpenAI 401/);
  });

  it('GONDERILEN METIN hataya KONMAZ (kullanici verisi log a sizmaz)', async () => {
    stubFetch(() => ({ ok: false, status: 500, text: () => Promise.resolve('server error') }));

    await expect(
      new OpenAiEmbeddingAdapter(OPTIONS).embed('GIZLI SIRKET BILGISI'),
    ).rejects.not.toThrow(/GIZLI SIRKET BILGISI/);
  });

  it('ag hatasi EmbeddingFailedError e cevrilir', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed');
    });

    await expect(new OpenAiEmbeddingAdapter(OPTIONS).embed('m')).rejects.toThrow(
      EmbeddingFailedError,
    );
  });

  it('JSON olmayan yanit EmbeddingFailedError e cevrilir', async () => {
    stubFetch(() => ({ ok: true, status: 200, json: () => Promise.reject(new Error('bozuk')) }));

    await expect(new OpenAiEmbeddingAdapter(OPTIONS).embed('m')).rejects.toThrow(
      /JSON olarak okunamadi/,
    );
  });

  it('embedding alani OLMAYAN yanit reddedilir', async () => {
    stubFetch(() => ({ ok: true, status: 200, json: () => Promise.resolve({ data: [] }) }));

    await expect(new OpenAiEmbeddingAdapter(OPTIONS).embed('m')).rejects.toThrow(
      /embedding dizisi icermiyor/,
    );
  });

  it('SAYI OLMAYAN deger iceren dizi reddedilir', async () => {
    // `as number[]` ile zorlamak bozuk bir yaniti gecerli gosterirdi.
    stubFetch(() => okResponse([0.1, 'bozuk', 0.3]));

    await expect(new OpenAiEmbeddingAdapter(OPTIONS).embed('m')).rejects.toThrow(
      /sayi olmayan deger/,
    );
  });

  it('hata govdesi okunamazsa akis kesilmez', async () => {
    stubFetch(() => ({
      ok: false,
      status: 503,
      text: () => Promise.reject(new Error('okunamadi')),
    }));

    await expect(new OpenAiEmbeddingAdapter(OPTIONS).embed('m')).rejects.toThrow(/OpenAI 503/);
  });
});

describe('OpenAiEmbeddingAdapter — maliyet kaydi (ROADMAP §8.1)', () => {
  it('basarili cagriyi saglayicinin usage bilgisiyle kaydeder', async () => {
    const recorder = recordingRecorder();
    stubFetch(() => ({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [{ embedding: [0.1, 0.2] }],
          usage: { prompt_tokens: 7, total_tokens: 7 },
        }),
    }));

    await new OpenAiEmbeddingAdapter({ ...OPTIONS, recorder }).embed('metin');

    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0]).toMatchObject({
      operation: 'embed',
      provider: 'openai',
      model: 'text-embedding-3-small',
      caller: 'knowledge',
      outcome: 'ok',
      usage: { prompt: 7, total: 7 },
    });
  });

  it('OpenAI completion_tokens bildirmez — alan `null`, SIFIR degil', async () => {
    const recorder = recordingRecorder();
    stubFetch(() => ({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [{ embedding: [0.1] }],
          usage: { prompt_tokens: 3, total_tokens: 3 },
        }),
    }));

    await new OpenAiEmbeddingAdapter({ ...OPTIONS, recorder }).embed('m');

    // `null` "bilinmiyor" demektir; sifir yazmak toplamlari yanlis yapardi.
    expect(recorder.calls[0]?.usage.completion).toBeNull();
  });

  it('BASARISIZ cagri da kaydedilir — retry dongusu gorunmez kalmasin', async () => {
    const recorder = recordingRecorder();
    stubFetch(() => ({ ok: false, status: 429, text: () => Promise.resolve('rate limited') }));

    await expect(new OpenAiEmbeddingAdapter({ ...OPTIONS, recorder }).embed('m')).rejects.toThrow(
      EmbeddingFailedError,
    );

    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0]).toMatchObject({ outcome: 'error' });
  });

  it('usage yoksa cagri BASARILI sayilir; olcu `null` kalir', async () => {
    const recorder = recordingRecorder();
    stubFetch(() => okResponse([0.1, 0.2]));

    await expect(new OpenAiEmbeddingAdapter({ ...OPTIONS, recorder }).embed('m')).resolves.toEqual([
      0.1, 0.2,
    ]);

    expect(recorder.calls[0]).toMatchObject({
      outcome: 'ok',
      usage: { prompt: null, completion: null, total: null },
    });
  });
});
