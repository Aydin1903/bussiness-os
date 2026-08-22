import { type CompanyDirectory, type ContactDirectory } from '../../crm/crm.public';
import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type PdfPort } from '../../../shared/pdf.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { computeDocumentTotals, type DocumentTotals } from '../domain/document-money';
import { formatDocumentNumber } from '../domain/document-number';
import {
  EmptyDocumentError,
  QuoteNotAcceptedError,
  SalesDocumentNotFoundError,
  TooManyLinesError,
} from '../domain/invoicing.error';
import {
  SalesDocumentLine,
  type SalesDocumentLineFields,
  type SalesDocumentLineState,
} from '../domain/sales-document-line.entity';
import {
  SalesDocument,
  type SalesDocumentFields,
  type SalesDocumentKind,
  type SalesDocumentPatch,
  type SalesDocumentState,
  type SalesDocumentStatus,
} from '../domain/sales-document.entity';
import { buildPdfModel } from './build-pdf-model';
import { type InvoicingRepository, type ListPage } from './invoicing.repository.port';

/**
 * Teklif / Fatura yasam dongusu (ADR-0041 §1, §2, §3, §6).
 *
 * ============================================================================
 * ⚠️ BU MODUL YALNIZCA CRM'I IMPORT EDER — TEK YENI KENAR (§7)
 * ============================================================================
 * `crm.public.ts`in IKI dizini kullanilir (`CompanyDirectory`,
 * `ContactDirectory`) ve o dosya BU ISTE TEK SATIR DEGISMEDI: ikisi de zaten
 * vardi (birini Projeler, digerini Randevu yazdi). ADR-0037 §4.1'in kurali —
 * _"yeni TALIP -> dosya degismez"_ — IKINCI kez talip tarafindan dogrulandi.
 *
 * ⚠️ `finance` IMPORT EDILMEZ (§7.2): ROADMAP'in _"8 -> 3"_ bagimliligi bir
 * SIRA bagimliligidir, bir grafik kenari DEGIL. Devralinan sey kod degil
 * ALINMIS KARARLARDIR (para tipi, para birimi bazinda ayrisma, kur cevriminin
 * yoklugu). ⚠️ Kesilen bir fatura `finance.transactions`a satir YAZMAZ: o
 * tablo GERCEKLESMIS NAKIT HAREKETIDIR — fatura kesmek para almak degildir.
 *
 * ⚠️ `inventory` de IMPORT EDILMEZ (§7.3): satir kalemi SERBEST METINDIR.
 *
 * Bagimlilik grafigi ALTI KENARDAN YEDIYE cikar ve HALA DAG'dir: yeni kenarin
 * hedefi CRM'dir ve CRM'in cikan hicbir kenari yoktur — hedefi bir KOK DUGUM
 * olan kenar dongu OLUSTURAMAZ.
 *
 * ============================================================================
 * ⚠️ EMBEDDING YOK, ORAN SINIRI YOK (§5)
 * ============================================================================
 * `EmbeddingPort`, `reindex` ve `enforceRateLimit` bu dosyada ARANMASIN. Bu,
 * Faz 5'te vektor tasimayan ILK is modulu: bir teklif kalemi ADR-0034 §6.1'in
 * tarif ettigi seydir — yuzlerce neredeyse OZDES kisa vektor top-K havuzunu
 * kirletir. Katki ANLAMSAL degil YAPISALDIR.
 */
export interface InvoicingDependencies {
  readonly repository: InvoicingRepository;
  readonly companyDirectory: CompanyDirectory;
  readonly contactDirectory: ContactDirectory;
  readonly pdfPort: PdfPort;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  /** Belge basina EN FAZLA satir (`TooManyLinesError`). */
  readonly maxLines: number;
}

/**
 * Tek belgenin tam gorunumu.
 *
 * ⚠️ `totals` TURETILMISTIR (§1.3) — hicbir kolonda saklanmaz.
 */
