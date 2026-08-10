import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';

import {
  progressNoteChunks,
  progressNotes,
  projects,
  tasks,
} from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import {
  type ProgressNoteRepository,
  type UnindexedProgressNote,
} from '../application/progress-note.repository.port';
import { type ListPage } from '../application/project.repository.port';
import { ProgressNote, type ProgressNoteChunk } from '../domain/progress-note.entity';

/** RLS notu: bkz. `DrizzleProjectRepository`. */
@Injectable()
export class DrizzleProgressNoteRepository implements ProgressNoteRepository {
  async saveNote(note: ProgressNote): Promise<void> {
    const { db } = requireTransaction();
    await db.insert(progressNotes).values(note.toState());
  }

  /**
   * Parcalari TEK deyimde yazar.
   *
   * `onConflictDoNothing` KULLANILMAZ: `UNIQUE (progress_note_id, chunk_index)`
   * ihlali BASTIRILMAMALIDIR. Es zamanli iki onarimda ikincisi hata almali ve o
   * not `failed` sayilmalidir; sessizce gecmek, yarim yazilmis bir parca
   * kumesini "basarili" gostermek olurdu.
   */
  async saveChunks(chunks: readonly ProgressNoteChunk[]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    const { db } = requireTransaction();
    await db.insert(progressNoteChunks).values(
      chunks.map((chunk) => {
        const state = chunk.toState();
        return { ...state, embedding: [...state.embedding] };
      }),
    );
  }

  async list(input: {
    limit: number;
    offset: number;
    projectId: string | null;
    taskId: string | null;
  }): Promise<ListPage<ProgressNote>> {
    const { db } = requireTransaction();

    const filters: SQL[] = [];
    if (input.projectId !== null) filters.push(eq(progressNotes.projectId, input.projectId));
    if (input.taskId !== null) filters.push(eq(progressNotes.taskId, input.taskId));
    const where = filters.length === 0 ? undefined : and(...filters);

    const rows = await db
      .select()
      .from(progressNotes)
      .where(where)
      // En yeni not once. `id` tie-breaker: ayni anda iki not olagandir ve
      // kararsiz siralama sayfalamayi bozar.
      .orderBy(desc(progressNotes.createdAt), desc(progressNotes.id))
      .limit(input.limit)
      .offset(input.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(progressNotes)
      .where(where);

    return {
      items: rows.map((row) => ProgressNote.fromPersistence(row)),
      total: counted?.total ?? 0,
    };
  }

  async findProjectName(projectId: string): Promise<string | null> {
    const { db } = requireTransaction();
    const rows = await db
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    return rows[0]?.name ?? null;
  }

  /**
   * Gorevin ait oldugu proje id'si.
   *
   * PROJESIZ bir gorevde `projectId` `null`'dir ve cagiran onu bir uyusmazlik
   * olarak ele alir — dogrudur: projesiz bir goreve, bir projenin notu
   * baglanamaz.
   */
  async findTaskProjectId(taskId: string): Promise<string | null> {
    const { db } = requireTransaction();
    const rows = await db
      .select({ projectId: tasks.projectId })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    return rows[0]?.projectId ?? null;
  }

  async countUnindexed(): Promise<number> {
    const { db } = requireTransaction();
    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(progressNotes)
      .leftJoin(progressNoteChunks, eq(progressNoteChunks.progressNoteId, progressNotes.id))
      .where(isNull(progressNoteChunks.id));

    return counted?.total ?? 0;
  }

  /**
   * Is listesi TURETILMISTIR: parcanin YOKLUGU is listesinin KENDISIDIR.
   *
   * Ayri bir "onarilacaklar" tablosu ve deneme sayaci YOK — sayac/backoff
   * OTOMATIK ve sonsuz bir donguyu dizginlemek icin vardir (outbox, gunluk
   * rapor); burada tetikleyici ACIK bir istektir ve oran sinirina tabidir.
   *
   * Proje adi JOIN ile gelir: baglam basligi onu gerektirir ve ikinci bir
   * sorgu acmanin anlami yok.
   *
   * `to_char(...)` ACIKTIR: `created_at` bir `timestamptz`tir ve surucu onu
   * `Date` nesnesine cevirir; metin olarak uretmek, baslikta gorunecek gunun
   * dilim cevirisine tabi olmamasini garanti eder — `application/today.ts` ile
   * ayni UTC karari.
   */
  async findUnindexed(limit: number): Promise<UnindexedProgressNote[]> {
    const { db } = requireTransaction();

    const rows = await db
      .select({
        progressNoteId: progressNotes.id,
        projectName: projects.name,
        writtenOn: sql<string>`to_char(${progressNotes.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
        body: progressNotes.body,
      })
      .from(progressNotes)
      // Satir DUSURMEZ: `project_id` NOT NULL + FK.
      .innerJoin(projects, eq(projects.id, progressNotes.projectId))
      .leftJoin(progressNoteChunks, eq(progressNoteChunks.progressNoteId, progressNotes.id))
      .where(isNull(progressNoteChunks.id))
      .orderBy(progressNotes.createdAt)
      .limit(limit);

    return rows;
  }
}
