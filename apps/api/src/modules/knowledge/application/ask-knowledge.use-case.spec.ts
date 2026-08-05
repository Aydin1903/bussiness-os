import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { AskKnowledgeUseCase, type AskKnowledgeDependencies } from './ask-knowledge.use-case';
import { type ConversationRepository, type NewMessage } from './conversation.repository.port';
import { ConversationAccessDeniedError, RateLimitExceededError } from '../domain/knowledge.error';
import { EmbeddingFailedError, type EmbeddingPort } from '../../../shared/embedding.port';
import { FOLLOW_UP_MARKER, KNOWLEDGE_SYSTEM_PROMPT } from './knowledge-prompt';
import {
  CompletionFailedError,
  type CompleteInput,
  type LLMPort,
  type LlmMessage,
} from '../../../shared/llm.port';
import { type NoteChunkSearch, type SimilarChunk } from './note-chunk-search.port';
import { type RateLimitRepository, type RegisterRequestInput } from './rate-limit.repository.port';
import { type TenantId } from '../domain/tenant-id.value-object';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

const NOW = new Date('2026-08-02T10:30:00.000Z');
const TENANT_ID = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const USER_ID = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';
const CONVERSATION_ID = '018f3a2b-7c4d-7e1f-8a2b-0000000000f1';
const NOTE_A = '018f3a2b-7c4d-7e1f-8a2b-00000000000a';
const NOTE_B = '018f3a2b-7c4d-7e1f-8a2b-00000000000b';

type CallLog = string[];

class FakeNoteChunkSearch implements NoteChunkSearch {
  chunks: SimilarChunk[] = [{ content: 'muhasebe notu parcasi', noteId: NOTE_A }];
  lastLimit: number | null = null;

  constructor(private readonly calls: CallLog) {}

  findSimilar(input: { limit: number }): Promise<SimilarChunk[]> {
    this.calls.push('search');
    this.lastLimit = input.limit;
    return Promise.resolve(this.chunks);
  }
}

class FakeConversationRepository implements ConversationRepository {
  history: LlmMessage[] = [];
  /** Konusmanin sahibi. `null` = konusma yok (ya da baska tenant'ta). */
  ownerUserId: string | null = USER_ID;
  lastHistoryLimit: number | null = null;
  appended: {
    conversationId: string | null;
    messages: readonly NewMessage[];
  }[] = [];

  constructor(private readonly calls: CallLog) {}

  findOwnerUserId(): Promise<string | null> {
    this.calls.push('owner');
    return Promise.resolve(this.ownerUserId);
  }

  findRecentMessages(input: { conversationId: string; limit: number }): Promise<LlmMessage[]> {
    this.calls.push('history');
    this.lastHistoryLimit = input.limit;
    return Promise.resolve(this.history);
  }

  appendTurn(input: {
    tenantId: TenantId;
    userId: string;
    conversationId: string | null;
    newConversationId: string;
    messages: readonly NewMessage[];
  }): Promise<{ conversationId: string }> {
    this.calls.push('appendTurn');
    this.appended.push({ conversationId: input.conversationId, messages: input.messages });
    return Promise.resolve({
      conversationId: input.conversationId ?? input.newConversationId,
    });
  }
}

class FakeEmbeddingPort implements EmbeddingPort {
  failWith: Error | null = null;

  constructor(private readonly calls: CallLog) {}

  embed(): Promise<number[]> {
    this.calls.push('embed');
    if (this.failWith !== null) {
      return Promise.reject(this.failWith);
    }
    return Promise.resolve([0.1, 0.2]);
  }
}

class FakeLlmPort implements LLMPort {
  lastInput: CompleteInput | null = null;
  failWith: Error | null = null;

  constructor(private readonly calls: CallLog) {}

  complete(input: CompleteInput): Promise<string> {
    this.calls.push('complete');
    this.lastInput = input;
    if (this.failWith !== null) {
      return Promise.reject(this.failWith);
    }
    return Promise.resolve('cevap');
  }
}

class FakeTransactionManager implements TransactionManager {
  opened = 0;

  constructor(private readonly calls: CallLog) {}

  runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.runInCurrentTenantTransaction(fn);
  }
  runInTenantTransaction<T>(_tenantId: string, fn: () => Promise<T>): Promise<T> {
    return this.runInCurrentTenantTransaction(fn);
  }
  async runInCurrentTenantTransaction<T>(fn: () => Promise<T>): Promise<T> {
    this.opened += 1;
    this.calls.push('tx.begin');
    try {
      return await fn();
    } finally {
      this.calls.push('tx.commit');
    }
  }
}

