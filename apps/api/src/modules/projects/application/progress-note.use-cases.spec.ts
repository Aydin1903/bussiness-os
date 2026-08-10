import { describe, expect, it, vi } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { EMBEDDING_DIMENSIONS, type EmbeddingPort } from '../../../shared/embedding.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import { type RateLimitRepository } from '../../../shared/rate-limit.repository.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  ProgressNoteProjectNotFoundError,
  ProgressNoteTaskNotFoundError,
} from '../domain/projects.error';
import { type ProgressNoteRepository } from './progress-note.repository.port';
import { ProgressNoteUseCases } from './progress-note.use-cases';

/**
 * `ProgressNoteUseCases` — modulun AI'a dokunan ilk akisi.
 *
 * Testler uc seye odaklaniyor:
 *   1. Oran siniri EMBEDDING'DEN ONCE calisir (reddedilen istek para harcamaz).
 *   2. Gorev, notun projesine AIT olmak zorunda (iki projenin gecmisi karismaz).
 *   3. Baglam basligi GOMULEN metne girer — yalnizca gosterim degil.
 */

const NOW = new Date('2026-08-10T10:00:00.000Z');
const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const USER = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';
const PROJECT = '018f3a2b-7c4d-7e1f-8a2b-00000000000c';
const OTHER_PROJECT = '018f3a2b-7c4d-7e1f-8a2b-00000000000f';
const TASK = '018f3a2b-7c4d-7e1f-8a2b-00000000000d';

const clock: Clock = { now: () => NOW };
const idGenerator: IdGenerator = { nextId: () => '018f3a2b-7c4d-7e1f-8a2b-00000000000e' };

const transactionManager = {
  runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
} as unknown as TransactionManager;

/** Sayac `1` doner: limitin (60) cok altinda, istek gecer. */
function permissiveRateLimit(): RateLimitRepository {
  return { registerRequest: vi.fn().mockResolvedValue(1) };
}

function build(overrides: {
  projectName?: string | null;
  taskProjectId?: string | null;
  embed?: EmbeddingPort['embed'];
  rateLimitRepository?: RateLimitRepository;
}) {
  const embed =
    overrides.embed ??
    vi.fn().mockResolvedValue(Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1));

  const saveNote = vi.fn().mockResolvedValue(undefined);
  const saveChunks = vi.fn().mockResolvedValue(undefined);

  const repository = {
    saveNote,
    saveChunks,
    findProjectName: vi
      .fn()
      .mockResolvedValue(
        overrides.projectName === undefined ? 'Web sitesi yenileme' : overrides.projectName,
      ),
    findTaskProjectId: vi.fn().mockResolvedValue(overrides.taskProjectId ?? null),
  } as unknown as ProgressNoteRepository;

  const useCases = new ProgressNoteUseCases({
    repository,
    rateLimitRepository: overrides.rateLimitRepository ?? permissiveRateLimit(),
    embeddingPort: { embed },
    transactionManager,
    idGenerator,
    clock,
    rateLimit: 60,
    reindexBatchSize: 10,
  });

  return { useCases, embed, saveNote, saveChunks };
}

function input(taskId: string | null = null) {
  return { tenantId: TENANT, userId: USER, projectId: PROJECT, taskId, body: 'Tasarim onaylandi' };
}

describe('ProgressNoteUseCases — baglam basligi', () => {
  it('GOMULEN metin proje adini ve gunu TASIR', async () => {
    const { useCases, embed } = build({});

    await useCases.create(input());

    // Asil iddia: baslik yalnizca gosterim degil, GOMULEN seyin parcasi.
    // Olmasaydi "Web sitesi projesinde ne oldu?" sorusu eslesmezdi.
    expect(embed).toHaveBeenCalledWith('[Web sitesi yenileme · 2026-08-10] Tasarim onaylandi');
  });

  it('parcalar YAZILIR ve sayilari donulur', async () => {
    const { useCases, saveChunks } = build({});

    const result = await useCases.create(input());

    expect(saveChunks).toHaveBeenCalledTimes(1);
    expect(result.chunkCount).toBe(1);
  });
});

describe('ProgressNoteUseCases — oran siniri EMBEDDING DEN ONCE', () => {
  it('pay tukendiginde embedding HIC cagrilmaz', async () => {
    // Sayac limitin (60) USTUNDE bir deger doner -> `RateLimitExceededError`.
    const exhausted: RateLimitRepository = {
      registerRequest: vi.fn().mockResolvedValue(999),
    };

    const { useCases, embed, saveNote } = build({ rateLimitRepository: exhausted });

    await expect(useCases.create(input())).rejects.toThrow(RateLimitExceededError);

    // T0 en basta: reddedilecek bir istek TEK KURUS harcamamali ve ortada
    // yarim kayit birakmamali.
    expect(embed).not.toHaveBeenCalled();
    expect(saveNote).not.toHaveBeenCalled();
  });
});

describe('ProgressNoteUseCases — proje ve gorev dogrulamasi', () => {
  it('VAR OLMAYAN proje REDDEDILIR ve not yazilmaz', async () => {
    const { useCases, saveNote } = build({ projectName: null });

    await expect(useCases.create(input())).rejects.toThrow(ProgressNoteProjectNotFoundError);
    expect(saveNote).not.toHaveBeenCalled();
  });

  it('BASKA PROJENIN gorevine baglanan not REDDEDILIR', async () => {
    // Kontrol olmasaydi A projesine ait bir not, B projesindeki bir goreve
    // baglanabilirdi ve iki proje birbirinin gecmisine sizardi.
    const { useCases, saveNote } = build({ taskProjectId: OTHER_PROJECT });

    await expect(useCases.create(input(TASK))).rejects.toThrow(ProgressNoteTaskNotFoundError);
    expect(saveNote).not.toHaveBeenCalled();
  });

  it('PROJESIZ goreve baglanan not REDDEDILIR', async () => {
    // `findTaskProjectId` `null` doner: projesiz bir goreve, bir projenin notu
    // baglanamaz.
    const { useCases } = build({ taskProjectId: null });

    await expect(useCases.create(input(TASK))).rejects.toThrow(ProgressNoteTaskNotFoundError);
  });

  it('AYNI projenin gorevine baglanan not kabul edilir', async () => {
    const { useCases, saveNote } = build({ taskProjectId: PROJECT });

    const result = await useCases.create(input(TASK));

    expect(saveNote).toHaveBeenCalledTimes(1);
    expect(result.note.taskId).toBe(TASK);
  });

  it('gorev VERILMEZSE gorev sorgusu yapilmaz', async () => {
    const { useCases } = build({});
    const result = await useCases.create(input(null));
    expect(result.note.taskId).toBeNull();
  });
});

describe('ProgressNoteUseCases — embedding cokerse', () => {
  it('NOT KAYDEDILMIS kalir, hata YUZEYE CIKAR', async () => {
    const { useCases, saveNote, saveChunks } = build({
      embed: vi.fn().mockRejectedValue(new Error('saglayici coktu')),
    });

    await expect(useCases.create(input())).rejects.toThrow();

    // ADR-0029 §4'un bilinen siniri: T1 commit oldu, T2 olmadi. Not SILINMEZ —
    // genel bir hata donmek kullaniciyi metni yeniden yazmaya ve MUKERRER
    // kayda iterdi. Onarim `POST /projects/reindex` ile yapilir.
    expect(saveNote).toHaveBeenCalledTimes(1);
    expect(saveChunks).not.toHaveBeenCalled();
  });
});
