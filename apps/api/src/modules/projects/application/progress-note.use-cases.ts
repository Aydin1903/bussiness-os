import { chunkText } from '../../../shared/chunking';
import { type Clock } from '../../../shared/clock.port';
import { EmbeddingFailedError, type EmbeddingPort } from '../../../shared/embedding.port';
import { enforceRateLimit } from '../../../shared/enforce-rate-limit';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type RateLimitRepository } from '../../../shared/rate-limit.repository.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  ProgressNote,
  ProgressNoteChunk,
  withProjectHeader,
  type ProgressNoteState,
} from '../domain/progress-note.entity';
import {
  ProgressNoteProjectNotFoundError,
  ProgressNoteTaskNotFoundError,
} from '../domain/projects.error';
import { PROJECTS_CREATE_PROGRESS_NOTE_ACTION } from '../projects.rate-limits';
import {
  type ProgressNoteRepository,
  type UnindexedProgressNote,
} from './progress-note.repository.port';
import { type ListPage } from './project.repository.port';

export interface ProgressNoteDependencies {
  readonly repository: ProgressNoteRepository;
  readonly rateLimitRepository: RateLimitRepository;
  readonly embeddingPort: EmbeddingPort;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  /** Saatlik not payi. Config'ten gelir. */
  readonly rateLimit: number;
  /** Tek onarim cagrisinda islenecek EN FAZLA not. */
  readonly reindexBatchSize: number;
}

export interface CreateProgressNoteResult {
  readonly note: ProgressNoteState;
  readonly chunkCount: number;
}

/**
 * Ilerleme notu yasam dongusu — Projeler'in AI'a ILK KEZ dokundugu yer.
 *
 * ============================================================================
 * IKI TRANSACTION, ARADA AG CAGRISI (ADR-0029 §4)
 * ============================================================================
 *   T0  oran siniri sayaci    -> transaction (kendi basina, commit)
 *   T1  not kaydi             -> transaction
 *   chunking + embedding      -> AG · transaction YOK
 *   T2  parcalar              -> transaction
 *
 * Pahali bir ag cagrisi boyunca veritabani baglantisi TUTULMAZ.
 *
 * ============================================================================
 * "PARCASIZ NOT" MUMKUNDUR — ama ONARILABILIR
 * ============================================================================
 * T1 commit olduktan sonra embedding cokerse ortaya notu olan ama parcasi
 * olmayan bir kayit cikar. Hata YUZEYE CIKAR (502) ve not SILINMEZ —
 * istemciye "kaydedildi ancak indekslenemedi" denir; genel bir hata donmek
 * kullaniciyi metni yeniden yazmaya ve MUKERRER kayda iterdi.
 *
 * Onarim ucu (`POST /projects/reindex`) ILK GUNDEN vardir.
 * ============================================================================
 */
export class ProgressNoteUseCases {
  constructor(private readonly deps: ProgressNoteDependencies) {}

  async create(input: {
    tenantId: string;
    userId: string;
    projectId: string;
    taskId: string | null;
    body: string;
  }): Promise<CreateProgressNoteResult> {
    // --- T0 ------------------------------------------------------------------
    // Embedding'den ONCE: reddedilecek bir istek TEK KURUS harcamamali.
    await enforceRateLimit(this.deps, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: PROJECTS_CREATE_PROGRESS_NOTE_ACTION,
      limit: this.deps.rateLimit,
    });

    // --- T1: not + proje/gorev dogrulamasi -----------------------------------
    const { note, projectName } = await this.deps.transactionManager.runInCurrentTenantTransaction(
      async () => {
        const name = await this.deps.repository.findProjectName(input.projectId);
        if (name === null) {
          // RLS sayesinde BASKA tenant'in projesi de "bulunamadi" sayilir;
          // varligi sizmaz. FK ihlaline birakmak 500 dondururdu.
          throw new ProgressNoteProjectNotFoundError();
        }

        await this.#assertTaskBelongsToProject(input.taskId, input.projectId);

        const created = ProgressNote.create({
          id: this.deps.idGenerator.nextId(),
          tenantId: input.tenantId,
          projectId: input.projectId,
          taskId: input.taskId,
          authorUserId: input.userId,
          body: input.body,
          now: this.deps.clock.now(),
        });

        await this.deps.repository.saveNote(created);
        return { note: created, projectName: name };
      },
    );

    const state = note.toState();

