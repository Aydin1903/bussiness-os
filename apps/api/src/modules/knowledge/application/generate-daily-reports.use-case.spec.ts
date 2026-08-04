import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { MAX_REPORT_ATTEMPTS } from '../domain/daily-report-retry.policy';
import {
  type ClaimedReportRun,
  type DailyReportRunRepository,
  type GeneratedReport,
  type ReportNote,
} from './daily-report-run.repository.port';
import { DAILY_REPORT_SYSTEM_PROMPT, EMPTY_DAILY_REPORT_SUMMARY } from './daily-report-prompt';
import {
  dueDate,
  GenerateDailyReportsUseCase,
  type GenerateDailyReportsDependencies,
} from './generate-daily-reports.use-case';
import { type CompleteInput, type LLMPort } from './llm.port';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

const NOW = new Date('2026-08-04T09:00:00.000Z');
const TENANT_A = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const TENANT_B = '018f3a2b-7c4d-7e1f-9b3c-0000000000b1';

type CallLog = string[];

class FakeReportRepository implements DailyReportRunRepository {
  claimed: ClaimedReportRun[] = [];
  /** Tenant -> o tenant'in notlari. Yazilmayan tenant BOS gun demektir. */
  readonly notesByTenant = new Map<string, ReportNote[]>();
  readonly generated: { id: string; summary: string }[] = [];
  readonly failed: {
    id: string;
    attemptCount: number;
    lastError: string;
    nextAttemptAt: Date | null;
    deadLetteredAt: Date | null;
  }[] = [];

  lastClaim: { limit: number; today: string } | null = null;
  lastNotesSince: Date | null = null;
  failMarkWith: Error | null = null;

  constructor(private readonly calls: CallLog) {}

  ensureScheduled(): Promise<void> {
    return Promise.resolve();
  }

  claimPending(input: { limit: number; now: Date; today: string }): Promise<ClaimedReportRun[]> {
    this.calls.push('claim');
    this.lastClaim = { limit: input.limit, today: input.today };
    return Promise.resolve(this.claimed);
  }

  listNotesSince(since: Date): Promise<ReportNote[]> {
    this.calls.push('notes');
    this.lastNotesSince = since;
    return Promise.resolve(this.notesByTenant.get(this.#currentTenant) ?? []);
  }

  markGenerated(input: { id: string; summary: string; generatedAt: Date }): Promise<void> {
    this.calls.push('mark');
    if (this.failMarkWith !== null) {
      return Promise.reject(this.failMarkWith);
    }
    this.generated.push({ id: input.id, summary: input.summary });
    return Promise.resolve();
  }

  recordFailure(input: {
    id: string;
    attemptCount: number;
    lastError: string;
    nextAttemptAt: Date | null;
    deadLetteredAt: Date | null;
  }): Promise<void> {
    this.calls.push('failure');
    this.failed.push({ ...input });
    return Promise.resolve();
  }

  findLatestGenerated(): Promise<GeneratedReport | null> {
    return Promise.resolve(null);
  }

  /** Hangi tenant'in transaction'i acikta — fake transaction manager yazar. */
  #currentTenant = '';

  setCurrentTenant(tenantId: string): void {
    this.#currentTenant = tenantId;
  }
}

class FakeLlmPort implements LLMPort {
  lastInput: CompleteInput | null = null;
  callCount = 0;
  failWith: Error | null = null;

  constructor(private readonly calls: CallLog) {}

  complete(input: CompleteInput): Promise<string> {
    this.calls.push('complete');
    this.callCount += 1;
    this.lastInput = input;

    if (this.failWith !== null) {
      return Promise.reject(this.failWith);
    }
    return Promise.resolve('gunun ozeti');
  }
}

class FakeTransactionManager implements TransactionManager {
  tenantScopes: string[] = [];

  constructor(
    private readonly calls: CallLog,
    private readonly repository: FakeReportRepository,
  ) {}

  runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    this.calls.push('tx.plain');
    return fn();
  }

  runInTenantTransaction<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    this.calls.push('tx.tenant');
    this.tenantScopes.push(tenantId);
    this.repository.setCurrentTenant(tenantId);
    return fn();
  }

  runInCurrentTenantTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

class FixedClock implements Clock {
  now(): Date {
    return new Date(NOW.getTime());
  }
}

interface Harness {
  readonly repository: FakeReportRepository;
  readonly llm: FakeLlmPort;
  readonly transactionManager: FakeTransactionManager;
  readonly calls: CallLog;
  readonly useCase: GenerateDailyReportsUseCase;
}

function createHarness(overrides: Partial<{ hourUtc: number; batchSize: number }> = {}): Harness {
  const calls: CallLog = [];
  const repository = new FakeReportRepository(calls);
  const llm = new FakeLlmPort(calls);
  const transactionManager = new FakeTransactionManager(calls, repository);

  const deps: GenerateDailyReportsDependencies = {
    reportRepository: repository,
    llmPort: llm,
    transactionManager,
    clock: new FixedClock(),
    batchSize: overrides.batchSize ?? 10,
    hourUtc: overrides.hourUtc ?? 6,
    windowHours: 24,
  };

  return {
    repository,
    llm,
    transactionManager,
    calls,
    useCase: new GenerateDailyReportsUseCase(deps),
  };
}

function run(tenantId: string, overrides: Partial<ClaimedReportRun> = {}): ClaimedReportRun {
  return {
    id: `run-${tenantId.slice(-2)}`,
    tenantId,
    reportDate: '2026-08-03',
    attemptCount: 0,
    ...overrides,
  };
}

// --- Mutlu yol ---------------------------------------------------------------

describe('GenerateDailyReportsUseCase — mutlu yol', () => {
  it('sira: claim -> notlar -> complete -> mark', async () => {
    const harness = createHarness();
    harness.repository.claimed = [run(TENANT_A)];
    harness.repository.notesByTenant.set(TENANT_A, [{ title: null, body: 'bir not' }]);

    await harness.useCase.execute();

    expect(harness.calls).toEqual([
      'tx.plain',
      'claim',
      'tx.tenant',
      'notes',
      'complete',
      'tx.plain',
      'mark',
    ]);
  });

  it('uretilen ozet mark a gecer', async () => {
    const harness = createHarness();
    harness.repository.claimed = [run(TENANT_A)];
    harness.repository.notesByTenant.set(TENANT_A, [{ title: null, body: 'bir not' }]);

    await harness.useCase.execute();

    expect(harness.repository.generated).toEqual([{ id: 'run-a1', summary: 'gunun ozeti' }]);
  });

  it('sonuc sayilari dogru', async () => {
    const harness = createHarness();
    harness.repository.claimed = [run(TENANT_A)];
    harness.repository.notesByTenant.set(TENANT_A, [{ title: null, body: 'bir not' }]);

    expect(await harness.useCase.execute()).toMatchObject({
      claimed: 1,
      generated: 1,
      empty: 0,
      deadLettered: 0,
    });
  });

  it('EMBEDDING CAGRILMAZ — yalnizca chat (ADR-0030 §2.2)', async () => {
    // `EmbeddingPort` bu use case'in bagimliliklarinda HIC YOK; bu test o
    // tasarim kararini kayda gecirir.
    const harness = createHarness();
    harness.repository.claimed = [run(TENANT_A)];
    harness.repository.notesByTenant.set(TENANT_A, [{ title: null, body: 'bir not' }]);

    await harness.useCase.execute();

    expect(harness.calls).not.toContain('embed');
  });
});

// --- Yetki/transaction ayrimi ------------------------------------------------

describe('GenerateDailyReportsUseCase — transaction ve yetki ayrimi', () => {
  it('claim TENANT CONTEXT SIZ, notlar TENANT CONTEXT ALTINDA okunur', async () => {
    // Dar rol (`businessos_report_worker`) YALNIZCA daily_report_runs a
    // yetkilidir; notlari okumak icin normal RLS ve dogru tenant context'i
    // gerekir. Ayrim bu yuzden var.
    const harness = createHarness();
    harness.repository.claimed = [run(TENANT_A)];
    harness.repository.notesByTenant.set(TENANT_A, [{ title: null, body: 'not' }]);

    await harness.useCase.execute();

    expect(harness.calls.indexOf('tx.plain')).toBeLessThan(harness.calls.indexOf('tx.tenant'));
    expect(harness.transactionManager.tenantScopes).toEqual([TENANT_A]);
  });

  it('her tenant KENDI context inde okunur', async () => {
    const harness = createHarness();
    harness.repository.claimed = [run(TENANT_A), run(TENANT_B)];
    harness.repository.notesByTenant.set(TENANT_A, [{ title: null, body: 'A notu' }]);
    harness.repository.notesByTenant.set(TENANT_B, [{ title: null, body: 'B notu' }]);

    await harness.useCase.execute();

    expect(harness.transactionManager.tenantScopes).toEqual([TENANT_A, TENANT_B]);
  });

  it('LLM cagrisi HICBIR transaction icinde degil', async () => {
    const harness = createHarness();
    harness.repository.claimed = [run(TENANT_A)];
    harness.repository.notesByTenant.set(TENANT_A, [{ title: null, body: 'not' }]);

    await harness.useCase.execute();

    // `notes` (T2 sonu) ile `mark` (T3 basi) ARASINDA.
    const complete = harness.calls.indexOf('complete');
    expect(harness.calls[complete - 1]).toBe('notes');
    expect(harness.calls[complete + 1]).toBe('tx.plain');
  });
});

// --- Bos gun -----------------------------------------------------------------

describe('GenerateDailyReportsUseCase — HIC NOT YOKSA', () => {
  it('LLM CAGRILMAZ', async () => {
    // ADR-0030: "bos bir rapor uretilir" — ama cevabini bildigimiz bir soru
    // icin para harcanmaz. Bos baglamla model cagirmak, uydurma icin en uygun
    // kosuldur.
    const harness = createHarness();
    harness.repository.claimed = [run(TENANT_A)];

    await harness.useCase.execute();

    expect(harness.llm.callCount).toBe(0);
  });

  it('kayit YINE DE isaretlenir — atlanmaz', async () => {
    // Atlansaydi `generated_at IS NULL` kaldigi icin HER TURDA yeniden claim
    // edilirdi (sonsuz dongu).
    const harness = createHarness();
    harness.repository.claimed = [run(TENANT_A)];

    await harness.useCase.execute();

    expect(harness.repository.generated).toEqual([
      { id: 'run-a1', summary: EMPTY_DAILY_REPORT_SUMMARY },
    ]);
  });

  it('bos gun sonucta AYRI sayilir', async () => {
    const harness = createHarness();
    harness.repository.claimed = [run(TENANT_A)];

    expect(await harness.useCase.execute()).toMatchObject({ generated: 1, empty: 1 });
  });
});

// --- Prompt ------------------------------------------------------------------

describe('GenerateDailyReportsUseCase — prompt', () => {
  it('kendi sistem promptunu kullanir (soru-cevap promptu DEGIL)', async () => {
    const harness = createHarness();
    harness.repository.claimed = [run(TENANT_A)];
    harness.repository.notesByTenant.set(TENANT_A, [{ title: null, body: 'not' }]);

    await harness.useCase.execute();

    expect(harness.llm.lastInput?.systemPrompt).toBe(DAILY_REPORT_SYSTEM_PROMPT);
    expect(harness.llm.lastInput?.systemPrompt).toContain('UYDURMA');
  });

  it('baslik ve govde BIRLIKTE baglama girer', async () => {
    // Onboarding notlarinda baslik SORUNUN kendisidir; atmak cevabi
    // baglamsiz birakirdi.
    const harness = createHarness();
    harness.repository.claimed = [run(TENANT_A)];
    harness.repository.notesByTenant.set(TENANT_A, [
      { title: 'Kac kisilik bir ekipsiniz?', body: '12 kisi' },
    ]);

    await harness.useCase.execute();

    expect(harness.llm.lastInput?.context).toEqual(['Kac kisilik bir ekipsiniz?\n12 kisi']);
  });

  it('basliksiz notta yalnizca govde gonderilir', async () => {
    const harness = createHarness();
    harness.repository.claimed = [run(TENANT_A)];
    harness.repository.notesByTenant.set(TENANT_A, [{ title: null, body: 'sadece govde' }]);

    await harness.useCase.execute();

    expect(harness.llm.lastInput?.context).toEqual(['sadece govde']);
  });

  it('gecmis GONDERILMEZ — rapor bir konusma degildir', async () => {
    const harness = createHarness();
    harness.repository.claimed = [run(TENANT_A)];
    harness.repository.notesByTenant.set(TENANT_A, [{ title: null, body: 'not' }]);

    await harness.useCase.execute();

    expect(harness.llm.lastInput?.history).toBeUndefined();
  });
});

// --- Hata yolu ---------------------------------------------------------------

describe('GenerateDailyReportsUseCase — hata', () => {
  it('LLM cokerse recordFailure cagrilir ve backoff yazilir', async () => {
    const harness = createHarness();
    harness.repository.claimed = [run(TENANT_A, { attemptCount: 0 })];
    harness.repository.notesByTenant.set(TENANT_A, [{ title: null, body: 'not' }]);
    harness.llm.failWith = new Error('saglayici 500');

    await harness.useCase.execute();

    expect(harness.repository.failed).toHaveLength(1);
    expect(harness.repository.failed[0]).toMatchObject({ attemptCount: 1, deadLetteredAt: null });
    expect(harness.repository.failed[0]?.nextAttemptAt).toBeInstanceOf(Date);
  });

  it('hata mesaji TESHIS icin tasinir', async () => {
    const harness = createHarness();
    harness.repository.claimed = [run(TENANT_A)];
    harness.repository.notesByTenant.set(TENANT_A, [{ title: null, body: 'not' }]);
    harness.llm.failWith = new Error('kota asildi');

    await harness.useCase.execute();

    expect(harness.repository.failed[0]?.lastError).toContain('kota asildi');
  });

  it('SON denemede OLU MEKTUBA duser', async () => {
    const harness = createHarness();
    harness.repository.claimed = [run(TENANT_A, { attemptCount: MAX_REPORT_ATTEMPTS - 1 })];
    harness.repository.notesByTenant.set(TENANT_A, [{ title: null, body: 'not' }]);
    harness.llm.failWith = new Error('yine hata');

    const result = await harness.useCase.execute();

    expect(harness.repository.failed[0]?.deadLetteredAt).toBeInstanceOf(Date);
    expect(harness.repository.failed[0]?.nextAttemptAt).toBeNull();
    expect(result.deadLettered).toBe(1);
  });

  it('olu mektupta ISARETLENMEZ — yariyol bir rapor yazilmaz', async () => {
    const harness = createHarness();
    harness.repository.claimed = [run(TENANT_A, { attemptCount: MAX_REPORT_ATTEMPTS - 1 })];
    harness.repository.notesByTenant.set(TENANT_A, [{ title: null, body: 'not' }]);
    harness.llm.failWith = new Error('hata');

    await harness.useCase.execute();

    expect(harness.repository.generated).toHaveLength(0);
  });

  it('mark cokerse de failure yazilir', async () => {
    const harness = createHarness();
    harness.repository.claimed = [run(TENANT_A)];
    harness.repository.notesByTenant.set(TENANT_A, [{ title: null, body: 'not' }]);
    harness.repository.failMarkWith = new Error('baglanti koptu');

    await harness.useCase.execute();

    expect(harness.repository.failed).toHaveLength(1);
  });

  it('BIR TENANT IN hatasi digerlerini DURDURMAZ', async () => {
    // Aksi halde tek bozuk tenant, o turdaki TUM sirketlerin raporunu engellerdi.
    const harness = createHarness();
    harness.repository.claimed = [run(TENANT_A), run(TENANT_B)];
    harness.repository.notesByTenant.set(TENANT_A, [{ title: null, body: 'A' }]);
    harness.repository.notesByTenant.set(TENANT_B, [{ title: null, body: 'B' }]);
    // A basarisiz, B basarili olsun: ilk cagri patlar, ikincisi gecer.
    let first = true;
    harness.llm.failWith = null;
    const original = harness.llm.complete.bind(harness.llm);
    harness.llm.complete = (input) => {
      if (first) {
        first = false;
        return Promise.reject(new Error('yalnizca ilki'));
      }
      return original(input);
    };

    const result = await harness.useCase.execute();

    expect(result.failures).toHaveLength(1);
    expect(result.generated).toBe(1);
  });
});

// --- Zamanlama ---------------------------------------------------------------

describe('dueDate — vade saati (ADR-0030 §2.3)', () => {
  it('saat GELDIYSE bugunun raporu vadesi gelmis sayilir', () => {
    expect(dueDate(new Date('2026-08-04T09:00:00.000Z'), 6)).toBe('2026-08-04');
  });

  it('saat GELMEDIYSE yalnizca DUNE kadar alinir', () => {
    // Aksi halde worker, gun daha bitmeden "gunluk" rapor uretirdi.
    expect(dueDate(new Date('2026-08-04T03:00:00.000Z'), 6)).toBe('2026-08-03');
  });

  it('tam saatte vade GELMIS sayilir', () => {
    expect(dueDate(new Date('2026-08-04T06:00:00.000Z'), 6)).toBe('2026-08-04');
  });

  it('ay basinda dogru gune geri sarar', () => {
    expect(dueDate(new Date('2026-08-01T02:00:00.000Z'), 6)).toBe('2026-07-31');
  });

  it('use case claim e config ten gelen gunu gecirir', async () => {
    const harness = createHarness({ hourUtc: 23 });

    await harness.useCase.execute();

    // NOW = 09:00, esik 23 -> henuz gelmedi -> dun.
    expect(harness.repository.lastClaim?.today).toBe('2026-08-03');
  });

  it('batchSize config ten gecer', async () => {
    const harness = createHarness({ batchSize: 3 });

    await harness.useCase.execute();

    expect(harness.repository.lastClaim?.limit).toBe(3);
  });

  it('pencere son 24 saattir', async () => {
    const harness = createHarness();
    harness.repository.claimed = [run(TENANT_A)];

    await harness.useCase.execute();

    expect(harness.repository.lastNotesSince?.toISOString()).toBe('2026-08-03T09:00:00.000Z');
  });
});
