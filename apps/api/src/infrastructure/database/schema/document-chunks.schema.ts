import { check, index, integer, text, timestamp, unique, uuid, vector } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { documents } from './documents.schema';
import { documentsSchema } from './documents-schema.schema';
import { tenants } from './tenants.schema';

/**
 * `documents.document_chunks` — belgenin AI icin okunabilir hali (ADR-0037 §3).
 *
 * ============================================================================
 * ⚠️ CHUNK TABLOSU GERI DONDU — bir onceki modulun kararinin TAM TERSI
 * ============================================================================
 * Randevu (`0026`) bunu bilincli olarak REDDETMISTI; vektor satirin kendi
 * kolonundaydi. Iki karar CELISMIYOR — ayni olcut (metnin ust sinirini KIM
 * belirliyor) iki farkli cevap veriyor. Randevu notunun siniri BIZIMDI ve
 * `TARGET_CHUNK_CHARS`'a esitlenmisti; bir sozlesmenin siniri DOSYANINDIR.
 *
 * `content` BAGLAM BASLIGI tasir:
 *     [Belge · Ofis Kira Sozlesmesi 2026.pdf · sozlesme] ...
 *
 * ⚠️ BASLIKTA BAGLI VARLIK ADI YOKTUR — `0018`/`0022`den (sirket/proje adi) ve
 * `0026`dan (kisi adi) BILINCLI SAPMA. Belgenin IKI opsiyonel baglantisi var
 * (§4); ikisini birden koymak ADR-0033'un "yalnizca bir ad" kuralini ihlal
 * eder, birini secmek KEYFIDIR. Ucuncu yol secildi: hicbiri. Yerine konan
 * `original_filename` kaydin KENDI kolonudur ve HICBIR ZAMAN bayatlamaz.
 *
 * ⚠️ `embedding` `NOT NULL` — `appointments.embedding`den fark. Orada vektorsuz
 * satir mesruydu (notsuz randevu); burada bir parca yalnizca gomulmek icin
 * uretilir. "Metni cikarilamamis belge" (taranmis PDF, §6.3) bu tabloda SIFIR
 * SATIRLA ifade edilir — vektorsuz bir satirla degil.
 *
 * ⚠️ `ON DELETE CASCADE` retention kolunu belirler (ROADMAP §8.5): dogru kol
 * `documents.documents`tir. Ayni cascade, §7'nin "yeni dosya eskisini
 * degistirir" karariniin da mekanigidir.
 */
export const documentChunks = documentsSchema.table(
  'document_chunks',
  {
    id: uuid('id').primaryKey(),
    /** DENORMALIZE: RLS politikasi JOIN'siz calissin. */
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),

    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),

    /** 1536 = `text-embedding-3-small` cikti boyutu. */
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * Yeniden uretimi IDEMPOTENT kilar — ilk gunden (`0011`'in dersi, besinci
     * kez). ⚠️ TENANT-SCOPED (ADR-0037 §1): `document_id` zaten benzersiz oldugu
     * icin teknik olarak gereksiz, ama unique kisitlar bu projede DAIMA
     * tenant-scoped yazilir (MT §12.3).
     */
    unique('document_chunks_unique_index').on(table.tenantId, table.documentId, table.chunkIndex),
    check('document_chunks_index_positive', sql`${table.chunkIndex} >= 0`),
    index('document_chunks_tenant_idx').on(table.tenantId),
    index('document_chunks_document_idx').on(table.documentId),
    index('document_chunks_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
  ],
);
