import { describe, expect, it } from 'vitest';

import { createNoteSchema } from './create-note.dto';

describe('createNoteSchema', () => {
  it('gecerli govdeyi kabul eder', () => {
    expect(createNoteSchema.parse({ title: 'Baslik', body: 'metin' })).toEqual({
      title: 'Baslik',
      body: 'metin',
    });
  });

  it('baslik OPSIYONEL — hic verilmeyebilir', () => {
    expect(createNoteSchema.parse({ body: 'metin' })).toEqual({ body: 'metin' });
  });

  it('baslik null gecilebilir', () => {
    expect(createNoteSchema.parse({ title: null, body: 'metin' }).title).toBeNull();
  });

  it('bos govde REDDEDILIR', () => {
    expect(() => createNoteSchema.parse({ body: '' })).toThrow();
  });

  it('govde ZORUNLU', () => {
    expect(() => createNoteSchema.parse({ title: 'Baslik' })).toThrow();
  });

  it('absurt buyuklukteki govdeyi sinirda eler (DoS)', () => {
    expect(() => createNoteSchema.parse({ body: 'a'.repeat(500_001) })).toThrow();
  });

  it('cok uzun basligi reddeder', () => {
    expect(() => createNoteSchema.parse({ title: 'a'.repeat(501), body: 'metin' })).toThrow();
  });

  it('KIMLIK alani KABUL ETMEZ — tenantId/authorUserId token dan gelir (strict)', () => {
    expect(() =>
      createNoteSchema.parse({ body: 'metin', tenantId: '018f3a2b-7c4d-7e1f-9b3c-0000000000a1' }),
    ).toThrow();
    expect(() =>
      createNoteSchema.parse({ body: 'metin', authorUserId: '018f3a2b-7c4d-7e1f-9b3c-00000000000a' }),
    ).toThrow();
  });

  it('TURETILMIS veri KABUL ETMEZ (embedding, chunks)', () => {
    expect(() => createNoteSchema.parse({ body: 'metin', embedding: [1, 2] })).toThrow();
    expect(() => createNoteSchema.parse({ body: 'metin', chunks: ['a'] })).toThrow();
  });

  it('bosluklu govdeyi BURADA kirpmaz — o domain in isi', () => {
    // Tek dogruluk kaynagi `Note.create`; Zod yalnizca uzunlukla DoS'u keser.
    expect(createNoteSchema.parse({ body: '  metin  ' }).body).toBe('  metin  ');
  });
});
