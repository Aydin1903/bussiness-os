import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';

import {
  invoicingNumberSequences,
  salesDocumentLines,
  salesDocuments,
} from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import {
  type InvoicingRepository,
  type ListPage,
  type OpenQuoteCount,
  type PipelineQuote,
  type PipelineSnapshot,
} from '../application/invoicing.repository.port';
import { SalesDocumentLine } from '../domain/sales-document-line.entity';
import {
  SalesDocument,
  type SalesDocumentKind,
  type SalesDocumentStatus,
} from '../domain/sales-document.entity';

/**
 * ⚠️ ACIK KOLON PROJEKSIYONU — `select()` (yani `SELECT *`) KULLANILMIYOR.
 *
 * Bu semada VEKTOR YOK (ADR-0041 §5), yani onceki modullerdeki "6 KB'lik
 * `embedding`i bosuna cekme" gerekcesi burada GECERSIZDIR. Acik projeksiyon
 * yine de korunuyor ve sebebi TUTARLILIK degil, ILERIDEKI BIR KOLON: entity'nin
 * tasimadigi bir alan eklendiginde `SELECT *` onu SESSIZCE cekmeye baslar ve
 * `fromPersistence` beklenmedik bir sekle bakar.
 */
const DOCUMENT_COLUMNS = {
  id: salesDocuments.id,
  tenantId: salesDocuments.tenantId,
  kind: salesDocuments.kind,
  status: salesDocuments.status,
  number: salesDocuments.number,
  companyId: salesDocuments.companyId,
  contactId: salesDocuments.contactId,
  customerName: salesDocuments.customerName,
  issuedOn: salesDocuments.issuedOn,
  validUntil: salesDocuments.validUntil,
  dueOn: salesDocuments.dueOn,
  currency: salesDocuments.currency,
  notes: salesDocuments.notes,
  convertedFromId: salesDocuments.convertedFromId,
  createdByUserId: salesDocuments.createdByUserId,
  sentAt: salesDocuments.sentAt,
  sentByUserId: salesDocuments.sentByUserId,
  decidedAt: salesDocuments.decidedAt,
  decidedByUserId: salesDocuments.decidedByUserId,
  createdAt: salesDocuments.createdAt,
  updatedAt: salesDocuments.updatedAt,
} as const;

const LINE_COLUMNS = {
  id: salesDocumentLines.id,
  tenantId: salesDocumentLines.tenantId,
  documentId: salesDocumentLines.documentId,
  position: salesDocumentLines.position,
  description: salesDocumentLines.description,
  quantity: salesDocumentLines.quantity,
  unit: salesDocumentLines.unit,
  unitPrice: salesDocumentLines.unitPrice,
  taxRate: salesDocumentLines.taxRate,
  createdAt: salesDocumentLines.createdAt,
} as const;

/** Yapisal katkida gorunecek alanlar — SATIRLAR AYRICA yuklenir. */
const PIPELINE_COLUMNS = {
  id: salesDocuments.id,
  number: salesDocuments.number,
  customerName: salesDocuments.customerName,
  currency: salesDocuments.currency,
  issuedOn: salesDocuments.issuedOn,
  validUntil: salesDocuments.validUntil,
} as const;

/**
 * `invoicing` semasinin Drizzle uygulamasi (ADR-0041).
 *
 * ⚠️ HICBIR SORGUDA `tenant_id` FILTRESI YOKTUR: daraltmayi RLS yapar
 * (migration `0031`, `ENABLE` + `FORCE`) ve cagiran zaten tenant
 * transaction'i icindedir. Tek istisna `claimNextNumber`in INSERT'udur —
 * orada `tenant_id` bir DEGER olarak yazilmak zorundadir (kolon `NOT NULL`).
 */
@Injectable()
export class DrizzleInvoicingRepository implements InvoicingRepository {
  // ==========================================================================
  // Belge
  // ==========================================================================

  async saveDocument(document: SalesDocument): Promise<void> {
    const { db } = requireTransaction();
    const state = document.toState();

    // Tek deyimlik UPSERT: `create` ve her durum gecisi ayni yolu kullanir.
    await db
      .insert(salesDocuments)
      .values(state)
      .onConflictDoUpdate({
        target: salesDocuments.id,
        set: {
          // ⚠️ `kind` GUNCELLENMEZ ve bu bilincli: bir belgenin turu
          // degistirilemez. Listeye konsaydi, "faturaya donustur"un YENI KAYIT
          // uretme karari (§3) tek bir `UPDATE` ile atlanabilir hale gelirdi.
          status: state.status,
          number: state.number,
          companyId: state.companyId,
          contactId: state.contactId,
          customerName: state.customerName,
          issuedOn: state.issuedOn,
          validUntil: state.validUntil,
          dueOn: state.dueOn,
          currency: state.currency,
          notes: state.notes,
          sentAt: state.sentAt,
          sentByUserId: state.sentByUserId,
          decidedAt: state.decidedAt,
          decidedByUserId: state.decidedByUserId,
          updatedAt: state.updatedAt,
        },
      });
  }

