import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  type CampaignGapSnapshot,
  type MarketingRepository,
} from '../application/marketing.repository.port';
import { CampaignGapContributor } from './campaign-gap.contributor';

/**
 * `campaign-gap` — ADR-0047 §3.3'un DORT TESTI DE GECEN adayi.
 *
 * ⚠️ Testlerin odagi SUSMA davranisi ve SKOR MERDIVENIDIR. Ikisi de havuzun
 * (ADR-0036 taban kisiti) davranisini dogrudan etkiler ve yanlis olduklarinda
 * hata SESSIZDIR: katkici calisir, cevap doner, yalnizca yanlis bandda
 * yarisir ya da haber tasimadan bir taban yuvasi isgal eder.
 */

const NOW = new Date('2026-08-26T12:00:00.000Z');
const clock: Clock = { now: () => NOW };

const transactionManager = {
  runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
} as TransactionManager;

function contributorWith(snapshot: CampaignGapSnapshot): CampaignGapContributor {
  const repository = {
    gapSnapshot: (): Promise<CampaignGapSnapshot> => Promise.resolve(snapshot),
  } as unknown as MarketingRepository;

  return new CampaignGapContributor(repository, transactionManager, clock);
}

function snapshot(overrides: Partial<CampaignGapSnapshot> = {}): CampaignGapSnapshot {
  return {
    gaps: [
      {
        id: 'c-1',
        name: 'Sonbahar indirimi',
        channel: 'Instagram',
        endsOn: '2026-08-15',
        status: 'done',
      },
    ],
    gapCount: 1,
    openCount: 2,
    totalCount: 8,
    ...overrides,
  };
}

describe('CampaignGapContributor (ADR-0047 §3.3)', () => {
  it('YAPISAL olarak beyan edilir ve `campaign:read` kapisindan gecer', () => {
    const contributor = contributorWith(snapshot());

    expect(contributor.contributionKind).toBe('structural');
    expect(contributor.source).toBe('campaign-gap');
    expect(contributor.permission).toBe('campaign:read');
  });

  it('⚠️ HIC KAMPANYA YOKSA SUSAR', async () => {
    const contributor = contributorWith(
      snapshot({ gaps: [], gapCount: 0, openCount: 0, totalCount: 0 }),
    );

    expect(await contributor.contribute()).toEqual([]);
  });

  it('⚠️ BOSLUK YOKSA DA SUSAR — "kosullu sessiz kaynak" (ADR-0049 §3.4)', async () => {
    // ⚠️ Alternatif ("12 kampanya var, hepsi kapatilmis") REDDEDILDI: o bir
    // SAYIMDIR (ADR-0043'un `"12 aktif calisan"` adayiyla ayni sinif) ve her
    // cagride AYNI CUMLEYI kurup bir taban yuvasini haber tasimadan isgal
    // ederdi.
    const contributor = contributorWith(snapshot({ gaps: [], gapCount: 0 }));

    expect(await contributor.contribute()).toEqual([]);
  });

  it('TEK bosluk 0.90 bandinda konusur', async () => {
    const contributor = contributorWith(snapshot({ gapCount: 1 }));

    const fragments = await contributor.contribute();

    expect(fragments.every((fragment) => fragment.score === 0.9)).toBe(true);
  });

  it('UC VE USTU bosluk ALARM bandinda (0.95) konusur', async () => {
    const contributor = contributorWith(snapshot({ gapCount: 4 }));

    const fragments = await contributor.contribute();

    expect(fragments.every((fragment) => fragment.score === 0.95)).toBe(true);
    expect(fragments[0]?.content).toContain('4 KAMPANYA SONUCU YAZILMADAN KAPANDI');
  });

  it('⚠️ SKOR DUZ SABIT DEGIL — bosluk sayisina gore DEGISIR', async () => {
    const few = await contributorWith(snapshot({ gapCount: 1 })).contribute();
    const many = await contributorWith(snapshot({ gapCount: 5 })).contribute();

    expect(few[0]?.score).not.toBe(many[0]?.score);
  });

  it('ozet satiri + bosluk satirlari doner', async () => {
    const contributor = contributorWith(
      snapshot({
        gapCount: 2,
        gaps: [
          {
            id: 'c-1',
            name: 'Sonbahar',
            channel: 'Instagram',
            endsOn: '2026-08-15',
            status: 'done',
          },
          { id: 'c-2', name: 'Bahar', channel: null, endsOn: '2026-08-01', status: 'active' },
        ],
      }),
    );

    const fragments = await contributor.contribute();

    expect(fragments).toHaveLength(3);
    expect(fragments[0]?.reference).toEqual({ kind: 'campaign-gap', id: 'unclosed-campaigns' });
    expect(fragments[1]?.reference).toEqual({ kind: 'campaign', id: 'c-1' });
  });

  it('⚠️ takvimde bitmis ama HALA YAYINDA gorunen kampanya AYRICA soylenir', async () => {
    const contributor = contributorWith(
      snapshot({
        gaps: [{ id: 'c-2', name: 'Bahar', channel: null, endsOn: '2026-08-01', status: 'active' }],
      }),
    );

    const fragments = await contributor.contribute();

    // Yalnizca sonuc yazilmamis degil, KAPATILMAMIS da — ayri bir haber.
    expect(fragments[1]?.content).toContain('hala yayinda gorunuyor');
  });

  it('⚠️ cumle bir EKSIGI soyler, bir ICERIGI DEGIL', async () => {
    // ⚠️ ADR-0045'in dorduncu olcutunun TAM AYNASI: bu kayitlarin sonuc notu
    // YOKTUR, yani `campaign-notes` onlardan HICBIR KOSULDA bahsedemez.
    // Iki katkicinin ORTUSME KUMESI BOSTUR.
    const contributor = contributorWith(snapshot());

    const fragments = await contributor.contribute();

    expect(fragments[1]?.content).toContain('Sonucu yazilmamis kampanya');
  });
});
