import { describe, expect, it } from 'vitest';

import { formatDocumentNumber } from './document-number';
import {
  BlankCustomerNameError,
  DateBeforeIssueDateError,
  DocumentNotEditableError,
  DocumentNotesTooLongError,
  InvalidDocumentDateError,
  InvalidStatusTransitionError,
} from './invoicing.error';
import {
  MAX_DOCUMENT_NOTES_CHARS,
  SalesDocument,
  type SalesDocumentFields,
  type SalesDocumentKind,
} from './sales-document.entity';

const NOW = new Date('2026-08-22T10:00:00.000Z');

function fields(overrides: Partial<SalesDocumentFields> = {}): SalesDocumentFields {
  return {
    customerName: 'Yildiz Ltd.',
    companyId: null,
    contactId: null,
    issuedOn: '2026-08-22',
    validUntil: null,
    dueOn: null,
    currency: 'TRY',
    notes: null,
    ...overrides,
  };
}

function create(
  kind: SalesDocumentKind,
  overrides: Partial<SalesDocumentFields> = {},
): SalesDocument {
  return SalesDocument.create({
    id: 'doc-1',
    tenantId: 'tenant-1',
    kind,
    createdByUserId: 'user-1',
    convertedFromId: null,
    fields: fields(overrides),
    now: NOW,
  });
}

