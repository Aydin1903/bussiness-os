import { describe, expect, it } from 'vitest';

import {
  BlankSupplierNameError,
  InvalidSuppliersTimestampError,
  PaymentTermsTooLongError,
} from './suppliers.error';
import { MAX_PAYMENT_TERMS_CHARS, Supplier, type SupplierFields } from './supplier.entity';

const NOW = new Date('2026-08-21T10:00:00.000Z');

function fields(overrides: Partial<SupplierFields> = {}): SupplierFields {
  return {
    name: 'Yildiz Civata',
    taxNumber: null,
    category: null,
    email: null,
    phone: null,
    website: null,
    address: null,
    paymentTerms: null,
    ...overrides,
  };
}

function create(overrides: Partial<SupplierFields> = {}): Supplier {
  return Supplier.create({
    id: 'sup-1',
    tenantId: 'tenant-1',
    createdByUserId: 'user-1',
    fields: fields(overrides),
    now: NOW,
  });
}

describe('Supplier (ADR-0040 §1)', () => {
  it('bos ad REDDEDILIR — ad tekil degildir ama bos da olamaz', () => {
    expect(() => create({ name: '   ' })).toThrow(BlankSupplierNameError);
  });

  it('⚠️ AYNI AD IKI KEZ MESRUDUR (§1.1) — tekillik `taxNumber`da', () => {
    // Iki ayri sube, iki ayri sozlesme ya da ayni adi tasiyan iki firma
    // mesrudur. Entity bunu ENGELLEMEZ ve engellememelidir.
    expect(create({ name: 'Yildiz Civata' }).toState().name).toBe('Yildiz Civata');
    expect(create({ name: 'Yildiz Civata' }).toState().name).toBe('Yildiz Civata');
  });

  it('bos dizeler `null`a cevrilir — "girilmedi" ile "bos girildi" ayni sey', () => {
    const state = create({ taxNumber: '  ', category: '', email: '   ' }).toState();

    expect(state.taxNumber).toBeNull();
    expect(state.category).toBeNull();
    expect(state.email).toBeNull();
  });

  it('⚠️ vergi numarasi KUCUK HARFE CEVRILMEZ — kullanicinin yazdigi bicim korunur', () => {
    // Tekillik `lower(tax_number)` IFADE INDEX'iyle saglanir (§1.1). Kucuk
    // harfe cevirmek, ekranda kullanicinin girdiginden FARKLI bir deger
    // gostermek olurdu.
    expect(create({ taxNumber: 'TR-1234' }).toState().taxNumber).toBe('TR-1234');
  });

  it('⚠️ odeme kosullari SERBEST METINDIR — yapisal alan YOK (§1.2)', () => {
    const state = create({
      paymentTerms: '60 gun vadeli, 10 gun icinde odemede %2 iskonto',
    }).toState();

    // Kolon HICBIR KISIT TASIMAZ: ne filtrelenir ne hesaplanir. Bunun dogrudan
    // sonucu §3.2'de yazili — "odeme vadesi yaklasan" bir YAPISAL KATKICI
    // yazilamaz cunku serbest metinden vade CIKARILAMAZ.
    expect(state.paymentTerms).toBe('60 gun vadeli, 10 gun icinde odemede %2 iskonto');
    expect(state).not.toHaveProperty('netDays');
    expect(state).not.toHaveProperty('discountPercent');
  });

  it('sinir asan odeme kosullari REDDEDILIR', () => {
    expect(() => create({ paymentTerms: 'x'.repeat(MAX_PAYMENT_TERMS_CHARS + 1) })).toThrow(
      PaymentTermsTooLongError,
    );
  });

  it('sinir kontrolu KIRPMADAN SONRA yapilir — bosluklar sismis metni gecirmez', () => {
    const padded = `  ${'x'.repeat(MAX_PAYMENT_TERMS_CHARS)}  `;

    expect(() => create({ paymentTerms: padded })).not.toThrow();
  });

  it('⚠️ ARSIVLEME ALANI YOKTUR — ADR-0039 dan bilincli sapma', () => {
    // Stok'ta `archivedAt` ZORUNLUYDU cunku silme, DEGISTIRILEMEZ ilan edilen
    // defteri goturuyordu. Burada goturecegi bir defter yok ve bir tedarikciye
    // ISARET EDEN HICBIR MODUL DE YOK (§4).
    expect(create().toState()).not.toHaveProperty('archivedAt');
  });

  it('⚠️ ASAMA / FIRSAT ALANI YOKTUR — "ters yon" tam olarak bu (§2.1)', () => {
    // Bir satis hattinin var olma sebebi BELIRSIZ BIR GELIRIN asamalar boyunca
    // ilerlemesidir; satin almada belirsizlik SIPARISTEDIR ve siparis kapsam
    // disi. ⚠️ Buraya bir `stage` eklemek, ADR-0036'nin esigini de birlikte
    // getirir (yapisal katkici dogar).
    const state = create().toState();

    expect(state).not.toHaveProperty('stage');
    expect(state).not.toHaveProperty('estimatedValue');
    expect(state).not.toHaveProperty('nextFollowUpOn');
  });

  describe('update — KISMI', () => {
    it('`undefined` = DOKUNMA', () => {
      const before = create({ email: 'info@yildiz.com', phone: '0212' });
      const after = before.update({ phone: '0216' }, NOW);

      expect(after.toState().email).toBe('info@yildiz.com');
      expect(after.toState().phone).toBe('0216');
    });

    it('⚠️ `null` = TEMIZLE — sessizce yok sayilmaz', () => {
      // `changes.x ?? current.x` yazilsaydi `null` gonderen bir istek SESSIZCE
      // yok sayilirdi: kullanici alani temizledigini sanip temizlememis olurdu.
      const before = create({ taxNumber: '1234567890' });
      const after = before.update({ taxNumber: null }, NOW);

      expect(after.toState().taxNumber).toBeNull();
    });

    it('ad bos birakilamaz', () => {
      expect(() => create().update({ name: '  ' }, NOW)).toThrow(BlankSupplierNameError);
    });

    it('`updatedAt` ilerler, `createdAt` ve `createdByUserId` SABIT kalir', () => {
      const later = new Date('2026-08-22T10:00:00.000Z');
      const after = create().update({ phone: '0216' }, later);

      expect(after.toState().updatedAt).toEqual(later);
      expect(after.toState().createdAt).toEqual(NOW);
      // ⚠️ Yalnizca OLUSTURANI tutar; DENETIM IZI DEGILDIR — bir tedarikcinin
      // odeme kosullarini KIMIN degistirdigi sorulamaz (`platform/audit`
      // borcu, 8. modul). Bu borc ADR-0039'un aksine KENDILIGINDEN KAPANMAZ.
      expect(after.toState().createdByUserId).toBe('user-1');
    });
  });

  it('fromPersistence: `updatedAt < createdAt` REDDEDILIR', () => {
    expect(() =>
      Supplier.fromPersistence({
        ...fields(),
        id: 'sup-1',
        tenantId: 'tenant-1',
        createdByUserId: 'user-1',
        createdAt: NOW,
        updatedAt: new Date('2026-08-20T10:00:00.000Z'),
      }),
    ).toThrow(InvalidSuppliersTimestampError);
  });
});
