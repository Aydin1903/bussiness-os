import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  type InvoicingRepository,
  type PipelineQuote,
  type PipelineSnapshot,
} from '../application/invoicing.repository.port';
import { SalesDocumentLine } from '../domain/sales-document-line.entity';
import { QUOTE_READ } from '../invoicing.permissions';
import {
  INVOICING_PIPELINE_SOURCE,
  InvoicingPipelineContributor,
} from './invoicing-pipeline.contributor';

const NOW = new Date('2026-08-22T10:00:00.000Z');

function quote(overrides: Partial<PipelineQuote> = {}): PipelineQuote {
  return {
    id: 'quote-1',
    number: 'TKF-000001',
    customerName: 'Yildiz Ltd.',
    currency: 'TRY',
    issuedOn: '2026-08-01',
    validUntil: null,
    ...overrides,
  };
}

function line(documentId: string): SalesDocumentLine {
  return SalesDocumentLine.create({
    id: `${documentId}-line`,
    tenantId: 'tenant-1',
    documentId,
    position: 1,
    fields: {
      description: 'M8 civata',
      quantity: '500',
      unit: 'adet',
      unitPrice: '12.50',
      taxRate: '20',
    },
    now: NOW,
  });
}

function build(snapshot: Partial<PipelineSnapshot>): InvoicingPipelineContributor {
  const full: PipelineSnapshot = {
    acceptedNotInvoiced: [],
    expired: [],
    stale: [],
    openCounts: [],
    ...snapshot,
  };

  const repository = {
    snapshotPipeline(): Promise<PipelineSnapshot> {
      return Promise.resolve(full);
    },
    listLinesByDocumentIds(ids: readonly string[]): Promise<Map<string, SalesDocumentLine[]>> {
      return Promise.resolve(new Map(ids.map((id) => [id, [line(id)]])));
    },
  } as unknown as InvoicingRepository;

  const transactionManager = {
    runInCurrentTenantTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
  } as unknown as TransactionManager;

  const clock: Clock = { now: () => NOW };

  return new InvoicingPipelineContributor(repository, transactionManager, clock, 14);
}

describe('InvoicingPipelineContributor (ADR-0041 §4)', () => {
  it('⚠️ YAPISAL olarak DEKLARE EDILIR — ADR-0036 taban yuvasinin kosulu', () => {
    // ⚠️ Bu satir ADR-0036'nin ESIGINI ASAN satirdir (yapisal kaynak 5 -> 6).
    // Alan ZORUNLUDUR ve unutulmasi DERLEME HATASIDIR; bu test yine de
    // degerini korur: `'semantic'`e cevrilirse garanti yuva SESSIZCE kaybolur.
    const contributor = build({});

    expect(contributor.contributionKind).toBe('structural');
    expect(contributor.source).toBe(INVOICING_PIPELINE_SOURCE);
    expect(contributor.permission).toBe(QUOTE_READ);
  });

  it('⚠️ HICBIR SEY YOKSA HICBIR SEY GONDERMEZ — garanti yuvayi bosa harcamaz', () => {
    // ADR-0036 §2'nin dogrudan gereksinimi: taban yalnizca "gercekten satir
    // donduren" kaynaklara yuva ayirir. Hic teklif yazmamis bir tenant'ta
    // "0 teklif" demek, modele bilgi degil GURULTU tasir.
    return expect(build({}).contribute()).resolves.toEqual([]);
  });

  it('kabul edilip FATURALANMAMIS teklife EN YUKSEK skoru verir (para masada)', async () => {
    const fragments = await build({ acceptedNotInvoiced: [quote()] }).contribute();

    expect(fragments).toHaveLength(1);
    expect(fragments[0]?.score).toBe(0.95);
    expect(fragments[0]?.content).toContain('FATURASI KESILMEDI');
    expect(fragments[0]?.reference).toEqual({ kind: 'quote', id: 'quote-1' });
  });

  it('⚠️ TUTARI PARA BIRIMIYLE yazar — ciplak sayi TOPLANABILIRLIK ima ederdi', () => {
    // 500 x 12.50 = 6250.00 · %20 -> 7500.00 (kalemler yuklenip DOMAIN
    // fonksiyonuyla hesaplanir; SQL'de IKINCI bir aritmetik YOKTUR).
    return build({ acceptedNotInvoiced: [quote()] })
      .contribute()
      .then((fragments) => {
        expect(fragments[0]?.content).toContain('7500.00 TRY');
      });
  });

  it('SKOR MERDIVENI: 0.95 / 0.95 / 0.90 / 0.75 — duz skor YOK', async () => {
    const fragments = await build({
      acceptedNotInvoiced: [quote({ id: 'q1' })],
      expired: [quote({ id: 'q2', validUntil: '2026-08-01' })],
      stale: [quote({ id: 'q3' })],
      openCounts: [{ currency: 'TRY', count: 4 }],
    }).contribute();

    expect(fragments.map((fragment) => fragment.score)).toEqual([0.95, 0.95, 0.9, 0.75]);
  });

  it('esik gunu METINDE gorunur — arayuzdeki sabitle SENKRON KALMALI', () => {
    // ⚠️ `CRM_STALE_STAGE_DAYS` / `STALE_STAGE_DAYS` ayrismasinin DORDUNCU
    // tekrari: ayrisirlarsa ekran "bekliyor" der, katkici 0.75 verir.
    return build({ stale: [quote()] })
      .contribute()
      .then((fragments) => {
        expect(fragments[0]?.content).toContain('14 gundur cevapsiz');
      });
  });

  it('acik teklif ozeti SAYIM tasir, TUTAR DEGIL (§4.1 daraltmasi)', async () => {
    // ⚠️ Tutar SQL'de toplansaydi, satir bazinda yuvarlama kurali IKINCI KEZ
    // yazilmis olurdu ve iki aritmetik zamanla AYRISIRDI — hata SESSIZ.
    const fragments = await build({
      openCounts: [
        { currency: 'EUR', count: 2 },
        { currency: 'TRY', count: 5 },
      ],
    }).contribute();

    expect(fragments).toHaveLength(1);
    expect(fragments[0]?.content).toContain('2 adet EUR');
    expect(fragments[0]?.content).toContain('5 adet TRY');
    expect(fragments[0]?.reference).toEqual({ kind: 'quote-summary', id: 'open-quotes' });
  });

  it('numarasiz (taslak) belge icin UYDURULMUS numara YAZMAZ', async () => {
    const fragments = await build({ acceptedNotInvoiced: [quote({ number: null })] }).contribute();

    expect(fragments[0]?.content).toContain('numarasiz');
  });
});
