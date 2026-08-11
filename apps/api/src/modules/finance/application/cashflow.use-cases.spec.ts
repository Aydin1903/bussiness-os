import { describe, expect, it, vi } from 'vitest';

import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { CashflowUseCases } from './cashflow.use-cases';
import {
  type CategoryTotalsRow,
  type CurrencyTotalsRow,
  type TransactionRepository,
} from './transaction.repository.port';

/**
 * `CashflowUseCases` — TOPLAMA burada YAPILMAZ, SQL'de yapilir.
 *
 * Dolayisiyla bu testlerin isi aritmetik dogrulamak degil (o `numeric`in isi),
 * BIRLESTIRME kurallarini kilitlemektir:
 *   - para birimleri AYRI satirlar olarak kalir, toplanmaz,
 *   - kirilim dogru para birimine baglanir,
 *   - `null` (istenmedi) ile `[]` (istendi, kayit yok) ayri kalir,
 *   - kategorisiz satirlar GORUNUR.
 */

const transactionManager = {
  runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
} as unknown as TransactionManager;

function build(overrides: { totals?: CurrencyTotalsRow[]; breakdown?: CategoryTotalsRow[] }) {
  const summarizeByCurrency = vi
    .fn<TransactionRepository['summarizeByCurrency']>()
    .mockResolvedValue(overrides.totals ?? []);
  const summarizeByCategory = vi
    .fn<TransactionRepository['summarizeByCategory']>()
    .mockResolvedValue(overrides.breakdown ?? []);

  const useCases = new CashflowUseCases({
    repository: { summarizeByCurrency, summarizeByCategory } as unknown as TransactionRepository,
    transactionManager,
  });

  return { useCases, summarizeByCurrency, summarizeByCategory };
}

const TRY_ROW: CurrencyTotalsRow = {
  currency: 'TRY',
  income: '12000.00',
  expense: '8500.50',
  net: '3499.50',
};
const USD_ROW: CurrencyTotalsRow = {
  currency: 'USD',
  income: '0.00',
  expense: '1200.00',
  net: '-1200.00',
};

describe('CashflowUseCases — para birimleri TOPLANMAZ', () => {
  it('her para birimi KENDI satirini korur', async () => {
    // ⚠️ BU, BU DOSYANIN EN ONEMLI TESTIDIR (ADR-0034 §5.1). Tek bir "net"
    // rakami dondurmek, 2000 TRY + 2000 USD = 4000 gibi kullanicinin
    // GOREMEYECEGI bir yanlis uretirdi.
    const { useCases } = build({ totals: [TRY_ROW, USD_ROW] });

    const summary = await useCases.summarize({ from: null, to: null, includeCategories: false });

    expect(summary.currencies).toHaveLength(2);
    expect(summary.currencies.map((row) => row.currency)).toEqual(['TRY', 'USD']);
    expect(summary.currencies[0]?.net).toBe('3499.50');
    expect(summary.currencies[1]?.net).toBe('-1200.00');
  });

  it('NEGATIF net oldugu gibi tasinir — mutlak degere cevrilmez', async () => {
    const { useCases } = build({ totals: [USD_ROW] });

    const summary = await useCases.summarize({ from: null, to: null, includeCategories: false });

    expect(summary.currencies[0]?.net).toBe('-1200.00');
  });

  it('HIC KAYIT YOKSA bos dizi doner — uydurulmus sifir satiri YOK', async () => {
    // `{ currency: 'TRY', net: '0.00' }` uydurmak yanlis olurdu: hangi para
    // biriminde sifir oldugunu bilmiyoruz.
    const { useCases } = build({ totals: [] });

    const summary = await useCases.summarize({
      from: '2026-08-01',
      to: '2026-08-31',
      includeCategories: false,
    });

    expect(summary.currencies).toEqual([]);
    expect(summary.from).toBe('2026-08-01');
    expect(summary.to).toBe('2026-08-31');
  });
});

describe('CashflowUseCases — kategori kirilimi', () => {
  const breakdown: CategoryTotalsRow[] = [
    {
      currency: 'TRY',
      categoryId: 'c1',
      categoryName: 'Kira',
      direction: 'expense',
      total: '5000.00',
    },
    {
      currency: 'TRY',
      categoryId: null,
      categoryName: null,
      direction: 'expense',
      total: '3500.50',
    },
    {
      currency: 'USD',
      categoryId: 'c2',
      categoryName: 'Sunucu',
      direction: 'expense',
      total: '1200.00',
    },
  ];

  it('kirilim DOGRU para birimine baglanir', async () => {
    const { useCases } = build({ totals: [TRY_ROW, USD_ROW], breakdown });

    const summary = await useCases.summarize({ from: null, to: null, includeCategories: true });

    expect(summary.currencies[0]?.categories).toHaveLength(2);
    expect(summary.currencies[1]?.categories).toHaveLength(1);
    expect(summary.currencies[1]?.categories?.[0]?.categoryName).toBe('Sunucu');
  });

  it('KATEGORISIZ satir GORUNUR, elenmez', async () => {
    // ⚠️ ADR-0034 §3d: ozet bunu ACIKCA gosterir. Elenseydi kategori toplamlari
    // para birimi toplamini TUTMAZ ve fark SESSIZ olurdu.
    const { useCases } = build({ totals: [TRY_ROW], breakdown });

    const summary = await useCases.summarize({ from: null, to: null, includeCategories: true });

    const uncategorized = summary.currencies[0]?.categories?.find((row) => row.categoryId === null);
    expect(uncategorized?.total).toBe('3500.50');
  });

  it('repository SIRASINI korur — yeniden siralamaz', async () => {
    const { useCases } = build({ totals: [TRY_ROW], breakdown });

    const summary = await useCases.summarize({ from: null, to: null, includeCategories: true });

    // Siralama karari TEK yerde (repository) yasar; burada tekrarlanirsa iki
    // yer ayrisabilir.
    expect(summary.currencies[0]?.categories?.map((row) => row.total)).toEqual([
      '5000.00',
      '3500.50',
    ]);
  });

  it('istenmediyse IKINCI SORGU HIC ACILMAZ ve categories null olur', async () => {
    const { useCases, summarizeByCategory } = build({ totals: [TRY_ROW], breakdown });

    const summary = await useCases.summarize({ from: null, to: null, includeCategories: false });

    expect(summarizeByCategory).not.toHaveBeenCalled();
    expect(summary.currencies[0]?.categories).toBeNull();
  });

  it('ISTENDI ama o para biriminde kayit yoksa BOS DIZI — null DEGIL', async () => {
    // ⚠️ `null` "istenmedi", `[]` "istendi ama yok" demektir. Ikisi tek bir
    // bos diziyle temsil edilselerdi arayuz farki kaybederdi.
    const { useCases } = build({ totals: [TRY_ROW, USD_ROW], breakdown: [breakdown[0]!] });

    const summary = await useCases.summarize({ from: null, to: null, includeCategories: true });

    expect(summary.currencies[0]?.categories).toHaveLength(1);
    expect(summary.currencies[1]?.categories).toEqual([]);
  });
});