export interface SalesDocumentView {
  readonly document: SalesDocumentState;
  readonly lines: readonly SalesDocumentLineState[];
  readonly totals: DocumentTotals;
  /**
   * ⚠️ BUGUNKU musteri adi — belgeye BASILAN ad DEGIL (§1.5).
   *
   * `document.customerName` belgenin uzerindekidir ve DONMUSTUR; bu alan
   * `companyId` uzerinden dizinden okunur ve BUGUNU gosterir. Ayni ekranda iki
   * ad gorunebilir ve bu bir kusur degil, AYRIMIN TA KENDISIDIR.
   *
   * `null` UC durumu birden ifade eder ve ayirt EDILEMEZ (P2): sirket silinmis,
   * baska tenant'in, ya da cagiran `company:read` TASIMIYOR.
   */
  readonly linkedCompanyName: string | null;
  readonly linkedContactName: string | null;
}

export class InvoicingUseCases {
  constructor(private readonly deps: InvoicingDependencies) {}

  // ==========================================================================
  // Olusturma ve okuma
  // ==========================================================================

  async createDocument(input: {
    tenantId: string;
    userId: string;
    kind: SalesDocumentKind;
    fields: SalesDocumentFields;
    lines: readonly SalesDocumentLineFields[];
  }): Promise<SalesDocumentView> {
    this.#assertLineCount(input.lines.length);

    const now = this.deps.clock.now();
    const document = SalesDocument.create({
      id: this.deps.idGenerator.nextId(),
      tenantId: input.tenantId,
      kind: input.kind,
      createdByUserId: input.userId,
      // ⚠️ Yalnizca `convert` doldurur (§3); dogrudan olusturmada DAIMA `null`.
      convertedFromId: null,
      fields: input.fields,
      now,
    });

    const lines = this.#buildLines({
      tenantId: input.tenantId,
      documentId: document.id,
      fields: input.lines,
      now,
    });

    await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      await this.deps.repository.saveDocument(document);
      await this.deps.repository.replaceLines({ documentId: document.id, lines });
    });

    return this.#view({ document, lines, role: null });
  }

  async getDocument(input: {
    id: string;
    kind: SalesDocumentKind;
    role: string;
  }): Promise<SalesDocumentView> {
    const { document, lines } = await this.deps.transactionManager.runInCurrentTenantTransaction(
      async () => {
        const found = await this.#requireDocument(input.id, input.kind);
        return { document: found, lines: await this.deps.repository.listLines(input.id) };
      },
    );

    return this.#view({ document, lines, role: input.role });
  }

  async listDocuments(input: {
    kind: SalesDocumentKind;
    status: SalesDocumentStatus | null;
    limit: number;
    offset: number;
  }): Promise<ListPage<SalesDocumentState>> {
    const page = await this.deps.transactionManager.runInCurrentTenantTransaction(async () =>
      this.deps.repository.listDocuments(input),
    );

    return {
      items: page.items.map((document) => document.toState()),
      total: page.total,
    };
  }

  // ==========================================================================
  // Degistirme — YALNIZCA TASLAK (§2)
  // ==========================================================================

  /**
   * KISMI guncelleme; `lines` verilirse satirlar BUTUN OLARAK degisir.
   *
   * ⚠️ `assertEditable()` IKI KEZ etkilidir: `update()` kendi icinde cagirir ve
   * satir yazma yolu da ondan gecer. Ucuncu katman VERITABANINDADIR — kalemler
   * ayri bir tablodadir ve baslik uzerindeki kontrol onlari KAPSAMAZ.
   */
  async updateDocument(input: {
    id: string;
    kind: SalesDocumentKind;
    changes: SalesDocumentPatch;
    lines: readonly SalesDocumentLineFields[] | null;
    role: string;
  }): Promise<SalesDocumentView> {
    if (input.lines !== null) {
      this.#assertLineCount(input.lines.length);
    }

    const now = this.deps.clock.now();

    const { document, lines } = await this.deps.transactionManager.runInCurrentTenantTransaction(
      async () => {
        const existing = await this.#requireDocument(input.id, input.kind);
        const updated = existing.update(input.changes, now);

        await this.deps.repository.saveDocument(updated);

        if (input.lines === null) {
          return { document: updated, lines: await this.deps.repository.listLines(input.id) };
        }

        const replacement = this.#buildLines({
          tenantId: updated.toState().tenantId,
          documentId: updated.id,
          fields: input.lines,
          now,
        });

        await this.deps.repository.replaceLines({
          documentId: updated.id,
          lines: replacement,
        });

        return { document: updated, lines: replacement };
      },
    );

    return this.#view({ document, lines, role: input.role });
  }

  async deleteDocument(input: { id: string; kind: SalesDocumentKind }): Promise<void> {
    await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const document = await this.#requireDocument(input.id, input.kind);

      // ⚠️ Yalnizca TASLAK silinir. Gonderilmis bir belgenin dogru "silme"si
      // `rejected` / `cancelled` durumudur — satir DURUR ve numarasi da durur.
      document.assertEditable();

      await this.deps.repository.deleteDocumentById(input.id);
    });
  }

  // ==========================================================================
  // Durum gecisleri
  // ==========================================================================

  /**
   * Belgeyi DISARI CIKARIR: teklif `sent`, fatura `issued`.
   *
   * ⚠️ Numara BURADA uretilir (§1.6) ve sayac KILITLENIR. Islem sirasi onemli:
   * numara alinir, sonra durum yazilir — ikisi AYNI transaction'da. Numara
   * alinip durum yazilamazsa transaction geri doner ve numara da geri gelir.
   *
   * ⚠️ Kalemsiz belge REDDEDILIR (`EmptyDocumentError`): bos bir belgeyi
   * musteriye gondermek, sistemin yaptirmamasi gereken tek "sessiz sacmalik"tir.
   */
  async releaseDocument(input: {
    id: string;
    kind: SalesDocumentKind;
    userId: string;
    role: string;
  }): Promise<SalesDocumentView> {
    const now = this.deps.clock.now();

    const { document, lines } = await this.deps.transactionManager.runInCurrentTenantTransaction(
      async () => {
        const existing = await this.#requireDocument(input.id, input.kind);
        const existingLines = await this.deps.repository.listLines(input.id);

        if (existingLines.length === 0) {
          throw new EmptyDocumentError();
        }

        const value = await this.deps.repository.claimNextNumber(input.kind);
        const released = existing.release({
          number: formatDocumentNumber(input.kind, value),
          userId: input.userId,
          now,
        });

        await this.deps.repository.saveDocument(released);
        return { document: released, lines: existingLines };
      },
    );

    return this.#view({ document, lines, role: input.role });
  }

  /** Teklifin sonucunu isaretler (`accepted` | `rejected`). */
  async decideQuote(input: {
    id: string;
    outcome: 'accepted' | 'rejected';
    userId: string;
    role: string;
  }): Promise<SalesDocumentView> {
    const now = this.deps.clock.now();

    const { document, lines } = await this.deps.transactionManager.runInCurrentTenantTransaction(
      async () => {
        const existing = await this.#requireDocument(input.id, 'quote');
        const decided = existing.decide({ outcome: input.outcome, userId: input.userId, now });

        await this.deps.repository.saveDocument(decided);
        return { document: decided, lines: await this.deps.repository.listLines(input.id) };
      },
    );

    return this.#view({ document, lines, role: input.role });
  }

  /** Kesilmis faturayi iptal eder — SATIR DURUR, silinmez. */
  async cancelInvoice(input: {
    id: string;
    userId: string;
    role: string;
  }): Promise<SalesDocumentView> {
    const now = this.deps.clock.now();

    const { document, lines } = await this.deps.transactionManager.runInCurrentTenantTransaction(
      async () => {
        const existing = await this.#requireDocument(input.id, 'invoice');
        const cancelled = existing.cancel({ userId: input.userId, now });

        await this.deps.repository.saveDocument(cancelled);
        return { document: cancelled, lines: await this.deps.repository.listLines(input.id) };
      },
    );

    return this.#view({ document, lines, role: input.role });
  }

  // ==========================================================================
  // Faturaya donustur (§3)
  // ==========================================================================

  /**
   * Kabul edilmis teklifi YENI BIR FATURA TASLAGINA donusturur.
   *
   * ⚠️ TEKLIFE TEK KOLON YAZILMAZ. Ok FATURA -> TEKLIF (`convertedFromId` yeni
   * faturada durur); tersi teklifi DEGISTIRMEK olurdu ve §2'yi delerdi.
   *
   * ⚠️ KALEMLER KOPYALANIR — ve bu §1.5'in denormalizasyon gerekcesiyle AYNI
   * SATIRDANDIR: kopyalanan sey bir ADRES (baska bir kaydi gosteren isaretci)
   * degil, BIR BELGENIN ICERIGIDIR. Referans verilseydi teklifin bir kalemi
   * degistiginde faturanin da degismesi gerekirdi — ama teklif zaten
   * degistirilemez ve IKI AYRI BELGE iki ayri gercegi anlatir.
   *
   * ⚠️ IKINCI KEZ DONUSTURME ENGELLENMEZ: bir teklif iki faturaya bolunebilir
   * (kismi teslimat). Bedeli kayitli: "bu teklifin ne kadari faturalandi"
   * sorusu v1'de SORULAMAZ.
   */
  async convertQuoteToInvoice(input: {
    quoteId: string;
    tenantId: string;
    userId: string;
    role: string;
  }): Promise<SalesDocumentView> {
    const now = this.deps.clock.now();

    const { document, lines } = await this.deps.transactionManager.runInCurrentTenantTransaction(
      async () => {
        const quote = await this.#requireDocument(input.quoteId, 'quote');

        if (quote.status !== 'accepted') {
          throw new QuoteNotAcceptedError(quote.status);
        }

        const source = quote.toState();
        const sourceLines = await this.deps.repository.listLines(input.quoteId);

        if (sourceLines.length === 0) {
          throw new EmptyDocumentError();
        }

        const invoice = SalesDocument.create({
          id: this.deps.idGenerator.nextId(),
          tenantId: input.tenantId,
          kind: 'invoice',
          createdByUserId: input.userId,
          convertedFromId: source.id,
          fields: toInvoiceFields(source, now),
          now,
        });

        // ⚠️ Kalemler KOPYALANIR (§3) — bir ADRES degil BIR BELGENIN ICERIGI.
        const copied = this.#buildLines({
          tenantId: input.tenantId,
          documentId: invoice.id,
          fields: sourceLines.map((line) => toLineFields(line)),
          now,
        });

        await this.deps.repository.saveDocument(invoice);
        await this.deps.repository.replaceLines({ documentId: invoice.id, lines: copied });

        return { document: invoice, lines: copied };
      },
    );

    return this.#view({ document, lines, role: input.role });
  }

  // ==========================================================================
  // PDF (§6)
  // ==========================================================================

  /**
   * Belgeyi PDF olarak URETIR.
   *
   * ⚠️ SAKLANMAZ (§6.3): `StoragePort` bu modulde KULLANILMAZ. Uretmeyi guvenli
   * kilan sey §2'dir — gonderilmis belgenin verisi degismez, yani icerik her
   * zaman aynidir. Degisebilen tek sey SABLONDUR ve bugun sablon TEKTIR.
   *
   * ⚠️ TASLAK DA BASILABILIR: kullanicinin gondermeden once onizlemesi mesru
   * bir ihtiyactir. Taslakta numara `null`dur ve PDF onu YAZMAZ — sahte bir
   * numara basmak, henuz verilmemis bir numarayi VERILMIS gostermek olurdu.
   */
  async renderPdf(input: {
    id: string;
    kind: SalesDocumentKind;
    role: string;
  }): Promise<{ filename: string; bytes: Buffer }> {
    const view = await this.getDocument(input);
    const model = buildPdfModel(view);

    return {
      filename: buildFilename(view),
      bytes: await this.deps.pdfPort.render(model),
    };
  }

  // ==========================================================================
  // Yardimcilar
  // ==========================================================================

  async #requireDocument(id: string, kind: SalesDocumentKind): Promise<SalesDocument> {
    const document = await this.deps.repository.findDocumentById({ id, kind });

    // ⚠️ "Yok", "baska tenant'in" ve "YANLIS TURDE" ayni hatayi verir (P2).
    // Ucuncusu bu modulde gercek bir sizinti kapisidir: `invoice:read`
    // TASIMAYAN biri `/quotes/<fatura-id>` ile bir faturanin varligini
    // yoklayabilirdi.
    if (document === null) {
      throw new SalesDocumentNotFoundError();
    }

    return document;
  }

  #assertLineCount(count: number): void {
    if (count > this.deps.maxLines) {
      throw new TooManyLinesError(count, this.deps.maxLines);
    }
  }

  #buildLines(input: {
    tenantId: string;
    documentId: string;
    fields: readonly SalesDocumentLineFields[];
    now: Date;
  }): SalesDocumentLine[] {
    return input.fields.map((fields, index) =>
      SalesDocumentLine.create({
        id: this.deps.idGenerator.nextId(),
        tenantId: input.tenantId,
        documentId: input.documentId,
        // ⚠️ Sira ISTEKTEKI SIRADAN gelir, istemcinin gonderdigi bir
        // `position` alanindan DEGIL: iki satirin ayni sirayi tasimasi ya da
        // bosluk birakmasi, belgede aciklanamaz bir numaralandirma uretirdi.
        position: index + 1,
        fields,
        now: input.now,
      }),
    );
  }

  async #view(input: {
    document: SalesDocument;
    lines: readonly SalesDocumentLine[];
    role: string | null;
  }): Promise<SalesDocumentView> {
    const state = input.document.toState();
    const lineStates = input.lines.map((line) => line.toState());

    return {
      document: state,
      lines: lineStates,
      totals: computeDocumentTotals(lineStates),
      ...(await this.#resolveLinks(state, input.role)),
    };
  }

  /**
   * Cross-modul ad cozumu (§7.1).
   *
   * ⚠️ IZIN KAPISI DIZINLERIN ICINDEDIR — cagirana birakilmaz. Bu metot
   * yalnizca ROLU GECIRIR; `company:read` / `contact:read` kontrolunu CRM
   * yapar. Cagirana birakilsaydi, unutan tek modul bir sizinti kapisi acardi
   * ve unutmak SESSIZ olurdu.
   *
   * ⚠️ `role === null` (yazma yollari) -> dizin HIC CAGRILMAZ. Yeni yazilmis
   * bir belgenin yanitinda "bugunku musteri adi" gostermek, bir yazma isteginin
   * BASKA BIR MODULUN iznini yoklamasini gerektirirdi — gereksiz bir baglanti.
   */
  async #resolveLinks(
    state: SalesDocumentState,
    role: string | null,
  ): Promise<{ linkedCompanyName: string | null; linkedContactName: string | null }> {
    if (role === null) {
      return { linkedCompanyName: null, linkedContactName: null };
    }

    const [companies, contacts] = await Promise.all([
      state.companyId === null
        ? new Map<string, string>()
        : this.deps.companyDirectory.findNames({ ids: [state.companyId], role }),
      state.contactId === null
        ? new Map<string, string>()
        : this.deps.contactDirectory.findNames({ ids: [state.contactId], role }),
    ]);

    return {
      linkedCompanyName: state.companyId === null ? null : (companies.get(state.companyId) ?? null),
      linkedContactName: state.contactId === null ? null : (contacts.get(state.contactId) ?? null),
    };
  }
}

