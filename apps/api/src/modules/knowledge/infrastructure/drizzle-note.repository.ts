import { Injectable } from '@nestjs/common';
import { count, desc, sql } from 'drizzle-orm';

import { notes } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import type { NoteListPage, NoteRepository } from '../application/note.repository.port';
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

  /**
   * ⚠️ ONIZLEME VERITABANINDA KIRPILIR, uygulamada DEGIL.
   *
   * `substring(...)` ile: 500.000 karakterlik bir govdeyi ag uzerinden cekip
   * sonra JavaScript'te kesmek, tasarrufun tamamini kaybettirirdi. Kirpma
   * kaynagin yaninda yapilir.
   *
   * `bodyLength` AYRI secilir (`length(body)`) — istemci metnin kirpilip
   * kirpilmadigini bilmek zorunda, yoksa "…" ile biten gercek bir notu
   * kirpilmis sanar.
   *
   * `total` AYRI sorgudur: sayfadaki satir sayisi ile tenant'in toplam not
   * sayisi farkli sorulardir ve ikincisi olmadan istemci sayfalama kontrollerini
   * ciziemez.
   */
  async listForTenant(input: {
    readonly limit: number;
    readonly offset: number;
    readonly previewLength: number;
  }): Promise<NoteListPage> {
    const { db } = requireTransaction();

    const rows = await db
      .select({
        id: notes.id,
        title: notes.title,
        preview: sql<string>`substring(${notes.body} from 1 for ${input.previewLength})`,
        bodyLength: sql<number>`length(${notes.body})::int`,
        createdAt: notes.createdAt,
      })
      .from(notes)
      // Tie-breaker SART: ayni `created_at`'te sira kararsiz kalirdi ve
      // sayfalamada bir not iki kez ya da hic gorunmezdi.
      .orderBy(desc(notes.createdAt), desc(notes.id))
      .limit(input.limit)
      .offset(input.offset);

    const totals = await db.select({ value: count() }).from(notes);

    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        preview: row.preview,
        bodyLength: row.bodyLength,
        createdAt: row.createdAt,
      })),
      total: totals[0]?.value ?? 0,
    };
  }
}