  async findDocumentById(input: {
    id: string;
    kind: SalesDocumentKind;
  }): Promise<SalesDocument | null> {
    const { db } = requireTransaction();

    const rows = await db
      .select(DOCUMENT_COLUMNS)
      .from(salesDocuments)
      // ⚠️ `kind` SORGUNUN ICINDE: yanlis turde bir id `null` doner ve cagiran
      // onu 404'e cevirir. Sorgudan sonra kontrol edilseydi, "var ama yanlis
      // tur" ile "yok" ayirt edilebilir hale gelirdi ve bu bir SIZINTI olurdu
      // (`quote:read` ile `invoice:read` AYRI izinlerdir).
      .where(and(eq(salesDocuments.id, input.id), eq(salesDocuments.kind, input.kind)))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toDocument(row);
  }

  async listDocuments(input: {
    kind: SalesDocumentKind;
    status: SalesDocumentStatus | null;
    limit: number;
    offset: number;
  }): Promise<ListPage<SalesDocument>> {
    const { db } = requireTransaction();

    const filter =
      input.status === null
        ? eq(salesDocuments.kind, input.kind)
        : and(eq(salesDocuments.kind, input.kind), eq(salesDocuments.status, input.status));

    const rows = await db
      .select(DOCUMENT_COLUMNS)
      .from(salesDocuments)
      .where(filter)
      // En yeni once — bir belge akisi (`finance.transactions` sinifi).
      .orderBy(desc(salesDocuments.issuedOn), desc(salesDocuments.createdAt))
      .limit(input.limit)
      .offset(input.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(salesDocuments)
      .where(filter);

    return { items: rows.map(toDocument), total: counted?.total ?? 0 };
  }

  async deleteDocumentById(id: string): Promise<number> {
    const { db } = requireTransaction();

    const deleted = await db
      .delete(salesDocuments)
      .where(eq(salesDocuments.id, id))
      .returning({ id: salesDocuments.id });

    return deleted.length;
  }

  // ==========================================================================
  // Satirlar
  // ==========================================================================

  /**
   * ⚠️ SIL + YAZ — tek tek `UPDATE` DEGIL.
   *
   * Satirlar bir KUMEDIR: kullanici bir satiri silip digerinin sirasini
   * degistirdiginde, id bazli bir eslestirme yazmak (hangi satir hangisiyle
   * eslesiyor) istemciye ait olmayan bir bilgi gerektirirdi.
   *
   * ⚠️ Bu metot `draft` OLMAYAN bir belgede cagrilirsa VERITABANI TRIGGER'I
   * reddeder — uygulama kontrolu (`assertEditable`) atlansa bile. Ucuncu katman
   * tam olarak bunun icin var (§2).
   */
  async replaceLines(input: {
    documentId: string;
    lines: readonly SalesDocumentLine[];
  }): Promise<void> {
    const { db } = requireTransaction();

    await db.delete(salesDocumentLines).where(eq(salesDocumentLines.documentId, input.documentId));

    if (input.lines.length === 0) {
      return;
    }

    await db.insert(salesDocumentLines).values(input.lines.map((line) => line.toState()));
  }

  async listLines(documentId: string): Promise<SalesDocumentLine[]> {
    const { db } = requireTransaction();

    const rows = await db
      .select(LINE_COLUMNS)
      .from(salesDocumentLines)
      .where(eq(salesDocumentLines.documentId, documentId))
      .orderBy(asc(salesDocumentLines.position));

    return rows.map((row) => SalesDocumentLine.fromPersistence(row));
  }

  async listLinesByDocumentIds(ids: readonly string[]): Promise<Map<string, SalesDocumentLine[]>> {
    const grouped = new Map<string, SalesDocumentLine[]>();

    // Bos dizi gecerlidir ve SORGU ACILMAZ (`findNames` deseninin ayni kurali).
    if (ids.length === 0) {
      return grouped;
    }

    const { db } = requireTransaction();
    const rows = await db
      .select(LINE_COLUMNS)
      .from(salesDocumentLines)
      .where(inArray(salesDocumentLines.documentId, [...ids]))
      .orderBy(asc(salesDocumentLines.position));

    for (const row of rows) {
      const bucket = grouped.get(row.documentId) ?? [];
      bucket.push(SalesDocumentLine.fromPersistence(row));
      grouped.set(row.documentId, bucket);
    }

    return grouped;
  }

  // ==========================================================================
  // Belge numarasi (§1.6)
  // ==========================================================================

  /**
   * ⚠️ `SELECT ... FOR UPDATE` — ADR-0039 §3.2'nin kilit deseninin IKINCI
   * uygulamasi.
   *
   * Sira onemlidir ve bir yaris kosulunu kapatir:
   *
   *   1. Satir YOKSA olustur (`onConflictDoNothing` — iki es zamanli istek
   *      ayni anda olusturmaya calisabilir ve ikincisi sessizce gecmelidir),
   *   2. Satiri KILITLE ve oku,
   *   3. Sayaci ilerlet.
   *
   * ⚠️ Kilit YALNIZCA cagiranin transaction'i suresince tutulur ve o
   * transaction icinde AG CAGRISI YOKTUR — PDF uretimi de embedding de bu
   * yolun disindadir.
   */
  async claimNextNumber(kind: SalesDocumentKind): Promise<number> {
    const { db, tenantId } = requireTransaction();

    if (tenantId === null) {
      // ⚠️ Ulasılamaz: tenant'siz bir akis bu module hic girmez. Yine de acikca
      // patlar — sessizce `''` yazmak, RLS'in reddedecegi bir satir uretir ve
      // hata anlasilmaz bir yerde cikar.
      throw new Error('Belge numarasi tenant context olmadan uretilemez.');
    }

    await db
      .insert(invoicingNumberSequences)
      .values({ tenantId, kind, nextValue: 1 })
      .onConflictDoNothing();

    const [locked] = await db
      .select({ nextValue: invoicingNumberSequences.nextValue })
      .from(invoicingNumberSequences)
      .where(eq(invoicingNumberSequences.kind, kind))
      .limit(1)
      .for('update');

    const value = locked?.nextValue ?? 1;

    await db
      .update(invoicingNumberSequences)
      .set({ nextValue: value + 1, updatedAt: new Date() })
      .where(eq(invoicingNumberSequences.kind, kind));

    return value;
  }

  // ==========================================================================
  // Yapisal katki (§4)
  // ==========================================================================

  async snapshotPipeline(input: {
    today: string;
    staleBefore: Date;
    limit: number;
  }): Promise<PipelineSnapshot> {
    const [acceptedNotInvoiced, expired, stale, openCounts] = await Promise.all([
      this.#acceptedNotInvoiced(input.limit),
      this.#expiredQuotes(input.today, input.limit),
      this.#staleQuotes(input, input.limit),
      this.#openQuoteCounts(),
    ]);

    return { acceptedNotInvoiced, expired, stale, openCounts };
  }

  /**
   * ⚠️ EN AGIR SINIF (0.95): kabul edilmis ama FATURALANMAMIS teklif — para
   * masada duruyor.
   *
   * `NOT EXISTS` bir alt sorgudur ve `sales_documents_tenant_converted_from_idx`
   * kismi index'i tam olarak bunun icin acildi. ⚠️ Alt sorgu da RLS altindadir:
   * BASKA BIR TENANT'IN faturasi bu teklifi "faturalanmis" GOSTEREMEZ.
   */
  async #acceptedNotInvoiced(limit: number): Promise<PipelineQuote[]> {
    const { db } = requireTransaction();

    const rows = await db
      .select(PIPELINE_COLUMNS)
      .from(salesDocuments)
      .where(
        and(
          eq(salesDocuments.kind, 'quote'),
          eq(salesDocuments.status, 'accepted'),
          sql`NOT EXISTS (
            SELECT 1 FROM ${salesDocuments} AS inv
             WHERE inv.converted_from_id = ${salesDocuments.id}
          )`,
        ),
      )
      .orderBy(desc(salesDocuments.issuedOn))
      .limit(limit);

    return rows;
  }

