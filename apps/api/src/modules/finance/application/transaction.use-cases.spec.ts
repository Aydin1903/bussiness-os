import { describe, expect, it, vi } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { Category, type FinanceDirection } from '../domain/category.entity';
import {
  ArchivedCategoryError,
  CategoryDirectionMismatchError,
  TransactionCategoryNotFoundError,
  TransactionNotFoundError,
} from '../domain/finance.error';
import { FinanceTransaction, type TransactionFields } from '../domain/transaction.entity';
import { type CategoryRepository } from './category.repository.port';
import { type TransactionRepository } from './transaction.repository.port';
import { TransactionUseCases } from './transaction.use-cases';

/**
 * `TransactionUseCases` — bu slice'in GERCEKTEN YENI mantigi.
 *
 * CRUD `CategoryUseCases`te kanitlandi; buradaki testler tek bir zincire
 * odaklaniyor: KATEGORI ESLEŞMESI (ADR-0034 §3c, §3e). Ucu de sessiz veri
 * bozulmasini onluyor.
 */

const NOW = new Date('2026-08-11T10:00:00.000Z');
const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const USER = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';
const ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000c';
const CATEGORY = '018f3a2b-7c4d-7e1f-8a2b-00000000000e';

const clock: Clock = { now: () => NOW };
const idGenerator: IdGenerator = { nextId: () => ID };

const transactionManager = {
  runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
} as unknown as TransactionManager;

function category(overrides: { direction?: FinanceDirection; archived?: boolean } = {}): Category {
  return Category.create({
    id: CATEGORY,
    tenantId: TENANT,
    fields: {
      name: 'Kira',
      direction: overrides.direction ?? 'expense',
      isArchived: overrides.archived ?? false,
    },
    now: NOW,
  });
}

function fields(overrides: Partial<TransactionFields> = {}): TransactionFields {
  return {
    direction: 'expense',
    amount: '1500',
    currency: 'TRY',
    occurredOn: '2026-08-01',
    description: null,
    categoryId: null,
    ...overrides,
  };
}

function build(
  overrides: {
    category?: Category | null;
    existing?: FinanceTransaction | null;
    deleted?: number;
  } = {},
) {
  const save = vi.fn<TransactionRepository['save']>().mockResolvedValue(undefined);
  const findCategory = vi
    .fn<CategoryRepository['findById']>()
    .mockResolvedValue(overrides.category === undefined ? category() : overrides.category);
  const findById = vi
    .fn<TransactionRepository['findById']>()
    .mockResolvedValue(overrides.existing ?? null);
  const deleteById = vi
    .fn<TransactionRepository['deleteById']>()
    .mockResolvedValue(overrides.deleted ?? 1);

  const useCases = new TransactionUseCases({
    repository: { save, findById, deleteById } as unknown as TransactionRepository,
    categoryRepository: { findById: findCategory } as unknown as CategoryRepository,
    transactionManager,
    idGenerator,
    clock,
  });

  return { useCases, save, findCategory, findById };
}

function existingTransaction(categoryId: string | null, direction: FinanceDirection = 'expense') {
  return FinanceTransaction.create({
    id: ID,
    tenantId: TENANT,
    createdByUserId: USER,
    fields: fields({ categoryId, direction }),
    now: NOW,
  });
}

