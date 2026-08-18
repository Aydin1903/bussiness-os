import { Injectable } from '@nestjs/common';
import { and, asc, cosineDistance, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';

import { documentChunks, documents } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import {
  type DocumentRepository,
  type DocumentWithChunkCount,
  type ListPage,
  type SimilarDocumentChunk,
  type UnindexedDocument,
} from '../application/document.repository.port';
import { Document, type DocumentChunk, type DocumentMimeType } from '../domain/document.entity';
import { UnsupportedDocumentTypeError } from '../domain/documents.error';
import { SUPPORTED_MIME_TYPES } from '../domain/document.entity';

/**
 * ⚠️ ACIK KOLON PROJEKSIYONU — `select()` (yani `SELECT *`) KULLANILMIYOR.
 *
 * `documents.documents` VEKTOR TASIMAZ (o `document_chunks`ta), yani buradaki
 * gerekce `DrizzleAppointmentRepository`ninkinden FARKLIDIR: acik projeksiyon,
 * entity'nin tasimadigi bir kolonun ileride sessizce eklenmesini onler.
 */
const COLUMNS = {
  id: documents.id,
  tenantId: documents.tenantId,
  originalFilename: documents.originalFilename,
  storageKey: documents.storageKey,
  mimeType: documents.mimeType,
  sizeBytes: documents.sizeBytes,
  label: documents.label,
  crmContactId: documents.crmContactId,
  projectId: documents.projectId,
  createdByUserId: documents.createdByUserId,
  createdAt: documents.createdAt,
  updatedAt: documents.updatedAt,
};

/**
 * `DocumentRepository`'nin Drizzle implementasyonu.
 *
 * SORGULARDA `WHERE tenant_id` YOK — daraltmayi RLS yapar (migration `0027`,
 * `0028`). Gerekce port dosyasindadir; burada tekrarlanmaz.
 *
 * ⚠️ BU KORUMA NESNE DEPOSUNA UZANMAZ: `storage_key` buradan okunur ve
 * `StoragePort`a oyle verilir. Oradaki izolasyon RLS'e degil ANAHTAR DUZENINE
 * dayanir (ADR-0037 §5.2).
 */
@Injectable()
export class DrizzleDocumentRepository implements DocumentRepository {
  async save(document: Document): Promise<void> {
    const { db } = requireTransaction();
    const state = document.toState();

    // Tek deyimlik UPSERT: `create`, `update` ve `replaceFile` ayni yolu
    // kullanir.
    await db
      .insert(documents)
      .values(state)
      .onConflictDoUpdate({
        target: documents.id,
        set: {
          originalFilename: state.originalFilename,
          storageKey: state.storageKey,
          mimeType: state.mimeType,
          sizeBytes: state.sizeBytes,
          label: state.label,
          crmContactId: state.crmContactId,
          projectId: state.projectId,
          updatedAt: state.updatedAt,
        },
      });
  }

  async findById(id: string): Promise<Document | null> {
    const { db } = requireTransaction();
    const rows = await db.select(COLUMNS).from(documents).where(eq(documents.id, id)).limit(1);

    const row = rows[0];
    return row === undefined ? null : toDocument(row);
  }

  async findRowById(id: string): Promise<DocumentWithChunkCount | null> {
    const { db } = requireTransaction();

    const rows = await db
      .select({ ...COLUMNS, chunkCount: chunkCountExpression() })
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : { document: toDocument(row), chunkCount: row.chunkCount };
  }

  async list(input: {
    limit: number;
    offset: number;
    label: string | null;
    crmContactId: string | null;
    projectId: string | null;
  }): Promise<ListPage<DocumentWithChunkCount>> {
    const { db } = requireTransaction();

    // ⚠️ Filtre HEM sayfaya HEM sayaca uygulanir. Yalnizca sayfaya
    // uygulansaydi `total` filtrelenmemis toplami dondururdu ve arayuzun
    // sayfalayicisi var olmayan sayfalar gosterirdi (`DrizzleProjectRepository
    // .list`te ogrenilen ayni ders).
    const conditions: SQL[] = [];

    if (input.label !== null) {
      // ⚠️ BUYUK-KUCUK HARF DUYARSIZ (ADR-0037 §2c): etiket SERBEST metindir ve
      // "Sozlesme" ile "sozlesme" ayni sey sayilir.
      //
      // ⚠️ `lower(...)` migration `0027`nin `documents_tenant_label_idx`
      // index'iyle BIREBIR eslesmek zorunda; ayrisirlarsa hata SESSIZDIR —
      // sonuc dogru doner, sorgu TAM TARAMA yapar.
      conditions.push(sql`lower(${documents.label}) = lower(${input.label})`);
    }
    if (input.crmContactId !== null) {
      conditions.push(eq(documents.crmContactId, input.crmContactId));
    }
    if (input.projectId !== null) {
      conditions.push(eq(documents.projectId, input.projectId));
    }

    const filter = conditions.length === 0 ? undefined : and(...conditions);

    // ⚠️ EN YENI ONCE (`desc`): belge listesi bir ARSIVDIR ve "en son ne
    // yukledim" birincil sorudur — `appointments`in `asc` sirasindan
    // (takvim) bilincli fark, `finance.commentaries` ile ayni yon.
    //
    // `id` TIE-BREAKER: ayni ana dusen iki yukleme mumkundur ve kararsiz
    // siralama, sayfalamada bir kaydin iki kez ya da HIC gorunmesi demektir.
    const rows = await db
      .select({ ...COLUMNS, chunkCount: chunkCountExpression() })
      .from(documents)
      .where(filter)
      .orderBy(desc(documents.createdAt), asc(documents.id))
      .limit(input.limit)
      .offset(input.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(documents)
      .where(filter);

    return {
      items: rows.map((row) => ({ document: toDocument(row), chunkCount: row.chunkCount })),
      total: counted?.total ?? 0,
    };
  }

  async deleteById(id: string): Promise<number> {
    const { db } = requireTransaction();

    // Parcalar `ON DELETE CASCADE` ile gider (migration `0028`).
    // ⚠️ R2'deki nesne GITMEZ — onu use case siler ve SIRA onemlidir
    // (ADR-0037 §5.3).
    const deleted = await db
      .delete(documents)
      .where(eq(documents.id, id))
      .returning({ id: documents.id });

    return deleted.length;
  }

  async deleteChunks(documentId: string): Promise<void> {
    const { db } = requireTransaction();
    await db.delete(documentChunks).where(eq(documentChunks.documentId, documentId));
  }

  async saveChunks(chunks: readonly DocumentChunk[]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    const { db } = requireTransaction();

    await db.insert(documentChunks).values(
      chunks.map((chunk) => {
        const state = chunk.toState();
        return {
          id: state.id,
          tenantId: state.tenantId,
          documentId: state.documentId,
          chunkIndex: state.chunkIndex,
          content: state.content,
          // Drizzle `vector` kolonu `number[]` ister; port `readonly` sozu
          // veriyor ve burada kopyalanarak aciliyor.
          embedding: [...state.embedding],
        };
      }),
    );
  }

  async findUnindexed(limit: number): Promise<UnindexedDocument[]> {
    const { db } = requireTransaction();

    // ⚠️ IS LISTESI TURETILMISTIR — ayri bir "onarilacaklar" tablosu YOK.
    //
    // ⚠️ BU LISTE TARANMIS BELGELERI DE ICERIR ve bu KACINILMAZDIR: veritabani
    // "parcasi yok" ile "parcasi OLAMAZ" arasindaki farki bilemez (gerekce
    // `UnindexedDocument`ta).
    const rows = await db
      .select({
        documentId: documents.id,
        storageKey: documents.storageKey,
        originalFilename: documents.originalFilename,
        label: documents.label,
        mimeType: documents.mimeType,
      })
      .from(documents)
      .leftJoin(documentChunks, eq(documentChunks.documentId, documents.id))
      .where(isNull(documentChunks.id))
      // En eski once: onarim kuyrugu FIFO'dur, yoksa buyuk bir birikimde ayni
      // satirlar tekrar tekrar secilebilirdi.
      .orderBy(asc(documents.createdAt), asc(documents.id))
      .limit(limit);

    return rows;
  }

  async findSimilarChunks(input: {
    embedding: readonly number[];
    limit: number;
  }): Promise<SimilarDocumentChunk[]> {
    const { db } = requireTransaction();

    // Siralama `cosineDistance` ARTAN — yani en YAKIN once. Operator migration
    // `0028`in `vector_cosine_ops` HNSW index'iyle eslesmek ZORUNDA; aksi halde
    // index devre disi kalir ve sorgu tam tarama yapar (sessiz bir performans
    // coku).
    //
    // ⚠️ `IS NOT NULL` suzgeci GEREKMEZ: kolon `NOT NULL` (migration `0028`).
    // `appointments`tan fark — orada vektorsuz satir mesruydu.
    return db
      .select({
        documentId: documentChunks.documentId,
        content: documentChunks.content,
      })
      .from(documentChunks)
      .orderBy(asc(cosineDistance(documentChunks.embedding, [...input.embedding])))
      .limit(input.limit);
  }
}

/**
 * Belge basina parca sayisi — ILISKILI ALT SORGU.
 *
 * ⚠️ `LEFT JOIN` + `GROUP BY` DEGIL: gruplama, projeksiyondaki on iki kolonun
 * hepsini `GROUP BY`a yazmayi (ya da `DISTINCT ON` kullanmayi) gerektirirdi ve
 * yeni bir kolon eklendiginde UNUTULMASI kolay bir yer olurdu. Alt sorgu
 * projeksiyondan BAGIMSIZDIR.
 */
function chunkCountExpression(): SQL<number> {
  return sql<number>`(
    SELECT count(*)::int
    FROM ${documentChunks}
    WHERE ${documentChunks.documentId} = ${documents.id}
  )`;
}

/** Satiri entity'ye cevirir; `mimeType` daraltmasi tek yerde yapilir. */
function toDocument(row: {
  id: string;
  tenantId: string;
  originalFilename: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  label: string | null;
  crmContactId: string | null;
  projectId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Document {
  return Document.fromPersistence({
    ...row,
    mimeType: toMimeType(row.mimeType),
    // ⚠️ Kolon NULLABLE ama entity zorunlu tutuyor. Ayrim kasitli: yazma yolu
    // kimligi HER ZAMAN doldurur, ama kolon `platform.users`a FK VEREMEZ
    // (Mutlak Kural 5) ve ileride bir ithalat betigi bos birakabilir. Bos dize,
    // "kim yukledi" sorusuna "bilinmiyor" cevabidir — uydurulmus bir kullanici
    // id'si degil.
    createdByUserId: row.createdByUserId ?? '',
  });
}

/**
 * Veritabani `text` doner; birlesim tipine daraltilir.
 *
 * Tip ZORLAMASI (`as`) kullanilmaz (DEVELOPMENT_RULES 2.3): zorlamak, CHECK
 * kisiti bir gun degisirse bozuk bir degeri gecerli gosterirdi.
 *
 * Pratikte ULASILMAZ: satir migration `0027`nin `documents_mime_type_allowed`
 * CHECK kisitindan gecmistir. Savunma katmani — `toStatus` / `toDirection` ile
 * birebir ayni desen.
 */
function toMimeType(value: string): DocumentMimeType {
  const known = SUPPORTED_MIME_TYPES.find((mime) => mime === value);

  if (known === undefined) {
    throw new UnsupportedDocumentTypeError();
  }

  return known;
}
