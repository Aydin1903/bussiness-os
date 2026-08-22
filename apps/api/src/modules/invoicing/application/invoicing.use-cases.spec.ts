import { describe, expect, it } from 'vitest';

import { type PdfDocumentModel, type PdfPort } from '../../../shared/pdf.port';
import { type CompanyDirectory, type ContactDirectory } from '../../crm/crm.public';
import {
  DocumentNotEditableError,
  EmptyDocumentError,
  QuoteNotAcceptedError,
  SalesDocumentNotFoundError,
  TooManyLinesError,
} from '../domain/invoicing.error';
import type { SalesDocumentLine } from '../domain/sales-document-line.entity';
import type {
  SalesDocument,
  SalesDocumentKind,
  SalesDocumentStatus,
} from '../domain/sales-document.entity';
import type { InvoicingRepository, ListPage, PipelineSnapshot } from './invoicing.repository.port';
import { InvoicingUseCases } from './invoicing.use-cases';

const NOW = new Date('2026-08-22T10:00:00.000Z');

/**
 * Bellek ici repository.
 *
 * DEVELOPMENT_RULES 5.3: use case testleri gercek bir domain uzerinde calisir;
 * yalnizca KALICILIK sahtedir.
 */
class FakeRepository implements InvoicingRepository {
  readonly documents = new Map<string, SalesDocument>();
  readonly lines = new Map<string, SalesDocumentLine[]>();
  readonly claimed: SalesDocumentKind[] = [];
  private counter = 0;

  saveDocument(document: SalesDocument): Promise<void> {
    this.documents.set(document.id, document);
    return Promise.resolve();
  }

  findDocumentById(input: { id: string; kind: SalesDocumentKind }): Promise<SalesDocument | null> {
    const found = this.documents.get(input.id);
    // ⚠️ Tur eslesmezse `null` — gercek repository de `kind`i SORGUNUN ICINDE
    // tasir; "var ama yanlis tur" ile "yok" AYIRT EDILMEZ.
    return Promise.resolve(found?.kind === input.kind ? found : null);
  }

  listDocuments(input: {
    kind: SalesDocumentKind;
    status: SalesDocumentStatus | null;
  }): Promise<ListPage<SalesDocument>> {
    const items = [...this.documents.values()].filter(
      (document) =>
        document.kind === input.kind && (input.status === null || document.status === input.status),
    );

    return Promise.resolve({ items, total: items.length });
  }

  deleteDocumentById(id: string): Promise<number> {
    return Promise.resolve(this.documents.delete(id) ? 1 : 0);
  }

  replaceLines(input: { documentId: string; lines: readonly SalesDocumentLine[] }): Promise<void> {
    this.lines.set(input.documentId, [...input.lines]);
    return Promise.resolve();
  }

  listLines(documentId: string): Promise<SalesDocumentLine[]> {
    return Promise.resolve(this.lines.get(documentId) ?? []);
  }

  listLinesByDocumentIds(ids: readonly string[]): Promise<Map<string, SalesDocumentLine[]>> {
    return Promise.resolve(new Map(ids.map((id) => [id, this.lines.get(id) ?? []])));
  }

  claimNextNumber(kind: SalesDocumentKind): Promise<number> {
    this.claimed.push(kind);
    this.counter += 1;
    return Promise.resolve(this.counter);
  }

  snapshotPipeline(): Promise<PipelineSnapshot> {
    return Promise.resolve({ acceptedNotInvoiced: [], expired: [], stale: [], openCounts: [] });
  }
}

class RecordingPdfPort implements PdfPort {
  lastModel: PdfDocumentModel | null = null;

  render(document: PdfDocumentModel): Promise<Buffer> {
    this.lastModel = document;
    return Promise.resolve(Buffer.from('%PDF-fake'));
  }
}

