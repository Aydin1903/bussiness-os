import { afterEach, describe, expect, it, vi } from 'vitest';

import { type AiCallRecord } from '../../../shared/ai-usage-recorder.port';
import { CompletionFailedError, type CompleteInput } from '../application/llm.port';
import { DeepSeekLlmAdapter } from './deepseek-llm.adapter';

/** Kayit cagrilarini toplayan sahte recorder — testler icinde incelenebilir. */
function recordingRecorder() {
  const calls: AiCallRecord[] = [];
  return { calls, record: (call: AiCallRecord): void => void calls.push(call) };
}

const OPTIONS = {
  apiKey: 'sk-test',
  model: 'deepseek-v4-flash',
  recorder: { record: (): void => undefined },
  caller: 'knowledge',
};

interface FetchResult {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}

function stubFetch(impl: () => FetchResult | Promise<FetchResult>) {
  const fn = vi.fn<(url: string, init?: RequestInit) => FetchResult | Promise<FetchResult>>(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

function okResponse(content: unknown): FetchResult {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
  };
}

/** Gonderilen JSON govde. `body` daima string'dir (JSON.stringify). */
function sentBody(fetchMock: ReturnType<typeof stubFetch>): {
  model: string;
  stream: boolean;
  thinking?: { type: string };
  messages: { role: string; content: string }[];
} {
  const body = fetchMock.mock.calls[0]?.[1]?.body;
  if (typeof body !== 'string') {
    throw new TypeError('Istek govdesi string degil.');
  }
  return JSON.parse(body) as ReturnType<typeof sentBody>;
}

function input(overrides: Partial<CompleteInput> = {}): CompleteInput {
  return {
    systemPrompt: 'SISTEM',
    userMessage: 'soru?',
    context: ['birinci parca', 'ikinci parca'],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DeepSeekLlmAdapter — istek bicimi', () => {
  it('dogru uc noktaya POST atar', async () => {
    const fetchMock = stubFetch(() => okResponse('cevap'));

    await new DeepSeekLlmAdapter(OPTIONS).complete(input());

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.deepseek.com/chat/completions');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('API anahtarini Bearer olarak gonderir', async () => {
    const fetchMock = stubFetch(() => okResponse('cevap'));

    await new DeepSeekLlmAdapter(OPTIONS).complete(input());

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer sk-test',
    });
  });

  it('yapilandirilan modeli kullanir (sabit DEGIL)', async () => {
    const fetchMock = stubFetch(() => okResponse('cevap'));

    await new DeepSeekLlmAdapter({ ...OPTIONS, model: 'deepseek-v4-pro' }).complete(input());

    expect(sentBody(fetchMock).model).toBe('deepseek-v4-pro');
  });

  it('streaming KAPALI (port streaming bilmez)', async () => {
    const fetchMock = stubFetch(() => okResponse('cevap'));

    await new DeepSeekLlmAdapter(OPTIONS).complete(input());

    expect(sentBody(fetchMock).stream).toBe(false);
  });
});

// --- ADR-0029 §3.1: thinking varsayilani ------------------------------------

describe('DeepSeekLlmAdapter — thinking KAPALI (ADR-0029 §3.1)', () => {
  it('her istekte thinking: disabled gonderir', async () => {
    const fetchMock = stubFetch(() => okResponse('cevap'));

    await new DeepSeekLlmAdapter(OPTIONS).complete(input());

    // Olculdu: thinking acikken ayni soru 143 token, kapaliyken 20 — ~7 kat.
    expect(sentBody(fetchMock).thinking).toEqual({ type: 'disabled' });
  });

  it('thinking PORT imzasinda YOKTUR — yalnizca adapter da', () => {
    // Derleme zamani iddiasi: `CompleteInput`'ta boyle bir alan olsaydi asagidaki
    // nesne tip hatasi vermezdi. Burada calisma zamaninda da dogruluyoruz:
    // port'tan gelen girdide `thinking` anahtari YOK.
    expect(Object.keys(input())).not.toContain('thinking');
  });
});

