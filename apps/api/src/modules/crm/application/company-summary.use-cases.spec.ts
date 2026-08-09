import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { CompletionFailedError, type CompleteInput, type LLMPort } from '../../../shared/llm.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import {
  type RateLimitRepository,
  type RegisterRequestInput,
} from '../../../shared/rate-limit.repository.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type SummarySourceFacts } from '../domain/company-summary.entity';
import {
  CompanyNotFoundError,
  NoInteractionsToSummarizeError,
  SummaryGenerationInProgressError,
} from '../domain/crm.error';
import {
  type CompanySummaryRepository,
  type StoredCompanySummary,
} from './company-summary.repository.port';
import { CompanySummaryUseCases } from './company-summary.use-cases';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

const NOW = new Date('2026-08-08T10:00:00.000Z');
const TENANT_ID = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const USER_ID = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';
const COMPANY_ID = '018f3a2b-7c4d-7e1f-9b3c-0000000000c1';

/**
 * Cagri sirasinin TEK kaydi.
 *
 * Bu dosyanin asil iddialarindan biri ISRAF FRENIDIR ve o ancak "model
 * cagrildi mi" sorusuna kesin cevap verilebilirse dogrulanir.
 */
type CallLog = string[];

const BASE_FACTS: SummarySourceFacts = {
  interactionCount: 3,
  lastInteractionCreatedAt: '2026-08-07T09:00:00.000Z',
  opportunityCount: 1,
  lastOpportunityUpdatedAt: '2026-08-06T09:00:00.000Z',
  contactCount: 2,
  companyUpdatedAt: '2026-08-01T09:00:00.000Z',
};

class FakeRepository implements CompanySummaryRepository {
  stored: StoredCompanySummary | null = null;
  facts: SummarySourceFacts = BASE_FACTS;
  companyExists = true;
  claimSucceeds = true;
  released = 0;

  constructor(private readonly calls: CallLog) {}

  findCompanyIdentity(): Promise<{ name: string; industry: string | null } | null> {
    return Promise.resolve(
      this.companyExists ? { name: 'Acme Tekstil', industry: 'Tekstil' } : null,
    );
  }

  find(): Promise<StoredCompanySummary | null> {
    return Promise.resolve(this.stored);
  }

  collectSourceFacts(): Promise<SummarySourceFacts> {
    return Promise.resolve(this.facts);
  }

  recentInteractions(): Promise<readonly { occurredOn: string; body: string }[]> {
    return Promise.resolve([{ occurredOn: '2026-08-07', body: 'Butce onaylandi.' }]);
  }

  openOpportunities(): Promise<
    readonly { title: string; stage: string; estimatedValue: string | null }[]
  > {
    return Promise.resolve([
      { title: 'Yillik anlasma', stage: 'proposal_sent', estimatedValue: '120000.00' },
    ]);
  }

  claim(): Promise<boolean> {
    this.calls.push('repository.claim');
    return Promise.resolve(this.claimSucceeds);
  }

  complete(input: { summary: string; sourceWatermark: string; now: Date }): Promise<void> {
    this.calls.push('repository.complete');
    this.stored = {
      summary: input.summary,
      sourceWatermark: input.sourceWatermark,
      generatedAt: input.now,
      generatingAt: null,
    };
    return Promise.resolve();
  }

  releaseClaim(): Promise<void> {
    this.calls.push('repository.releaseClaim');
    this.released += 1;
    return Promise.resolve();
  }
}

class FakeLlmPort implements LLMPort {
  answer = 'Acme ile butce onaylandi, teklif asamasinda.';
  failure: Error | null = null;
  readonly received: CompleteInput[] = [];

  constructor(private readonly calls: CallLog) {}

  complete(input: CompleteInput): Promise<string> {
    this.calls.push('llm.complete');
    this.received.push(input);
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    return Promise.resolve(this.answer);
  }
}

class FakeRateLimitRepository implements RateLimitRepository {
  count = 0;
  readonly seen: RegisterRequestInput[] = [];

