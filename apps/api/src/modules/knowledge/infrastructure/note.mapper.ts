import { TenantId } from '../domain/tenant-id.value-object';
import { UserId } from '../../../shared/user-id.value-object';
import { Note } from '../domain/note.entity';
import { NoteId } from '../domain/note-id.value-object';

/** `knowledge.notes` satirinin ham bicimi. */
export interface NoteRow {
  readonly id: string;
  readonly tenantId: string;
  readonly authorUserId: string;
  readonly title: string | null;
  readonly body: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function toNote(row: NoteRow): Note {
  return Note.fromPersistence({
    id: NoteId.create(row.id),
    tenantId: TenantId.create(row.tenantId),
    authorUserId: UserId.create(row.authorUserId),
    title: row.title,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toNoteRow(note: Note): NoteRow {
  return {
    id: note.id.value,
    tenantId: note.tenantId.value,
    authorUserId: note.authorUserId.value,
    title: note.title,
    body: note.body,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}
