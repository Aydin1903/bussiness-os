import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  type FeedbackRepository,
  type SatisfactionSnapshot,
} from '../application/feedback.repository.port';
import { FeedbackSatisfactionContributor } from './feedback-satisfaction.contributor';

/**
 * `feedback-satisfaction` — ADR-0045 §3.2'nin UC ADR boyunca askida kalan adayi.
 *
 * ============================================================================
 * ⚠️ BU DOSYANIN GOREMEDIGI BIR KUSUR YASANDI — VE KORUMASI BURADA DEGIL
 * ============================================================================
 * Ilk surumde katkici gercek bir `/ask` cagrisinda `moment.getTime is not a
 * function` ile COKUYORDU: repository `max(timestamptz)`i `sql<Date | null>`
 * diye etiketlemisti, ama `sql<...>` yalnizca DERLEYICIYE bir iddiadir —
 * drizzle ham bir toplama ifadesini ESLEMEZ ve surucu bir DIZE dondurur.
 *
 * ⚠️ Asagidaki testlerin HICBIRI bunu goremezdi cunku hepsi sahte repository'ye
 * gercek bir `Date` besliyor (ADR-0037'nin "kusur ancak GERCEK BIR HTTP
 * ISTEGIYLE gorundu" dersinin ayni sinifi).
 *
 * ⚠️ Koruma bir teste degil TIP SISTEMINE baglandi: repository artik
 * `sql<string | null>` dondurur ve `SatisfactionSnapshot.lastLowRatingAt`
 * `Date | null`dir — aradaki `toDate` cevirisi KALDIRILIRSA derleme KIRILIR.
 * Bir derleme hatasi, bir testten daha gucludur.
 * ============================================================================
 *
 * ⚠️ Testlerin odagi SKOR MERDIVENI ve SUSMA davranisidir: ikisi de havuzun
 * (ADR-0036 taban kisiti) davranisini dogrudan etkiler ve ikisi de yanlis
 * olursa hata SESSIZDIR — katkici calisir, cevap doner, yalnizca yanlis bandda
 * yarisir.
 */

const NOW = new Date('2026-08-26T12:00:00.000Z');

const clock: Clock = { now: () => NOW };

/** Transaction'i saydam gecen sahte — repository dogrudan cagrilir. */
const transactionManager = {
  runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
} as TransactionManager;

function contributorWith(snapshot: SatisfactionSnapshot): FeedbackSatisfactionContributor {
  const repository = {
    satisfactionSnapshot: (): Promise<SatisfactionSnapshot> => Promise.resolve(snapshot),
  } as unknown as FeedbackRepository;

  return new FeedbackSatisfactionContributor(repository, transactionManager, clock, 2);
}

function snapshot(overrides: Partial<SatisfactionSnapshot> = {}): SatisfactionSnapshot {
  return {
    average: '4.2',
    count: 12,
    lowRatingCount: 0,
    lastLowRatingAt: null,
    previousAverage: '4.3',
    ...overrides,
  };
}

describe('FeedbackSatisfactionContributor (ADR-0045 §3.2)', () => {
  it('YAPISAL olarak beyan edilir ve `feedback:read` kapisindan gecer', () => {
    const contributor = contributorWith(snapshot());

    expect(contributor.contributionKind).toBe('structural');
    expect(contributor.source).toBe('feedback-satisfaction');
    expect(contributor.permission).toBe('feedback:read');
  });

  it('⚠️ SOYLEYECEK SEYI YOKSA SUSAR — bos pencerede taban yuvasi ISGAL ETMEZ', async () => {
    // ⚠️ ADR-0049 §3.4'un "kosullu sessiz kaynak" sekli: `[]` donen bir kaynak
    // `status: "empty"` kaydedilir ve T2'ye SAYILMAZ.
    const contributor = contributorWith(snapshot({ count: 0, average: null }));

    expect(await contributor.contribute()).toEqual([]);
  });

  it('DUSUK PUAN varsa ALARM bandinda (0.95) konusur', async () => {
    const contributor = contributorWith(
      snapshot({ lowRatingCount: 3, lastLowRatingAt: new Date('2026-08-24T09:00:00.000Z') }),
    );

    const [fragment] = await contributor.contribute();

    expect(fragment?.score).toBe(0.95);
    expect(fragment?.content).toContain('3 DUSUK PUAN');
    // ⚠️ "3 dusuk puan" ile "3 dusuk puan, SONUNCUSU 2 gun once" ayni haber
    // degildir — ozetin bir ZAMANI olmalidir.
    expect(fragment?.content).toContain('2 gun once');
  });

  it('ortalama DUSTUYSE 0.90 bandinda konusur', async () => {
    const contributor = contributorWith(snapshot({ average: '3.6', previousAverage: '4.4' }));

    const [fragment] = await contributor.contribute();

    expect(fragment?.score).toBe(0.9);
    expect(fragment?.content).toContain('DUSUS');
  });

  it('saglikli durumda 0.75 — ⚠️ DUZ SABIT DEGIL', async () => {
    // ⚠️ Duz bir 0.95 yazilsaydi sakin bir tenant'ta bile alarm bandini isgal
    // ederdi (ADR-0033 Slice 6'nin CRM'i hizalama gerekcesi).
    const contributor = contributorWith(snapshot());

    const [fragment] = await contributor.contribute();

    expect(fragment?.score).toBe(0.75);
    expect(fragment?.content).not.toContain('DUSUK PUAN');
  });

  it('⚠️ kucuk ornekte ORTALAMA CUMLEYE HIC GIRMEZ (§9.1in havuz karsiligi)', async () => {
    // Tek kayitli bir tenant'ta "ortalama 1,0" bir haber degil GURULTUDUR.
    // Ekran N yazarak cozer; havuza giden bir CUMLE bunu yapamaz.
    const contributor = contributorWith(
      snapshot({ count: 1, average: '1.0', previousAverage: null }),
    );

    const [fragment] = await contributor.contribute();

    expect(fragment?.content).toContain('1 geri bildirim');
    expect(fragment?.content).not.toContain('ortalama');
  });

  it('kucuk ornekte DUSUS de iddia edilmez — tesadufi oynama TREND degildir', async () => {
    const contributor = contributorWith(
      snapshot({ count: 2, average: '2.0', previousAverage: '5.0' }),
    );

    const [fragment] = await contributor.contribute();

    expect(fragment?.score).toBe(0.75);
    expect(fragment?.content).not.toContain('DUSUS');
  });

  it('bir PENCEREYE isaret eder, tek bir kayda DEGIL', async () => {
    const contributor = contributorWith(snapshot());

    const [fragment] = await contributor.contribute();

    expect(fragment?.reference).toEqual({ kind: 'feedback-window', id: 'last-30-days' });
  });
});
