import { describe, expect, it } from 'vitest';

import { InMemoryContributorRegistry } from './in-memory-contributor-registry';
import { questionAffinity, selectionLot } from './question-affinity';
import { selectFragments, type RankedCandidate } from './select-fragments';
import {
  type ContextFragment,
  type ContributionKind,
  type RetrievalContributor,
} from './retrieval-contributor.port';

/**
 * ADR-0049'un KANIT dosyasi — band ici esitligin liyakatle kirilmasi.
 *
 * ============================================================================
 * ⚠️ BU DOSYANIN VAR OLMA SEBEBI: KUSURUN TAM TERSI KANITI
 * ============================================================================
 * ADR-0048'in olcumu ADR-0042'nin T1 tetikleyicisini atesledi: alti yapisal
 * kaynagin ALTISI da alarm bandindaydi (0.95) ve kazanani `app.module.ts`teki
 * MODUL IMPORT SIRASI belirliyordu — `Array.prototype.sort` KARARLI oldugu
 * icin esit skorlu adaylar girdi sirasini koruyordu.
 *
 * ⚠️ Asagidaki ilk iki test, duzeltmeden ONCEKI kodda DUSER. Bir davranis
 * garantisinin degeri, onu ihlal eden kodda kirmizi yanabilmesidir.
 * ============================================================================
 */

const QUESTION = 'Sirkette su anda neler oluyor?';

/**
 * Alti yapisal kaynak — HEPSI ALARM BANDINDA (0.95).
 *
 * ⚠️ Icerikler BILEREK soruyla ortak kelime tasimiyor: `affinity` hepsi icin
 * 0 doner ve karar `lot`a duser. Yani bu testler tam olarak ADR-0049'un
 * "en zor" halini — hicbir liyakat sinyalinin ayirt etmedigi durumu — sinar.
 */
const STRUCTURAL_SOURCES = [
  'crm-pipeline',
  'inventory-stock',
  'invoicing-pipeline',
  'appointment-schedule',
  'project-status',
  'finance-cashflow',
] as const;

function candidate(
  source: string,
  score: number,
  content: string,
  kind: ContributionKind = 'structural',
): RankedCandidate {
  return {
    fragment: { content, score, source, reference: { kind: 'x', id: `${source}-1` } },
    source,
    contributionKind: kind,
  };
}

function alarmCandidates(): RankedCandidate[] {
  return STRUCTURAL_SOURCES.map((source, index) =>
    candidate(source, 0.95, `Deterministik icerik ${String(index)}`),
  );
}

/**
 * ⚠️ `limit` VARSAYILANI 3 — 8 DEGIL.
 *
 * `K = 8`'de alti adayin hepsi havuza girer, ELEME HIC YASANMAZ ve test
 * kusurlu kodda da YESIL yanar. Bir siralama garantisi ancak yuva KITKEN
 * sinanabilir; bu satir bir ayar degil, testin gecerliligidir.
 */
function selectedSources(candidates: readonly RankedCandidate[], question = QUESTION): string[] {
  const result = selectFragments({ candidates, limit: 3, question });
  return [...result.selected].map((entry) => entry.source).sort();
}

