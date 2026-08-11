import { describe, expect, it } from 'vitest';

import { Category, isFinanceDirection, type CategoryState } from './category.entity';
import {
  BlankCategoryNameError,
  InvalidDirectionError,
  InvalidFinanceTimestampError,
} from './finance.error';

const NOW = new Date('2026-08-11T10:00:00.000Z');
const LATER = new Date('2026-08-11T11:00:00.000Z');
const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000c';

function create(overrides: { name?: string; direction?: string } = {}): Category {
  return Category.create({
    id: ID,
    tenantId: TENANT,
    fields: {
      name: overrides.name ?? 'Kira',
      // Test GECERSIZ yon de deneyebilmeli; daraltma entity'nin isi.
      direction: (overrides.direction ?? 'expense') as 'income' | 'expense',
      isArchived: false,
    },
    now: NOW,
  });
}

describe('Category — olusturma', () => {
  it('adin bas/son bosluklarini kirpar', () => {
    expect(create({ name: '  Kira  ' }).toState().name).toBe('Kira');
  });

  it('BOS ad reddedilir', () => {
    expect(() => create({ name: '   ' })).toThrow(BlankCategoryNameError);
  });

  it('GECERSIZ yon reddedilir', () => {
    expect(() => create({ direction: 'gelir' })).toThrow(InvalidDirectionError);
  });

  it('yeni kategori ARSIVLENMEMIS baslar', () => {
    expect(create().toState().isArchived).toBe(false);
  });
});

describe('Category — guncelleme', () => {
  it('gonderilmeyen alana DOKUNMAZ (PATCH semantigi)', () => {
    const updated = create().update({ isArchived: true }, LATER).toState();

    expect(updated.name).toBe('Kira');
    expect(updated.isArchived).toBe(true);
    expect(updated.updatedAt).toEqual(LATER);
  });

  it('arsivden CIKARILABILIR — arsivleme tek yonlu bir kapi degil', () => {
    // ⚠️ Bu, `DuplicateCategoryError`in mesajinin dogru olmasinin kosuludur:
    // "arsivlenmis olabilir" diyorsak, kullanicinin yapacagi sey yenisini
    // acmak degil ESKISINI GERI GETIRMEKTIR. O yol acik olmasaydi mesaj
    // cikmaz bir sokaga isaret ederdi.
    const archived = create().update({ isArchived: true }, LATER);

    expect(archived.update({ isArchived: false }, LATER).toState().isArchived).toBe(false);
  });

  it('BOS ada guncellenemez', () => {
    expect(() => create().update({ name: '  ' }, LATER)).toThrow(BlankCategoryNameError);
  });

  it('YON DEGISTIRILEMEZ — tip seviyesinde imkansiz, calisma zamaninda reddedilen degil', () => {
    // ⚠️ BU TESTIN ISI BIR SEYIN OLMADIGINI KANITLAMAKTIR (ADR-0034 §3c).
    //
    // `update()` imzasi `direction` ALMAZ. Biri onu "kolaylik olsun" diye
    // eklerse bu satir derlenmeye devam eder ama yon SESSIZCE degisebilir hale
    // gelir — ve `0024`un bilesik FK'si yuzunden kullanimdaki kategorilerde
    // kriptik bir veritabani hatasina donusur.
    //
    // Calisma zamani iddiasi: govdeye zorla konsa bile yon DEGISMEZ.
    const updated = create({ direction: 'expense' })
      .update({ name: 'Ofis kirasi', ...({ direction: 'income' } as object) }, LATER)
      .toState();

    expect(updated.direction).toBe('expense');
  });
});

describe('Category — kaliciliktan geri yukleme', () => {
  const state: CategoryState = {
    id: ID,
    tenantId: TENANT,
    name: 'Kira',
    direction: 'expense',
    isArchived: false,
    createdAt: NOW,
    updatedAt: LATER,
  };

  it('gecerli durumu geri yukler ve DOGRULAMA YAPMAZ', () => {
    // Ad kirpilmaz, yon yeniden kontrol edilmez: veri zaten gecerliydi.
    expect(Category.fromPersistence(state).toState()).toEqual(state);
  });

  it('updatedAt < createdAt ise reddedilir', () => {
    expect(() => Category.fromPersistence({ ...state, updatedAt: NOW, createdAt: LATER })).toThrow(
      InvalidFinanceTimestampError,
    );
  });
});

describe('isFinanceDirection', () => {
  it.each(['income', 'expense'])('%s gecerlidir', (value) => {
    expect(isFinanceDirection(value)).toBe(true);
  });

  it.each(['gelir', 'INCOME', '', 'transfer'])('%s gecersizdir', (value) => {
    expect(isFinanceDirection(value)).toBe(false);
  });
});
