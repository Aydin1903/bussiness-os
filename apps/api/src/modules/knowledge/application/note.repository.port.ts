import { type Note } from '../domain/note.entity';

/** DI token'i. */
export const NOTE_REPOSITORY = Symbol('NOTE_REPOSITORY');

/**
 * `knowledge.notes` kaliciligi icin application port'u (ADR-0029 §1).
 *
 * DAR TUTULUR (MT §12.4.3'teki `users` disiplini): `findAll` benzeri bir metot
 * YOKTUR. Bu slice yalnizca yazar; okuma uclari (dashboard, `/ask`) kendi
 * slice'larinda kendi dar metotlarini ekleyecek.
 */
export interface NoteRepository {
  /** Notu kaydeder. Aktif tenant transaction'i GEREKTIRIR. */
  save(note: Note): Promise<void>;
}