  constructor(private readonly calls: CallLog) {}

  registerRequest(input: RegisterRequestInput): Promise<number> {
    this.calls.push('rateLimit.registerRequest');
    this.seen.push(input);
    this.count += 1;
    return Promise.resolve(this.count);
  }
}

/** Gercek transaction yok; yalnizca gecis kaydi tutulur. */
function fakeTransactionManager(calls: CallLog): TransactionManager {
  return {
    runInTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
    runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => {
      calls.push('tx.begin');
      return work();
    },
  } as unknown as TransactionManager;
}

const clock: Clock = { now: () => NOW };

function build(overrides?: { rateLimit?: number }) {
  const calls: CallLog = [];
  const repository = new FakeRepository(calls);
  const llmPort = new FakeLlmPort(calls);
  const rateLimitRepository = new FakeRateLimitRepository(calls);

  const useCases = new CompanySummaryUseCases({
    repository,
    rateLimitRepository,
    llmPort,
    transactionManager: fakeTransactionManager(calls),
    clock,
    rateLimit: overrides?.rateLimit ?? 20,
    contextInteractionLimit: 20,
    contextCharsPerInteraction: 1_500,
  });

  return { useCases, repository, llmPort, rateLimitRepository, calls };
}

describe('CompanySummaryUseCases — okuma BEDAVADIR', () => {
  it('GET model cagirmaz ve oran siniri sayacina DOKUNMAZ', async () => {
    const { useCases, calls } = build();

    await useCases.get(COMPANY_ID);

    expect(calls).not.toContain('llm.complete');
    expect(calls).not.toContain('rateLimit.registerRequest');
  });

  it('ozet hic uretilmemisse `stale` FALSE — "yok" ile "eski" ayri durumlar', async () => {
    const { useCases } = build();

    const view = await useCases.get(COMPANY_ID);

    expect(view.summary).toBeNull();
    expect(view.stale).toBe(false);
    expect(view.summarizable).toBe(true);
  });

  it('kaynaklar degistiyse `stale` TRUE', async () => {
    const { useCases, repository } = build();
    repository.stored = {
      summary: 'Eski ozet',
      sourceWatermark: 'eski-imza',
      generatedAt: new Date('2026-08-05T10:00:00.000Z'),
      generatingAt: null,
    };

    const view = await useCases.get(COMPANY_ID);

    expect(view.stale).toBe(true);
  });

  it('gorusme yoksa `summarizable` FALSE — arayuz dugmeyi buna gore kapatir', async () => {
    const { useCases, repository } = build();
    repository.facts = { ...BASE_FACTS, interactionCount: 0, lastInteractionCreatedAt: null };

    const view = await useCases.get(COMPANY_ID);

    expect(view.summarizable).toBe(false);
  });

  it('baska tenant’in sirketi de "bulunamadi"dir', async () => {
    const { useCases, repository } = build();
    repository.companyExists = false;

    await expect(useCases.get(COMPANY_ID)).rejects.toThrow(CompanyNotFoundError);
  });
});