    // --- Ag · transaction YOK ------------------------------------------------
    const chunks = await this.#buildChunks({
      progressNoteId: state.id,
      tenantId: state.tenantId,
      projectName,
      writtenOn: toCalendarDay(state.createdAt),
      body: state.body,
    });

    // --- T2: parcalar --------------------------------------------------------
    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.saveChunks(chunks),
    );

    return { note: state, chunkCount: chunks.length };
  }

  async list(input: {
    limit: number;
    offset: number;
    projectId: string | null;
    taskId: string | null;
  }): Promise<ListPage<ProgressNoteState>> {
    const page = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.list(input),
    );

    return { items: page.items.map((item) => item.toState()), total: page.total };
  }

  /** Parcasiz not SAYISI — is listesi turetilmistir. */
  async countUnindexed(): Promise<number> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.countUnindexed(),
    );
  }

  /**
   * Parcasiz notlari onarir.
   *
   * Oran siniri `create_progress_note` kovasini PAYLASIR: ayni maliyet profili,
   * ve ayri bir kova onarimi butcesiz bir yan kapiya cevirirdi.
   *
   * IDEMPOTENCY BEDAVA: `UNIQUE (progress_note_id, chunk_index)` (migration
   * `0022`) zaten var; es zamanli iki onarimda ikincisi kisitla reddedilir ve
   * o not `failed` sayilir — VERI BOZULMAZ.
   */
  async reindex(input: {
    tenantId: string;
    userId: string;
  }): Promise<{ repaired: number; failed: number }> {
    await enforceRateLimit(this.deps, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: PROJECTS_CREATE_PROGRESS_NOTE_ACTION,
      limit: this.deps.rateLimit,
    });

    const pending = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findUnindexed(this.deps.reindexBatchSize),
    );

    let repaired = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        // Her not AYRI ele alinir: birinin cokmesi digerlerini engellemez.
        // Toplu bir transaction, tek bir bozuk kayit yuzunden onarilan her
        // seyi geri alirdi.
        const chunks = await this.#buildChunks({
          progressNoteId: item.progressNoteId,
          tenantId: input.tenantId,
          projectName: item.projectName,
          writtenOn: item.writtenOn,
          body: item.body,
        });

        await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
          this.deps.repository.saveChunks(chunks),
        );
        repaired += 1;
      } catch {
        failed += 1;
      }
    }

    return { repaired, failed };
  }

  /**
   * Gorev bu projeye mi ait — yalnizca `taskId` verildiyse.
   *
   * Kontrol olmasaydi A projesine ait bir not, B projesindeki bir goreve
   * baglanabilirdi ve iki proje birbirinin gecmisine SIZARDI. "Gorev yok" ile
   * "baska projede" ayirt EDILMEZ (bkz. `ProgressNoteTaskNotFoundError`).
   */
  async #assertTaskBelongsToProject(taskId: string | null, projectId: string): Promise<void> {
    if (taskId === null) {
      return;
    }

    const owner = await this.deps.repository.findTaskProjectId(taskId);
    if (owner !== projectId) {
      throw new ProgressNoteTaskNotFoundError();
    }
  }

  /**
   * Metni parcalara boler, HER PARCAYA BAGLAM BASLIGI ekler ve gomer.
   *
   * Baslik gomulen metnin PARCASIDIR — yalnizca gosterim degil. Proje adi ve
   * tarih her parcada bulunur, boylece "Web sitesi projesinde ne oldu?" sorusu
   * metinde proje adi gecmese bile eslesir (ADR-0033 §6).
   */
  async #buildChunks(input: {
    progressNoteId: string;
    tenantId: string;
    projectName: string;
    writtenOn: string;
    body: string;
  }): Promise<ProgressNoteChunk[]> {
    const parts = chunkText(input.body);
    const chunks: ProgressNoteChunk[] = [];

    for (const [index, part] of parts.entries()) {
      const content = withProjectHeader({
        projectName: input.projectName,
        writtenOn: input.writtenOn,
        content: part,
      });

      chunks.push(
        ProgressNoteChunk.create({
          id: this.deps.idGenerator.nextId(),
          tenantId: input.tenantId,
          progressNoteId: input.progressNoteId,
          chunkIndex: index,
          content,
          embedding: await this.#embed(content),
        }),
      );
    }

    return chunks;
  }

  /** Adapter'in firlattigi her hatayi TEK bir domain hatasina cevirir. */
  async #embed(text: string): Promise<number[]> {
    try {
      return await this.deps.embeddingPort.embed(text);
    } catch (error) {
      throw new EmbeddingFailedError(error instanceof Error ? error.message : String(error));
    }
  }
}

/**
 * `Date` -> `YYYY-MM-DD` (UTC).
 *
 * `application/today.ts` ile ayni gerekce ve ayni saat dilimi karari; orada
 * kaynak `Clock`, burada satirin kendi `createdAt`'idir.
 */
function toCalendarDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export type { UnindexedProgressNote };