/**
 * Teklifin alanlarindan FATURANIN alanlari.
 *
 * ⚠️ Musteri adi KOPYALANIR, dizinden YENIDEN COZULMEZ (§1.5): teklif hangi ada
 * gonderildiyse fatura da o adi tasir. Yeniden cozulseydi, arada unvan
 * degistiren bir musteri iki belgede IKI FARKLI ad birakirdi ve hangisinin
 * dogru oldugu SORULAMAZDI.
 */
function toInvoiceFields(source: SalesDocumentState, now: Date): SalesDocumentFields {
  return {
    customerName: source.customerName,
    companyId: source.companyId,
    contactId: source.contactId,
    // ⚠️ Fatura BUGUN kesilir, teklifin tarihiyle DEGIL.
    issuedOn: toCalendarDay(now),
    validUntil: null,
    // Vade v1'de kullanicidan gelir; donusturme onu BOS birakir.
    dueOn: null,
    currency: source.currency,
    notes: source.notes,
  };
}

/** Var olan bir satirdan YENI bir satirin alanlari (id ve sira YENIDEN uretilir). */
function toLineFields(line: SalesDocumentLine): SalesDocumentLineFields {
  const state = line.toState();

  return {
    description: state.description,
    quantity: state.quantity,
    unit: state.unit,
    unitPrice: state.unitPrice,
    taxRate: state.taxRate,
  };
}

/** `Date` -> `YYYY-MM-DD` (UTC). */
function toCalendarDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Indirilen dosyanin adi.
 *
 * ⚠️ Numara yoksa (taslak) `taslak` yazilir — uydurulmus bir numara basmak,
 * henuz verilmemis bir numarayi VERILMIS gostermek olurdu.
 */
function buildFilename(view: SalesDocumentView): string {
  const prefix = view.document.kind === 'quote' ? 'teklif' : 'fatura';
  const suffix = view.document.number ?? 'taslak';

  return `${prefix}-${suffix}.pdf`;
}
