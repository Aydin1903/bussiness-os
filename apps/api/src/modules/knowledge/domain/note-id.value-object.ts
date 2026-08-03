import { normalizeUuidV7 } from '../../../shared/uuid-v7';
import { InvalidNoteIdError } from './knowledge.error';

/**
 * Notun kalici teknik kimligi (ADR-0029 §1).
 *
 * Neden `string` degil value object: DEVELOPMENT_RULES 2.4. Iki ciplak string
 * parametresi yer degistirdiginde derleyici susar; iki farkli value object yer
 * degistirdiginde derlenmez. `NoteId` ile `TenantId`'nin karismasi bu sistemde
 * tanimi geregi bir izolasyon hatasidir.
 */
export class NoteId {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  /** Tek yaratma yolu. `new NoteId(...)` derlenmez — constructor private. */
  static create(value: string): NoteId {
    const normalized = normalizeUuidV7(value);
    if (normalized === null) {
      throw new InvalidNoteIdError(value);
    }
    return new NoteId(normalized);
  }

  /** Referans degil DEGER karsilastirmasi. */
  equals(other: NoteId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
