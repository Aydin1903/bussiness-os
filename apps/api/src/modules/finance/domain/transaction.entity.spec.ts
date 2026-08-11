import { describe, expect, it } from 'vitest';

import { InvalidDirectionError, InvalidOccurredOnError } from './finance.error';
import { FinanceTransaction, type TransactionFields } from './transaction.entity';

const NOW = new Date('2026-08-11T10:00:00.000Z');
const LATER = new Date('2026-08-11T11:00:00.000Z');
const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const USER = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';
const ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000c';

function fields(overrides: Partial<TransactionFields> = {}): TransactionFields {
  return {
    direction: 'expense',
    amount: '1500.5',
    currency: 'try',
    occurredOn: '2026-08-01',
    description: '  Ofis kirasi  ',
    categoryId: null,
    ...overrides,
  };
}

function create(overrides: Partial<TransactionFields> = {}): FinanceTransaction {
  return FinanceTransaction.create({
    id: ID,
    tenantId: TENANT,
    createdByUserId: USER,
    fields: fields(overrides),
    now: NOW,
  });
}

describe('FinanceTransaction — olusturma', () => {
  it('tutari, para birimini ve aciklamayi NORMALLESTIRIR', () => {
    const state = create().toState();

    expect(state.amount).toBe('1500.50');
    expect(state.currency).toBe('TRY');
    expect(state.description).toBe('Ofis kirasi');
  });

  it('BOS aciklama null a cevrilir', () => {
    expect(create({ description: '   ' }).toState().description).toBeNull();
  });

  it('GECERSIZ yon reddedilir', () => {
    expect(() => create({ direction: 'transfer' as 'income' })).toThrow(InvalidDirectionError);
  });

  it('cross-modul isaretcileri SLICE 3 e kadar DAIMA null', () => {
    // ⚠️ Kolonlar `0024`te acildi ama yazma yolu Slice 3'te. Entity onlari
    // ALANLARINDA hic tasimiyor; bu test o sinirin kayda gecmis halidir.
    const state = create().toState();

    expect(state.companyId).toBeNull();
    expect(state.projectId).toBeNull();
  });

  it('kaydi KIM girdigini tutar', () => {
    expect(create().toState().createdByUserId).toBe(USER);
  });
});

describe('FinanceTransaction — tarih dogrulamasi', () => {
  it('gecerli takvim gununu kabul eder', () => {
    expect(create({ occurredOn: '2024-02-29' }).toState().occurredOn).toBe('2024-02-29');
  });

  it.each(['2026-02-31', '2026-13-01', '2026-00-10', '2025-02-29'])(
    '%s reddedilir — KALIP gecerli ama GUN YOK',
    (value) => {
      // ⚠️ BU TESTIN ISI, KALIP KONTROLUNUN YETMEDIGINI KANITLAMAKTIR.
      // Yalnizca regex olsaydi bu degerler gecer, PostgreSQL `date` kolonuna
      // yazarken reddeder ve kullanici 422 yerine 500 alirdi.
      expect(() => create({ occurredOn: value })).toThrow(InvalidOccurredOnError);
    },
  );

  it.each(['2026-8-1', '01.08.2026', '2026/08/01', ''])('%s bicimi reddedilir', (value) => {
    expect(() => create({ occurredOn: value })).toThrow(InvalidOccurredOnError);
  });
});

describe('FinanceTransaction — guncelleme', () => {
  it('gonderilmeyen alana DOKUNMAZ (PATCH semantigi)', () => {
    const updated = create().update({ amount: '99' }, LATER).toState();

    expect(updated.amount).toBe('99.00');
    expect(updated.currency).toBe('TRY');
    expect(updated.occurredOn).toBe('2026-08-01');
    expect(updated.updatedAt).toEqual(LATER);
  });

  it('null = TEMIZLE, undefined = DOKUNMA', () => {
    const cleared = create().update({ description: null }, LATER).toState();
    expect(cleared.description).toBeNull();

    const untouched = create().update({ amount: '1' }, LATER).toState();
    expect(untouched.description).toBe('Ofis kirasi');
  });

  it('YON DEGISTIRILEBILIR — Category den bilincli SAPMA', () => {
    // Kategorinin yonu kalici bir SINIFLANDIRMADIR; islemin yonu bir VERI
    // ALANIDIR ve yanlis girilebilir (gelir olarak girilmis bir gider).
    // ⚠️ Kategori eslesmesinin yeniden dogrulanmasi use case'in isidir.
    expect(
      create({ direction: 'expense' }).update({ direction: 'income' }, LATER).toState().direction,
    ).toBe('income');
  });

  it('guncellemede de dogrulama CALISIR — gecersiz tutar gecemez', () => {
    // `create` ve `update` ayni `normalize()` yolundan gecer; ayri yollar
    // olsaydi biri sikilastirildiginda digeri sessizce gevsek kalirdi.
    expect(() => create().update({ amount: '-5' }, LATER)).toThrow();
  });
});
