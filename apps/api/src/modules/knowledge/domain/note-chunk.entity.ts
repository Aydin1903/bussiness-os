import { EMBEDDING_DIMENSIONS } from '../../../shared/embedding.port';
import { type TenantId } from './tenant-id.value-object';
import {
  EmptyChunkContentError,
  InvalidChunkIndexError,
  InvalidEmbeddingDimensionsError,
  InvalidNoteTimestampError,
} from './knowledge.error';
import { type NoteChunkId } from './note-chunk-id.value-object';
import { type NoteId } from './note-id.value-object';

/**
 * Notun AI icin okunabilir hale getirilmis bir parcasi (ADR-0029 §1, §2).
 *
 * ============================================================================
 * NEDEN AYRI ENTITY
 * ============================================================================
 * Embedding'in yasam dongusu notunkinden BAGIMSIZDIR: model veya saglayici
 * degisince tum chunk'lar yeniden uretilir, `Note` degismez. Ayni ayrim
 * tabloda (`notes` / `note_chunks`) ve port sinirinda (`EmbeddingPort` /
 * `LLMPort`) da uygulanir.
 * ============================================================================
 *
 * `tenantId` DENORMALIZE tasinir: RLS politikasi `notes` ile JOIN yapmadan
 * calisabilsin (migration 0011'deki ayni gerekce). Entity bunu bilir cunku
 * satirin sahipligi bir DOMAIN gercegidir, yalnizca bir sema detayi degil.
 */

export interface CreateNoteChunkInput {
  readonly id: NoteChunkId;
  readonly tenantId: TenantId;
  readonly noteId: NoteId;
  readonly chunkIndex: number;
  readonly content: string;
  readonly embedding: readonly number[];
  readonly createdAt: Date;
}

export type NoteChunkState = CreateNoteChunkInput;

export class NoteChunk {
  readonly id: NoteChunkId;
  readonly tenantId: TenantId;
  readonly noteId: NoteId;
  readonly chunkIndex: number;

  #content: string;
  #embedding: readonly number[];
  #createdAt: Date;

  private constructor(state: NoteChunkState) {
    this.id = state.id;
    this.tenantId = state.tenantId;
    this.noteId = state.noteId;
    this.chunkIndex = state.chunkIndex;
    this.#content = state.content;
    this.#embedding = Object.freeze([...state.embedding]);
    this.#createdAt = state.createdAt;
  }

  /**
   * Yeni bir parca olusturur.
   *
   * Embedding BOYUTU burada dogrulanir. Veritabani da reddeder (`vector(1536)`),
   * ama o noktada hangi chunk'in bozuk oldugu SQL hatasindan okunmak zorunda
   * kalinirdi; sinirda yakalamak hatayi baglamiyla birlikte gorunur kilar.
   */
  static create(input: CreateNoteChunkInput): NoteChunk {
    assertValidDate(input.createdAt);

    if (!Number.isInteger(input.chunkIndex) || input.chunkIndex < 0) {
      throw new InvalidChunkIndexError(input.chunkIndex);
    }

    const content = input.content.trim();
    if (content === '') {
      throw new EmptyChunkContentError();
    }

    if (input.embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new InvalidEmbeddingDimensionsError(EMBEDDING_DIMENSIONS, input.embedding.length);
    }

    return new NoteChunk({ ...input, content, createdAt: copyDate(input.createdAt) });
  }

  static fromPersistence(state: NoteChunkState): NoteChunk {
    return NoteChunk.create(state);
  }

  get content(): string {
    return this.#content;
  }

  /** Dizi mutable oldugu icin donmus kopya doner. */
  get embedding(): readonly number[] {
    return this.#embedding;
  }

  get createdAt(): Date {
    return copyDate(this.#createdAt);
  }
}

function assertValidDate(value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new InvalidNoteTimestampError('gecerli bir tarih degil');
  }
}

function copyDate(value: Date): Date {
  return new Date(value.getTime());
}
