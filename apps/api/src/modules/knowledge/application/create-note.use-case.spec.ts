import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type TenantId } from '../domain/tenant-id.value-object';
import { TARGET_CHUNK_CHARS } from '../../../shared/chunking';
import { EMBEDDING_DIMENSIONS } from '../../../shared/embedding.port';
import { type NoteChunk } from '../domain/note-chunk.entity';
import { type Note } from '../domain/note.entity';
import { CreateNoteUseCase, type CreateNoteDependencies } from './create-note.use-case';
import { type DailyReportRunRepository } from './daily-report-run.repository.port';
import { EmbeddingFailedError, type EmbeddingPort } from '../../../shared/embedding.port';
import { type NoteChunkRepository } from './note-chunk.repository.port';
import { type NoteRepository } from './note.repository.port';
import { type RateLimitRepository, type RegisterRequestInput } from './rate-limit.repository.port';
import { RateLimitExceededError } from '../domain/knowledge.error';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

const NOW = new Date('2026-08-02T10:00:00.000Z');
const TENANT_ID = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const USER_ID = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';

/**
 * Cagri sirasinin TEK kaydi.
 *
 * Bu testin ASIL iddiasi ADR-0029 §4'un transaction sirasidir; sira ancak
 * tum katilimcilar AYNI deftere yazarsa dogrulanabilir.
 */
type CallLog = string[];

class FakeNoteRepository implements NoteRepository {
  readonly saved: Note[] = [];

  constructor(private readonly calls: CallLog) {}

  save(note: Note): Promise<void> {
    this.calls.push('note.save');
    this.saved.push(note);
    return Promise.resolve();
  }

  existsForTenant(): Promise<boolean> {
    return Promise.resolve(this.saved.length > 0);
  }

  listForTenant(): Promise<never> {
    throw new Error('Bu use case listForTenant cagirmamali.');
  }

  countUnindexed(): Promise<never> {
    throw new Error('Bu use case countUnindexed cagirmamali.');
  }

  listUnindexed(): Promise<never> {
    throw new Error('Bu use case listUnindexed cagirmamali.');
  }
}

class FakeNoteChunkRepository implements NoteChunkRepository {
  readonly saved: NoteChunk[] = [];

  constructor(private readonly calls: CallLog) {}

  saveAll(chunks: readonly NoteChunk[]): Promise<void> {
    this.calls.push('chunks.saveAll');
    this.saved.push(...chunks);
    return Promise.resolve();
  }
}

interface ScheduledRun {
  readonly tenantId: string;
  readonly reportDate: string;
}

class FakeDailyReportRunRepository implements DailyReportRunRepository {
  readonly scheduled: ScheduledRun[] = [];

  constructor(private readonly calls: CallLog) {}

  ensureScheduled(input: { id: string; tenantId: TenantId; reportDate: string }): Promise<void> {
    this.calls.push('report.ensureScheduled');
    this.scheduled.push({ tenantId: input.tenantId.value, reportDate: input.reportDate });
    return Promise.resolve();
  }

  // --- Worker/dashboard yolu — not olusturma bunlari CAGIRMAZ --------------
  //
  // Bos govde yerine FIRLATIRLAR: sessizce bos donmek, yanlislikla cagrildiginda
  // testi yesil birakirdi. Tek tablo = tek repository (NoteRepository ile ayni
  // desen), ama bu use case'in o tablodaki tek isi "tembel seed"tir.

  claimPending(): Promise<never> {
    throw new Error('CreateNoteUseCase claimPending cagirmamali.');
  }

  markGenerated(): Promise<never> {
    throw new Error('CreateNoteUseCase markGenerated cagirmamali.');
  }

  recordFailure(): Promise<never> {
    throw new Error('CreateNoteUseCase recordFailure cagirmamali.');
  }

  listNotesSince(): Promise<never> {
    throw new Error('CreateNoteUseCase listNotesSince cagirmamali.');
  }

  findLatestGenerated(): Promise<never> {
    throw new Error('CreateNoteUseCase findLatestGenerated cagirmamali.');
  }
}

class FakeEmbeddingPort implements EmbeddingPort {
  readonly embedded: string[] = [];
  failWith: Error | null = null;

  constructor(private readonly calls: CallLog) {}