  /** Gecerlilik tarihi gecmis, hala `sent` (0.95) — cevap gelmedi ve GELEMEZ. */
  async #expiredQuotes(today: string, limit: number): Promise<PipelineQuote[]> {
    const { db } = requireTransaction();

    const rows = await db
      .select(PIPELINE_COLUMNS)
      .from(salesDocuments)
      .where(
        and(
          eq(salesDocuments.kind, 'quote'),
          eq(salesDocuments.status, 'sent'),
          isNotNull(salesDocuments.validUntil),
          lt(salesDocuments.validUntil, today),
        ),
      )
      .orderBy(asc(salesDocuments.validUntil))
      .limit(limit);

    return rows;
  }

  /**
   * N gundur cevapsiz (0.90).
   *
   * ⚠️ "Suresi dolmus" olanlar BURADAN CIKARILIR: bir teklif iki bantta birden
   * gorunseydi ayni belge cevapta IKI KEZ yer alir ve top-K havuzunda IKI YUVA
   * harcardi — ustelik biri 0.95 digeri 0.90 skorla, yani "daha az acil"
   * kopyasi da girerdi.
   */
  async #staleQuotes(
    input: { today: string; staleBefore: Date },
    limit: number,
  ): Promise<PipelineQuote[]> {
    const { db } = requireTransaction();

    const rows = await db
      .select(PIPELINE_COLUMNS)
      .from(salesDocuments)
      .where(
        and(
          eq(salesDocuments.kind, 'quote'),
          eq(salesDocuments.status, 'sent'),
          lt(salesDocuments.sentAt, input.staleBefore),
          or(
            isNull(salesDocuments.validUntil),
            sql`${salesDocuments.validUntil} >= ${input.today}`,
          ),
        ),
      )
      .orderBy(asc(salesDocuments.sentAt))
      .limit(limit);

    return rows;
  }

  /**
   * Acik tekliflerin para birimi bazinda SAYIMI (0.75).
   *
   * ⚠️ SAYIM, TOPLAM DEGIL — ve bu ADR-0041 §4.1'den BILINCLI bir daraltmadir.
   * Tutar SQL'de toplansaydi, satir bazinda yuvarlama kurali
   * (`document-money.ts`) IKINCI KEZ — bu sefer SQL'de — yazilmis olurdu. Iki
   * aritmetik uygulama zamanla AYRISIR ve hata SESSIZDIR: belgede yazan toplam
   * ile katkida yazan toplam farkli olur, IKISI DE "dogru" gorunur.
   *
   * Uc ALARM kumesi tutar TASIR cunku onlar SINIRLIDIR (`limit`): satirlari
   * gercekten yuklenir ve toplam AYNI domain fonksiyonuyla hesaplanir.
   */
  async #openQuoteCounts(): Promise<OpenQuoteCount[]> {
    const { db } = requireTransaction();

    const rows = await db
      .select({ currency: salesDocuments.currency, count: sql<number>`count(*)::int` })
      .from(salesDocuments)
      .where(and(eq(salesDocuments.kind, 'quote'), eq(salesDocuments.status, 'sent')))
      .groupBy(salesDocuments.currency)
      .orderBy(asc(salesDocuments.currency));

    return rows.map((row) => ({ currency: row.currency, count: row.count }));
  }
}