describe('CompanySummaryUseCases — ISRAF FRENI', () => {
  it('kaynaklar degismediyse model HIC cagrilmaz', async () => {
    const { useCases, repository, calls } = build();
    // Bir onceki uretim: watermark bugunku gerceklerle AYNI.
    const view = await useCases.generate({
      tenantId: TENANT_ID,
      userId: USER_ID,
      companyId: COMPANY_ID,
    });
    expect(view.regenerated).toBe(true);
    const firstCallCount = calls.filter((call) => call === 'llm.complete').length;
    expect(firstCallCount).toBe(1);
    expect(repository.stored?.summary).toBeTruthy();

    // Ikinci cagri: hicbir kaynak degismedi.
    const again = await useCases.generate({
      tenantId: TENANT_ID,
      userId: USER_ID,
      companyId: COMPANY_ID,
    });

    expect(again.regenerated).toBe(false);
    expect(again.summary).toBe(view.summary);
    expect(calls.filter((call) => call === 'llm.complete')).toHaveLength(1);
    // Claim bile ALINMAZ: is olmadigi anlasildiginda satira dokunulmaz.
    expect(calls.filter((call) => call === 'repository.claim')).toHaveLength(1);
  });

  it('yeni gorusme eklenince model YENIDEN cagrilir', async () => {
    const { useCases, repository, calls } = build();
    await useCases.generate({ tenantId: TENANT_ID, userId: USER_ID, companyId: COMPANY_ID });

    repository.facts = {
      ...BASE_FACTS,
      interactionCount: 4,
      lastInteractionCreatedAt: '2026-08-08T09:00:00.000Z',
    };

    const again = await useCases.generate({
      tenantId: TENANT_ID,
      userId: USER_ID,
      companyId: COMPANY_ID,
    });

    expect(again.regenerated).toBe(true);
    expect(calls.filter((call) => call === 'llm.complete')).toHaveLength(2);
  });

  it('SILME de yeniden uretim tetikler — sayi dususu imzayi degistirir', async () => {
    const { useCases, repository, calls } = build();
    await useCases.generate({ tenantId: TENANT_ID, userId: USER_ID, companyId: COMPANY_ID });

    // Zaman damgasi AYNI kalir, yalnizca sayi duser: yalnizca `max(...)`
    // tutan bir imza bu degisikligi GORMEZDI.
    repository.facts = { ...BASE_FACTS, interactionCount: 2 };

    const again = await useCases.generate({
      tenantId: TENANT_ID,
      userId: USER_ID,
      companyId: COMPANY_ID,
    });

    expect(again.regenerated).toBe(true);
    expect(calls.filter((call) => call === 'llm.complete')).toHaveLength(2);
  });

  it('israf freni devrede olsa BILE oran siniri sayaci isler', async () => {
    // Aksi halde "yenile"ye sonsuz basmak bedava bir dongu olurdu: her cagri
    // bir veritabani turu yapar.
    const { useCases, rateLimitRepository } = build();
    await useCases.generate({ tenantId: TENANT_ID, userId: USER_ID, companyId: COMPANY_ID });
    await useCases.generate({ tenantId: TENANT_ID, userId: USER_ID, companyId: COMPANY_ID });

    expect(rateLimitRepository.seen).toHaveLength(2);
  });
});