/**
 * Oran siniri sayaci FAKE'i.
 *
 * Gercek repository UPSERT ile artirip artmis degeri doner; burada bellekte
 * ayni sozlesme taklit edilir — anahtar `(tenant, kullanici, eylem, pencere)`.
 */
class FakeRateLimitRepository implements RateLimitRepository {
  readonly counters = new Map<string, number>();

  constructor(private readonly calls: CallLog) {}

  registerRequest(input: RegisterRequestInput): Promise<number> {
    this.calls.push('rateLimit');
    const key = [
      input.tenantId.value,
      input.userId,
      input.action,
      input.windowStart.toISOString(),
    ].join('|');
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return Promise.resolve(next);
  }

  /** Sayaci istenen degere kurar — "limit dolmus" durumunu hazirlamak icin. */
  preset(input: { tenantId: string; userId: string; action: string; count: number }): void {
    const windowStart = new Date(NOW.getTime());
    windowStart.setUTCMinutes(0, 0, 0);
    const key = [input.tenantId, input.userId, input.action, windowStart.toISOString()].join('|');
    this.counters.set(key, input.count);
  }
}

class FixedClock implements Clock {
  now(): Date {
    return new Date(NOW.getTime());
  }
}

class SequentialIdGenerator implements IdGenerator {
  #n = 1;
  nextId(): string {
    const suffix = String(this.#n).padStart(12, '0');
    this.#n += 1;
    return `018f3a2b-7c4d-7e1f-8a2b-${suffix}`;
  }
}

interface Harness {
  readonly search: FakeNoteChunkSearch;
  readonly rateLimits: FakeRateLimitRepository;
  readonly conversations: FakeConversationRepository;
  readonly embedding: FakeEmbeddingPort;
  readonly llm: FakeLlmPort;
  readonly transactionManager: FakeTransactionManager;
  readonly calls: CallLog;
  readonly useCase: AskKnowledgeUseCase;
}

function createHarness(
  overrides: Partial<{ retrievalLimit: number; historyMessages: number; rateLimit: number }> = {},
): Harness {
  const calls: CallLog = [];
  const rateLimits = new FakeRateLimitRepository(calls);
  const search = new FakeNoteChunkSearch(calls);
  const conversations = new FakeConversationRepository(calls);
  const embedding = new FakeEmbeddingPort(calls);
  const llm = new FakeLlmPort(calls);
  const transactionManager = new FakeTransactionManager(calls);

  const deps: AskKnowledgeDependencies = {
    noteChunkSearch: search,
    conversationRepository: conversations,
    rateLimitRepository: rateLimits,
    embeddingPort: embedding,
    llmPort: llm,
    transactionManager,
    idGenerator: new SequentialIdGenerator(),
    clock: new FixedClock(),
    retrievalLimit: overrides.retrievalLimit ?? 8,
    historyMessages: overrides.historyMessages ?? 8,
    rateLimit: overrides.rateLimit ?? 30,
  };

  return {
    search,
    rateLimits,
    conversations,
    embedding,
    llm,
    transactionManager,
    calls,
    useCase: new AskKnowledgeUseCase(deps),
  };
}

function command(overrides: Partial<{ question: string; conversationId: string | null }> = {}) {
  return {
    tenantId: TENANT_ID,
    userId: USER_ID,
    question: 'Fatura sureci nasil isliyor?',
    conversationId: null,
    ...overrides,
  };
}

describe('AskKnowledgeUseCase — mutlu yol', () => {
  it('cevabi doner', async () => {
    const harness = createHarness();

    expect((await harness.useCase.execute(command())).answer).toBe('cevap');
  });

  it('kaynak not id lerini doner', async () => {
    const harness = createHarness();

    expect((await harness.useCase.execute(command())).sourceNoteIds).toEqual([NOTE_A]);
  });

  it('yeni konusma acildiginda id sini doner', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute(command({ conversationId: null }));

    expect(result.conversationId).toMatch(/^018f3a2b/);
  });

  it('verilen konusma id sini KORUR', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute(command({ conversationId: CONVERSATION_ID }));

    expect(result.conversationId).toBe(CONVERSATION_ID);
  });

  it('sorunun bosluklarini kirpar', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command({ question: '  soru  ' }));