describe('ADR-0049 KANIT 1 — kayit sirasi artik belirleyici DEGIL', () => {
  /**
   * ⚠️ KUSURUN TAM TERSI KANITI.
   *
   * Duzeltmeden once: `ranked` skora gore siralanir, alti aday da 0.95'te
   * esittir, `sort` KARARLI oldugu icin girdi sirasi korunur ve taban
   * (`ceil(8/3) = 3`) ILK UC kaynagi rezerve eder. Diziyi ters cevirmek
   * kazananlari da tersine cevirirdi.
   *
   * ⚠️ `limit` BILEREK 3'e daraltildi: `K = 8` olsaydi alti adayin hepsi
   * havuza girer, eleme HIC YASANMAZ ve test bos yere yesil yanardi. Bir
   * siralama garantisi ancak yuva KITKEN sinanabilir.
   */
  it('aday dizisi TERSINE cevrildiginde secilen kaynak KUMESI degismez', () => {
    const forward = alarmCandidates();
    const backward = [...forward].reverse();

    // ⚠️ `limit: 3` — alti aday, uc yuva. Eleme GERCEK.
    const forwardSelection = [
      ...selectFragments({ candidates: forward, limit: 3, question: QUESTION }).selected,
    ]
      .map((entry) => entry.source)
      .sort();

    const backwardSelection = [
      ...selectFragments({ candidates: backward, limit: 3, question: QUESTION }).selected,
    ]
      .map((entry) => entry.source)
      .sort();

    expect(forwardSelection).toEqual(backwardSelection);
    // Gercekten bir eleme oldugunu da dogrula — aksi halde test bos yere yesil.
    expect(forwardSelection).toHaveLength(3);
  });

  it('aday dizisinin HER permutasyonu ayni kumeyi secer', () => {
    const base = alarmCandidates();
    const expected = selectedSources(base);

    // Birkac farkli karisim — hepsi ayni sonucu vermeli.
    const shuffles = [
      [...base].reverse(),
      [base[3], base[0], base[5], base[1], base[4], base[2]],
      [base[5], base[4], base[3], base[2], base[1], base[0]],
    ].map((entries) => entries.filter((entry): entry is RankedCandidate => entry !== undefined));

    for (const shuffled of shuffles) {
      expect(selectedSources(shuffled)).toEqual(expected);
    }
  });
});

describe('ADR-0049 KANIT 2 — registry ters sirada kayitliyken ayni secim', () => {
  /**
   * ⚠️ ZINCIRIN TAMAMINI BAGLAR.
   *
   * KANIT 1 saf fonksiyonu sinar; burada aday dizisi `#gather`in urettigi
   * SEKILDE — yani `registry.all()` sirasindan `flatMap` ile — kurulur.
   * `InMemoryContributorRegistry` bir `Map` kullanir ve `Map` EKLEME SIRASINI
   * korur; yani bu test gercekten "modul import sirasi" degiskenini oynatir.
   */
  function registryCandidates(sources: readonly string[]): RankedCandidate[] {
    const registry = new InMemoryContributorRegistry();

    for (const source of sources) {
      const contributor: RetrievalContributor = {
        source,
        contributionKind: 'structural',
        permission: 'context:ask',
        contribute: (): Promise<ContextFragment[]> => Promise.resolve([]),
      };
      registry.register(contributor);
    }

    // `#gather`in aday kurulumunun birebir ayni sekli.
    return registry
      .all()
      .map((contributor, index) =>
        candidate(contributor.source, 0.95, `Deterministik icerik ${String(index)}`),
      );
  }

  it('kayit sirasi ters cevrildiginde secilen kaynaklar AYNI kalir', () => {
    const forward = registryCandidates(STRUCTURAL_SOURCES);
    const backward = registryCandidates([...STRUCTURAL_SOURCES].reverse());

    const forwardSelection = [
      ...selectFragments({ candidates: forward, limit: 3, question: QUESTION }).selected,
    ]
      .map((entry) => entry.source)
      .sort();

    const backwardSelection = [
      ...selectFragments({ candidates: backward, limit: 3, question: QUESTION }).selected,
    ]
      .map((entry) => entry.source)
      .sort();

    expect(forwardSelection).toEqual(backwardSelection);
    expect(forwardSelection).toHaveLength(3);
  });
});

describe('ADR-0049 KANIT 3 — BAND USTUNLUGU korunur', () => {
  /**
   * ⚠️ `affinity` BIR BANDI ASLA EZMEZ.
   *
   * Esitlik kirici yalnizca AYNI skordaki adaylar arasinda calisir. Bu test
   * olmasaydi, `affinity`nin bir gun ana skora karistirilmasi (ornegin
   * `score + affinity`) hicbir yerde kirmizi yanmazdi — ve bir alarm,
   * kelimeleri soruya benzemedigi icin SESSIZCE susardi.
   */
  it('affinity = 1 olan 0.75, affinity = 0 olan 0.95i GECEMEZ', () => {
    const question = 'nakit akisi durumu';
    const healthy = candidate('finance-cashflow', 0.75, 'Nakit akisi durumu saglikli');
    const alarm = candidate('crm-pipeline', 0.95, 'Takip gecikmis');

    expect(questionAffinity(question, healthy.fragment.content)).toBe(1);
    expect(questionAffinity(question, alarm.fragment.content)).toBe(0);

    const result = selectFragments({ candidates: [healthy, alarm], limit: 1, question });

    expect(result.fragments).toHaveLength(1);
    expect(result.fragments[0]?.source).toBe('crm-pipeline');
  });

  it('band esitken affinity KAZANIR', () => {
    const question = 'nakit akisi durumu';
    const relevant = candidate('finance-cashflow', 0.95, 'Nakit akisi TRY — NEGATIF NAKIT AKISI');
    const irrelevant = candidate('crm-pipeline', 0.95, 'Takip gecikmis');

    // ⚠️ Girdi sirasi ALAKASIZ olani ONE koyuyor: eskiden o kazanirdi.
    const result = selectFragments({
      candidates: [irrelevant, relevant],
      limit: 1,
      question,
    });

    expect(result.fragments[0]?.source).toBe('finance-cashflow');
  });
});

