import { describe, expect, it } from 'vitest';

import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { CheckNotesExistUseCase } from './check-notes-exist.use-case';
import { type NoteRepository } from './note.repository.port';
import { type Note } from '../domain/note.entity';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

type CallLog = string[];

class FakeNoteRepository implements NoteRepository {
  exists = false;

  constructor(private readonly calls: CallLog) {}

  save(_note: Note): Promise<void> {
    return Promise.resolve();
  }

  existsForTenant(): Promise<boolean> {
    this.calls.push('exists');
    return Promise.resolve(this.exists);
  }

  listForTenant(): Promise<never> {
    throw new Error('Bu use case listForTenant cagirmamali.');
  }

  countUnindexed(): Promise<never> {
    throw new Error('Bu use case countUnindexed cagirmamali.');
  }

  listUnindexed(): Promise<never> {
    throw new Error('Bu use case listUnindexed cagirmamali.');
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

function createHarness() {
  const calls: CallLog = [];
  const noteRepository = new FakeNoteRepository(calls);
  const transactionManager = new FakeTransactionManager(calls);

  return {
    noteRepository,
    transactionManager,
    calls,
    useCase: new CheckNotesExistUseCase({ noteRepository, transactionManager }),
  };
}

describe('CheckNotesExistUseCase', () => {
  it('not YOKSA hasNotes false doner', async () => {
    const harness = createHarness();
    harness.noteRepository.exists = false;

    expect(await harness.useCase.execute()).toEqual({ hasNotes: false });
  });

  it('not VARSA hasNotes true doner', async () => {
    const harness = createHarness();
    harness.noteRepository.exists = true;

    expect(await harness.useCase.execute()).toEqual({ hasNotes: true });
  });
});

describe('CheckNotesExistUseCase — transaction', () => {
  it('sorgu TENANT TRANSACTION i icinde calisir', async () => {
    // RLS politikasi `current_setting('app.current_tenant_id')` okur; context
    // yoksa sorgu sessizce bos DONMEZ, HATA verir (MT §12.6 madde 4). Yani
    // transaction'siz cagri her zaman patlardi — bu test o sinirin YERINDE
    // oldugunu kayda gecirir.
    const harness = createHarness();

    await harness.useCase.execute();

    expect(harness.calls).toEqual(['tx.begin', 'exists', 'tx.commit']);
  });

  it('TEK transaction acar', async () => {
    const harness = createHarness();

    await harness.useCase.execute();

    expect(harness.transactionManager.opened).toBe(1);
  });
});
