import { check, index, integer, text, timestamp, unique, uuid, vector } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { crmSchema } from './crm.schema';
import { interactions } from './interactions.schema';
import { tenants } from './tenants.schema';

/**
 * `crm.interaction_chunks` — gorusmenin AI icin okunabilir hali.
 *
 * `content` BAGLAM BASLIGI tasir (`[Sirket · Tarih] ...`): bir gorusmenin
 * kimligi FK kolonundadir, metinde degil. Ayrintili gerekce migration
 * `0018`'de.
 */
export const interactionChunks = crmSchema.table(
  'interaction_chunks',
  {
    id: uuid('id').primaryKey(),
    /** DENORMALIZE: RLS politikasi JOIN'siz calissin. */
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    interactionId: uuid('interaction_id')
      .notNull()
      .references(() => interactions.id, { onDelete: 'cascade' }),

    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),

    /** 1536 = `text-embedding-3-small` cikti boyutu (canli olcumle dogrulandi). */
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /** Yeniden uretimi IDEMPOTENT kilar — ilk gunden (0011'in dersi). */
    unique('interaction_chunks_unique_index').on(table.interactionId, table.chunkIndex),
    check('interaction_chunks_index_positive', sql`${table.chunkIndex} >= 0`),
    index('interaction_chunks_tenant_idx').on(table.tenantId),
    index('interaction_chunks_embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
  ],
);
