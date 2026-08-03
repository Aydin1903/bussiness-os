import { describe, expect, it } from 'vitest';

import {
  CHARS_PER_TOKEN,
  chunkText,
  estimateTokens,
  TARGET_CHUNK_CHARS,
  TARGET_CHUNK_TOKENS,
} from './chunking';

/** Verilen uzunlukta, paragraf/cumle siniri ICERMEYEN metin. */
function filler(length: number): string {
  return 'a'.repeat(length);
}

/** Verilen uzunlukta, cumlelere bolunmus metin. */
function sentences(count: number, sentenceLength: number): string {
  return Array.from({ length: count }, () => `${'b'.repeat(sentenceLength - 2)}.`).join(' ');
}

describe('estimateTokens — tahmin, olcum degil', () => {
  it('2.5 karakter = 1 token varsayimini kullanir', () => {
    expect(estimateTokens('a'.repeat(250))).toBe(100);
  });

  it('yukari yuvarlar (yarim token diye bir sey yok)', () => {
    expect(estimateTokens('abc')).toBe(2);
  });

  it('bos metin sifir token', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('hedef karakter esigi ~500 token a denk gelir', () => {
    expect(TARGET_CHUNK_CHARS).toBe(TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN);
    expect(estimateTokens(filler(TARGET_CHUNK_CHARS))).toBe(TARGET_CHUNK_TOKENS);
  });
});

describe('chunkText — sinir durumlari', () => {
  it('bos metin PARCA URETMEZ', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('yalnizca bosluk iceren metin PARCA URETMEZ', () => {
    expect(chunkText('   \n\n  \t ')).toEqual([]);
  });

  it('cok kisa metin TEK parca olur', () => {
    expect(chunkText('kisa bir not')).toEqual(['kisa bir not']);
  });

  it('esikten kucuk metin bolunmez', () => {
    const text = filler(TARGET_CHUNK_CHARS - 1);
    expect(chunkText(text)).toEqual([text]);
  });

  it('TAM esikteki metin bolunmez (sinir kapsayici degil)', () => {
    const text = filler(TARGET_CHUNK_CHARS);
    expect(chunkText(text)).toEqual([text]);
  });

  it('esigi BIR karakter asan, bolunmez tek blok ikiye ayrilir', () => {
    const chunks = chunkText(filler(TARGET_CHUNK_CHARS + 1));

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(TARGET_CHUNK_CHARS);
    expect(chunks[1]).toHaveLength(1);
  });

  it('metnin tamami korunur — hicbir karakter kaybolmaz', () => {
    const text = filler(TARGET_CHUNK_CHARS * 3 + 17);

    expect(chunkText(text).join('')).toBe(text);
  });
});

describe('chunkText — paragraf sinirina saygi', () => {
  it('kucuk paragraflari TEK parcada birlestirir', () => {
    const chunks = chunkText('birinci paragraf\n\nikinci paragraf');

    expect(chunks).toEqual(['birinci paragraf\n\nikinci paragraf']);
  });

  it('paragraf ayirici korunur (bos satir)', () => {
    expect(chunkText('a\n\nb')[0]).toContain('\n\n');
  });

  it('esigi asacak paragraf YENI parcaya gecer, ortadan bolunmez', () => {
    const paragraph = filler(TARGET_CHUNK_CHARS - 100);
    const chunks = chunkText(`${paragraph}\n\n${paragraph}`);

    // Ikisi birlikte esigi asardi; her biri kendi parcasinda ve BUTUN kalir.
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(paragraph);
    expect(chunks[1]).toBe(paragraph);
  });

  it('birden fazla bos satir tek ayirici sayilir', () => {
    expect(chunkText('a\n\n\n\nb')).toEqual(['a\n\nb']);
  });

  it('bos paragraflar elenir', () => {
    expect(chunkText('a\n\n   \n\nb')).toEqual(['a\n\nb']);
  });

  it('paragraflarin bosluklari kirpilir', () => {
    expect(chunkText('  a  \n\n  b  ')).toEqual(['a\n\nb']);
  });
});

describe('chunkText — esigi asan TEK paragraf', () => {
  it('once CUMLE sinirindan bolunur', () => {
    // Her cumle 100 karakter; 20 cumle = ~2000 karakter, esik 1250.
    const chunks = chunkText(sentences(20, 100));

    expect(chunks.length).toBeGreaterThan(1);
    // Cumle ortasindan bolunmedi: her parca bir nokta ile biter.
    for (const chunk of chunks) {
      expect(chunk.endsWith('.')).toBe(true);
    }
  });

  it('hicbir parca esigi ASMAZ', () => {
    for (const chunk of chunkText(sentences(40, 100))) {
      expect(chunk.length).toBeLessThanOrEqual(TARGET_CHUNK_CHARS);
    }
  });

  it('tek CUMLE bile esigi asiyorsa karakter sinirindan bolunur', () => {
    // Bosluksuz uzun dize: anlamli sinir kalmamistir (kod blogu, uzun URL).
    const chunks = chunkText(filler(TARGET_CHUNK_CHARS * 2 + 50));

    expect(chunks).toHaveLength(3);
    expect(chunks.every((chunk) => chunk.length <= TARGET_CHUNK_CHARS)).toBe(true);
  });

  it('buyuk paragrafin oncesindeki birikim ONCE kapatilir (sira korunur)', () => {
    const chunks = chunkText(`kisa giris\n\n${filler(TARGET_CHUNK_CHARS + 10)}`);

    expect(chunks[0]).toBe('kisa giris');
    expect(chunks).toHaveLength(3);
  });
});

describe('chunkText — gercekci metin', () => {
  it('Turkce cok paragrafli notu makul sayida parcaya boler', () => {
    const paragraph =
      'Business OS bir AI isletim sistemidir. Modulller urun degil hafizadir. ' +
      'Her modulun var olus sebebi akilli ajanlara baglam ve hafiza saglamaktir. ';
    const text = Array.from({ length: 30 }, () => paragraph).join('\n\n');

    const chunks = chunkText(text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= TARGET_CHUNK_CHARS)).toBe(true);
    // Hicbir parca bos degil.
    expect(chunks.every((chunk) => chunk.trim() !== '')).toBe(true);
  });
});