    expect(harness.llm.lastInput?.userMessage).toBe('soru');
  });
});

// --- ADR-0029 §4: cagri sirasi — bu dosyanin ASIL iddiasi -------------------

describe('AskKnowledgeUseCase — IKI ag cagrisi, IKISI DE transaction disinda', () => {
  it('sira: T0 -> embed -> T1 -> complete -> T2', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command({ conversationId: CONVERSATION_ID }));

    expect(harness.calls).toEqual([
      'tx.begin',
      'rateLimit',
      'tx.commit',
      'embed',
      'tx.begin',
      'owner',
      'search',
      'history',
      'tx.commit',
      'complete',
      'tx.begin',
      'appendTurn',
      'tx.commit',
    ]);
  });

  it('TAM UC transaction acar (T0 · T1 · T2)', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    // T0 ayri sayilir ve AYRI olmasi gerekir: sayac T1'e girseydi, hata
    // halinde geri alinir ve hatali istekler bedava olurdu (ADR-0029 §5).
    expect(harness.transactionManager.opened).toBe(3);
  });

  it('embed HICBIR transaction icinde degil', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    // T0 KAPANDIKTAN sonra, T1 ACILMADAN once.
    const embed = harness.calls.indexOf('embed');
    expect(embed).toBeGreaterThan(harness.calls.indexOf('tx.commit'));
    expect(embed).toBeLessThan(harness.calls.lastIndexOf('tx.begin'));
    expect(harness.calls[embed - 1]).toBe('tx.commit');
  });

  it('complete iki transaction ARASINDA', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    const firstCommit = harness.calls.indexOf('tx.commit');
    const secondBegin = harness.calls.lastIndexOf('tx.begin');
    const complete = harness.calls.indexOf('complete');

    expect(complete).toBeGreaterThan(firstCommit);
    expect(complete).toBeLessThan(secondBegin);
  });
});

// --- ADR-0030 §1: konusma hafizasi -----------------------------------------

describe('AskKnowledgeUseCase — gecmis', () => {
  it('config teki mesaj sayisiyla gecmisi ceker', async () => {
    const harness = createHarness({ historyMessages: 6 });

    await harness.useCase.execute(command({ conversationId: CONVERSATION_ID }));

    expect(harness.conversations.lastHistoryLimit).toBe(6);
  });

  it('gecmisi `history` parametresiyle gecirir — `context`e KARISTIRMAZ', async () => {
    const harness = createHarness();
    harness.conversations.history = [
      { role: 'user', content: 'onceki soru' },
      { role: 'assistant', content: 'onceki cevap' },
    ];

    await harness.useCase.execute(command({ conversationId: CONVERSATION_ID }));

    // ADR-0030 §1.3: rol bilgisi YAPISALDIR, string'e gomulmez.
    expect(harness.llm.lastInput?.history).toEqual([
      { role: 'user', content: 'onceki soru' },
      { role: 'assistant', content: 'onceki cevap' },
    ]);
    expect(harness.llm.lastInput?.context).toEqual(['muhasebe notu parcasi']);
  });

  it('konusma id YOKSA gecmis SORGUSU HIC ACILMAZ', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command({ conversationId: null }));

    expect(harness.calls).not.toContain('history');
    expect(harness.llm.lastInput?.history).toEqual([]);
  });

  it('historyMessages=0 ise gecmis sorgusu acilmaz', async () => {
    const harness = createHarness({ historyMessages: 0 });

    await harness.useCase.execute(command({ conversationId: CONVERSATION_ID }));

    expect(harness.calls).not.toContain('history');
  });
});

// --- Konusma sahipligi ------------------------------------------------------

