import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  type FollowUpRow,
  type OpportunityListRow,
  type OpportunityRepository,
  type PipelineRow,
} from '../application/opportunity.repository.port';
import { type ListPage } from '../application/company.repository.port';
import { type Opportunity } from '../domain/opportunity.entity';
import { CrmPipelineContributor } from './crm-pipeline.contributor';

const TODAY = new Date('2026-08-20T09:00:00.000Z');

class FakeClock implements Clock {
  now(): Date {
    return TODAY;
  }
}

/** Transaction'i saydam gecirir; bu testin konusu kalicilik degil BICIMDIR. */
class PassThroughTransactionManager implements TransactionManager {
  runInCurrentTenantTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
  runInTenantTransaction<T>(_tenantId: string, fn: () => Promise<T>): Promise<T> {
    return fn();
  }
  runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

class FakeOpportunityRepository implements OpportunityRepository {
  rows: PipelineRow[] = [];
  lastLimit: number | null = null;

  listOpenPipeline(input: { limit: number }): Promise<PipelineRow[]> {
    this.lastLimit = input.limit;
    return Promise.resolve(this.rows.slice(0, input.limit));
  }

  save(): Promise<void> {
    throw new Error('kullanilmiyor');
  }
  findById(): Promise<Opportunity | null> {
    throw new Error('kullanilmiyor');
  }
  list(): Promise<ListPage<OpportunityListRow>> {
    throw new Error('kullanilmiyor');
  }
  deleteById(): Promise<number> {
    throw new Error('kullanilmiyor');
  }
  listFollowUps(): Promise<ListPage<FollowUpRow>> {
    throw new Error('kullanilmiyor');
  }
}

function row(overrides: Partial<PipelineRow> = {}): PipelineRow {
  return {
    opportunityId: '018f3a2b-7c4d-7e1f-8a2b-00000000000a',
    companyName: 'Acme Tekstil',
    title: 'Yillik sozlesme',
    stage: 'proposal_sent',
    estimatedValue: '250000.00',
    currency: 'TRY',
    // 40 gun once
    stageChangedAt: new Date('2026-07-11T09:00:00.000Z'),
    nextFollowUpOn: null,
    ...overrides,
  };
}

function harness() {
  const repository = new FakeOpportunityRepository();
  const contributor = new CrmPipelineContributor(
    repository,
    new PassThroughTransactionManager(),
    new FakeClock(),
  );
  return { repository, contributor };
}

describe('CrmPipelineContributor — port sozlesmesi', () => {
  it('izni `opportunity:read`, kokeni `crm-pipeline`', () => {
    const { contributor } = harness();
    expect(contributor.permission).toBe('opportunity:read');
    expect(contributor.source).toBe('crm-pipeline');
  });

  it('EN FAZLA 3 satir ister (her soruda gonderildigi icin KUCUK tutulur)', async () => {
    const { repository, contributor } = harness();
    repository.rows = Array.from({ length: 10 }, () => row());

    const fragments = await contributor.contribute();

    expect(repository.lastLimit).toBe(3);
    // 8 yuvanin en fazla 3'unu alir; 5 yuva anlamsal icerige kalir.
    expect(fragments).toHaveLength(3);
  });

  it('her fragment GERCEK bir firsata referans verir (kaynak atfi)', async () => {
    const { repository, contributor } = harness();
    repository.rows = [row({ opportunityId: 'firsat-1' })];

    const [fragment] = await contributor.contribute();

    expect(fragment?.reference).toEqual({ kind: 'opportunity', id: 'firsat-1' });
  });
});

describe('CrmPipelineContributor — metin bicimi (bu slice in karari)', () => {
  it('sirket, baslik, asama ve degeri TEK SATIRDA verir', async () => {
    const { repository, contributor } = harness();
    repository.rows = [row()];

    const [fragment] = await contributor.contribute();

    expect(fragment?.content).toContain('Acme Tekstil');
    expect(fragment?.content).toContain('Yillik sozlesme');
    expect(fragment?.content).toContain('Teklif verildi');
    expect(fragment?.content).toContain('250000.00 TRY');
  });

  it('`stage_changed_at` sinyalini GUN olarak yazar', async () => {
    const { repository, contributor } = harness();
    repository.rows = [row()];

    const [fragment] = await contributor.contribute();

    // Slice 5'te bu sayacin no-op PATCH'lerle sifirlanmamasi ozellikle
    // saglanmisti — okundugu yer burasi.
    expect(fragment?.content).toContain('40 gundur bu asamada');
  });

  it('GECIKMIS takibi ACIKCA soyler', async () => {
    const { repository, contributor } = harness();
    repository.rows = [row({ nextFollowUpOn: '2026-08-12' })];

    const [fragment] = await contributor.contribute();

    // Modelin tarihten kendi cikarim yapmasini beklemek guvenilmez: "bugun
    // ne?" sorusuna cevap veremez.
    expect(fragment?.content).toContain('8 gun GECIKMIS');
  });

  it('GELECEK tarihli takibi "gecikmis" DEMEZ', async () => {
    const { repository, contributor } = harness();
    repository.rows = [row({ nextFollowUpOn: '2026-12-01' })];

    const [fragment] = await contributor.contribute();

    expect(fragment?.content).toContain('takip 2026-12-01');
    expect(fragment?.content).not.toContain('GECIKMIS');
  });

  it('tutari olmayan firsatta para alanini ATLAR', async () => {
    const { repository, contributor } = harness();
    repository.rows = [row({ estimatedValue: null, currency: null })];

    const [fragment] = await contributor.contribute();

    expect(fragment?.content).toContain('Acme Tekstil');
    expect(fragment?.content).not.toContain('null');
  });
});
