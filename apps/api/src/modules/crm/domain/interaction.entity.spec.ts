import { describe, expect, it } from 'vitest';

import { EMBEDDING_DIMENSIONS } from '../../../shared/embedding.port';
import { BlankInteractionBodyError, InvalidEmbeddingDimensionsError } from './crm.error';
import { Interaction, InteractionChunk, withContextHeader } from './interaction.entity';

const NOW = new Date('2026-08-07T10:00:00.000Z');
const ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000a';
const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const COMPANY = '018f3a2b-7c4d-7e1f-8a2b-00000000000c';

function create(body = 'Toplanti iyi gecti, butce onaylandi.') {
  return Interaction.create({
    id: ID,
    tenantId: TENANT,
    companyId: COMPANY,
    contactId: null,
    opportunityId: null,
    authorUserId: TENANT,
    occurredOn: '2026-08-12',
    body,
    now: NOW,
  });
}

describe('Interaction — olusturma', () => {
  it('govdenin bosluklarini kirpar', () => {
    expect(create('  metin  ').toState().body).toBe('metin');
  });

  it('BOS govde reddedilir', () => {
    expect(() => create('   ')).toThrow(BlankInteractionBodyError);
  });

  it('EKLEME-YALNIZ: `update` metodu YOKTUR', () => {
    // Gorusme bir GUNLUK KAYDIDIR; duzeltilmez, yanlissa yenisi yazilir.
    expect('update' in create()).toBe(false);
  });
});

describe('withContextHeader — bu slice icin KRITIK', () => {
  it('sirket adini ve tarihi metnin BASINA koyar', () => {
    const content = withContextHeader({
      companyName: 'Acme Tekstil',
      occurredOn: '2026-08-12',
      content: 'Toplanti iyi gecti, butce onaylandi.',
    });

    expect(content).toBe('[Acme Tekstil · 2026-08-12] Toplanti iyi gecti, butce onaylandi.');
  });

  it('sirket adi metinde GECMESE BILE parcada bulunur', () => {
    // BU SLICE'IN VAR OLMA SEBEBI: satis temsilcisi "Acme" yazmaz. Baslik
    // olmasaydi "Acme ile ne konustuk?" sorusu HICBIR parcayla eslesmezdi.
    const body = 'Toplanti iyi gecti, butce onaylandi.';
    expect(body).not.toContain('Acme');

    const content = withContextHeader({
      companyName: 'Acme Tekstil',
      occurredOn: '2026-08-12',
      content: body,
    });

    expect(content).toContain('Acme Tekstil');
  });
});

describe('InteractionChunk — boyut kontrolu', () => {
  function chunk(embedding: number[]) {
    return InteractionChunk.create({
      id: ID,
      tenantId: TENANT,
      interactionId: ID,
      chunkIndex: 0,
      content: '[Acme · 2026-08-12] metin',
      embedding,
    });
  }

  it('DOGRU boyut kabul edilir', () => {
    const embedding = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1);
    expect(chunk(embedding).toState().embedding).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it('YANLIS boyut reddedilir', () => {
    // Boyut bir DOMAIN kuralidir ve `vector(1536)` kolonuyla birebir baglidir.
    // Adapter'in isi tasimaktir; kontrol burada, dogru baglamla firlar.
    expect(() => chunk([0.1, 0.2])).toThrow(InvalidEmbeddingDimensionsError);
  });
});