describe('AskKnowledgeUseCase — konusma SAHIPLIGI', () => {
  const OTHER_USER = '018f3a2b-7c4d-7e1f-9b3c-00000000000b';

  it('BASKA kullanicinin konusmasi reddedilir', async () => {
    const harness = createHarness();
    harness.conversations.ownerUserId = OTHER_USER;

    await expect(
      harness.useCase.execute(command({ conversationId: CONVERSATION_ID })),
    ).rejects.toThrow(ConversationAccessDeniedError);
  });

  it('VAR OLMAYAN konusma da AYNI hatayi verir (P2)', async () => {
    // "yok" ile "senin degil" ayirt edilirse, id deneyerek baskasinin
    // konusmasinin VARLIGI ogrenilebilirdi.
    const harness = createHarness();
    harness.conversations.ownerUserId = null;

    await expect(
      harness.useCase.execute(command({ conversationId: CONVERSATION_ID })),
    ).rejects.toThrow(ConversationAccessDeniedError);
  });

  it('reddedilen istek SESSIZCE YENI konusma ACMAZ', async () => {
    const harness = createHarness();
    harness.conversations.ownerUserId = OTHER_USER;

    await expect(
      harness.useCase.execute(command({ conversationId: CONVERSATION_ID })),
    ).rejects.toThrow(ConversationAccessDeniedError);

    expect(harness.conversations.appended).toHaveLength(0);
  });

  it('reddedilen istekte GECMIS OKUNMAZ ve LLM CAGRILMAZ', async () => {
    // Sizintinin ozu gecmistir: sahiplik dogrulanmadan okunmamali. Ayrica
    // reddedilecek bir istek icin para harcanmamali.
    const harness = createHarness();
    harness.conversations.ownerUserId = OTHER_USER;

    await expect(
      harness.useCase.execute(command({ conversationId: CONVERSATION_ID })),
    ).rejects.toThrow(ConversationAccessDeniedError);

    expect(harness.calls).not.toContain('history');
    expect(harness.calls).not.toContain('complete');
  });

  it('konusma VERILMEZSE sahiplik sorgusu HIC yapilmaz', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command({ conversationId: null }));

    expect(harness.calls).not.toContain('owner');
  });

  it('KENDI konusmasi kabul edilir', async () => {
    const harness = createHarness();
    harness.conversations.ownerUserId = USER_ID;

    await expect(
      harness.useCase.execute(command({ conversationId: CONVERSATION_ID })),
    ).resolves.toMatchObject({ conversationId: CONVERSATION_ID });
  });
});

describe('AskKnowledgeUseCase — konusma T2 de acilir', () => {
  it('soru ve cevap TEK cagrida, birlikte yazilir', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.conversations.appended).toHaveLength(1);
    expect(harness.conversations.appended[0]?.messages).toHaveLength(2);
    expect(harness.conversations.appended[0]?.messages[0]?.role).toBe('user');
    expect(harness.conversations.appended[0]?.messages[1]?.role).toBe('assistant');
  });

  it('mesaj icerikleri soru ve cevaptir', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command({ question: 'soru?' }));

    const written = harness.conversations.appended[0]?.messages;
    expect(written?.[0]?.content).toBe('soru?');
    expect(written?.[1]?.content).toBe('cevap');
  });
});

// --- systemPrompt: uc kural --------------------------------------------------

describe('AskKnowledgeUseCase — systemPrompt', () => {
  it('sabit prompt u gecirir (istemci degistiremez)', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.llm.lastInput?.systemPrompt).toBe(KNOWLEDGE_SYSTEM_PROMPT);
  });

  it('1. KURAL: yalnizca baglamdan cevap ver, uydurma', () => {
    expect(KNOWLEDGE_SYSTEM_PROMPT).toMatch(/YALNIZCA sana verilen baglamdaki bilgiyi kullan/);
    expect(KNOWLEDGE_SYSTEM_PROMPT).toMatch(/EKLEME veya UYDURMA/);
  });

  it('2. KURAL: bos baglamda duz "bilmiyorum" degil, YONLENDIRME', () => {
    expect(KNOWLEDGE_SYSTEM_PROMPT).toMatch(/duz "bilmiyorum" deme/);
    expect(KNOWLEDGE_SYSTEM_PROMPT).toMatch(/Bu konuda henuz bir notunuz yok/);
    expect(KNOWLEDGE_SYSTEM_PROMPT).toMatch(/bir dahaki sefere bu soruyu cevaplayabilirim/);
  });

  it('3. KURAL: belirsiz soruda tahmin etme, netlestir', () => {
    expect(KNOWLEDGE_SYSTEM_PROMPT).toMatch(/belirsiz/);
    expect(KNOWLEDGE_SYSTEM_PROMPT).toMatch(/tahmin etme/);
    expect(KNOWLEDGE_SYSTEM_PROMPT).toMatch(/netlestirici bir soru sor/);
  });

  it('dil talimati var (TR/EN icin ayri prompt YOK)', () => {
    expect(KNOWLEDGE_SYSTEM_PROMPT).toMatch(/Kullanicinin sordugu dilde cevap ver/);
  });

  it('KISA tutulmus — uzun talimat modeli bulandirir', () => {
    // DORT kural + dil satiri. Sinir keyfi degil: prompt buyudukce kurallar
    // birbiriyle yarisir ve model hangisini onceleyecegini bilemez.
    //
    // Sinir 800'den 1100'e cikarildi (2026-08-05): takip sorusu kurali BILEREK
    // eklendi (ADR-0029 §4, ayri bir LLM cagrisindan kacinmak icin). Testi
    // silmek yerine yeni gercege gore guncellendi — kural hala korunuyor.
    expect(KNOWLEDGE_SYSTEM_PROMPT.length).toBeLessThan(1100);
  });

  it('takip sorusu kurali ve ayrac promptta', () => {
    expect(KNOWLEDGE_SYSTEM_PROMPT).toContain(FOLLOW_UP_MARKER);
    expect(KNOWLEDGE_SYSTEM_PROMPT).toContain('takip sorusu');
  });
});

