import { Injectable } from '@nestjs/common';

import { noteChunks } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import type { NoteChunkRepository } from '../application/note-chunk.repository.port';
import type { NoteChunk } from '../domain/note-chunk.entity';

/** `NoteChunkRepository`'nin Drizzle implementasyonu. */
@Injectable()
export class DrizzleNoteChunkRepository implements NoteChunkRepository {
  async saveAll(chunks: readonly NoteChunk[]): Promise<void> {
    if (chunks.length === 0) {
      // Bos govdeli not olamaz (domain reddeder), ama bos dizi ile cagrilmak
      // gecersiz SQL uretirdi; erken donmek daha durust.
      return;
    }

    const { db } = requireTransaction();

    // TEK insert: parcalar ya birlikte yazilir ya hic (T2 atomikligi).
    await db.insert(noteChunks).values(
      chunks.map((chunk) => ({
        id: chunk.id.value,
        tenantId: chunk.tenantId.value,
        noteId: chunk.noteId.value,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        // Drizzle `vector` kolonu `number[]` bekler; readonly diziyi kopyalar.
        embedding: [...chunk.embedding],
        createdAt: chunk.createdAt,
      })),
    );
  }
}
