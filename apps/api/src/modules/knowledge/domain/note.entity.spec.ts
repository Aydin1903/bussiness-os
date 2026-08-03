import { describe, expect, it } from 'vitest';

import { UserId } from '../../../shared/user-id.value-object';
import { TenantId } from './tenant-id.value-object';
import {
  BlankNoteTitleError,
  EmptyNoteBodyError,
  InvalidNoteTimestampError,
} from './knowledge.error';
import { Note } from './note.entity';
import { NoteId } from './note-id.value-object';

const NOW = new Date('2026-08-02T10:00:00.000Z');
const NOTE_ID = NoteId.create('018f3a2b-7c4d-7e1f-8a2b-000000000001');
const TENANT_ID = TenantId.create('018f3a2b-7c4d-7e1f-9b3c-0000000000a1');
const USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-00000000000a');

function create(overrides: Partial<{ title: string | null; body: string; createdAt: Date }> = {}) {
  return Note.create({
    id: NOTE_ID,
    tenantId: TENANT_ID,
    authorUserId: USER_ID,
    title: 'Baslik',
    body: 'Not govdesi',
    createdAt: NOW,
    ...overrides,
  });
}

describe('Note.create', () => {
  it('notu olusturur ve alanlarini tasir', () => {
    const note = create();

    expect(note.id).toBe(NOTE_ID);
    expect(note.tenantId).toBe(TENANT_ID);
    expect(note.authorUserId).toBe(USER_ID);
    expect(note.title).toBe('Baslik');
    expect(note.body).toBe('Not govdesi');
  });

  it('yeni not "hic guncellenmemis"tir: updatedAt = createdAt', () => {
    const note = create();

    expect(note.updatedAt).toEqual(note.createdAt);
  });

  it('govdenin bosluklarini kirpar', () => {
    expect(create({ body: '  metin  ' }).body).toBe('metin');
  });

  it('basligin bosluklarini kirpar', () => {
    expect(create({ title: '  Baslik  ' }).title).toBe('Baslik');
  });
});

describe('Note.create — baslik: null ile bos AYNI SEY DEGIL', () => {
  it('null baslik GECERLIDIR (ADR-0029 opsiyonel yapar)', () => {
    expect(create({ title: null }).title).toBeNull();
  });

  it('bos string baslik REDDEDILIR', () => {
    expect(() => create({ title: '' })).toThrow(BlankNoteTitleError);
  });

  it('yalnizca bosluk iceren baslik REDDEDILIR', () => {
    expect(() => create({ title: '   ' })).toThrow(BlankNoteTitleError);
  });
});

describe('Note.create — govde zorunlu', () => {
  it('bos govde REDDEDILIR', () => {
    expect(() => create({ body: '' })).toThrow(EmptyNoteBodyError);
  });

  it('yalnizca bosluk iceren govde REDDEDILIR', () => {
    expect(() => create({ body: '  \n\t ' })).toThrow(EmptyNoteBodyError);
  });
});

describe('Note.create — zaman', () => {
  it('gecersiz tarih REDDEDILIR', () => {
    expect(() => create({ createdAt: new Date('gecersiz') })).toThrow(InvalidNoteTimestampError);
  });

  it('createdAt KOPYALANIR — disaridan mutasyon entity yi bozmaz', () => {
    const createdAt = new Date(NOW.getTime());
    const note = Note.create({
      id: NOTE_ID,
      tenantId: TENANT_ID,
      authorUserId: USER_ID,
      title: null,
      body: 'metin',
      createdAt,
    });

    createdAt.setFullYear(1999);

    expect(note.createdAt.getFullYear()).toBe(2026);
  });

  it('getter kopya doner — donen Date mutasyonu entity yi bozmaz', () => {
    const note = create();
    note.createdAt.setFullYear(1999);

    expect(note.createdAt.getFullYear()).toBe(2026);
  });
});

describe('Note.fromPersistence', () => {
  it('kalici kayittan yeniden kurar', () => {
    const updatedAt = new Date('2026-08-03T10:00:00.000Z');
    const note = Note.fromPersistence({
      id: NOTE_ID,
      tenantId: TENANT_ID,
      authorUserId: USER_ID,
      title: null,
      body: 'metin',
      createdAt: NOW,
      updatedAt,
    });

    expect(note.updatedAt).toEqual(updatedAt);
  });

  it('bozuk zaman damgasi REDDEDILIR', () => {
    expect(() =>
      Note.fromPersistence({
        id: NOTE_ID,
        tenantId: TENANT_ID,
        authorUserId: USER_ID,
        title: null,
        body: 'metin',
        createdAt: NOW,
        updatedAt: new Date('gecersiz'),
      }),
    ).toThrow(InvalidNoteTimestampError);
  });
});
