import { describe, expect, it, vi } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type CashflowSummary, type CashflowUseCases } from '../application/cashflow.use-cases';
import { FinanceCashflowContributor } from './finance-cashflow.contributor';

/**
 * `FinanceCashflowContributor` — bu slice'in GERCEKTEN YENI mantigi.
 *
 * Testler tek bir seye odaklaniyor: SKOR POLITIKASI. Sebebi aritmetiktir —
 * global top-K 8'dir ve artik UC yapisal katkici ayni havuzu paylasiyor
 * (CRM 3 + Projeler 5 + Finans 3 = 11). Sabit yuksek skor, DORT anlamsal
 * kaynagin hicbirini iceri birakmazdi.
 */

const NOW = new Date('2026-08-11T10:00:00.000Z');
const clock: Clock = { now: () => NOW };

function summary(
  currencies: { currency: string; income: string; expense: string; net: string }[],
): CashflowSummary {
  return {
    from: null,
    to: null,
    currencies: currencies.map((row) => ({ ...row, categories: [] })),
  };
}

function build(current: CashflowSummary, previous: CashflowSummary) {
  const summarize = vi
    .fn<CashflowUseCases['summarize']>()
    .mockResolvedValueOnce(current)
    .mockResolvedValueOnce(previous);

  const contributor = new FinanceCashflowContributor(
    { summarize } as unknown as CashflowUseCases,
    clock,
  );

  return { contributor, summarize };
}

describe('FinanceCashflowContributor — riske gore skor (ADR-0034 §6.2)', () => {
  it('NEGATIF net -> 0.95 (gercekten alarm)', async () => {
    const { contributor } = build(
      summary([{ currency: 'TRY', income: '1000.00', expense: '4000.00', net: '-3000.00' }]),
      summary([{ currency: 'TRY', income: '5000.00', expense: '1000.00', net: '4000.00' }]),
    );

    const [fragment] = await contributor.contribute();

    expect(fragment?.score).toBe(0.95);
    // Isaret ACIKCA yaziliyor: modelin "-3000.00" dizesinden kendi cikarim
    // yapmasini beklemek guvenilmez.
    expect(fragment?.content).toContain('NEGATIF NAKIT AKISI');
  });

  it('pozitif ama ONCEKI donemden DUSUK -> 0.90 (dikkat)', async () => {
    const { contributor } = build(
      summary([{ currency: 'TRY', income: '5000.00', expense: '4000.00', net: '1000.00' }]),
      summary([{ currency: 'TRY', income: '9000.00', expense: '4000.00', net: '5000.00' }]),
    );

    const [fragment] = await contributor.contribute();

    expect(fragment?.score).toBe(0.9);
    expect(fragment?.content).toContain('DUSUS');
  });

  it('SAGLIKLI -> 0.75 — anlatisal icerige YENILIR', async () => {
    // ⚠️ ASIL IDDIA BUDUR. Anlamsal katkicilarin en iyi parcasi 1.0 alir; 0.75
    // ile bu satir onlarin ARDINA duser. Sabit 0.95 olsaydi saglikli bir
    // tenant'ta bile yuvalari kaplardi.
    const { contributor } = build(
      summary([{ currency: 'TRY', income: '9000.00', expense: '4000.00', net: '5000.00' }]),
      summary([{ currency: 'TRY', income: '5000.00', expense: '4000.00', net: '1000.00' }]),
    );

    const [fragment] = await contributor.contribute();

    expect(fragment?.score).toBe(0.75);
    expect(fragment?.content).not.toContain('DUSUS');
  });

  it('ONCEKI DONEM YOKSA "dusus" DENMEZ', async () => {
    // ⚠️ Yeni bir tenant'in ilk ayinda her sey "dusus" gorunurdu ve katkici
    // surekli yuksek skorla one cikardi — yani en az bilgi tasidigi anda en
    // gurultulu olurdu.
    const { contributor } = build(
      summary([{ currency: 'TRY', income: '100.00', expense: '50.00', net: '50.00' }]),
      summary([]),
    );

    const [fragment] = await contributor.contribute();

    expect(fragment?.score).toBe(0.75);
    expect(fragment?.content).not.toContain('onceki 30 gun');
  });
});

