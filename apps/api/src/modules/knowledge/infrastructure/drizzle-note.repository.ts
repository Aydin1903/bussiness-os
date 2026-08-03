import { Injectable } from '@nestjs/common';

import { notes } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import type { NoteRepository } from '../application/note.repository.port';
import type { Note } from '../domain/note.entity';
import { toNoteRow } from './note.mapper';

/**
 * `NoteRepository`'nin Drizzle implementasyonu.
 *
 * Kendi transaction'ini ACMAZ: sinir use case'tedir (MT §13.3 kural 2). ADR-0029
 * §4'un T1/T2 ayrimi ancak boyle mumkun — repository kendi transaction'ini
 * acsaydi "embedding transaction disinda" garantisi kurulamazdi.
 */
@Injectable()
export class DrizzleNoteRepository implements NoteRepository {
  async save(note: Note): Promise<void> {
    const { db } = requireTransaction();

    await db.insert(notes).values(toNoteRow(note));
  }
}