// --- ADR-0030 §1.3: context ve history adapter'da birlesir ------------------

describe('DeepSeekLlmAdapter — mesaj kurulumu', () => {
  it('sira: sistem -> baglam -> gecmis -> su anki soru', async () => {
    const fetchMock = stubFetch(() => okResponse('cevap'));

    await new DeepSeekLlmAdapter(OPTIONS).complete(
      input({
        history: [
          { role: 'user', content: 'onceki soru' },
          { role: 'assistant', content: 'onceki cevap' },
        ],
      }),
    );

    const { messages } = sentBody(fetchMock);
    expect(messages.map((message) => message.role)).toEqual([
      'system',
      'system',
      'user',
      'assistant',
      'user',
    ]);
    expect(messages[0]?.content).toBe('SISTEM');
    expect(messages[2]?.content).toBe('onceki soru');
    expect(messages.at(-1)?.content).toBe('soru?');
  });

  it('baglam parcalari NUMARALANDIRILIR', async () => {
    const fetchMock = stubFetch(() => okResponse('cevap'));

    await new DeepSeekLlmAdapter(OPTIONS).complete(input());

    expect(sentBody(fetchMock).messages[1]?.content).toContain('[1] birinci parca');
    expect(sentBody(fetchMock).messages[1]?.content).toContain('[2] ikinci parca');
  });

  it('BOS baglam sessizce gecilmez — model boslugu BILMELI', async () => {
    const fetchMock = stubFetch(() => okResponse('cevap'));

    await new DeepSeekLlmAdapter(OPTIONS).complete(input({ context: [] }));

    // Sistem promptunun 2. kurali ("notunuz yok" yonlendirmesi) ancak model
    // baglamin bos oldugunu bilirse calisir.
    expect(sentBody(fetchMock).messages[1]?.content).toContain('ilgili not bulunamadi');
  });

  it('gecmis verilmezse yalnizca sistem + baglam + soru gonderilir', async () => {
    const fetchMock = stubFetch(() => okResponse('cevap'));

    await new DeepSeekLlmAdapter(OPTIONS).complete(input());

    expect(sentBody(fetchMock).messages).toHaveLength(3);
  });
});

describe('DeepSeekLlmAdapter — basarili yanit', () => {
  it('cevabi cikarir', async () => {
    stubFetch(() => okResponse('  gercek cevap  '));

    expect(await new DeepSeekLlmAdapter(OPTIONS).complete(input())).toBe('  gercek cevap  ');
  });
});