/** Dizinler: cagrilip cagrilmadigini da kaydeder. */
function directories(): {
  company: CompanyDirectory & { calls: number };
  contact: ContactDirectory & { calls: number };
} {
  const company = {
    calls: 0,
    findNames(): Promise<ReadonlyMap<string, string>> {
      company.calls += 1;
      return Promise.resolve(new Map([['company-1', 'BUGUNKU AD A.S.']]));
    },
  };
  const contact = {
    calls: 0,
    findNames(): Promise<ReadonlyMap<string, string>> {
      contact.calls += 1;
      return Promise.resolve(new Map([['contact-1', 'Ayse Yilmaz']]));
    },
  };

  return { company, contact };
}

function build(maxLines = 200): {
  useCases: InvoicingUseCases;
  repository: FakeRepository;
  pdf: RecordingPdfPort;
  company: CompanyDirectory & { calls: number };
  contact: ContactDirectory & { calls: number };
} {
  const repository = new FakeRepository();
  const pdf = new RecordingPdfPort();
  const { company, contact } = directories();
  let sequence = 0;

  const useCases = new InvoicingUseCases({
    repository,
    companyDirectory: company,
    contactDirectory: contact,
    pdfPort: pdf,
    transactionManager: {
      runInCurrentTenantTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
      runInTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
    } as never,
    idGenerator: {
      nextId: (): string => {
        sequence += 1;
        return `id-${String(sequence)}`;
      },
    },
    clock: { now: (): Date => NOW },
    maxLines,
  });

  return { useCases, repository, pdf, company, contact };
}

const LINE = {
  description: 'M8 civata',
  quantity: '500',
  unit: 'adet',
  unitPrice: '12.50',
  taxRate: '20',
};

function quoteInput(): Parameters<InvoicingUseCases['createDocument']>[0] {
  return {
    tenantId: 'tenant-1',
    userId: 'user-1',
    kind: 'quote',
    fields: {
      customerName: 'Yildiz Ltd.',
      companyId: 'company-1',
      contactId: 'contact-1',
      issuedOn: '2026-08-22',
      validUntil: '2026-09-30',
      dueOn: null,
      currency: 'TRY',
      notes: null,
    },
    lines: [LINE],
  };
}