describe('TransactionUseCases — kategori eslesmesi (ADR-0034 §3c)', () => {
  it('YON UYUSMUYORSA kayit YAZILMAZ', () => {
    // "Gelir kaydina gider kategorisi" — veritabani da bunu imkansiz kiliyor
    // (bilesik FK) ama mesaji uygulama uretiyor.
    const { useCases, save } = build({ category: category({ direction: 'expense' }) });

    return expect(
      useCases
        .create({
          tenantId: TENANT,
          userId: USER,
          fields: fields({ direction: 'income', categoryId: CATEGORY }),
        })
        .catch((error: unknown) => {
          // Asil iddia: yalnizca hata degil, YAZMA DA olmadi.
          expect(save).not.toHaveBeenCalled();
          throw error;
        }),
    ).rejects.toThrow(CategoryDirectionMismatchError);
  });

  it('kategori YOKSA 404 ve YAZMA YOK', async () => {
    const { useCases, save } = build({ category: null });

    await expect(
      useCases.create({
        tenantId: TENANT,
        userId: USER,
        fields: fields({ categoryId: CATEGORY }),
      }),
    ).rejects.toThrow(TransactionCategoryNotFoundError);
    expect(save).not.toHaveBeenCalled();
  });

  it('ARSIVLENMIS kategori YENI kayitta secilemez', async () => {
    // Arsivlemenin var olma sebebi budur; engellenmeseydi yalnizca bir GORSEL
    // filtre olurdu ve silmenin gercek alternatifi olamazdi.
    const { useCases } = build({ category: category({ archived: true }) });

    await expect(
      useCases.create({
        tenantId: TENANT,
        userId: USER,
        fields: fields({ categoryId: CATEGORY }),
      }),
    ).rejects.toThrow(ArchivedCategoryError);
  });

  it('KATEGORISIZ kayit kategori sorgusu HIC ACMAZ', async () => {
    const { useCases, save, findCategory } = build();

    await useCases.create({ tenantId: TENANT, userId: USER, fields: fields({ categoryId: null }) });

    expect(findCategory).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledOnce();
  });
});

describe('TransactionUseCases — guncellemede kategori eslesmesi', () => {
  it('YALNIZCA YON degisse bile MEVCUT kategori yeniden dogrulanir', async () => {
    // ⚠️ BU, BU DOSYANIN EN DEGERLI TESTIDIR.
    //
    // Kullanici kategoriye HIC dokunmuyor, yalnizca yonu ceviriyor — ama bu
    // degisiklik mevcut kategoriyi gecersiz kiliyor. "Kategori gonderildiyse
    // kontrol et" deseydik bu yol veritabaninin KRIPTIK FK hatasina duserdi.
    const { useCases, save } = build({
      existing: existingTransaction(CATEGORY, 'expense'),
      category: category({ direction: 'expense' }),
    });

    await expect(useCases.update({ id: ID, changes: { direction: 'income' } })).rejects.toThrow(
      CategoryDirectionMismatchError,
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('ARSIVLENMIS kategoriye bagli ESKI kayit yine de duzeltilebilir', async () => {
    // ⚠️ Arsivleme gecmisi DONDURMAK icin degil, YENI secimleri engellemek icin
    // var (ADR-0034 §3e). Aksi halde arsivlenen bir kategoriye bagli bir
    // kaydin yanlis tutari ASLA duzeltilemezdi — arsivleme, silmenin yumusak
    // alternatifi olmaktan cikip bir CEZAYA donusurdu.
    const { useCases, save } = build({
      existing: existingTransaction(CATEGORY, 'expense'),
      category: category({ archived: true, direction: 'expense' }),
    });

    const state = await useCases.update({ id: ID, changes: { amount: '2000' } });

    expect(state.amount).toBe('2000.00');
    expect(save).toHaveBeenCalledOnce();
  });

  it('kayit YOKSA 404 ve YAZMA YOK', async () => {
    const { useCases, save } = build({ existing: null });

    await expect(useCases.update({ id: ID, changes: { amount: '1' } })).rejects.toThrow(
      TransactionNotFoundError,
    );
    expect(save).not.toHaveBeenCalled();
  });
});

describe('TransactionUseCases — silme', () => {
  it('silinen satir YOKSA 404', async () => {
    // `0` iki anlama gelir ve AYIRT EDILMEZ: kayit yok, ya da baska tenant'in.
    const { useCases } = build({ deleted: 0 });

    await expect(useCases.delete(ID)).rejects.toThrow(TransactionNotFoundError);
  });
});
