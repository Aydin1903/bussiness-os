import { type ProgressNote, type ProgressNoteChunk } from '../domain/progress-note.entity';
import { type ListPage } from './project.repository.port';

export const PROGRESS_NOTE_REPOSITORY = Symbol('PROGRESS_NOTE_REPOSITORY');

/** Yeniden indekslenecek not — is listesi TURETILMISTIR (ADR-0029). */
export interface UnindexedProgressNote {
  readonly progressNoteId: string;
  readonly projectName: string;
  /** `YYYY-MM-DD` — notun yazildigi gun; baglam basligina girer. */
  readonly writtenOn: string;
  readonly body: string;
}

/**
 * `projects.progress_notes` + `projects.progress_note_chunks` kaliciligi.
 *
 * Tenant daraltmasi RLS'in isidir (bkz. `ProjectRepository`).
 */
export interface ProgressNoteRepository {
  saveNote(note: ProgressNote): Promise<void>;
  /** Parcalar AYRI transaction'da yazilir (ADR-0029 §4, T2). */
  saveChunks(chunks: readonly ProgressNoteChunk[]): Promise<void>;

  list(input: {
    limit: number;
    offset: number;
    projectId: string | null;
    taskId: string | null;
  }): Promise<ListPage<ProgressNote>>;

  /** Baglam basligi icin proje adi gerekir; tek sorguda getirilir. */
  findProjectName(projectId: string): Promise<string | null>;

  /**
   * Gorevin AIT OLDUGU proje id'si — `null` ise gorev yok (ya da projesiz).
   *
   * Cagiran bunu notun projesiyle KARSILASTIRIR: olmasaydi A projesine ait bir
   * not, B projesindeki bir goreve baglanabilirdi.
   */
  findTaskProjectId(taskId: string): Promise<string | null>;

  /**
   * PARCASIZ notlar — `LEFT JOIN ... WHERE chunk IS NULL`.
   *
   * Is listesi TURETILMISTIR, saklanmaz: ayri bir "onarilacaklar" tablosu ve
   * deneme sayaci YOK. Parcanin YOKLUGU is listesinin KENDISIDIR.
   */
  countUnindexed(): Promise<number>;
  findUnindexed(limit: number): Promise<UnindexedProgressNote[]>;
}
