import { check, index, integer, text, timestamp, unique, uuid, vector } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { knowledgeSchema } from './knowledge.schema';
import { notes } from './notes.schema';
import { tenants } from './tenants.schema';

/**
 * `knowledge.note_chunks` — embedding'in yasadigi yer (ADR-0029 §1).
 *
 * ============================================================================
 * NEDEN `notes`'TAN AYRI TABLO
 * ============================================================================
 * Embedding'in yasam dongusu note'unkinden BAGIMSIZDIR: model veya saglayici
 * degistiginde tum chunk'lar yeniden uretilir, `notes` degismez. Ayni ayrim
 * port sinirinda da uygulandi — `EmbeddingPort` ile `LLMPort` ayri port'lardir
 * (ADR-0030 §1.3).
 * ============================================================================
 */
export const noteChunks = knowledgeSchema.table(
  'note_chunks',
  {
    id: uuid('id').primaryKey(),

    /**
     * DENORMALIZE — `notes` ile JOIN yapmadan RLS politikasi calisabilsin.
     * Politika her satirda degerlendirilir; JOIN gerektiren bir politika hem
     * yavas hem kirilgan olurdu.
     */
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /** Not silinince chunk'lari da gider: chunk tek basina anlamsizdir. */
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),

    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),

    /**
     * 1536 = `text-embedding-3-small` cikti boyutu; canli API testiyle
     * DOGRULANDI (ADR-0029 "Not — canli API dogrulamasi"). Model degisirse bu
     * kolon ve TUM satirlar yeniden uretilir.
     */
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * HNSW — IVFFlat DEGIL (ADR-0029 §1). Veri buyudukce sorgu performansi daha
     * YUMUSAK bozunur; IVFFlat ayrica anlamli bir liste sayisi icin ONCEDEN
     * veri ister ve bos tabloda kurulamaz.
     *
     * `vector_cosine_ops`: OpenAI embedding'leri normalize edilmis vektorlerdir.
     *
     * Index tenant'a gore BOLUNMEZ; benzerlik aramasi RLS filtresinin ALTINDA
     * calisir.
     */
    index('note_chunks_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),

    index('note_chunks_note_id_idx').on(table.noteId),

    // Ayni not icinde ayni sira iki kez olamaz; yeniden uretim idempotent olsun.
    unique('note_chunks_note_index_unique').on(table.noteId, table.chunkIndex),

    check('note_chunks_index_non_negative', sql`chunk_index >= 0`),
    check('note_chunks_content_not_blank', sql`length(btrim(content)) > 0`),
  ],
);