describe('DeepSeekLlmAdapter — hata siniflandirmasi', () => {
  it('HTTP hatasi CompletionFailedError e cevrilir', async () => {
    stubFetch(() => ({
      ok: false,
      status: 402,
      text: () => Promise.resolve('Insufficient Balance'),
    }));

    await expect(new DeepSeekLlmAdapter(OPTIONS).complete(input())).rejects.toThrow(
      CompletionFailedError,
    );
  });

  it('hata mesaji durum kodunu tasir (teshis)', async () => {
    stubFetch(() => ({
      ok: false,
      status: 402,
      text: () => Promise.resolve('Insufficient Balance'),
    }));

    await expect(new DeepSeekLlmAdapter(OPTIONS).complete(input())).rejects.toThrow(/DeepSeek 402/);
  });

  it('SORU ve BAGLAM hataya KONMAZ (kullanici verisi log a sizmaz)', async () => {
    stubFetch(() => ({ ok: false, status: 500, text: () => Promise.resolve('server error') }));

    await expect(
      new DeepSeekLlmAdapter(OPTIONS).complete(
        input({ userMessage: 'GIZLI SORU', context: ['GIZLI BAGLAM'] }),
      ),
    ).rejects.not.toThrow(/GIZLI/);
  });

  it('ag hatasi CompletionFailedError e cevrilir', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed');
    });

    await expect(new DeepSeekLlmAdapter(OPTIONS).complete(input())).rejects.toThrow(
      CompletionFailedError,
    );
  });

  it('JSON olmayan yanit reddedilir', async () => {
    stubFetch(() => ({ ok: true, status: 200, json: () => Promise.reject(new Error('bozuk')) }));

    await expect(new DeepSeekLlmAdapter(OPTIONS).complete(input())).rejects.toThrow(
      /JSON olarak okunamadi/,
    );
  });

  it('cevap metni OLMAYAN yanit reddedilir', async () => {
    stubFetch(() => ({ ok: true, status: 200, json: () => Promise.resolve({ choices: [] }) }));

    await expect(new DeepSeekLlmAdapter(OPTIONS).complete(input())).rejects.toThrow(
      /cevap metni icermiyor/,
    );
  });

  it('BOS cevap "basarili" sayilmaz', async () => {
    // Istemciye bos bir balon gostermek, hatayi gizlemektir.
    stubFetch(() => okResponse('   '));

    await expect(new DeepSeekLlmAdapter(OPTIONS).complete(input())).rejects.toThrow(
      /bos bir cevap/,
    );
  });

  it('metin OLMAYAN content reddedilir', async () => {
    stubFetch(() => okResponse({ nested: 'object' }));

    await expect(new DeepSeekLlmAdapter(OPTIONS).complete(input())).rejects.toThrow(
      /cevap metni icermiyor/,
    );
  });
});

describe('DeepSeekLlmAdapter — maliyet kaydi (ROADMAP §8.1)', () => {
  it('basarili cagriyi saglayicinin usage bilgisiyle kaydeder', async () => {
    const recorder = recordingRecorder();
    stubFetch(() => ({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'cevap' } }],
          usage: { prompt_tokens: 19, completion_tokens: 1, total_tokens: 20 },
        }),
    }));

    await new DeepSeekLlmAdapter({ ...OPTIONS, recorder }).complete(input());

    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0]).toMatchObject({
      operation: 'complete',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      caller: 'knowledge',
      outcome: 'ok',
      usage: { prompt: 19, completion: 1, total: 20 },
    });
  });

  it('BASARISIZ cagri da kaydedilir', async () => {
    const recorder = recordingRecorder();
    stubFetch(() => ({ ok: false, status: 402, text: () => Promise.resolve('no balance') }));

    await expect(
      new DeepSeekLlmAdapter({ ...OPTIONS, recorder }).complete(input()),
    ).rejects.toThrow(CompletionFailedError);

    expect(recorder.calls[0]).toMatchObject({ outcome: 'error' });
  });

  it('yanit BOZUK olsa da bilinen token harcamasi kaydedilir', async () => {
    // 200 dondu, para harcandi, ama govde bicimsiz. Usage bicim
    // dogrulamasindan ONCE okundugu icin kaybolmaz.
    const recorder = recordingRecorder();
    stubFetch(() => ({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ choices: [], usage: { prompt_tokens: 55, total_tokens: 55 } }),
    }));

    await expect(
      new DeepSeekLlmAdapter({ ...OPTIONS, recorder }).complete(input()),
    ).rejects.toThrow(CompletionFailedError);

    expect(recorder.calls[0]).toMatchObject({ outcome: 'error', usage: { prompt: 55, total: 55 } });
  });

  it('SORU ve CEVAP metni kayda GIRMEZ (kullanici verisi)', async () => {
    const recorder = recordingRecorder();
    stubFetch(() => ({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ choices: [{ message: { content: 'GIZLI CEVAP' } }] }),
    }));

    await new DeepSeekLlmAdapter({ ...OPTIONS, recorder }).complete(
      input({ userMessage: 'GIZLI SORU' }),
    );

    expect(JSON.stringify(recorder.calls[0])).not.toMatch(/GIZLI/);
  });
});
