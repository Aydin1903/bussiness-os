import { describe, expect, it } from 'vitest';

import {
  computeDocumentTotals,
  computeLineTotals,
  normalizeCurrency,
  normalizeQuantity,
  normalizeTaxRate,
  normalizeUnitPrice,
} from './document-money';
import {
  InvalidDocumentCurrencyError,
  InvalidLineQuantityError,
  InvalidTaxRateError,
  InvalidUnitPriceError,
} from './invoicing.error';

/**
 * Belge aritmetigi (ADR-0041 §1.3, §1.7, §1.8).
 *
 * DEVELOPMENT_RULES 5.3: domain testleri MOCK'SUZ yazilir.
 */
describe('document-money', () => {
  describe('normalizeQuantity', () => {
    it('kanonik bicime cevirir', () => {
      expect(normalizeQuantity('12.5')).toBe('12.500');
      expect(normalizeQuantity(3)).toBe('3.000');
      expect(normalizeQuantity('  7  ')).toBe('7.000');
    });

    it('SIFIRI ve NEGATIFI reddeder — bir satirin miktari pozitiftir', () => {
      expect(() => normalizeQuantity('0')).toThrow(InvalidLineQuantityError);
      expect(() => normalizeQuantity('0.000')).toThrow(InvalidLineQuantityError);
      // ⚠️ Iskonto NEGATIF MIKTARLA degil, negatif BIRIM FIYATLA ifade edilir.
      expect(() => normalizeQuantity('-1')).toThrow(InvalidLineQuantityError);
    });

    it('uc ondalik basamaktan fazlasini reddeder — SESSIZCE YUVARLAMAZ', () => {
      expect(() => normalizeQuantity('1.2345')).toThrow(InvalidLineQuantityError);
    });

    it('sonsuz ve ustel gosterimi reddeder', () => {
      expect(() => normalizeQuantity(Number.POSITIVE_INFINITY)).toThrow(InvalidLineQuantityError);
      expect(() => normalizeQuantity(1e21)).toThrow(InvalidLineQuantityError);
    });
  });

  describe('normalizeUnitPrice', () => {
    it('NEGATIF degeri KABUL EDER — iskonto satiri mesrudur (§1.7)', () => {
      expect(normalizeUnitPrice('-500')).toBe('-500.00');
      expect(normalizeUnitPrice(-12.5)).toBe('-12.50');
    });

    it('SIFIRI kabul eder — bedelsiz kalem gercek bir satirdir', () => {
      expect(normalizeUnitPrice('0')).toBe('0.00');
    });

    it('negatif sifiri TEK gosterime indirger', () => {
      // "-0.00" iki farkli gosterime sahip TEK bir degerdir ve
      // karsilastirmalari sessizce bozardi.
      expect(normalizeUnitPrice('-0')).toBe('0.00');
      expect(normalizeUnitPrice('-0.00')).toBe('0.00');
    });

    it('iki ondalik basamaktan fazlasini reddeder', () => {
      expect(() => normalizeUnitPrice('10.005')).toThrow(InvalidUnitPriceError);
    });
  });

  describe('normalizeTaxRate', () => {
    it('kanonik bicime cevirir', () => {
      expect(normalizeTaxRate('20')).toBe('20.00');
      expect(normalizeTaxRate(8.5)).toBe('8.50');
    });

    it('100 uzerini ve negatifi reddeder', () => {
      expect(() => normalizeTaxRate('100.01')).toThrow(InvalidTaxRateError);
      expect(() => normalizeTaxRate('-1')).toThrow(InvalidTaxRateError);
    });

    it('tam 100 gecerlidir', () => {
      expect(normalizeTaxRate('100')).toBe('100.00');
    });
  });

  describe('normalizeCurrency', () => {
    it('buyuk harfe cevirir', () => {
      expect(normalizeCurrency('try')).toBe('TRY');
    });

    it('yalnizca SEKLI dogrular — kod listesi dogrulanmaz', () => {
      // ⚠️ ADR-0034'un bilinen siniri: "XYZ" gecerli sayilir.
      expect(normalizeCurrency('XYZ')).toBe('XYZ');
      expect(() => normalizeCurrency('TRYY')).toThrow(InvalidDocumentCurrencyError);
    });
  });

  describe('computeLineTotals', () => {
    it('miktar x birim fiyat, iki haneye yuvarlar', () => {
      const totals = computeLineTotals({
        quantity: '3.000',
        unitPrice: '12.50',
        taxRate: '0.00',
      });

      expect(totals.net).toBe('37.50');
      expect(totals.tax).toBe('0.00');
      expect(totals.gross).toBe('37.50');
    });

    it('vergiyi NET uzerinden hesaplar', () => {
      const totals = computeLineTotals({
        quantity: '2.000',
        unitPrice: '100.00',
        taxRate: '20.00',
      });

      expect(totals.net).toBe('200.00');
      expect(totals.tax).toBe('40.00');
      expect(totals.gross).toBe('240.00');
    });

    it('SIFIRDAN UZAGA yuvarlar — negatif satir pozitifle AYNI mutlak degeri verir', () => {
      // ⚠️ Bankaci yuvarlamasi kullanilsaydi iki satir farkli yonlere sapardi ve
      // belgede aciklanamaz bir kurus farki gorunurdu.
      // 0.05 x %50 = 0.025 — TAM ORTA. Sifirdan uzaga: 0.03.
      const positive = computeLineTotals({
        quantity: '1.000',
        unitPrice: '0.05',
        taxRate: '50.00',
      });
      const negative = computeLineTotals({
        quantity: '1.000',
        unitPrice: '-0.05',
        taxRate: '50.00',
      });

      expect(positive.tax).toBe('0.03');
      expect(negative.tax).toBe('-0.03');
      expect(positive.net).toBe('0.05');
      expect(negative.net).toBe('-0.05');
    });

    it('"-0.00" URETMEZ — negatif sifir tek gosterime iner', () => {
      // ⚠️ Cok kucuk bir negatif vergi sifira yuvarlandiginda isaret DUSER;
      // aksi halde belgede "-0.00" yazardi ve karsilastirmalar sessizce
      // bozulurdu.
      const totals = computeLineTotals({
        quantity: '1.000',
        unitPrice: '-0.01',
        taxRate: '1.00',
      });

      expect(totals.tax).toBe('0.00');
    });

    it('kayan nokta kaymasi URETMEZ — BigInt uzerinde calisir', () => {
      // `0.1 * 3` JS'te 0.30000000000000004 verir.
      const totals = computeLineTotals({
        quantity: '3.000',
        unitPrice: '0.10',
        taxRate: '0.00',
      });

      expect(totals.net).toBe('0.30');
    });
  });

  describe('computeDocumentTotals', () => {
    it('SATIR BAZINDA yuvarlar, SONRA toplar — belge kendi icinde tutarli kalir', () => {
      // ⚠️ Bu testin var olma sebebi: "once topla, sonra yuvarla" secilseydi
      // belgede BASILI satir toplamlari, BASILI ara toplama elde toplandiginda
      // ESIT CIKMAZDI. Musteri kagida bakip toplar ve farkli bir sonuc bulurdu.
      // Her satir tek basina yuvarlaniyor: 0.333 x 3.00 = 0.999 -> 1.00
      const lines = [
        { quantity: '0.333', unitPrice: '3.00', taxRate: '0.00' },
        { quantity: '0.333', unitPrice: '3.00', taxRate: '0.00' },
        { quantity: '0.333', unitPrice: '3.00', taxRate: '0.00' },
      ];

      const perLine = lines.map((line) => computeLineTotals(line).net);
      expect(perLine).toEqual(['1.00', '1.00', '1.00']);

      // ⚠️ Belge ara toplami, BASILI satir toplamlarinin toplamidir: 3.00.
      // "Once topla sonra yuvarla" secilseydi 2.997 -> 3.00 cikardi ve bu
      // ornekte ayni olurdu; asagidaki ornek ayrismayi gosterir.
      expect(computeDocumentTotals(lines).subtotal).toBe('3.00');

      // 0.334 x 1.50 = 0.501 -> 0.50 (satir bazinda). Uc satir: 1.50.
      // Once toplasaydik 1.503 -> 1.50; ama 0.335 x 1.50 = 0.5025 -> 0.50
      // ile once toplama 1.5075 -> 1.51 verirdi. Yani AYRISMA GERCEKTIR.
      const drifting = [
        { quantity: '0.335', unitPrice: '1.50', taxRate: '0.00' },
        { quantity: '0.335', unitPrice: '1.50', taxRate: '0.00' },
        { quantity: '0.335', unitPrice: '1.50', taxRate: '0.00' },
      ];

      expect(drifting.map((line) => computeLineTotals(line).net)).toEqual(['0.50', '0.50', '0.50']);
      expect(computeDocumentTotals(drifting).subtotal).toBe('1.50');
    });

    it('vergiyi ayri toplar ve genel toplami uretir', () => {
      const totals = computeDocumentTotals([
        { quantity: '2.000', unitPrice: '100.00', taxRate: '20.00' },
        { quantity: '1.000', unitPrice: '50.00', taxRate: '10.00' },
      ]);

      expect(totals.subtotal).toBe('250.00');
      expect(totals.taxTotal).toBe('45.00');
      expect(totals.total).toBe('295.00');
    });

    it('ISKONTO SATIRI toplami dusurur (§1.7)', () => {
      const totals = computeDocumentTotals([
        { quantity: '1.000', unitPrice: '1000.00', taxRate: '0.00' },
        { quantity: '1.000', unitPrice: '-150.00', taxRate: '0.00' },
      ]);

      expect(totals.subtotal).toBe('850.00');
      expect(totals.total).toBe('850.00');
    });

    it('bos belge SIFIR doner — hata DEGIL (taslak kalemsiz olabilir)', () => {
      const totals = computeDocumentTotals([]);

      expect(totals.subtotal).toBe('0.00');
      expect(totals.taxTotal).toBe('0.00');
      expect(totals.total).toBe('0.00');
    });
  });
});
