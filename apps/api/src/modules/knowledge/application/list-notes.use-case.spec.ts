import { describe, expect, it } from 'vitest';

import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { ListNotesUseCase } from './list-notes.use-case';
import { type NoteListPage, type NoteRepository } from './note.repository.port';
import { type Note } from '../domain/note.entity';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

type CallLog = string[];

class FakeNoteRepository implements NoteRepository {
  page: NoteListPage = { items: [], total: 0 };
  lastInput: { limit: number; offset: number; previewLength: number } | null = null;

  constructor(private readonly calls: CallLog) {}

  save(_note: Note): Promise<void> {
    return Promise.resolve();
  }

  existsForTenant(): Promise<boolean> {
    return Promise.resolve(false);
  }

  listForTenant(input: {
    limit: number;
    offset: number;
    previewLength: number;
  }): Promise<NoteListPage> {
    this.calls.push('list');
    this.lastInput = input;
    return Promise.resolve(this.page);
  }
}

class FakeTransactionManager implements TransactionManager {
  opened = 0;

  constructor(private readonly calls: CallLog) {}

  runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.runInCurrentTenantTransaction(fn);
  }

  runInTenantTransaction<T>(_tenantId: string, fn: () => Promise<T>): Promise<T> {
    return this.runInCurrentTenantTransaction(fn);
  }

  async runInCurrentTenantTransaction<T>(fn: () => Promise<T>): Promise<T> {
    this.opened += 1;
    this.calls.push('tx.begin');
    try {
      return await fn();
    } finally {
      this.calls.push('tx.commit');
    }
  }
}

function createHarness(previewLength = 280) {
  const calls: CallLog = [];
  const noteRepository = new FakeNoteRepository(calls);
  const transactionManager = new FakeTransactionManager(calls);

  return {
    noteRepository,
    transactionManager,
    calls,
    useCase: new ListNotesUseCase({ noteRepository, transactionManager, previewLength }),
  };
}

describe('ListNotesUseCase', () => {
  it('repository nin sayfasini oldugu gibi doner', async () => {
    const harness = createHarness();
    harness.noteRepository.page = {
      items: [
        {
          id: 'note-1',
          title: 'Baslik',
          preview: 'onizleme',
          bodyLength: 1200,
          createdAt: new Date('2026-08-04T10:00:00.000Z'),
        },
      ],
      total: 42,
    };

    expect(await harness.useCase.execute({ limit: 20, offset: 0 })).toEqual(
      harness.noteRepository.page,
    );
  });

  it('sayfalama parametreleri repository ye GECER', async () => {
    const harness = createHarness();

    await harness.useCase.execute({ limit: 5, offset: 40 });

    expect(harness.noteRepository.lastInput).toMatchObject({ limit: 5, offset: 40 });
  });

  it('onizleme uzunlugu CONFIG ten gelir, kodda sabit DEGIL', async () => {
    const harness = createHarness(120);

    await harness.useCase.execute({ limit: 20, offset: 0 });

    expect(harness.noteRepository.lastInput?.previewLength).toBe(120);
  });
});

describe('ListNotesUseCase — transaction', () => {
  it('sorgu TENANT TRANSACTION i icinde calisir', async () => {
    // RLS politikasi tenant context'i olmadan HATA verir (MT §12.6 madde 4);
    // bu test o sinirin YERINDE oldugunu kayda gecirir.
    const harness = createHarness();

    await harness.useCase.execute({ limit: 20, offset: 0 });

    expect(harness.calls).toEqual(['tx.begin', 'list', 'tx.commit']);
  });

  it('TEK transaction acar', async () => {
    const harness = createHarness();

    await harness.useCase.execute({ limit: 20, offset: 0 });

    expect(harness.transactionManager.opened).toBe(1);
  });
});
