import { describe, expect, it } from 'vitest';

import { type ContributionKind } from './retrieval-contributor.port';
import { type RankedCandidate, selectFragments } from './select-fragments';

/**
 * `selectFragments` — ADR-0036'nin taban kisiti.
 *
 * ============================================================================
 * ⚠️ BU TESTLERIN OLCUTU ADR-0035 §6.3'UN OLCUMUDUR
 * ============================================================================
 * Kapanis denetimi, dokuz katkici da doluyken `appointment-schedule` ve
 * `finance-cashflow`'un UC FARKLI SORUDA DA 0/8 aldigini gosterdi. Sebep
 * aritmetikti: anlamsal skorlar merdivensiz ~1.0 doner, yapisal skorlar
 * 0.95'te tavanlidir.
 *
 * Asagidaki ilk blok tam olarak o dagilimi yeniden kurar ve kisitın onu
 * DEGISTIRDIGINI kanitlar — sentetik bir ornekle degil, OLCULEN sayilarla.
 */

/** Katki turleri, olculen senaryodaki gibi: bes anlamsal + dort yapisal. */
const KIND: Readonly<Record<string, ContributionKind>> = {
  knowledge: 'semantic',
  'crm-interactions': 'semantic',
  'project-notes': 'semantic',
  'finance-commentaries': 'semantic',
  'appointment-notes': 'semantic',
  'crm-pipeline': 'structural',
  'project-status': 'structural',
  'appointment-schedule': 'structural',
  'finance-cashflow': 'structural',
};

function candidate(source: string, score: number, id = `${source}-1`): RankedCandidate {
  return {
    fragment: {
      content: `${source} parcasi`,
      score,
      source,
      reference: { kind: 'row', id },
    },
    source,
    // Testte bilinmeyen bir kaynak gelirse anlamsal sayilir — uretimdeki
    // "beyan etmeyen taban hakki kazanmaz" davranisinin karsiligi.
    contributionKind: KIND[source] ?? 'semantic',
  };
}

const SEMANTIC_SOURCES = [
  'knowledge',
  'crm-interactions',
  'project-notes',
  'finance-commentaries',
  'appointment-notes',
];

/**
 * ADR-0035 §6.3'un olculen girdisi.
 *
 * Bes anlamsal kaynagin her biri `1 - index/(length+1)` formuluyle ~1.0'a
 * yakin bir en-iyi isabet doner; dort yapisal kaynak 0.95/0.90/0.75
 * merdiveninde tavanlidir.
 */
function measuredPool(): RankedCandidate[] {
  return [
    ...SEMANTIC_SOURCES.flatMap((source) => [
      candidate(source, 0.99, `${source}-a`),
      candidate(source, 0.66, `${source}-b`),
    ]),
    candidate('project-status', 0.95, 'ps-a'),
    candidate('project-status', 0.95, 'ps-b'),
    candidate('crm-pipeline', 0.95, 'cp-a'),
    candidate('appointment-schedule', 0.9, 'as-a'),
    candidate('appointment-schedule', 0.9, 'as-b'),
    candidate('finance-cashflow', 0.75, 'fc-a'),
  ];
}

/**
 * ⚠️ NOTR SORU — bu dosyanin varsayimlarini KORUMAK icin (ADR-0049).
 *
 * ADR-0049 `selectFragments`e band ici bir esitlik kirici ekledi ve imzaya
 * `question` girdi. Buradaki testler SKOR ve TABAN davranisini olcer; sorunun
 * parca metinleriyle ortak kelimesi OLMAMALI ki `affinity` her aday icin 0
 * donsun ve olculen sey degismesin.
 *
 * ⚠️ Parca metinleri `"<source> parcasi"` seklindedir; asagidaki iki kelime
 * hicbiriyle eslesmez.
 */
const NEUTRAL_QUESTION = 'Genel durum';

function sourcesOf(fragments: readonly { source: string }[]): string[] {
  return fragments.map((item) => item.source);
}