  embed(text: string): Promise<number[]> {
    this.calls.push('embed');
    this.embedded.push(text);

    if (this.failWith !== null) {
      return Promise.reject(this.failWith);
    }
    return Promise.resolve(Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1));
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

interface Harness {
  readonly noteRepository: FakeNoteRepository;
  readonly rateLimits: FakeRateLimitRepository;
  readonly chunkRepository: FakeNoteChunkRepository;
  readonly reportRepository: FakeDailyReportRunRepository;
  readonly embeddingPort: FakeEmbeddingPort;
  readonly transactionManager: FakeTransactionManager;
  readonly calls: CallLog;
  readonly useCase: CreateNoteUseCase;
}

function createHarness(overrides: Partial<{ rateLimit: number }> = {}): Harness {
  const calls: CallLog = [];
  const rateLimits = new FakeRateLimitRepository(calls);
  const noteRepository = new FakeNoteRepository(calls);
  const chunkRepository = new FakeNoteChunkRepository(calls);
  const reportRepository = new FakeDailyReportRunRepository(calls);
  const embeddingPort = new FakeEmbeddingPort(calls);
  const transactionManager = new FakeTransactionManager(calls);

  const deps: CreateNoteDependencies = {
    noteRepository,
    noteChunkRepository: chunkRepository,
    dailyReportRunRepository: reportRepository,
    rateLimitRepository: rateLimits,
    embeddingPort,
    transactionManager,
    idGenerator: new SequentialIdGenerator(),
    clock: new FixedClock(),
    rateLimit: overrides.rateLimit ?? 60,
  };

  return {
    noteRepository,
    rateLimits,
    chunkRepository,
    reportRepository,
    embeddingPort,
    transactionManager,
    calls,
    useCase: new CreateNoteUseCase(deps),
  };
}

function command(overrides: Partial<{ title: string | null; body: string }> = {}) {
  return {
    tenantId: TENANT_ID,
    authorUserId: USER_ID,
    title: 'Baslik',
    body: 'Kisa bir not govdesi.',
    ...overrides,
  };
}

describe('CreateNoteUseCase — mutlu yol', () => {
  it('notu kaydeder ve id sini doner', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute(command());

    expect(harness.noteRepository.saved).toHaveLength(1);
    expect(result.noteId).toBe(harness.noteRepository.saved[0]?.id.value);
  });

  it('parcalari yazar ve sayisini doner', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute(command());

    expect(result.chunkCount).toBe(1);
    expect(harness.chunkRepository.saved).toHaveLength(1);
  });

  it('uzun metni birden fazla parcaya boler ve HER BIRI icin embed cagirir', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute(
      command({ body: 'a'.repeat(TARGET_CHUNK_CHARS * 2 + 10) }),
    );

    expect(result.chunkCount).toBe(3);
    expect(harness.embeddingPort.embedded).toHaveLength(3);
  });

  it('parcalarin sirasi 0 dan baslar ve artar', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command({ body: 'a'.repeat(TARGET_CHUNK_CHARS * 2 + 10) }));

    expect(harness.chunkRepository.saved.map((chunk) => chunk.chunkIndex)).toEqual([0, 1, 2]);
  });

  it('parcalar notun tenant ve note id sini tasir', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    const chunk = harness.chunkRepository.saved[0];
    const note = harness.noteRepository.saved[0];
    expect(chunk?.tenantId.value).toBe(TENANT_ID);
    expect(chunk?.noteId.value).toBe(note?.id.value);
  });

  it('baslik null gecilebilir', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command({ title: null }));

    expect(harness.noteRepository.saved[0]?.title).toBeNull();
  });
});

// --- ADR-0029 §4: TRANSACTION SIRASI — bu dosyanin ASIL iddiasi -------------

