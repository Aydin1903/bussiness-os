import { Injectable } from '@nestjs/common';
import { asc, cosineDistance } from 'drizzle-orm';

import { noteChunks } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import type {
  NoteChunkSearch,
  SimilarChunk,
} from '../application/note-chunk-search.port';
import type { TenantId } from '../domain/tenant-id.value-object';

/**
 * `NoteChunkSearch`'un Drizzle + pgvector implementasyonu (ADR-0029 §4).
 *
 * ============================================================================
 * SORGUDA `WHERE tenant_id` YOK — ve bu BILINCLI
 * ============================================================================
 * Daraltmayi RLS yapar: `knowledge.note_chunks` `ENABLE` + `FORCE ROW LEVEL
 * SECURITY` tasir (migration 0011) ve politika
 * `tenant_id = current_setting('app.current_tenant_id')` der. Use case zaten
 * `runInCurrentTenantTransaction` icinde calisir, yani context kuruludur.
 *
 * Elle filtre eklemek iki sorun uretirdi:
 *   (a) korumanin RLS'te oldugu gercegini BULANIKLASTIRIR — okuyan biri "asil
 *       koruma hangisi" diye tereddut eder,
 *   (b) filtre bir gun unutulursa RLS'in hala koruyor oldugu FARK EDILMEZ ve
 *       yanlis bir guven duygusu olusur.
 * Tek koruma, tek yerde. Bunun gercekten calistigi entegrasyon testiyle
 * KANITLANIR (baska tenant'in notu kaynak olarak gelmiyor).
 * ============================================================================
 *
 * `cosineDistance` (`<=>`) HNSW index'iyle eslesir: index
 * `vector_cosine_ops` ile kuruldu (migration 0011). Farkli bir operator
 * kullanmak index'i DEVRE DISI birakirdi ve sorgu tam tarama yapardi.
 */
@Injectable()
export class DrizzleNoteChunkSearchRepository implements NoteChunkSearch {
  async findSimilar(input: {
    readonly tenantId: TenantId;
    readonly embedding: readonly number[];
    readonly limit: number;
  }): Promise<SimilarChunk[]> {
    const { db } = requireTransaction();

    const rows = await db
      .select({ content: noteChunks.content, noteId: noteChunks.noteId })
      .from(noteChunks)
      .orderBy(asc(cosineDistance(noteChunks.embedding, [...input.embedding])))
      .limit(input.limit);

    return rows;
  }
}
