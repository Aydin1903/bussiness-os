import { describe, expect, it } from 'vitest';

import { TenantId } from './tenant-id.value-object';
import {
  EmptyChunkContentError,
  InvalidChunkIndexError,
  InvalidEmbeddingDimensionsError,
} from './knowledge.error';
import { EMBEDDING_DIMENSIONS, NoteChunk } from './note-chunk.entity';
import { NoteChunkId } from './note-chunk-id.value-object';
import { NoteId } from './note-id.value-object';

const NOW = new Date('2026-08-02T10:00:00.000Z');
const CHUNK_ID = NoteChunkId.create('018f3a2b-7c4d-7e1f-8a2b-000000000002');
const NOTE_ID = NoteId.create('018f3a2b-7c4d-7e1f-8a2b-000000000001');
const TENANT_ID = TenantId.create('018f3a2b-7c4d-7e1f-9b3c-0000000000a1');

function vector(length = EMBEDDING_DIMENSIONS): number[] {
  return Array.from({ length }, (_, index) => index / length);
}

function create(
  overrides: Partial<{ chunkIndex: number; content: string; embedding: number[] }> = {},
) {
  return NoteChunk.create({
    id: CHUNK_ID,
    tenantId: TENANT_ID,
    noteId: NOTE_ID,
    chunkIndex: 0,
    content: 'parca icerigi',
    embedding: vector(),
    createdAt: NOW,
    ...overrides,
  });
}

describe('NoteChunk.create', () => {
  it('parcayi olusturur ve alanlarini tasir', () => {
    const chunk = create();

    expect(chunk.id).toBe(CHUNK_ID);
    expect(chunk.noteId).toBe(NOTE_ID);
    expect(chunk.tenantId).toBe(TENANT_ID);
    expect(chunk.chunkIndex).toBe(0);
    expect(chunk.content).toBe('parca icerigi');
    expect(chunk.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it('icerigin bosluklarini kirpar', () => {
    expect(create({ content: '  metin  ' }).content).toBe('metin');
  });
});

describe('NoteChunk.create — embedding boyutu', () => {
  it('1536 boyut KABUL EDILIR', () => {
    expect(() => create({ embedding: vector(1536) })).not.toThrow();
  });

  it('EKSIK boyut REDDEDILIR', () => {
    expect(() => create({ embedding: vector(1535) })).toThrow(InvalidEmbeddingDimensionsError);
  });

  it('FAZLA boyut REDDEDILIR', () => {
    expect(() => create({ embedding: vector(1537) })).toThrow(InvalidEmbeddingDimensionsError);
  });

  it('BOS dizi REDDEDILIR', () => {
    // Veritabani da reddederdi (`vector(1536)`), ama sinirda yakalamak hatayi
    // hangi chunk'ta oldugu belliyken gorunur kilar.
    expect(() => create({ embedding: [] })).toThrow(InvalidEmbeddingDimensionsError);
  });

  it('hata mesaji beklenen ve gelen boyutu SOYLER', () => {
    expect(() => create({ embedding: vector(3) })).toThrow(/1536 olmali, 3 geldi/);
  });
});

describe('NoteChunk.create — sira', () => {
  it('sifir GECERLIDIR (ilk parca)', () => {
    expect(create({ chunkIndex: 0 }).chunkIndex).toBe(0);
  });

  it('negatif sira REDDEDILIR', () => {
    expect(() => create({ chunkIndex: -1 })).toThrow(InvalidChunkIndexError);
  });

  it('ondalikli sira REDDEDILIR', () => {
    expect(() => create({ chunkIndex: 1.5 })).toThrow(InvalidChunkIndexError);
  });
});

describe('NoteChunk.create — icerik', () => {
  it('bos icerik REDDEDILIR', () => {
    expect(() => create({ content: '' })).toThrow(EmptyChunkContentError);
  });

  it('yalnizca bosluk iceren icerik REDDEDILIR', () => {
    expect(() => create({ content: '   ' })).toThrow(EmptyChunkContentError);
  });
});

describe('NoteChunk — immutability', () => {
  it('embedding DONMUS kopyadir — disaridan mutasyon entity yi bozmaz', () => {
    const embedding = vector();
    const chunk = create({ embedding });

    embedding[0] = 999;

    expect(chunk.embedding[0]).not.toBe(999);
  });

  it('donen embedding dizisi degistirilemez', () => {
    const chunk = create();

    expect(() => {
      (chunk.embedding as number[])[0] = 999;
    }).toThrow();
  });
});
