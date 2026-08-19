import { describe, expect, it, vi } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  type InventoryRepository,
  type InventorySummary,
  type LowStockItem,
} from '../application/inventory.repository.port';
import { STOCK_ITEM_READ } from '../inventory.permissions';
import { InventoryStockContributor } from './inventory-stock.contributor';

const NOW = new Date('2026-08-19T10:00:00.000Z');
const NEAR_RATIO = 1.25;

const clock: Clock = { now: () => NOW };
const transactionManager = {
  runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
} as unknown as TransactionManager;

function summary(overrides: Partial<InventorySummary> = {}): InventorySummary {
  return { activeItems: 12, trackedItems: 5, movementsIn: 3, movementsOut: 7, ...overrides };
}

function build(overrides: { summary?: InventorySummary; lowStock?: LowStockItem[] } = {}) {
  const summarize = vi
    .fn<InventoryRepository['summarize']>()
    .mockResolvedValue(overrides.summary ?? summary());
  const findLowStock = vi
    .fn<InventoryRepository['findLowStock']>()
    .mockResolvedValue(overrides.lowStock ?? []);

  const repository = { summarize, findLowStock } as unknown as InventoryRepository;

  return {
    contributor: new InventoryStockContributor(repository, transactionManager, clock, NEAR_RATIO),
    summarize,
    findLowStock,
  };
}

/**
 * ⚠️ Bu katkici `contribute()` ile PARAMETRESIZ cagrilir ve bu bir eksik
 * DEGIL: katki DETERMINISTIKTIR, soruya gore degismez. `AppointmentSchedule
 * Contributor` ile ayni sekil — port'un sozlesmesi daha genis bir imza
 * tanimlar, implementasyon kullanmadigi parametreyi almaz.
 */

describe('InventoryStockContributor (ADR-0039 §6.1)', () => {
  it('ADR-0036: kendini YAPISAL ilan eder ve kapisi `stock_item:read`', () => {
    // ⚠️ Alan ZORUNLUDUR (ADR-0036 §5): unutulsaydi DERLEME HATASI olurdu,
    // sessiz bir kayip degil. Bu modul, o iddianin ilk yeni-modul sinavidir.
    const { contributor } = build();

    expect(contributor.contributionKind).toBe('structural');
    expect(contributor.source).toBe('inventory-stock');
    expect(contributor.permission).toBe(STOCK_ITEM_READ);
  });

  describe('skor RISKE GORE — duz sabit skor YASAK', () => {
    it('esik ALTINDAKI kalem -> 0.95 (gercek alarm)', async () => {
      const { contributor } = build({
        lowStock: [
          { id: 'a', name: 'Vida', unit: 'adet', quantity: '5.000', minQuantity: '20.000' },
        ],
      });

      const fragments = await contributor.contribute();

      expect(fragments.every((f) => f.score === 0.95)).toBe(true);
    });

    it('NEGATIF miktar -> 0.95 ve icerik "kayit tutarsiz" der', async () => {
      // ⚠️ Negatif stok FIZIKSEL OLARAK IMKANSIZDIR, yani kaydin kendisi
      // tutarsizdir ve kullanicinin bunu ogrenmesi "esik altinda"dan daha
      // aciledir.
      const { contributor } = build({
        lowStock: [{ id: 'a', name: 'Vida', unit: 'adet', quantity: '-3.000', minQuantity: null }],
      });

      const fragments = await contributor.contribute();

      expect(fragments[1]?.score).toBe(0.95);
      expect(fragments[1]?.content).toContain('NEGATIF');
    });

    it('yalnizca esige YAKIN kalem -> 0.90 (dikkat)', async () => {
      const { contributor } = build({
        lowStock: [
          { id: 'a', name: 'Vida', unit: 'adet', quantity: '24.000', minQuantity: '20.000' },
        ],
      });

      const fragments = await contributor.contribute();

      expect(fragments.every((f) => f.score === 0.9)).toBe(true);
    });

    it('saglikli -> 0.75 (bilgi; anlatisala yenilir)', async () => {
      const { contributor } = build({ lowStock: [] });

      const fragments = await contributor.contribute();

      expect(fragments).toHaveLength(1);
      expect(fragments[0]?.score).toBe(0.75);
    });
  });

  it('⚠️ BOS ENVANTERDE HICBIR SEY GONDERILMEZ — ADR-0036 bos yuva harcamasin', async () => {
    // Yapisal TABAN yalnizca "gercekten satir donduren" kaynaklara yuva ayirir.
    // Bos bir envanterde "0 kalem" demek, modele bilgi degil GURULTU tasir ve
    // sekiz yuvadan birini — hem de GARANTILI bir yuvayi — bosa harcardi.
    const { contributor } = build({ summary: summary({ activeItems: 0 }), lowStock: [] });

    await expect(contributor.contribute()).resolves.toEqual([]);
  });

  it('⚠️ MIKTAR BIRIMIYLE YAZILIR — ciplak sayi DEGIL (§4.1)', async () => {
    // Birimsiz bir sayi, modelin farkli kalemleri TOPLAYABILECEGINI ima ederdi
    // ve "toplam stok" diye bir sey yoktur.
    const { contributor } = build({
      lowStock: [{ id: 'a', name: 'Un', unit: 'kg', quantity: '2.500', minQuantity: '10.000' }],
    });

    const fragments = await contributor.contribute();

    expect(fragments[1]?.content).toContain('2.500 kg');
  });

  it('ozet fragment i bir DONEME isaret eder, uydurma bir UUID e degil', async () => {
    const { contributor } = build();

    const fragments = await contributor.contribute();

    expect(fragments[0]?.reference).toEqual({
      kind: 'inventory-summary',
      id: 'last-7-days',
    });
  });

  it('`nearRatio` porta OLDUGU GIBI gecer', async () => {
    const { contributor, findLowStock } = build();

    await contributor.contribute();

    expect(findLowStock).toHaveBeenCalledWith({ nearRatio: NEAR_RATIO, limit: 5 });
  });
});