describe('questionAffinity', () => {
  it('SORUNUN kapsanmasini olcer, icerigin degil', () => {
    // Uzun bir parca, yalnizca daha cok kelime tasidigi icin kazanmamali.
    const question = 'stok durumu';
    const short = questionAffinity(question, 'Stok ozeti');
    const long = questionAffinity(question, 'Stok ozeti · 6 aktif kalem · 3 tanesi esik takipli');

    expect(short).toBe(long);
  });

  it('aksan ve Turkce harf normalizasyonu IKI TARAFA da uygulanir', () => {
    // Kullanici aksanli yazar, katkicinin metni ASCII'dir.
    expect(questionAffinity('nakit akışı', 'Nakit akisi TRY')).toBe(1);
    expect(questionAffinity('Şirket gideri', 'sirket gideri')).toBe(1);
  });

  it('onek kurali EKLEMELI dili yakalar — ama kisa kelimelerde DEGIL', () => {
    // 4+ karakterli govde: onek eslesmesi calisir.
    expect(questionAffinity('stok', 'stoktaki kalemler')).toBe(1);
    expect(questionAffinity('nakit', 'nakitte sikinti')).toBe(1);

    // ⚠️ 4'ten kisa: yalnizca TAM esitlik. `bir` ile `birim` eslesMEMELI.
    expect(questionAffinity('bir', 'birim fiyat')).toBe(0);
  });

  it('tasiyici kelimesi olmayan soru 0 doner (karar lota duser)', () => {
    expect(questionAffinity('Nasil oluyor?', 'Stok ozeti')).toBe(0);
  });

  it('sonuc her zaman [0, 1] araliginda', () => {
    const value = questionAffinity('stok stok stok durumu', 'Stok ozeti');
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  });
});

describe('selectionLot — ⚠️ ADALET, LIYAKAT DEGIL', () => {
  it('DETERMINISTIK: ayni soru + ayni kaynak her zaman ayni degeri verir', () => {
    expect(selectionLot('soru', 'crm-pipeline')).toBe(selectionLot('soru', 'crm-pipeline'));
  });

  it('kazanan kaynak SORULAR BOYUNCA dagilir — hep ayni kaynak kazanmaz', () => {
    // ⚠️ IDDIA DIKKATLI KURULDU: bir kur'a, HERHANGI IKI soru icin farkli
    // kazanan GARANTI ETMEZ (iki soru pekala ayni kaynaga dusebilir). Iddia
    // edilebilecek — ve edilen — tek sey, secimin sistematik olarak AYNI
    // kaynagi kayirmadigidir.
    const winners = new Set(
      Array.from({ length: 20 }, (_, index) => {
        const question = `denetim sorusu ${String(index)}`;
        const lots = STRUCTURAL_SOURCES.map((source) => selectionLot(question, source));
        return STRUCTURAL_SOURCES[lots.indexOf(Math.min(...lots))];
      }),
    );

    // Kayit sirasina dayali eski davranista bu kume TEK ELEMANLI olurdu.
    expect(winners.size).toBeGreaterThan(1);
  });

  it('ayrac sayesinde ("ab","c") ile ("a","bc") AYNI kur\'ayi cekmez', () => {
    expect(selectionLot('ab', 'c')).not.toBe(selectionLot('a', 'bc'));
  });
});
