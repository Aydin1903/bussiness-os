import { describe, expect, it, vi } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { Category } from '../domain/category.entity';
import { CategoryInUseError, CategoryNotFoundError } from '../domain/finance.error';
import { type CategoryRepository } from './category.repository.port';
import { CategoryUseCases } from './category.use-cases';

/**
 * `CategoryUseCases`.
 *
 * CRUD'un kendisi `ProjectUseCases`/`CompanyUseCases` ile ayni sekildedir ve
 * orada kanitlandi; buradaki testler bu modulun GERCEKTEN KENDINE OZGU iki
 * seyine odaklanir (ADR-0034 §3):
 *
 *   1. yonun degistirilemezligi — yazma yoluna hic ulasmadigi,
 *   2. KULLANIMDAKI kategorinin silinememesi — repository'nin cevirdigi hatanin
 *      use case'ten SIZDIGI (bugun uretilemeyen ama Slice 2'de tetiklenecek yol).
 */

const NOW = new Date('2026-08-11T10:00:00.000Z');
const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000c';

const clock: Clock = { now: () => NOW };
const idGenerator: IdGenerator = { nextId: () => ID };

const transactionManager = {
  runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
} as unknown as TransactionManager;

function existing(): Category {
  return Category.create({
    id: ID,
    tenantId: TENANT,
    fields: { name: 'Kira', direction: 'expense', isArchived: false },
    now: NOW,
  });
}

function build(
  overrides: {
    found?: Category | null;
    deleted?: number;
    deleteError?: Error;
  } = {},
) {
  const save = vi.fn<CategoryRepository['save']>().mockResolvedValue(undefined);
  const findById = vi
    .fn<CategoryRepository['findById']>()
    .mockResolvedValue(overrides.found === undefined ? existing() : overrides.found);
  const deleteById = vi.fn<CategoryRepository['deleteById']>();

  if (overrides.deleteError === undefined) {
    deleteById.mockResolvedValue(overrides.deleted ?? 1);
  } else {
    deleteById.mockRejectedValue(overrides.deleteError);
  }

  const useCases = new CategoryUseCases({
    repository: { save, findById, deleteById } as unknown as CategoryRepository,
    transactionManager,
    idGenerator,
    clock,
  });

  return { useCases, save, findById, deleteById };
}

describe('CategoryUseCases — olusturma', () => {
  it('kategoriyi ARSIVLENMEMIS olarak kaydeder ve durumunu doner', async () => {
    const { useCases, save } = build();

    const state = await useCases.create({
      tenantId: TENANT,
      fields: { name: 'Kira', direction: 'expense', isArchived: false },
    });

    expect(state).toMatchObject({ id: ID, name: 'Kira', direction: 'expense', isArchived: false });
    expect(save).toHaveBeenCalledOnce();
  });
});

describe('CategoryUseCases — guncelleme', () => {
  it('YON GUNCELLEMEDEN ETKILENMEZ (ADR-0034 §3c)', async () => {
    // Use case `CategoryPatch` aliyor ve o tip `direction` TASIMIYOR. Govdeye
    // zorla konsa bile entity onu okumaz — kayitli yon aynen kalir.
    const { useCases, save } = build();

    const state = await useCases.update({
      id: ID,
      changes: { name: 'Ofis kirasi', ...({ direction: 'income' } as object) },
    });

    expect(state.direction).toBe('expense');
    expect(state.name).toBe('Ofis kirasi');
    expect(save).toHaveBeenCalledOnce();
  });

  it('kayit YOKSA 404 hatasi verir ve YAZMA YAPMAZ', async () => {
    const { useCases, save } = build({ found: null });

    await expect(useCases.update({ id: ID, changes: { name: 'X' } })).rejects.toThrow(
      CategoryNotFoundError,
    );
    expect(save).not.toHaveBeenCalled();
  });
});

describe('CategoryUseCases — silme', () => {
  it('silinen satir YOKSA 404 hatasi verir', async () => {
    // `0` iki anlama gelir ve AYIRT EDILMEZ: kayit yok, ya da baska tenant'in
    // (RLS silmeyi sessizce kapsam disi birakti). Ikisi de 404.
    const { useCases } = build({ deleted: 0 });

    await expect(useCases.delete(ID)).rejects.toThrow(CategoryNotFoundError);
  });

  it('KULLANIMDAKI kategori hatasi cagirana ULASIR (Slice 2 yolu)', async () => {
    // ⚠️ BU YOL BUGUN GERCEK VERIYLE URETILEMEZ: `finance.categories`e isaret
    // eden hicbir FK henuz yok (`0024` onu aciyor). Test yine de simdi
    // yaziliyor cunku alternatifi Slice 2'de bunu hatirlamaya guvenmekti —
    // unutulsaydi kullanimdaki bir kategoriyi silme denemesi ham bir PostgreSQL
    // hatasi olarak 500'e donusurdu.
    //
    // Iddia dar ve durustur: use case bu hatayi 404'e CEVIRMIYOR, oldugu gibi
    // birakiyor. Ceviriyi repository yapti, HTTP kodunu filtre verir (409).
    const { useCases } = build({ deleteError: new CategoryInUseError() });

    await expect(useCases.delete(ID)).rejects.toThrow(CategoryInUseError);
  });
});
