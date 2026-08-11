import { check, index, integer, text, timestamp, unique, uuid, vector } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { financeCommentaries } from './finance-commentaries.schema';
import { financeSchema } from './finance.schema';
import { tenants } from './tenants.schema';

/**
 * `finance.commentary_chunks` — yorumun AI icin okunabilir hali.
 *
 * `content` BAGLAM BASLIGI tasir (`[Finansal yorum · Tarih] ...`).
 *
 * ⚠️ Basliktaki hicbir parca DENORMALIZE EDILMIS BIR AD DEGILDIR — `0018` ve
 * `0022`den onemli fark. Orada sirket/proje adi kopyalaniyordu ve yeniden
 * adlandirma parcalari bayatlatiyordu; burada baslik sabit bir etiket ve
 * kaydin kendi tarihidir. Yani bu moduldeki `reindex` YALNIZCA eksik parcalari
 * onarir, bayat ad tazelemez — bayatlayacak ad yoktur.
 */
export const financeCommentaryChunks = financeSchema.table(
  'commentary_chunks',
  {
    id: uuid('id').primaryKey(),
    /** DENORMALIZE: RLS politikasi JOIN'siz calissin. */
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    commentaryId: uuid('commentary_id')
      .notNull()
      .references(() => financeCommentaries.id, { onDelete: 'cascade' }),

    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),

    /** 1536 = `text-embedding-3-small` cikti boyutu. */
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /** Yeniden uretimi IDEMPOTENT kilar — ilk gunden (0011'in dersi). */
    unique('commentary_chunks_unique_index').on(table.commentaryId, table.chunkIndex),
    check('commentary_chunks_index_positive', sql`${table.chunkIndex} >= 0`),
    index('commentary_chunks_tenant_idx').on(table.tenantId),
    index('commentary_chunks_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
  ],
);
