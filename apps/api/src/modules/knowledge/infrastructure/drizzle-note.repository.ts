import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

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

  /**
   * Tek sabit sutun secilir (`1`), not govdesi DEGIL: sorunun cevabi
   * "satir var mi"dir ve bir notun tam metnini ag uzerinden tasimak gereksiz.
   */
  async existsForTenant(): Promise<boolean> {
    const { db } = requireTransaction();

    const rows = await db
      .select({ one: sql<number>`1` })
      .from(notes)
      .limit(1);

    return rows.length > 0;
  }
}