// --- Retrieval ----------------------------------------------------------------

describe('AskKnowledgeUseCase — retrieval', () => {
  it('config teki limiti kullanir', async () => {
    const harness = createHarness({ retrievalLimit: 3 });

    await harness.useCase.execute(command());

    expect(harness.search.lastLimit).toBe(3);
  });

  it('chunk METINLERINI context e gecirir, not id lerini DEGIL', async () => {
    const harness = createHarness();
    harness.search.chunks = [
      { content: 'birinci', noteId: NOTE_A },
      { content: 'ikinci', noteId: NOTE_B },
    ];

    await harness.useCase.execute(command());

    // Modele not id'si GONDERILMEZ: uydurma bir id'nin yanita girmesine kapi
    // acardi. Kaynak listesi retrieval'in gercek satirlarindan TURETILIR.
    expect(harness.llm.lastInput?.context).toEqual(['birinci', 'ikinci']);
    expect(JSON.stringify(harness.llm.lastInput)).not.toContain(NOTE_A);
  });

  it('AYNI nottan gelen parcalar kaynak listesinde TEKILLESIR', async () => {
    const harness = createHarness();
    harness.search.chunks = [
      { content: 'p1', noteId: NOTE_A },
      { content: 'p2', noteId: NOTE_A },
      { content: 'p3', noteId: NOTE_B },
    ];

    const result = await harness.useCase.execute(command());

    expect(result.sourceNoteIds).toEqual([NOTE_A, NOTE_B]);
  });

  it('tekillestirme ALAKA SIRASINI korur', async () => {
    const harness = createHarness();
    harness.search.chunks = [
      { content: 'p1', noteId: NOTE_B },
      { content: 'p2', noteId: NOTE_A },
    ];

    expect((await harness.useCase.execute(command())).sourceNoteIds).toEqual([NOTE_B, NOTE_A]);
  });

  it('hic chunk yoksa bos context ve bos kaynak listesi', async () => {
    const harness = createHarness();
    harness.search.chunks = [];

    const result = await harness.useCase.execute(command());

    expect(harness.llm.lastInput?.context).toEqual([]);
    expect(result.sourceNoteIds).toEqual([]);
  });
});

// --- Hata yollari -------------------------------------------------------------

describe('AskKnowledgeUseCase — hata yollari', () => {
  it('embedding cokerse EmbeddingFailedError ve YALNIZCA T0 acilmis olur', async () => {
    const harness = createHarness();
    harness.embedding.failWith = new Error('saglayici 500');

    await expect(harness.useCase.execute(command())).rejects.toThrow(EmbeddingFailedError);

    // T0 (sayac) acilir ve COMMIT EDILIR; T1/T2 hic acilmaz. Sayacin geri
    // alinmamasi bilinclidir (ADR-0029 §5): aksi halde hata ureten istekler
    // bedava olur ve bir hata dongusu sinirsiz para harcayabilirdi.
    expect(harness.transactionManager.opened).toBe(1);
  });

  it('completion cokerse CompletionFailedError', async () => {
    const harness = createHarness();
    harness.llm.failWith = new Error('saglayici 500');

    await expect(harness.useCase.execute(command())).rejects.toThrow(CompletionFailedError);
  });

  it('completion cokerse HICBIR mesaj yazilmaz (yan etki YOK)', async () => {
    const harness = createHarness();
    harness.llm.failWith = new Error('saglayici 500');

    await expect(harness.useCase.execute(command())).rejects.toThrow();

    // Cevapsiz bir soru, bir sonraki istegin gecmisini kirletirdi.
    expect(harness.conversations.appended).toHaveLength(0);
    // T0 + T1 acildi, T2 ACILMADI.
    expect(harness.transactionManager.opened).toBe(2);
  });

  it('saglayici mesajini teshis icin tasir', async () => {
    const harness = createHarness();
    harness.llm.failWith = new Error('rate limited');

    await expect(harness.useCase.execute(command())).rejects.toThrow(/rate limited/);
  });

  it('gecersiz tenant id transaction ACMADAN reddedilir', async () => {
    const harness = createHarness();

    await expect(harness.useCase.execute({ ...command(), tenantId: 'gecersiz' })).rejects.toThrow();
    expect(harness.calls).toHaveLength(0);
  });
});

