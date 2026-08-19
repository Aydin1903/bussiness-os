import { describe, expect, it, vi } from 'vitest';

import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  type InventoryRepository,
  type SimilarStockItemNote,
} from '../application/inventory.repository.port';
import { STOCK_ITEM_READ } from '../inventory.permissions';
import { InventoryNotesContributor } from './inventory-notes.contributor';

const transactionManager = {
  runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
} as unknown as TransactionManager;

function build(notes: SimilarStockItemNote[] = []) {
  const findSimilarNotes = vi
    .fn<InventoryRepository['findSimilarNotes']>()
    .mockResolvedValue(notes);
  const repository = { findSimilarNotes } as unknown as InventoryRepository;

  return {
    contributor: new InventoryNotesContributor(repository, transactionManager),
    findSimilarNotes,
  };
}

const input = { question: 'hangi partiydi', embedding: [0.1, 0.2], limit: 3 };

describe('InventoryNotesContributor (ADR-0039 §6.2)', () => {
  it('ADR-0036: kendini ANLAMSAL ilan eder ve kapisi `stock_item:read`', () => {
    const { contributor } = build();

    expect(contributor.contributionKind).toBe('semantic');
    expect(contributor.source).toBe('inventory-notes');
    expect(contributor.permission).toBe(STOCK_ITEM_READ);
  });

  it('⚠️ FRAGMENT TAM KIMLIGI TASIR — Randevu daki sinir BURADA YOK', () => {
    // `AppointmentNotesContributor` baslikta KISI ADINI tasiyamiyordu: ad baska
    // bir semadaydi ve okumak izin kapili bir dizin cagrisi (cagiranin ROLU)
    // isterdi; `ContributeInput` rol tasimaz.
    //
    // Burada boyle bir sorun YOK: ad ve SKU AYNI SATIRIN kolonlaridir. Bu,
    // projede baslik denormalizasyonunun BEDELSIZ oldugu ILK yerdir.
    const { contributor } = build([
      { id: 'a', name: 'Vida M8', sku: 'VDA-M8', note: 'parti no 2026-04' },
    ]);

    return contributor.contribute(input).then((fragments) => {
      expect(fragments[0]?.content).toBe('[Stok · VDA-M8 · Vida M8] parti no 2026-04');
    });
  });

  it('SKU suz kalemde baslik ONSUZ kurulur', async () => {
    const { contributor } = build([{ id: 'a', name: 'Un', sku: null, note: 'yerli' }]);

    const fragments = await contributor.contribute(input);

    expect(fragments[0]?.content).toBe('[Stok · Un] yerli');
  });

  it('skor AZALAN — repository nin siralamasini korur', async () => {
    const { contributor } = build([
      { id: 'a', name: 'A', sku: null, note: 'n1' },
      { id: 'b', name: 'B', sku: null, note: 'n2' },
      { id: 'c', name: 'C', sku: null, note: 'n3' },
    ]);

    const fragments = await contributor.contribute(input);
    const scores = fragments.map((f) => f.score);

    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(new Set(scores).size).toBe(3);
  });

  it('⚠️ MIKTAR FRAGMENT E GIRMEZ — o `inventory-stock` in isi', async () => {
    // Iki gerekce: (1) miktar bir TOPLAMDIR ve her isabet icin ayri bir toplama
    // sorgusu, arama basina N sorgu demekti; (2) ikisi FARKLI SORULARA cevap
    // verir ("bu partiyi kimden almistik" ile "neyimiz bitiyor").
    const { contributor } = build([
      { id: 'a', name: 'Vida M8', sku: 'VDA-M8', note: 'parti no 2026-04' },
    ]);

    const fragments = await contributor.contribute(input);

    expect(fragments[0]?.content).not.toMatch(/\d+\.\d{3}/);
  });

  it('embedding ve limit porta OLDUGU GIBI gecer', async () => {
    const { contributor, findSimilarNotes } = build();

    await contributor.contribute(input);

    expect(findSimilarNotes).toHaveBeenCalledWith({ embedding: input.embedding, limit: 3 });
  });
});
