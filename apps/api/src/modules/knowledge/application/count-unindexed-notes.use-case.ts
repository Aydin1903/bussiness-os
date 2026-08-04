import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type NoteRepository } from './note.repository.port';

export interface CountUnindexedNotesResult {
  /** Chunk'i olmayan not sayisi. 0 ise her sey aranabilir durumda. */
  readonly count: number;
}

export interface CountUnindexedNotesDependencies {
  readonly noteRepository: NoteRepository;
  readonly transactionManager: TransactionManager;
}

/**
 * Kac notun ARANAMAZ durumda oldugunu soyler (ADR-0029 bilinen sinir).
 *
 * Arayuzun bunu bilmesi sart: aksi halde kullanici, AI'in bir notunu neden
 * bulamadigini ANLAYAMAZ — ve sessiz bir dogruluk deligi, gorunur bir hatadan
 * cok daha kotudur.
 *
 * Ucuz: `LEFT JOIN ... WHERE id IS NULL` sayimi, embedding cagrisi YOK.
 * Bu yuzden oran sinirina tabi degildir.
 */
export class CountUnindexedNotesUseCase {
  constructor(private readonly deps: CountUnindexedNotesDependencies) {}

  async execute(): Promise<CountUnindexedNotesResult> {
    const count = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.noteRepository.countUnindexed(),
    );

    return { count };
  }
}