describe('SalesDocument', () => {
  describe('create', () => {
    it('her belge TASLAK dogar ve numarasi YOKTUR (§1.6)', () => {
      const state = create('quote').toState();

      expect(state.status).toBe('draft');
      // ⚠️ "Dogrudan gonderilmis olarak olustur" diye bir yol YOKTUR: gonderim
      // bir EYLEMDIR ve aktorunu damgalar.
      expect(state.number).toBeNull();
      expect(state.sentAt).toBeNull();
      expect(state.sentByUserId).toBeNull();
    });

    it('musteri adi bos olamaz', () => {
      expect(() => create('quote', { customerName: '   ' })).toThrow(BlankCustomerNameError);
    });

    it('TUR-BAGIMLI alanlari TEMIZLER — reddetmez', () => {
      // ⚠️ Faturaya `validUntil` gonderen istemci bir HATA yapmistir ama istegin
      // geri kalani gecerlidir. Veritabani kisiti ayni kurali ZORLAR; burada
      // sessizce dusurmek o kisitin 500 uretmesini onler.
      const invoice = create('invoice', { validUntil: '2026-09-01', dueOn: '2026-09-30' });
      expect(invoice.toState().validUntil).toBeNull();
      expect(invoice.toState().dueOn).toBe('2026-09-30');

      const quote = create('quote', { validUntil: '2026-09-01', dueOn: '2026-09-30' });
      expect(quote.toState().validUntil).toBe('2026-09-01');
      expect(quote.toState().dueOn).toBeNull();
    });

    it('TASAN tarihi reddeder — Zod kalibi gecer ama gun GERCEK DEGILDIR', () => {
      expect(() => create('quote', { issuedOn: '2026-02-31' })).toThrow(InvalidDocumentDateError);
    });

    it('gecerlilik / vade belge tarihinden ONCE olamaz', () => {
      expect(() => create('quote', { validUntil: '2026-08-21' })).toThrow(DateBeforeIssueDateError);
      expect(() => create('invoice', { dueOn: '2026-08-21' })).toThrow(DateBeforeIssueDateError);
    });

    it('uzun notu reddeder — SESSIZ KIRPMA YOK', () => {
      expect(() => create('quote', { notes: 'x'.repeat(MAX_DOCUMENT_NOTES_CHARS + 1) })).toThrow(
        DocumentNotesTooLongError,
      );
    });

    it('para birimini buyuk harfe cevirir', () => {
      expect(create('quote', { currency: 'usd' }).toState().currency).toBe('USD');
    });
  });

  describe('assertEditable — korumanin BIRINCI katmani (§2)', () => {
    it('taslak duzenlenebilir', () => {
      expect(() => {
        create('quote').assertEditable();
      }).not.toThrow();
    });

    it('GONDERILMIS teklif duzenlenemez', () => {
      const sent = create('quote').release({ number: 'TKF-000001', userId: 'u', now: NOW });

      expect(() => {
        sent.assertEditable();
      }).toThrow(DocumentNotEditableError);
      expect(() => sent.update({ customerName: 'Yeni' }, NOW)).toThrow(DocumentNotEditableError);
    });

    it('KESILMIS fatura duzenlenemez', () => {
      const issued = create('invoice').release({ number: 'FTR-000001', userId: 'u', now: NOW });

      expect(() => {
        issued.assertEditable();
      }).toThrow(DocumentNotEditableError);
    });
  });

  describe('update', () => {
    it('gonderilmeyen alana DOKUNMAZ', () => {
      const updated = create('quote', { notes: 'kosullar' }).update({ customerName: 'A' }, NOW);

      expect(updated.toState().customerName).toBe('A');
      expect(updated.toState().notes).toBe('kosullar');
    });

    it('`null` alani TEMIZLER — sessizce yok saymaz', () => {
      const updated = create('quote', { notes: 'kosullar' }).update({ notes: null }, NOW);

      expect(updated.toState().notes).toBeNull();
    });
  });

  describe('durum makinesi (§1.2)', () => {
    it('teklif: draft -> sent -> accepted', () => {
      const sent = create('quote').release({ number: 'TKF-000001', userId: 'u1', now: NOW });
      expect(sent.status).toBe('sent');
      expect(sent.toState().number).toBe('TKF-000001');
      expect(sent.toState().sentByUserId).toBe('u1');

      const accepted = sent.decide({ outcome: 'accepted', userId: 'u2', now: NOW });
      expect(accepted.status).toBe('accepted');
      // ⚠️ AKTOR DAMGASI (§8.2) — bir denetim izi DEGIL, son durumun sahibi.
      expect(accepted.toState().decidedByUserId).toBe('u2');
      expect(accepted.toState().decidedAt).toEqual(NOW);
    });

    it('fatura: draft -> issued -> cancelled', () => {
      const issued = create('invoice').release({ number: 'FTR-000001', userId: 'u', now: NOW });
      expect(issued.status).toBe('issued');

      const cancelled = issued.cancel({ userId: 'u', now: NOW });
      expect(cancelled.status).toBe('cancelled');
      // ⚠️ Numara DURUR: bosluk gorunur, tekrar gorunmez (§1.6).
      expect(cancelled.toState().number).toBe('FTR-000001');
    });

    it('GERI DONUS YOKTUR — gonderilmis teklif taslaga donmez', () => {
      const sent = create('quote').release({ number: 'TKF-000001', userId: 'u', now: NOW });

      expect(() => sent.release({ number: 'TKF-000002', userId: 'u', now: NOW })).toThrow(
        InvalidStatusTransitionError,
      );
    });

    it('TUR SINIRLARI ASILAMAZ — teklif `cancelled` olamaz, fatura `accepted`', () => {
      // ⚠️ `draft`in izinli hedefleri iki tur icin ORTAK yazildi (`sent` ve
      // `issued`); bu testin kilitledigi sey IKINCI kosuldur — hedef, o TURUN
      // durum kumesinde de bulunmak zorunda.
      const invoice = create('invoice').release({ number: 'F', userId: 'u', now: NOW });
      expect(() => invoice.decide({ outcome: 'accepted', userId: 'u', now: NOW })).toThrow(
        InvalidStatusTransitionError,
      );

      const quote = create('quote').release({ number: 'T', userId: 'u', now: NOW });
      expect(() => quote.cancel({ userId: 'u', now: NOW })).toThrow(InvalidStatusTransitionError);
    });

    it('kabul edilmis teklif ARTIK degistirilemez ve yeniden karara baglanamaz', () => {
      const accepted = create('quote')
        .release({ number: 'T', userId: 'u', now: NOW })
        .decide({ outcome: 'accepted', userId: 'u', now: NOW });

      expect(() => accepted.decide({ outcome: 'rejected', userId: 'u', now: NOW })).toThrow(
        InvalidStatusTransitionError,
      );
    });
  });
});

describe('formatDocumentNumber', () => {
  it('tur onekini ve sifir dolgusunu uygular', () => {
    expect(formatDocumentNumber('quote', 1)).toBe('TKF-000001');
    expect(formatDocumentNumber('invoice', 123)).toBe('FTR-000123');
  });

  it('YIL ICERMEZ — sayac zamanla cogalmaz, retention listesine girmez (§1.6)', () => {
    expect(formatDocumentNumber('quote', 7)).not.toMatch(/\d{4}-/);
  });

  it('dolgu asildiginda KIRILIR, kesilmez', () => {
    expect(formatDocumentNumber('invoice', 12_345_678)).toBe('FTR-12345678');
  });
});