describe('CompanySummaryUseCases — uretim', () => {
  it('T0 oran siniri MODELDEN once calisir', async () => {
    const { useCases, calls } = build();

    await useCases.generate({ tenantId: TENANT_ID, userId: USER_ID, companyId: COMPANY_ID });

    expect(calls.indexOf('rateLimit.registerRequest')).toBeLessThan(calls.indexOf('llm.complete'));
  });

  it('pay tukendiyse model CAGRILMAZ', async () => {
    const { useCases, calls } = build({ rateLimit: 1 });
    await useCases.generate({ tenantId: TENANT_ID, userId: USER_ID, companyId: COMPANY_ID });
    calls.length = 0;

    // Ikinci cagri paya takilir. Kaynaklari da degistiriyoruz ki israf freni
    // degil GERCEKTEN oran siniri kestigi kesin olsun.
    const { useCases: fresh, repository } = build({ rateLimit: 0 });
    repository.facts = BASE_FACTS;

    await expect(
      fresh.generate({ tenantId: TENANT_ID, userId: USER_ID, companyId: COMPANY_ID }),
    ).rejects.toThrow(RateLimitExceededError);
  });

  it('LLM cagrisi transaction ICINDE DEGIL — sira T0 · T1 · ag · T2', async () => {
    const { useCases, calls } = build();

    await useCases.generate({ tenantId: TENANT_ID, userId: USER_ID, companyId: COMPANY_ID });

    const llmIndex = calls.indexOf('llm.complete');
    const completeIndex = calls.indexOf('repository.complete');
    const claimIndex = calls.indexOf('repository.claim');

    expect(claimIndex).toBeLessThan(llmIndex);
    expect(llmIndex).toBeLessThan(completeIndex);
    // Ag cagrisindan SONRA yeni bir transaction acilir (T2).
    expect(calls.slice(llmIndex).filter((call) => call === 'tx.begin')).toHaveLength(1);
  });

  it('baglam KRONOLOJIKTIR ve sirket kimligi ilk blokta', async () => {
    const { useCases, llmPort } = build();

    await useCases.generate({ tenantId: TENANT_ID, userId: USER_ID, companyId: COMPANY_ID });

    const context = llmPort.received[0]?.context ?? [];
    expect(context[0]).toContain('Acme Tekstil');
    expect(context.some((block) => block.includes('Yillik anlasma'))).toBe(true);
    expect(context.some((block) => block.startsWith('[2026-08-07]'))).toBe(true);
  });

  it('uzun gorusme baglam tavaninda KESILIR', async () => {
    const calls: CallLog = [];
    const repository = new FakeRepository(calls);
    repository.recentInteractions = (): Promise<readonly { occurredOn: string; body: string }[]> =>
      Promise.resolve([{ occurredOn: '2026-08-07', body: 'x'.repeat(5_000) }]);
    const llmPort = new FakeLlmPort(calls);

    const useCases = new CompanySummaryUseCases({
      repository,
      rateLimitRepository: new FakeRateLimitRepository(calls),
      llmPort,
      transactionManager: fakeTransactionManager(calls),
      clock,
      rateLimit: 20,
      contextInteractionLimit: 20,
      contextCharsPerInteraction: 100,
    });

    await useCases.generate({ tenantId: TENANT_ID, userId: USER_ID, companyId: COMPANY_ID });

    const timeline = (llmPort.received[0]?.context ?? []).find((block) => block.startsWith('['));
    expect(timeline?.length).toBeLessThan(200);
  });
});

describe('CompanySummaryUseCases — reddedilen durumlar', () => {
  it('hic gorusme yoksa model CAGRILMAZ ve satir ACILMAZ', async () => {
    const { useCases, repository, calls } = build();
    repository.facts = { ...BASE_FACTS, interactionCount: 0, lastInteractionCreatedAt: null };

    await expect(
      useCases.generate({ tenantId: TENANT_ID, userId: USER_ID, companyId: COMPANY_ID }),
    ).rejects.toThrow(NoInteractionsToSummarizeError);

    expect(calls).not.toContain('llm.complete');
    expect(calls).not.toContain('repository.claim');
  });

  it('claim alinamazsa 409 karsiligi hata — model IKI KEZ cagrilmaz', async () => {
    const { useCases, repository, calls } = build();
    repository.claimSucceeds = false;

    await expect(
      useCases.generate({ tenantId: TENANT_ID, userId: USER_ID, companyId: COMPANY_ID }),
    ).rejects.toThrow(SummaryGenerationInProgressError);

    expect(calls).not.toContain('llm.complete');
  });

  it('saglayici cokerse claim BIRAKILIR — sonraki deneme 409 almaz', async () => {
    const { useCases, llmPort, repository } = build();
    llmPort.failure = new CompletionFailedError('saglayici 500');

    await expect(
      useCases.generate({ tenantId: TENANT_ID, userId: USER_ID, companyId: COMPANY_ID }),
    ).rejects.toThrow(CompletionFailedError);

    expect(repository.released).toBe(1);
  });

  it('model BOS cevap dondurursa yazilmaz ve claim birakilir', async () => {
    const { useCases, llmPort, repository } = build();
    llmPort.answer = '   ';

    await expect(
      useCases.generate({ tenantId: TENANT_ID, userId: USER_ID, companyId: COMPANY_ID }),
    ).rejects.toThrow(CompletionFailedError);

    expect(repository.stored?.summary ?? null).toBeNull();
    expect(repository.released).toBe(1);
  });
});
