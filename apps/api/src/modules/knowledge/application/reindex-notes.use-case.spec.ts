import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { RateLimitExceededError } from '../domain/knowledge.error';
import { type NoteChunk } from '../domain/note-chunk.entity';
import { type Note } from '../domain/note.entity';
import { type EmbeddingPort } from './embedding.port';
import { type NoteChunkRepository } from './note-chunk.repository.port';
import { type NoteListPage, type NoteRepository, type UnindexedNote } from './note.repository.port';
import { type RateLimitRepository, type RegisterRequestInput } from './rate-limit.repository.port';
import { ReindexNotesUseCase, type ReindexNotesDependencies } from './reindex-notes.use-case';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

const NOW = new Date('2026-08-05T10:00:00.000Z');
const TENANT_ID = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const USER_ID = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';

type CallLog = string[];

class FakeNoteRepository implements NoteRepository {
  pending: UnindexedNote[] = [];
  /** `countUnindexed` her cagrildiginda sirayla tuketilir. */
  remainingCounts: number[] = [0];
  lastListLimit: number | null = null;

  constructor(private readonly calls: CallLog) {}

  save(_note: Note): Promise<void> {
    return Promise.resolve();
  }

  existsForTenant(): Promise<boolean> {
    return Promise.resolve(true);
  }

  listForTenant(): Promise<NoteListPage> {
    return Promise.resolve({ items: [], total: 0 });
  }

  countUnindexed(): Promise<number> {
    this.calls.push('count');
    return Promise.resolve(this.remainingCounts.shift() ?? 0);
  }

  listUnindexed(limit: number): Promise<UnindexedNote[]> {
    this.calls.push('list');
    this.lastListLimit = limit;
    return Promise.resolve(this.pending);
  }
}

class FakeNoteChunkRepository implements NoteChunkRepository {
  readonly saved: NoteChunk[][] = [];
  failForNoteIds = new Set<string>();

  constructor(private readonly calls: CallLog) {}

  saveAll(chunks: readonly NoteChunk[]): Promise<void> {
    this.calls.push('chunks.saveAll');
    const noteId = chunks[0]?.noteId.value ?? '';
    if (this.failForNoteIds.has(noteId)) {
      return Promise.reject(new Error('unique kisiti'));
    }
    this.saved.push([...chunks]);
    return Promise.resolve();
  }
}

class FakeEmbeddingPort implements EmbeddingPort {
  failWith: Error | null = null;
  callCount = 0;

  constructor(private readonly calls: CallLog) {}

  embed(): Promise<number[]> {
    this.calls.push('embed');
    this.callCount += 1;
    if (this.failWith !== null) {
      return Promise.reject(this.failWith);
    }
    return Promise.resolve(Array.from({ length: 1536 }, () => 0.1));
  }
}

class FakeRateLimitRepository implements RateLimitRepository {
  count = 1;
  lastAction: string | null = null;

  constructor(private readonly calls: CallLog) {}