// --- Oran siniri (ADR-0029 §5) ---------------------------------------------

describe('AskKnowledgeUseCase — oran siniri', () => {
  it('limit ALTINDA istek gecer', async () => {
    const harness = createHarness({ rateLimit: 3 });
    harness.rateLimits.preset({ tenantId: TENANT_ID, userId: USER_ID, action: 'ask', count: 1 });

    await expect(harness.useCase.execute(command())).resolves.toBeDefined();
  });

  it('limit ASILINCA reddedilir', async () => {
    const harness = createHarness({ rateLimit: 3 });
    harness.rateLimits.preset({ tenantId: TENANT_ID, userId: USER_ID, action: 'ask', count: 3 });

    // Sayac 4'e cikar; 4 > 3 -> reddedilir.
    await expect(harness.useCase.execute(command())).rejects.toThrow(RateLimitExceededError);
  });

  it('ESITLIK gecer — limit "EN FAZLA N" demektir', async () => {
    const harness = createHarness({ rateLimit: 3 });
    harness.rateLimits.preset({ tenantId: TENANT_ID, userId: USER_ID, action: 'ask', count: 2 });

    await expect(harness.useCase.execute(command())).resolves.toBeDefined();
  });

  it('reddedilen istek TEK KURUS harcamaz — embed ve complete CAGRILMAZ', async () => {
    // Bu testin varlik sebebi budur: sinir, para harcandiktan SONRA devreye
    // girerse hicbir sey korumaz.
    const harness = createHarness({ rateLimit: 1 });
    harness.rateLimits.preset({ tenantId: TENANT_ID, userId: USER_ID, action: 'ask', count: 1 });

    await expect(harness.useCase.execute(command())).rejects.toThrow(RateLimitExceededError);

    expect(harness.calls).not.toContain('embed');
    expect(harness.calls).not.toContain('complete');
    expect(harness.calls).not.toContain('search');
  });

  it('sayac HER SEYDEN ONCE, KENDI transaction inda artar', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    // T0 acilir, sayac artar, KAPANIR — embed ondan sonra gelir. Sayac T1'e
    // girseydi hata halinde geri alinir ve hatali istekler bedava olurdu.
    expect(harness.calls.slice(0, 4)).toEqual(['tx.begin', 'rateLimit', 'tx.commit', 'embed']);
  });

  it('FARKLI kullanicilarin sayaclari KARISMAZ', async () => {
    const harness = createHarness({ rateLimit: 1 });
    harness.rateLimits.preset({ tenantId: TENANT_ID, userId: USER_ID, action: 'ask', count: 1 });

    const other = '018f3a2b-7c4d-7e1f-9b3c-00000000000b';
    await expect(harness.useCase.execute({ ...command(), userId: other })).resolves.toBeDefined();
  });

  it('FARKLI tenant larin sayaclari KARISMAZ', async () => {
    const harness = createHarness({ rateLimit: 1 });
    harness.rateLimits.preset({ tenantId: TENANT_ID, userId: USER_ID, action: 'ask', count: 1 });

    const otherTenant = '018f3a2b-7c4d-7e1f-9b3c-0000000000b1';
    await expect(
      harness.useCase.execute({ ...command(), tenantId: otherTenant }),
    ).resolves.toBeDefined();
  });

  it('EYLEM kovalari KARISMAZ — dolu bir create_note sayaci /ask i engellemez', async () => {
    const harness = createHarness({ rateLimit: 1 });
    harness.rateLimits.preset({
      tenantId: TENANT_ID,
      userId: USER_ID,
      action: 'create_note',
      count: 99,
    });

    await expect(harness.useCase.execute(command())).resolves.toBeDefined();
  });
});
