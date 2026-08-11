import { describe, expect, it } from 'vitest';

import { InvalidAmountError, InvalidCurrencyError } from './finance.error';
import { normalizeAmount, normalizeCurrency } from './money';

/**
 * `money.ts` — bu modulun EN KIRILGAN dosyasi.
 *
 * Bir hata burada sessizce YANLIS BIR PARA RAKAMI uretir ve rakamlara itiraz
 * edilmez. Testler bu yuzden sinirlarda yogunlasiyor.
 */
describe('normalizeAmount — kanonik bicim', () => {
  it.each([
    ['1500', '1500.00'],
    ['1500.5', '1500.50'],
    ['1500.50', '1500.50'],
    ['0.01', '0.01'],
    ['999999999999.99', '999999999999.99'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeAmount(input)).toBe(expected);
  });

  it('bas/son bosluklari kirpar', () => {
    expect(normalizeAmount('  42.5  ')).toBe('42.50');
  });

  it('bastaki SIFIRLARI temizler', () => {
    // `"007.5"` ile `"7.50"` ayni degerdir; veritabani zaten normallestirir.
    // Burada da yapilmasi, yazmadan ONCE donen yanitin veritabanindan okunanla
    // AYNI gorunmesini saglar.
    expect(normalizeAmount('007.5')).toBe('7.50');
  });
});

describe('normalizeAmount — SAYI girdisi', () => {
  it.each([
    [1500, '1500.00'],
    [1500.5, '1500.50'],
    [0.01, '0.01'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeAmount(input)).toBe(expected);
  });

  it('KAYAN NOKTA ARTIGI olan sayi REDDEDILIR, sessizce yuvarlanmaz', () => {
    // ⚠️ BU TESTIN ISI BIR SEYIN OLMADIGINI KANITLAMAKTIR: `toFixed(2)`
    // kullanilsaydi bu deger sessizce "0.30"a yuvarlanirdi ve kullanicinin
    // GORMEDIGI bir duzeltme yapmis olurduk. Reddetmek dogru davranistir.
    expect(() => normalizeAmount(0.1 + 0.2)).toThrow(InvalidAmountError);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1e21, 1e-7])('%s reddedilir', (value) => {
    expect(() => normalizeAmount(value)).toThrow(InvalidAmountError);
  });
});

describe('normalizeAmount — reddedilenler', () => {
  it.each([
    ['0', 'sifir bir kayit degil gurultudur'],
    ['0.00', 'sifir bir kayit degil gurultudur'],
    ['-5', 'yonu direction tasir, tutar daima pozitif'],
    ['1.234', 'ikiden fazla ondalik'],
    ['1234567890123', 'on iki haneden fazla tam sayi'],
    ['abc', 'sayi degil'],
    ['', 'bos'],
    ['1,5', 'virgul ondalik ayraci degil'],
    ['1e3', 'ustel gosterim'],
    ['+5', 'isaret'],
  ])('%s reddedilir (%s)', (input) => {
    expect(() => normalizeAmount(input)).toThrow(InvalidAmountError);
  });

  it('hata mesaji KURALI soyler, yalnizca "gecersiz" demez', () => {
    // Istemcinin en sik hatasi ikiden fazla ondalik gondermektir ve bu,
    // "gecersiz tutar" mesajiyla teshis edilemez.
    expect(() => normalizeAmount('1.234')).toThrow(/2 ondalik/);
  });
});

describe('normalizeCurrency', () => {
  it.each([
    ['try', 'TRY'],
    ['TRY', 'TRY'],
    ['  usd  ', 'USD'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeCurrency(input)).toBe(expected);
  });

  it.each(['TR', 'TRYY', '', '12A', 'TR1'])('%s reddedilir', (input) => {
    expect(() => normalizeCurrency(input)).toThrow(InvalidCurrencyError);
  });

  it('KOD LISTESI dogrulanmaz — sekil yeterlidir', () => {
    // ⚠️ Bilincli bir bedel (ADR-0034 §2d): "XYZ" gecerli sayilir. Liste
    // zamanla degisir ve kodda tutulan bir liste bakim borcu uretir; eksik bir
    // kod ise kullaniciyi TUMUYLE engellerdi.
    expect(normalizeCurrency('XYZ')).toBe('XYZ');
  });
});