describe('selectFragments — ADR-0035 §6.3 dagilimi', () => {
  const selected = selectFragments({
    candidates: measuredPool(),
    limit: 8,
    question: NEUTRAL_QUESTION,
  }).fragments;

  it('havuz TAM DOLAR — taban yuva harcamaz', () => {
    expect(selected).toHaveLength(8);
  });

  it('⚠️ `appointment-schedule` ARTIK GIRIYOR (olcumde 0 idi)', () => {
    expect(sourcesOf(selected)).toContain('appointment-schedule');
  });

  it('⚠️ UC AYRI yapisal kaynak giriyor — taban GENISLIK satin alir', () => {
    const structural = new Set(
      sourcesOf(selected).filter((source) => KIND[source] === 'structural'),
    );

    expect(structural.size).toBe(3);
  });

  it('⚠️ TABAN OLMADAN ayni girdi `appointment-schedule`i DISARIDA birakirdi', () => {
    // Kisitın gercekten bir sey degistirdiginin KANITI. Bu satir olmasaydi
    // yukaridaki testler, kisit hic calismasa bile yesil yanabilirdi.
    const pureScore = [...measuredPool()]
      .sort((a, b) => b.fragment.score - a.fragment.score)
      .slice(0, 8)
      .map((item) => item.fragment);

    expect(sourcesOf(pureScore)).not.toContain('appointment-schedule');
  });

  it('anlamsal icerik cogunlugu KORUR — havuzun ucte ikisi liyakatte', () => {
    const semantic = sourcesOf(selected).filter((source) => KIND[source] === 'semantic');

    expect(semantic).toHaveLength(5);
  });

  it('cikti SKORA GORE sirali — atif sozlesmesi bozulmadi', () => {
    const scores = selected.map((item) => item.score);

    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});

describe('selectFragments — taban bir TAVAN degildir', () => {
  it('alarm durumundaki yapisal kaynak SERBEST havuzda da yuva kazanir', () => {
    // `project-status` iki satirini da 0.95'le doner; anlamsal rakipler zayif.
    // Taban ona BIR yuva verir, kalan yuvalari saf skor dagitir ve ikinci
    // satiri da girer.
    const selected = selectFragments({
      candidates: [
        candidate('project-status', 0.95, 'ps-a'),
        candidate('project-status', 0.95, 'ps-b'),
        candidate('knowledge', 0.4, 'k-a'),
        candidate('knowledge', 0.3, 'k-b'),
      ],
      limit: 4,

      question: NEUTRAL_QUESTION,
    }).fragments;

    expect(sourcesOf(selected).filter((source) => source === 'project-status')).toHaveLength(2);
  });

  it('yapisal kaynak SAYISI tabani asarsa EN DUSUK skorlu olan disarida kalir', () => {
    // Dort yapisal kaynak, taban 3. Disarida kalan, en iyi skoru EN DUSUK
    // olandir — yani "alarm yok" durumundaki kaynak. Dogru tercih budur.
    const selected = selectFragments({
      candidates: [
        candidate('project-status', 0.95),
        candidate('crm-pipeline', 0.9),
        candidate('appointment-schedule', 0.85),
        candidate('finance-cashflow', 0.75),
        ...Array.from({ length: 8 }, (_, index) =>
          candidate('knowledge', 0.99 - index * 0.01, `k-${String(index)}`),
        ),
      ],
      limit: 8,
      question: NEUTRAL_QUESTION,
    }).fragments;

    expect(sourcesOf(selected)).toContain('appointment-schedule');
    expect(sourcesOf(selected)).not.toContain('finance-cashflow');
  });
});

describe('selectFragments — bos ve sinir durumlar', () => {
  it('BOS yapisal kaynaga yuva AYRILMAZ — havuz anlamsalla dolar', () => {
    // Yapisal katkicilar bos tenant'ta `[]` doner. Onlar icin yer ayirmak
    // havuzu BOS yuvalarla harcamak olurdu.
    const selected = selectFragments({
      candidates: Array.from({ length: 10 }, (_, index) =>
        candidate('knowledge', 0.9 - index * 0.01, `k-${String(index)}`),
      ),
      limit: 8,
      question: NEUTRAL_QUESTION,
    }).fragments;

    expect(selected).toHaveLength(8);
    expect(new Set(sourcesOf(selected))).toEqual(new Set(['knowledge']));
  });

  it('YALNIZCA yapisal kaynak varsa hepsi normal sekilde girer', () => {
    const selected = selectFragments({
      candidates: [candidate('crm-pipeline', 0.95), candidate('finance-cashflow', 0.75)],
      limit: 8,
      question: NEUTRAL_QUESTION,
    }).fragments;

    expect(selected).toHaveLength(2);
  });

  it('limit 0 ise bos doner', () => {
    expect(
      selectFragments({ candidates: measuredPool(), limit: 0, question: NEUTRAL_QUESTION })
        .fragments,
    ).toEqual([]);
  });

  it('⚠️ limit 1 ise GENEL BIRINCI korunur — taban devreye GIRMEZ', () => {
    // `limit - 1` tavani. Bir config degeri yuzunden en alakali parcanin
    // dusmesi, kisitın cozdugunden kotu olurdu.
    const selected = selectFragments({
      candidates: [candidate('knowledge', 0.99), candidate('crm-pipeline', 0.95)],
      limit: 1,

      question: NEUTRAL_QUESTION,
    }).fragments;

    expect(sourcesOf(selected)).toEqual(['knowledge']);
  });

  it('⚠️ garanti KATKICI KAYDINA dayanir, parcanin KENDI etiketine DEGIL', () => {
    // Parca kendini `knowledge` ilan ediyor ama onu ureten katkici yapisal.
    // Uretimde ikisi ayni sabittir; bu test, garantinin platformun BILDIGI
    // bilgiye dayandigini kilitler.
    const misLabelled: RankedCandidate = {
      fragment: {
        content: 'yanlis etiketli yapisal satir',
        score: 0.2,
        source: 'knowledge',
        reference: { kind: 'row', id: 'x' },
      },
      source: 'appointment-schedule',
      contributionKind: 'structural',
    };

    const selected = selectFragments({
      candidates: [
        misLabelled,
        ...Array.from({ length: 8 }, (_, index) =>
          candidate('knowledge', 0.99 - index * 0.01, `k-${String(index)}`),
        ),
      ],
      limit: 8,
      question: NEUTRAL_QUESTION,
    }).fragments;

    expect(selected).toContainEqual(misLabelled.fragment);
  });

  it('cagiranin dizisini DEGISTIRMEZ', () => {
    const input = measuredPool();
    const before = input.map((item) => item.fragment.reference.id);

    selectFragments({ candidates: input, limit: 8, question: NEUTRAL_QUESTION });

    expect(input.map((item) => item.fragment.reference.id)).toEqual(before);
  });

  it('ayni girdi ayni ciktiyi verir — esit skorlarda DETERMINISTIK', () => {
    const input = [
      candidate('crm-pipeline', 0.95, 'a'),
      candidate('project-status', 0.95, 'b'),
      candidate('appointment-schedule', 0.95, 'c'),
      candidate('finance-cashflow', 0.95, 'd'),
    ];

    const first = selectFragments({
      candidates: input,
      limit: 8,
      question: NEUTRAL_QUESTION,
    }).fragments;
    const second = selectFragments({
      candidates: input,
      limit: 8,
      question: NEUTRAL_QUESTION,
    }).fragments;

    expect(first.map((item) => item.reference.id)).toEqual(second.map((item) => item.reference.id));
  });
});