/** `DOCUMENT_COLUMNS` projeksiyonunun ham sekli. */
interface DocumentRow {
  id: string;
  tenantId: string;
  kind: string;
  status: string;
  number: string | null;
  companyId: string | null;
  contactId: string | null;
  customerName: string;
  issuedOn: string;
  validUntil: string | null;
  dueOn: string | null;
  currency: string;
  notes: string | null;
  convertedFromId: string | null;
  createdByUserId: string;
  sentAt: Date | null;
  sentByUserId: string | null;
  decidedAt: Date | null;
  decidedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const KINDS: readonly SalesDocumentKind[] = ['quote', 'invoice'];
const STATUSES: readonly SalesDocumentStatus[] = [
  'draft',
  'sent',
  'accepted',
  'rejected',
  'issued',
  'cancelled',
];

/**
 * Satiri entity'ye cevirir.
 *
 * ⚠️ `kind` ve `status` veritabaninda `text`tir; CHECK kisitlari onlari
 * daraltir. Burada TIP ZORLAMASI (`as`) DEGIL, GERCEK BIR ARAMA yapiliyor ve
 * bu bir formalite degil: bir tip zorlamasi, kisitlarin bir gun gevsemesi
 * durumunda gecersiz bir degeri SESSIZCE entity'ye tasirdi. Arama, ayni
 * durumda ACIKCA patlar.
 */
function toDocument(row: DocumentRow): SalesDocument {
  return SalesDocument.fromPersistence({
    ...row,
    kind: narrow(KINDS, row.kind, 'kind'),
    status: narrow(STATUSES, row.status, 'status'),
  });
}

/** Bilinen degerler arasinda arar; bulamazsa PATLAR (sessiz kabul yok). */
function narrow<T extends string>(allowed: readonly T[], value: string, field: string): T {
  const found = allowed.find((candidate) => candidate === value);

  if (found === undefined) {
    throw new Error(`invoicing.sales_documents.${field} beklenmedik deger tasiyor: ${value}`);
  }

  return found;
}
