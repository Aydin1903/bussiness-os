import { check, index, integer, text, timestamp, unique, uuid, vector } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { progressNotes } from './progress-notes.schema';
import { projectsSchema } from './projects-schema.schema';
import { tenants } from './tenants.schema';

/**
 * `projects.progress_note_chunks` — notun AI icin okunabilir hali.
 *
 * `content` BAGLAM BASLIGI tasir (`[Proje · Tarih] ...`): bir notun kimligi FK
 * kolonundadir, metinde degil. Ayrintili gerekce migration `0022`'de.
 */
export const progressNoteChunks = projectsSchema.table(
  'progress_note_chunks',
  {
    id: uuid('id').primaryKey(),
    /** DENORMALIZE: RLS politikasi JOIN'siz calissin. */
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    progressNoteId: uuid('progress_note_id')
      .notNull()
      .references(() => progressNotes.id, { onDelete: 'cascade' }),

    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),

    /** 1536 = `text-embedding-3-small` cikti boyutu. */
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /** Yeniden uretimi IDEMPOTENT kilar — ilk gunden (0011'in dersi). */
    unique('progress_note_chunks_unique_index').on(table.progressNoteId, table.chunkIndex),
    check('progress_note_chunks_index_positive', sql`${table.chunkIndex} >= 0`),
    index('progress_note_chunks_tenant_idx').on(table.tenantId),
    index('progress_note_chunks_embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
  ],
);