describe('InvoicingUseCases', () => {
  describe('createDocument', () => {
    it('satirlara ISTEKTEKI SIRAYA gore konum verir', async () => {
      const { useCases } = build();

      const view = await useCases.createDocument({
        ...quoteInput(),
        lines: [LINE, { ...LINE, description: 'Somun' }],
      });

      expect(view.lines.map((line) => line.position)).toEqual([1, 2]);
      expect(view.document.status).toBe('draft');
    });

    it('TOPLAMLARI TURETIR — hicbir kolonda saklamaz (§1.3)', async () => {
      const { useCases } = build();

      const view = await useCases.createDocument(quoteInput());

      // 500 x 12.50 = 6250.00 · %20 = 1250.00
      expect(view.totals).toEqual({
        subtotal: '6250.00',
        taxTotal: '1250.00',
        total: '7500.00',
      });
    });

    it('satir sinirini asan istegi REDDEDER — SESSIZ KIRPMA YOK', async () => {
      const { useCases } = build(1);

      await expect(
        useCases.createDocument({ ...quoteInput(), lines: [LINE, LINE] }),
      ).rejects.toThrow(TooManyLinesError);
    });

    it('YAZMA yolunda cross-modul dizinini CAGIRMAZ', async () => {
      // ⚠️ Yeni yazilmis bir belgenin yanitinda "bugunku musteri adi"
      // gostermek, bir YAZMA isteginin BASKA BIR MODULUN iznini yoklamasini
      // gerektirirdi — gereksiz bir baglanti.
      const { useCases, company, contact } = build();

      await useCases.createDocument(quoteInput());

      expect(company.calls).toBe(0);
      expect(contact.calls).toBe(0);
    });
  });

  describe('getDocument', () => {
    it('BELGEYE BASILAN ad ile BUGUNKU adi AYRI dondurur (§1.5)', async () => {
      const { useCases } = build();
      const created = await useCases.createDocument(quoteInput());

      const view = await useCases.getDocument({
        id: created.document.id,
        kind: 'quote',
        role: 'owner',
      });

      // ⚠️ Ayni ekranda IKI AD — bu bir kusur degil, ayrimin ta kendisi.
      expect(view.document.customerName).toBe('Yildiz Ltd.');
      expect(view.linkedCompanyName).toBe('BUGUNKU AD A.S.');
      expect(view.linkedContactName).toBe('Ayse Yilmaz');
    });

    it('YANLIS TURDE id icin 404 uretir — "var ama fatura" SIZDIRILMAZ', async () => {
      const { useCases } = build();
      const created = await useCases.createDocument(quoteInput());

      await expect(
        useCases.getDocument({ id: created.document.id, kind: 'invoice', role: 'owner' }),
      ).rejects.toThrow(SalesDocumentNotFoundError);
    });
  });

  describe('releaseDocument (§1.6, §2)', () => {
    it('numara URETIR ve aktoru damgalar', async () => {
      const { useCases, repository } = build();
      const created = await useCases.createDocument(quoteInput());

      const sent = await useCases.releaseDocument({
        id: created.document.id,
        kind: 'quote',
        userId: 'user-9',
        role: 'owner',
      });

      expect(sent.document.status).toBe('sent');
      expect(sent.document.number).toBe('TKF-000001');
      expect(sent.document.sentByUserId).toBe('user-9');
      expect(repository.claimed).toEqual(['quote']);
    });

    it('KALEMSIZ belgeyi gondermez', async () => {
      const { useCases } = build();
      const created = await useCases.createDocument({ ...quoteInput(), lines: [] });

      await expect(
        useCases.releaseDocument({
          id: created.document.id,
          kind: 'quote',
          userId: 'u',
          role: 'owner',
        }),
      ).rejects.toThrow(EmptyDocumentError);
    });

    it('gonderildikten sonra GUNCELLEME ve SILME reddedilir', async () => {
      const { useCases } = build();
      const created = await useCases.createDocument(quoteInput());
      await useCases.releaseDocument({
        id: created.document.id,
        kind: 'quote',
        userId: 'u',
        role: 'owner',
      });

      await expect(
        useCases.updateDocument({
          id: created.document.id,
          kind: 'quote',
          changes: { customerName: 'Baska' },
          lines: null,
          role: 'owner',
        }),
      ).rejects.toThrow(DocumentNotEditableError);

      await expect(
        useCases.deleteDocument({ id: created.document.id, kind: 'quote' }),
      ).rejects.toThrow(DocumentNotEditableError);
    });
  });

  describe('convertQuoteToInvoice (§3)', () => {
    async function acceptedQuote(): Promise<{
      useCases: InvoicingUseCases;
      repository: FakeRepository;
      quoteId: string;
    }> {
      const { useCases, repository } = build();
      const created = await useCases.createDocument(quoteInput());

      await useCases.releaseDocument({
        id: created.document.id,
        kind: 'quote',
        userId: 'u',
        role: 'owner',
      });
      await useCases.decideQuote({
        id: created.document.id,
        outcome: 'accepted',
        userId: 'u',
        role: 'owner',
      });

      return { useCases, repository, quoteId: created.document.id };
    }

    it('TEKLIFE TEK KOLON YAZMAZ — ok fatura -> teklif', async () => {
      const { useCases, repository, quoteId } = await acceptedQuote();
      const before = repository.documents.get(quoteId)?.toState();

      const invoice = await useCases.convertQuoteToInvoice({
        quoteId,
        tenantId: 'tenant-1',
        userId: 'u',
        role: 'owner',
      });

      const after = repository.documents.get(quoteId)?.toState();
      expect(after).toEqual(before);
      expect(invoice.document.convertedFromId).toBe(quoteId);
      expect(invoice.document.kind).toBe('invoice');
      // Yeni fatura TASLAK dogar ve serbestce duzenlenebilir.
      expect(invoice.document.status).toBe('draft');
      expect(invoice.document.number).toBeNull();
    });

    it('KALEMLERI KOPYALAR — referans DEGIL', async () => {
      const { useCases, repository, quoteId } = await acceptedQuote();

      const invoice = await useCases.convertQuoteToInvoice({
        quoteId,
        tenantId: 'tenant-1',
        userId: 'u',
        role: 'owner',
      });

      const quoteLines = repository.lines.get(quoteId) ?? [];
      const invoiceLines = repository.lines.get(invoice.document.id) ?? [];

      expect(invoiceLines).toHaveLength(quoteLines.length);
      // ⚠️ Yeni id'ler: iki AYRI belge, iki AYRI gercek.
      expect(invoiceLines[0]?.toState().id).not.toBe(quoteLines[0]?.toState().id);
      expect(invoiceLines[0]?.toState().description).toBe(quoteLines[0]?.toState().description);
      expect(invoiceLines[0]?.toState().documentId).toBe(invoice.document.id);
    });

    it('musteri adini KOPYALAR — dizinden yeniden COZMEZ (§1.5)', async () => {
      const { useCases, quoteId } = await acceptedQuote();

      const invoice = await useCases.convertQuoteToInvoice({
        quoteId,
        tenantId: 'tenant-1',
        userId: 'u',
        role: 'owner',
      });

      // Dizin "BUGUNKU AD A.S." dondurur; belgeye BASILAN ad degismedi.
      expect(invoice.document.customerName).toBe('Yildiz Ltd.');
    });

    it('IKINCI KEZ donusturmeyi ENGELLEMEZ — kismi teslimat mesrudur', async () => {
      const { useCases, quoteId } = await acceptedQuote();

      const first = await useCases.convertQuoteToInvoice({
        quoteId,
        tenantId: 'tenant-1',
        userId: 'u',
        role: 'owner',
      });
      const second = await useCases.convertQuoteToInvoice({
        quoteId,
        tenantId: 'tenant-1',
        userId: 'u',
        role: 'owner',
      });

      expect(second.document.id).not.toBe(first.document.id);
      expect(second.document.convertedFromId).toBe(quoteId);
    });

    it('KABUL EDILMEMIS teklifi donusturmez', async () => {
      const { useCases } = build();
      const created = await useCases.createDocument(quoteInput());

      await expect(
        useCases.convertQuoteToInvoice({
          quoteId: created.document.id,
          tenantId: 'tenant-1',
          userId: 'u',
          role: 'owner',
        }),
      ).rejects.toThrow(QuoteNotAcceptedError);
    });
  });

  describe('renderPdf (§6)', () => {
    it('TASLAGI da basar ama NUMARA YAZMAZ', async () => {
      const { useCases, pdf } = build();
      const created = await useCases.createDocument(quoteInput());

      const result = await useCases.renderPdf({
        id: created.document.id,
        kind: 'quote',
        role: 'owner',
      });

      expect(pdf.lastModel?.number).toBeNull();
      expect(result.filename).toBe('teklif-taslak.pdf');
    });

    it('FATURA ciktisi "mali belge DEGILDIR" uyarisini TASIR (§12)', async () => {
      const { useCases, pdf } = build();
      const created = await useCases.createDocument({ ...quoteInput(), kind: 'invoice' });

      await useCases.renderPdf({ id: created.document.id, kind: 'invoice', role: 'owner' });

      expect(pdf.lastModel?.footnote).toContain('yasal e-fatura');
      expect(pdf.lastModel?.title).toBe('FATURA');
    });

    it('PDF izdusumu BELGEYE BASILAN adi tasir, bugunku adi DEGIL', async () => {
      const { useCases, pdf } = build();
      const created = await useCases.createDocument(quoteInput());

      await useCases.renderPdf({ id: created.document.id, kind: 'quote', role: 'owner' });

      expect(pdf.lastModel?.customerName).toBe('Yildiz Ltd.');
    });
  });
});
