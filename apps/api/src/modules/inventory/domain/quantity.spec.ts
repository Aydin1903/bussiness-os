import { describe, expect, it } from 'vitest';

import { InvalidQuantityError } from './inventory.error';
import {
  absoluteQuantity,
  assertPositiveQuantity,
  isQuantityAtMost,
  isQuantityLessThan,
  isQuantityNegative,
  isQuantityZero,
  normalizeQuantity,
  subtractQuantity,
} from './quantity';

describe('quantity — miktar temsili ve aritmetigi (ADR-0039 §4.2)', () => {
  describe('normalizeQuantity', () => {
    it.each([
      ['12', '12.000'],
      ['12.5', '12.500'],
      ['12.500', '12.500'],
      ['0', '0.000'],
      ['0.001', '0.001'],
      ['-3.25', '-3.250'],
    ])('%s -> %s (KANONIK bicim)', (input, expected) => {
      expect(normalizeQuantity(input)).toBe(expected);
    });

    it('sayi da kabul edilir — JSON da ondalik tip YOKTUR', () => {
      // `money.ts`in ayni gerekcesi: sayiyi tumuyle reddetmek her naif
      // istemciyi kirardi ve `numeric(14,3)` araligi IEEE754'un tam temsil
      // ettigi araligin cok altindadir.
      expect(normalizeQuantity(12.5)).toBe('12.500');
      expect(normalizeQuantity(0)).toBe('0.000');
    });

    it('⚠️ NEGATIF SIFIR diye bir sey YOKTUR', () => {
      // Iki farkli gosterime sahip TEK bir deger, karsilastirmalari sessizce
      // bozardi.
      expect(normalizeQuantity('-0')).toBe('0.000');
      expect(normalizeQuantity('-0.000')).toBe('0.000');
    });

    it.each(['abc', '', '1.2345', '1e5', '999999999999', 'NaN'])('%s REDDEDILIR', (input) => {
      expect(() => normalizeQuantity(input)).toThrow(InvalidQuantityError);
    });

    it('⚠️ UC HANEDEN FAZLA ONDALIK SESSIZCE YUVARLANMAZ, REDDEDILIR', () => {
      // `toFixed(3)` kullanilsaydi `0.0005` -> `"0.001"` olurdu ve kullanicinin
      // GORMEDIGI bir duzeltme yapilmis olurdu (`money.ts`in ayni karari).
      expect(() => normalizeQuantity('0.0005')).toThrow(InvalidQuantityError);
    });

    it.each([Infinity, -Infinity, Number.NaN])('%s REDDEDILIR', (input) => {
      expect(() => normalizeQuantity(input)).toThrow(InvalidQuantityError);
    });
  });

  describe('assertPositiveQuantity — hareket miktari (ADR-0039 §3)', () => {
    it('pozitif kabul edilir', () => {
      expect(() => {
        assertPositiveQuantity('0.001');
      }).not.toThrow();
    });

    it.each(['0.000', '-1.000'])('%s REDDEDILIR — isaret `direction`dadir', (input) => {
      // Sifir miktarli bir hareket, olmamis bir akis hakkinda YALANDIR.
      // Negatif miktar ise yon kolonuyla birlikte CIFT ISARET uretirdi ve
      // toplama SESSIZCE ters calisirdi.
      expect(() => {
        assertPositiveQuantity(input);
      }).toThrow(InvalidQuantityError);
    });
  });

  describe('subtractQuantity — fiziksel sayimin kalbi (ADR-0039 §3.2)', () => {
    it('sayilan > mevcut -> POZITIF delta', () => {
      expect(subtractQuantity('15', '12')).toBe('3.000');
    });

    it('sayilan < mevcut -> NEGATIF delta', () => {
      expect(subtractQuantity('9', '12')).toBe('-3.000');
    });

    it('sayilan = mevcut -> SIFIR (hicbir hareket yazilmayacak)', () => {
      expect(subtractQuantity('12.500', '12.5')).toBe('0.000');
    });

    it('⚠️ KAYAN NOKTA HATASI URETMEZ — BigInt uzerinde calisir', () => {
      // `0.1 + 0.2` sinifindan bir kayma bu yolda MUMKUN DEGILDIR. `number`
      // aritmetiginde `0.3 - 0.1` = `0.19999999999999998` olurdu.
      expect(subtractQuantity('0.3', '0.1')).toBe('0.200');
      expect(subtractQuantity('0.1', '0.3')).toBe('-0.200');
    });

    it('mevcut NEGATIFKEN de dogru calisir', () => {
      // Negatif stok MESRUDUR (§6.1) ve sayim onu duzeltmenin yoludur:
      // mevcut -5, sayilan 3 -> +8 giris.
      expect(subtractQuantity('3', '-5')).toBe('8.000');
    });
  });

  describe('karsilastirmalar — esik mantigi (ADR-0039 §6.1)', () => {
    it('isQuantityLessThan / isQuantityAtMost', () => {
      expect(isQuantityLessThan('4', '5')).toBe(true);
      expect(isQuantityLessThan('5', '5')).toBe(false);
      expect(isQuantityAtMost('5', '5')).toBe(true);
      expect(isQuantityAtMost('5.001', '5')).toBe(false);
    });

    it('kanonik olmayan dizeler de dogru karsilastirilir', () => {
      // `"5"` ile `"5.000"` ayni degerdir; dize karsilastirmasi olsaydi
      // YANLIS sonuc verirdi.
      expect(isQuantityAtMost('5', '5.000')).toBe(true);
      expect(isQuantityLessThan('4.5', '4.50')).toBe(false);
    });

    it('isQuantityZero / isQuantityNegative', () => {
      expect(isQuantityZero('0.000')).toBe(true);
      expect(isQuantityZero('-0')).toBe(true);
      expect(isQuantityNegative('-0.001')).toBe(true);
      expect(isQuantityNegative('0')).toBe(false);
    });
  });

  describe('absoluteQuantity', () => {
    it('isareti atar', () => {
      expect(absoluteQuantity('-3.250')).toBe('3.250');
      expect(absoluteQuantity('3.250')).toBe('3.250');
    });
  });
});
