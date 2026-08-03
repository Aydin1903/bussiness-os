import { type NoteChunk } from '../domain/note-chunk.entity';

/** DI token'i. */
export const NOTE_CHUNK_REPOSITORY = Symbol('NOTE_CHUNK_REPOSITORY');

/**
 * `knowledge.note_chunks` kaliciligi icin application port'u.
 *
 * `saveAll`: bir notun parcalari TEK islemde yazilir. Tek tek yazmak, yarim
 * indekslenmis bir not birakma ihtimalini artirirdi — parcalar ya birlikte
 * vardir ya hic yoktur (T2 transaction'i, ADR-0029 §4).
 */
export interface NoteChunkRepository {
  saveAll(chunks: readonly NoteChunk[]): Promise<void>;
}
