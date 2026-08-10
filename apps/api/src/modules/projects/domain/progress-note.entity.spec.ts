import { describe, expect, it } from 'vitest';

import { EMBEDDING_DIMENSIONS } from '../../../shared/embedding.port';
import { ProgressNote, ProgressNoteChunk, withProjectHeader } from './progress-note.entity';
import { BlankProgressNoteBodyError, InvalidEmbeddingDimensionsError } from './projects.error';

const NOW = new Date('2026-08-10T10:00:00.000Z');
const ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000e';
const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const PROJECT = '018f3a2b-7c4d-7e1f-8a2b-00000000000c';
const TASK = '018f3a2b-7c4d-7e1f-8a2b-00000000000d';
const USER = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';

function create(body = 'Tasarim onaylandi', taskId: string | null = null) {
  return ProgressNote.create({
    id: ID,
    tenantId: TENANT,
    projectId: PROJECT,
    taskId,
    authorUserId: USER,
    body,
    now: NOW,
  });
}

describe('ProgressNote', () => {
  it('govdenin bosluklarini kirpar', () => {
    expect(create('  Tasarim onaylandi  ').toState().body).toBe('Tasarim onaylandi');
  });

  it('BOS govde reddedilir', () => {
    expect(() => create('   ')).toThrow(BlankProgressNoteBodyError);
  });

  it('gorev OPSIYONEL bir daraltmadir', () => {
    expect(create('metin', null).toState().taskId).toBeNull();
    expect(create('metin', TASK).toState().taskId).toBe(TASK);
  });

  it('EKLEME-YALNIZ: `update` metodu YOKTUR', () => {
    // Bir gunluk kaydi duzeltilmez; yanlissa yenisi yazilir (ADR-0033 §11).
    // Bu test sinirin KAYDIDIR — biri `update` eklerse gerekceyi okur.
    expect('update' in create()).toBe(false);
  });

  it('yazilma ani kayittir — `occurredOn` diye bir alan YOK', () => {
    // `Interaction`dan bilincli fark: gorusme gunler sonra yazilabilir,
    // ilerleme notu AKAN bir gunluktur.
    const state = create().toState();
    expect(state.createdAt).toEqual(NOW);
    expect('occurredOn' in state).toBe(false);
  });
});

describe('withProjectHeader — baglam basligi (ADR-0033 §6)', () => {
  it('proje adini ve gunu metnin BASINA koyar', () => {
    // Gomulen sey tam olarak budur. Baslik olmasaydi "Web sitesi projesinde ne
    // oldu?" sorusu hicbir parcayla eslesmezdi: notun kimligi FK kolonundadir.
    expect(
      withProjectHeader({
        projectName: 'Web sitesi yenileme',
        writtenOn: '2026-08-10',
        content: 'Tasarim onaylandi',
      }),
    ).toBe('[Web sitesi yenileme · 2026-08-10] Tasarim onaylandi');
  });

  it('GOREV ADI basliga GIRMEZ', () => {
    // `Interaction` da kisi/firsat adini koymadi: ikinci bir denormalize ad,
    // ikinci bir bayatlama yuzeyi demektir.
    const header = withProjectHeader({
      projectName: 'Web sitesi',
      writtenOn: '2026-08-10',
      content: 'Ana sayfa bitti',
    });

    expect(header).not.toContain('Ana sayfa görevi');
  });
});

describe('ProgressNoteChunk', () => {
  it('DOGRU boyuttaki embedding kabul edilir', () => {
    const chunk = ProgressNoteChunk.create({
      id: ID,
      tenantId: TENANT,
      progressNoteId: ID,
      chunkIndex: 0,
      content: '[Proje · 2026-08-10] metin',
      embedding: Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1),
    });

    expect(chunk.toState().chunkIndex).toBe(0);
  });

  it('YANLIS boyuttaki embedding REDDEDILIR', () => {
    // Boyut bir DOMAIN kuralidir ve `vector(1536)` kolonuyla birebir baglidir.
    // Adapter'da kontrol edilseydi, saglayici degisimi once veritabani
    // seviyesinde 500 olarak patlardi.
    expect(() =>
      ProgressNoteChunk.create({
        id: ID,
        tenantId: TENANT,
        progressNoteId: ID,
        chunkIndex: 0,
        content: 'metin',
        embedding: [0.1, 0.2],
      }),
    ).toThrow(InvalidEmbeddingDimensionsError);
  });
});