describe('CreateNoteUseCase — T1 / embedding / T2 sirasi', () => {
  it('embedding TRANSACTION DISINDA calisir', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    // Pahali ag cagrisi boyunca DB baglantisi TUTULMAMALI: `embed`, iki
    // transaction'in ARASINDA — hicbir `tx.begin`/`tx.commit` ciftinin icinde
    // degil.
    expect(harness.calls).toEqual([
      'tx.begin',
      'rateLimit',
      'tx.commit',
      'tx.begin',
      'note.save',
      'report.ensureScheduled',
      'tx.commit',
      'embed',
      'tx.begin',
      'chunks.saveAll',
      'tx.commit',
    ]);
  });

  it('TAM UC transaction acar (T0 · T1 · T2)', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    // T0 AYRI: sayac T1'e girseydi, embedding cokup transaction geri
    // alindiginda sayac da geri alinir ve hatali istekler bedava olurdu.
    expect(harness.transactionManager.opened).toBe(3);
  });

  it('cok parcali notta da embedding ler transaction disinda kalir', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command({ body: 'a'.repeat(TARGET_CHUNK_CHARS * 2 + 10) }));

    // T0'in commit'i ATLANIR: aranan sinir T1'in commit'i ile T2'nin begin'i.
    const firstCommit = harness.calls.indexOf('tx.commit', harness.calls.indexOf('note.save'));
    const secondBegin = harness.calls.lastIndexOf('tx.begin');
    const embedIndexes = harness.calls
      .map((call, index) => (call === 'embed' ? index : -1))
      .filter((index) => index !== -1);

    expect(embedIndexes).toHaveLength(3);
    for (const index of embedIndexes) {
      expect(index).toBeGreaterThan(firstCommit);
      expect(index).toBeLessThan(secondBegin);
    }
  });

  it('parcalar SIRAYLA embed edilir (paralel DEGIL — oran siniri)', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command({ body: 'a'.repeat(TARGET_CHUNK_CHARS * 2 + 10) }));

    // Sirayla islenseydi metinler bolme sirasiyla ayni olur.
    expect(harness.embeddingPort.embedded).toHaveLength(3);
    expect(harness.embeddingPort.embedded[0]).toHaveLength(TARGET_CHUNK_CHARS);
  });
});

// --- ADR-0030: TEMBEL SEED ---------------------------------------------------

describe('CreateNoteUseCase — gunluk rapor tembel seed', () => {
  it('T1 icinde, notla AYNI transaction da planlanir', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    // T0'in ciftini ATLA: aranan T1'dir (`note.save`'i iceren).
    const noteSave = harness.calls.indexOf('note.save');
    const begin = harness.calls.lastIndexOf('tx.begin', noteSave);
    const commit = harness.calls.indexOf('tx.commit', noteSave);
    const scheduled = harness.calls.indexOf('report.ensureScheduled');

    // Rapor NOTLARI ozetler, parcalari degil: T2 cokse bile rapor uretilmeli.
    expect(scheduled).toBeGreaterThan(begin);
    expect(scheduled).toBeLessThan(commit);
  });

  it('bugunun UTC tarihiyle planlanir', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.reportRepository.scheduled).toEqual([
      { tenantId: TENANT_ID, reportDate: '2026-08-02' },
    ]);
  });

  it('her notta cagrilir — idempotency repository nin (UNIQUE kisiti) isidir', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());
    await harness.useCase.execute(command({ body: 'ikinci not' }));

    // Use case "var mi" diye BAKMAZ: bakmak iki es zamanli istek arasinda yaris
    // birakirdi. Karar `ON CONFLICT DO NOTHING`'e devredilir.
    expect(harness.reportRepository.scheduled).toHaveLength(2);
  });
});

// --- Hata yollari -------------------------------------------------------------

describe('CreateNoteUseCase — embedding hatasi', () => {
  it('EmbeddingFailedError firlatir', async () => {
    const harness = createHarness();
    harness.embeddingPort.failWith = new Error('saglayici 500');

    await expect(harness.useCase.execute(command())).rejects.toThrow(EmbeddingFailedError);
  });

  it('NOT SILINMEZ — T1 zaten commit olmustur (bilinen sinir)', async () => {
    const harness = createHarness();
    harness.embeddingPort.failWith = new Error('saglayici 500');

    await expect(harness.useCase.execute(command())).rejects.toThrow();

    // Not kaydedildi ve geri alinmadi; sonuc "chunk'i olmayan not".
    expect(harness.noteRepository.saved).toHaveLength(1);
    expect(harness.chunkRepository.saved).toHaveLength(0);
  });

  it('rapor planlamasi da KORUNUR (T1 icindeydi)', async () => {
    const harness = createHarness();
    harness.embeddingPort.failWith = new Error('saglayici 500');

    await expect(harness.useCase.execute(command())).rejects.toThrow();

    expect(harness.reportRepository.scheduled).toHaveLength(1);
  });

  it('T2 hic acilmaz', async () => {
    const harness = createHarness();
    harness.embeddingPort.failWith = new Error('saglayici 500');

    await expect(harness.useCase.execute(command())).rejects.toThrow();

    // T0 + T1 acilir, T2 ACILMAZ. Sayac geri ALINMAZ: cagri yapildiysa para
    // harcanmistir (ADR-0029 §5, bilincli).
    expect(harness.transactionManager.opened).toBe(2);
  });

  it('saglayicinin mesajini teshis icin tasir', async () => {
    const harness = createHarness();
    harness.embeddingPort.failWith = new Error('rate limited');

    await expect(harness.useCase.execute(command())).rejects.toThrow(/rate limited/);
  });
});

