import { normalizeUuidV7 } from '../../../shared/uuid-v7';
import { InvalidNoteChunkIdError } from './knowledge.error';

/** Not parcasinin kalici teknik kimligi. Bkz. `NoteId` — ayni gerekce. */
export class NoteChunkId {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static create(value: string): NoteChunkId {
    const normalized = normalizeUuidV7(value);
    if (normalized === null) {
      throw new InvalidNoteChunkIdError(value);
    }
    return new NoteChunkId(normalized);
  }

  equals(other: NoteChunkId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
