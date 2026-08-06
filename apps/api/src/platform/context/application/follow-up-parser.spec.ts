import { describe, expect, it } from 'vitest';

import { parseCompletion } from './follow-up-parser';
import { FOLLOW_UP_MARKER } from './ask-prompt';

/**
 * Bu ayristiricinin ASIL isi bozuk cikti karsisinda CEVABI KAYBETMEMEK.
 * Testlerin cogu bu yuzden "kotu bicim" testidir.
 */

describe('parseCompletion — mutlu yol', () => {
  it('cevabi ve sorulari ayirir', () => {
    const raw = `Fatura surecini Ayse Yilmaz yonetiyor.\n${FOLLOW_UP_MARKER}\nYedek onaycı var mı?\nSüreç ne zaman değişti?`;

    expect(parseCompletion(raw)).toEqual({
      answer: 'Fatura surecini Ayse Yilmaz yonetiyor.',
      followUps: ['Yedek onaycı var mı?', 'Süreç ne zaman değişti?'],
    });
  });

  it('EN FAZLA UC oneri alir', () => {
    const raw = `cevap\n${FOLLOW_UP_MARKER}\nbir?\niki?\nuc?\ndort?\nbes?`;

    expect(parseCompletion(raw).followUps).toEqual(['bir?', 'iki?', 'uc?']);
  });

  it('numara ve tire susleri temizlenir', () => {
    const raw = `cevap\n${FOLLOW_UP_MARKER}\n1. Birinci soru?\n- Ikinci soru?\n• Ucuncu soru?`;

    expect(parseCompletion(raw).followUps).toEqual([
      'Birinci soru?',
      'Ikinci soru?',
      'Ucuncu soru?',
    ]);
  });

  it('tirnak icine alinmis oneriler temizlenir', () => {
    const raw = `cevap\n${FOLLOW_UP_MARKER}\n"Bir soru?"`;

    expect(parseCompletion(raw).followUps).toEqual(['Bir soru?']);
  });
});

describe('parseCompletion — ayrac YOKSA', () => {
  it('tum metin CEVAPTIR, oneri bostur', () => {
    // Sistem promptu "baglamda bilgi yoksa bu bolumu hic yazma" der; ayracsiz
    // cevap bir HATA DEGIL, beklenen durumdur.
    const raw = 'Bu konuda henüz bir notunuz yok.';

    expect(parseCompletion(raw)).toEqual({ answer: raw, followUps: [] });
  });

  it('cevap KIRPILMAZ', () => {
    const raw = 'Uzun bir cevap.\nIkinci satiri da var.';

    expect(parseCompletion(raw).answer).toBe(raw);
  });
});

describe('parseCompletion — BOZUK bicim', () => {
  it('ayractan sonra hicbir sey yoksa cevap sag kalir', () => {
    const raw = `cevap metni\n${FOLLOW_UP_MARKER}`;

    expect(parseCompletion(raw)).toEqual({ answer: 'cevap metni', followUps: [] });
  });

  it('ayractan sonra yalnizca bos satirlar varsa oneri bostur', () => {
    const raw = `cevap metni\n${FOLLOW_UP_MARKER}\n\n   \n\n`;

    expect(parseCompletion(raw)).toEqual({ answer: 'cevap metni', followUps: [] });
  });

  it('ayrac EN BASTAYSA ham metin cevap sayilir', () => {
    // Model cevabi hic yazmamis. Kullaniciya bos balon gostermektense ham
    // metni vermek daha durust.
    const raw = `${FOLLOW_UP_MARKER}\nbir soru?`;

    expect(parseCompletion(raw).answer).toBe(raw.trim());
    expect(parseCompletion(raw).followUps).toEqual([]);
  });

  it('PARAGRAF uzunlugundaki "oneri" ATILIR', () => {
    // Cip degil paragraf; ekrani bozar.
    const long = 'a'.repeat(200);
    const raw = `cevap\n${FOLLOW_UP_MARKER}\n${long}\nkisa soru?`;

    expect(parseCompletion(raw).followUps).toEqual(['kisa soru?']);
  });

  it('ayrac cevabin ICINDE tekrarlarsa ILK gecis esas alinir', () => {
    const raw = `cevap\n${FOLLOW_UP_MARKER}\nsoru bir?\n${FOLLOW_UP_MARKER}\nsoru iki?`;

    expect(parseCompletion(raw).answer).toBe('cevap');
    expect(parseCompletion(raw).followUps).toContain('soru bir?');
  });

  it('bastaki ve sondaki bosluklar kirpilir', () => {
    const raw = `   cevap metni   \n${FOLLOW_UP_MARKER}\n   soru?   `;

    expect(parseCompletion(raw)).toEqual({ answer: 'cevap metni', followUps: ['soru?'] });
  });
});