  registerRequest(input: RegisterRequestInput): Promise<number> {
    this.calls.push('rateLimit');
    this.lastAction = input.action;
    return Promise.resolve(this.count);
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

class SequentialIdGenerator implements IdGenerator {
  #n = 1;
  nextId(): string {
    const suffix = String(this.#n).padStart(12, '0');
    this.#n += 1;
    return `018f3a2b-7c4d-7e1f-8a2b-${suffix}`;
  }
}

class FixedClock implements Clock {
  now(): Date {
    return new Date(NOW.getTime());
  }
}

function createHarness(overrides: Partial<{ batchSize: number; rateLimit: number }> = {}) {
  const calls: CallLog = [];
  const noteRepository = new FakeNoteRepository(calls);
  const noteChunkRepository = new FakeNoteChunkRepository(calls);
  const rateLimits = new FakeRateLimitRepository(calls);
  const embeddingPort = new FakeEmbeddingPort(calls);
  const transactionManager = new FakeTransactionManager(calls);

  const deps: ReindexNotesDependencies = {
    noteRepository,
    noteChunkRepository,
    rateLimitRepository: rateLimits,
    embeddingPort,
    transactionManager,
    idGenerator: new SequentialIdGenerator(),
    clock: new FixedClock(),
    batchSize: overrides.batchSize ?? 10,
    rateLimit: overrides.rateLimit ?? 60,
  };

  return {
    noteRepository,
    noteChunkRepository,
    rateLimits,
    embeddingPort,
    transactionManager,
    calls,
    useCase: new ReindexNotesUseCase(deps),
  };
}

function unindexed(id: string, body = 'kisa bir not govdesi'): UnindexedNote {
  return { id: `018f3a2b-7c4d-7e1f-8a2b-0000000000${id}`, body, createdAt: NOW };
}

function command() {
  return { tenantId: TENANT_ID, userId: USER_ID };
}

// --- Mutlu yol ---------------------------------------------------------------

describe('ReindexNotesUseCase — onarim', () => {
  it('chunk siz notu indeksler', async () => {
    const harness = createHarness();
    harness.noteRepository.pending = [unindexed('a1')];

    const result = await harness.useCase.execute(command());

    expect(result).toMatchObject({ repaired: 1, failed: 0 });
    expect(harness.noteChunkRepository.saved).toHaveLength(1);
  });

  it('BIRDEN COK notu ayri ayri onarir', async () => {
    const harness = createHarness();
    harness.noteRepository.pending = [unindexed('a1'), unindexed('a2'), unindexed('a3')];

    expect(await harness.useCase.execute(command())).toMatchObject({ repaired: 3, failed: 0 });
  });

  it('HER NOT KENDI transaction inda yazilir', async () => {
    // Tek buyuk transaction, 10 notluk bir onarimda son notun hatasi yuzunden
    // dokuzunun da geri alinmasi demekti.
    const harness = createHarness();
    harness.noteRepository.pending = [unindexed('a1'), unindexed('a2')];

    await harness.useCase.execute(command());

    expect(harness.noteChunkRepository.saved).toHaveLength(2);
  });

  it('embedding TRANSACTION DISINDA calisir', async () => {
    const harness = createHarness();
    harness.noteRepository.pending = [unindexed('a1')];

    await harness.useCase.execute(command());

    // T1 (list) kapandiktan sonra embed, sonra T2 (chunks.saveAll).
    const embed = harness.calls.indexOf('embed');
    expect(harness.calls[embed - 1]).toBe('tx.commit');
    expect(harness.calls.indexOf('chunks.saveAll')).toBeGreaterThan(embed);
  });

  it('onarilacak not YOKSA embedding CAGRILMAZ', async () => {
    const harness = createHarness();
    harness.noteRepository.pending = [];

    const result = await harness.useCase.execute(command());

    expect(result).toMatchObject({ repaired: 0, failed: 0, remaining: 0 });
    expect(harness.embeddingPort.callCount).toBe(0);
  });

  it('kalan sayisi ONARIMDAN SONRA olculur', async () => {
    // Istemci "bitti mi" sorusunu bu alandan yanitlar; tek cagri batch kadar
    // onarir.
    const harness = createHarness({ batchSize: 1 });
    harness.noteRepository.pending = [unindexed('a1')];
    harness.noteRepository.remainingCounts = [4];

    expect(await harness.useCase.execute(command())).toMatchObject({ repaired: 1, remaining: 4 });
  });

  it('batch boyutu CONFIG ten gelir', async () => {
    const harness = createHarness({ batchSize: 3 });

    await harness.useCase.execute(command());

    expect(harness.noteRepository.lastListLimit).toBe(3);
  });
});

// --- Hata izolasyonu ---------------------------------------------------------

describe('ReindexNotesUseCase — bir notun hatasi', () => {
  it('DIGERLERINI DURDURMAZ', async () => {
    const harness = createHarness();
    harness.noteRepository.pending = [unindexed('a1'), unindexed('a2')];
    harness.noteChunkRepository.failForNoteIds.add('018f3a2b-7c4d-7e1f-8a2b-0000000000a1');

    expect(await harness.useCase.execute(command())).toMatchObject({ repaired: 1, failed: 1 });
  });

  it('embedding cokerse o not FAILED sayilir, istek COKMEZ', async () => {
    const harness = createHarness();
    harness.noteRepository.pending = [unindexed('a1')];
    harness.embeddingPort.failWith = new Error('saglayici 500');

    const result = await harness.useCase.execute(command());

    expect(result).toMatchObject({ repaired: 0, failed: 1 });
  });

  it('basarisiz notun chunk lari YAZILMAZ', async () => {
    const harness = createHarness();
    harness.noteRepository.pending = [unindexed('a1')];
    harness.embeddingPort.failWith = new Error('saglayici 500');

    await harness.useCase.execute(command());

    expect(harness.noteChunkRepository.saved).toHaveLength(0);
  });
});

// --- Oran siniri -------------------------------------------------------------

describe('ReindexNotesUseCase — oran siniri', () => {
  it('create_note kovasini PAYLASIR', async () => {
    // Ayri bir kova, onarimi butcesiz bir yan kapiya cevirirdi.
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.rateLimits.lastAction).toBe('create_note');
  });

  it('limit asilinca REDDEDILIR', async () => {
    const harness = createHarness({ rateLimit: 2 });
    harness.rateLimits.count = 3;

    await expect(harness.useCase.execute(command())).rejects.toThrow(RateLimitExceededError);
  });

  it('reddedilen istek TEK KURUS harcamaz', async () => {
    const harness = createHarness({ rateLimit: 1 });
    harness.rateLimits.count = 2;
    harness.noteRepository.pending = [unindexed('a1')];

    await expect(harness.useCase.execute(command())).rejects.toThrow(RateLimitExceededError);

    expect(harness.calls).not.toContain('embed');
    expect(harness.calls).not.toContain('list');
  });

  it('sayac HER SEYDEN ONCE artar', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.calls.slice(0, 3)).toEqual(['tx.begin', 'rateLimit', 'tx.commit']);
  });
});