describe('CreateNoteUseCase — girdi dogrulama domain de', () => {
  it('bos govde domain hatasi firlatir ve HICBIR yazma yapilmaz', async () => {
    const harness = createHarness();

    await expect(harness.useCase.execute(command({ body: '   ' }))).rejects.toThrow();

    expect(harness.noteRepository.saved).toHaveLength(0);
    expect(harness.transactionManager.opened).toBe(0);
  });

  it('gecersiz tenant id transaction ACMADAN reddedilir', async () => {
    const harness = createHarness();

    await expect(harness.useCase.execute({ ...command(), tenantId: 'gecersiz' })).rejects.toThrow();

    expect(harness.transactionManager.opened).toBe(0);
  });
});

// --- Oran siniri (ADR-0029 §5) ---------------------------------------------

describe('CreateNoteUseCase — oran siniri', () => {
  it('limit ALTINDA istek gecer', async () => {
    const harness = createHarness({ rateLimit: 3 });
    harness.rateLimits.preset({
      tenantId: TENANT_ID,
      userId: USER_ID,
      action: 'create_note',
      count: 1,
    });

    await expect(harness.useCase.execute(command())).resolves.toBeDefined();
  });

  it('limit ASILINCA reddedilir', async () => {
    const harness = createHarness({ rateLimit: 3 });
    harness.rateLimits.preset({
      tenantId: TENANT_ID,
      userId: USER_ID,
      action: 'create_note',
      count: 3,
    });

    await expect(harness.useCase.execute(command())).rejects.toThrow(RateLimitExceededError);
  });

  it('reddedilen istek NOT YAZMAZ ve TEK embedding cagrisi yapmaz', async () => {
    // Uzun bir not ONLARCA embedding cagrisidir; reddedilecek bir istek icin
    // bunun BIR TANESI bile yapilmamalidir.
    const harness = createHarness({ rateLimit: 1 });
    harness.rateLimits.preset({
      tenantId: TENANT_ID,
      userId: USER_ID,
      action: 'create_note',
      count: 1,
    });

    await expect(harness.useCase.execute(command())).rejects.toThrow(RateLimitExceededError);

    expect(harness.calls).not.toContain('embed');
    expect(harness.noteRepository.saved).toHaveLength(0);
  });

  it('sayac chunking ten ONCE, KENDI transaction inda artar', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.calls.slice(0, 3)).toEqual(['tx.begin', 'rateLimit', 'tx.commit']);
  });

  it('FARKLI kullanicilarin sayaclari KARISMAZ', async () => {
    const harness = createHarness({ rateLimit: 1 });
    harness.rateLimits.preset({
      tenantId: TENANT_ID,
      userId: USER_ID,
      action: 'create_note',
      count: 1,
    });

    const other = '018f3a2b-7c4d-7e1f-9b3c-00000000000b';
    await expect(
      harness.useCase.execute({ ...command(), authorUserId: other }),
    ).resolves.toBeDefined();
  });

  it('FARKLI tenant larin sayaclari KARISMAZ', async () => {
    const harness = createHarness({ rateLimit: 1 });
    harness.rateLimits.preset({
      tenantId: TENANT_ID,
      userId: USER_ID,
      action: 'create_note',
      count: 1,
    });

    const otherTenant = '018f3a2b-7c4d-7e1f-9b3c-0000000000b1';
    await expect(
      harness.useCase.execute({ ...command(), tenantId: otherTenant }),
    ).resolves.toBeDefined();
  });

  it('EYLEM kovalari KARISMAZ — dolu bir ask sayaci not eklemeyi engellemez', async () => {
    const harness = createHarness({ rateLimit: 1 });
    harness.rateLimits.preset({ tenantId: TENANT_ID, userId: USER_ID, action: 'ask', count: 99 });

    await expect(harness.useCase.execute(command())).resolves.toBeDefined();
  });
});