describe('FinanceCashflowContributor — para birimleri', () => {
  it('HER PARA BIRIMI kendi fragment ini alir — toplanmaz', async () => {
    // Tek bir "net" cumlesi uretmek, modele 2000 TRY + 2000 USD = 4000
    // dedirtmek olurdu — ve model bunu KENDINDEN EMIN tekrarlardi.
    const { contributor } = build(
      summary([
        { currency: 'TRY', income: '1000.00', expense: '400.00', net: '600.00' },
        { currency: 'USD', income: '0.00', expense: '200.00', net: '-200.00' },
      ]),
      summary([]),
    );

    const fragments = await contributor.contribute();

    expect(fragments).toHaveLength(2);
    expect(fragments.map((row) => row.reference.id)).toEqual(['TRY', 'USD']);
    // Skorlar BAGIMSIZ: saglikli TRY 0.75, negatif USD 0.95.
    expect(fragments.map((row) => row.score)).toEqual([0.75, 0.95]);
  });

  it('en fazla UC para birimi — yapisal katki HER SORUDA gonderilir', async () => {
    const { contributor } = build(
      summary(
        ['TRY', 'USD', 'EUR', 'GBP'].map((currency) => ({
          currency,
          income: '10.00',
          expense: '5.00',
          net: '5.00',
        })),
      ),
      summary([]),
    );

    expect(await contributor.contribute()).toHaveLength(3);
  });

  it('reference bir SATIR id si degil PARA BIRIMI kodudur', async () => {
    // Katkinin isaret ettigi sey bir kayit degil bir KOVADIR. Uydurulmus bir
    // UUID dondurmek, arayuzun acamayacagi bir baglanti vaat ederdi.
    const { contributor } = build(
      summary([{ currency: 'TRY', income: '10.00', expense: '5.00', net: '5.00' }]),
      summary([]),
    );

    const [fragment] = await contributor.contribute();

    expect(fragment?.reference).toEqual({ kind: 'cashflow', id: 'TRY' });
  });
});

describe('FinanceCashflowContributor — pencereler', () => {
  it('iki pencere BITISIK ve CAKISMIYOR', async () => {
    const { contributor, summarize } = build(summary([]), summary([]));

    await contributor.contribute();

    // Bugun 2026-08-11 -> guncel [07-13 .. 08-11], onceki [06-13 .. 07-12].
    expect(summarize).toHaveBeenNthCalledWith(1, {
      from: '2026-07-13',
      to: '2026-08-11',
      includeCategories: true,
    });
    expect(summarize).toHaveBeenNthCalledWith(2, {
      from: '2026-06-13',
      to: '2026-07-12',
      includeCategories: false,
    });
  });

  it('ONCEKI pencerede kirilim ISTENMEZ — gereksiz ikinci sorgu acmaz', async () => {
    const { contributor, summarize } = build(summary([]), summary([]));

    await contributor.contribute();

    expect(summarize.mock.calls[1]?.[0].includeCategories).toBe(false);
  });
});

describe('FinanceCashflowContributor — sozlesme', () => {
  it('izni cashflow:read tir', () => {
    // ⚠️ Bu satir, `member`in Finans icerigini GOREMEMESININ tek sebebidir
    // (ADR-0034 §7). Degistirilirse izin filtresinin ilk gercek tetikcisi
    // KAYBOLUR — ve entegrasyon testi de onunla birlikte anlamsizlasir.
    const { contributor } = build(summary([]), summary([]));

    expect(contributor.permission).toBe('cashflow:read');
    expect(contributor.source).toBe('finance-cashflow');
  });
});
